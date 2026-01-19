import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma";
import { SummaryTemplate, Repository, OwnerType } from "../../../src/generated/prisma";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { RepositoryDetector } from "../repositories";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================
// Prompt Templates
// ============================================

const SYSTEM_PROMPTS: Record<SummaryTemplate, string> = {
  EXECUTIVE: `You are a productivity analyst creating executive summaries.
Write a concise, high-level summary of the user's weekly accomplishments.
Focus on outcomes and impact, not granular details.
Use a professional but encouraging tone.
Format the response in markdown with clear sections.
When repository context is provided, mention the key projects/repos the user worked on and their significance.

IMPORTANT: Analyze commit messages to understand what was actually built or changed.
- Don't just count commits - extract the meaning from the messages
- Conventional prefixes (feat:, fix:, refactor:) indicate the type of work
- Summarize the actual features built and bugs fixed, not just "X commits"
- Group related work together to tell a story of what was accomplished`,

  DETAILED: `You are a productivity analyst creating detailed activity reports.
Create a comprehensive breakdown of all activity across integrations.
Include specific metrics, statistics, and data points.
Organize by integration/platform with subsections.
Format the response in markdown with tables where appropriate.
Include a breakdown by repository/project showing commits, PRs, and issues for each.

IMPORTANT: Analyze commit messages deeply:
- Parse conventional commit prefixes to categorize work (feat, fix, refactor, docs, chore)
- List specific features added and bugs fixed based on commit messages
- Identify which areas of the codebase received attention
- Note any patterns in the types of work (mostly features? mostly fixes?)`,

  INSIGHTS: `You are a productivity coach analyzing work patterns.
Identify patterns, trends, and areas for improvement.
Compare to previous weeks if data is available.
Provide actionable suggestions for optimization.
Be specific and data-driven in your recommendations.
Format the response in markdown with clear sections.
Analyze repository activity patterns - note which projects got the most attention, if work is spread across many repos or focused, and organizational vs personal projects.

IMPORTANT: Derive insights from commit message content:
- What types of work dominated (features, fixes, refactoring)?
- Are there signs of technical debt (many fix commits after features)?
- Is work focused on one area or scattered across many?
- What themes emerge from the commit messages?
- Are commits well-documented or vague?`,

  SHAREABLE: `You are helping create a professional weekly report for stakeholders.
Write in a format suitable for sharing with managers or team members.
Focus on accomplishments, progress on goals, and key highlights.
Use professional language and clear structure.
Format as a standup-style report in markdown.
Highlight the key projects/repos worked on with their descriptions when available.

IMPORTANT: Transform commit messages into accomplishment statements:
- Convert "feat: add user auth" into "Implemented user authentication system"
- Group related commits into single accomplishments
- Focus on the value delivered, not the technical details
- Use action verbs: Built, Implemented, Fixed, Improved, Refactored`,
};

// ============================================
// Context Building
// ============================================

interface IntegrationMetrics {
  integrationName: string;
  integrationSlug: string;
  metrics: Record<string, any[]>;
  totalDataPoints: number;
}

interface RepoActivitySummary {
  fullName: string;
  name: string;
  owner: string;
  ownerType: OwnerType;
  description: string | null;
  language: string | null;
  isPrimary: boolean;
  commits: number;
  prs: number;
  issues: number;
}

interface RepositoryContext {
  primaryRepos: Repository[];
  activeRepos: RepoActivitySummary[];
  organizations: string[];
}

interface SummaryContext {
  weekStart: string;
  weekEnd: string;
  integrations: IntegrationMetrics[];
  repositories: RepositoryContext;
  totalDataPoints: number;
}

