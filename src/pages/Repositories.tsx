import { useState } from "react";
import {
  GitFork,
  Building2,
  User,
  Star,
  Loader2,
  RefreshCw,
  ExternalLink,
  GitCommit,
  GitPullRequest,
  CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type OwnerType = "USER" | "ORGANIZATION";

interface Repository {
  id: string;
  fullName: string;
  name: string;
  owner: string;
  ownerType: OwnerType;
  description: string | null;
  language: string | null;
  isPrivate: boolean;
  htmlUrl: string | null;
  totalCommits: number;
  totalPRs: number;
  totalIssues: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  isPrimary: boolean;
}

export default function Repositories() {
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Fetch repositories list
  const {
    data: reposData,
    isLoading,
    refetch,
  } = trpc.repositories.list.useQuery({});

  // Fetch repos grouped by org
  const { data: reposByOrg } = trpc.repositories.listByOrg.useQuery();

  // Toggle primary mutation
  const togglePrimary = trpc.repositories.togglePrimary.useMutation({
    onSuccess: () => {
      toast.success("Repository updated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Refresh metadata mutation
  const refreshMetadata = trpc.repositories.refreshMetadata.useMutation({
    onSuccess: () => {
      toast.success("Metadata refreshed");
      refetch();
      setRefreshingId(null);
    },
    onError: (error) => {
      toast.error(error.message);
      setRefreshingId(null);
    },
  });

  const handleTogglePrimary = (id: string) => {
    togglePrimary.mutate({ id });
  };

  const handleRefreshMetadata = (id: string) => {
    setRefreshingId(id);
    refreshMetadata.mutate({ id });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const repositories = (reposData?.repositories ?? []) as Repository[];
  const primaryRepos = repositories.filter((r) => r.isPrimary);
  const orgRepos = repositories.filter((r) => r.ownerType === "ORGANIZATION");
  const personalRepos = repositories.filter((r) => r.ownerType === "USER");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Repositories</h1>
        <p className="text-muted-foreground mt-2">
          Track your activity across repositories and mark your primary projects
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Repositories
            </CardTitle>
            <GitFork className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{repositories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Primary Projects
            </CardTitle>
            <Star className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{primaryRepos.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reposByOrg?.filter((g) => g.organization !== "Personal").length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Personal Repos</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{personalRepos.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Repositories</TabsTrigger>
          <TabsTrigger value="primary">Primary Projects</TabsTrigger>
          <TabsTrigger value="by-org">By Organization</TabsTrigger>
        </TabsList>

        {/* All Repositories */}
        <TabsContent value="all" className="space-y-4">
          {repositories.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <GitFork className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  No repositories detected yet
                </h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Repositories will appear here as we detect activity from your
                  GitHub integration. Make sure you have GitHub connected and
                  synced.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {repositories.map((repo) => (
                <RepoCard
                  key={repo.id}
                  repo={repo}
                  onTogglePrimary={handleTogglePrimary}
                  onRefreshMetadata={handleRefreshMetadata}
                  isRefreshing={refreshingId === repo.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Primary Projects */}
        <TabsContent value="primary" className="space-y-4">
          {primaryRepos.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Star className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  No primary projects set
                </h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Mark repositories as primary to highlight your main projects.
                  Primary repos get special treatment in your weekly summaries.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {primaryRepos.map((repo) => (
                <RepoCard
                  key={repo.id}
                  repo={repo}
                  onTogglePrimary={handleTogglePrimary}
                  onRefreshMetadata={handleRefreshMetadata}
                  isRefreshing={refreshingId === repo.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* By Organization */}
        <TabsContent value="by-org" className="space-y-6">
          {reposByOrg?.map((group) => (
            <div key={group.organization} className="space-y-4">
              <div className="flex items-center gap-2">
                {group.organization === "Personal" ? (
                  <User className="h-5 w-5" />
                ) : (
                  <Building2 className="h-5 w-5" />
                )}
                <h2 className="text-xl font-semibold">{group.organization}</h2>
                <Badge variant="secondary">
                  {group.repositories.length} repos
                </Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(group.repositories as Repository[]).map((repo) => (
                  <RepoCard
                    key={repo.id}
                    repo={repo}
                    onTogglePrimary={handleTogglePrimary}
                    onRefreshMetadata={handleRefreshMetadata}
                    isRefreshing={refreshingId === repo.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface RepoCardProps {
  repo: Repository;
  onTogglePrimary: (id: string) => void;
  onRefreshMetadata: (id: string) => void;
  isRefreshing: boolean;
}

function RepoCard({
  repo,
  onTogglePrimary,
  onRefreshMetadata,
  isRefreshing,
}: RepoCardProps) {
  const totalActivity = repo.totalCommits + repo.totalPRs + repo.totalIssues;

  return (
    <Card className={repo.isPrimary ? "border-yellow-500/50" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="truncate">{repo.name}</span>
              {repo.isPrimary && <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {repo.owner}
              {repo.ownerType === "ORGANIZATION" && (
                <Badge variant="outline" className="ml-2 text-xs py-0">
                  Org
                </Badge>
              )}
            </CardDescription>
          </div>
          {repo.htmlUrl && (
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
        {repo.description && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {repo.description}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Language Badge */}
        {repo.language && (
          <Badge variant="secondary" className="text-xs">
            {repo.language}
          </Badge>
        )}

        {/* Activity Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <GitCommit className="h-3 w-3" />
            </div>
            <div className="text-lg font-semibold">{repo.totalCommits}</div>
            <div className="text-xs text-muted-foreground">Commits</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <GitPullRequest className="h-3 w-3" />
            </div>
            <div className="text-lg font-semibold">{repo.totalPRs}</div>
            <div className="text-xs text-muted-foreground">PRs</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <CircleDot className="h-3 w-3" />
            </div>
            <div className="text-lg font-semibold">{repo.totalIssues}</div>
            <div className="text-xs text-muted-foreground">Issues</div>
          </div>
        </div>

        {/* Last Activity */}
        {repo.lastActivityAt && (
          <p className="text-xs text-muted-foreground">
            Last activity:{" "}
            {new Date(repo.lastActivityAt).toLocaleDateString()}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant={repo.isPrimary ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => onTogglePrimary(repo.id)}
          >
            <Star className={`h-4 w-4 mr-1 ${repo.isPrimary ? "fill-current" : ""}`} />
            {repo.isPrimary ? "Primary" : "Set Primary"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRefreshMetadata(repo.id)}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
