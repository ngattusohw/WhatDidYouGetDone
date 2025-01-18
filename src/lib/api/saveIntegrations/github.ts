import { supabase, getFunctionsUrl } from '@/lib/supabase';



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

