import { useQuery } from '@tanstack/react-query';
import { validateGitHubToken } from '@/lib/api/validateGitHubToken';

export function useGitHubTokenValidation() {
  return useQuery({
    queryKey: ['github-token-validation'],
    queryFn: validateGitHubToken,
    // Refresh every time the component mounts
    refetchOnMount: true,
    // Don't cache the result for too long
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
