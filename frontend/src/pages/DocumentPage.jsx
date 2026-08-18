import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../contexts/UserProvider';
import { toast } from 'sonner';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { Loader2, AlertTriangle } from 'lucide-react';
import { renameDocument, getDocumentDetails, getDocumentStatus, getDocumentViews, getDocumentStats, deleteShareLink, uploadNewVersion, getDocumentDownloadUrl, deleteDocument, getDataroom, getDataroomFolderContents, getCloudProviders, getCloudConnections, getDropboxConnectUrl, getGoogleDriveConnectUrl, getNextcloudConnectUrl, refreshCloudDocument, importCloudVersion } from '../services/api';
import { getLocalizedErrorMessage } from '../utils/errorTranslator';
import { DocumentHeader } from '../components/documents/DocumentHeader';
import { LinksTable } from '../components/documents/LinksTable';
import { ViewSessionsTable } from '../components/documents/ViewSessionsTable';
import { Stats } from '../components/documents/Stats';
import { Skeleton } from '../components/ui/Skeleton';
import { LinkSheet } from '../components/links/LinkSheet';
import { DocumentPreviewModal } from '../components/documents/DocumentPreviewModal';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { OwnerQnAManager } from '../components/qna/OwnerQnAManager';
import { CloudImportDialog } from '../components/dialogs/CloudImportDialog';

