import { useQuery } from '@tanstack/react-query';
import { fetchWeeklyStats, WeeklyStats } from '@/lib/api';
import { format, startOfWeek } from 'date-fns';

export function useWeeklyStats(date: Date, refreshData: boolean = false) {
  const weekStart = format(
    startOfWeek(date, { weekStartsOn: 1 }),
    'yyyy-MM-dd'
  );

  return useQuery<WeeklyStats>({
    queryKey: ['weeklyStats', weekStart],
    queryFn: () => fetchWeeklyStats(weekStart, refreshData),
  });
}
