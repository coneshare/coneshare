import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { ArrowLeft } from 'lucide-react';
import { getDocumentDetails, promoteDocumentVersion, getDocumentVersions } from '../services/api';
import { VersionHistoryTable } from '../components/documents/VersionHistoryTable';
import { DocumentPreviewModal } from '../components/documents/DocumentPreviewModal';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';

export function DocumentVersionsPage() {
  const { documentId } = useParams();
  const { setBreadcrumbData } = useBreadcrumb();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [versionsData, setVersionsData] = useState(null);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState(null);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState(null);

  const fetchDocument = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getDocumentDetails(documentId);
      setDocument(response.data);
      setBreadcrumbData({
        folder: response.data.folder,
        documentName: response.data.name,
        extraCrumb: 'Version History',
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [documentId, setBreadcrumbData]);

  const fetchVersions = useCallback(async () => {
    try {
      setVersionsLoading(true);
      const response = await getDocumentVersions(documentId, currentPage);
      setVersionsData(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setVersionsLoading(false);
    }
  }, [documentId, currentPage]);

  useEffect(() => {
    fetchDocument();
    return () => {
      setBreadcrumbData(null);
    };
  }, [fetchDocument, setBreadcrumbData]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handlePreviewVersion = (version) => {
    setPreviewVersionId(version.id);
    setIsPreviewOpen(true);
  };

  const handlePromoteVersion = (version) => {
    setVersionToRestore(version);
    setIsRestoreDialogOpen(true);
  };

  const handleConfirmRestoreVersion = async () => {
    if (!versionToRestore) return;
    const toastId = toast.loading(`Restoring version v${versionToRestore.version_number}...`);
    try {
      await promoteDocumentVersion(documentId, versionToRestore.id);
      toast.success(`Successfully restored version v${versionToRestore.version_number} as active.`, { id: toastId });
      fetchDocument();
      fetchVersions();
    } catch (error) {
      toast.dismiss(toastId);
    } finally {
      setIsRestoreDialogOpen(false);
      setVersionToRestore(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-48 w-full" />
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
      <div className="mb-8">
        <Button asChild variant="outline">
          <Link to={`/documents/${documentId}`} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Document</span>
          </Link>
        </Button>
      </div>

      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold leading-6 text-gray-900">
            Version History for "{document.name}"
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Preview older versions or restore them as the active version.
          </p>
        </div>

        <VersionHistoryTable
          versions={Array.isArray(versionsData) ? versionsData : (versionsData?.results || [])}
          totalCount={Array.isArray(versionsData) ? versionsData.length : (versionsData?.count || 0)}
          loading={versionsLoading}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={10}
          onPreviewVersion={handlePreviewVersion}
          onPromoteVersion={handlePromoteVersion}
        />
      </div>

      <DocumentPreviewModal
        isOpen={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        documentId={documentId}
        versionId={previewVersionId}
      />

      <ConfirmationDialog
        isOpen={isRestoreDialogOpen}
        onOpenChange={setIsRestoreDialogOpen}
        onConfirm={handleConfirmRestoreVersion}
        title="Restore Document Version"
        description={versionToRestore ? `Are you sure you want to restore version v${versionToRestore.version_number} as the active version? This will immediately update all active share links to point to this version.` : ''}
        confirmText="Restore"
      />
    </div>
  );
}
