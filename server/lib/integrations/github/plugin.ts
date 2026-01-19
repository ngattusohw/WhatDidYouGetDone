import {
  IntegrationPlugin,
  FetchResult,
  FetchContext,
  OAuthCredential,
  ScheduleConfig,
  MetricDataPoint,
  BackfillConfig,
} from "../types";
import { GitHubConfig, githubConfigSchema, githubMetrics } from "./config";
import { GitHubApiClient } from "./api-client";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

export class GitHubPlugin implements IntegrationPlugin<GitHubConfig> {
  slug = "github";
  name = "GitHub";
  description = "Track commits, pull requests, and issues from GitHub";
  category = "DEVELOPMENT" as const;
  icon = "github";

  requiresOAuth = true;
  oauthProvider = "github";
  supportsBackfill = true;

  configSchema = githubConfigSchema;
  metricSchema = githubMetrics;

  getScheduleConfig(): ScheduleConfig {
    return {
      type: "interval",
      interval: 3600, // Fetch every hour
    };
  }

  getScheduleConstraints() {
    return {
      minFrequencySeconds: 300, // Minimum 5 minutes
      maxFrequencySeconds: 86400, // Maximum 24 hours
      defaultFrequencySeconds: 3600, // Default 1 hour
      allowCron: true,
    };
  }

  getBackfillConfig(): BackfillConfig {
    return {
      daysBack: 30, // Backfill 30 days of history
      chunkSizeDays: 7, // Process in 7-day chunks
    };
  }

  async validateConfig(config: GitHubConfig): Promise<boolean> {
    const result = githubConfigSchema.safeParse(config);
    return result.success;
  }

  async fetchData(
    config: GitHubConfig,
    credentials?: OAuthCredential,
    context?: FetchContext,
    _integrationId?: string
  ): Promise<FetchResult> {
    if (!credentials?.accessToken) {
      throw new Error("GitHub access token is required");
    }

    const client = new GitHubApiClient(credentials.accessToken);

    // Determine date range
    let startDate: Date;
    let endDate: Date;

    if (context?.startDate && context?.endDate) {
      // Use provided date range (from runner or backfill)
      startDate = startOfDay(context.startDate);
      endDate = endOfDay(context.endDate);
    } else {
      // Default: fetch last 24 hours
      endDate = endOfDay(new Date());
      startDate = startOfDay(subDays(endDate, 1));
    }

    console.log(
      `[GitHubPlugin] Fetching data from ${format(startDate, "yyyy-MM-dd")} to ${format(
        endDate,
        "yyyy-MM-dd"
      )}`
    );

    // Fetch activity
    const activity = await client.getActivitySummary(startDate, endDate, {
      trackPullRequests: config.trackPullRequests,
      trackIssues: config.trackIssues,
      repositories: config.repositories,
    });

    const dataPoints: MetricDataPoint[] = [];

    // Convert commits to data points
    for (const commit of activity.commits) {
      dataPoints.push({
        metricKey: "commits",
        value: {
          sha: commit.sha,
          message: commit.message,
          repo: commit.repo,
          url: commit.url,
        },
        timestamp: commit.timestamp,
        metadata: {
          repo: commit.repo,
          sha: commit.sha,
        },
      });
    }

    // Add daily commit counts
    for (const [dateStr, daily] of Object.entries(activity.dailyActivity)) {
      if (daily.commits > 0) {
        dataPoints.push({
          metricKey: "daily_commits",
          value: daily.commits,
          timestamp: new Date(`${dateStr}T12:00:00Z`), // Noon of that day
          metadata: {
            date: dateStr,
            pullRequests: daily.pullRequests,
            issues: daily.issues,
          },
        });
      }
    }

    // Convert PRs to data points
    for (const pr of activity.pullRequests) {
      dataPoints.push({
        metricKey: "pull_requests",
        value: {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          repo: pr.repo,
          url: pr.url,
        },
        timestamp: pr.createdAt,
        metadata: {
          repo: pr.repo,
          number: pr.number,
          state: pr.state,
        },
      });
    }

    // Convert issues to data points
    for (const issue of activity.issues) {
      dataPoints.push({
        metricKey: "issues",
        value: {
          number: issue.number,
          title: issue.title,
          state: issue.state,
          repo: issue.repo,
          url: issue.url,
        },
        timestamp: issue.createdAt,
        metadata: {
          repo: issue.repo,
          number: issue.number,
          state: issue.state,
        },
      });
    }

    // Add active repositories count
    if (activity.repositoriesActive.length > 0) {
      dataPoints.push({
        metricKey: "repositories_active",
        value: activity.repositoriesActive.length,
        timestamp: endDate,
        metadata: {
          repositories: activity.repositoriesActive,
        },
      });
    }

    console.log(
      `[GitHubPlugin] Fetched ${activity.totalCommits} commits, ${activity.totalPRs} PRs, ${activity.totalIssues} issues`
    );

    return {
      dataPoints,
      newState: {
        lastSyncDate: endDate.toISOString(),
        lastCommitCount: activity.totalCommits,
      },
      // Deduplicate by commit SHA or PR/issue number
      deduplicationKey: (point) => {
        if (point.metricKey === "commits") {
          return `commit-${(point.metadata as any)?.sha}`;
        }
        if (point.metricKey === "pull_requests") {
          return `pr-${(point.metadata as any)?.repo}-${(point.metadata as any)?.number}`;
        }
        if (point.metricKey === "issues") {
          return `issue-${(point.metadata as any)?.repo}-${(point.metadata as any)?.number}`;
        }
        if (point.metricKey === "daily_commits") {
          return `daily-${(point.metadata as any)?.date}`;
        }
        return `${point.metricKey}-${point.timestamp.toISOString()}`;
      },
    };
  }

  // OAuth methods
  getOAuthUrl(_config: GitHubConfig, state: string, redirectUri: string): string {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      throw new Error("GITHUB_CLIENT_ID not configured");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "read:user repo read:org",
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleOAuthCallback(
    code: string,
    _state: string,
    redirectUri: string
  ): Promise<OAuthCredential> {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("GitHub OAuth credentials not configured");
    }

    // Exchange code for token
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub OAuth error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      scope?: string;
      token_type?: string;
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    return {
      accessToken: data.access_token,
      tokenData: {
        scope: data.scope,
        token_type: data.token_type,
      },
    };
  }
}
