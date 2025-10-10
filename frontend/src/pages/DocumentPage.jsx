import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getDocumentDetails, getDocumentViews, getDocumentStats, deleteShareLink, uploadNewVersion } from '../services/api';
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
  const fileInputRef = useRef(null);
  const [isVersionMismatchDialogOpen, setIsVersionMismatchDialogOpen] = useState(false);
  const [newVersionFile, setNewVersionFile] = useState(null);

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
      fetchDocumentAndStats();
      fetchViews();
    }
  }, [fetchDocumentAndStats, fetchViews]);  

  const handleConfirmDelete = async () => {
    if (!linkToDelete) return;

    try {
      await deleteShareLink(linkToDelete.id);
      toast.success(`Link "${linkToDelete.name || 'Untitled Link'}" deleted successfully.`);
      // Refresh data
      fetchDocumentAndStats();
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

  const performUpload = async (file) => {
    if (!file) return;

    const toastId = toast.loading(`Uploading new version: ${file.name}...`);
    try {
      await uploadNewVersion(documentId, file);
      toast.success('New version uploaded successfully. Processing has started.', { id: toastId });
      // Refresh data to show processing status
      fetchDocumentAndStats();
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

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
      <DocumentHeader document={document} onCreateLink={handleCreateLink} onPreview={handlePreview} onUploadNewVersion={handleUploadNewVersionClick} />
      <div className="mt-8 space-y-8">
        <Stats stats={stats} />
        <LinksTable
          links={document.share_links}
          onEditLink={handleEditLink}
          onDeleteLink={handleDeleteLink}
          onLinkUpdate={handleLinkUpdate}
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
