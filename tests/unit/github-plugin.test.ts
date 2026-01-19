import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubPlugin } from "../../server/lib/integrations/github/plugin";
import { githubConfigSchema } from "../../server/lib/integrations/github/config";

describe("GitHubPlugin", () => {
  let plugin: GitHubPlugin;

  beforeEach(() => {
    plugin = new GitHubPlugin();
  });

  describe("metadata", () => {
    it("should have correct slug", () => {
      expect(plugin.slug).toBe("github");
    });

    it("should have correct name", () => {
      expect(plugin.name).toBe("GitHub");
    });

    it("should be in DEVELOPMENT category", () => {
      expect(plugin.category).toBe("DEVELOPMENT");
    });

    it("should require OAuth", () => {
      expect(plugin.requiresOAuth).toBe(true);
      expect(plugin.oauthProvider).toBe("github");
    });

    it("should support backfill", () => {
      expect(plugin.supportsBackfill).toBe(true);
    });
  });

  describe("configSchema", () => {
    it("should validate empty config with defaults", () => {
      const result = githubConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repositories).toEqual([]);
        expect(result.data.includePrivate).toBe(true);
        expect(result.data.trackPullRequests).toBe(false);
        expect(result.data.trackIssues).toBe(false);
      }
    });

    it("should validate config with custom values", () => {
      const result = githubConfigSchema.safeParse({
        repositories: ["owner/repo1", "owner/repo2"],
        includePrivate: false,
        trackPullRequests: true,
        trackIssues: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repositories).toHaveLength(2);
        expect(result.data.includePrivate).toBe(false);
        expect(result.data.trackPullRequests).toBe(true);
      }
    });

    it("should reject invalid config", () => {
      const result = githubConfigSchema.safeParse({
        repositories: "not-an-array",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("getScheduleConfig", () => {
    it("should return interval-based schedule", () => {
      const config = plugin.getScheduleConfig();
      expect(config.type).toBe("interval");
      expect(config.interval).toBe(3600);
    });
  });

  describe("getScheduleConstraints", () => {
    it("should return valid constraints", () => {
      const constraints = plugin.getScheduleConstraints();
      expect(constraints.minFrequencySeconds).toBe(300);
      expect(constraints.maxFrequencySeconds).toBe(86400);
      expect(constraints.defaultFrequencySeconds).toBe(3600);
      expect(constraints.allowCron).toBe(true);
    });
  });

  describe("getBackfillConfig", () => {
    it("should return backfill configuration", () => {
      const config = plugin.getBackfillConfig();
      expect(config.daysBack).toBe(30);
      expect(config.chunkSizeDays).toBe(7);
    });
  });

  describe("validateConfig", () => {
    it("should return true for valid config", async () => {
      const isValid = await plugin.validateConfig({
        repositories: [],
        includePrivate: true,
        trackPullRequests: false,
        trackIssues: false,
      });
      expect(isValid).toBe(true);
    });
  });

  describe("metricSchema", () => {
    it("should define expected metrics", () => {
      const metricKeys = plugin.metricSchema.map((m) => m.key);
      expect(metricKeys).toContain("commits");
      expect(metricKeys).toContain("daily_commits");
      expect(metricKeys).toContain("pull_requests");
      expect(metricKeys).toContain("issues");
      expect(metricKeys).toContain("repositories_active");
    });
  });

  describe("getOAuthUrl", () => {
    it("should generate valid OAuth URL", () => {
      // Set env var for test
      process.env.GITHUB_CLIENT_ID = "test-client-id";

      const url = plugin.getOAuthUrl(
        { repositories: [], includePrivate: true, trackPullRequests: false, trackIssues: false },
        "test-state",
        "http://localhost:3000/callback"
      );

      expect(url).toContain("https://github.com/login/oauth/authorize");
      expect(url).toContain("client_id=test-client-id");
      expect(url).toContain("state=test-state");
      expect(url).toContain("scope=read%3Auser+repo");
    });

    it("should throw if GITHUB_CLIENT_ID not set", () => {
      delete process.env.GITHUB_CLIENT_ID;

      expect(() =>
        plugin.getOAuthUrl(
          { repositories: [], includePrivate: true, trackPullRequests: false, trackIssues: false },
          "test-state",
          "http://localhost:3000/callback"
        )
      ).toThrow("GITHUB_CLIENT_ID not configured");
    });
  });

  describe("fetchData", () => {
    it("should throw error if no credentials provided", async () => {
      await expect(
        plugin.fetchData(
          { repositories: [], includePrivate: true, trackPullRequests: false, trackIssues: false },
          undefined,
          undefined
        )
      ).rejects.toThrow("GitHub access token is required");
    });

    it("should throw error if credentials have no access token", async () => {
      await expect(
        plugin.fetchData(
          { repositories: [], includePrivate: true, trackPullRequests: false, trackIssues: false },
          { accessToken: "" },
          undefined
        )
      ).rejects.toThrow("GitHub access token is required");
    });
  });
});
