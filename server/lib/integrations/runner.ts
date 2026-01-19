import { prisma } from "../prisma";
import { integrationRegistry } from "./registry";
import { IntegrationStatus } from "../../../src/generated/prisma";
import {
  FetchContext,
  FetchResult,
  MetricDataPoint,
  RunIntegrationOptions,
  RunIntegrationResult,
  ScheduleType,
} from "./types";
import { enqueueBackfill } from "../queue/jobs";
import { decryptCredential } from "../encryption";
import { RepositoryDetector } from "../repositories";

// ============================================
// Deduplication Logic
// ============================================

interface InsertOptions {
  userId: string;
  token?: string;
}

async function trackRepositoryForMetric(
  point: MetricDataPoint,
  userId: string,
  token?: string
): Promise<string | null> {
  // Only track repos for GitHub metrics with repo info
  const repoMetricKeys = ["commits", "pull_requests", "issues"];
  if (!repoMetricKeys.includes(point.metricKey)) {
    return null;
  }

  const repoInfo = RepositoryDetector.detectFromMetricValue(point.value);
  if (!repoInfo) {
    return null;
  }

  // Determine activity type from metric key
  let activityType: "commit" | "pr" | "issue";
  if (point.metricKey === "commits") activityType = "commit";
  else if (point.metricKey === "pull_requests") activityType = "pr";
  else activityType = "issue";

  try {
    const repo = await RepositoryDetector.trackActivity(
      userId,
      repoInfo,
      { type: activityType, timestamp: point.timestamp },
      token
    );
    return repo.id;
  } catch (error) {
    console.warn(`[Runner] Failed to track repository ${repoInfo.fullName}:`, error);
    return null;
  }
}

async function deduplicateAndInsert(
  integrationId: string,
  result: FetchResult,
  options?: InsertOptions
): Promise<number> {
  if (result.dataPoints.length === 0) {
    return 0;
  }

  let pointsToInsert = result.dataPoints;

  // Apply deduplication if key function provided
  if (result.deduplicationKey) {
    const uniqueMetricKeys = [
      ...new Set(result.dataPoints.map((p) => p.metricKey)),
    ];
    const uniqueTimestamps = [
      ...new Set(result.dataPoints.map((p) => p.timestamp)),
    ];

    const existing = await prisma.metricData.findMany({
      where: {
        integrationId,
        metricKey: { in: uniqueMetricKeys },
        timestamp: { in: uniqueTimestamps },
      },
    });

    const existingKeys = new Set(
      existing.map((e) =>
        result.deduplicationKey!({
          metricKey: e.metricKey,
          timestamp: e.timestamp,
          value: e.value,
          metadata: e.metadata as Record<string, unknown> | undefined,
        })
      )
    );

    pointsToInsert = result.dataPoints.filter(
      (p) => !existingKeys.has(result.deduplicationKey!(p))
    );
  }

  if (pointsToInsert.length === 0) {
    return 0;
  }

  // Track repositories and build insert data
  const insertData = await Promise.all(
    pointsToInsert.map(async (point) => {
      let repositoryId: string | null = null;

      // Track repository if we have user context
      if (options?.userId) {
        repositoryId = await trackRepositoryForMetric(
          point,
          options.userId,
          options.token
        );
      }

      return {
        integrationId,
        repositoryId,
        metricKey: point.metricKey,
        value: point.value as any,
        timestamp: point.timestamp,
        metadata: point.metadata as any,
      };
    })
  );

  await prisma.metricData.createMany({
    data: insertData,
  });

  return pointsToInsert.length;
}

// ============================================
// Error Detection
// ============================================

function isAuthenticationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();
  return (
    errorMessage.includes("401") ||
    errorMessage.includes("unauthorized") ||
    errorMessage.includes("not_authorized") ||
    errorMessage.includes("invalid token") ||
    errorMessage.includes("authentication failed") ||
    errorMessage.includes("invalid credentials") ||
    errorMessage.includes("403") ||
    errorMessage.includes("forbidden") ||
    errorMessage.includes("expired") ||
    errorMessage.includes("bad credentials")
  );
}

// ============================================
// Custom Errors
// ============================================

class IntegrationNotFoundError extends Error {
  constructor(integrationId: string) {
    super(`Integration ${integrationId} not found`);
    this.name = "IntegrationNotFoundError";
  }
}

// ============================================
// Main Runner
// ============================================

