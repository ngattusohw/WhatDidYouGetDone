import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { GitHubClient } from '../_lib/GitHubClient.ts';
import { corsHeaders } from '../_shared/cors.ts';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';

async function fetchGitHubStats(token: string, weekStart: string) {
  // Implement GitHub API calls here
  // This is a placeholder that returns mock data
  return {
    total_commits: 23,
    pull_requests: 5,
    merged_prs: 3,
    daily_commits: [
      { date: '2024-02-19', commits: 4 },
      { date: '2024-02-20', commits: 6 },
      { date: '2024-02-21', commits: 3 },
      { date: '2024-02-22', commits: 5 },
      { date: '2024-02-23', commits: 5 },
    ],
    repos: [
      {
        name: 'project-a',
        description: 'Main project repository',
        commits: 12,
        pull_requests: 3,
      },
      {
        name: 'project-b',
        description: 'Secondary project',
        commits: 11,
        pull_requests: 2,
      },
    ],
  };
}

async function generateSummary(stats: any) {
  // In a real implementation, this would use an LLM to generate a summary
  return `You made ${stats.total_commits} commits across ${stats.repos.length} repositories this week. Notable activity includes ${stats.pull_requests} pull requests, with ${stats.merged_prs} successfully merged.`;
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

    // For testing, log the mock data
    const githubData = await fetchGitHubStats('mock-token', weekStart);

    if (tokenError || !tokenData) {
      throw new Error('GitHub integration not found');
    }

    const token = tokenData.access_token;
    console.log('This is my token', token);

    const githubClient = new GitHubClient(tokenData.access_token);

    const recentRepos = await githubClient.getActivitySummary('ngattusohw', 3);

    console.log('Recent repos:', recentRepos);

    return new Response(
      JSON.stringify({
        stats: recentRepos,
        summary: await generateSummary(githubData),
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
