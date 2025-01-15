import { supabase, getFunctionsUrl } from '@/lib/supabase';

interface IntegrationStatus {
  is_active: boolean;
  access_token?: string;
}

export async function saveGitHubToken(token: string) {
  const { data: { session } } = await supabase.auth.getSession();

  console.log("This is my url ", getFunctionsUrl('github-integration-token'))

  const response = await fetch(getFunctionsUrl('github-integration-token'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save GitHub token');
  }

  return response.json();
}

export async function getIntegrationStatus(type: string): Promise<IntegrationStatus> {
  const { data: { session } } = await supabase.auth.getSession();


  // const { data: integration, error: integrationError } = await supabase
  //   .from('integrations')
  //   .select('id')
  //   .eq('type', type)
  //   .single();

  // if (integrationError) throw integrationError;

  // const { data, error } = await supabase
  //   .from('user_integrations')
  //   .select(`
  //     is_active,
  //     integration_tokens (
  //       access_token
  //     )
  //   `)
  //   .eq('user_id', session?.user?.id)
  //   .eq('integration_id', integration.id)
  //   .single();

  // if (error) throw error;

  return {
    is_active: false,
    access_token: "123",
  };
}