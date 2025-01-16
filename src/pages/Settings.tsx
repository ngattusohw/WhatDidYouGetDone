import { useUserIntegrations } from '@/hooks/useUserIntegrations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Github, Lock } from 'lucide-react';
import { useState } from 'react';

export default function Settings() {
  const { data: integrations, isLoading } = useUserIntegrations();
  const { toast } = useToast();
  const [token, setToken] = useState('');

  const activeIntegrations = integrations?.filter((i) => i.is_active) ?? [];
  const inactiveIntegrations = integrations?.filter((i) => !i.is_active) ?? [];

  if (isLoading) {
    return <IntegrationsLoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your integrations and account settings</p>
      </div>

      {/* Active Integrations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Active Integrations</h2>
          <Badge variant="secondary">{activeIntegrations.length} of 2 Free Slots Used</Badge>
        </div>
        <div className="grid gap-4">
          {activeIntegrations.map((integration) => (
            <Card key={integration.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IntegrationIcon type={integration.type} />
                    {integration.name}
                  </div>
                  <Badge variant="success">Active</Badge>
                </CardTitle>
                <CardDescription>{integration.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  type="password"
                  placeholder={`Enter your ${integration.name} token`}
                  value={integration.access_token || ''}
                  disabled
                />
                <div className="flex justify-end">
                  <Button variant="destructive">Disconnect</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Available Integrations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Available Integrations</h2>
        </div>
        <div className="grid gap-4">
          {inactiveIntegrations.map((integration) => (
            <Card key={integration.id} className={integration.is_premium ? 'opacity-75' : ''}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IntegrationIcon type={integration.type} />
                    {integration.name}
                  </div>
                  {integration.is_premium && (
                    <Badge variant="secondary">
                      <Lock className="h-3 w-3 mr-1" />
                      Premium
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>{integration.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" disabled={integration.is_premium}>
                  {integration.is_premium ? 'Upgrade to Enable' : 'Connect'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegrationIcon({ type }: { type: string }) {
  switch (type) {
    case 'github':
      return <Github className="h-5 w-5" />;
    // Add other integration icons here
    default:
      return null;
  }
}

function IntegrationsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-[200px]" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[200px] w-full" />
        ))}
      </div>
    </div>
  );
}
