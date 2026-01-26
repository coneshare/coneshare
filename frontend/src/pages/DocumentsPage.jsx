import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSortedList } from '../hooks/useSortedList';
import { useItemSelection } from '../hooks/useItemSelection';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Star, Cloud } from 'lucide-react';
import { DocumentsList } from "../components/documents/DocumentsList";
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { Button } from '../components/ui/Button';
import { Separator } from '../components/ui/Separator';
import { SearchBox } from '../components/SearchBox';
import { SortButton } from '../components/documents/filters/SortButton';
import { Toaster, toast } from 'sonner';
import { ChevronDownIcon } from '../components/icons/ChevronDownIcon';
import { DocumentPlusIcon } from '../components/icons/DocumentPlusIcon';
import { FolderPlusIcon } from '../components/icons/FolderPlusIcon';
import { uploadDocument, getFolderContents, getRootFolderContents, createFolder, ensureFolderPaths, deleteMultipleDocuments, deleteMultipleFolders, updateDocument, updateFolder, moveItems, getCloudProviders, getCloudConnections, getDropboxConnectUrl, getGoogleDriveConnectUrl, getNextcloudConnectUrl } from '../services/api';
import { useUser } from '../contexts/UserProvider';
import { useUpload } from '../contexts/UploadProvider';
import { SelectionActionBar } from '../components/documents/SelectionActionBar';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { AddFolderDialog } from '../components/dialogs/AddFolderDialog';
import { MoveItemsDialog } from '../components/dialogs/MoveItemsDialog';
import { CloudImportDialog } from '../components/dialogs/CloudImportDialog';

