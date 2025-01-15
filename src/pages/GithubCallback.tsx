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
    // Need to wait for the next tick to ensure hash is available

    const hashParam1 = new URLSearchParams(window.location.hash.substring(1));
    const providerToken1 = hashParam1.get('provider_token!!!!');

    console.log(providerToken1);

    setTimeout(() => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const providerToken = hashParams.get('provider_token');

      console.log('providerToken', providerToken);
      console.log(location);

      if (providerToken) {
        // saveGitHubToken(
        //   { oAuthCode: providerToken },
        //   {
        //     onSuccess: () => {
        //       navigate('/settings?integration=github&status=success', { replace: true });
        //     },
        //     onError: (error) => {
        //       console.error('Error saving GitHub token:', error);
        //       navigate('/settings?integration=github&status=error', { replace: true });
        //     },
        //   }
        // );
      } else {
        console.error('No provider token found in URL');
        navigate('/settings?integration=github&status=error', { replace: true });
      }
    }, 3000);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
