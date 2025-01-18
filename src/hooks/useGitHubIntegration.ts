import { useMutation } from '@tanstack/react-query';
import { saveGitHubToken } from '@/lib/api/saveIntegrations/github';
import { useToast } from '@/hooks/use-toast';

export const useGitHubIntegration = () => {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      oAuthCode,
    }: {
      oAuthCode: string;
    }) => {
      try {
        const response = await saveGitHubToken(oAuthCode);
        return response.data;
      } catch (error: any) {
        throw new Error(error?.message);
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || 'Failed to save GitHub token',
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "GitHub token saved successfully",
      });
    },
  });
};