function DocumentsPage() {
  const { folderId } = useParams();
  const { setBreadcrumbData } = useBreadcrumb();
  const { addUploads, updateUpload } = useUpload();
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [cloudProviders, setCloudProviders] = useState([]);
  const [cloudConnections, setCloudConnections] = useState([]);
  const [isCloudImportOpen, setIsCloudImportOpen] = useState(false);
  const [activeCloudImport, setActiveCloudImport] = useState(null);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false);
  const [isMoveItemsOpen, setIsMoveItemsOpen] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const { user } = useUser();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const combinedItems = useMemo(() => {
    let combined = [
      ...folders.map((f) => ({ ...f, type: "folder" })),
      ...documents.map((d) => ({ ...d, type: "document" })),
    ];

    if (showStarredOnly) {
      combined = combined.filter((item) => item.is_starred);
    }
    return combined;
  }, [folders, documents, showStarredOnly]);

  const { sortedItems: allItems, sortConfig, handleSort } = useSortedList(combinedItems);
  const { selection, setSelection, setLastSelectedItem, handleItemSelect, handleClearSelection } = useItemSelection(allItems);

  const handleShare = (document) => {
    navigate(`/documents/${document.id}?action=share`);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Reset state before fetching
    setCurrentFolder(null);
    setDocuments([]);
    setFolders([]);

    try {
      const response = folderId
        ? await getFolderContents(folderId)
        : await getRootFolderContents();

      const { current_folder, sub_folders, documents } = response.data;
      setCurrentFolder(current_folder);
      setFolders(sub_folders);
      setDocuments(documents);
      setBreadcrumbData(current_folder);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      // The API interceptor will show a toast for errors.
    } finally {
      setLoading(false);
    }
  }, [folderId, setBreadcrumbData]);

  useEffect(() => {
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
    fetchData();

    return () => {
      setBreadcrumbData(null);
    };
  }, [fetchData, setBreadcrumbData, setSelection, setLastSelectedItem]);

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
        // Toast will be shown by interceptor
      }
    };
    fetchProviders();
  }, []);

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
        // Redirect user to provider for authorization
        window.location.href = response.data.authorization_url;
      } catch (error) {
        console.error(`Failed to get ${provider.display_name} connect URL:`, error);
        // Toast is shown by interceptor
      }
    }
  };


  const handleToggleStar = useCallback(async (id, type) => {
    const isFolder = type === 'folder';
    const items = isFolder ? folders : documents;
    const setItems = isFolder ? setFolders : setDocuments;
    const updateApiCall = isFolder ? updateFolder : updateDocument;

    const originalItem = items.find(item => item.id === id);
    if (!originalItem) {
      console.error("Item to star/unstar not found in state.");
      return;
    }

    const newIsStarred = !originalItem.is_starred;

    // Optimistic UI update
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === id ? { ...item, is_starred: newIsStarred } : item
      )
    );

    // API call
    try {
      await updateApiCall(id, { is_starred: newIsStarred });
    } catch (error) {
      // Revert on failure
      setItems(prevItems =>
        prevItems.map(item =>
          item.id === id ? originalItem : item
        )
      );
      toast.error(`Failed to update star for "${originalItem.name}".`);
    }
  }, [documents, folders]);  


  const handleSelectAll = (checked) => {
    if (checked) {
      setSelection({
        documents: documents.map((d) => d.id),
        folders: folders.map((f) => f.id),
      });
    } else {
      handleClearSelection();
    }
  };

  const isAllSelected =
    (documents.length > 0 || folders.length > 0) &&
    selection.documents.length === documents.length &&
    selection.folders.length === folders.length;

  const handleBulkDelete = async () => {
    const { documents: docIds, folders: folderIds } = selection;
    const results = await Promise.all([
      deleteMultipleDocuments(docIds),
      deleteMultipleFolders(folderIds),
    ]);

    let failedCount = 0;
    results.forEach(settlementArray => {
      const failuresInBatch = settlementArray.filter(r => r.status === 'rejected').length;
      failedCount += failuresInBatch;
    });    

    if (failedCount > 0) {
      toast.error(`${failedCount} item(s) could not be deleted.`);
    } else {
      toast.success("Selected items deleted successfully.");
    }

    setIsBulkDeleteConfirmOpen(false);
    setSelection({ documents: [], folders: [] }); // Clear selection
    fetchData(); // Refresh data
  };

  const handleMoveItems = async (destinationFolderId) => {
    const { documents: docIds, folders: folderIds } = selection;
    try {
      await moveItems({
        documentIds: docIds,
        folderIds,
        destinationFolderId,
      });
      toast.success("Selected items moved successfully.");
      fetchData(); // Refresh data
    } catch (error) {
      console.error("Failed to move items:", error);
      // The API interceptor will show a toast.
    } finally {
      setIsMoveItemsOpen(false);
    }
  };

  const handleFolderSelect = () => {
    folderInputRef.current.click();
  };

  const handleAddFolder = () => {
    setIsAddFolderOpen(true);
  };

  const handleCreateFolder = async (name) => {
    try {
      await createFolder(name, folderId || null);
      toast.success(`Folder "${name}" created successfully.`);
      fetchData();
    } catch (error) {
      console.error("Failed to create folder:", error);
      // The API interceptor will show a toast.
    } finally {
      setIsAddFolderOpen(false);
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current.click();
  };

  const handleFileUploads = async (files) => {
    if (!files || files.length === 0) return;

    if (!user) {
      toast.error("User information is still loading. Please wait a moment and try again.");
      return;
    }

    if (user.max_files_per_upload > 0 && files.length > user.max_files_per_upload) {
      toast.error(`Uploads are limited to ${user.max_files_per_upload} files at a time.`);
      return;
    }

    // Add files to global state tracker
    const fileIdMap = addUploads(files);

    // Determine base path if inside a folder
    let basePath = '';
    if (currentFolder) {
      basePath = [
        ...currentFolder.ancestors.map((a) => a.name),
        currentFolder.name,
      ].join('/');
    }

    // 1. Determine unique folder paths from files that have them.
    const paths = new Set();
    Array.from(files).forEach((file) => {
      const relativePath = file.webkitRelativePath;
      if (relativePath) {
        const folderPath = relativePath.substring(0, relativePath.lastIndexOf('/'));
        if (folderPath) {
          const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '');
          if (normalizedPath) paths.add(normalizedPath);
        }
      }
    });

    // 2. If there are paths, ensure the folder structures exist first.
    let pathMappings = {};
    if (paths.size > 0) {
      try {
        const response = await ensureFolderPaths(Array.from(paths), basePath || null);
        pathMappings = response.data.path_mappings || {};
      } catch (error) {
        console.error("Failed to create folder structure:", error);
        // Mark all uploads as failed
        fileIdMap.forEach(id => updateUpload(id, { status: 'error', error: 'Folder creation failed' }));
        return;
      }
    }

    // 3. Proceed with concurrent file uploads.
    const uploadPromises = Array.from(files).map((file) => {
      const id = fileIdMap.get(file);

      let relativePath = file.webkitRelativePath || null;
      if (relativePath && Object.keys(pathMappings).length > 0) {
        const pathParts = relativePath.split('/');
        const topLevelDir = pathParts[0];
        const newTopLevelDir = pathMappings[topLevelDir];
        if (newTopLevelDir && newTopLevelDir !== topLevelDir) {
          pathParts[0] = newTopLevelDir;
          relativePath = pathParts.join('/');
        }
      }

      if (relativePath && basePath) {
        relativePath = `${basePath}/${relativePath}`;
      }
      const finalPath = relativePath || (basePath ? `${basePath}/${file.name}` : file.name);

      const onProgress = (progress) => {
        updateUpload(id, { progress });
      };

      return uploadDocument(file, finalPath, onProgress)
        .then(response => ({ id, status: 'fulfilled', value: response }))
        .catch(error => ({ id, status: 'rejected', reason: error }));
    });

    const results = await Promise.all(uploadPromises);
    let successfulUploads = 0;

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        updateUpload(result.id, { status: 'complete', progress: 100 });
        successfulUploads++;
      } else {
        const errorMessage = result.reason?.response?.data?.detail || result.reason?.message || 'Upload failed';
        updateUpload(result.id, { status: 'error', error: errorMessage });
        console.error(`File upload failed for id ${result.id}:`, result.reason);
      }
    });

    if (successfulUploads > 0) {
      fetchData(); // Refresh data if at least one upload succeeded
    }
  };

  const onFileChange = async (e) => {
    // The files must be handled before the input is reset.
    await handleFileUploads(e.target.files);
    // Reset the input value to allow re-uploading the same file(s).
    e.target.value = null;
  };

  const onFolderChange = async (e) => {
    // The files must be handled before the input is reset.
    await handleFileUploads(e.target.files);
    // Reset the input value to allow re-uploading the same folder.
    e.target.value = null;
  };


  return (
    <div className="sticky top-0 mb-4 rounded-lg bg-white p-4 dark:bg-gray-900 sm:mx-4 sm:pt-8">
      <Toaster richColors />
      <ConfirmationDialog
        isOpen={isBulkDeleteConfirmOpen}
        onOpenChange={setIsBulkDeleteConfirmOpen}
        title="Delete Selected Items?"
        description="This action cannot be undone. This will permanently delete all selected items and their contents."
        onConfirm={handleBulkDelete}
        confirmText="Delete"
      />
      <MoveItemsDialog
        isOpen={isMoveItemsOpen}
        onOpenChange={setIsMoveItemsOpen}
        onConfirm={handleMoveItems}
        selectedFolderIds={selection.folders}
      />
      <CloudImportDialog
        isOpen={isCloudImportOpen}
        onOpenChange={setIsCloudImportOpen}
        provider={activeCloudImport?.provider}
        connection={activeCloudImport?.connection}
        onImportSuccess={fetchData}
      />
      <AddFolderDialog
        isOpen={isAddFolderOpen}
        onOpenChange={setIsAddFolderOpen}
        onConfirm={handleCreateFolder}
      />
      <section className="mb-4 flex items-center justify-end space-x-2 sm:space-x-0">
        <div className="relative flex items-center gap-x-2">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10"
            onClick={handleAddFolder}
            title="Add Folder"
          >
            <FolderPlusIcon className="h-5 w-5" />
          </Button>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={onFileChange}
            className="hidden"
          />
          <input
            type="file"
            ref={folderInputRef}
            onChange={onFolderChange}
            className="hidden"
            webkitdirectory=""
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                className="group flex items-center justify-center gap-x-1 whitespace-nowrap px-3 text-left sm:gap-x-2"
                title="Upload"
              >
                <span className="text-xs sm:text-base">Upload</span>
                <ChevronDownIcon
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              className="z-50 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800"
              sideOffset={8}
            >
              <DropdownMenu.Item
                onSelect={handleFileSelect}
                className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
              >
                <DocumentPlusIcon className="h-5 w-5" aria-hidden="true" />
                <span>Files</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={handleFolderSelect}
                className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
              >
                <FolderPlusIcon className="h-5 w-5" aria-hidden="true" />
                <span>Folder</span>
              </DropdownMenu.Item>
              {cloudProviders.length > 0 && <DropdownMenu.Separator className="my-1 h-px bg-gray-200 dark:bg-gray-700" />}
              {cloudProviders.map((provider) => (
                <DropdownMenu.Item
                  key={provider.name}
                  onSelect={() => handleCloudProviderClick(provider)}
                  className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                >
                  <Cloud className="h-5 w-5" aria-hidden="true" />
                  <span>{provider.display_name}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </section>

      {/* <div className="mb-2 flex justify-end gap-x-2"> */}
      {/*   <div className="relative w-full sm:max-w-xs"> */}
      {/*     <SearchBox loading={loading} inputClassName="h-10" /> */}
      {/*   </div> */}
      {/*   <SortButton onSort={handleSort} sortConfig={sortConfig} /> */}
      {/* </div> */}

      <div className="mb-4">
        {selection.documents.length > 0 || selection.folders.length > 0 ? (
          <SelectionActionBar
            selectedDocumentsCount={selection.documents.length}
            selectedFoldersCount={selection.folders.length}
            onClearSelection={handleClearSelection}
            onDelete={() => setIsBulkDeleteConfirmOpen(true)}
            onMove={() => setIsMoveItemsOpen(true)}
          />
        ) : (
          <div className="flex min-h-[48px] items-center">
            <Button
              variant={showStarredOnly ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowStarredOnly(prev => !prev)}
            >
              <Star className="mr-2 h-4 w-4" />
              Starred
            </Button>
          </div>
        )}
      </div>

      {/* <Separator className="mb-5 bg-gray-200 dark:bg-gray-800" /> */}

      <DocumentsList
        allItems={allItems}
        loading={loading}
        onDataRefresh={fetchData}
        onFilesDrop={handleFileUploads}
        selectedDocuments={selection.documents}
        selectedFolders={selection.folders}
        onItemSelect={handleItemSelect}
        onClearSelection={handleClearSelection}
        onSort={handleSort}
        sortConfig={sortConfig}
        onSelectAll={handleSelectAll}
        isAllSelected={isAllSelected}
        onToggleStar={handleToggleStar}
        onShare={handleShare}
      />
    </div>
  );
}

export default DocumentsPage;