async function buildSummaryContext(
  userId: string,
  weekStartStr: string
): Promise<SummaryContext> {
  const weekStartDate = startOfWeek(new Date(weekStartStr), { weekStartsOn: 1 });
  const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });

  // Get all user's active integrations
  const integrations = await prisma.integration.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
  });

  // Get metrics for each integration in this week
  const integrationMetrics: IntegrationMetrics[] = await Promise.all(
    integrations.map(async (integration) => {
      const metrics = await prisma.metricData.findMany({
        where: {
          integrationId: integration.id,
          timestamp: {
            gte: weekStartDate,
            lte: weekEndDate,
          },
        },
        orderBy: { timestamp: "asc" },
      });

      // Group metrics by key
      const metricsByKey: Record<string, any[]> = {};
      for (const metric of metrics) {
        if (!metricsByKey[metric.metricKey]) {
          metricsByKey[metric.metricKey] = [];
        }
        metricsByKey[metric.metricKey].push({
          value: metric.value,
          timestamp: metric.timestamp,
          metadata: metric.metadata,
        });
      }

      return {
        integrationName: integration.name,
        integrationSlug: integration.typeSlug,
        metrics: metricsByKey,
        totalDataPoints: metrics.length,
      };
    })
  );

  const totalDataPoints = integrationMetrics.reduce(
    (sum, i) => sum + i.totalDataPoints,
    0
  );

  // Build repository context
  const repositoryContext = await buildRepositoryContext(
    userId,
    weekStartDate,
    weekEndDate
  );

  return {
    weekStart: format(weekStartDate, "yyyy-MM-dd"),
    weekEnd: format(weekEndDate, "yyyy-MM-dd"),
    integrations: integrationMetrics,
    repositories: repositoryContext,
    totalDataPoints,
  };
}

