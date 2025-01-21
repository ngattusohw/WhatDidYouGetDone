import { useEffect, useState } from 'react';
// import { useNavigate } from 'react-router-dom';
import { Github, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Integration {
  id: string;
  type: string;
  name: string;
  description: string;
  is_premium: boolean;
}

interface UserIntegration {
  id: string;
  integration_id: string;
  is_active: boolean;
}

export default function Integrations() {
  const { user } = useAuth();
  // const navigate = useNavigate();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [userIntegrations, setUserIntegrations] = useState<UserIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadIntegrations() {
      try {
        const { data: integrationsData, error: integrationsError } = await supabase
          .from('integrations')
          .select('*')
          .order('is_premium', { ascending: true });

        if (integrationsError) throw integrationsError;

        const { data: userIntegrationsData, error: userIntegrationsError } = await supabase
          .from('user_integrations')
          .select('*')
          .eq('user_id', user?.id);

        if (userIntegrationsError) throw userIntegrationsError;

        setIntegrations(integrationsData);
        setUserIntegrations(userIntegrationsData);
      } catch (error) {
        console.error('Error loading integrations:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadIntegrations();
  }, [user]);

  const handleGithubAuth = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          scopes: 'repo read:user',
        },
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error connecting to GitHub:', error);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-2">
          Connect your accounts to track your productivity across different platforms
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => {
          const userIntegration = userIntegrations.find(
            (ui) => ui.integration_id === integration.id
          );

          return (
            <Card key={integration.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    {integration.type === 'github' && <Github className="h-5 w-5" />}
                    {integration.name}
                  </CardTitle>
                  {integration.is_premium && <Badge variant="secondary">Premium</Badge>}
                </div>
                <CardDescription>{integration.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {integration.is_premium ? (
                  <Button className="w-full" disabled>
                    Upgrade to Premium
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={userIntegration?.is_active ? 'secondary' : 'default'}
                    onClick={handleGithubAuth}
                  >
                    {userIntegration?.is_active ? 'Connected' : `Connect ${integration.name}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {integrations.some((i) => i.is_premium) && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Premium Features</AlertTitle>
          <AlertDescription>
            Upgrade to premium to unlock additional integrations and features.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
