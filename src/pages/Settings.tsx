import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useGitHubIntegration } from '@/hooks/useGitHubIntegration';
import { supabase } from '@/lib/supabase';

export default function Settings() {
  const location = useLocation();
  const { toast } = useToast();
  const { mutate: saveGitHubToken, isPending } = useGitHubIntegration();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const integration = searchParams.get('integration');
    const status = searchParams.get('status');
    const providerToken = searchParams.get('provider_token');

    if (integration === 'github' && status) {
      if (status === 'success') {
        setIsConnected(true);
        toast({
          title: 'Success',
          description: 'GitHub integration connected successfully',
        });
      } else if (status === 'error') {
        toast({
          title: 'Error',
          description: 'Failed to connect GitHub integration',
          variant: 'destructive',
        });
      }
    }
  }, [location.search, toast]);

  const handleGitHubAuth = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth/github/callback`,
          scopes: 'repo read:user',
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error connecting to GitHub:', error);
      toast({
        title: 'Error',
        description: 'Failed to connect to GitHub',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your account settings and integrations</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              GitHub Integration
            </CardTitle>
            <CardDescription>
              Connect your GitHub account to track your development activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              variant={isConnected ? 'secondary' : 'default'}
              onClick={handleGitHubAuth}
              disabled={isPending}
            >
              {isPending ? 'Connecting...' : isConnected ? 'Connected' : 'Connect GitHub'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
