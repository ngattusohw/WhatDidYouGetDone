import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { GitHubClient } from '../_lib/GitHubClient.ts';
import { HuggingFaceClient } from '../_lib/HuggingFaceClient.ts';
import { corsHeaders } from '../_shared/cors.ts';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';
import { GitHubActivity } from '../_lib/GitHubClient.ts';

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
2. Brief summaries for each repository's activity

Here's the GitHub activity data for the past week:

${repoSummaries}

Please provide your summary in the following format:

EXECUTIVE SUMMARY:
[Write a 2-3 sentence overview of all work done across all repositories. Focus on features, improvements, and business impact rather than technical details. Make it accessible to non-technical readers.]

REPOSITORY SUMMARIES:
[For each repository, provide a 1-2 sentence summary of the main work done. Group related commits into feature/improvement categories.]

Guidelines:
- Focus on the business value and user impact
- Avoid technical jargon in the executive summary
- Group related commits together into features or themes
- Highlight major accomplishments
- Keep it concise and clear
- If commits seem related to a specific feature, mention it
- If there are bug fixes, summarize their impact
- Mention if work seems to be focused on a particular area (UI, backend, etc.)

Remember to maintain a professional, business-focused tone throughout the summary.`;

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

    //TODO: Determine how to get the weekStart from the request based on front end comp
    const { weekStart } = await req.json();

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

    // First get the GitHub integration ID
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id')
      .eq('type', 'github')
      .single();

    if (integrationError || !integration) {
      throw new Error('GitHub integration not found');
    }

    // Then get the token using the correct integration ID
    const { data: tokenData, error: tokenError } = await supabase
      .from('integration_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .eq('integration_id', integration.id)
      .single();

    // // Store the processed data
    // const { data: stats, error: statsError } = await supabase
    //   .from('productivity_stats')
    //   .upsert({
    //     user_id: user.id,
    //     week_start: weekStart,
    //     stats: githubData,
    //     summary: await generateSummary(githubData),
    //   })
    //   .select()
    //   .single();

    // if (statsError) {
    //   throw statsError;
    // }

    if (tokenError || !tokenData) {
      throw new Error('GitHub integration not found');
    }

    const token = tokenData.access_token;
    console.log('This is my token', token);

    const githubClient = new GitHubClient(tokenData.access_token);

    const recentRepos = await githubClient.getActivitySummary('ngattusohw', 7);

    let summary;
    try {
      summary = await generateSummary(recentRepos);
    } catch (error) {
      console.error('Error generating summary:', error);
      summary = 'Error generating summary';
    }

    return new Response(
      JSON.stringify({
        stats: recentRepos,
        summary: summary,
        week_start: weekStart,
        user_id: userId,
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
