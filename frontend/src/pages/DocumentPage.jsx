import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getDocumentDetails, getDocumentViews, getDocumentStats } from '../services/api';
import { DocumentHeader } from '../components/documents/DocumentHeader';
import { LinksTable } from '../components/documents/LinksTable';
import { VisitorsTable } from '../components/documents/VisitorsTable';
import { Stats } from '../components/documents/Stats';
import { Skeleton } from '../components/ui/Skeleton';
import { LinkSheet } from '../components/links/LinkSheet';
import { DocumentPreviewModal } from '../components/documents/DocumentPreviewModal';

export function DocumentPage() {
  const { documentId } = useParams();
  const [document, setDocument] = useState(null);
  const [stats, setStats] = useState(null);
  const [viewsData, setViewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [isLinkSheetOpen, setIsLinkSheetOpen] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchDocumentAndStats = useCallback(async () => {
    try {
      setLoading(true);
      const [docResponse, statsResponse] = await Promise.all([
        getDocumentDetails(documentId),
        getDocumentStats(documentId),
      ]);
      setDocument(docResponse.data);
      setStats(statsResponse.data);
    } catch (err) {
      // API errors are handled by the global interceptor in api.js
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  const fetchViews = useCallback(async () => {
    try {
      setViewsLoading(true);
      const response = await getDocumentViews(documentId, currentPage);
      setViewsData(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setViewsLoading(false);
    }
  }, [documentId, currentPage]);

  useEffect(() => {
    fetchDocumentAndStats();
  }, [fetchDocumentAndStats]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  const handleCreateLink = () => {
    setEditingLink(null);
    setIsLinkSheetOpen(true);
  };

  const handleEditLink = (link) => {
    setEditingLink(link);
    setIsLinkSheetOpen(true);
  };

  const handlePreview = () => {
    setIsPreviewOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-1/4" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div>
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center">
        <p>Document not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <DocumentHeader document={document} onCreateLink={handleCreateLink} onPreview={handlePreview} />
      <div className="mt-8 space-y-8">
        <Stats stats={stats} />
        <LinksTable links={document.share_links} onEditLink={handleEditLink} />
        <VisitorsTable
          views={viewsData?.results || []}
          totalCount={viewsData?.count || 0}
          loading={viewsLoading}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={10}
        />
      </div>
      <LinkSheet
        isOpen={isLinkSheetOpen}
        onOpenChange={setIsLinkSheetOpen}
        document={document}
        currentLink={editingLink}
        onSuccess={() => {
          fetchDocumentAndStats();
          fetchViews();
        }}
      />
      <DocumentPreviewModal
        isOpen={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        documentId={documentId}
      />
    </div>
  );
}
