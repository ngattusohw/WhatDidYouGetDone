import {
  IntegrationPlugin,
  FetchResult,
  FetchContext,
  OAuthCredential,
  ScheduleConfig,
  MetricDataPoint,
  BackfillConfig,
} from "../types";
import { LinearConfig, linearConfigSchema, linearMetrics } from "./config";
import { LinearApiClient } from "./api-client";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

export class LinearPlugin implements IntegrationPlugin<LinearConfig> {
  slug = "linear";
  name = "Linear";
  description = "Track issues, cycles, and project progress from Linear";
  category = "DEVELOPMENT" as const;
  icon = "linear";

  requiresOAuth = true;
  oauthProvider = "linear";
  supportsBackfill = true;

  configSchema = linearConfigSchema;
  metricSchema = linearMetrics;

  getScheduleConfig(): ScheduleConfig {
    return {
      type: "interval",
      interval: 3600, // Fetch every hour
    };
  }

  getScheduleConstraints() {
    return {
      minFrequencySeconds: 300,
      maxFrequencySeconds: 86400,
      defaultFrequencySeconds: 3600,
      allowCron: true,
    };
  }

  getBackfillConfig(): BackfillConfig {
    return {
      daysBack: 30,
      chunkSizeDays: 7,
    };
  }

  async validateConfig(config: LinearConfig): Promise<boolean> {
    const result = linearConfigSchema.safeParse(config);
    return result.success;
  }

  async fetchData(
    config: LinearConfig,
    credentials?: OAuthCredential,
    context?: FetchContext,
    _integrationId?: string
  ): Promise<FetchResult> {
    if (!credentials?.accessToken) {
      throw new Error("Linear access token is required");
    }

    const client = new LinearApiClient(credentials.accessToken);

    // Determine date range
    let startDate: Date;
    let endDate: Date;

    if (context?.startDate && context?.endDate) {
      startDate = startOfDay(context.startDate);
      endDate = endOfDay(context.endDate);
    } else {
      endDate = endOfDay(new Date());
      startDate = startOfDay(subDays(endDate, 1));
    }

    console.log(
      `[LinearPlugin] Fetching data from ${format(startDate, "yyyy-MM-dd")} to ${format(
        endDate,
        "yyyy-MM-dd"
      )}`
    );

    // Fetch activity
    const activity = await client.getActivitySummary(startDate, endDate, {
      trackComments: config.trackComments,
      trackCycles: config.trackCycles,
      teamIds: config.teamIds,
    });

    const dataPoints: MetricDataPoint[] = [];

    // Convert created issues to data points
    for (const issue of activity.issuesCreated) {
      dataPoints.push({
        metricKey: "issues_created",
        value: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          state: issue.state,
          priority: issue.priority,
          priorityLabel: issue.priorityLabel,
          team: issue.teamName,
          project: issue.projectName,
          labels: issue.labels,
          estimate: issue.estimate,
          url: issue.url,
        },
        timestamp: issue.createdAt,
        metadata: {
          issueId: issue.id,
          identifier: issue.identifier,
          teamId: issue.teamId,
          projectId: issue.projectId,
        },
      });
    }

    // Convert completed issues to data points
    for (const issue of activity.issuesCompleted) {
      dataPoints.push({
        metricKey: "issues_completed",
        value: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          state: issue.state,
          priority: issue.priority,
          priorityLabel: issue.priorityLabel,
          team: issue.teamName,
          project: issue.projectName,
          labels: issue.labels,
          estimate: issue.estimate,
          url: issue.url,
        },
        timestamp: issue.completedAt || issue.createdAt,
        metadata: {
          issueId: issue.id,
          identifier: issue.identifier,
          teamId: issue.teamId,
          projectId: issue.projectId,
        },
      });
    }

    // Convert comments to data points
    for (const comment of activity.comments) {
      dataPoints.push({
        metricKey: "comments",
        value: {
          id: comment.id,
          body: comment.body,
          issueIdentifier: comment.issueIdentifier,
        },
        timestamp: comment.createdAt,
        metadata: {
          commentId: comment.id,
          issueId: comment.issueId,
        },
      });
    }

    // Add daily activity summaries
    for (const [dateStr, daily] of Object.entries(activity.dailyActivity)) {
      if (daily.issuesCreated > 0 || daily.issuesCompleted > 0 || daily.comments > 0) {
        dataPoints.push({
          metricKey: "daily_activity",
          value: {
            issuesCreated: daily.issuesCreated,
            issuesCompleted: daily.issuesCompleted,
            comments: daily.comments,
          },
          timestamp: new Date(`${dateStr}T12:00:00Z`),
          metadata: { date: dateStr },
        });
      }
    }

    // Add cycle progress
    for (const cycle of activity.cycles) {
      dataPoints.push({
        metricKey: "cycle_progress",
        value: {
          id: cycle.id,
          name: cycle.name,
          number: cycle.number,
          completedIssues: cycle.completedIssueCount,
          totalIssues: cycle.totalIssueCount,
          progress: cycle.progress,
          startsAt: cycle.startsAt.toISOString(),
          endsAt: cycle.endsAt.toISOString(),
        },
        timestamp: endDate,
        metadata: {
          cycleId: cycle.id,
          teamId: cycle.teamId,
        },
      });
    }

    console.log(
      `[LinearPlugin] Fetched ${activity.totalIssuesCreated} created, ${activity.totalIssuesCompleted} completed, ${activity.totalComments} comments`
    );

    return {
      dataPoints,
      newState: {
        lastSyncDate: endDate.toISOString(),
        lastIssuesCreated: activity.totalIssuesCreated,
        lastIssuesCompleted: activity.totalIssuesCompleted,
      },
      deduplicationKey: (point) => {
        if (point.metricKey === "issues_created" || point.metricKey === "issues_completed") {
          return `${point.metricKey}-${(point.metadata as any)?.issueId}`;
        }
        if (point.metricKey === "comments") {
          return `comment-${(point.metadata as any)?.commentId}`;
        }
        if (point.metricKey === "daily_activity") {
          return `daily-${(point.metadata as any)?.date}`;
        }
        if (point.metricKey === "cycle_progress") {
          return `cycle-${(point.metadata as any)?.cycleId}-${format(point.timestamp, "yyyy-MM-dd")}`;
        }
        return `${point.metricKey}-${point.timestamp.toISOString()}`;
      },
    };
  }

  // OAuth methods
  getOAuthUrl(_config: LinearConfig, state: string, redirectUri: string): string {
    const clientId = process.env.LINEAR_CLIENT_ID;
    if (!clientId) {
      throw new Error("LINEAR_CLIENT_ID not configured");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "read",
      state,
    });

    return `https://linear.app/oauth/authorize?${params.toString()}`;
  }

  async handleOAuthCallback(
    code: string,
    _state: string,
    redirectUri: string
  ): Promise<OAuthCredential> {
    const clientId = process.env.LINEAR_CLIENT_ID;
    const clientSecret = process.env.LINEAR_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Linear OAuth credentials not configured");
    }

    const response = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Linear OAuth error: ${error}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      tokenData: {
        scope: data.scope,
        token_type: data.token_type,
      },
    };
  }
}
