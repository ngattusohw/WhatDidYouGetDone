import { supabase, getFunctionsUrl } from '@/lib/supabase';

export interface Integration {
  id: string;
  type: string;
  name: string;
  description: string;
  is_premium: boolean;
  is_active: boolean;
  access_token?: string;
}

export async function getUserIntegrations(): Promise<Integration[]> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(getFunctionsUrl('get-user-integrations'), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${session?.access_token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch integrations');
  }

  return response.json();
}