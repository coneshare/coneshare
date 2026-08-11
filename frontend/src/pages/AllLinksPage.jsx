import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { getAllActiveLinks } from '../services/api';
import { LinksTable } from '../components/documents/LinksTable';
import { Skeleton } from '../components/ui/Skeleton';
import { Pagination } from '../components/ui/Pagination';
import { Button } from '../components/ui/Button';

export function AllLinksPage() {
  const { t } = useTranslation();
  const [linksData, setLinksData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchLinks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getAllActiveLinks(currentPage);
      setLinksData(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const totalPages = linksData ? Math.ceil(linksData.count / pageSize) : 0;

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <div className="mb-8">
        <Button asChild variant="outline">
          <Link to="/" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>{t('common.backToDashboard')}</span>
          </Link>
        </Button>
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">All Active Links</h1>
        <p className="text-muted-foreground">
          Showing all {linksData?.count || 0} active links, sorted by the most recently viewed.
        </p>
      </div>
      <div className="mt-8">
        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <LinksTable links={linksData?.results || []} isDashboardWidget />
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
