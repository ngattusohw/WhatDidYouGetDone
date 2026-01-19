import {
  IntegrationPlugin,
  FetchResult,
  FetchContext,
  OAuthCredential,
  ScheduleConfig,
  MetricDataPoint,
  BackfillConfig,
} from "../types";
import { TwitterConfig, twitterConfigSchema, twitterMetrics } from "./config";
import { TwitterApiClient } from "./api-client";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

export class TwitterPlugin implements IntegrationPlugin<TwitterConfig> {
  slug = "twitter";
  name = "Twitter/X";
  description = "Track tweets, engagement, and social media activity";
  category = "SOCIAL" as const;
  icon = "twitter";

  requiresOAuth = true;
  oauthProvider = "twitter";
  supportsBackfill = true;

  configSchema = twitterConfigSchema;
  metricSchema = twitterMetrics;

  getScheduleConfig(): ScheduleConfig {
    return {
      type: "interval",
      interval: 3600, // Fetch every hour
    };
  }

  getScheduleConstraints() {
    return {
      minFrequencySeconds: 900, // Minimum 15 minutes (Twitter rate limits)
      maxFrequencySeconds: 86400,
      defaultFrequencySeconds: 3600,
      allowCron: true,
    };
  }

  getBackfillConfig(): BackfillConfig {
    return {
      daysBack: 7, // Twitter API limits historical access
      chunkSizeDays: 1,
    };
  }

  async validateConfig(config: TwitterConfig): Promise<boolean> {
    const result = twitterConfigSchema.safeParse(config);
    return result.success;
  }

  async fetchData(
    config: TwitterConfig,
    credentials?: OAuthCredential,
    context?: FetchContext,
    _integrationId?: string
  ): Promise<FetchResult> {
    if (!credentials?.accessToken) {
      throw new Error("Twitter access token is required");
    }

    const client = new TwitterApiClient(credentials.accessToken);

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
      `[TwitterPlugin] Fetching data from ${format(startDate, "yyyy-MM-dd")} to ${format(
        endDate,
        "yyyy-MM-dd"
      )}`
    );

    // Fetch activity
    const activity = await client.getActivitySummary(startDate, endDate, {
      trackEngagement: config.trackEngagement,
      trackMentions: config.trackMentions,
      includeRetweets: config.includeRetweets,
    });

    const dataPoints: MetricDataPoint[] = [];

    // Convert tweets to data points
    for (const tweet of activity.tweets) {
      dataPoints.push({
        metricKey: "tweets",
        value: {
          id: tweet.id,
          text: tweet.text.substring(0, 280),
          isRetweet: tweet.isRetweet,
          isReply: tweet.isReply,
          url: tweet.url,
        },
        timestamp: tweet.createdAt,
        metadata: {
          tweetId: tweet.id,
          likes: tweet.metrics.likes,
          retweets: tweet.metrics.retweets,
          replies: tweet.metrics.replies,
        },
      });

      // Add engagement data point for each tweet
      if (config.trackEngagement) {
        dataPoints.push({
          metricKey: "engagement",
          value: {
            tweetId: tweet.id,
            likes: tweet.metrics.likes,
            retweets: tweet.metrics.retweets,
            replies: tweet.metrics.replies,
            impressions: tweet.metrics.impressions,
          },
          timestamp: tweet.createdAt,
          metadata: {
            tweetId: tweet.id,
          },
        });
      }
    }

    // Add daily tweet counts
    for (const [dateStr, daily] of Object.entries(activity.dailyActivity)) {
      if (daily.tweets > 0) {
        dataPoints.push({
          metricKey: "daily_tweets",
          value: daily.tweets,
          timestamp: new Date(`${dateStr}T12:00:00Z`),
          metadata: {
            date: dateStr,
            totalLikes: daily.totalLikes,
            totalRetweets: daily.totalRetweets,
            totalReplies: daily.totalReplies,
          },
        });
      }
    }

    // Convert mentions to data points
    for (const mention of activity.mentions) {
      dataPoints.push({
        metricKey: "mentions",
        value: {
          id: mention.id,
          text: mention.text.substring(0, 280),
          authorUsername: mention.authorUsername,
        },
        timestamp: mention.createdAt,
        metadata: {
          mentionId: mention.id,
          authorId: mention.authorId,
        },
      });
    }

    // Add follower count snapshot
    if (activity.followerCount !== undefined) {
      dataPoints.push({
        metricKey: "follower_count",
        value: activity.followerCount,
        timestamp: endDate,
        metadata: {
          followingCount: activity.followingCount,
        },
      });
    }

    console.log(
      `[TwitterPlugin] Fetched ${activity.totalTweets} tweets, ${activity.totalLikes} total likes, ${activity.mentions.length} mentions`
    );

    return {
      dataPoints,
      newState: {
        lastSyncDate: endDate.toISOString(),
        lastTweetCount: activity.totalTweets,
        lastFollowerCount: activity.followerCount,
      },
      deduplicationKey: (point) => {
        if (point.metricKey === "tweets") {
          return `tweet-${(point.metadata as any)?.tweetId}`;
        }
        if (point.metricKey === "engagement") {
          return `engagement-${(point.metadata as any)?.tweetId}-${format(
            point.timestamp,
            "yyyy-MM-dd"
          )}`;
        }
        if (point.metricKey === "mentions") {
          return `mention-${(point.metadata as any)?.mentionId}`;
        }
        if (point.metricKey === "daily_tweets") {
          return `daily-${(point.metadata as any)?.date}`;
        }
        if (point.metricKey === "follower_count") {
          return `followers-${format(point.timestamp, "yyyy-MM-dd")}`;
        }
        return `${point.metricKey}-${point.timestamp.toISOString()}`;
      },
    };
  }

  // OAuth 2.0 methods for Twitter
  getOAuthUrl(_config: TwitterConfig, state: string, redirectUri: string): string {
    const clientId = process.env.TWITTER_CLIENT_ID;
    if (!clientId) {
      throw new Error("TWITTER_CLIENT_ID not configured");
    }

    // Twitter OAuth 2.0 with PKCE
    // Note: In production, you'd generate and store a code_verifier
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "tweet.read users.read offline.access",
      state,
      code_challenge: "challenge", // In production, use proper PKCE
      code_challenge_method: "plain",
    });

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  async handleOAuthCallback(
    code: string,
    _state: string,
    redirectUri: string
  ): Promise<OAuthCredential> {
    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Twitter OAuth credentials not configured");
    }

    // Basic auth header for token exchange
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: "challenge", // Must match code_challenge
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitter OAuth error: ${error}`);
    }

    interface TwitterTokenResponse {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    }

    const data = (await response.json()) as TwitterTokenResponse;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      tokenData: {
        scope: data.scope,
        token_type: data.token_type,
      },
    };
  }

  async refreshToken(credential: OAuthCredential): Promise<OAuthCredential> {
    if (!credential.refreshToken) {
      throw new Error("No refresh token available");
    }

    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Twitter OAuth credentials not configured");
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credential.refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitter token refresh error: ${error}`);
    }

    interface TwitterTokenResponse {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    }

    const data = (await response.json()) as TwitterTokenResponse;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      tokenData: {
        scope: data.scope,
        token_type: data.token_type,
      },
    };
  }
}
