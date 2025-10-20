import { useEffect, useState, useCallback } from 'react';
import { getAllViewSessions } from '../services/api';
import { ViewSessionsTable } from '../components/documents/ViewSessionsTable';
import { Skeleton } from '../components/ui/Skeleton';
import { Pagination } from '../components/ui/Pagination';

export function AllViewSessionsPage() {
  const [viewsData, setViewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchViews = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getAllViewSessions(currentPage);
      setViewsData(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  const totalPages = viewsData ? Math.ceil(viewsData.count / pageSize) : 0;

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">All View Sessions</h1>
        <p className="text-muted-foreground">
          Showing all {viewsData?.count || 0} recorded view sessions across all links.
        </p>
      </div>
      <div className="mt-8">
        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <ViewSessionsTable views={viewsData?.results || []} />
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
