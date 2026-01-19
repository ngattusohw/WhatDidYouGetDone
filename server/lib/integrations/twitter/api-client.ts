import {
  Tweet,
  TwitterMention,
  TwitterActivitySummary,
} from "./config";
import { format, eachDayOfInterval } from "date-fns";

const TWITTER_API_URL = "https://api.twitter.com/2";

export class TwitterApiClient {
  private accessToken: string;

  constructor(accessToken: string) {
    if (!accessToken) {
      throw new Error("Twitter API access token is required");
    }
    this.accessToken = accessToken;
  }

  /**
   * Make a request to Twitter API v2
   */
  private async request<T>(
    endpoint: string,
    params?: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${TWITTER_API_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitter API error: ${response.status} - ${error}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Get the authenticated user's info
   */
  async getAuthenticatedUser(): Promise<{
    id: string;
    username: string;
    name: string;
    followerCount: number;
    followingCount: number;
  }> {
    const data = await this.request<{
      data: {
        id: string;
        username: string;
        name: string;
        public_metrics: {
          followers_count: number;
          following_count: number;
        };
      };
    }>("/users/me", {
      "user.fields": "public_metrics",
    });

    return {
      id: data.data.id,
      username: data.data.username,
      name: data.data.name,
      followerCount: data.data.public_metrics.followers_count,
      followingCount: data.data.public_metrics.following_count,
    };
  }

  /**
   * Validate the token
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.getAuthenticatedUser();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get activity summary for a date range
   */
  async getActivitySummary(
    startDate: Date,
    endDate: Date,
    options: {
      trackEngagement?: boolean;
      trackMentions?: boolean;
      includeRetweets?: boolean;
    } = {}
  ): Promise<TwitterActivitySummary> {
    const user = await this.getAuthenticatedUser();

    const summary: TwitterActivitySummary = {
      tweets: [],
      mentions: [],
      dailyActivity: {},
      totalTweets: 0,
      totalLikes: 0,
      totalRetweets: 0,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
    };

    // Initialize daily activity
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd");
      summary.dailyActivity[dateStr] = {
        date: dateStr,
        tweets: 0,
        totalLikes: 0,
        totalRetweets: 0,
        totalReplies: 0,
      };
    }

    // Fetch user's tweets
    await this.fetchUserTweets(user.id, startDate, endDate, summary, options);

    // Optionally fetch mentions
    if (options.trackMentions) {
      await this.fetchMentions(user.id, startDate, endDate, summary);
    }

    // Calculate totals
    summary.totalTweets = summary.tweets.length;
    summary.totalLikes = summary.tweets.reduce((sum, t) => sum + t.metrics.likes, 0);
    summary.totalRetweets = summary.tweets.reduce((sum, t) => sum + t.metrics.retweets, 0);

    return summary;
  }

  /**
   * Fetch user's tweets in date range
   */
  private async fetchUserTweets(
    userId: string,
    startDate: Date,
    endDate: Date,
    summary: TwitterActivitySummary,
    options: { includeRetweets?: boolean }
  ): Promise<void> {
    try {
      const params: Record<string, string> = {
        "tweet.fields": "created_at,public_metrics,referenced_tweets",
        max_results: "100",
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      };

      // Exclude retweets unless specifically included
      if (!options.includeRetweets) {
        params.exclude = "retweets";
      }

      const data = await this.request<{
        data?: Array<{
          id: string;
          text: string;
          created_at: string;
          public_metrics: {
            like_count: number;
            retweet_count: number;
            reply_count: number;
            impression_count?: number;
          };
          referenced_tweets?: Array<{ type: string; id: string }>;
        }>;
        meta?: { result_count: number };
      }>(`/users/${userId}/tweets`, params);

      if (!data.data) {
        return;
      }

      for (const tweet of data.data) {
        const isRetweet = tweet.referenced_tweets?.some((r) => r.type === "retweeted") || false;
        const isReply = tweet.referenced_tweets?.some((r) => r.type === "replied_to") || false;

        const tweetData: Tweet = {
          id: tweet.id,
          text: tweet.text,
          createdAt: new Date(tweet.created_at),
          isRetweet,
          isReply,
          metrics: {
            likes: tweet.public_metrics.like_count,
            retweets: tweet.public_metrics.retweet_count,
            replies: tweet.public_metrics.reply_count,
            impressions: tweet.public_metrics.impression_count,
          },
          url: `https://twitter.com/i/web/status/${tweet.id}`,
        };

        summary.tweets.push(tweetData);

        // Update daily activity
        const dateStr = format(new Date(tweet.created_at), "yyyy-MM-dd");
        if (summary.dailyActivity[dateStr]) {
          summary.dailyActivity[dateStr].tweets++;
          summary.dailyActivity[dateStr].totalLikes += tweetData.metrics.likes;
          summary.dailyActivity[dateStr].totalRetweets += tweetData.metrics.retweets;
          summary.dailyActivity[dateStr].totalReplies += tweetData.metrics.replies;
        }
      }
    } catch (error) {
      console.error("[Twitter] Error fetching tweets:", error);
    }
  }

  /**
   * Fetch mentions of the user
   */
  private async fetchMentions(
    userId: string,
    startDate: Date,
    endDate: Date,
    summary: TwitterActivitySummary
  ): Promise<void> {
    try {
      const params: Record<string, string> = {
        "tweet.fields": "created_at,author_id",
        "expansions": "author_id",
        "user.fields": "username",
        max_results: "100",
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      };

      const data = await this.request<{
        data?: Array<{
          id: string;
          text: string;
          created_at: string;
          author_id: string;
        }>;
        includes?: {
          users?: Array<{
            id: string;
            username: string;
          }>;
        };
      }>(`/users/${userId}/mentions`, params);

      if (!data.data) {
        return;
      }

      const userMap = new Map<string, string>();
      if (data.includes?.users) {
        for (const user of data.includes.users) {
          userMap.set(user.id, user.username);
        }
      }

      for (const mention of data.data) {
        const mentionData: TwitterMention = {
          id: mention.id,
          text: mention.text,
          authorId: mention.author_id,
          authorUsername: userMap.get(mention.author_id) || "unknown",
          createdAt: new Date(mention.created_at),
        };

        summary.mentions.push(mentionData);
      }
    } catch (error) {
      console.error("[Twitter] Error fetching mentions:", error);
    }
  }
}
