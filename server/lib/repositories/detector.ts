import { Octokit } from "@octokit/rest";
import { prisma } from "../prisma";
import { OwnerType, Repository } from "../../../src/generated/prisma";
import { RepoInfo, RepoMetadata, ActivityUpdate } from "./types";

/**
 * Repository Detection Service
 *
 * Handles detection and tracking of repositories from activity data.
 */
export class RepositoryDetector {
  /**
   * Parse a full repository name into its components
   */
  static parseRepoName(fullName: string): RepoInfo | null {
    const parts = fullName.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }

    return {
      fullName,
      owner: parts[0],
      name: parts[1],
    };
  }

  /**
   * Extract repository info from a metric value object
   */
  static detectFromMetricValue(value: unknown): RepoInfo | null {
    if (!value || typeof value !== "object") return null;

    const obj = value as Record<string, unknown>;
    const repoFullName = obj.repo as string;

    if (!repoFullName || typeof repoFullName !== "string") return null;

    return this.parseRepoName(repoFullName);
  }

  /**
   * Track activity for a repository, creating it if it doesn't exist
   */
  static async trackActivity(
    userId: string,
    repoInfo: RepoInfo,
    activity: ActivityUpdate,
    token?: string
  ): Promise<Repository> {
    // Try to find existing repository
    let repository = await prisma.repository.findUnique({
      where: {
        userId_fullName: {
          userId,
          fullName: repoInfo.fullName,
        },
      },
    });

    if (repository) {
      // Update existing repository with new activity
      const updates: Record<string, unknown> = {
        lastActivityAt: activity.timestamp,
      };

      // Update activity counts
      if (activity.type === "commit") {
        updates.totalCommits = { increment: 1 };
      } else if (activity.type === "pr") {
        updates.totalPRs = { increment: 1 };
      } else if (activity.type === "issue") {
        updates.totalIssues = { increment: 1 };
      }

      // Update firstActivityAt if this is earlier
      if (!repository.firstActivityAt || activity.timestamp < repository.firstActivityAt) {
        updates.firstActivityAt = activity.timestamp;
      }

      repository = await prisma.repository.update({
        where: { id: repository.id },
        data: updates,
      });
    } else {
      // Create new repository
      let metadata: Partial<RepoMetadata> = {
        htmlUrl: `https://github.com/${repoInfo.fullName}`,
        ownerType: OwnerType.USER,
      };

      // Try to fetch metadata from GitHub if we have a token
      if (token) {
        try {
          metadata = await this.fetchRepoMetadata(token, repoInfo.fullName);
        } catch (error) {
          console.warn(`[RepoDetector] Failed to fetch metadata for ${repoInfo.fullName}:`, error);
        }
      }

      repository = await prisma.repository.create({
        data: {
          userId,
          fullName: repoInfo.fullName,
          owner: repoInfo.owner,
          name: repoInfo.name,
          ownerType: metadata.ownerType || OwnerType.USER,
          description: metadata.description || null,
          language: metadata.language || null,
          isPrivate: metadata.isPrivate || false,
          htmlUrl: metadata.htmlUrl || `https://github.com/${repoInfo.fullName}`,
          totalCommits: activity.type === "commit" ? 1 : 0,
          totalPRs: activity.type === "pr" ? 1 : 0,
          totalIssues: activity.type === "issue" ? 1 : 0,
          firstActivityAt: activity.timestamp,
          lastActivityAt: activity.timestamp,
        },
      });

      console.log(`[RepoDetector] Created new repository: ${repoInfo.fullName}`);
    }

    return repository;
  }

  /**
   * Fetch repository metadata from GitHub API
   */
  static async fetchRepoMetadata(token: string, fullName: string): Promise<RepoMetadata> {
    const octokit = new Octokit({ auth: token });
    const [owner, repo] = fullName.split("/");

    const { data } = await octokit.rest.repos.get({ owner, repo });

    // Determine owner type
    let ownerType = OwnerType.USER;
    if (data.owner.type === "Organization") {
      ownerType = OwnerType.ORGANIZATION;
    }

    return {
      description: data.description,
      language: data.language,
      isPrivate: data.private,
      htmlUrl: data.html_url,
      ownerType,
    };
  }

  /**
   * Detect owner type (USER or ORGANIZATION) from GitHub
   */
  static async detectOwnerType(token: string, owner: string): Promise<OwnerType> {
    const octokit = new Octokit({ auth: token });

    try {
      const { data } = await octokit.rest.users.getByUsername({ username: owner });
      return data.type === "Organization" ? OwnerType.ORGANIZATION : OwnerType.USER;
    } catch {
      return OwnerType.USER;
    }
  }

  /**
   * Refresh metadata for a repository
   */
  static async refreshMetadata(repositoryId: string, token: string): Promise<Repository> {
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      throw new Error(`Repository not found: ${repositoryId}`);
    }

    const metadata = await this.fetchRepoMetadata(token, repository.fullName);

    return await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        description: metadata.description,
        language: metadata.language,
        isPrivate: metadata.isPrivate,
        htmlUrl: metadata.htmlUrl,
        ownerType: metadata.ownerType,
      },
    });
  }

  /**
   * Recompute activity metrics for all repositories of a user
   */
  static async recomputeMetrics(userId: string): Promise<void> {
    // Get all repositories for the user
    const repositories = await prisma.repository.findMany({
      where: { userId },
    });

    for (const repo of repositories) {
      // Count metrics for this repository
      const [commits, prs, issues] = await Promise.all([
        prisma.metricData.count({
          where: { repositoryId: repo.id, metricKey: "commits" },
        }),
        prisma.metricData.count({
          where: { repositoryId: repo.id, metricKey: "pull_requests" },
        }),
        prisma.metricData.count({
          where: { repositoryId: repo.id, metricKey: "issues" },
        }),
      ]);

      // Get date range
      const [firstMetric, lastMetric] = await Promise.all([
        prisma.metricData.findFirst({
          where: { repositoryId: repo.id },
          orderBy: { timestamp: "asc" },
          select: { timestamp: true },
        }),
        prisma.metricData.findFirst({
          where: { repositoryId: repo.id },
          orderBy: { timestamp: "desc" },
          select: { timestamp: true },
        }),
      ]);

      // Update repository
      await prisma.repository.update({
        where: { id: repo.id },
        data: {
          totalCommits: commits,
          totalPRs: prs,
          totalIssues: issues,
          firstActivityAt: firstMetric?.timestamp || null,
          lastActivityAt: lastMetric?.timestamp || null,
        },
      });
    }

    console.log(`[RepoDetector] Recomputed metrics for ${repositories.length} repositories`);
  }

  /**
   * Get top repositories by activity for a user
   */
  static async getTopRepositories(
    userId: string,
    options: { limit?: number; since?: Date } = {}
  ): Promise<Repository[]> {
    const { limit = 10, since } = options;

    const where: Record<string, unknown> = { userId };
    if (since) {
      where.lastActivityAt = { gte: since };
    }

    return await prisma.repository.findMany({
      where,
      orderBy: [
        { isPrimary: "desc" },
        { lastActivityAt: "desc" },
      ],
      take: limit,
    });
  }

  /**
   * Get repositories grouped by organization
   */
  static async getRepositoriesByOrg(userId: string): Promise<Map<string, Repository[]>> {
    const repositories = await prisma.repository.findMany({
      where: { userId },
      orderBy: { lastActivityAt: "desc" },
    });

    const byOrg = new Map<string, Repository[]>();

    for (const repo of repositories) {
      const key = repo.ownerType === OwnerType.ORGANIZATION ? repo.owner : "Personal";
      if (!byOrg.has(key)) {
        byOrg.set(key, []);
      }
      byOrg.get(key)!.push(repo);
    }

    return byOrg;
  }
}
