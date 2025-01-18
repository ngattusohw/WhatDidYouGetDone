import { getFunctionsUrl } from './supabase';
import { supabase } from './supabase';

export interface GitHubStats {
  total_commits: number;
  pull_requests: number;
  merged_prs: number;
  daily_commits: Array<{
    date: string;
    commits: number;
  }>;
  repos: Array<{
    name: string;
    description: string;
    commits: number;
    pull_requests: number;
  }>;
}

export interface WeeklyStats {
  stats: GitHubStats;
  summary: string;
  week_start: string;
}

export async function fetchWeeklyStats(weekStart: string): Promise<WeeklyStats> {
  // Get the session
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(getFunctionsUrl('weekly-stats'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Add the Authorization header
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ weekStart }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch weekly stats');
  }

  return response.json();
}