import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGitHubIntegration } from '@/hooks/useGitHubIntegration';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function GitHubCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate: saveGitHubToken } = useGitHubIntegration();

  useEffect(() => {
    const hashParams = new URLSearchParams(location.hash.substring(1));
    console.log('hashParams', hashParams);
    console.log('location.hash', location.hash);
    console.log(location);
    const providerToken = hashParams.get('provider_token');

    if (providerToken) {
      let test = async () => {
        try {
          if (providerToken) {
            await saveGitHubToken({ oAuthCode: providerToken });
            navigate('/settings?integration=github&status=success', { replace: true });
          } else {
            throw new Error('Provider token is null');
          }
        } catch (error) {
          console.error('Error connecting to GitHub:', error);
          toast({
            title: 'Error',
            description: 'Failed to connect to GitHub',
            variant: 'destructive',
          });
          navigate('/settings?integration=github&status=error', { replace: true });
        }
        test();
      };
      test();
    } else {
      navigate('/settings?integration=github&status=provider_token_not_found', { replace: true });
    }
  }, [location.hash, saveGitHubToken, navigate]);

  return <Loader2 className="animate-spin" />;
}
