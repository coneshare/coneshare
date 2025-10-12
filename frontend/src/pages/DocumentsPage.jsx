import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Star } from 'lucide-react';
import { DocumentsList } from "../components/documents/DocumentsList";
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { Button } from '../components/ui/Button';
import { Separator } from '../components/ui/Separator';
import { SearchBox } from '../components/SearchBox';
import { SortButton } from '../components/documents/filters/SortButton';
import { Pagination } from '../components/documents/Pagination';
import { Toaster, toast } from 'sonner';
import { ChevronDownIcon } from '../components/icons/ChevronDownIcon';
import { DocumentPlusIcon } from '../components/icons/DocumentPlusIcon';
import { FolderPlusIcon } from '../components/icons/FolderPlusIcon';
import { uploadDocument, getFolderContents, getRootFolderContents, createFolder, ensureFolderPaths, deleteMultipleDocuments, deleteMultipleFolders, updateDocument, updateFolder } from '../services/api';
import { SelectionActionBar } from '../components/documents/SelectionActionBar';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { AddFolderDialog } from '../components/dialogs/AddFolderDialog';

function DocumentsPage() {
  const { folderId } = useParams();
  const { setBreadcrumbData } = useBreadcrumb();
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState({ documents: [], folders: [] });
  const [lastSelectedItem, setLastSelectedItem] = useState(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [sortConfig, setSortConfig] = useState({
    key: "name",
    direction: "ascending",
  });
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const allItems = useMemo(() => {
    let combined = [
      ...folders.map((f) => ({ ...f, type: "folder" })),
      ...documents.map((d) => ({ ...d, type: "document" })),
    ];

    if (showStarredOnly) {
      combined = combined.filter((item) => item.is_starred);
    }

    combined.sort((a, b) => {
      // Folders always come first and are sorted by name
      if (a.type === "folder" && b.type === "document") return -1;
      if (a.type === "document" && b.type === "folder") return 1;
      
      const dir = sortConfig.direction === "ascending" ? 1 : -1;
      const key = sortConfig.key;

      if (a.type === "folder" && b.type === "folder") {
        return a.name.localeCompare(b.name);
      }
      
      const aVal = a[key];
      const bVal = b[key];

      if (key === "updated_at") {
        return (new Date(aVal) - new Date(bVal)) * dir;
      }

      if (key === 'file_size') {
        return ((aVal || 0) - (bVal || 0)) * dir;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * dir;
      }
      
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;

      return 0;
    });

    return combined;
  }, [folders, documents, sortConfig, showStarredOnly]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Reset state before fetching
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
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
    fetchData();

    return () => {
      setBreadcrumbData(null);
    };
  }, [fetchData]);

  const handleItemSelect = useCallback((id, type, event) => {
    const currentIndex = allItems.findIndex(
      (item) => item.id === id && item.type === type
    );

    if (event?.shiftKey && lastSelectedItem) {
      const lastIndex = allItems.findIndex(
        (item) =>
          item.id === lastSelectedItem.id && item.type === lastSelectedItem.type
      );
      const start = Math.min(currentIndex, lastIndex);
      const end = Math.max(currentIndex, lastIndex);
      const itemsToSelect = allItems.slice(start, end + 1);

      setSelection((prev) => {
        const newSelection = {
          documents: [...prev.documents],
          folders: [...prev.folders],
        };
        itemsToSelect.forEach((item) => {
          if (
            item.type === "folder" &&
            !newSelection.folders.includes(item.id)
          ) {
            newSelection.folders.push(item.id);
          } else if (
            item.type === "document" &&
            !newSelection.documents.includes(item.id)
          ) {
            newSelection.documents.push(item.id);
          }
        });
        return newSelection;
      });
    } else {
      setSelection((prevSelection) => {
        const newSelection = { ...prevSelection };
        if (type === "folder") {
          const current = newSelection.folders;
          newSelection.folders = current.includes(id)
            ? current.filter((folderId) => folderId !== id)
            : [...current, id];
        } else {
          const current = newSelection.documents;
          newSelection.documents = current.includes(id)
            ? current.filter((docId) => docId !== id)
            : [...current, id];
        }
        return newSelection;
      });
      setLastSelectedItem({ id, type });
    }
  }, [allItems, lastSelectedItem]);

  const handleClearSelection = useCallback(() => {
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
  }, []);

  const handleToggleStar = useCallback(async (id, type) => {
    const isFolder = type === 'folder';
    const setItems = isFolder ? setFolders : setDocuments;
    const updateApiCall = isFolder ? updateFolder : updateDocument;
    let originalItem = null;
    let newIsStarred;

    // Optimistic update
    setItems(prevItems => {
      const newItems = prevItems.map(item => {
        if (item.id === id) {
          originalItem = item;
          newIsStarred = !item.is_starred;
          return { ...item, is_starred: newIsStarred };
        }
        return item;
      });
      return newItems;
    });

    // API call
    if (originalItem) {
      try {
        await updateApiCall(id, { is_starred: newIsStarred });
      } catch (error) {
        // Revert on failure
        setItems(prevItems =>
          prevItems.map(item => {
            if (item.id === id) {
              return originalItem;
            }
            return item;
          })
        );
        toast.error(`Failed to update star for "${originalItem.name}".`);
      }
    }
  }, []);

  const handleSort = (key) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === key) {
        return {
          ...prevConfig,
          direction:
            prevConfig.direction === "ascending" ? "descending" : "ascending",
        };
      }
      return { key, direction: "ascending" };
    });
  };

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

    // Determine base path if inside a folder
    let basePath = '';
    if (currentFolder) {
      basePath = [
        ...currentFolder.ancestors.map((a) => a.name),
        currentFolder.name,
      ].join('/');
    }

    // 1. Determine unique folder paths from files that have them.
    // We only do this for uploads from the "Upload Folder" dialog, as
    // `webkitRelativePath` is the only reliable indicator of user intent
    // to preserve folder structure. For drag-and-drop, we'll upload flat.
    const paths = new Set();
    Array.from(files).forEach((file) => {
      const relativePath = file.webkitRelativePath; // Only consider webkitRelativePath
      if (relativePath) {
        const folderPath = relativePath.substring(
          0,
          relativePath.lastIndexOf('/')
        );
        if (folderPath) {
          // Normalize path: remove leading/trailing slashes before adding.
          const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '');
          if (normalizedPath) {
            paths.add(normalizedPath);
          }
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
        // The API interceptor will show a toast, so we just log and stop.
        return;
      }
    }

    // 3. Proceed with concurrent file uploads.
    const uploadPromises = Array.from(files).map((file) => {
      // For uploads from the folder dialog, we preserve the path.
      // For all other uploads (including drag-and-drop), we upload to the root.
      let relativePath = file.webkitRelativePath || null;

      // If we received path mappings from the backend, apply them to the relative path first.
      if (relativePath && Object.keys(pathMappings).length > 0) {
        const pathParts = relativePath.split('/');
        const topLevelDir = pathParts[0];
        const newTopLevelDir = pathMappings[topLevelDir];

        if (newTopLevelDir && newTopLevelDir !== topLevelDir) {
          pathParts[0] = newTopLevelDir;
          relativePath = pathParts.join('/');
        }
      }

      // After potential renaming, prepend the base path for where the upload is happening.
      if (relativePath && basePath) {
        relativePath = `${basePath}/${relativePath}`;
      }

      return uploadDocument(file, relativePath);
    });
    const results = await Promise.allSettled(uploadPromises);

    const failedCount = results.filter((r) => r.status === 'rejected').length;
    if (failedCount > 0) {
      console.error(`${failedCount} file(s) failed to upload.`);
      // Optionally show a toast for partial failures
    }

    if (results.some((r) => r.status === 'fulfilled')) {
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
          />
        ) : (
          <div>
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
      />

      {documents.length > 0 && (
        <Pagination />
      )}
    </div>
  );
}

export default DocumentsPage;
