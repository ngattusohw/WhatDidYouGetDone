import { Redis } from "ioredis";

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required");
}

export const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
});

connection.on("error", (err) => {
  console.error("[Redis] Connection error:", err);
});

connection.on("connect", () => {
  console.log("[Redis] Connected");
});
