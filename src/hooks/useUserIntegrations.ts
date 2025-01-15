import { useQuery } from '@tanstack/react-query';
import { getUserIntegrations } from '@/lib/api/integrations';

export function useUserIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: () => getUserIntegrations(),
  });
}