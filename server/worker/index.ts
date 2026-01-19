import "dotenv/config";
import { Worker } from "bullmq";
import { runIntegration, backfillIntegration } from "../lib/integrations/runner";
import { generateWeeklySummary } from "../lib/ai/summary-generator";

console.log("[Worker] Starting workers...");

// Get Redis URL for BullMQ workers - cast to any since BullMQ accepts URL strings
const getConnection = (): any => {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL environment variable is required");
  }
  return process.env.REDIS_URL;
};

// Integration worker - handles scheduled fetches and manual triggers
const integrationWorker = new Worker(
  "integrations",
  async (job) => {
    console.log(`[Worker:integrations] Processing job ${job.id}: ${job.name}`);

    if (job.name === "run-integration") {
      const { integrationId, force } = job.data;
      const result = await runIntegration(integrationId, { force });
      console.log(
        `[Worker:integrations] Completed ${integrationId}: ${result.status}`
      );
      return result;
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection: getConnection(),
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000,
    },
  }
);

integrationWorker.on("completed", (job) => {
  console.log(`[Worker:integrations] Job ${job.id} completed`);
});

integrationWorker.on("failed", (job, err) => {
  console.error(`[Worker:integrations] Job ${job?.id} failed:`, err.message);
});

// Backfill worker - handles historical data fetching
const backfillWorker = new Worker(
  "backfill",
  async (job) => {
    console.log(`[Worker:backfill] Processing job ${job.id}: ${job.name}`);

    if (job.name === "backfill") {
      const { integrationId } = job.data;
      await backfillIntegration(integrationId);
      console.log(`[Worker:backfill] Completed backfill for ${integrationId}`);
      return { success: true };
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection: getConnection(),
    concurrency: 2, // Lower concurrency for backfills (they're heavy)
  }
);

backfillWorker.on("completed", (job) => {
  console.log(`[Worker:backfill] Job ${job.id} completed`);
});

backfillWorker.on("failed", (job, err) => {
  console.error(`[Worker:backfill] Job ${job?.id} failed:`, err.message);
});

// Summary worker - handles AI summary generation
const summaryWorker = new Worker(
  "summaries",
  async (job) => {
    console.log(`[Worker:summaries] Processing job ${job.id}: ${job.name}`);

    if (job.name === "generate-summary") {
      const { userId, weekStart, template } = job.data;
      const result = await generateWeeklySummary(userId, weekStart, template);
      console.log(`[Worker:summaries] Generated summary for ${userId}`);
      return result;
    }

    throw new Error(`Unknown job name: ${job.name}`);
  },
  {
    connection: getConnection(),
    concurrency: 3,
  }
);

summaryWorker.on("completed", (job) => {
  console.log(`[Worker:summaries] Job ${job.id} completed`);
});

summaryWorker.on("failed", (job, err) => {
  console.error(`[Worker:summaries] Job ${job?.id} failed:`, err.message);
});

// Graceful shutdown
const shutdown = async () => {
  console.log("[Worker] Shutting down...");
  await integrationWorker.close();
  await backfillWorker.close();
  await summaryWorker.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[Worker] All workers started successfully");
