import { getFunctionsUrl } from "@/lib/supabase";

export async function saveGitHubIntegration(code: string) {
  const response = await fetch(getFunctionsUrl('github-integration-token'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(code),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to save GitHub token');
  }

  return response.json();
}