async function buildRepositoryContext(
  userId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<RepositoryContext> {
  // Get primary repos (user-marked as important)
  const primaryRepos = await prisma.repository.findMany({
    where: {
      userId,
      isPrimary: true,
    },
    orderBy: { lastActivityAt: "desc" },
    take: 5,
  });

  // Get repos with activity this week
  const metricsWithRepos = await prisma.metricData.findMany({
    where: {
      repositoryId: { not: null },
      timestamp: {
        gte: weekStart,
        lte: weekEnd,
      },
      integration: {
        userId,
      },
    },
    include: {
      repository: true,
    },
  });

  // Aggregate activity by repo
  const repoActivityMap = new Map<
    string,
    RepoActivitySummary & { repo: Repository }
  >();

  for (const metric of metricsWithRepos) {
    if (!metric.repository) continue;

    if (!repoActivityMap.has(metric.repository.id)) {
      repoActivityMap.set(metric.repository.id, {
        fullName: metric.repository.fullName,
        name: metric.repository.name,
        owner: metric.repository.owner,
        ownerType: metric.repository.ownerType,
        description: metric.repository.description,
        language: metric.repository.language,
        isPrimary: metric.repository.isPrimary,
        commits: 0,
        prs: 0,
        issues: 0,
        repo: metric.repository,
      });
    }

    const activity = repoActivityMap.get(metric.repository.id)!;
    if (metric.metricKey === "commits") activity.commits++;
    else if (metric.metricKey === "pull_requests") activity.prs++;
    else if (metric.metricKey === "issues") activity.issues++;
  }

  // Sort by total activity
  const activeRepos = Array.from(repoActivityMap.values())
    .map(({ repo, ...rest }) => rest)
    .sort((a, b) => {
      const aTotal = a.commits + a.prs + a.issues;
      const bTotal = b.commits + b.prs + b.issues;
      return bTotal - aTotal;
    })
    .slice(0, 10);

  // Get unique organizations
  const organizations = [
    ...new Set(
      activeRepos
        .filter((r) => r.ownerType === OwnerType.ORGANIZATION)
        .map((r) => r.owner)
    ),
  ];

  return {
    primaryRepos,
    activeRepos,
    organizations,
  };
}

/**
 * Group commits by conventional commit type for better organization
 */
function groupCommitsByType(commits: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {
    "Features": [],
    "Bug Fixes": [],
    "Refactoring": [],
    "Documentation": [],
    "Chores/Maintenance": [],
    "Other": [],
  };

  for (const commit of commits) {
    const msg = commit.value?.message?.toLowerCase() || "";
    if (msg.startsWith("feat")) groups["Features"].push(commit);
    else if (msg.startsWith("fix")) groups["Bug Fixes"].push(commit);
    else if (msg.startsWith("refactor")) groups["Refactoring"].push(commit);
    else if (msg.startsWith("docs")) groups["Documentation"].push(commit);
    else if (msg.startsWith("chore") || msg.startsWith("build") || msg.startsWith("ci"))
      groups["Chores/Maintenance"].push(commit);
    else groups["Other"].push(commit);
  }

  // Remove empty groups
  return Object.fromEntries(
    Object.entries(groups).filter(([_, v]) => v.length > 0)
  );
}

/**
 * Format commits in a readable way, grouped by type
 */
function formatCommitsForPrompt(dataPoints: any[]): string {
  let section = "";

  const grouped = groupCommitsByType(dataPoints);

  for (const [type, commits] of Object.entries(grouped)) {
    section += `\n**${type}** (${commits.length}):\n`;
    for (const commit of commits) {
      const msg = commit.value?.message || "No message";
      const repo = commit.value?.repo?.split("/")[1] || commit.value?.repo || "unknown";
      const day = format(new Date(commit.timestamp), "EEE");
      section += `- [${day}] [${repo}] ${msg}\n`;
    }
  }

  return section;
}

/**
 * Format PRs in a readable way
 */
function formatPRsForPrompt(dataPoints: any[]): string {
  let section = "";

  for (const dp of dataPoints) {
    const title = dp.value?.title || "Untitled PR";
    const state = dp.value?.state || "unknown";
    const repo = dp.value?.repo?.split("/")[1] || dp.value?.repo || "unknown";
    const day = format(new Date(dp.timestamp), "EEE");
    section += `- [${day}] [${repo}] ${title} (${state})\n`;
  }

  return section;
}

function buildUserPrompt(context: SummaryContext): string {
  let prompt = `Generate a weekly productivity summary for the week of ${context.weekStart} to ${context.weekEnd}.\n\n`;

  if (context.totalDataPoints === 0) {
    prompt += "No activity data was recorded this week.\n";
    return prompt;
  }

  // Add repository context
  prompt += buildRepositoryPromptSection(context.repositories);

  prompt += `## Activity Data\n\n`;

  for (const integration of context.integrations) {
    prompt += `### ${integration.integrationName} (${integration.integrationSlug})\n`;

    if (integration.totalDataPoints === 0) {
      prompt += "No activity recorded.\n\n";
      continue;
    }

    for (const [metricKey, dataPoints] of Object.entries(integration.metrics)) {
      // Handle commits specially - extract meaningful info from messages
      if (metricKey === "commits") {
        prompt += `\n**Commits** (${dataPoints.length} total):`;
        prompt += formatCommitsForPrompt(dataPoints);
        continue;
      }

      // Handle PRs specially
      if (metricKey === "pull_requests") {
        prompt += `\n**Pull Requests** (${dataPoints.length} total):\n`;
        prompt += formatPRsForPrompt(dataPoints);
        continue;
      }

      // Skip daily_commits as it's redundant with commits
      if (metricKey === "daily_commits") {
        continue;
      }

      prompt += `\n**${metricKey}** (${dataPoints.length} data points):\n`;

      // Summarize the data points (don't dump everything for large datasets)
      if (dataPoints.length <= 10) {
        for (const dp of dataPoints) {
          const timestamp = new Date(dp.timestamp).toLocaleDateString();
          // For issues and other types, extract title if available
          if (dp.value?.title) {
            prompt += `- ${timestamp}: ${dp.value.title}\n`;
          } else if (typeof dp.value === "object") {
            prompt += `- ${timestamp}: ${JSON.stringify(dp.value)}\n`;
          } else {
            prompt += `- ${timestamp}: ${dp.value}\n`;
          }
        }
      } else {
        // For large datasets, provide summary stats
        const values = dataPoints
          .map((dp) => {
            const val = dp.value;
            if (typeof val === "number") return val;
            if (typeof val === "object" && val !== null && "count" in val)
              return val.count;
            return null;
          })
          .filter((v) => v !== null) as number[];

        if (values.length > 0) {
          const sum = values.reduce((a, b) => a + b, 0);
          const avg = sum / values.length;
          prompt += `- Total: ${sum}\n`;
          prompt += `- Average: ${avg.toFixed(2)}\n`;
          prompt += `- Data points: ${dataPoints.length}\n`;
        } else {
          prompt += `- ${dataPoints.length} entries recorded\n`;
        }
      }
    }
    prompt += "\n";
  }

  return prompt;
}

function buildRepositoryPromptSection(repos: RepositoryContext): string {
  let section = "";

  // Organizations worked in
  if (repos.organizations.length > 0) {
    section += `## Organizations\n`;
    section += `User worked in the following organizations this week: ${repos.organizations.join(", ")}\n\n`;
  }

  // Primary repos (user-marked as important)
  if (repos.primaryRepos.length > 0) {
    section += `## Primary Projects\n`;
    section += `These are the user's key/primary repositories:\n`;
    for (const repo of repos.primaryRepos) {
      section += `- **${repo.fullName}**`;
      if (repo.description) section += `: ${repo.description}`;
      if (repo.language) section += ` (${repo.language})`;
      section += `\n`;
    }
    section += `\n`;
  }

  // Active repos this week
  if (repos.activeRepos.length > 0) {
    section += `## Repository Activity Breakdown\n`;
    section += `Activity by repository this week:\n\n`;

    for (const repo of repos.activeRepos) {
      const total = repo.commits + repo.prs + repo.issues;
      const isOrg = repo.ownerType === OwnerType.ORGANIZATION;
      section += `### ${repo.fullName}${isOrg ? " (Organization)" : ""}\n`;
      if (repo.description) section += `*${repo.description}*\n`;
      if (repo.language) section += `Language: ${repo.language}\n`;
      section += `- Commits: ${repo.commits}\n`;
      section += `- Pull Requests: ${repo.prs}\n`;
      section += `- Issues: ${repo.issues}\n`;
      section += `- Total Activity: ${total}\n\n`;
    }
  }

  return section;
}

// ============================================
// Main Generator Function
// ============================================

export async function generateWeeklySummary(
  userId: string,
  weekStart: string,
  template: SummaryTemplate
): Promise<{ id: string; content: string }> {
  console.log(
    `[SummaryGenerator] Generating ${template} summary for user ${userId}, week ${weekStart}`
  );

  // Build context from metrics
  const context = await buildSummaryContext(userId, weekStart);

  if (context.totalDataPoints === 0) {
    // No data - create a simple summary
    const noDataContent = `# Weekly Summary: ${context.weekStart} to ${context.weekEnd}\n\nNo activity data was recorded this week. Connect integrations and sync data to generate meaningful summaries.`;

    const summary = await prisma.weeklySummary.upsert({
      where: {
        userId_weekStart_template: {
          userId,
          weekStart: new Date(weekStart),
          template,
        },
      },
      create: {
        userId,
        weekStart: new Date(weekStart),
        template,
        content: noDataContent,
        context: context as any,
      },
      update: {
        content: noDataContent,
        context: context as any,
      },
    });

    return { id: summary.id, content: summary.content };
  }

  // Generate with Claude
  const systemPrompt = SYSTEM_PROMPTS[template];
  const userPrompt = buildUserPrompt(context);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const content =
    response.content[0].type === "text"
      ? response.content[0].text
      : "Failed to generate summary";

  // Save to database
  const summary = await prisma.weeklySummary.upsert({
    where: {
      userId_weekStart_template: {
        userId,
        weekStart: new Date(weekStart),
        template,
      },
    },
    create: {
      userId,
      weekStart: new Date(weekStart),
      template,
      content,
      context: context as any,
    },
    update: {
      content,
      context: context as any,
    },
  });

  console.log(`[SummaryGenerator] Generated summary ${summary.id}`);

  return { id: summary.id, content: summary.content };
}
