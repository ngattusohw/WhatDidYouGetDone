import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "../lib/prisma";
import { integrationRegistry } from "../lib/integrations/registry";
import { enqueueIntegrationRun, enqueueBackfill } from "../lib/queue";
import { encryptCredential } from "../lib/encryption";
import { TRPCError } from "@trpc/server";
import { IntegrationStatus, Prisma } from "../../src/generated/prisma";

export const integrationsRouter = createTRPCRouter({
  // List all available integration types
  listAvailable: protectedProcedure.query(async () => {
    const plugins = integrationRegistry.getAll();
    return plugins.map((plugin) => ({
      slug: plugin.slug,
      name: plugin.name,
      description: plugin.description,
      category: plugin.category,
      requiresOAuth: plugin.requiresOAuth,
      metrics: plugin.metricSchema,
    }));
  }),

  // List user's configured integrations
  list: protectedProcedure.query(async ({ ctx }) => {
    const integrations = await prisma.integration.findMany({
      where: { userId: ctx.user.id },
      include: {
        credentials: {
          select: {
            id: true,
            provider: true,
            expiresAt: true,
            createdAt: true,
          },
        },
        syncState: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return integrations.map((integration) => ({
      ...integration,
      hasCredentials: !!integration.credentials,
    }));
  }),

  // Get a single integration by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const integration = await prisma.integration.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        include: {
          credentials: {
            select: {
              id: true,
              provider: true,
              expiresAt: true,
              createdAt: true,
            },
          },
          syncState: true,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found",
        });
      }

      return integration;
    }),

  // Create a new integration
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        typeSlug: z.string(),
        config: z.record(z.unknown()).default({}),
        frequency: z.number().min(60).default(300),
        cronPattern: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const plugin = integrationRegistry.get(input.typeSlug);
      if (!plugin) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown integration type: ${input.typeSlug}`,
        });
      }

      // Validate config against plugin schema
      const configResult = plugin.configSchema.safeParse(input.config);
      if (!configResult.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid configuration",
          cause: configResult.error,
        });
      }

      const integration = await prisma.integration.create({
        data: {
          userId: ctx.user.id,
          name: input.name,
          typeSlug: input.typeSlug,
          config: input.config as Prisma.InputJsonValue,
          frequency: input.frequency,
          cronPattern: input.cronPattern,
          status: plugin.requiresOAuth
            ? IntegrationStatus.PENDING_AUTH
            : IntegrationStatus.ACTIVE,
        },
      });

      return integration;
    }),

  // Update an integration
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        config: z.record(z.unknown()).optional(),
        frequency: z.number().min(60).optional(),
        cronPattern: z.string().nullable().optional(),
        status: z.nativeEnum(IntegrationStatus).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const integration = await prisma.integration.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found",
        });
      }

      if (input.config) {
        const plugin = integrationRegistry.get(integration.typeSlug);
        if (plugin) {
          const configResult = plugin.configSchema.safeParse(input.config);
          if (!configResult.success) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid configuration",
              cause: configResult.error,
            });
          }
        }
      }

      const updated = await prisma.integration.update({
        where: { id: input.id },
        data: {
          name: input.name,
          config: input.config as Prisma.InputJsonValue | undefined,
          frequency: input.frequency,
          cronPattern: input.cronPattern,
          status: input.status,
        },
      });

      return updated;
    }),

  // Delete an integration
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const integration = await prisma.integration.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found",
        });
      }

      await prisma.integration.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Save OAuth credentials for an integration
  saveCredentials: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        accessToken: z.string(),
        refreshToken: z.string().optional(),
        expiresAt: z.date().optional(),
        tokenData: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const integration = await prisma.integration.findFirst({
        where: {
          id: input.integrationId,
          userId: ctx.user.id,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found",
        });
      }

      // Encrypt tokens before storing
      const encryptedAccessToken = encryptCredential(input.accessToken);
      const encryptedRefreshToken = input.refreshToken
        ? encryptCredential(input.refreshToken)
        : null;

      await prisma.oAuthCredential.upsert({
        where: { integrationId: input.integrationId },
        create: {
          integrationId: input.integrationId,
          provider: integration.typeSlug,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: input.expiresAt,
          tokenData: input.tokenData as Prisma.InputJsonValue | undefined,
        },
        update: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: input.expiresAt,
          tokenData: input.tokenData as Prisma.InputJsonValue | undefined,
        },
      });

      // Update integration status to ACTIVE
      await prisma.integration.update({
        where: { id: input.integrationId },
        data: {
          status: IntegrationStatus.ACTIVE,
          lastError: null,
          lastErrorAt: null,
        },
      });

      // Trigger initial backfill if supported
      const plugin = integrationRegistry.get(integration.typeSlug);
      if (plugin?.supportsBackfill) {
        await enqueueBackfill(input.integrationId);
      }

      return { success: true };
    }),

  // Trigger a manual fetch for an integration
  triggerFetch: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        force: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const integration = await prisma.integration.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found",
        });
      }

      await enqueueIntegrationRun(input.id, { force: input.force });

      return { success: true, queued: true };
    }),

  // Trigger backfill for an integration
  triggerBackfill: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const integration = await prisma.integration.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found",
        });
      }

      const plugin = integrationRegistry.get(integration.typeSlug);
      if (!plugin?.supportsBackfill) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This integration does not support backfill",
        });
      }

      await enqueueBackfill(input.id);

      return { success: true, queued: true };
    }),

  // Get metrics for an integration
  getMetrics: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        metricKey: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(1000).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const integration = await prisma.integration.findFirst({
        where: {
          id: input.integrationId,
          userId: ctx.user.id,
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found",
        });
      }

      const metrics = await prisma.metricData.findMany({
        where: {
          integrationId: input.integrationId,
          ...(input.metricKey && { metricKey: input.metricKey }),
          ...(input.startDate && { timestamp: { gte: input.startDate } }),
          ...(input.endDate && { timestamp: { lte: input.endDate } }),
        },
        orderBy: { timestamp: "desc" },
        take: input.limit,
      });

      return metrics;
    }),
});
