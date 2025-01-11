import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { corsHeaders } from '../_shared/cors.ts';
import * as jose from 'https://deno.land/x/jose@v4.15.4/index.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Force local URL for development
    const supabaseUrl = 'http://127.0.0.1:54321';
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { weekStart } = await req.json();

    const authHeader = req.headers.get('Authorization')?.split(' ')[1];
    console.log('Auth Token:', authHeader ? 'Present' : 'Missing');

    if (!authHeader) {
      throw new Error('No auth token provided');
    }

    try {
      // Decode the JWT to get the user ID
      const decoded = jose.decodeJwt(authHeader);
      const userId = decoded.sub;

      if (!userId) {
        throw new Error('Invalid token: no user ID');
      }


    //      // Get user's GitHub token
    // const { data: tokenData, error: tokenError } = await supabase
    // .from('integration_tokens')
    // .select('access_token')
    // .eq('user_id', user.id)
    // .eq('integration_id', 'github')
    // .single();
      // For testing, log the mock data
      const githubData = await fetchGitHubStats('mock-token', weekStart);

    //   if (tokenError || !tokenData) {
    //     JSON.stringify({ error: 'GitHub integration not found' }),
    //     { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    //   );
    // }

    // // Fetch GitHub data using the token
    // const githubData = await fetchGitHubStats(tokenData.access_token, weekStart);

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


      return new Response(
        JSON.stringify({
          stats: githubData,
          summary: await generateSummary(githubData),
          week_start: weekStart,
          user_id: userId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (jwtError) {
      console.error('JWT Error:', jwtError);
      return new Response(
        JSON.stringify({ error: 'Invalid token', details: jwtError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Function Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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