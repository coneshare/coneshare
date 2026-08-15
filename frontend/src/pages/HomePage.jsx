import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { getDashboardSummary, getDailyVisits } from '../services/api';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { ArrowRight } from 'lucide-react';
import { ViewSessionsTable } from '../components/documents/ViewSessionsTable';
import { LinksTable } from '../components/documents/LinksTable';

function DailyVisitsChart({ data, loading }) {
  const { t } = useTranslation();

  if (loading) {
    return <Skeleton className="h-[300px] w-full" />;
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={(str) => format(parseISO(str), 'MMM d')} />
        <YAxis />
        <Tooltip name={t('dashboard.visits')} />
        <Bar dataKey="visits" name={t('dashboard.visits')} fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function HomePage() {
  const { t } = useTranslation();
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
      <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>

      <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900">
        <h2 className="mb-4 text-xl font-semibold">{t('dashboard.dailyVisits')}</h2>
        <DailyVisitsChart data={visitsData} loading={loading} />
      </div>

      <div className="space-y-8">
        <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t('dashboard.latestViewSessions')}</h2>
            <Button asChild variant="link">
              <Link to="/analytics/view-sessions">
                {t('common.viewAll')} <ArrowRight className="ml-2 h-4 w-4" />
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
                totalCount={summaryData?.recent_views?.length || 0}
                pageSize={10}
              />
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{t('dashboard.recentActiveLinks')}</h2>
            <Button asChild variant="link">
              <Link to="/analytics/links">
                {t('common.viewAll')} <ArrowRight className="ml-2 h-4 w-4" />
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
