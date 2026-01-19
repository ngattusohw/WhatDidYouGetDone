import { z } from "zod";
import { MetricDefinition } from "../types";

// ============================================
// Configuration Schema
// ============================================

export const twitterConfigSchema = z.object({
  // Track tweets
  trackTweets: z.boolean().default(true),
  // Track engagement metrics (likes, retweets on your tweets)
  trackEngagement: z.boolean().default(true),
  // Track mentions
  trackMentions: z.boolean().default(false),
  // Include retweets in tweet count
  includeRetweets: z.boolean().default(false),
});

export type TwitterConfig = z.infer<typeof twitterConfigSchema>;

// ============================================
// Metric Definitions
// ============================================

export const twitterMetrics: MetricDefinition[] = [
  {
    key: "tweets",
    name: "Tweets",
    type: "object",
    description: "Tweets posted by the user",
  },
  {
    key: "daily_tweets",
    name: "Daily Tweet Count",
    type: "number",
    description: "Number of tweets per day",
  },
  {
    key: "engagement",
    name: "Engagement",
    type: "object",
    description: "Likes, retweets, and replies on tweets",
  },
  {
    key: "mentions",
    name: "Mentions",
    type: "object",
    description: "Times the user was mentioned",
  },
  {
    key: "follower_count",
    name: "Follower Count",
    type: "number",
    description: "Current follower count snapshot",
  },
];

// ============================================
// Types
// ============================================

export interface Tweet {
  id: string;
  text: string;
  createdAt: Date;
  isRetweet: boolean;
  isReply: boolean;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    impressions?: number;
  };
  url: string;
}

export interface TweetEngagement {
  tweetId: string;
  likes: number;
  retweets: number;
  replies: number;
  impressions?: number;
  timestamp: Date;
}

export interface TwitterMention {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  createdAt: Date;
}

export interface DailyTwitterActivity {
  date: string;
  tweets: number;
  totalLikes: number;
  totalRetweets: number;
  totalReplies: number;
}

export interface TwitterActivitySummary {
  tweets: Tweet[];
  mentions: TwitterMention[];
  dailyActivity: Record<string, DailyTwitterActivity>;
  totalTweets: number;
  totalLikes: number;
  totalRetweets: number;
  followerCount?: number;
  followingCount?: number;
}
