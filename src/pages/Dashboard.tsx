import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { startOfWeek, format, subWeeks, addWeeks, parseISO } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  Twitter,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type SummaryTemplate = "EXECUTIVE" | "DETAILED" | "INSIGHTS" | "SHAREABLE";

const TEMPLATE_OPTIONS: { value: SummaryTemplate; label: string; description: string }[] = [
  { value: "EXECUTIVE", label: "Executive Summary", description: "High-level overview" },
  { value: "DETAILED", label: "Detailed Log", description: "Comprehensive breakdown" },
  { value: "INSIGHTS", label: "Insights", description: "Patterns & suggestions" },
  { value: "SHAREABLE", label: "Shareable", description: "For stakeholders" },
];

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTemplate, setSelectedTemplate] = useState<SummaryTemplate>("EXECUTIVE");

  const weekStart = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");

  // Fetch metric data for the week
  const {
    data: metricData,
    isLoading: isLoadingMetrics,
    refetch: refetchMetrics,
  } = trpc.summaries.getWeeklyData.useQuery({ weekStart });

  // Fetch existing summary
  const {
    data: existingSummary,
    isLoading: isLoadingSummary,
    refetch: refetchSummary,
  } = trpc.summaries.get.useQuery(
    { weekStart, template: selectedTemplate },
    { enabled: !!weekStart }
  );

  // Generate summary mutation
  const generateSummary = trpc.summaries.generate.useMutation({
    onSuccess: () => {
      toast.success("Summary generation started! Checking for completion...");
      // Poll for completion since it's a queued job
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max
      const pollInterval = setInterval(async () => {
        attempts++;
        const result = await refetchSummary();
        if (result.data?.content || attempts >= maxAttempts) {
          clearInterval(pollInterval);
          if (result.data?.content) {
            toast.success("Summary ready!");
          } else if (attempts >= maxAttempts) {
            toast.error("Summary generation timed out. Check if the worker is running.");
          }
        }
      }, 1000);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const navigateWeek = (direction: "prev" | "next") => {
    setSelectedDate((current) =>
      direction === "prev" ? subWeeks(current, 1) : addWeeks(current, 1)
    );
  };

  const handleGenerateSummary = () => {
    generateSummary.mutate({ weekStart, template: selectedTemplate, regenerate: true });
  };

  // Process metric data for charts
  const dailyActivity = metricData?.dailyActivity ?? [];
  const integrationBreakdown = metricData?.integrationBreakdown ?? [];
  const totalCommits = metricData?.totals?.commits ?? 0;
  const totalIssues = metricData?.totals?.issues ?? 0;
  const totalTweets = metricData?.totals?.tweets ?? 0;
  const totalPRs = metricData?.totals?.pullRequests ?? 0;

  const isCurrentWeek =
    format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd") ===
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Your productivity stats for the week of{" "}
            {format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateWeek("prev")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {!isCurrentWeek && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateWeek("next")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetchMetrics()}
            disabled={isLoadingMetrics}
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingMetrics ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commits</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingMetrics ? "-" : totalCommits}
            </div>
            <p className="text-xs text-muted-foreground">GitHub commits</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pull Requests</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingMetrics ? "-" : totalPRs}
            </div>
            <p className="text-xs text-muted-foreground">PRs opened/merged</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingMetrics ? "-" : totalIssues}
            </div>
            <p className="text-xs text-muted-foreground">Linear issues</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tweets</CardTitle>
            <Twitter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingMetrics ? "-" : totalTweets}
            </div>
            <p className="text-xs text-muted-foreground">Posts on X</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingMetrics ? (
            <div className="h-[300px] flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : dailyActivity.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailyActivity}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="commits" name="Commits" fill="hsl(var(--primary))" />
                  <Bar dataKey="issues" name="Issues" fill="hsl(var(--secondary))" />
                  <Bar dataKey="tweets" name="Tweets" fill="#1DA1F2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No activity data for this week
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Weekly Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={selectedTemplate}
              onValueChange={(value) => setSelectedTemplate(value as SummaryTemplate)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleGenerateSummary}
              disabled={generateSummary.isPending || isLoadingMetrics}
            >
              {generateSummary.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingSummary ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : existingSummary?.content ? (
            <ScrollArea className="h-[400px]">
              <ReactMarkdown
                className="prose prose-neutral dark:prose-invert max-w-none"
                components={{
                  h2: ({ node, ...props }) => (
                    <h2 className="text-xl font-bold mt-4 mb-2" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-lg font-semibold mt-3 mb-2" {...props} />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="space-y-2 my-4" {...props} />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="text-muted-foreground" {...props} />
                  ),
                  strong: ({ node, ...props }) => (
                    <strong className="font-semibold text-foreground" {...props} />
                  ),
                  p: ({ node, ...props }) => <p className="my-2" {...props} />,
                }}
              >
                {existingSummary.content}
              </ReactMarkdown>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No summary generated yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click "Generate" to create an AI-powered summary of your week
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Integration Breakdown */}
      {integrationBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activity by Integration</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={integrationBreakdown[0]?.slug} className="w-full">
              <TabsList>
                {integrationBreakdown.map((integration) => (
                  <TabsTrigger key={integration.slug} value={integration.slug}>
                    {integration.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {integrationBreakdown.map((integration) => (
                <TabsContent key={integration.slug} value={integration.slug}>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-4">
                      {integration.recentActivity?.map((activity: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-start justify-between border-b pb-4 last:border-0"
                        >
                          <div className="flex-1 min-w-0">
                            {activity.url ? (
                              <a
                                href={activity.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-sm text-primary hover:underline block truncate"
                              >
                                {activity.identifier && (
                                  <span className="text-muted-foreground mr-1">{activity.identifier}</span>
                                )}
                                {activity.title || activity.message || activity.text}
                              </a>
                            ) : (
                              <p className="font-medium text-sm truncate">
                                {activity.identifier && (
                                  <span className="text-muted-foreground mr-1">{activity.identifier}</span>
                                )}
                                {activity.title || activity.message || activity.text}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {activity.repo && (
                                <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                                  {activity.repo}
                                </span>
                              )}
                              {activity.team && (
                                <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                                  {activity.team}
                                </span>
                              )}
                              {activity.project && (
                                <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                                  {activity.project}
                                </span>
                              )}
                              {activity.priority && activity.priority !== "No priority" && (
                                <span className="text-xs text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">
                                  {activity.priority}
                                </span>
                              )}
                              {activity.labels?.length > 0 && activity.labels.slice(0, 2).map((label: string) => (
                                <span key={label} className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
                                  {label}
                                </span>
                              ))}
                              <span className="text-xs text-muted-foreground">
                                {activity.timestamp
                                  ? format(parseISO(activity.timestamp), "MMM d, h:mm a")
                                  : ""}
                              </span>
                            </div>
                          </div>
                          {activity.type && (
                            <Badge variant="outline" className="ml-2 shrink-0">
                              {activity.type}
                            </Badge>
                          )}
                        </div>
                      ))}
                      {(!integration.recentActivity ||
                        integration.recentActivity.length === 0) && (
                        <p className="text-muted-foreground text-center py-8">
                          No recent activity
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
