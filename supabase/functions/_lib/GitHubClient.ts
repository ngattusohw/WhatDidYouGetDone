import { Octokit } from '@octokit/rest';
import { subDays } from 'date-fns';

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
}
