import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRelativeTime } from '../utils/formatters';
import * as api from '../services/api';
import { AdminNav } from '../components/admin/AdminNav';
import { Pagination } from '../components/ui/Pagination';
import { Skeleton } from '../components/ui/Skeleton';
import { parseUserAgent } from '../lib/utils';

function SkeletonRow() {
  return (
    <tr className="border-b">
      <td className="p-4">
        <div className="space-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </td>
      <td className="p-4">
        <Skeleton className="h-4 w-24" />
      </td>
      <td className="p-4">
        <div className="space-y-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      </td>
      <td className="p-4">
        <div className="space-y-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-48" />
        </div>
      </td>
    </tr>
  );
}

export function AdminLoginActivityPage() {
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10; // Corresponds to backend's StandardResultsSetPagination

  useEffect(() => {
    const fetchActivities = async (page) => {
      setIsLoading(true);
      try {
        const response = await api.getAdminLoginActivities(page);
        setActivities(response.data.results);
        setTotalCount(response.data.count);
      } finally {
        setIsLoading(false);
      }
    };
    fetchActivities(currentPage);
  }, [currentPage]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="container mx-auto py-6">
      <AdminNav />
      <h2 className="mb-4 text-2xl font-bold">User Login Activity</h2>
      <div className="overflow-hidden rounded-lg border">
        <table className="min-w-full">
          <thead className="bg-muted/50">
            <tr className="border-b">
              <th className="p-4 text-left font-semibold">User</th>
              <th className="p-4 text-left font-semibold">Time</th>
              <th className="p-4 text-left font-semibold">Location</th>
              <th className="p-4 text-left font-semibold">User Agent</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? [...Array(10)].map((_, i) => <SkeletonRow key={i} />)
              : activities.map((activity) => {
                  const { browser, os } = parseUserAgent(activity.user_agent);
                  return (
                    <tr key={activity.id} className="border-b">
                      <td className="p-4">
                        {activity.user_id ? (
                          <>
                            <div className="font-medium">
                              <Link to={`/admin/users/${activity.user_id}`} className="hover:underline">
                                {activity.user_name || 'Unnamed User'}
                              </Link>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <Link to={`/admin/users/${activity.user_id}`} className="hover:underline text-muted-foreground">
                                {activity.user_email}
                              </Link>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium">{activity.user_name || 'Unnamed User'}</div>
                            <div className="text-sm text-muted-foreground">
                              {activity.user_email}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        <div title={new Date(activity.created_at).toLocaleString()}>
                          {formatRelativeTime(activity.created_at)}
                        </div>
                      </td>
                      <td className="p-4 font-mono text-sm text-muted-foreground">
                        <div>{activity.ip_address}</div>
                        <div className="text-xs">
                          {activity.city && activity.country
                            ? `${activity.city}, ${activity.country}`
                            : activity.city || activity.country}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        <div>
                          {browser} on {os}
                        </div>
                        <div className="w-64 truncate text-xs" title={activity.user_agent}>
                          {activity.user_agent}
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
