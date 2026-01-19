import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "../lib/prisma";
import { enqueueSummaryGeneration } from "../lib/queue";
import { TRPCError } from "@trpc/server";
import { SummaryTemplate } from "../../src/generated/prisma";
import { startOfWeek, endOfWeek, format, eachDayOfInterval } from "date-fns";

export const summariesRouter = createTRPCRouter({
  // Get weekly summary for a specific week and template
  get: protectedProcedure
    .input(
      z.object({
        weekStart: z.string(), // ISO date string
        template: z.nativeEnum(SummaryTemplate),
      })
    )
    .query(async ({ ctx, input }) => {
      const weekStartDate = new Date(input.weekStart);

      const summary = await prisma.weeklySummary.findUnique({
        where: {
          userId_weekStart_template: {
            userId: ctx.user.id,
            weekStart: weekStartDate,
            template: input.template,
          },
        },
      });

      return summary;
    }),

  // List all summaries for a user
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(52).default(12),
        template: z.nativeEnum(SummaryTemplate).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const summaries = await prisma.weeklySummary.findMany({
        where: {
          userId: ctx.user.id,
          ...(input.template && { template: input.template }),
        },
        orderBy: { weekStart: "desc" },
        take: input.limit,
      });

      return summaries;
    }),

  // Generate a new summary (enqueues the job)
  generate: protectedProcedure
    .input(
      z.object({
        weekStart: z.string(), // ISO date string
        template: z.nativeEnum(SummaryTemplate),
        regenerate: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const weekStartDate = new Date(input.weekStart);

      // Check if summary already exists
      const existing = await prisma.weeklySummary.findUnique({
        where: {
          userId_weekStart_template: {
            userId: ctx.user.id,
            weekStart: weekStartDate,
            template: input.template,
          },
        },
      });

      if (existing && !input.regenerate) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Summary already exists. Set regenerate=true to regenerate.",
        });
      }

      // Check if user has any integrations with data
      const integrations = await prisma.integration.findMany({
        where: {
          userId: ctx.user.id,
          status: "ACTIVE",
        },
      });

      if (integrations.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No active integrations found. Add integrations first.",
        });
      }

      // Enqueue the summary generation job
      await enqueueSummaryGeneration(
        ctx.user.id,
        input.weekStart,
        input.template
      );

      return { success: true, queued: true };
    }),

  // Get aggregated stats for a week (used for dashboard)
  getWeeklyStats: protectedProcedure
    .input(
      z.object({
        weekStart: z.string(), // ISO date string
      })
    )
    .query(async ({ ctx, input }) => {
      const weekStartDate = startOfWeek(new Date(input.weekStart), {
        weekStartsOn: 1,
      });
      const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });

      // Get all user's active integrations
      const integrations = await prisma.integration.findMany({
        where: {
          userId: ctx.user.id,
          status: "ACTIVE",
        },
      });

      // Get metrics for each integration in this week
      const integrationStats = await Promise.all(
        integrations.map(async (integration) => {
          const metrics = await prisma.metricData.findMany({
            where: {
              integrationId: integration.id,
              timestamp: {
                gte: weekStartDate,
                lte: weekEndDate,
              },
            },
            orderBy: { timestamp: "asc" },
          });

          // Group metrics by key
          const metricsByKey: Record<string, any[]> = {};
          for (const metric of metrics) {
            if (!metricsByKey[metric.metricKey]) {
              metricsByKey[metric.metricKey] = [];
            }
            metricsByKey[metric.metricKey].push({
              value: metric.value,
              timestamp: metric.timestamp,
              metadata: metric.metadata,
            });
          }

          return {
            integrationId: integration.id,
            integrationName: integration.name,
            integrationSlug: integration.typeSlug,
            metrics: metricsByKey,
            totalDataPoints: metrics.length,
          };
        })
      );

      // Get existing summaries for this week
      const existingSummaries = await prisma.weeklySummary.findMany({
        where: {
          userId: ctx.user.id,
          weekStart: weekStartDate,
        },
        select: {
          template: true,
          createdAt: true,
        },
      });

      return {
        weekStart: format(weekStartDate, "yyyy-MM-dd"),
        weekEnd: format(weekEndDate, "yyyy-MM-dd"),
        integrations: integrationStats,
        totalIntegrations: integrations.length,
        existingSummaries: existingSummaries.map((s) => s.template),
      };
    }),

  // Get weekly data for dashboard display
  getWeeklyData: protectedProcedure
    .input(
      z.object({
        weekStart: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const weekStartDate = startOfWeek(new Date(input.weekStart), {
        weekStartsOn: 1,
      });
      const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });

      // Get all user's active integrations
      const integrations = await prisma.integration.findMany({
        where: {
          userId: ctx.user.id,
          status: "ACTIVE",
        },
      });

      // Get metrics for all integrations in this week
      const allMetrics = await prisma.metricData.findMany({
        where: {
          integrationId: {
            in: integrations.map((i) => i.id),
          },
          timestamp: {
            gte: weekStartDate,
            lte: weekEndDate,
          },
        },
        orderBy: { timestamp: "desc" },
      });

      // Initialize daily activity for each day of the week
      const days = eachDayOfInterval({ start: weekStartDate, end: weekEndDate });
      const dailyActivity = days.map((day) => ({
        date: format(day, "EEE"),
        fullDate: format(day, "yyyy-MM-dd"),
        commits: 0,
        issues: 0,
        tweets: 0,
        pullRequests: 0,
      }));

      // Totals
      const totals = {
        commits: 0,
        issues: 0,
        tweets: 0,
        pullRequests: 0,
      };

      // Process metrics
      const integrationBreakdown: {
        slug: string;
        name: string;
        recentActivity: any[];
      }[] = [];

      for (const integration of integrations) {
        const integrationMetrics = allMetrics.filter(
          (m) => m.integrationId === integration.id
        );

        const recentActivity: any[] = [];

        for (const metric of integrationMetrics) {
          const dateStr = format(metric.timestamp, "yyyy-MM-dd");
          const dayIndex = dailyActivity.findIndex((d) => d.fullDate === dateStr);

          // Map metric keys to activity types
          if (integration.typeSlug === "github") {
            const value = metric.value as any;
            if (metric.metricKey === "commits") {
              totals.commits++;
              if (dayIndex >= 0) dailyActivity[dayIndex].commits++;
              recentActivity.push({
                type: "commit",
                message: value?.message || "Commit",
                repo: value?.repo,
                url: value?.url,
                timestamp: metric.timestamp.toISOString(),
              });
            } else if (metric.metricKey === "pull_requests") {
              totals.pullRequests++;
              if (dayIndex >= 0) dailyActivity[dayIndex].pullRequests++;
              recentActivity.push({
                type: "PR",
                title: value?.title || "Pull Request",
                repo: value?.repo,
                url: value?.url,
                timestamp: metric.timestamp.toISOString(),
              });
            }
          } else if (integration.typeSlug === "linear") {
            const value = metric.value as any;
            if (metric.metricKey === "issues_created" || metric.metricKey === "issues_completed") {
              totals.issues++;
              if (dayIndex >= 0) dailyActivity[dayIndex].issues++;
              recentActivity.push({
                type: metric.metricKey === "issues_created" ? "issue created" : "issue completed",
                title: value?.title || value?.identifier || "Issue",
                identifier: value?.identifier,
                url: value?.url,
                team: value?.team,
                project: value?.project,
                projectIcon: value?.projectIcon,
                assignee: value?.assignee,
                assigneeAvatar: value?.assigneeAvatar,
                labels: value?.labels,
                priority: value?.priorityLabel,
                estimate: value?.estimate,
                subIssueCount: value?.subIssueCount,
                state: value?.state,
                timestamp: metric.timestamp.toISOString(),
              });
            }
          } else if (integration.typeSlug === "twitter") {
            if (metric.metricKey === "tweets" || metric.metricKey === "daily_tweets") {
              const count = typeof metric.value === "number" ? metric.value : 1;
              totals.tweets += count;
              if (dayIndex >= 0) dailyActivity[dayIndex].tweets += count;
              if (metric.metricKey === "tweets") {
                recentActivity.push({
                  type: "tweet",
                  text: (metric.value as any)?.text || "Tweet",
                  timestamp: metric.timestamp.toISOString(),
                });
              }
            }
          }
        }

        integrationBreakdown.push({
          slug: integration.typeSlug,
          name: integration.name,
          recentActivity: recentActivity.slice(0, 20), // Limit to 20 most recent
        });
      }

      return {
        dailyActivity,
        integrationBreakdown,
        totals,
      };
    }),

  // Delete a summary
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const summary = await prisma.weeklySummary.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!summary) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Summary not found",
        });
      }

      await prisma.weeklySummary.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
