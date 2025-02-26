import { supabase, getFunctionsUrl } from '@/lib/supabase';

export interface TokenValidationResult {
  isValid: boolean;
  username?: string;
  error?: string;
}

export async function validateGitHubToken(): Promise<TokenValidationResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  try {
    const response = await fetch(getFunctionsUrl('validate-github-token'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        isValid: false,
        error: data.error || 'Failed to validate GitHub token',
      };
    }

    return {
      isValid: true,
      username: data.username,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
