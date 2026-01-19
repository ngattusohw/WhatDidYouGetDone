/**
 * Backfill script to populate the Repository table from existing MetricData
 *
 * This script:
 * 1. Scans all MetricData entries for GitHub-related metrics
 * 2. Extracts unique repository names from the value.repo field
 * 3. Creates Repository records with activity metrics
 * 4. Links MetricData records to their Repository
 *
 * Run with: npx tsx server/scripts/backfill-repositories.ts
 */

import { prisma } from "../lib/prisma";
import { OwnerType } from "../../src/generated/prisma";

interface RepoInfo {
  fullName: string;
  owner: string;
  name: string;
}

interface RepoMetrics {
  commits: number;
  prs: number;
  issues: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
  metricIds: string[];
}

function parseRepoName(fullName: string): RepoInfo | null {
  const parts = fullName.split("/");
  if (parts.length !== 2) return null;

  return {
    fullName,
    owner: parts[0],
    name: parts[1],
  };
}

async function main() {
  console.log("Starting repository backfill...\n");

  // Get all GitHub integrations with their user IDs
  const integrations = await prisma.integration.findMany({
    where: { typeSlug: "github" },
    select: { id: true, userId: true },
  });

  console.log(`Found ${integrations.length} GitHub integrations\n`);

  for (const integration of integrations) {
    console.log(`Processing integration ${integration.id} for user ${integration.userId}...`);

    // Get all metric data for this integration
    const metrics = await prisma.metricData.findMany({
      where: {
        integrationId: integration.id,
        metricKey: { in: ["commits", "pull_requests", "issues"] },
      },
      orderBy: { timestamp: "asc" },
    });

    console.log(`  Found ${metrics.length} metrics`);

    // Group by repository
    const repoMap = new Map<string, RepoMetrics>();

    for (const metric of metrics) {
      const value = metric.value as Record<string, unknown>;
      const repoFullName = value?.repo as string;

      if (!repoFullName) continue;

      if (!repoMap.has(repoFullName)) {
        repoMap.set(repoFullName, {
          commits: 0,
          prs: 0,
          issues: 0,
          firstActivity: null,
          lastActivity: null,
          metricIds: [],
        });
      }

      const repoMetrics = repoMap.get(repoFullName)!;
      repoMetrics.metricIds.push(metric.id);

      // Update counts
      if (metric.metricKey === "commits") repoMetrics.commits++;
      if (metric.metricKey === "pull_requests") repoMetrics.prs++;
      if (metric.metricKey === "issues") repoMetrics.issues++;

      // Update date range
      if (!repoMetrics.firstActivity || metric.timestamp < repoMetrics.firstActivity) {
        repoMetrics.firstActivity = metric.timestamp;
      }
      if (!repoMetrics.lastActivity || metric.timestamp > repoMetrics.lastActivity) {
        repoMetrics.lastActivity = metric.timestamp;
      }
    }

    console.log(`  Found ${repoMap.size} unique repositories`);

    // Create/update Repository records and link MetricData
    for (const [fullName, repoMetrics] of repoMap) {
      const parsed = parseRepoName(fullName);
      if (!parsed) {
        console.log(`    Skipping invalid repo name: ${fullName}`);
        continue;
      }

      // Upsert repository
      const repository = await prisma.repository.upsert({
        where: {
          userId_fullName: {
            userId: integration.userId,
            fullName: parsed.fullName,
          },
        },
        create: {
          userId: integration.userId,
          fullName: parsed.fullName,
          owner: parsed.owner,
          name: parsed.name,
          ownerType: OwnerType.USER, // Default, will be detected later
          totalCommits: repoMetrics.commits,
          totalPRs: repoMetrics.prs,
          totalIssues: repoMetrics.issues,
          firstActivityAt: repoMetrics.firstActivity,
          lastActivityAt: repoMetrics.lastActivity,
          htmlUrl: `https://github.com/${parsed.fullName}`,
        },
        update: {
          totalCommits: repoMetrics.commits,
          totalPRs: repoMetrics.prs,
          totalIssues: repoMetrics.issues,
          firstActivityAt: repoMetrics.firstActivity,
          lastActivityAt: repoMetrics.lastActivity,
        },
      });

      console.log(
        `    ${parsed.fullName}: ${repoMetrics.commits} commits, ${repoMetrics.prs} PRs, ${repoMetrics.issues} issues`
      );

      // Link MetricData to Repository
      await prisma.metricData.updateMany({
        where: {
          id: { in: repoMetrics.metricIds },
        },
        data: {
          repositoryId: repository.id,
        },
      });
    }

    console.log("");
  }

  // Summary
  const totalRepos = await prisma.repository.count();
  const linkedMetrics = await prisma.metricData.count({
    where: { repositoryId: { not: null } },
  });

  console.log("=== Backfill Complete ===");
  console.log(`Total repositories created: ${totalRepos}`);
  console.log(`Metrics linked to repositories: ${linkedMetrics}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
