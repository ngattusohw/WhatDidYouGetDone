import { Octokit } from '@octokit/rest';
import { subDays } from 'date-fns';

interface TimeWindow {
  start: Date;
  end: Date;
}

interface Commit {
  message: string;
  timestamp: Date;
  sha: string;
}

interface DailyCommits {
  date: string; // YYYY-MM-DD format
  count: number;
  commits: Commit[];
}

interface Statistics {
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

interface RepositoryActivity {
  totalCommits: number;
  organization?: string;
  commits: Commit[];
  statistics: Statistics;
}

interface OrganizationActivity {
  totalCommits: number;
  repositories: string[];
  statistics: Statistics;
}

interface GitHubActivity {
  timeWindow: TimeWindow;
  repositories: Record<string, RepositoryActivity>;
  organizations: Record<string, OrganizationActivity>;
  overallStatistics: Statistics;
  overallSummary?: string;
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    if (!token) {
      throw new Error('GitHub API token is required');
    }

    this.octokit = new Octokit({ auth: token });
  }

  async listUserRepositories(username: string, includeAll = false): Promise<string[]> {
    const repos: string[] = [];
    let page = 1;

    while (true) {
      const response = includeAll
        ? await this.octokit.repos.listForAuthenticatedUser({
            affiliation: 'owner,collaborator,organization_member',
            sort: 'updated',
            per_page: 100,
            page,
          })
        : await this.octokit.repos.listForUser({
            username,
            per_page: 100,
            page,
          });

      if (response.data.length === 0) break;
      repos.push(...response.data.map((repo) => repo.full_name));
      page++;
    }

    return repos;
  }

  async listRepositoryCommits(repoFullName: string, since?: string): Promise<any[]> {
    const [owner, repo] = repoFullName.split('/');
    const response = await this.octokit.repos.listCommits({
      owner,
      repo,
      since,
      per_page: 100,
    });
    return response.data;
  }

