import { useState } from "react";
import { Github, AlertCircle, Twitter, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Integration type definitions from registry
const INTEGRATION_TYPES = [
  {
    slug: "github",
    name: "GitHub",
    description: "Track commits, pull requests, issues, and code reviews",
    icon: Github,
    category: "DEVELOPMENT",
  },
  {
    slug: "linear",
    name: "Linear",
    description: "Track issues, cycles, and project progress",
    icon: () => (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.357 2.612a.5.5 0 0 0-.732.542l1.537 7.686a.5.5 0 0 0 .39.39l7.686 1.537a.5.5 0 0 0 .542-.732L3.357 2.612z" />
        <path d="M20.643 21.388a.5.5 0 0 0 .732-.542l-1.537-7.686a.5.5 0 0 0-.39-.39l-7.686-1.537a.5.5 0 0 0-.542.732l9.423 9.423z" />
      </svg>
    ),
    category: "DEVELOPMENT",
  },
  {
    slug: "twitter",
    name: "Twitter/X",
    description: "Track tweets, engagement, and social activity",
    icon: Twitter,
    category: "SOCIAL",
  },
];

export default function Integrations() {
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);

  // Fetch user's integrations
  const { data: integrations, isLoading, refetch } = trpc.integrations.list.useQuery();

  // Create integration mutation
  const createIntegration = trpc.integrations.create.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
      setConnectingSlug(null);
    },
  });

  // Get OAuth URL mutation
  const getAuthUrl = trpc.oauth.getAuthUrl.useMutation({
    onSuccess: (data) => {
      // Redirect to OAuth provider
      window.location.href = data.authUrl;
    },
    onError: (error) => {
      toast.error(error.message);
      setConnectingSlug(null);
    },
  });

  // Disconnect integration mutation
  const disconnectIntegration = trpc.oauth.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Integration disconnected");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleConnect = async (typeSlug: string) => {
    const type = INTEGRATION_TYPES.find((t) => t.slug === typeSlug);
    if (!type) return;

    setConnectingSlug(typeSlug);

    try {
      // First, create the integration record if it doesn't exist
      const existingIntegration = integrations?.find((i) => i.typeSlug === typeSlug);
      let integrationId: string;

      if (!existingIntegration) {
        const result = await createIntegration.mutateAsync({
          typeSlug,
          name: type.name,
          config: {},
        });
        integrationId = result.id;
      } else {
        integrationId = existingIntegration.id;
      }

      // Then get the OAuth URL and redirect
      const redirectUri = `${window.location.origin}/oauth/callback/${typeSlug}`;
      await getAuthUrl.mutateAsync({
        integrationId,
        redirectUri,
      });
    } catch (error) {
      // Error handled in mutation callbacks
    }
  };

  const handleDisconnect = async (integrationId: string) => {
    await disconnectIntegration.mutateAsync({ integrationId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group integrations by status
  const connectedIntegrations = integrations?.filter(
    (i) => i.status === "ACTIVE"
  ) ?? [];
  const pendingIntegrations = integrations?.filter(
    (i) => i.status === "PENDING_AUTH"
  ) ?? [];

  // Get available integration types (not connected yet)
  const connectedSlugs = new Set(integrations?.map((i) => i.typeSlug) ?? []);
  const availableTypes = INTEGRATION_TYPES.filter(
    (t) => !connectedSlugs.has(t.slug)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-2">
          Connect your accounts to track your productivity across different
          platforms
        </p>
      </div>

      {/* Connected Integrations */}
      {connectedIntegrations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Connected</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {connectedIntegrations.map((integration) => {
              const type = INTEGRATION_TYPES.find(
                (t) => t.slug === integration.typeSlug
              );
              const Icon = type?.icon ?? Github;

              return (
                <Card key={integration.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        {integration.name}
                      </CardTitle>
                      <Badge variant="default" className="bg-green-600">
                        Active
                      </Badge>
                    </div>
                    <CardDescription>
                      {type?.description ?? "Integration active"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleDisconnect(integration.id)}
                    >
                      Disconnect
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Auth Integrations */}
      {pendingIntegrations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Needs Authorization</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendingIntegrations.map((integration) => {
              const type = INTEGRATION_TYPES.find(
                (t) => t.slug === integration.typeSlug
              );
              const Icon = type?.icon ?? Github;
              const isConnecting = connectingSlug === integration.typeSlug;

              return (
                <Card key={integration.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        {integration.name}
                      </CardTitle>
                      <Badge variant="secondary">Pending</Badge>
                    </div>
                    <CardDescription>
                      {type?.description ?? "Authorization required"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      onClick={() => handleConnect(integration.typeSlug)}
                      disabled={isConnecting}
                    >
                      {isConnecting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Authorize
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Integrations */}
      {availableTypes.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Available Integrations</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {availableTypes.map((type) => {
              const Icon = type.icon;
              const isConnecting = connectingSlug === type.slug;

              return (
                <Card key={type.slug}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        {type.name}
                      </CardTitle>
                      <Badge variant="outline">{type.category}</Badge>
                    </div>
                    <CardDescription>{type.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      className="w-full"
                      onClick={() => handleConnect(type.slug)}
                      disabled={isConnecting}
                    >
                      {isConnecting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Connect {type.name}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Data Privacy</AlertTitle>
        <AlertDescription>
          Your integration credentials are encrypted and stored securely. We
          only access the data necessary to generate your productivity summaries.
        </AlertDescription>
      </Alert>
    </div>
  );
}
