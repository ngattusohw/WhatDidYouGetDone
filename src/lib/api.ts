import { getFunctionsUrl } from './supabase';
import { supabase } from './supabase';

export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface Commit {
  message: string;
  timestamp: Date;
  sha: string;
}

export interface DailyCommits {
  date: string;
  count: number;
  commits: Commit[];
}

export interface Statistics {
  totalCommits: number;
  dailyCommits: Record<string, DailyCommits>;
  averageCommitsPerDay: number;
  mostActiveDay: {
    date: string;
    commits: number;
  };
  leastActiveDay: {
    date: string;
    commits: number;
  };
}

export interface RepositoryActivity {
  totalCommits: number;
  organization?: string;
  commits: Commit[];
  statistics: Statistics;
}

export interface OrganizationActivity {
  totalCommits: number;
  repositories: string[];
  statistics: Statistics;
}

export interface GitHubActivity {
  timeWindow: TimeWindow;
  repositories: Record<string, RepositoryActivity>;
  organizations: Record<string, OrganizationActivity>;
  overallStatistics: Statistics;
  overallSummary?: string;
}

export interface WeeklyStats {
  stats: GitHubActivity;
  summary: any;
  week_start: string;
}

export async function fetchWeeklyStats(
  weekStart: string,
  refreshData: boolean = false
): Promise<WeeklyStats> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(getFunctionsUrl('weekly-stats'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Add the Authorization header
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ weekStart, refreshData }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Create a more descriptive error
    const errorMessage = data.error || 'Failed to fetch weekly stats';
    const error = new Error(errorMessage);
    throw error;
  }

  return data;
}
