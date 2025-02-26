import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { startOfWeek, format, subWeeks, addWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, GitCommit } from 'lucide-react';
// import { Spinner } from '@radix-ui/themes';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWeeklyStats } from '@/hooks/useWeeklyStats';
import ReactMarkdown from 'react-markdown';
import ApiErrorHandler from '@/components/ApiErrorHandler';

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { data: weeklyStats, isLoading, error } = useWeeklyStats(selectedDate);

  useEffect(() => {
    console.log('Stats:', weeklyStats);
  }, [weeklyStats]);

  const navigateWeek = (direction: 'prev' | 'next') => {
    setSelectedDate((current) =>
      direction === 'prev' ? subWeeks(current, 1) : addWeeks(current, 1)
    );
  };

  if (error) {
    return <ApiErrorHandler error={error} />;
  }

  if (isLoading) {
    return (
      <div className="text-center">
        <div role="status">
          <svg
            aria-hidden="true"
            className="inline w-10 h-10 text-gray-200 animate-spin dark:text-gray-600 fill-purple-600"
            viewBox="0 0 100 101"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
              fill="currentColor"
            />
            <path
              d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
              fill="currentFill"
            />
          </svg>
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  const stats = weeklyStats?.stats;

  // Convert dailyCommits object to array for chart
  const dailyCommitsData = stats?.overallStatistics?.dailyCommits
    ? Object.values(stats.overallStatistics.dailyCommits)
        .map((day) => ({
          date: format(new Date(day.date), 'MMM d'),
          commits: day.count,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];

  console.log('dailyCommitsData', dailyCommitsData);

  // Convert repositories object to array for list
  const repoActivity = stats?.repositories
    ? Object.entries(stats.repositories).map(([name, data]) => ({
        name,
        commits: data.totalCommits,
        averageCommitsPerDay: data.statistics.averageCommitsPerDay,
        // These will be used later when we add PR support
        pull_requests: 0,
        merged_prs: 0,
      }))
    : [];

  return (
    // <Spinner size="3" loading={true}>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Your productivity stats for the week of{' '}
            {format(
              startOfWeek(selectedDate, { weekStartsOn: 1 }),
              'MMM d, yyyy'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateWeek('prev')}
            className="p-0"
          >
            <ChevronLeft className="h-4 w-4" color="black" />
          </Button>
          {format(
            startOfWeek(selectedDate, { weekStartsOn: 1 }),
            'yyyy-MM-dd'
          ) !==
            format(
              startOfWeek(new Date(), { weekStartsOn: 1 }),
              'yyyy-MM-dd'
            ) && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateWeek('next')}
              className="p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commits</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.overallStatistics?.totalCommits || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.overallStatistics?.averageCommitsPerDay.toFixed(1)}{' '}
              commits/day
            </p>
          </CardContent>
        </Card>
        {/* Comment out PR cards for now but keep the UI structure */}
        {/* <Card className="opacity-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pull Requests</CardTitle>
              <GitPullRequest className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Coming soon</div>
            </CardContent>
          </Card>
          <Card className="opacity-50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Merged PRs</CardTitle>
              <GitMerge className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Coming soon</div>
            </CardContent>
          </Card> */}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Activity Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dailyCommitsData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="commits"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Weekly Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyStats?.summary?.choices?.[0]?.message?.content ? (
              <ReactMarkdown
                className="prose prose-neutral dark:prose-invert max-w-none"
                components={{
                  // Customize heading styles
                  h2: ({ node, ...props }) => (
                    <h2 className="text-xl font-bold mt-4 mb-2" {...props} />
                  ),
                  // Customize bullet points
                  ul: ({ node, ...props }) => (
                    <ul className="space-y-2 my-4" {...props} />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="text-muted-foreground" {...props} />
                  ),
                  // Style strong text (bold)
                  strong: ({ node, ...props }) => (
                    <strong
                      className="font-semibold text-foreground"
                      {...props}
                    />
                  ),
                  // Add proper spacing for paragraphs
                  p: ({ node, ...props }) => <p className="my-2" {...props} />,
                }}
              >
                {weeklyStats.summary.choices[0].message.content.replace(
                  /```$/,
                  ''
                )}
              </ReactMarkdown>
            ) : (
              <p className="text-muted-foreground">
                No summary available for this week.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Repository Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                {repoActivity.map((repo) => (
                  <div
                    key={repo.name}
                    className="flex items-center justify-between border-b pb-4"
                  >
                    <div>
                      <p className="font-medium">{repo.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {repo.averageCommitsPerDay.toFixed(1)} commits/day
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">Commits</p>
                        <p className="text-sm text-muted-foreground">
                          {repo.commits}
                        </p>
                      </div>
                      {/* Keep PR stats UI but comment out for now */}
                      {/* <div className="text-right opacity-50">
                          <p className="text-sm font-medium">PRs</p>
                          <p className="text-sm text-muted-foreground">Soon</p>
                        </div> */}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
    // </Spinner>
  );
}
