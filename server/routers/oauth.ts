import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "../lib/prisma";
import { integrationRegistry } from "../lib/integrations/registry";
import { encryptCredential } from "../lib/encryption";
import { enqueueBackfill } from "../lib/queue";
import { TRPCError } from "@trpc/server";
import { IntegrationStatus, Prisma } from "../../src/generated/prisma";

export const oauthRouter = createTRPCRouter({
  // Get OAuth URL for an integration type
  getAuthUrl: protectedProcedure
    .input(
      z.object({
        integrationId: z.string(),
        redirectUri: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify integration belongs to user
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

      const plugin = integrationRegistry.get(integration.typeSlug);
      if (!plugin) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown integration type: ${integration.typeSlug}`,
        });
      }

      if (!plugin.requiresOAuth || !plugin.getOAuthUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This integration does not support OAuth",
        });
      }

      // Generate state for CSRF protection (includes integration ID)
      const state = Buffer.from(
        JSON.stringify({
          integrationId: input.integrationId,
          userId: ctx.user.id,
          timestamp: Date.now(),
        })
      ).toString("base64url");

      const authUrl = plugin.getOAuthUrl(
        integration.config as any,
        state,
        input.redirectUri
      );

      return { authUrl, state };
    }),

  // Handle OAuth callback
  handleCallback: protectedProcedure
    .input(
      z.object({
        code: z.string(),
        state: z.string(),
        redirectUri: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Decode and validate state
      let stateData: { integrationId: string; userId: string; timestamp: number };
      try {
        stateData = JSON.parse(
          Buffer.from(input.state, "base64url").toString("utf-8")
        );
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid OAuth state",
        });
      }

      // Verify state belongs to this user
      if (stateData.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "OAuth state mismatch",
        });
      }

      // Check state isn't too old (10 minute expiry)
      if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "OAuth state expired",
        });
      }

      // Get integration
      const integration = await prisma.integration.findFirst({
        where: {
          id: stateData.integrationId,
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
      if (!plugin || !plugin.handleOAuthCallback) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Plugin does not support OAuth callback",
        });
      }

      // Exchange code for tokens
      const credential = await plugin.handleOAuthCallback(
        input.code,
        input.state,
        input.redirectUri
      );

      // Encrypt and store credentials
      const encryptedAccessToken = encryptCredential(credential.accessToken);
      const encryptedRefreshToken = credential.refreshToken
        ? encryptCredential(credential.refreshToken)
        : null;

      await prisma.oAuthCredential.upsert({
        where: { integrationId: integration.id },
        create: {
          integrationId: integration.id,
          provider: integration.typeSlug,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: credential.expiresAt,
          tokenData: credential.tokenData as Prisma.InputJsonValue | undefined,
        },
        update: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: credential.expiresAt,
          tokenData: credential.tokenData as Prisma.InputJsonValue | undefined,
        },
      });

      // Update integration status to ACTIVE
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: IntegrationStatus.ACTIVE,
          lastError: null,
          lastErrorAt: null,
          consecutiveFailures: 0,
        },
      });

      // Trigger initial backfill if supported
      if (plugin.supportsBackfill) {
        await enqueueBackfill(integration.id);
      }

      return {
        success: true,
        integrationId: integration.id,
        integrationName: integration.name,
      };
    }),

  // Disconnect OAuth (remove credentials)
  disconnect: protectedProcedure
    .input(z.object({ integrationId: z.string() }))
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

      // Delete credentials
      await prisma.oAuthCredential.deleteMany({
        where: { integrationId: input.integrationId },
      });

      // Update status to PENDING_AUTH
      await prisma.integration.update({
        where: { id: input.integrationId },
        data: {
          status: IntegrationStatus.PENDING_AUTH,
        },
      });

      return { success: true };
    }),

  // Check if integration has valid credentials
  checkCredentials: protectedProcedure
    .input(z.object({ integrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const integration = await prisma.integration.findFirst({
        where: {
          id: input.integrationId,
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
        },
      });

      if (!integration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Integration not found",
        });
      }

      const hasCredentials = !!integration.credentials;
      const isExpired = integration.credentials?.expiresAt
        ? integration.credentials.expiresAt < new Date()
        : false;

      return {
        hasCredentials,
        isExpired,
        expiresAt: integration.credentials?.expiresAt,
        status: integration.status,
      };
    }),
});
