import { useTranslation } from 'react-i18next';
import { Skeleton } from '../ui/Skeleton';

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0s';

  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);

  let result = '';
  if (m > 0) result += `${m}m `;
  if (s > 0 || m === 0) result += `${s}s`;

  return result.trim();
}

export function Stats({ stats, loading = false, expectedColumns = 4 }) {
  const { t } = useTranslation();

  if (loading) {
    const colClass = expectedColumns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3';
    return (
      <div>
        <h2 className="text-xl font-semibold">{t('analytics.title')}</h2>
        <div className={`mt-4 grid grid-cols-1 gap-5 ${colClass}`}>
          {Array.from({ length: expectedColumns }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-lg border bg-white px-4 py-5 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalViews = stats?.total_views || 0;
  const formattedAvgDuration = formatDuration(stats?.avg_duration_seconds || 0);
  const totalDownloads = stats?.total_downloads || 0;
  const hasUniqueViewers = stats?.unique_viewers !== undefined;

  const statItems = [
    { name: t('analytics.numberOfVisits'), value: totalViews },
    ...(hasUniqueViewers ? [{ name: t('analytics.uniqueVisitors', { defaultValue: 'Unique Visitors' }), value: stats.unique_viewers }] : []),
    { name: t('analytics.numberOfDownloads'), value: totalDownloads },
    { name: t('analytics.avgViewDuration'), value: formattedAvgDuration },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold">{t('analytics.title')}</h2>
      <dl className={`mt-4 grid grid-cols-1 gap-5 ${statItems.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        {statItems.map((stat) => (
          <div key={stat.name} className="overflow-hidden rounded-lg border bg-white px-4 py-5 shadow-sm sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">{stat.name}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
