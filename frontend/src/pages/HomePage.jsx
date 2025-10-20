import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { getDashboardSummary, getDailyVisits } from '../services/api';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { ArrowRight } from 'lucide-react';
import { ViewSessionsTable } from '../components/documents/ViewSessionsTable';
import { LinksTable } from '../components/documents/LinksTable';

function DailyVisitsChart({ data, loading }) {
  if (loading) {
    return <Skeleton className="h-[300px] w-full" />;
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={(str) => format(parseISO(str), 'MMM d')} />
        <YAxis />
        <Tooltip />
        <Bar dataKey="visits" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function HomePage() {
  const [summaryData, setSummaryData] = useState(null);
  const [visitsData, setVisitsData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [summaryRes, visitsRes] = await Promise.all([
          getDashboardSummary(),
          getDailyVisits(),
        ]);
        setSummaryData(summaryRes.data);
        setVisitsData(visitsRes.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="space-y-8 p-4 sm:p-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900">
        <h2 className="mb-4 text-xl font-semibold">Daily Visits (Last 30 Days)</h2>
        <DailyVisitsChart data={visitsData} loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Latest View Sessions</h2>
            <Button asChild variant="link">
              <Link to="/analytics/view-sessions">
                View all <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-4">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ViewSessionsTable
                views={summaryData?.recent_views || []}
                isDashboardWidget
              />
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent Active Links</h2>
            <Button asChild variant="link">
              <Link to="/analytics/links">
                View all <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-4">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <LinksTable
                links={summaryData?.recent_links || []}
                isDashboardWidget
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