  async getCommitDiff(repoFullName: string, commitSha: string): Promise<any> {
    try {
      const [owner, repo] = repoFullName.split('/');
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
        owner,
        repo,
        ref: commitSha,
        headers: {
          Accept: 'application/vnd.github.diff',
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to get commit diff: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getPullRequestsForCommit(repoFullName: string, commitSha: string): Promise<any[]> {
    const [owner, repo] = repoFullName.split('/');
    const response = await this.octokit.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: commitSha,
    });
    return response.data;
  }

  async compareCommits(repoFullName: string, base: string, head: string): Promise<any> {
    const [owner, repo] = repoFullName.split('/');
    const response = await this.octokit.repos.compareCommits({
      owner,
      repo,
      base,
      head,
    });
    return response.data;
  }

  async getRecentActivityRepos(username: string, days: number = 3): Promise<string[]> {
    const cutoffDate = subDays(new Date(), days).toISOString();
    const recentRepos = new Set<string>();

    let page = 1;
    const maxPages = 3; // Limit to 3 pages (adjust based on your requirements)

    while (page <= maxPages) {
      const response = await this.octokit.request('GET /users/{username}/events', {
        username,
        per_page: 100,
        page,
      });

      const events: any[] = response.data;
      if (events.length === 0) break; // Stop if no more events are returned

      for (const event of events) {
        if (event.type !== 'PushEvent') continue;

        const eventDate = new Date(event.created_at);
        if (eventDate < new Date(cutoffDate)) continue;
        console.log('Event', event);
        recentRepos.add(event.repo.name);
      }

      page++;
    }

    return Array.from(recentRepos);
  }

  async getActivitySummary(username: string, days: number = 7): Promise<GitHubActivity> {
    const endDate = new Date();
    const startDate = subDays(endDate, days);

    const activity: GitHubActivity = {
      timeWindow: {
        start: startDate,
        end: endDate,
      },
      repositories: {},
      organizations: {},
    };

    try {
      // Use iterator to control pagination
      const iterator = this.octokit.paginate.iterator('GET /users/{username}/events', {
        username,
        per_page: 100,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      // Iterate through pages until we hit our time window
      for await (const { data: events } of iterator) {
        let reachedTimeLimit = false;

        for (const event of events) {
          if (event.type !== 'PushEvent') continue;

          const eventDate = new Date(event.created_at);

          // If we've gone past our time window, we're done
          if (eventDate < startDate) {
            reachedTimeLimit = true;
            break;
          }

          // Skip future events
          if (eventDate > endDate) continue;

          const repoName = event.repo.name;
          const orgName = repoName.split('/')[0];

          // Initialize repository if not exists
          if (!activity.repositories[repoName]) {
            activity.repositories[repoName] = {
              totalCommits: 0,
              organization: orgName !== username ? orgName : undefined,
              commits: [],
            };
          }

          // Process commits in the push event
          const pushEvent = event.payload;
          for (const commit of pushEvent.commits) {
            activity.repositories[repoName].commits.push({
              message: commit.message,
              timestamp: new Date(event.created_at),
              sha: commit.sha,
            });
          }

          activity.repositories[repoName].totalCommits += pushEvent.commits.length;

          // Update organization stats if applicable
          if (orgName !== username) {
            if (!activity.organizations[orgName]) {
              activity.organizations[orgName] = {
                totalCommits: 0,
                repositories: [],
              };
            }

            if (!activity.organizations[orgName].repositories.includes(repoName)) {
              activity.organizations[orgName].repositories.push(repoName);
            }
            activity.organizations[orgName].totalCommits += pushEvent.commits.length;
          }
        }

        // If we've reached our time limit, stop paginating
        if (reachedTimeLimit) {
          console.log('Reached time window limit - stopping pagination');
          break;
        }
      }
    } catch (error) {
      console.error('Error fetching GitHub events:', error);
      if (error.status === 422) {
        console.warn('Hit GitHub pagination limit - returning partial results');
      } else {
        throw error;
      }
    }

    // After processing all events, calculate statistics
    const allCommits: Commit[] = [];

    // Calculate statistics for each repository
    Object.values(activity.repositories).forEach((repo) => {
      repo.statistics = calculateStatistics(
        repo.commits,
        activity.timeWindow.start,
        activity.timeWindow.end
      );
      allCommits.push(...repo.commits);
    });

    // Calculate statistics for each organization
    Object.values(activity.organizations).forEach((org) => {
      const orgCommits = org.repositories.flatMap(
        (repoName) => activity.repositories[repoName]?.commits || []
      );
      org.statistics = calculateStatistics(
        orgCommits,
        activity.timeWindow.start,
        activity.timeWindow.end
      );
    });

    // Calculate overall statistics
    activity.overallStatistics = calculateStatistics(
      allCommits,
      activity.timeWindow.start,
      activity.timeWindow.end
    );

    return activity;
  }
}

function calculateStatistics(commits: Commit[], startDate: Date, endDate: Date): Statistics {
  const dailyCommits: Record<string, DailyCommits> = {};

  // Initialize dailyCommits for all days in the time window
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    dailyCommits[dateStr] = {
      date: dateStr,
      count: 0,
      commits: [],
    };
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Group commits by day
  commits.forEach((commit) => {
    const dateStr = new Date(commit.timestamp).toISOString().split('T')[0];
    if (dailyCommits[dateStr]) {
      dailyCommits[dateStr].count++;
      dailyCommits[dateStr].commits.push(commit);
    }
  });

  // Calculate most and least active days
  const dailyStats = Object.values(dailyCommits);
  const mostActiveDay = dailyStats.reduce(
    (max, day) => (day.count > max.count ? day : max),
    dailyStats[0]
  );
  const leastActiveDay = dailyStats.reduce(
    (min, day) => (day.count < min.count ? day : min),
    dailyStats[0]
  );

  // Calculate average commits per day
  const totalDays = dailyStats.length;
  const totalCommits = commits.length;
  const averageCommitsPerDay = totalDays > 0 ? totalCommits / totalDays : 0;

  return {
    totalCommits,
    dailyCommits,
    averageCommitsPerDay,
    mostActiveDay: {
      date: mostActiveDay.date,
      commits: mostActiveDay.count,
    },
    leastActiveDay: {
      date: leastActiveDay.date,
      commits: leastActiveDay.count,
    },
  };
}
