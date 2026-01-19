import { PrismaClient } from "../../src/generated/prisma";
import { encryptCredential } from "../../server/lib/encryption";

/**
 * Create a test user
 */
export async function createTestUser(
  prisma: PrismaClient,
  overrides: Partial<{
    id: string;
    email: string;
    name: string;
  }> = {}
) {
  return prisma.user.create({
    data: {
      id: overrides.id || `test-user-${Date.now()}`,
      email: overrides.email || `test-${Date.now()}@example.com`,
      name: overrides.name || "Test User",
      emailVerified: true,
    },
  });
}

/**
 * Create a test integration
 */
export async function createTestIntegration(
  prisma: PrismaClient,
  userId: string,
  overrides: Partial<{
    id: string;
    name: string;
    typeSlug: string;
    status: "ACTIVE" | "PAUSED" | "ERROR" | "PENDING_AUTH";
    config: Record<string, unknown>;
  }> = {}
) {
  return prisma.integration.create({
    data: {
      id: overrides.id || `test-integration-${Date.now()}`,
      userId,
      name: overrides.name || "Test Integration",
      typeSlug: overrides.typeSlug || "github",
      status: overrides.status || "ACTIVE",
      config: overrides.config || {},
      frequency: 300,
    },
  });
}

/**
 * Create test OAuth credentials
 */
export async function createTestCredentials(
  prisma: PrismaClient,
  integrationId: string,
  overrides: Partial<{
    accessToken: string;
    refreshToken: string;
    provider: string;
  }> = {}
) {
  return prisma.oAuthCredential.create({
    data: {
      integrationId,
      provider: overrides.provider || "github",
      accessToken: encryptCredential(overrides.accessToken || "test-access-token"),
      refreshToken: overrides.refreshToken
        ? encryptCredential(overrides.refreshToken)
        : null,
    },
  });
}

/**
 * Create test metric data
 */
export async function createTestMetricData(
  prisma: PrismaClient,
  integrationId: string,
  overrides: Partial<{
    metricKey: string;
    value: unknown;
    timestamp: Date;
    metadata: Record<string, unknown>;
  }> = {}
) {
  return prisma.metricData.create({
    data: {
      integrationId,
      metricKey: overrides.metricKey || "test_metric",
      value: overrides.value || { count: 1 },
      timestamp: overrides.timestamp || new Date(),
      metadata: overrides.metadata || null,
    },
  });
}

/**
 * Create a batch of test metric data
 */
export async function createTestMetricDataBatch(
  prisma: PrismaClient,
  integrationId: string,
  count: number,
  options: {
    metricKey?: string;
    startDate?: Date;
    intervalMs?: number;
  } = {}
) {
  const {
    metricKey = "commits",
    startDate = new Date(),
    intervalMs = 24 * 60 * 60 * 1000, // 1 day
  } = options;

  const data = Array.from({ length: count }, (_, i) => ({
    integrationId,
    metricKey,
    value: { count: Math.floor(Math.random() * 10) + 1 },
    timestamp: new Date(startDate.getTime() + i * intervalMs),
    metadata: { index: i },
  }));

  await prisma.metricData.createMany({ data });

  return data;
}

/**
 * Create a test weekly summary
 */
export async function createTestWeeklySummary(
  prisma: PrismaClient,
  userId: string,
  overrides: Partial<{
    weekStart: Date;
    template: "EXECUTIVE" | "DETAILED" | "INSIGHTS" | "SHAREABLE";
    content: string;
    context: Record<string, unknown>;
  }> = {}
) {
  return prisma.weeklySummary.create({
    data: {
      userId,
      weekStart: overrides.weekStart || new Date("2025-01-13"),
      template: overrides.template || "EXECUTIVE",
      content: overrides.content || "# Test Summary\n\nThis is a test summary.",
      context: overrides.context || {},
    },
  });
}
