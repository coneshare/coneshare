import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { Loader2, AlertTriangle } from 'lucide-react';
import { getDocumentDetails, getDocumentViews, getDocumentStats, deleteShareLink, uploadNewVersion, getDocumentDownloadUrl, deleteDocument, getDataroom, getDataroomFolderContents } from '../services/api';
import { DocumentHeader } from '../components/documents/DocumentHeader';
import { LinksTable } from '../components/documents/LinksTable';
import { ViewSessionsTable } from '../components/documents/ViewSessionsTable';
import { Stats } from '../components/documents/Stats';
import { Skeleton } from '../components/ui/Skeleton';
import { LinkSheet } from '../components/links/LinkSheet';
import { DocumentPreviewModal } from '../components/documents/DocumentPreviewModal';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';

export function DocumentPage() {
  const { documentId } = useParams();
  const [searchParams] = useSearchParams();
  const { setBreadcrumbData } = useBreadcrumb();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [stats, setStats] = useState(null);
  const [viewsData, setViewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [isLinkSheetOpen, setIsLinkSheetOpen] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [linkToDelete, setLinkToDelete] = useState(null);
  const [isDeleteDocDialogOpen, setIsDeleteDocDialogOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [isVersionMismatchDialogOpen, setIsVersionMismatchDialogOpen] = useState(false);
  const [newVersionFile, setNewVersionFile] = useState(null);

  const fetchDocumentAndStats = useCallback(async (options = {}) => {
    const fromDataroomId = searchParams.get('from_dataroom');
    const fromFolderId = searchParams.get('from_folder');
    const { showSkeleton = true } = options;
    try {
      if (showSkeleton) {
        setLoading(true);
      }

      let dataroomContextData = null;
      if (fromDataroomId) {
        try {
          const drResponse = await getDataroom(fromDataroomId);
          let drFolderResponse = null;
          if (fromFolderId) {
            drFolderResponse = await getDataroomFolderContents(fromFolderId);
          }
          dataroomContextData = {
            dataroom: drResponse.data,
            folder: drFolderResponse ? drFolderResponse.data : null,
          };
        } catch (contextError) {
          console.error("Failed to fetch dataroom context:", contextError);
          // Continue without context if it fails
        }
      }

      const [docResponse, statsResponse] = await Promise.all([
        getDocumentDetails(documentId),
        getDocumentStats(documentId),
      ]);
      setDocument(docResponse.data);
      setStats(statsResponse.data);
      setBreadcrumbData({
        folder: docResponse.data.folder,
        documentName: docResponse.data.name,
        dataroomContext: dataroomContextData,
      });
    } catch (err) {
      // API errors are handled by the global interceptor in api.js
      console.error(err);
    } finally {
      if (showSkeleton) {
        setLoading(false);
      }
    }
  }, [documentId, searchParams, setBreadcrumbData]);

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
    return () => {
      setBreadcrumbData(null);
    };
  }, [fetchDocumentAndStats, setBreadcrumbData]);

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

  const handleDeleteLink = (link) => {
    setLinkToDelete(link);
    setIsDeleteDialogOpen(true);
  };

  const handleLinkUpdate = useCallback((updatedLink) => {
    if (updatedLink) {
      // Granular update for status toggle
      setDocument(prevDoc => {
        if (!prevDoc) return null;
        const newLinks = prevDoc.share_links.map(link =>
          link.id === updatedLink.id ? updatedLink : link
        );
        return { ...prevDoc, share_links: newLinks };
      });
    } else {
      // Full refresh for create/edit from LinkSheet
      fetchDocumentAndStats({ showSkeleton: false });
      fetchViews();
    }
  }, [fetchDocumentAndStats, fetchViews]);  

  const handleConfirmDelete = async () => {
    if (!linkToDelete) return;

    try {
      await deleteShareLink(linkToDelete.id);
      toast.success(`Link "${linkToDelete.name || 'Untitled Link'}" deleted successfully.`);
      // Refresh data
      fetchDocumentAndStats({ showSkeleton: false });
      fetchViews();
    } catch (error) {
      // Error toast is handled by the API interceptor
    } finally {
      setIsDeleteDialogOpen(false);
      setLinkToDelete(null);
    }
  };

  const handlePreview = () => {
    setIsPreviewOpen(true);
  };

  const handleDownload = async () => {
    const toastId = toast.loading('Preparing download...');
    try {
      const response = await getDocumentDownloadUrl(documentId);
      window.open(response.data.download_url, '_blank');
      toast.success('Download started.', { id: toastId });
    } catch (error) {
      // The API interceptor will show a more specific error message.
      toast.dismiss(toastId);
    }
  };

  const handleDelete = () => {
    setIsDeleteDocDialogOpen(true);
  };

  const handleConfirmDeleteDoc = async () => {
    if (!document) return;
    try {
      await deleteDocument(documentId);
      toast.success(`Document "${document.name}" deleted.`);
      navigate('/documents');
    } catch (error) {
      // Error is handled by API interceptor
    } finally {
      setIsDeleteDocDialogOpen(false);
    }
  };

  const performUpload = async (file) => {
    if (!file) return;

    const toastId = toast.loading(`Uploading new version: ${file.name}...`);
    try {
      await uploadNewVersion(documentId, file);
      toast.success('New version uploaded successfully. Processing has started.', { id: toastId });
      // Refresh data to show processing status
      fetchDocumentAndStats({ showSkeleton: false });
      fetchViews();
    } catch (error) {
      // The API interceptor will show a generic error toast.
      // We can dismiss the loading toast here.
      toast.dismiss(toastId);
    }
  };

  const handleFileSelected = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset file input so user can select the same file again
    event.target.value = null;

    const getExtension = (filename) => {
      const lastDotIndex = filename.lastIndexOf('.');
      // No extension if '.' is not found, is the first character, or is the last character.
      if (lastDotIndex < 1 || lastDotIndex === filename.length - 1) {
        return '';
      }
      return filename.substring(lastDotIndex + 1).toLowerCase();
    };
    const currentExtension = getExtension(document.name);
    const newExtension = getExtension(file.name);

    if (currentExtension !== newExtension) {
      setNewVersionFile(file);
      setIsVersionMismatchDialogOpen(true);
    } else {
      performUpload(file);
    }
  };  

  const handleConfirmUpload = () => {
    performUpload(newVersionFile);
    setIsVersionMismatchDialogOpen(false);
    setNewVersionFile(null);
  };

  const handleUploadNewVersionClick = () => {
    fileInputRef.current?.click();
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

  const isProcessing = document.status === 'processing' || document.status === 'uploading';
  const isError = document.status === 'error';

  return (
    <div className="container mx-auto p-4 sm:p-6">
      {(isProcessing || isError) && (
        <div className={`mb-6 rounded-md p-4 ${isError ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'}`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">
                {document.status_message || (isProcessing ? 'Your document is being processed. This may take a few moments.' : 'An error occurred while processing this document.')}
              </p>
            </div>
          </div>
        </div>
      )}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
      <DocumentHeader
        document={document}
        onCreateLink={handleCreateLink}
        onPreview={handlePreview}
        onUploadNewVersion={handleUploadNewVersionClick}
        onDownload={handleDownload}
        onDelete={handleDelete}
      />
      <div className="mt-8 space-y-8">
        <Stats stats={stats} />
        <LinksTable
          links={document.share_links}
          onEditLink={handleEditLink}
          onDeleteLink={handleDeleteLink}
          onLinkUpdate={handleLinkUpdate}
          contextType="document"
        />
        <ViewSessionsTable
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
        onSuccess={handleLinkUpdate}
      />
      <DocumentPreviewModal
        isOpen={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        documentId={documentId}
      />
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Share Link"
        description={`Are you sure you want to permanently delete the link "${linkToDelete?.name || 'Untitled Link'}"? This action cannot be undone.`}
        confirmText="Delete"
      />
      <ConfirmationDialog
        isOpen={isDeleteDocDialogOpen}
        onOpenChange={setIsDeleteDocDialogOpen}
        onConfirm={handleConfirmDeleteDoc}
        title="Delete Document"
        description={`Are you sure you want to permanently delete "${document?.name}"? All associated links and data will be removed. This action cannot be undone.`}
        confirmText="Delete"
      />
      <ConfirmationDialog
        isOpen={isVersionMismatchDialogOpen}
        onOpenChange={setIsVersionMismatchDialogOpen}
        onConfirm={handleConfirmUpload}
        title="File Type Mismatch"
        description={`The file you selected has a different type than the original document. Are you sure you want to replace it with "${newVersionFile?.name}"?`}
        confirmText="Upload"
      />
    </div>
  );
}
