import { Queue, QueueOptions } from "bullmq";

// Get Redis URL for BullMQ queues
const getRedisUrl = (): string => {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL environment variable is required");
  }
  return process.env.REDIS_URL;
};

// BullMQ accepts Redis URL strings for connection
const queueOptions = (options?: Partial<QueueOptions["defaultJobOptions"]>): QueueOptions => ({
  connection: getRedisUrl() as any, // BullMQ accepts URL strings
  defaultJobOptions: {
    ...options,
  },
});

export const integrationQueue = new Queue("integrations", {
  ...queueOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 60000, // 1 minute
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

export const backfillQueue = new Queue("backfill", {
  ...queueOptions(),
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 300000, // 5 minutes
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 500,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});

export const summaryQueue = new Queue("summaries", {
  ...queueOptions(),
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 30000, // 30 seconds
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 500,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  },
});