export async function runIntegration(
  integrationId: string,
  options?: RunIntegrationOptions
): Promise<RunIntegrationResult> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    include: {
      credentials: true,
      syncState: true,
    },
  });

  if (!integration) {
    throw new IntegrationNotFoundError(integrationId);
  }

  if (integration.status !== IntegrationStatus.ACTIVE) {
    console.log(`[Runner] Skipping inactive integration: ${integration.name}`);
    return { status: "skipped", reason: "inactive" };
  }

  const plugin = integrationRegistry.get(integration.typeSlug);

  if (!plugin) {
    console.error(`[Runner] Plugin not found: ${integration.typeSlug}`);
    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        status: IntegrationStatus.ERROR,
        lastError: `Plugin not found: ${integration.typeSlug}`,
        lastErrorAt: new Date(),
        consecutiveFailures: { increment: 1 },
      },
    });
    return {
      status: "error",
      reason: `Plugin not found: ${integration.typeSlug}`,
    };
  }

  try {
    console.log(`[Runner] Fetching data for integration: ${integration.name}`);

    // Decrypt and prepare OAuth credentials
    const oauthCred = integration.credentials
      ? {
          accessToken: decryptCredential(integration.credentials.accessToken),
          refreshToken: integration.credentials.refreshToken
            ? decryptCredential(integration.credentials.refreshToken)
            : undefined,
          expiresAt: integration.credentials.expiresAt ?? undefined,
          tokenData:
            (integration.credentials.tokenData as Record<string, unknown>) ??
            undefined,
        }
      : undefined;

    const lastState = integration.syncState?.state as
      | Record<string, unknown>
      | undefined;

    const context: FetchContext = {
      lastState,
      isBackfill: false,
    };

    // For cron-based integrations, set date range based on last sync
    if (integration.cronPattern) {
      const lastSyncDate = lastState?.lastSyncDate
        ? new Date(lastState.lastSyncDate as string)
        : null;

      if (lastSyncDate) {
        // Check for stale state - if more than 2 days behind, trigger backfill
        const daysBehind = Math.floor(
          (Date.now() - lastSyncDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysBehind > 2 && plugin.supportsBackfill) {
          console.log(
            `[Runner] ${integration.name} is ${daysBehind} days behind - triggering backfill`
          );
          await enqueueBackfill(integrationId);
          await prisma.integration.update({
            where: { id: integrationId },
            data: { lastFetchedAt: new Date() },
          });
          return { status: "skipped", reason: "backfill_triggered" };
        }

        // Fetch from day after last sync to yesterday
        const startDate = new Date(lastSyncDate);
        startDate.setDate(startDate.getDate() + 1);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);

        if (startDate <= endDate) {
          context.startDate = startDate;
          context.endDate = endDate;
        } else if (options?.force) {
          // Force fetch: re-fetch yesterday's data
          console.log(
            `[Runner] Force fetch for ${integration.name} - re-fetching yesterday`
          );
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          context.startDate = new Date(yesterday);
          context.startDate.setHours(0, 0, 0, 0);
          context.endDate = new Date(yesterday);
          context.endDate.setHours(23, 59, 59, 999);
        } else {
          console.log(
            `[Runner] Integration ${integration.name} already up to date`
          );
          await prisma.integration.update({
            where: { id: integrationId },
            data: { lastFetchedAt: new Date() },
          });
          return { status: "skipped", reason: "already_up_to_date" };
        }
      } else {
        // First run - fetch yesterday
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        context.startDate = new Date(yesterday);
        context.startDate.setHours(0, 0, 0, 0);
        context.endDate = new Date(yesterday);
        context.endDate.setHours(23, 59, 59, 999);
      }
    }

    const result = await plugin.fetchData(
      integration.config as never,
      oauthCred,
      context,
      integrationId
    );

    const insertedCount = await deduplicateAndInsert(integrationId, result, {
      userId: integration.userId,
      token: oauthCred?.accessToken,
    });

    // Update sync state
    if (result.newState) {
      await prisma.integrationSyncState.upsert({
        where: { integrationId },
        create: {
          integrationId,
          state: result.newState as any,
        },
        update: {
          state: result.newState as any,
        },
      });
    }

    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        lastFetchedAt: new Date(),
        status: IntegrationStatus.ACTIVE,
        consecutiveFailures: 0,
        lastError: null,
        lastErrorAt: null,
      },
    });

    console.log(
      `[Runner] Successfully fetched ${insertedCount} new metrics for ${integration.name}`
    );

    return { status: "fetched", metricsInserted: insertedCount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[Runner] Error fetching data for integration ${integrationId}:`,
      error
    );

    const integrationForUpdate = await prisma.integration.findUnique({
      where: { id: integrationId },
      select: { consecutiveFailures: true },
    });

    const isAuthError = isAuthenticationError(error);
    const requiresOAuth = plugin?.requiresOAuth ?? false;

    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        status:
          isAuthError && requiresOAuth
            ? IntegrationStatus.PENDING_AUTH
            : IntegrationStatus.ERROR,
        lastError: errorMessage,
        lastErrorAt: new Date(),
        consecutiveFailures:
          (integrationForUpdate?.consecutiveFailures || 0) + 1,
      },
    });
    throw error;
  }
}

// ============================================
// Backfill Runner
// ============================================

export async function backfillIntegration(
  integrationId: string
): Promise<void> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    include: {
      credentials: true,
      syncState: true,
    },
  });

  if (!integration) {
    throw new IntegrationNotFoundError(integrationId);
  }

  const plugin = integrationRegistry.get(integration.typeSlug);

  if (!plugin) {
    throw new Error(`Plugin not found: ${integration.typeSlug}`);
  }

  if (!plugin.supportsBackfill || !plugin.getBackfillConfig) {
    console.log(`[Backfill] Plugin ${plugin.slug} does not support backfill`);
    return;
  }

  const backfillConfig = plugin.getBackfillConfig();
  const { daysBack, chunkSizeDays = 1 } = backfillConfig;

  console.log(
    `[Backfill] Starting backfill for ${integration.name}: ${daysBack} days, ${chunkSizeDays} day chunks`
  );

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);
  startDate.setHours(0, 0, 0, 0);

  const oauthCred = integration.credentials
    ? {
        accessToken: decryptCredential(integration.credentials.accessToken),
        refreshToken: integration.credentials.refreshToken
          ? decryptCredential(integration.credentials.refreshToken)
          : undefined,
        expiresAt: integration.credentials.expiresAt ?? undefined,
        tokenData:
          (integration.credentials.tokenData as Record<string, unknown>) ??
          undefined,
      }
    : undefined;

  const currentChunkStart = new Date(startDate);
  let totalInserted = 0;
  let authErrorOccurred = false;
  let authErrorMessage = "";

  while (currentChunkStart <= endDate) {
    const chunkEnd = new Date(currentChunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + chunkSizeDays - 1);
    chunkEnd.setHours(23, 59, 59, 999);

    if (chunkEnd > endDate) {
      chunkEnd.setTime(endDate.getTime());
    }

    try {
      const context: FetchContext = {
        startDate: currentChunkStart,
        endDate: chunkEnd,
        isBackfill: true,
      };

      const result = await plugin.fetchData(
        integration.config as never,
        oauthCred,
        context,
        integrationId
      );

      const inserted = await deduplicateAndInsert(integrationId, result, {
        userId: integration.userId,
        token: oauthCred?.accessToken,
      });
      totalInserted += inserted;

      console.log(
        `[Backfill] Fetched ${
          result.dataPoints.length
        } points, inserted ${inserted} new for ${
          currentChunkStart.toISOString().split("T")[0]
        }`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (isAuthenticationError(error)) {
        authErrorOccurred = true;
        authErrorMessage = errorMessage;
        console.error(
          `[Backfill] Authentication error detected: ${errorMessage}`
        );
        break;
      }

      console.error(
        `[Backfill] Error fetching chunk ${
          currentChunkStart.toISOString().split("T")[0]
        }:`,
        error
      );
    }

    currentChunkStart.setDate(currentChunkStart.getDate() + chunkSizeDays);
    currentChunkStart.setHours(0, 0, 0, 0);
  }

  if (authErrorOccurred) {
    await prisma.integration.update({
      where: { id: integrationId },
      data: {
        status: IntegrationStatus.PENDING_AUTH,
        lastError: authErrorMessage,
        lastErrorAt: new Date(),
        consecutiveFailures: { increment: 1 },
      },
    });

    throw new Error(`Authentication failed: ${authErrorMessage}`);
  }

  // Update sync state to mark backfill complete
  await prisma.integrationSyncState.upsert({
    where: { integrationId },
    create: {
      integrationId,
      state: {
        backfillComplete: true,
        lastSyncDate: endDate.toISOString(),
      } as any,
    },
    update: {
      state: {
        backfillComplete: true,
        lastSyncDate: endDate.toISOString(),
      } as any,
    },
  });

  console.log(
    `[Backfill] Completed backfill for ${integration.name}: ${totalInserted} total new metrics`
  );
}

// ============================================
// Scheduled Runner
// ============================================

export async function runScheduledIntegrations(
  scheduleType: ScheduleType,
  cronPattern?: string
): Promise<void> {
  const integrations = await prisma.integration.findMany({
    where: {
      status: IntegrationStatus.ACTIVE,
    },
  });

  const now = new Date();

  for (const integration of integrations) {
    const plugin = integrationRegistry.get(integration.typeSlug);
    if (!plugin) {
      continue;
    }

    const scheduleConfig = plugin.getScheduleConfig();
    let shouldRun = false;

    if (scheduleType === "interval" && scheduleConfig.type === "interval") {
      const intervalMs = (scheduleConfig.interval || 300) * 1000;
      const lastFetched = integration.lastFetchedAt;

      if (!lastFetched) {
        shouldRun = true;
      } else {
        const timeSinceLastFetch = now.getTime() - lastFetched.getTime();
        shouldRun = timeSinceLastFetch >= intervalMs;
      }
    } else if (scheduleType === "cron" && scheduleConfig.type === "cron") {
      if (cronPattern && scheduleConfig.cron === cronPattern) {
        shouldRun = true;
      } else if (!cronPattern) {
        shouldRun = true;
      }
    }

    if (shouldRun) {
      try {
        await runIntegration(integration.id);
      } catch (error) {
        console.error(
          `[Scheduler] Failed to run integration ${integration.name}:`,
          error
        );
      }
    }
  }
}
