import { z } from "zod";
import { MetricDefinition } from "../types";

// ============================================
// Configuration Schema
// ============================================

export const githubConfigSchema = z.object({
  // Optional: specific repos to track (empty = all repos)
  repositories: z.array(z.string()).default([]),
  // Include private repos
  includePrivate: z.boolean().default(true),
  // Track PRs (in addition to commits)
  trackPullRequests: z.boolean().default(true),
  // Track issues
  trackIssues: z.boolean().default(true),
});

export type GitHubConfig = z.infer<typeof githubConfigSchema>;

// ============================================
// Metric Definitions
// ============================================

export const githubMetrics: MetricDefinition[] = [
  {
    key: "commits",
    name: "Commits",
    type: "object",
    description: "Commit activity including message, sha, and repo",
  },
  {
    key: "daily_commits",
    name: "Daily Commit Count",
    type: "number",
    description: "Number of commits per day",
  },
  {
    key: "pull_requests",
    name: "Pull Requests",
    type: "object",
    description: "Pull request activity",
  },
  {
    key: "issues",
    name: "Issues",
    type: "object",
    description: "Issue activity",
  },
  {
    key: "repositories_active",
    name: "Active Repositories",
    type: "number",
    description: "Number of repositories with activity",
  },
];

// ============================================
// Types
// ============================================

export interface GitHubCommit {
  sha: string;
  message: string;
  timestamp: Date;
  repo: string;
  url?: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  repo: string;
  createdAt: Date;
  mergedAt?: Date;
  url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  repo: string;
  createdAt: Date;
  closedAt?: Date;
  url: string;
}

export interface DailyActivity {
  date: string; // YYYY-MM-DD
  commits: number;
  pullRequests: number;
  issues: number;
}

export interface GitHubActivitySummary {
  commits: GitHubCommit[];
  pullRequests: GitHubPullRequest[];
  issues: GitHubIssue[];
  dailyActivity: Record<string, DailyActivity>;
  repositoriesActive: string[];
  totalCommits: number;
  totalPRs: number;
  totalIssues: number;
}
