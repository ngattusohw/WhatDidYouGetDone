import { PrismaClient } from "../../src/generated/prisma";
import { GenericContainer, StartedTestContainer } from "testcontainers";
import { execSync } from "child_process";

let container: StartedTestContainer | null = null;
let prisma: PrismaClient | null = null;

/**
 * Start a PostgreSQL container for testing.
 * Uses testcontainers for isolated database testing.
 */
export async function setupTestDatabase(): Promise<PrismaClient> {
  if (prisma) {
    return prisma;
  }

  console.log("[TestDB] Starting PostgreSQL container...");

  container = await new GenericContainer("postgres:16")
    .withEnvironment({
      POSTGRES_DB: "testdb",
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
    })
    .withExposedPorts(5432)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const connectionString = `postgresql://test:test@${host}:${port}/testdb`;
  process.env.DATABASE_URL = connectionString;

  console.log("[TestDB] Running Prisma migrations...");

  // Run migrations
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: "inherit",
  });

  prisma = new PrismaClient({
    datasources: {
      db: { url: connectionString },
    },
  });

  await prisma.$connect();
  console.log("[TestDB] Database ready");

  return prisma;
}

/**
 * Clean up database between tests
 */
export async function cleanDatabase(client: PrismaClient): Promise<void> {
  const tables = [
    "metric_data",
    "integration_sync_states",
    "oauth_credentials",
    "weekly_summaries",
    "integrations",
    "sessions",
    "accounts",
    "verifications",
    "users",
  ];

  for (const table of tables) {
    await client.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
}

/**
 * Tear down the test database
 */
export async function teardownTestDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }

  if (container) {
    await container.stop();
    container = null;
  }

  console.log("[TestDB] Database container stopped");
}

/**
 * Get the test Prisma client
 */
export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error("Test database not initialized. Call setupTestDatabase() first.");
  }
  return prisma;
}
