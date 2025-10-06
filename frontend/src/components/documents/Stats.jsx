function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0s';

  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);

  let result = '';
  if (m > 0) result += `${m}m `;
  if (s > 0 || m === 0) result += `${s}s`;

  return result.trim();
}

export function Stats({ stats }) {
  const totalViews = stats?.total_views || 0;
  const formattedAvgDuration = formatDuration(stats?.avg_duration_seconds || 0);

  const statItems = [
    { name: 'Number of visits', value: totalViews },
    { name: 'Number of reactions', value: 0 }, // Placeholder as per request
    { name: 'Avg. view duration', value: formattedAvgDuration },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold">Analytics</h2>
      <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
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
