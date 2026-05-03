import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useSortedList } from '../hooks/useSortedList';
import { useItemSelection } from '../hooks/useItemSelection';
import { ShareIcon, Star, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { getDataroom, addContentToDataroom, createDataroomFolder, moveDataroomContent, getDataroomFolderContents, getShareLinksForDataroom, deleteShareLink, getDataroomViewSessions, removeContentFromDataroom, updateDataroomFolder, updateDataroomDocument, updateDataroomBranding, reorderDataroomItems } from '../services/api';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { Button } from '../components/ui/Button';
import { DocumentPlusIcon } from '../components/icons/DocumentPlusIcon';
import { FolderPlusIcon } from '../components/icons/FolderPlusIcon';
import { AddContentDialog } from '../components/dialogs/AddContentDialog';
import { AddFolderDialog } from '../components/dialogs/AddFolderDialog';
import { DataroomMoveItemsDialog } from '../components/dialogs/DataroomMoveItemsDialog';
import { DataroomReorderItemsDialog } from '../components/dialogs/DataroomReorderItemsDialog';
import { DocumentsList } from '../components/documents/DocumentsList';
import { SelectionActionBar } from '../components/documents/SelectionActionBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { LinkSheet } from '../components/links/LinkSheet';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { LinksTable } from '../components/documents/LinksTable';
import { ViewSessionsTable } from '../components/documents/ViewSessionsTable';
import { ManagePermissionsDialog } from '../components/datarooms/ManagePermissionsDialog';
import { RenameItemDialog } from '../components/dialogs/RenameItemDialog';
import { Skeleton } from '../components/ui/Skeleton';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Switch } from '../components/ui/Switch';

const BRAND_PRESETS = [
  { name: 'Slate', primary: '#1f2937', secondary: '#4b5563', accent: '#111827' },
  { name: 'Ocean', primary: '#0f4c81', secondary: '#2a6f9e', accent: '#0b3559' },
  { name: 'Forest', primary: '#1f6f5f', secondary: '#3d8d7a', accent: '#174f44' },
  { name: 'Sunset', primary: '#b45309', secondary: '#d97706', accent: '#7c2d12' },
  { name: 'Rose', primary: '#9f1239', secondary: '#be185d', accent: '#881337' },
  { name: 'Indigo', primary: '#3730a3', secondary: '#4f46e5', accent: '#312e81' },
];

