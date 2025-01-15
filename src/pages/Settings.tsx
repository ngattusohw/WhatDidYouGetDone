import { useEffect, useState } from 'react';
import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useGitHubIntegration } from '@/hooks/useGitHubIntegration';
import { useUserIntegrations } from '@/hooks/useUserIntegrations';
import { Integration } from '@/lib/api/integrations';

export default function Settings() {
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const { mutate: saveGitHubToken, isPending } = useGitHubIntegration();
  const { data: integrations, isLoading } = useUserIntegrations();

  useEffect(() => {
    console.log('This is my integration', integrations);
  }, [integrations, isLoading]);

  const handleSaveToken = () => {
    if (!token.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a valid GitHub token',
        variant: 'destructive',
      });
      return;
    }

    saveGitHubToken(
      { oAuthCode: token },
      {
        onSuccess: () => {
          setToken('');
        },
      }
    );
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
            {/* <CardDescription>
              {integrations?.find((integration: Integration) => integration.type === 'github')
                ?.is_active
                ? 'Your GitHub account is connected. You can update your token below.'
                : 'Enter your GitHub personal access token to connect your account'}
            </CardDescription> */}
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="ghp_your_token_here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button className="w-full" onClick={handleSaveToken} disabled={isPending}>
              {/* {isPending ? 'Saving...' : integration?.is_active ? 'Update Token' : 'Save Token'} */}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
