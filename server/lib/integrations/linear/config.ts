import { z } from "zod";
import { MetricDefinition } from "../types";

// ============================================
// Configuration Schema
// ============================================

export const linearConfigSchema = z.object({
  // Track specific teams (empty = all teams user has access to)
  teamIds: z.array(z.string()).default([]),
  // Track issues
  trackIssues: z.boolean().default(true),
  // Track comments
  trackComments: z.boolean().default(false),
  // Track cycle progress
  trackCycles: z.boolean().default(true),
});

export type LinearConfig = z.infer<typeof linearConfigSchema>;

// ============================================
// Metric Definitions
// ============================================

export const linearMetrics: MetricDefinition[] = [
  {
    key: "issues_created",
    name: "Issues Created",
    type: "object",
    description: "Issues created by the user",
  },
  {
    key: "issues_completed",
    name: "Issues Completed",
    type: "object",
    description: "Issues marked as done by the user",
  },
  {
    key: "issues_in_progress",
    name: "Issues In Progress",
    type: "number",
    description: "Issues currently being worked on",
  },
  {
    key: "comments",
    name: "Comments",
    type: "object",
    description: "Comments made on issues",
  },
  {
    key: "daily_activity",
    name: "Daily Activity",
    type: "object",
    description: "Daily activity summary",
  },
  {
    key: "cycle_progress",
    name: "Cycle Progress",
    type: "object",
    description: "Current cycle completion status",
  },
];

// ============================================
// Types
// ============================================

export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "ENG-123"
  title: string;
  state: string;
  priority: number;
  priorityLabel: string;
  teamId: string;
  teamName: string;
  projectId?: string;
  projectName?: string;
  initiativeId?: string;
  initiativeName?: string;
  labels: string[];
  estimate?: number;
  createdAt: Date;
  completedAt?: Date;
  url: string;
}

export interface LinearComment {
  id: string;
  body: string;
  issueId: string;
  issueIdentifier: string;
  createdAt: Date;
}

export interface LinearCycle {
  id: string;
  name: string;
  number: number;
  teamId: string;
  startsAt: Date;
  endsAt: Date;
  completedIssueCount: number;
  totalIssueCount: number;
  progress: number;
}

export interface LinearDailyActivity {
  date: string;
  issuesCreated: number;
  issuesCompleted: number;
  comments: number;
}

export interface LinearActivitySummary {
  issuesCreated: LinearIssue[];
  issuesCompleted: LinearIssue[];
  comments: LinearComment[];
  cycles: LinearCycle[];
  dailyActivity: Record<string, LinearDailyActivity>;
  totalIssuesCreated: number;
  totalIssuesCompleted: number;
  totalComments: number;
}
