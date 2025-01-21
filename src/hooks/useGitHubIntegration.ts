import { useMutation } from '@tanstack/react-query';
import { saveGitHubToken } from '@/lib/api/saveIntegrations/github';

export const useGitHubIntegration = () => {
  return useMutation({
    mutationFn: async ({ oAuthCode }: { oAuthCode: string }) => {
      try {
        const response = await saveGitHubToken(oAuthCode);
        return response.data;
      } catch (error: any) {
        throw new Error(error?.message);
      }
    },
  });
};