export function DocumentPage() {
  const { documentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setBreadcrumbData } = useBreadcrumb();
  const { refreshUser } = useUser();
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
  const [cloudProviders, setCloudProviders] = useState([]);
  const [cloudConnections, setCloudConnections] = useState([]);
  const [isCloudImportOpen, setIsCloudImportOpen] = useState(false);
  const [activeCloudImport, setActiveCloudImport] = useState(null);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const [providersRes, connectionsRes] = await Promise.all([
          getCloudProviders(),
          getCloudConnections(),
        ]);
        setCloudProviders(providersRes.data);
        setCloudConnections(connectionsRes.data);
      } catch (error) {
        console.error("Failed to fetch cloud providers or connections:", error);
      }
    };
    fetchProviders();
  }, []);

  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'share') {
      setIsLinkSheetOpen(true);
      // Clean up the URL so the modal doesn't re-open on refresh
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('action');
      setSearchParams(newSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
          const contextPromises = [getDataroom(fromDataroomId)];
          if (fromFolderId) {
            contextPromises.push(getDataroomFolderContents(fromFolderId));
          }
          const [drResponse, drFolderResponseResult] = await Promise.all(contextPromises);
          dataroomContextData = {
            dataroom: drResponse.data,
            folder: drFolderResponseResult ? drFolderResponseResult.data : null,
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

  useEffect(() => {
    if (!document) return;
    const isProcessingStatus = document.status === 'processing' || document.status === 'uploading';
    if (!isProcessingStatus) return;

    let isCancelled = false;
    let timerId = null;

    const poll = async () => {
      try {
        const response = await getDocumentStatus(documentId);
        if (isCancelled) return;

        const statusData = response.data;
        setDocument(prev => {
          if (!prev) return null;
          return {
            ...prev,
            status: statusData.status,
            status_message: statusData.status_message
          };
        });

        const stillProcessing = statusData.status === 'processing' || statusData.status === 'uploading';
        if (stillProcessing) {
          timerId = setTimeout(poll, 3000);
        } else {
          // When processing finally finishes, do a full reload of document details and stats
          fetchDocumentAndStats({ showSkeleton: false });
        }
      } catch (err) {
        console.error("Polling document status failed:", err);
        if (!isCancelled) {
          timerId = setTimeout(poll, 3000);
        }
      }
    };

    timerId = setTimeout(poll, 3000);

    return () => {
      isCancelled = true;
      clearTimeout(timerId);
    };
  }, [document?.status, documentId, fetchDocumentAndStats]);

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

  const handleRenameDocument = async (newName) => {
    try {
      await renameDocument(documentId, newName);
      setDocument(prev => ({ ...prev, name: newName }));
      setBreadcrumbData(prev => prev ? { ...prev, documentName: newName } : null);
      toast.success("Document renamed successfully.");
    } catch (error) {
      console.error("Failed to rename document:", error);
      toast.error(getLocalizedErrorMessage(error, "Failed to rename document."));
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
      refreshUser(); // Refresh user quota
      navigate('/documents');
    } catch (error) {
      // The API interceptor will show a more specific error message.
    } finally {
      setIsDeleteDocDialogOpen(false);
    }
  };

  const performUpload = async (file) => {
    if (!file) return;

    const toastId = toast.loading(`Uploading new version: ${file.name}...`);
    try {
      const response = await uploadNewVersion(documentId, file);
      toast.success('New version uploaded successfully. Processing has started.', { id: toastId });
      refreshUser(); // Refresh user quota
      setDocument(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: response.data.status,
          status_message: response.data.status_message
        };
      });
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

  const handleCloudProviderClick = async (provider) => {
    if (provider.is_connected) {
      const connection = cloudConnections.find(c => c.provider === provider.name);
      if (connection) {
        setActiveCloudImport({ provider, connection });
        setIsCloudImportOpen(true);
      } else {
        toast.error(`Could not find connection details for ${provider.display_name}. Please try again or reconnect.`);
      }
    } else {
      try {
        let response;
        if (provider.name === 'dropbox') {
          response = await getDropboxConnectUrl();
        } else if (provider.name === 'google_drive') {
          response = await getGoogleDriveConnectUrl();
        } else if (provider.name === 'nextcloud') {
          response = await getNextcloudConnectUrl();
        } else {
          toast.error(`Connecting to ${provider.display_name} is not supported yet.`);
          return;
        }
        window.location.href = response.data.authorization_url;
      } catch (error) {
        console.error(`Failed to get ${provider.display_name} connect URL:`, error);
      }
    }
  };

  const handleImportCloudVersion = async (connectionId, { fileId, fileName, fileSize }) => {
    const toastId = toast.loading(`Importing new version: ${fileName}...`);
    try {
      const response = await importCloudVersion(documentId, { connectionId, fileId, fileName, fileSize });
      toast.success('New cloud version import started successfully. Processing has begun.', { id: toastId });
      refreshUser(); // Refresh user quota
      setDocument(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: response.data.status,
          status_message: response.data.status_message
        };
      });
    } catch (error) {
      toast.dismiss(toastId);
      throw error;
    }
  };

  const handleRefreshFromCloud = async () => {
    const toastId = toast.loading('Syncing latest version from cloud...');
    try {
      const response = await refreshCloudDocument(documentId);
      toast.success('Sync started. The document is being updated in the background.', { id: toastId });
      refreshUser(); // Refresh user quota
      setDocument(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: response.data.status,
          status_message: response.data.status_message
        };
      });
    } catch (error) {
      toast.dismiss(toastId);
    }
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
        onImportVersionFromCloud={handleCloudProviderClick}
        onRefreshFromCloud={handleRefreshFromCloud}
        onDownload={handleDownload}
        onVersionHistory={() => navigate(`/documents/${documentId}/versions`)}
        onDelete={handleDelete}
        onRenameDocument={handleRenameDocument}
        isProcessing={isProcessing}
        cloudProviders={cloudProviders}
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
        <OwnerQnAManager documentId={documentId} shareLinks={document.share_links || []} />
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
        versionId={null}
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
        title="Move Document to Trash"
        description={`Are you sure you want to move "${document?.name}" to trash? You can restore it anytime from Trash.`}
        confirmText="Move to Trash"
      />
      <ConfirmationDialog
        isOpen={isVersionMismatchDialogOpen}
        onOpenChange={setIsVersionMismatchDialogOpen}
        onConfirm={handleConfirmUpload}
        title="File Type Mismatch"
        description={`The file you selected has a different type than the original document. Are you sure you want to replace it with "${newVersionFile?.name}"?`}
        confirmText="Upload"
      />
      <CloudImportDialog
        isOpen={isCloudImportOpen}
        onOpenChange={setIsCloudImportOpen}
        provider={activeCloudImport?.provider}
        connection={activeCloudImport?.connection}
        onImportSuccess={() => {}}
        onImport={handleImportCloudVersion}
      />
    </div>
  );
}
