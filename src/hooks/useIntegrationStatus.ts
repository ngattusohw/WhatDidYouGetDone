import { useQuery } from '@tanstack/react-query';
import { getIntegrationStatus } from '@/lib/api/saveIntegrations/githubIntegration';

export function useIntegrationStatus(type: string) {
  return useQuery({
    queryKey: ['integration', type],
    queryFn: () => getIntegrationStatus(type),
  });
}