import { beforeAll, afterAll, afterEach } from "vitest";

// Load environment variables for tests
import "dotenv/config";

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.ENCRYPTION_KEY = "test-encryption-key-for-vitest-32char";

beforeAll(async () => {
  console.log("[Test Setup] Initializing test environment...");
});

afterEach(async () => {
  // Clean up after each test if needed
});

afterAll(async () => {
  console.log("[Test Setup] Cleaning up test environment...");
});
