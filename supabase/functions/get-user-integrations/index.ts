import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { corsHeaders } from '../_shared/cors.ts';

interface Integration {
  id: string;
  type: string;
  name: string;
  description: string;
  is_premium: boolean;
  is_active: boolean;
  access_token?: string;
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
          persistSession: false
        }
      }
    );

    const authHeader = req.headers.get('Authorization')?.split(' ')[1];
    if (!authHeader) {
      throw new Error('No auth token provided');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all integrations with their status for this user
    const { data, error } = await supabase
      .from('integrations')
      .select(`
        id,
        type,
        name,
        description,
        is_premium,
        user_integrations!left (
          is_active
        ),
        integration_tokens!left (
          access_token
        )
      `)
      .eq('user_integrations.user_id', user.id);

    if (error) throw error;

    // Transform the data to a cleaner format
    const integrations: Integration[] = data.map(integration => ({
      id: integration.id,
      type: integration.type,
      name: integration.name,
      description: integration.description,
      is_premium: integration.is_premium,
      is_active: integration.user_integrations?.[0]?.is_active ?? false,
      access_token: integration.integration_tokens?.[0]?.access_token,
    }));

    return new Response(
      JSON.stringify(integrations),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});