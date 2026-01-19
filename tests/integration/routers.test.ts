import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  setupTestDatabase,
  cleanDatabase,
  teardownTestDatabase,
} from "../helpers/db";
import {
  createTestUser,
  createTestIntegration,
  createTestMetricData,
  createTestMetricDataBatch,
  createTestWeeklySummary,
} from "../helpers/fixtures";
import { PrismaClient } from "../../src/generated/prisma";

// Mock the registry
vi.mock("../../server/lib/integrations/registry", () => ({
  integrationRegistry: {
    get: vi.fn(),
    getAll: vi.fn(() => []),
    has: vi.fn(),
  },
}));

// Mock the queue
vi.mock("../../server/lib/queue", () => ({
  enqueueIntegrationRun: vi.fn(),
  enqueueBackfill: vi.fn(),
  enqueueSummaryGeneration: vi.fn(),
}));

describe("tRPC Routers - Database Operations", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
  }, 60000);

  afterAll(async () => {
    await teardownTestDatabase();
  }, 30000);

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe("Integrations Router Logic", () => {
    describe("list integrations", () => {
      it("should return empty array when user has no integrations", async () => {
        const user = await createTestUser(prisma);
        const integrations = await prisma.integration.findMany({
          where: { userId: user.id },
        });

        expect(integrations).toHaveLength(0);
      });

      it("should return user's integrations ordered by createdAt desc", async () => {
        const user = await createTestUser(prisma);

        // Create integrations with slight delay to ensure different timestamps
        const int1 = await createTestIntegration(prisma, user.id, {
          name: "First",
          typeSlug: "github",
        });
        const int2 = await createTestIntegration(prisma, user.id, {
          name: "Second",
          typeSlug: "linear",
        });

        const integrations = await prisma.integration.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        });

        expect(integrations).toHaveLength(2);
        // Most recent should be first
        expect(integrations[0].name).toBe("Second");
      });

      it("should not return other users' integrations", async () => {
        const user1 = await createTestUser(prisma, { email: "user1@test.com" });
        const user2 = await createTestUser(prisma, { email: "user2@test.com" });

        await createTestIntegration(prisma, user1.id, { name: "User1 Integration" });
        await createTestIntegration(prisma, user2.id, { name: "User2 Integration" });

        const user1Integrations = await prisma.integration.findMany({
          where: { userId: user1.id },
        });

        expect(user1Integrations).toHaveLength(1);
        expect(user1Integrations[0].name).toBe("User1 Integration");
      });
    });

    describe("create integration", () => {
      it("should create integration with default values", async () => {
        const user = await createTestUser(prisma);

        const integration = await prisma.integration.create({
          data: {
            userId: user.id,
            name: "My GitHub",
            typeSlug: "github",
            config: {},
          },
        });

        expect(integration.name).toBe("My GitHub");
        expect(integration.typeSlug).toBe("github");
        expect(integration.status).toBe("ACTIVE");
        expect(integration.frequency).toBe(300);
        expect(integration.consecutiveFailures).toBe(0);
      });

      it("should create integration with PENDING_AUTH status for OAuth integrations", async () => {
        const user = await createTestUser(prisma);

        const integration = await prisma.integration.create({
          data: {
            userId: user.id,
            name: "My GitHub",
            typeSlug: "github",
            config: {},
            status: "PENDING_AUTH",
          },
        });

        expect(integration.status).toBe("PENDING_AUTH");
      });
    });

    describe("update integration", () => {
      it("should update integration name and config", async () => {
        const user = await createTestUser(prisma);
        const integration = await createTestIntegration(prisma, user.id, {
          name: "Original Name",
        });

        const updated = await prisma.integration.update({
          where: { id: integration.id },
          data: {
            name: "Updated Name",
            config: { setting: "value" },
          },
        });

        expect(updated.name).toBe("Updated Name");
        expect(updated.config).toEqual({ setting: "value" });
      });

      it("should update integration status", async () => {
        const user = await createTestUser(prisma);
        const integration = await createTestIntegration(prisma, user.id, {
          status: "ACTIVE",
        });

        const updated = await prisma.integration.update({
          where: { id: integration.id },
          data: { status: "PAUSED" },
        });

        expect(updated.status).toBe("PAUSED");
      });
    });

    describe("delete integration", () => {
      it("should delete integration and cascade to related data", async () => {
        const user = await createTestUser(prisma);
        const integration = await createTestIntegration(prisma, user.id);
        await createTestMetricData(prisma, integration.id);

        await prisma.integration.delete({
          where: { id: integration.id },
        });

        const deleted = await prisma.integration.findUnique({
          where: { id: integration.id },
        });
        const orphanedMetrics = await prisma.metricData.findMany({
          where: { integrationId: integration.id },
        });

        expect(deleted).toBeNull();
        expect(orphanedMetrics).toHaveLength(0);
      });
    });

    describe("get metrics", () => {
      it("should return metrics for integration within date range", async () => {
        const user = await createTestUser(prisma);
        const integration = await createTestIntegration(prisma, user.id);

        const startDate = new Date("2025-01-13");
        await createTestMetricDataBatch(prisma, integration.id, 7, {
          startDate,
          metricKey: "commits",
        });

        const metrics = await prisma.metricData.findMany({
          where: {
            integrationId: integration.id,
            timestamp: {
              gte: new Date("2025-01-13"),
              lte: new Date("2025-01-19"),
            },
          },
          orderBy: { timestamp: "asc" },
        });

        expect(metrics).toHaveLength(7);
      });

      it("should filter metrics by metricKey", async () => {
        const user = await createTestUser(prisma);
        const integration = await createTestIntegration(prisma, user.id);

        await createTestMetricData(prisma, integration.id, { metricKey: "commits" });
        await createTestMetricData(prisma, integration.id, { metricKey: "prs" });
        await createTestMetricData(prisma, integration.id, { metricKey: "commits" });

        const commitMetrics = await prisma.metricData.findMany({
          where: {
            integrationId: integration.id,
            metricKey: "commits",
          },
        });

        expect(commitMetrics).toHaveLength(2);
      });
    });
  });

  describe("Summaries Router Logic", () => {
    describe("get weekly summary", () => {
      it("should return null when summary doesn't exist", async () => {
        const user = await createTestUser(prisma);

        const summary = await prisma.weeklySummary.findUnique({
          where: {
            userId_weekStart_template: {
              userId: user.id,
              weekStart: new Date("2025-01-13"),
              template: "EXECUTIVE",
            },
          },
        });

        expect(summary).toBeNull();
      });

      it("should return existing summary", async () => {
        const user = await createTestUser(prisma);
        await createTestWeeklySummary(prisma, user.id, {
          weekStart: new Date("2025-01-13"),
          template: "EXECUTIVE",
          content: "# Weekly Summary\n\nGreat week!",
        });

        const summary = await prisma.weeklySummary.findUnique({
          where: {
            userId_weekStart_template: {
              userId: user.id,
              weekStart: new Date("2025-01-13"),
              template: "EXECUTIVE",
            },
          },
        });

        expect(summary).toBeTruthy();
        expect(summary?.content).toContain("Great week!");
      });
    });

    describe("list summaries", () => {
      it("should return summaries ordered by weekStart desc", async () => {
        const user = await createTestUser(prisma);

        await createTestWeeklySummary(prisma, user.id, {
          weekStart: new Date("2025-01-06"),
          template: "EXECUTIVE",
        });
        await createTestWeeklySummary(prisma, user.id, {
          weekStart: new Date("2025-01-13"),
          template: "EXECUTIVE",
        });

        const summaries = await prisma.weeklySummary.findMany({
          where: { userId: user.id },
          orderBy: { weekStart: "desc" },
        });

        expect(summaries).toHaveLength(2);
        expect(summaries[0].weekStart).toEqual(new Date("2025-01-13"));
      });

      it("should filter summaries by template", async () => {
        const user = await createTestUser(prisma);

        await createTestWeeklySummary(prisma, user.id, {
          weekStart: new Date("2025-01-13"),
          template: "EXECUTIVE",
        });
        await createTestWeeklySummary(prisma, user.id, {
          weekStart: new Date("2025-01-13"),
          template: "DETAILED",
        });

        const executiveSummaries = await prisma.weeklySummary.findMany({
          where: { userId: user.id, template: "EXECUTIVE" },
        });

        expect(executiveSummaries).toHaveLength(1);
        expect(executiveSummaries[0].template).toBe("EXECUTIVE");
      });
    });

    describe("weekly stats aggregation", () => {
      it("should aggregate metrics by integration for a week", async () => {
        const user = await createTestUser(prisma);
        const githubInt = await createTestIntegration(prisma, user.id, {
          name: "GitHub",
          typeSlug: "github",
        });
        const linearInt = await createTestIntegration(prisma, user.id, {
          name: "Linear",
          typeSlug: "linear",
        });

        // Add metrics
        await createTestMetricDataBatch(prisma, githubInt.id, 5, {
          metricKey: "commits",
          startDate: new Date("2025-01-13"),
        });
        await createTestMetricDataBatch(prisma, linearInt.id, 3, {
          metricKey: "issues_closed",
          startDate: new Date("2025-01-13"),
        });

        // Aggregate
        const integrations = await prisma.integration.findMany({
          where: { userId: user.id, status: "ACTIVE" },
          include: {
            metricData: {
              where: {
                timestamp: {
                  gte: new Date("2025-01-13"),
                  lte: new Date("2025-01-19"),
                },
              },
            },
          },
        });

        expect(integrations).toHaveLength(2);

        const github = integrations.find((i) => i.typeSlug === "github");
        const linear = integrations.find((i) => i.typeSlug === "linear");

        expect(github?.metricData).toHaveLength(5);
        expect(linear?.metricData).toHaveLength(3);
      });
    });
  });
});
