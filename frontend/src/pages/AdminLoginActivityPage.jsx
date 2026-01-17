import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import * as api from '../services/api';
import { AdminNav } from '../components/admin/AdminNav';
import { Skeleton } from '../components/ui/Skeleton';

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
        <Skeleton className="h-4 w-48" />
      </td>
    </tr>
  );
}

export function AdminLoginActivityPage() {
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // TODO: Add pagination controls

  useEffect(() => {
    const fetchActivities = async () => {
      setIsLoading(true);
      try {
        const response = await api.getAdminLoginActivities();
        setActivities(response.data.results);
      } finally {
        setIsLoading(false);
      }
    };
    fetchActivities();
  }, []);

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
              : activities.map((activity) => (
                  <tr key={activity.id} className="border-b">
                    <td className="p-4">
                      <div className="font-medium">{activity.user_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {activity.user_email}
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      <div title={new Date(activity.created_at).toLocaleString()}>
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
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
                      <div className="w-64 truncate" title={activity.user_agent}>
                        {activity.user_agent}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
