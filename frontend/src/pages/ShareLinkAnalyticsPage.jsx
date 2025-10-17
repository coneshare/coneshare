import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getShareLinkDetails, getShareLinkViewSessions } from '../services/api';
import { ViewSessionsTable } from '../components/documents/ViewSessionsTable';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { ArrowLeft } from 'lucide-react';

export function ShareLinkAnalyticsPage() {
  const { documentId, linkId } = useParams();
  const [link, setLink] = useState(null);
  const [viewsData, setViewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLinkDetails = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getShareLinkDetails(linkId);
      setLink(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [linkId]);

  const fetchViews = useCallback(async () => {
    try {
      setViewsLoading(true);
      const response = await getShareLinkViewSessions(linkId, currentPage);
      setViewsData(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setViewsLoading(false);
    }
  }, [linkId, currentPage]);

  useEffect(() => {
    fetchLinkDetails();
  }, [fetchLinkDetails]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!link) {
    return (
      <div className="flex h-full items-center justify-center">
        <p>Link not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <div className="mb-8">
        <Button asChild variant="outline">
          <Link to={`/documents/${documentId}`} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Document</span>
          </Link>
        </Button>
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          View Sessions for "{link.name || 'Untitled Link'}"
        </h1>
        <p className="text-muted-foreground">
          Showing all {viewsData?.count || 0} recorded view sessions for this share link.
        </p>
      </div>
      <div className="mt-8">
        <ViewSessionsTable
          views={viewsData?.results || []}
          totalCount={viewsData?.count || 0}
          loading={viewsLoading}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={10}
        />
      </div>
    </div>
  );
}
