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
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWeeklyStats } from '@/hooks/useWeeklyStats';

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
    return <div>Error loading stats</div>;
  }

  if (isLoading) {
    return <div>Loading...</div>;
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Your productivity stats for the week of{' '}
            {format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateWeek('next')}
            disabled={
              format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd') ===
              format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commits</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.overallStatistics?.totalCommits || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.overallStatistics?.averageCommitsPerDay.toFixed(1)} commits/day
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
            <p className="text-muted-foreground">
              {weeklyStats?.summary?.choices[0]?.message?.content ||
                'No summary available for this week.'}
            </p>
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
                  <div key={repo.name} className="flex items-center justify-between border-b pb-4">
                    <div>
                      <p className="font-medium">{repo.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {repo.averageCommitsPerDay.toFixed(1)} commits/day
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">Commits</p>
                        <p className="text-sm text-muted-foreground">{repo.commits}</p>
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
  );
}
