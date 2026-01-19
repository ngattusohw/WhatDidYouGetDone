import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Github,
  Twitter,
  CheckCircle,
  AlertCircle,
  Loader2,
  User,
  Bell,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/auth-client";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: integrations, isLoading } = trpc.integrations.list.useQuery();

  const disconnect = trpc.oauth.disconnect.useMutation({
    onSuccess: () => {
      toast({ title: "Integration disconnected" });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const handleDisconnect = (integrationId: string) => {
    disconnect.mutate({ integrationId });
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (isLoading) {
    return <SettingsLoadingSkeleton />;
  }

  const activeIntegrations = integrations?.filter((i) => i.status === "ACTIVE") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account and integrations
        </p>
      </div>

      {/* Account Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{user?.name || "User"}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Integrations Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Connected Integrations</h2>
          <Badge variant="secondary">{activeIntegrations.length} active</Badge>
        </div>

        {activeIntegrations.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                No integrations connected yet.{" "}
                <a href="/app/integrations" className="text-primary hover:underline">
                  Add your first integration
                </a>
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {activeIntegrations.map((integration) => (
              <Card key={integration.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IntegrationIcon type={integration.typeSlug} />
                      {integration.name}
                      <Badge variant="outline" className="bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Last synced: {integration.lastFetchedAt
                        ? new Date(integration.lastFetchedAt).toLocaleString()
                        : "Never"}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(integration.id)}
                      disabled={disconnect.isPending}
                    >
                      {disconnect.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Disconnect"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Notifications Section (placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>Configure how you receive updates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="weekly-summary">Weekly Summary Email</Label>
              <p className="text-sm text-muted-foreground">
                Receive a summary of your week every Monday
              </p>
            </div>
            <Switch id="weekly-summary" disabled />
          </div>
          <p className="text-xs text-muted-foreground">
            Email notifications coming soon
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationIcon({ type }: { type: string }) {
  switch (type) {
    case "github":
      return <Github className="h-5 w-5" />;
    case "twitter":
      return <Twitter className="h-5 w-5" />;
    case "linear":
      return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.357 2.612a.5.5 0 0 0-.732.542l1.537 7.686a.5.5 0 0 0 .39.39l7.686 1.537a.5.5 0 0 0 .542-.732L3.357 2.612z" />
          <path d="M20.643 21.388a.5.5 0 0 0 .732-.542l-1.537-7.686a.5.5 0 0 0-.39-.39l-7.686-1.537a.5.5 0 0 0-.542.732l9.423 9.423z" />
        </svg>
      );
    default:
      return <AlertCircle className="h-5 w-5" />;
  }
}

function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-[200px]" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[150px] w-full" />
        ))}
      </div>
    </div>
  );
}
