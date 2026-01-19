import {
  LinearIssue,
  LinearComment,
  LinearCycle,
  LinearActivitySummary,
} from "./config";
import { format, eachDayOfInterval } from "date-fns";

const LINEAR_API_URL = "https://api.linear.app/graphql";

export class LinearApiClient {
  private accessToken: string;

  constructor(accessToken: string) {
    if (!accessToken) {
      throw new Error("Linear API access token is required");
    }
    this.accessToken = accessToken;
  }

  /**
   * Make a GraphQL request to Linear API
   */
  private async graphql<T>(query: string, variables?: Record<string, any>): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Linear API error: ${response.status} - ${error}`);
    }

    const json = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (json.errors) {
      throw new Error(`Linear GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    return json.data as T;
  }

  /**
   * Get the authenticated user's ID
   */
  async getAuthenticatedUser(): Promise<{ id: string; name: string; email: string }> {
    const query = `
      query {
        viewer {
          id
          name
          email
        }
      }
    `;

    const data = await this.graphql<{ viewer: { id: string; name: string; email: string } }>(query);
    return data.viewer;
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
      trackComments?: boolean;
      trackCycles?: boolean;
      teamIds?: string[];
    } = {}
  ): Promise<LinearActivitySummary> {
    const user = await this.getAuthenticatedUser();

    const summary: LinearActivitySummary = {
      issuesCreated: [],
      issuesCompleted: [],
      comments: [],
      cycles: [],
      dailyActivity: {},
      totalIssuesCreated: 0,
      totalIssuesCompleted: 0,
      totalComments: 0,
    };

    // Initialize daily activity
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd");
      summary.dailyActivity[dateStr] = {
        date: dateStr,
        issuesCreated: 0,
        issuesCompleted: 0,
        comments: 0,
      };
    }

    // Fetch issues created by user in date range
    await this.fetchCreatedIssues(user.id, startDate, endDate, summary, options.teamIds);

    // Fetch issues completed by user in date range
    await this.fetchCompletedIssues(user.id, startDate, endDate, summary, options.teamIds);

    // Optionally fetch comments
    if (options.trackComments) {
      await this.fetchComments(user.id, startDate, endDate, summary);
    }

    // Optionally fetch active cycles
    if (options.trackCycles) {
      await this.fetchActiveCycles(summary, options.teamIds);
    }

    // Calculate totals
    summary.totalIssuesCreated = summary.issuesCreated.length;
    summary.totalIssuesCompleted = summary.issuesCompleted.length;
    summary.totalComments = summary.comments.length;

    return summary;
  }

  /**
   * Fetch issues created by user in date range
   */
  private async fetchCreatedIssues(
    userId: string,
    startDate: Date,
    endDate: Date,
    summary: LinearActivitySummary,
    teamIds?: string[]
  ): Promise<void> {
    const query = `
      query CreatedIssues($filter: IssueFilter, $first: Int) {
        issues(filter: $filter, first: $first) {
          nodes {
            id
            identifier
            title
            state {
              name
            }
            priority
            priorityLabel
            team {
              id
              name
            }
            project {
              id
              name
            }
            labels {
              nodes {
                name
              }
            }
            estimate
            createdAt
            completedAt
            url
          }
        }
      }
    `;

    const filter: any = {
      creator: { id: { eq: userId } },
      createdAt: {
        gte: startDate.toISOString(),
        lte: endDate.toISOString(),
      },
    };

    if (teamIds && teamIds.length > 0) {
      filter.team = { id: { in: teamIds } };
    }

    const data = await this.graphql<{ issues: { nodes: any[] } }>(query, {
      filter,
      first: 100,
    });

    for (const issue of data.issues.nodes) {
      const issueData: LinearIssue = {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        state: issue.state.name,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel || "No priority",
        teamId: issue.team.id,
        teamName: issue.team.name,
        projectId: issue.project?.id,
        projectName: issue.project?.name,
        labels: issue.labels?.nodes?.map((l: any) => l.name) || [],
        estimate: issue.estimate,
        createdAt: new Date(issue.createdAt),
        completedAt: issue.completedAt ? new Date(issue.completedAt) : undefined,
        url: issue.url,
      };

      summary.issuesCreated.push(issueData);

      // Update daily activity
      const dateStr = format(new Date(issue.createdAt), "yyyy-MM-dd");
      if (summary.dailyActivity[dateStr]) {
        summary.dailyActivity[dateStr].issuesCreated++;
      }
    }
  }

  /**
   * Fetch issues completed by user in date range
   */
  private async fetchCompletedIssues(
    userId: string,
    startDate: Date,
    endDate: Date,
    summary: LinearActivitySummary,
    teamIds?: string[]
  ): Promise<void> {
    const query = `
      query CompletedIssues($filter: IssueFilter, $first: Int) {
        issues(filter: $filter, first: $first) {
          nodes {
            id
            identifier
            title
            state {
              name
            }
            priority
            priorityLabel
            team {
              id
              name
            }
            project {
              id
              name
            }
            labels {
              nodes {
                name
              }
            }
            estimate
            createdAt
            completedAt
            url
          }
        }
      }
    `;

    const filter: any = {
      assignee: { id: { eq: userId } },
      completedAt: {
        gte: startDate.toISOString(),
        lte: endDate.toISOString(),
      },
    };

    if (teamIds && teamIds.length > 0) {
      filter.team = { id: { in: teamIds } };
    }

    const data = await this.graphql<{ issues: { nodes: any[] } }>(query, {
      filter,
      first: 100,
    });

    for (const issue of data.issues.nodes) {
      const issueData: LinearIssue = {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        state: issue.state.name,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel || "No priority",
        teamId: issue.team.id,
        teamName: issue.team.name,
        projectId: issue.project?.id,
        projectName: issue.project?.name,
        labels: issue.labels?.nodes?.map((l: any) => l.name) || [],
        estimate: issue.estimate,
        createdAt: new Date(issue.createdAt),
        completedAt: issue.completedAt ? new Date(issue.completedAt) : undefined,
        url: issue.url,
      };

      summary.issuesCompleted.push(issueData);

      // Update daily activity
      if (issue.completedAt) {
        const dateStr = format(new Date(issue.completedAt), "yyyy-MM-dd");
        if (summary.dailyActivity[dateStr]) {
          summary.dailyActivity[dateStr].issuesCompleted++;
        }
      }
    }
  }

  /**
   * Fetch comments made by user in date range
   */
  private async fetchComments(
    userId: string,
    startDate: Date,
    endDate: Date,
    summary: LinearActivitySummary
  ): Promise<void> {
    const query = `
      query Comments($filter: CommentFilter, $first: Int) {
        comments(filter: $filter, first: $first) {
          nodes {
            id
            body
            issue {
              id
              identifier
            }
            createdAt
          }
        }
      }
    `;

    const filter = {
      user: { id: { eq: userId } },
      createdAt: {
        gte: startDate.toISOString(),
        lte: endDate.toISOString(),
      },
    };

    const data = await this.graphql<{ comments: { nodes: any[] } }>(query, {
      filter,
      first: 100,
    });

    for (const comment of data.comments.nodes) {
      const commentData: LinearComment = {
        id: comment.id,
        body: comment.body.substring(0, 500), // Truncate long comments
        issueId: comment.issue.id,
        issueIdentifier: comment.issue.identifier,
        createdAt: new Date(comment.createdAt),
      };

      summary.comments.push(commentData);

      // Update daily activity
      const dateStr = format(new Date(comment.createdAt), "yyyy-MM-dd");
      if (summary.dailyActivity[dateStr]) {
        summary.dailyActivity[dateStr].comments++;
      }
    }
  }

  /**
   * Fetch active cycles
   */
  private async fetchActiveCycles(
    summary: LinearActivitySummary,
    teamIds?: string[]
  ): Promise<void> {
    const query = `
      query ActiveCycles {
        cycles(filter: { isActive: { eq: true } }, first: 10) {
          nodes {
            id
            name
            number
            team {
              id
            }
            startsAt
            endsAt
            completedIssueCountAtScope
            issueCountAtScope
            progress
          }
        }
      }
    `;

    const data = await this.graphql<{ cycles: { nodes: any[] } }>(query);

    for (const cycle of data.cycles.nodes) {
      // Filter by team if specified
      if (teamIds && teamIds.length > 0 && !teamIds.includes(cycle.team.id)) {
        continue;
      }

      const cycleData: LinearCycle = {
        id: cycle.id,
        name: cycle.name || `Cycle ${cycle.number}`,
        number: cycle.number,
        teamId: cycle.team.id,
        startsAt: new Date(cycle.startsAt),
        endsAt: new Date(cycle.endsAt),
        completedIssueCount: cycle.completedIssueCountAtScope,
        totalIssueCount: cycle.issueCountAtScope,
        progress: cycle.progress,
      };

      summary.cycles.push(cycleData);
    }
  }
}
