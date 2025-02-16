import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { GitHubClient } from '../_lib/GitHubClient.ts';
import { HuggingFaceClient } from '../_lib/HuggingFaceClient.ts';
import { corsHeaders } from '../_shared/cors.ts';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { GitHubActivity } from '../_lib/GitHubClient.ts';
import { isAfter, startOfWeek } from 'date-fns';

async function generateSummary(stats: GitHubActivity) {
  let huggingFaceToken = Deno.env.get('HUGGING_FACE_API_TOKEN') ?? '';
  console.log('This is my hugging face token', huggingFaceToken);
  const huggingFaceClient = new HuggingFaceClient(huggingFaceToken);

  // Create repository-specific summaries
  const repoSummaries = Object.entries(stats.repositories)
    .map(([repoName, repoData]) => {
      const commitsByDay = Object.entries(repoData.statistics.dailyCommits)
        .map(([date, dayData]) => ({
          date,
          commits: dayData.commits.map((c) => c.message).join('\n'),
        }))
        .filter((day) => day.commits.length > 0);

      return `
          Repository: ${repoName}
          Total Commits: ${repoData.statistics.totalCommits}
          Average Commits per Day: ${repoData.statistics.averageCommitsPerDay.toFixed(1)}
          Most Active Day: ${repoData.statistics.mostActiveDay.date} (${
            repoData.statistics.mostActiveDay.commits
          } commits)

          Commit Activity by Day:
          ${commitsByDay
            .map(
              (day) => `
          Date: ${day.date}
          Commits:
          ${day.commits}
        `
            )
            .join('\n')}
      `;
    })
    .join('\n---\n');

  const prompt = `
You are a technical product manager creating a weekly summary of development work. Your goal is to create two summaries:

1. A high-level executive summary that non-technical stakeholders can understand
2. Extremely brief summaries for each repository's activity

Here's the GitHub activity data for the past week:

${repoSummaries}

Please provide your summary in the following markdown format:

## This week
**Total commits:** [total commits]

- [very short high level summary of work per repository, group related features, and stick to a single sentence per repository]
- [keep the bullet points short and concise, and only include the most important ones, and only include 4-5]
- [group multiple repositories together if they are related, or share commit messages]

## Next week
- [include this section if theres any hints of what other work needs to be done via the messages]

Guidelines:
- Focus on the business value and user impact
- Avoid technical jargon in the executive summary
- Avoid any mention of debug statements
- Group related commits together into features or themes
- Highlight major accomplishments
- Keep it concise and clear
- If commits seem related to a specific feature, mention it
- If there are bug fixes, summarize their impact
- Mention if work seems to be focused on a particular area (UI, backend, etc.)
`;

  const messages = [
    {
      role: 'system',
      content:
        'You are a technical product manager creating weekly development summaries for various stakeholders.',
    },
    { role: 'user', content: prompt },
  ];

  const response = await huggingFaceClient.chatCompletion(
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    messages,
    300 // increased max tokens for more detailed response
  );

  return response;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { weekStart, refreshData } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get('Authorization')?.split(' ')[1];
    if (!authHeader) {
      throw new Error('No auth token provided');
    }

    // Decode the JWT to get the user ID
    const decoded = jose.decodeJwt(authHeader);
    const userId = decoded.sub;

    if (!userId) {
      throw new Error('Invalid token: no user ID');
    }

    // Get GitHub integration ID
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id')
      .eq('type', 'github')
      .single();

    if (integrationError || !integration) {
      throw new Error('GitHub integration not found');
    }

    // Check if we already have data for this week
    const { data: existingStats, error: statsError } = await supabase
      .from('productivity_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('integration_id', integration.id)
      .eq('week_start', weekStart)
      .single();

    // Determine if we should use existing data
    const currentWeekStart = startOfWeek(new Date(), {
      weekStartsOn: 1,
    }).toISOString();
    const isCurrentWeek = weekStart === currentWeekStart;
    const shouldUseExisting = !refreshData && !isCurrentWeek && existingStats;

    if (shouldUseExisting) {
      return new Response(
        JSON.stringify({
          stats: existingStats.stats,
          summary: existingStats.summary,
          week_start: existingStats.week_start,
          user_id: userId,
          cached: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If we need fresh data, proceed with GitHub API calls
    const { data: tokenData, error: tokenError } = await supabase
      .from('integration_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .eq('integration_id', integration.id)
      .single();

    if (tokenError || !tokenData) {
      throw new Error('GitHub integration not found');
    }

    const githubClient = new GitHubClient(tokenData.access_token);
    const recentRepos = await githubClient.getActivitySummary(7, weekStart);
    const summary = await generateSummary(recentRepos);

    // Save the data if it's not the current week
    if (!isCurrentWeek) {
      const { error: saveError } = await supabase
        .from('productivity_stats')
        .upsert({
          user_id: userId,
          integration_id: integration.id,
          week_start: weekStart,
          stats: recentRepos,
          summary: summary,
        });

      if (saveError) {
        console.error('Error saving stats:', saveError);
      }
    }

    return new Response(
      JSON.stringify({
        stats: recentRepos,
        summary: summary,
        week_start: weekStart,
        user_id: userId,
        cached: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
