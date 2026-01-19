import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "../lib/prisma";
import { TRPCError } from "@trpc/server";
import { RepositoryDetector } from "../lib/repositories";
import { decryptCredential } from "../lib/encryption";
import { OwnerType } from "../../src/generated/prisma";

export const repositoriesRouter = createTRPCRouter({
  // List all detected repos with activity metrics
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
          ownerType: z.nativeEnum(OwnerType).optional(),
          primaryOnly: z.boolean().default(false),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { limit = 50, offset = 0, ownerType, primaryOnly = false } = input ?? {};

      const where: Record<string, unknown> = { userId: ctx.user.id };
      if (ownerType) {
        where.ownerType = ownerType;
      }
      if (primaryOnly) {
        where.isPrimary = true;
      }

      const [repositories, total] = await Promise.all([
        prisma.repository.findMany({
          where,
          orderBy: [{ isPrimary: "desc" }, { lastActivityAt: "desc" }],
          take: limit,
          skip: offset,
        }),
        prisma.repository.count({ where }),
      ]);

      return {
        repositories,
        total,
        hasMore: offset + repositories.length < total,
      };
    }),

  // Get repos grouped by organization
  listByOrg: protectedProcedure.query(async ({ ctx }) => {
    const reposByOrg = await RepositoryDetector.getRepositoriesByOrg(ctx.user.id);

    // Convert Map to array of groups
    const groups: { organization: string; repositories: typeof repos }[] = [];
    for (const [org, repos] of reposByOrg) {
      groups.push({
        organization: org,
        repositories: repos,
      });
    }

    // Sort: personal repos last, then by activity
    groups.sort((a, b) => {
      if (a.organization === "Personal") return 1;
      if (b.organization === "Personal") return -1;
      const aActivity = Math.max(...a.repositories.map((r) => r.lastActivityAt?.getTime() ?? 0));
      const bActivity = Math.max(...b.repositories.map((r) => r.lastActivityAt?.getTime() ?? 0));
      return bActivity - aActivity;
    });

    return groups;
  }),

  // Get top N repos by activity (for summary context)
  getTopRepos: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
        since: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return await RepositoryDetector.getTopRepositories(ctx.user.id, {
        limit: input.limit,
        since: input.since,
      });
    }),

  // Get a single repository by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const repository = await prisma.repository.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!repository) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      return repository;
    }),

  // Mark a repo as primary/important
  togglePrimary: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const repository = await prisma.repository.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!repository) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      const updated = await prisma.repository.update({
        where: { id: input.id },
        data: { isPrimary: !repository.isPrimary },
      });

      return updated;
    }),

  // Refresh metadata for a repo
  refreshMetadata: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const repository = await prisma.repository.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!repository) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      // Get GitHub integration credentials
      const integration = await prisma.integration.findFirst({
        where: {
          userId: ctx.user.id,
          typeSlug: "github",
        },
        include: {
          credentials: true,
        },
      });

      if (!integration?.credentials) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No GitHub integration found with credentials",
        });
      }

      const token = decryptCredential(integration.credentials.accessToken);
      const updated = await RepositoryDetector.refreshMetadata(input.id, token);

      return updated;
    }),

  // Recompute activity metrics for all repos
  recomputeMetrics: protectedProcedure.mutation(async ({ ctx }) => {
    await RepositoryDetector.recomputeMetrics(ctx.user.id);
    return { success: true };
  }),

  // Get activity summary for a date range
  getActivitySummary: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get all repos with activity in the date range
      const metrics = await prisma.metricData.findMany({
        where: {
          repositoryId: { not: null },
          timestamp: {
            gte: input.startDate,
            lte: input.endDate,
          },
          integration: {
            userId: ctx.user.id,
          },
        },
        include: {
          repository: true,
        },
      });

      // Group by repository
      const repoActivity = new Map<
        string,
        {
          repository: typeof metrics[0]["repository"];
          commits: number;
          prs: number;
          issues: number;
        }
      >();

      for (const metric of metrics) {
        if (!metric.repository) continue;

        if (!repoActivity.has(metric.repository.id)) {
          repoActivity.set(metric.repository.id, {
            repository: metric.repository,
            commits: 0,
            prs: 0,
            issues: 0,
          });
        }

        const activity = repoActivity.get(metric.repository.id)!;
        if (metric.metricKey === "commits") activity.commits++;
        else if (metric.metricKey === "pull_requests") activity.prs++;
        else if (metric.metricKey === "issues") activity.issues++;
      }

      // Convert to array and sort by total activity
      const summary = Array.from(repoActivity.values())
        .map((a) => ({
          ...a,
          totalActivity: a.commits + a.prs + a.issues,
        }))
        .sort((a, b) => b.totalActivity - a.totalActivity);

      return summary;
    }),
});