export function DataroomPage() {
  const { dataroomId } = useParams();
  const navigate = useNavigate();
  const { setBreadcrumbData } = useBreadcrumb();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'documents';
  const [dataroom, setDataroom] = useState(null);
  const [dataroomName, setDataroomName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAddContentOpen, setIsAddContentOpen] = useState(false);
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false);
  const [isMoveItemsOpen, setIsMoveItemsOpen] = useState(false);
  const [isReorderDialogOpen, setIsReorderDialogOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState(() => searchParams.get('folder'));
  const [currentDataroomFolder, setCurrentDataroomFolder] = useState(null);
  const [items, setItems] = useState([]);
  const [links, setLinks] = useState([]);
  const [isLinkSheetOpen, setIsLinkSheetOpen] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [linkToDelete, setLinkToDelete] = useState(null);
  const [isManagePermissionsOpen, setIsManagePermissionsOpen] = useState(false);
  const [selectedLinkForPermissions, setSelectedLinkForPermissions] = useState(null);
  const [viewsData, setViewsData] = useState(null);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [viewsCurrentPage, setViewsCurrentPage] = useState(1);
  const [isRemoveContentDialogOpen, setIsRemoveContentDialogOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);
  const [itemToRemove, setItemToRemove] = useState(null);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [brandingForm, setBrandingForm] = useState({
    brandPrimaryColor: '',
    brandSecondaryColor: '',
    brandAccentColor: '',
  });
  const [brandingBannerFile, setBrandingBannerFile] = useState(null);
  const [removeBrandingBanner, setRemoveBrandingBanner] = useState(false);
  const [brandingPreviewUrl, setBrandingPreviewUrl] = useState(null);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [isSavingBanner, setIsSavingBanner] = useState(false);
  const [isSavingColors, setIsSavingColors] = useState(false);
  const [showFileIndex, setShowFileIndex] = useState(true);
  const bannerFileInputRef = useRef(null);
    
  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    try {
      if (currentFolderId) {
        // When viewing a subfolder, we need to fetch both the main dataroom
        // details (for name, etc.) and the specific folder's content.
        const [dataroomResponse, folderResponse] = await Promise.all([
          getDataroom(dataroomId),
          getDataroomFolderContents(currentFolderId),
        ]);
        setDataroom(dataroomResponse.data);
        setCurrentDataroomFolder(folderResponse.data);
        setItems(folderResponse.data.items || []);
      } else {
        // When viewing the dataroom root, we just need the main dataroom data.
        const response = await getDataroom(dataroomId);
        setDataroom(response.data);
        setCurrentDataroomFolder(null);
        setItems(response.data.items || []);
      }
    } catch (error) {
      // Error toast is handled by api interceptor, but might want to redirect on 404
    } finally {
      setIsLoading(false);
    }
  }, [dataroomId, currentFolderId]);
    
  const fetchLinks = useCallback(async (options = {}) => {
    try {
      const response = await getShareLinksForDataroom(dataroomId);
      setLinks(response.data);
    } catch (error) {
      console.error('Failed to fetch links', error);
    }
  }, [dataroomId]);
    
  const fetchViews = useCallback(async () => {
    try {
      setViewsLoading(true);
      const response = await getDataroomViewSessions(dataroomId, viewsCurrentPage);
      setViewsData(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setViewsLoading(false);
    }
  }, [dataroomId, viewsCurrentPage]);
    
  const folders = useMemo(() => items.filter((item) => item.type === 'folder'), [items]);
  const documents = useMemo(() => items.filter((item) => item.type === 'document'), [items]);

  const unsortedItems = useMemo(() => {
    if (!dataroom) return [];
    const normalized = items.map((item) => ({
      ...item,
      id: item.id,
      document_id: item.document_id,
      name: item.name,
      type: item.type,
      position: item.position,
    }));
    if (showStarredOnly) {
      return normalized.filter((item) => item.is_starred);
    }
    return normalized;
  }, [dataroom, items, showStarredOnly]);

  const reorderableItems = useMemo(() => {
    return (items || []).map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      created_at: item.created_at,
    }));
  }, [items]);

  const { sortedItems: allItems, sortConfig, handleSort } = useSortedList(
    unsortedItems,
    { key: 'position', direction: 'ascending' },
    { groupByType: false }
  );
  const { selection, setSelection, setLastSelectedItem, handleItemSelect, handleClearSelection } = useItemSelection(allItems);
    
  const isAllSelected =
    (documents.length > 0 || folders.length > 0) &&
    selection.documents.length === documents.length &&
    selection.folders.length === folders.length;

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
    
  useEffect(() => {
    if (activeTab === 'links') {
      fetchLinks();
      fetchViews();
    }
  }, [activeTab, fetchLinks, fetchViews]);  
    
  useEffect(() => {
    // Reset selection when folder changes
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
    fetchContent();
    
    return () => {
      setBreadcrumbData(null);
    };
  }, [fetchContent, setBreadcrumbData]);

  const handleBreadcrumbNavigate = useCallback((folderId) => {
    setSearchParams(prev => {
      if (folderId) {
        prev.set('folder', folderId);
      } else {
        prev.delete('folder');
      }
      return prev;
    });
  }, [setSearchParams]);

  const updateSearchParam = useCallback((key, value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === null || value === undefined || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    setCurrentFolderId(searchParams.get('folder'));
  }, [searchParams]);

  useEffect(() => {
    if (dataroom) {
      setBreadcrumbData({
        type: 'dataroom',
        folder: currentDataroomFolder,
        dataroomName: dataroom.name,
        onNavigate: handleBreadcrumbNavigate,
      });
    }
  }, [dataroom, currentDataroomFolder, setBreadcrumbData, handleBreadcrumbNavigate]);

  useEffect(() => {
    if (!dataroom) return;
    setDataroomName(dataroom.name || '');
    setBrandingForm({
      brandPrimaryColor: dataroom.brand_primary_color || '',
      brandSecondaryColor: dataroom.brand_secondary_color || '',
      brandAccentColor: dataroom.brand_accent_color || '',
    });
    setBrandingBannerFile(null);
    setRemoveBrandingBanner(false);
    setBrandingPreviewUrl(null);
    setShowFileIndex(Boolean(dataroom.show_file_index));
  }, [dataroom]);

  useEffect(() => {
    if (!brandingBannerFile) {
      setBrandingPreviewUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(brandingBannerFile);
    setBrandingPreviewUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [brandingBannerFile]);

  const handleAddContent = async ({ document_ids, folder_ids }) => {
    try {
      await addContentToDataroom(dataroomId, {
        document_ids,
        folder_ids,
        destination_folder_id: currentFolderId,
      });
      toast.success('Content added to dataroom successfully.');
      fetchContent(); // Refresh
    } catch (error) {
      // Toast is handled by api interceptor
    } finally {
      setIsAddContentOpen(false);
    }
  };

  const handleCreateFolderInDataroom = async (name) => {
    try {
      await createDataroomFolder({
        name,
        dataroom: dataroomId,
        parent: currentFolderId,
      });
      toast.success(`Folder "${name}" created successfully.`);
      fetchContent(); // Refresh
    } catch (error) {
      // Toast is handled by api interceptor
    } finally {
      setIsAddFolderOpen(false);
    }
  };

  const handleItemClick = (item, type) => {
    if (type === 'folder') {
      setSearchParams(prev => {
        prev.set('folder', item.id);
        return prev;
      });
    } else {
      // For documents, we pass along the dataroom context via query params
      // so the document page can render the correct breadcrumbs.
      const fromFolder = currentFolderId || '';
      navigate(`/documents/${item.document_id}?from_dataroom=${dataroomId}&from_folder=${fromFolder}`);
    }
  };
    
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
      
  const handleManagePermissions = (link) => {
    setSelectedLinkForPermissions(link);
    setIsManagePermissionsOpen(true);
  };
    
  const handleConfirmDelete = async () => {
    if (!linkToDelete) return;
    try {
      await deleteShareLink(linkToDelete.id);
      toast.success(`Link "${linkToDelete.name || 'Untitled Link'}" deleted successfully.`);
      fetchLinks();
      fetchViews();
    } finally {
      setIsDeleteDialogOpen(false);
      setLinkToDelete(null);
    }
  };
    
  const handleLinkUpdate = useCallback((updatedLink) => {
    if (updatedLink) {
      // Granular update for status toggle
      setLinks(prevLinks =>
        prevLinks.map(link => (link.id === updatedLink.id ? updatedLink : link))
      );
    } else {
      // Full refresh for create/edit from LinkSheet
      fetchLinks();
      fetchViews();
    }
  }, [fetchLinks, fetchViews]);
    
    
  const handleMoveItems = async (destinationFolderId) => {
    try {
      await moveDataroomContent(dataroomId, {
        dataroom_document_ids: selection.documents,
        dataroom_folder_ids: selection.folders,
        destination_folder_id: destinationFolderId,
      });
      toast.success("Items moved successfully.");
      fetchContent();
      handleClearSelection();
    } finally {
      setIsMoveItemsOpen(false);
    }
  };

  const handleRemoveContent = () => {
    setIsRemoveContentDialogOpen(true);
  };

  const handleConfirmRemoveContent = async () => {
    try {
      await removeContentFromDataroom(dataroomId, {
        dataroom_document_ids: selection.documents,
        dataroom_folder_ids: selection.folders,
      });
      toast.success('Items removed from dataroom successfully.');
      fetchContent(); // Refresh
      handleClearSelection();
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsRemoveContentDialogOpen(false);
    }
  };

  const handleRenameItem = (item) => {
    setItemToRename(item);
  };

  const handleRemoveItem = (item) => {
    setItemToRemove(item);
  };

  const handleToggleStar = useCallback(async (id, type) => {
    const isFolder = type === 'folder';
    const currentList = isFolder ? folders : documents;
    const updateApiCall = isFolder ? updateDataroomFolder : updateDataroomDocument;

    const originalItem = currentList.find(item => item.id === id);
    if (!originalItem) {
      console.error('Item to star/unstar not found in state.');
      return;
    }

    const newIsStarred = !originalItem.is_starred;

    setItems(prevItems =>
      prevItems.map(item =>
        item.id === id ? { ...item, is_starred: newIsStarred } : item
      )
    );

    try {
      await updateApiCall(id, { is_starred: newIsStarred });
    } catch (error) {
      setItems(prevItems =>
        prevItems.map(item =>
          item.id === id ? originalItem : item
        )
      );
      toast.error(`Failed to update star for "${originalItem.name}".`);
    }
  }, [documents, folders]);

  const handleConfirmRemoveItem = async () => {
    if (!itemToRemove) return;

    try {
      await removeContentFromDataroom(dataroomId, {
        dataroom_document_ids: itemToRemove.type === 'document' ? [itemToRemove.id] : [],
        dataroom_folder_ids: itemToRemove.type === 'folder' ? [itemToRemove.id] : [],
      });
      toast.success(`'${itemToRemove.name}' removed from dataroom.`);
      fetchContent();
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setItemToRemove(null);
    }
  };

  const handleSaveGeneral = async () => {
    setIsSavingGeneral(true);
    try {
      const response = await updateDataroomBranding(dataroomId, {
        name: dataroomName,
      });
      setDataroom(response.data);
      toast.success('Dataroom name updated.');
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsSavingGeneral(false);
    }
  };

  const handleSaveBanner = async () => {
    setIsSavingBanner(true);
    try {
      const response = await updateDataroomBranding(dataroomId, {
        bannerFile: brandingBannerFile,
        removeBanner: removeBrandingBanner,
      });
      setDataroom(response.data);
      setBrandingBannerFile(null);
      setRemoveBrandingBanner(false);
      toast.success('Banner updated.');
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsSavingBanner(false);
    }
  };

  const handleSaveColors = async () => {
    setIsSavingColors(true);
    try {
      const response = await updateDataroomBranding(dataroomId, {
        brandPrimaryColor: brandingForm.brandPrimaryColor,
        brandSecondaryColor: brandingForm.brandSecondaryColor,
        brandAccentColor: brandingForm.brandAccentColor,
      });
      setDataroom(response.data);
      toast.success('Theme colors updated.');
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsSavingColors(false);
    }
  };

  const handleToggleShowFileIndex = async (checked) => {
    setShowFileIndex(checked);
    try {
      const response = await updateDataroomBranding(dataroomId, {
        showFileIndex: checked,
      });
      setDataroom(response.data);
      toast.success('Display settings updated.');
    } catch (error) {
      setShowFileIndex((prev) => !prev);
      // Error toast handled by interceptor
    }
  };

  const handleConfirmReorderItems = async (orderedItems) => {
    try {
      await reorderDataroomItems(dataroomId, {
        parent_id: currentFolderId || null,
        ordered_items: orderedItems.map((item) => ({ type: item.type, id: item.id })),
      });
      toast.success('Display order updated.');
      setIsReorderDialogOpen(false);
      fetchContent();
    } catch (error) {
      // Error toast handled by interceptor
    }
  };

  const handleBrandColorChange = (field, value) => {
    setBrandingForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleApplyPreset = (preset) => {
    setBrandingForm({
      brandPrimaryColor: preset.primary,
      brandSecondaryColor: preset.secondary,
      brandAccentColor: preset.accent,
    });
  };


  if (isLoading && !dataroom) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-32" />
          </div>
        </header>

        <Tabs value={activeTab} className="mt-4">
          <TabsList>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="links">Links and Permissions</TabsTrigger>
          </TabsList>
          <TabsContent value="documents" className="mt-6">
            <div className="border-y border-gray-200 dark:border-gray-800">
              <div className="flex h-[45px] items-center border-b border-gray-200 px-4 dark:border-gray-800">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="ml-4 h-5 w-1/4" />
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex h-[53px] items-center px-4">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="ml-8 h-4 flex-1" />
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  if (!dataroom) {
    return <div className="p-6">Dataroom not found.</div>;
  }

  const hasContent = documents.length > 0 || folders.length > 0;
  const dataroomThemeStyle = {
    '--dataroom-primary': dataroom.brand_primary_color || '#111827',
    '--dataroom-secondary': dataroom.brand_secondary_color || '#4b5563',
    '--dataroom-accent': dataroom.brand_accent_color || '#1f2937',
  };

  return (
    <div className="container mx-auto p-4 md:p-6" style={dataroomThemeStyle}>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--dataroom-primary)' }}>{dataroom.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'documents' && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setIsAddFolderOpen(true)}
                title="Add Folder"
              >
                <FolderPlusIcon className="h-5 w-5" />
              </Button>
              <Button variant="outline" onClick={() => setIsAddContentOpen(true)}>
                <DocumentPlusIcon className="mr-2 h-4 w-4" />
                Add Content
              </Button>
            </>
          )}
          {activeTab === 'links' && (
            <Button onClick={handleCreateLink}>
              <ShareIcon className="mr-2 h-4 w-4" />
              Create Link
            </Button>
          )}
        </div>
      </header>

      {dataroom.branding_banner && (
        <section className="mb-6 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <img
            src={dataroom.branding_banner}
            alt={`${dataroom.name} banner`}
            className="h-40 w-full object-cover md:h-56"
          />
        </section>
      )}

      <Tabs value={activeTab} onValueChange={(tab) => updateSearchParam('tab', tab)} className="mt-4">
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="links">Links and Permissions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="mt-6">
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {currentFolderId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const parentId = currentDataroomFolder?.parent || null;
                      updateSearchParam('folder', parentId);
                    }}
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back to parent
                  </Button>
                )}
              </div>
            </div>
            {selection.documents.length > 0 || selection.folders.length > 0 ? (
              <SelectionActionBar
                selectedDocumentsCount={selection.documents.length}
                selectedFoldersCount={selection.folders.length}
                onClearSelection={handleClearSelection}
                onMove={() => setIsMoveItemsOpen(true)}
                onDelete={handleRemoveContent}
                deleteText="Remove"
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2"
                  onClick={() => setIsReorderDialogOpen(true)}
                  disabled={!hasContent}
                >
                  Reorder
                </Button>
              </div>
            )}
          </div>
          {!hasContent ? (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/20 p-12 text-center">
              <h3 className="text-xl font-semibold tracking-tight">
                {currentDataroomFolder ? 'This folder is empty' : 'This dataroom is empty'}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                A Dataroom is a place to securely organize and share documents with granular access control.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => setIsAddContentOpen(true)}>
                <DocumentPlusIcon className="mr-2 h-4 w-4" />
                Add Content
              </Button>
            </div>
          ) : (
            <DocumentsList
              allItems={allItems}
              loading={isLoading}
              isReadOnly={false}
              showActions={true}
              themed={true}
              showIndex={showFileIndex}
              onItemClick={handleItemClick}
              onItemSelect={handleItemSelect}
              selectedDocuments={selection.documents}
              selectedFolders={selection.folders}
              onSort={handleSort}
              sortConfig={sortConfig}
              onSelectAll={handleSelectAll}
              isAllSelected={isAllSelected}
              onRename={handleRenameItem}
              onDelete={handleRemoveItem}
              onToggleStar={handleToggleStar}
            />
          )}
        </TabsContent>
        <TabsContent value="links" className="mt-6">
          <LinksTable
            links={links}
            onEditLink={handleEditLink}
            onDeleteLink={handleDeleteLink}
            onManagePermissions={handleManagePermissions}
            onLinkUpdate={handleLinkUpdate}
            contextType="dataroom"
          />
          <div className="mt-8">
            <ViewSessionsTable
              views={viewsData?.results || []}
              totalCount={viewsData?.count || 0}
              loading={viewsLoading}
              currentPage={viewsCurrentPage}
              onPageChange={setViewsCurrentPage}
              pageSize={10}
              contextType="dataroom"
            />
          </div>
        </TabsContent>
        <TabsContent value="settings" className="mt-6">
          <section className="space-y-8">
            <div className="pb-6 border-b border-gray-200 dark:border-gray-800">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">General</h3>
                <Button size="sm" onClick={handleSaveGeneral} disabled={isSavingGeneral}>
                  {isSavingGeneral ? 'Saving...' : 'Save'}
                </Button>
              </div>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">Rename this dataroom.</p>
              <div className="max-w-md">
                <Label htmlFor="dataroom-name">Dataroom Name</Label>
                <Input
                  id="dataroom-name"
                  value={dataroomName}
                  onChange={(e) => setDataroomName(e.target.value)}
                  placeholder="Enter dataroom name"
                />
              </div>
            </div>

            <div className="pb-6 border-b border-gray-200 dark:border-gray-800">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Banner Image</h3>
                <Button size="sm" onClick={handleSaveBanner} disabled={isSavingBanner}>
                  {isSavingBanner ? 'Saving...' : 'Save'}
                </Button>
              </div>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                Display a client-specific banner at the top of the dataroom page.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <input
                    ref={bannerFileInputRef}
                    id="dataroom-banner"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setBrandingBannerFile(file);
                      if (file) setRemoveBrandingBanner(false);
                    }}
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => bannerFileInputRef.current?.click()}
                    >
                      Choose Banner
                    </Button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {brandingBannerFile ? brandingBannerFile.name : 'No file selected'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Recommended: wide image (for example 1600x400), JPG/PNG.
                  </p>
                  {(dataroom.branding_banner || brandingBannerFile) && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBrandingBannerFile(null);
                          setRemoveBrandingBanner(true);
                        }}
                      >
                        Remove Banner
                      </Button>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Preview</Label>
                  <div className="mt-2 overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                    {removeBrandingBanner ? (
                      <div className="flex h-28 items-center justify-center text-xs text-gray-500">
                        Banner will be removed after saving.
                      </div>
                    ) : (brandingBannerFile || dataroom.branding_banner) ? (
                      <img
                        src={brandingPreviewUrl || dataroom.branding_banner}
                        alt="Banner preview"
                        className="h-28 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center text-xs text-gray-500">
                        No banner uploaded.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pb-6 border-b border-gray-200 dark:border-gray-800">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Theme Colors</h3>
                <Button size="sm" onClick={handleSaveColors} disabled={isSavingColors}>
                  {isSavingColors ? 'Saving...' : 'Save'}
                </Button>
              </div>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                Apply brand colors to dataroom headers, lists, and accents.
              </p>
              <div className="mb-4">
                <Label>Preset Palettes</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BRAND_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className="flex items-center gap-2 rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                      onClick={() => handleApplyPreset(preset)}
                      title={`Apply ${preset.name}`}
                    >
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.primary }} />
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.secondary }} />
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.accent }} />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="brand-primary">Primary Color</Label>
                  <Input
                    id="brand-primary-picker"
                    type="color"
                    className="mb-2 h-10 p-1"
                    value={brandingForm.brandPrimaryColor || '#111827'}
                    onChange={(e) => handleBrandColorChange('brandPrimaryColor', e.target.value)}
                  />
                  <Input
                    id="brand-primary"
                    placeholder="#112233"
                    value={brandingForm.brandPrimaryColor}
                    onChange={(e) => handleBrandColorChange('brandPrimaryColor', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="brand-secondary">Secondary Color</Label>
                  <Input
                    id="brand-secondary-picker"
                    type="color"
                    className="mb-2 h-10 p-1"
                    value={brandingForm.brandSecondaryColor || '#4b5563'}
                    onChange={(e) => handleBrandColorChange('brandSecondaryColor', e.target.value)}
                  />
                  <Input
                    id="brand-secondary"
                    placeholder="#445566"
                    value={brandingForm.brandSecondaryColor}
                    onChange={(e) => handleBrandColorChange('brandSecondaryColor', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="brand-accent">Accent Color</Label>
                  <Input
                    id="brand-accent-picker"
                    type="color"
                    className="mb-2 h-10 p-1"
                    value={brandingForm.brandAccentColor || '#1f2937'}
                    onChange={(e) => handleBrandColorChange('brandAccentColor', e.target.value)}
                  />
                  <Input
                    id="brand-accent"
                    placeholder="#778899AA"
                    value={brandingForm.brandAccentColor}
                    onChange={(e) => handleBrandColorChange('brandAccentColor', e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-6">
                <Label>Live Preview</Label>
                <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                  <div
                    className="px-4 py-3"
                    style={{ backgroundColor: brandingForm.brandPrimaryColor || '#111827', color: '#ffffff' }}
                  >
                    Preview Header
                  </div>
                  <div className="p-4">
                    <p style={{ color: brandingForm.brandSecondaryColor || '#4b5563' }}>
                      Secondary text preview for dataroom descriptions.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3"
                      style={{
                        backgroundColor: brandingForm.brandAccentColor || '#1f2937',
                        color: '#ffffff',
                      }}
                    >
                      Accent Button
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Display</h3>
              </div>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                Configure dataroom list display behavior.
              </p>
              <div className="flex items-center justify-between rounded border border-gray-200 p-3 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium">Display File Index</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Show numeric index next to files/folders.</p>
                </div>
                <Switch checked={showFileIndex} onCheckedChange={handleToggleShowFileIndex} />
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>
      <LinkSheet
        isOpen={isLinkSheetOpen}
        onOpenChange={setIsLinkSheetOpen}
        dataroom={dataroom}
        currentLink={editingLink}
        onSuccess={handleLinkUpdate}
      />
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Share Link"
        description={`Are you sure you want to permanently delete the link "${linkToDelete?.name || 'Untitled Link'}"? This action cannot be undone.`}
        confirmText="Delete"
      />
      <ManagePermissionsDialog
        isOpen={isManagePermissionsOpen}
        onOpenChange={setIsManagePermissionsOpen}
        onSuccess={() => {
          fetchLinks();
          setIsManagePermissionsOpen(false);
        }}
        link={selectedLinkForPermissions}
      />
      <AddContentDialog
        isOpen={isAddContentOpen}
        onOpenChange={setIsAddContentOpen}
        onConfirm={handleAddContent}
      />
      <AddFolderDialog
        isOpen={isAddFolderOpen}
        onOpenChange={setIsAddFolderOpen}
        onConfirm={handleCreateFolderInDataroom}
      />
      <DataroomMoveItemsDialog
        isOpen={isMoveItemsOpen}
        onOpenChange={setIsMoveItemsOpen}
        onConfirm={handleMoveItems}
        dataroomId={dataroomId}
        selectedFolderIds={selection.folders}
      />
      <DataroomReorderItemsDialog
        isOpen={isReorderDialogOpen}
        onOpenChange={setIsReorderDialogOpen}
        items={reorderableItems}
        onConfirm={handleConfirmReorderItems}
        currentFolderName={currentDataroomFolder?.name || null}
      />
      <ConfirmationDialog
        isOpen={isRemoveContentDialogOpen}
        onOpenChange={setIsRemoveContentDialogOpen}
        onConfirm={handleConfirmRemoveContent}
        title="Remove Items from Dataroom"
        description={`Are you sure you want to remove the selected items from this dataroom? This will not delete the original files from your document library.`}
        confirmText="Remove"
      />
      {itemToRename && (
        <RenameItemDialog
          isOpen={!!itemToRename}
          onOpenChange={(isOpen) => !isOpen && setItemToRename(null)}
          item={itemToRename}
          onSuccess={fetchContent}
          context="dataroom"
        />
      )}
      <ConfirmationDialog
        isOpen={!!itemToRemove}
        onOpenChange={(isOpen) => !isOpen && setItemToRemove(null)}
        onConfirm={handleConfirmRemoveItem}
        title={`Remove "${itemToRemove?.name}"?`}
        description={`Are you sure you want to remove this item from the dataroom? This will not delete the original file.`}
        confirmText="Remove"
      />
    </div>
  );
}
