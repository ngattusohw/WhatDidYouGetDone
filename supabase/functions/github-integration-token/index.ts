import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { corsHeaders } from '../_shared/cors.ts';

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

    // Parse request body and validate token
    console.log("This is my req", req)
    const { token } = await req.json();
    if (!token) {
      throw new Error('No token provided in request body');
    }

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

    // Get GitHub integration ID
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id')
      .eq('type', 'github')
      .single();

    if (integrationError || !integration) {
      throw new Error('GitHub integration not found');
    }

    // Store the token
    const { error: tokenError } = await supabase
      .from('integration_tokens')
      .upsert({
        user_id: user.id,
        integration_id: integration.id,
        access_token: token,
      });

    if (tokenError) {
      throw tokenError;
    }

    // Update user_integrations status
    const { error: statusError } = await supabase
      .from('user_integrations')
      .upsert({
        user_id: user.id,
        integration_id: integration.id,
        is_active: true,
      });

    if (statusError) {
      throw statusError;
    }

    return new Response(
      JSON.stringify({ success: true }),
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