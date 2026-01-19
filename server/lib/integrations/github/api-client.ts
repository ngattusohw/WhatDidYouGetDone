import { Octokit } from "@octokit/rest";
import {
  GitHubCommit,
  GitHubPullRequest,
  GitHubIssue,
  GitHubActivitySummary,
} from "./config";
import { format, eachDayOfInterval } from "date-fns";

export class GitHubApiClient {
  private octokit: Octokit;
  private username: string | null = null;

  constructor(token: string) {
    if (!token) {
      throw new Error("GitHub API token is required");
    }
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Get the authenticated user's username
   */
  async getAuthenticatedUser(): Promise<string> {
    if (this.username) {
      return this.username;
    }

    const { data } = await this.octokit.rest.users.getAuthenticated();
    this.username = data.login;
    return this.username;
  }

  /**
   * Validate the token by making a test API call
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.octokit.rest.users.getAuthenticated();
      return true;
    } catch (error) {
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
      trackPullRequests?: boolean;
      trackIssues?: boolean;
      repositories?: string[];
    } = {}
  ): Promise<GitHubActivitySummary> {
    const username = await this.getAuthenticatedUser();

    const summary: GitHubActivitySummary = {
      commits: [],
      pullRequests: [],
      issues: [],
      dailyActivity: {},
      repositoriesActive: [],
      totalCommits: 0,
      totalPRs: 0,
      totalIssues: 0,
    };

    // Initialize daily activity for all days in range
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd");
      summary.dailyActivity[dateStr] = {
        date: dateStr,
        commits: 0,
        pullRequests: 0,
        issues: 0,
      };
    }

    // Fetch commits via search API
    await this.fetchCommitsFromSearch(username, startDate, endDate, summary);

    // Optionally fetch PRs
    if (options.trackPullRequests) {
      await this.fetchPullRequests(username, startDate, endDate, summary);
    }

    // Optionally fetch issues
    if (options.trackIssues) {
      await this.fetchIssues(username, startDate, endDate, summary);
    }

    // Calculate totals
    summary.totalCommits = summary.commits.length;
    summary.totalPRs = summary.pullRequests.length;
    summary.totalIssues = summary.issues.length;
    summary.repositoriesActive = [...new Set(summary.commits.map((c) => c.repo))];

    return summary;
  }

  /**
   * Fetch commits using both Search API and direct repo queries for private/org repos
   */
  private async fetchCommitsFromSearch(
    username: string,
    startDate: Date,
    endDate: Date,
    summary: GitHubActivitySummary
  ): Promise<void> {
    const seenShas = new Set<string>();

    // First, try the search API (works for public repos and some private)
    try {
      console.log(`[GitHub] Fetching commits via search for user: ${username}`);
      const dateRange = `${format(startDate, "yyyy-MM-dd")}..${format(endDate, "yyyy-MM-dd")}`;
      const query = `author:${username} committer-date:${dateRange}`;

      const { data } = await this.octokit.rest.search.commits({
        q: query,
        sort: "committer-date",
        order: "desc",
        per_page: 100,
      });

      console.log(`[GitHub] Search found ${data.total_count} commits`);

      for (const item of data.items) {
        if (seenShas.has(item.sha)) continue;
        seenShas.add(item.sha);

        const repoName = item.repository.full_name;
        const commitDate = new Date(item.commit.committer?.date || item.commit.author?.date || "");

        summary.commits.push({
          sha: item.sha,
          message: item.commit.message.split("\n")[0],
          timestamp: commitDate,
          repo: repoName,
          url: item.html_url,
        });

        const dateStr = format(commitDate, "yyyy-MM-dd");
        if (summary.dailyActivity[dateStr]) {
          summary.dailyActivity[dateStr].commits++;
        }
      }
    } catch (error: any) {
      console.error("[GitHub] Search API error:", error.message);
    }

    // Then, fetch from repos the user has push access to (includes org repos)
    await this.fetchCommitsFromRepos(username, startDate, endDate, summary, seenShas);
  }

  /**
   * Fetch commits directly from repos the user has access to (catches private org repos)
   */
  private async fetchCommitsFromRepos(
    username: string,
    startDate: Date,
    endDate: Date,
    summary: GitHubActivitySummary,
    seenShas: Set<string>
  ): Promise<void> {
    try {
      // Get repos the user has pushed to recently - fetch more to ensure org repos are included
      const { data: repos } = await this.octokit.rest.repos.listForAuthenticatedUser({
        sort: "pushed",
        per_page: 100, // Increased to catch more repos including org repos
        affiliation: "owner,collaborator,organization_member",
      });

      // Log breakdown by owner type
      const orgRepos = repos.filter(r => r.owner.type === "Organization");
      const userRepos = repos.filter(r => r.owner.type === "User");
      console.log(`[GitHub] Found ${repos.length} repos (${orgRepos.length} org, ${userRepos.length} personal)`);

      let reposChecked = 0;
      let commitsFound = 0;
      let reposSkipped = 0;

      for (const repo of repos) {
        // Skip repos not pushed to in our date range (with some buffer)
        const pushedAt = repo.pushed_at ? new Date(repo.pushed_at) : null;
        // Use 7-day buffer to catch edge cases
        const bufferDate = new Date(startDate);
        bufferDate.setDate(bufferDate.getDate() - 7);

        if (pushedAt && pushedAt < bufferDate) {
          reposSkipped++;
          continue;
        }

        try {
          const { data: commits } = await this.octokit.rest.repos.listCommits({
            owner: repo.owner.login,
            repo: repo.name,
            author: username,
            since: startDate.toISOString(),
            until: endDate.toISOString(),
            per_page: 100,
          });

          reposChecked++;
          const isOrgRepo = repo.owner.type === "Organization";

          for (const commit of commits) {
            if (seenShas.has(commit.sha)) continue;
            seenShas.add(commit.sha);

            const commitDate = new Date(
              commit.commit.committer?.date || commit.commit.author?.date || ""
            );

            summary.commits.push({
              sha: commit.sha,
              message: commit.commit.message.split("\n")[0],
              timestamp: commitDate,
              repo: repo.full_name,
              url: commit.html_url,
            });

            const dateStr = format(commitDate, "yyyy-MM-dd");
            if (summary.dailyActivity[dateStr]) {
              summary.dailyActivity[dateStr].commits++;
            }

            commitsFound++;
            if (isOrgRepo) {
              console.log(`[GitHub] Found org commit in ${repo.full_name}: ${commit.sha.substring(0, 7)}`);
            }
          }
        } catch (repoError: any) {
          // Skip repos we can't access
          if (repoError.status !== 404 && repoError.status !== 409) {
            console.warn(`[GitHub] Error fetching commits from ${repo.full_name}:`, repoError.message);
          }
        }
      }

      console.log(`[GitHub] Checked ${reposChecked} repos (skipped ${reposSkipped}), found ${commitsFound} additional commits`);
    } catch (error: any) {
      console.error("[GitHub] Error listing repos:", error.message);
    }
  }

  /**
   * Fetch pull requests created/merged by the user
   */
  private async fetchPullRequests(
    username: string,
    startDate: Date,
    endDate: Date,
    summary: GitHubActivitySummary
  ): Promise<void> {
    try {
      // Search for PRs authored by user in date range
      const query = `author:${username} created:${format(startDate, "yyyy-MM-dd")}..${format(
        endDate,
        "yyyy-MM-dd"
      )}`;

      const { data } = await this.octokit.search.issuesAndPullRequests({
        q: `${query} is:pr`,
        sort: "created",
        order: "desc",
        per_page: 100,
      });

      for (const pr of data.items) {
        const repoMatch = pr.repository_url.match(/repos\/(.+)$/);
        const repoName = repoMatch ? repoMatch[1] : "unknown";

        const prData: GitHubPullRequest = {
          number: pr.number,
          title: pr.title,
          state: pr.pull_request?.merged_at
            ? "merged"
            : (pr.state as "open" | "closed"),
          repo: repoName,
          createdAt: new Date(pr.created_at),
          mergedAt: pr.pull_request?.merged_at
            ? new Date(pr.pull_request.merged_at)
            : undefined,
          url: pr.html_url,
        };

        summary.pullRequests.push(prData);

        // Update daily activity
        const dateStr = format(new Date(pr.created_at), "yyyy-MM-dd");
        if (summary.dailyActivity[dateStr]) {
          summary.dailyActivity[dateStr].pullRequests++;
        }
      }
    } catch (error) {
      console.error("[GitHub] Error fetching pull requests:", error);
    }
  }

  /**
   * Fetch issues created by the user
   */
  private async fetchIssues(
    username: string,
    startDate: Date,
    endDate: Date,
    summary: GitHubActivitySummary
  ): Promise<void> {
    try {
      const query = `author:${username} created:${format(startDate, "yyyy-MM-dd")}..${format(
        endDate,
        "yyyy-MM-dd"
      )}`;

      const { data } = await this.octokit.search.issuesAndPullRequests({
        q: `${query} is:issue`,
        sort: "created",
        order: "desc",
        per_page: 100,
      });

      for (const issue of data.items) {
        const repoMatch = issue.repository_url.match(/repos\/(.+)$/);
        const repoName = repoMatch ? repoMatch[1] : "unknown";

        const issueData: GitHubIssue = {
          number: issue.number,
          title: issue.title,
          state: issue.state as "open" | "closed",
          repo: repoName,
          createdAt: new Date(issue.created_at),
          closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
          url: issue.html_url,
        };

        summary.issues.push(issueData);

        // Update daily activity
        const dateStr = format(new Date(issue.created_at), "yyyy-MM-dd");
        if (summary.dailyActivity[dateStr]) {
          summary.dailyActivity[dateStr].issues++;
        }
      }
    } catch (error) {
      console.error("[GitHub] Error fetching issues:", error);
    }
  }
}
