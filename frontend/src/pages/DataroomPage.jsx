import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSortedList } from '../hooks/useSortedList';
import { useDebounce } from '../hooks/useDebounce';
import { useItemSelection } from '../hooks/useItemSelection';
import { ShareIcon, Star, ArrowLeft, ChevronDown, FolderUp, Plus, Loader2, AlertTriangle, Crown, Users, Sparkles, Search } from 'lucide-react';
import { toast } from 'sonner';
import { formatBytes } from '../lib/formatters';
import { isDataroomOwner, isDataroomCollaborator } from '../utils/formatters';
import { getDataroom, addContentToDataroom, createDataroomFolder, moveDataroomContent, getDataroomFolderContents, getShareLinksForDataroom, deleteShareLink, getDataroomViewSessions, getDataroomStats, removeContentFromDataroom, updateDataroomFolder, updateDataroomDocument, updateDataroomBranding, reorderDataroomItems, deleteDataroom, ensureDataroomFolderPaths, uploadDataroomDocument, upgradeDataroomStorage, getDataroomBannerImages, searchDataroomContent } from '../services/api';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { useUpload } from '../contexts/UploadProvider';
import { useUser } from '../contexts/UserProvider';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button } from '../components/ui/Button';
import { SearchBox } from '../components/SearchBox';
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
import { Stats } from '../components/documents/Stats';
import { LinksTable } from '../components/documents/LinksTable';
import { ViewSessionsTable } from '../components/documents/ViewSessionsTable';
import { ManagePermissionsDialog } from '../components/datarooms/ManagePermissionsDialog';
import { CollaboratorsAvatarGroup } from '../components/datarooms/CollaboratorsAvatarGroup';
import { TransferOwnershipDialog } from '../components/datarooms/TransferOwnershipDialog';
import { DataroomBannerGalleryManager } from '../components/datarooms/DataroomBannerGalleryManager';
import { DataroomBannerGallery } from '../components/viewer/DataroomBannerGallery';
import { RenameItemDialog } from '../components/dialogs/RenameItemDialog';
import { Skeleton } from '../components/ui/Skeleton';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Switch } from '../components/ui/Switch';
import { Badge } from '../components/ui/Badge';
import { OwnerQnAManager } from '../components/qna/OwnerQnAManager';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/Dialog';

const BRAND_PRESETS = [
  { name: 'Default', primary: '#111827', secondary: '#4b5563', accent: '#1f2937' },
  { name: 'Ocean', primary: '#0f4c81', secondary: '#2a6f9e', accent: '#0b3559' },
  { name: 'Forest', primary: '#1f6f5f', secondary: '#3d8d7a', accent: '#174f44' },
  { name: 'Sunset', primary: '#b45309', secondary: '#d97706', accent: '#7c2d12' },
  { name: 'Rose', primary: '#9f1239', secondary: '#be185d', accent: '#881337' },
  { name: 'Indigo', primary: '#3730a3', secondary: '#4f46e5', accent: '#312e81' },
];

const MAX_STORAGE_QUOTA_MB = 1048576; // 1 TB (1,048,576 MB)

const QUOTA_PRESETS = [
  { label: 'Unlimited', value: 0 },
  { label: '500 MB', value: 500 },
  { label: '1 GB', value: 1024 },
  { label: '5 GB', value: 5120 },
  { label: '10 GB', value: 10240 },
];

export function DataroomPage() {
  const { t } = useTranslation();
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
  const [contentSearch, setContentSearch] = useState('');
  const debouncedContentSearch = useDebounce(contentSearch, 300);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingContent, setIsSearchingContent] = useState(false);
  const [links, setLinks] = useState([]);
  const [isLinkSheetOpen, setIsLinkSheetOpen] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [linkToDelete, setLinkToDelete] = useState(null);
  const [isManagePermissionsOpen, setIsManagePermissionsOpen] = useState(false);
  const [selectedLinkForPermissions, setSelectedLinkForPermissions] = useState(null);
  const [viewsData, setViewsData] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [viewsCurrentPage, setViewsCurrentPage] = useState(1);
  const [isRemoveContentDialogOpen, setIsRemoveContentDialogOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);
  const [itemToRemove, setItemToRemove] = useState(null);
  const [isTransferOwnershipOpen, setIsTransferOwnershipOpen] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [brandingForm, setBrandingForm] = useState({
    brandPrimaryColor: '',
    brandSecondaryColor: '',
    brandAccentColor: '',
  });
  const [brandingBannerFile, setBrandingBannerFile] = useState(null);
  const [removeBrandingBanner, setRemoveBrandingBanner] = useState(false);
  const [brandingPreviewUrl, setBrandingPreviewUrl] = useState(null);
  const [logoMode, setLogoMode] = useState('org');
  const [brandLogoOverrideFile, setBrandLogoOverrideFile] = useState(null);
  const [removeBrandLogoOverride, setRemoveBrandLogoOverride] = useState(false);
  const [brandLogoPreviewUrl, setBrandLogoPreviewUrl] = useState(null);
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const logoFileInputRef = useRef(null);

  const [bannerMode, setBannerMode] = useState('single');
  const [galleryImages, setGalleryImages] = useState([]);
  const [hasFetchedGallery, setHasFetchedGallery] = useState(false);
  const [, setIsGalleryImagesLoading] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [isSavingBanner, setIsSavingBanner] = useState(false);
  const [isSavingColors, setIsSavingColors] = useState(false);
  const [showFileIndex, setShowFileIndex] = useState(true);
  const [enableQna, setEnableQna] = useState(true);
  const [isSavingEnableQna, setIsSavingEnableQna] = useState(false);
  const [storageQuotaMb, setStorageQuotaMb] = useState(0);
  const [isSavingStorageQuota, setIsSavingStorageQuota] = useState(false);
  const [isUpgradingStorage, setIsUpgradingStorage] = useState(false);
  const [isUpgradeStorageDialogOpen, setIsUpgradeStorageDialogOpen] = useState(false);
  const [isDeleteDataroomDialogOpen, setIsDeleteDataroomDialogOpen] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');
  const [isDeletingDataroom, setIsDeletingDataroom] = useState(false);
  const bannerFileInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const { addUploads, updateUpload } = useUpload();
  const { user } = useUser();

  const handleFileSelect = () => {
    fileInputRef.current.click();
  };

  const handleFolderSelect = () => {
    folderInputRef.current.click();
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

    const fileIdMap = addUploads(files);

    let basePath = '';
    if (currentDataroomFolder) {
      basePath = [
        ...(currentDataroomFolder.ancestors || []).map((a) => a.name),
        currentDataroomFolder.name,
      ].join('/');
    }

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

    let pathMappings = {};
    if (paths.size > 0) {
      try {
        const response = await ensureDataroomFolderPaths(dataroomId, Array.from(paths), currentFolderId || null);
        pathMappings = response.data.path_mappings || {};
      } catch (error) {
        console.error("Failed to create folder structure:", error);
        fileIdMap.forEach(id => updateUpload(id, { status: 'error', error: 'Folder creation failed' }));
        return;
      }
    }

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

      return uploadDataroomDocument(dataroomId, file, currentFolderId || null, finalPath, onProgress)
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
      fetchContent();
    }
  };

  const onFileChange = async (e) => {
    await handleFileUploads(e.target.files);
    e.target.value = null;
  };

  const onFolderChange = async (e) => {
    await handleFileUploads(e.target.files);
    e.target.value = null;
  };
    
  const prevFolderIdRef = useRef(currentFolderId);
  const isFolderChanging = prevFolderIdRef.current !== currentFolderId;
  const contentQuery = (!isFolderChanging && contentSearch.trim())
    ? debouncedContentSearch.trim()
    : '';
  const contentQueryRef = useRef(contentQuery);
  contentQueryRef.current = contentQuery;

  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeQuery = contentQueryRef.current;
      const searchPromise = activeQuery && typeof searchDataroomContent === 'function'
        ? Promise.resolve(searchDataroomContent(dataroomId, activeQuery)).catch(() => null)
        : Promise.resolve(null);

      if (currentFolderId) {
        // When viewing a subfolder, we need to fetch both the main dataroom
        // details (for name, etc.) and the specific folder's content.
        const [dataroomResponse, folderResponse, searchResponse] = await Promise.all([
          getDataroom(dataroomId),
          getDataroomFolderContents(currentFolderId),
          searchPromise,
        ]);
        setDataroom(dataroomResponse.data);
        setCurrentDataroomFolder(folderResponse.data);
        setItems(folderResponse.data.items || []);
        if (activeQuery && searchResponse) {
          setSearchResults(searchResponse?.data?.items || []);
        }
      } else {
        // When viewing the dataroom root, we just need the main dataroom data.
        const [response, searchResponse] = await Promise.all([
          getDataroom(dataroomId),
          searchPromise,
        ]);
        setDataroom(response.data);
        setCurrentDataroomFolder(null);
        setItems(response.data.items || []);
        if (activeQuery && searchResponse) {
          setSearchResults(searchResponse?.data?.items || []);
        }
      }
    } catch (error) {
      // Error toast is handled by api interceptor, but might want to redirect on 404
    } finally {
      setIsLoading(false);
    }
  }, [dataroomId, currentFolderId]);

  useEffect(() => {
    prevFolderIdRef.current = currentFolderId;
    setContentSearch('');
  }, [currentFolderId]);

  useEffect(() => {
    if (!contentQuery || !dataroomId) {
      setSearchResults([]);
      setIsSearchingContent(false);
      return undefined;
    }
    let cancelled = false;
    setIsSearchingContent(true);
    Promise.resolve(searchDataroomContent?.(dataroomId, contentQuery))
      .then((response) => {
        if (!cancelled) setSearchResults(response?.data?.items || []);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearchingContent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataroomId, contentQuery]);
    
  const fetchLinks = useCallback(async (_options = {}) => {
    try {
      const response = await getShareLinksForDataroom(dataroomId);
      setLinks(response.data);
    } catch (error) {
      console.error('Failed to fetch links', error);
    }
  }, [dataroomId]);
    
  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const response = await getDataroomStats(dataroomId);
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch dataroom stats', err);
    } finally {
      setStatsLoading(false);
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
    
  const listedItems = contentQuery ? searchResults : items;
  const folders = useMemo(() => listedItems.filter((item) => item.type === 'folder'), [listedItems]);
  const documents = useMemo(() => listedItems.filter((item) => item.type === 'document'), [listedItems]);

  const unsortedItems = useMemo(() => {
    if (!dataroom) return [];
    const normalized = listedItems.map((item) => ({
      ...item,
      id: item.id,
      document_id: item.document_id,
      name: item.name,
      type: item.type,
      position: item.position,
      view_count: item.type === 'document' ? item.dataroom_view_count ?? 0 : null,
    }));
    if (showStarredOnly) {
      return normalized.filter((item) => item.is_starred);
    }
    return normalized;
  }, [dataroom, listedItems, showStarredOnly]);

  const reorderableItems = useMemo(() => {
    return (items || []).map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      document_type: item.document_type || item.type,
      file_size: item.file_size,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
  }, [items]);

  const { sortedItems: allItems, sortConfig, handleSort } = useSortedList(
    unsortedItems,
    { key: 'position', direction: 'ascending' },
    { groupByType: false }
  );
  const { selection, setSelection, setLastSelectedItem, handleItemSelect, handleClearSelection } = useItemSelection(allItems);
    
  useEffect(() => {
    if (activeTab === 'links' || activeTab === 'qna') {
      fetchLinks();
    }
  }, [activeTab, fetchLinks]);

  useEffect(() => {
    if (activeTab === 'links') {
      fetchViews();
      fetchStats();
    }
  }, [activeTab, fetchViews, fetchStats]);  

  useEffect(() => {
    const shouldOpenCreateLink = searchParams.get('openCreateLink') === 'true';
    if (!shouldOpenCreateLink || activeTab !== 'links') {
      return;
    }

    setEditingLink(null);
    setIsLinkSheetOpen(true);

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('openCreateLink');
      return next;
    }, { replace: true });
  }, [activeTab, searchParams, setSearchParams]);
    
  useEffect(() => {
    // Reset selection when folder changes
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
    fetchContent();
    
    return () => {
      setBreadcrumbData(null);
    };
  }, [fetchContent, setBreadcrumbData]);

  useEffect(() => {
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
  }, [contentQuery, setSelection, setLastSelectedItem]);

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

  const fetchGalleryImages = useCallback(async () => {
    setIsGalleryImagesLoading(true);
    try {
      const response = await getDataroomBannerImages(dataroomId);
      setGalleryImages(response?.data || []);
      setHasFetchedGallery(true);
    } catch (error) {
      console.error('Failed to load gallery images', error);
    } finally {
      setIsGalleryImagesLoading(false);
    }
  }, [dataroomId]);

  useEffect(() => {
    setHasFetchedGallery(false);
  }, [dataroomId]);

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchGalleryImages();
    }
  }, [activeTab, fetchGalleryImages]);

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
    const rawLogoMode = dataroom.logo_mode || dataroom.logoMode || 'org';
    setLogoMode(rawLogoMode === 'none' ? 'org' : rawLogoMode);
    setBrandLogoOverrideFile(null);
    setRemoveBrandLogoOverride(false);
    setBrandLogoPreviewUrl(null);
    setBannerMode(dataroom.banner_mode || dataroom.bannerMode || 'single');
    if (!hasFetchedGallery && dataroom.banner_images && Array.isArray(dataroom.banner_images)) {
      setGalleryImages(dataroom.banner_images);
    }
    setShowFileIndex(Boolean(dataroom.show_file_index));
    setEnableQna(dataroom.enable_qna !== false);
    setStorageQuotaMb(dataroom.storage_quota_mb ?? 0);
  }, [dataroom, hasFetchedGallery]);

  useEffect(() => {
    if (!brandingBannerFile) {
      setBrandingPreviewUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(brandingBannerFile);
    setBrandingPreviewUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [brandingBannerFile]);

  useEffect(() => {
    if (!brandLogoOverrideFile) {
      setBrandLogoPreviewUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(brandLogoOverrideFile);
    setBrandLogoPreviewUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [brandLogoOverrideFile]);

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
      toast.success(t('documents.folderCreatedSuccess', { name }));
      fetchContent(); // Refresh
    } catch (error) {
      // Toast is handled by api interceptor
    } finally {
      setIsAddFolderOpen(false);
    }
  };

  const handleItemClick = (item, type) => {
    if (type === 'folder') {
      setContentSearch('');
      setSearchParams(prev => {
        prev.set('folder', item.id);
        return prev;
      });
    } else {
      // For documents, we pass along the dataroom context via query params
      // so the document page can render the correct breadcrumbs.
      const fromFolder = item.folder || currentFolderId || '';
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
      toast.success(t('links.deleteSuccess', { name: linkToDelete.name || t('links.untitledLink') }));
      setIsDeleteDialogOpen(false);
      setLinkToDelete(null);
      fetchLinks();
      fetchViews();
      fetchStats();
    } catch (error) {
      // Error toast handled by interceptor
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
      fetchStats();
    }
  }, [fetchLinks, fetchViews, fetchStats]);
    
    
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
      toast.success(t('datarooms.removeItemsSuccess'));
      setIsRemoveContentDialogOpen(false);
      fetchContent(); // Refresh
      handleClearSelection();
    } catch (error) {
      // Error toast handled by interceptor
    }
  };

  const handleRenameItem = (item) => {
    setItemToRename(item);
  };

  const handleRemoveItem = (item) => {
    setItemToRemove(item);
  };

  const handleConfirmRemoveItem = async () => {
    if (!itemToRemove) return;

    try {
      await removeContentFromDataroom(dataroomId, {
        dataroom_document_ids: itemToRemove.type === 'document' ? [itemToRemove.id] : [],
        dataroom_folder_ids: itemToRemove.type === 'folder' ? [itemToRemove.id] : [],
      });
      toast.success(t('datarooms.removeItemSuccess', { name: itemToRemove.name }));
      setItemToRemove(null);
      fetchContent();
    } catch (error) {
      // Error toast handled by interceptor
    }
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
    const applyStarState = (prevList) =>
      prevList.map(item =>
        item.id === id ? { ...item, is_starred: newIsStarred } : item
      );

    setItems(applyStarState);
    setSearchResults(applyStarState);

    try {
      await updateApiCall(id, { is_starred: newIsStarred });
    } catch (error) {
      const revertStarState = (prevList) =>
        prevList.map(item =>
          item.id === id ? originalItem : item
        );
      setItems(revertStarState);
      setSearchResults(revertStarState);
      toast.error(`Failed to update star for "${originalItem.name}".`);
    }
  }, [documents, folders]);

  const handleSaveGeneral = async () => {
    setIsSavingGeneral(true);
    try {
      const response = await updateDataroomBranding(dataroomId, {
        name: dataroomName,
      });
      setDataroom(response.data);
      toast.success(t('datarooms.nameUpdated'));
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsSavingGeneral(false);
    }
  };

  const handleSaveLogo = async () => {
    setIsSavingLogo(true);
    try {
      const response = await updateDataroomBranding(dataroomId, {
        logoMode,
        brandLogoOverrideFile,
        removeBrandLogoOverride,
      });
      setDataroom(response.data);
      setBrandLogoOverrideFile(null);
      setRemoveBrandLogoOverride(false);
      toast.success(t('datarooms.logoUpdated', { defaultValue: 'Logo settings updated.' }));
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleLogoModeChange = async (newMode) => {
    if (newMode === logoMode) return;
    setLogoMode(newMode);
    if (newMode !== 'dataroom') {
      setIsSavingLogo(true);
      try {
        const response = await updateDataroomBranding(dataroomId, {
          logoMode: newMode,
        });
        if (response?.data && Object.keys(response.data).length > 0) {
          setDataroom(response.data);
        }
        setBrandLogoOverrideFile(null);
        setRemoveBrandLogoOverride(false);
        toast.success(t('datarooms.logoUpdated', { defaultValue: 'Logo settings updated.' }));
      } catch (error) {
        const fallbackMode = dataroom?.logo_mode || 'org';
        setLogoMode(fallbackMode === 'none' ? 'org' : fallbackMode);
      } finally {
        setIsSavingLogo(false);
      }
    }
  };

  const handleBannerModeChange = async (newMode) => {
    if (newMode === bannerMode) return;
    const oldMode = bannerMode;
    setBannerMode(newMode);
    try {
      const response = await updateDataroomBranding(dataroomId, {
        bannerMode: newMode,
      });
      if (response?.data && Object.keys(response.data).length > 0) {
        setDataroom(response.data);
      }
      toast.success(t('datarooms.bannerUpdated', { defaultValue: 'Banner updated.' }));
      if (newMode === 'gallery') {
        fetchGalleryImages();
      }
    } catch (error) {
      setBannerMode(oldMode);
    }
  };

  const handleSaveBanner = async () => {
    setIsSavingBanner(true);
    try {
      const response = await updateDataroomBranding(dataroomId, {
        bannerFile: brandingBannerFile,
        removeBanner: removeBrandingBanner,
        bannerMode,
      });
      setDataroom(response.data);
      setBrandingBannerFile(null);
      setRemoveBrandingBanner(false);
      toast.success(t('datarooms.bannerUpdated'));
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
      toast.success(t('datarooms.themeColorsUpdated'));
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
      toast.success(t('datarooms.displaySettingsUpdated'));
    } catch (error) {
      setShowFileIndex((prev) => !prev);
      // Error toast handled by interceptor
    }
  };

  const handleToggleEnableQna = async (checked) => {
    if (isSavingEnableQna) return;
    const previousEnableQna = enableQna;
    setEnableQna(checked);
    setIsSavingEnableQna(true);
    try {
      const response = await updateDataroomBranding(dataroomId, {
        enableQna: checked,
      });
      setDataroom(response.data);
      toast.success(t('datarooms.qnaSettingsUpdated'));
    } catch (error) {
      setEnableQna(previousEnableQna);
      // Error toast handled by interceptor
    } finally {
      setIsSavingEnableQna(false);
    }
  };

  const handleSaveStorageQuota = async () => {
    if (storageQuotaMb === '' || storageQuotaMb === null) return;
    const parsed = Number(storageQuotaMb);
    if (!Number.isInteger(parsed) || parsed < 0) return;
    setIsSavingStorageQuota(true);
    try {
      const safeQuota = Math.max(0, Math.min(parsed, MAX_STORAGE_QUOTA_MB));
      setStorageQuotaMb(safeQuota);
      const response = await updateDataroomBranding(dataroomId, {
        storageQuotaMb: safeQuota,
      });
      setDataroom(response.data);
      toast.success(t('datarooms.storageQuotaUpdated'));
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsSavingStorageQuota(false);
    }
  };

  const handleUpgradeStorage = async () => {
    setIsUpgradingStorage(true);
    try {
      const response = await upgradeDataroomStorage(dataroomId);
      setDataroom(response.data);
      toast.success(t('datarooms.upgradeStorageSuccess'));
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsUpgradingStorage(false);
    }
  };

  const handleConfirmReorderItems = async (orderedItems) => {
    try {
      await reorderDataroomItems(dataroomId, {
        parent_id: currentFolderId || null,
        ordered_items: orderedItems.map((item) => ({ type: item.type, id: item.id })),
      });
      toast.success(t('datarooms.displayOrderUpdated'));
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

  const handleOpenDeleteDataroomDialog = () => {
    setDeleteConfirmationName('');
    setIsDeleteDataroomDialogOpen(true);
  };

  const handleDeleteDataroom = async () => {
    if (deleteConfirmationName !== dataroom.name) {
      return;
    }

    setIsDeletingDataroom(true);
    try {
      await deleteDataroom(dataroomId);
      toast.success(t('datarooms.deleteSuccess', { name: dataroom.name }));
      setIsDeleteDataroomDialogOpen(false);
      navigate('/datarooms');
    } catch (error) {
      // Error toast handled by interceptor
    } finally {
      setIsDeletingDataroom(false);
    }
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
            <TabsTrigger value="documents">{t('datarooms.tabDocuments')}</TabsTrigger>
            <TabsTrigger value="links">{t('datarooms.tabLinks')}</TabsTrigger>
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
    return <div className="p-6">{t('datarooms.noDataroomsFound')}</div>;
  }

  const hasContent = documents.length > 0 || folders.length > 0;
  const isOwner = isDataroomOwner(dataroom, user);
  const isCollaborator = isDataroomCollaborator(dataroom, user);
  const isOrgAdmin = user?.role === 'admin';
  const canManage = isOwner || isOrgAdmin;

  // Derived storage quota calculations with live preview support
  const currentQuotaMb = dataroom?.storage_quota_mb || 0;
  const currentUsedBytes = dataroom?.storage_used_bytes || 0;

  // Live preview values based on user input
  const isQuotaEmpty = storageQuotaMb === '' || storageQuotaMb === null;
  const parsedActiveQuota = Number(storageQuotaMb);
  const isValidIntegerQuota = !isQuotaEmpty && Number.isInteger(parsedActiveQuota) && parsedActiveQuota >= 0;
  const activeQuotaMb = isValidIntegerQuota ? parsedActiveQuota : currentQuotaMb;
  const activeQuotaBytes = activeQuotaMb * 1024 * 1024;
  const activeUsageRatio = activeQuotaBytes > 0 ? currentUsedBytes / activeQuotaBytes : 0;
  const activeUsagePercent = Math.min(100, Math.round(activeUsageRatio * 100));
  const activeAvailableMb = activeQuotaBytes > 0
    ? Math.max(0, Math.round((activeQuotaBytes - currentUsedBytes) / (1024 * 1024)))
    : 0;
  const isQuotaDirty = isValidIntegerQuota && activeQuotaMb !== currentQuotaMb;

  const effectiveBannerImages = hasFetchedGallery ? galleryImages : (dataroom?.banner_images || []);
  const hasBanner = (bannerMode === 'single' && Boolean(dataroom?.branding_banner)) ||
    (bannerMode === 'gallery' && effectiveBannerImages.length > 0);

  const dataroomThemeStyle = {
    '--dataroom-primary': dataroom.brand_primary_color || '#111827',
    '--dataroom-secondary': dataroom.brand_secondary_color || '#4b5563',
    '--dataroom-accent': dataroom.brand_accent_color || '#1f2937',
  };

  return (
    <div className="container mx-auto p-4 md:p-6" style={dataroomThemeStyle}>
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--dataroom-primary)' }}>{dataroom.name}</h1>
            {(isOwner || isCollaborator) && (
              <Badge
                variant="outline"
                className={`text-xs ${
                  isOwner
                    ? 'border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-indigo-500/40 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                }`}
              >
                {isOwner ? (
                  <>
                    <Crown className="h-3 w-3 mr-1 text-amber-600 dark:text-amber-400" />
                    {t('datarooms.ownerRole')}
                  </>
                ) : (
                  <>
                    <Users className="h-3 w-3 mr-1 text-indigo-600 dark:text-indigo-400" />
                    {t('datarooms.collaboratorRole')}
                  </>
                )}
              </Badge>
            )}
          </div>
          <CollaboratorsAvatarGroup
            dataroom={dataroom}
            onCollaboratorsUpdated={fetchContent}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === 'documents' && (
            <>
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
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setIsAddFolderOpen(true)}
                title={t('documents.createFolder')}
              >
                <FolderPlusIcon className="h-5 w-5" />
              </Button>
              <Button variant="outline" onClick={() => setIsAddContentOpen(true)} title={t('datarooms.addContent')} className="px-3">
                <Plus className="mr-2 h-4 w-4 shrink-0" />
                <span className="text-xs sm:text-base">{t('datarooms.addContent')}</span>
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button className="flex items-center gap-1 sm:gap-x-2 px-3">
                    <span className="text-xs sm:text-base">{t('documents.upload')}</span>
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-[9999] w-40 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800"
                    sideOffset={8}
                  >
                    <DropdownMenu.Item
                      onSelect={handleFileSelect}
                      className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                    >
                      <DocumentPlusIcon className="h-5 w-5" aria-hidden="true" />
                      <span>{t('documents.files')}</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={handleFolderSelect}
                      className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                    >
                      <FolderPlusIcon className="h-5 w-5" aria-hidden="true" />
                      <span>{t('documents.folder')}</span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </>
          )}
          {activeTab === 'links' && (
            <Button onClick={handleCreateLink}>
              <ShareIcon className="mr-2 h-4 w-4" />
              {t('links.createLink')}
            </Button>
          )}
        </div>
      </header>

      {hasBanner && (
        <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <DataroomBannerGallery
            images={effectiveBannerImages}
            bannerMode={bannerMode}
            singleBannerUrl={dataroom?.branding_banner}
            dataroomName={dataroom?.name || ''}
            isRootFolder={!currentFolderId}
          />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(tab) => updateSearchParam('tab', tab)} className="mt-4">
        <TabsList>
          <TabsTrigger value="documents">{t('datarooms.tabDocuments')}</TabsTrigger>
          <TabsTrigger value="links">{t('datarooms.tabLinks')}</TabsTrigger>
          <TabsTrigger value="qna">{t('datarooms.tabQna')}</TabsTrigger>
          <TabsTrigger value="settings">{t('datarooms.tabSettings')}</TabsTrigger>
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
                    {t('datarooms.backToParent')}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {selection.documents.length > 0 || selection.folders.length > 0 ? (
                  <SelectionActionBar
                    selectedDocumentsCount={selection.documents.length}
                    selectedFoldersCount={selection.folders.length}
                    onClearSelection={handleClearSelection}
                    onMove={() => setIsMoveItemsOpen(true)}
                    onDelete={handleRemoveContent}
                    deleteText={t('common.remove')}
                  />
                ) : (
                  <div className="flex min-h-[48px] items-center">
                    <Button
                      variant={showStarredOnly ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setShowStarredOnly(prev => !prev)}
                    >
                      <Star className="mr-2 h-4 w-4" />
                      {t('documents.starred')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2"
                      onClick={() => setIsReorderDialogOpen(true)}
                      disabled={!hasContent || Boolean(contentQuery)}
                    >
                      {t('datarooms.reorderItems')}
                    </Button>
                  </div>
                )}
              </div>

              <div className="relative w-full sm:max-w-xs">
                <SearchBox
                  value={contentSearch}
                  onChange={(e) => setContentSearch(e.target.value)}
                  onClear={() => setContentSearch('')}
                  loading={Boolean(contentSearch.trim()) && (isSearchingContent || contentSearch !== debouncedContentSearch)}
                  inputClassName="h-10"
                  placeholder={t('datarooms.searchContent')}
                  aria-label={t('datarooms.searchContent')}
                />
              </div>
            </div>
          </div>
            <DocumentsList
              allItems={allItems}
              loading={isLoading || (Boolean(contentQuery) && isSearchingContent)}
              isReadOnly={false}
              showActions={true}
              themed={true}
              showIndex={showFileIndex}
              onItemClick={handleItemClick}
              onItemSelect={handleItemSelect}
              onFilesDrop={handleFileUploads}
              selectedDocuments={selection.documents}
              selectedFolders={selection.folders}
              onSort={handleSort}
              sortConfig={sortConfig}
              onRename={handleRenameItem}
              onDelete={handleRemoveItem}
              deleteLabel={t('common.remove')}
              onToggleStar={handleToggleStar}
              viewsTooltip={t('datarooms.viewsTooltip')}
              emptyState={
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/20 p-12 text-center my-4">
                  <h3 className="text-xl font-semibold tracking-tight">
                    {contentQuery
                      ? t('datarooms.noContentMatches')
                      : currentDataroomFolder ? t('datarooms.folderEmpty') : t('datarooms.dataroomEmpty')}
                  </h3>
                  {!contentQuery && (
                    <>
                      <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                        {t('datarooms.emptyStateNotice')}
                      </p>
                      <Button className="mt-4" variant="outline" onClick={() => setIsAddContentOpen(true)}>
                        <DocumentPlusIcon className="mr-2 h-4 w-4" />
                        {t('datarooms.addContent')}
                      </Button>
                    </>
                  )}
                </div>
              }
            />
        </TabsContent>
        <TabsContent value="links" className="mt-6 space-y-8">
          <Stats stats={stats} loading={statsLoading} expectedColumns={4} />
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
        <TabsContent value="qna" className="mt-6">
          {!enableQna && (
            <p className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
              {t('datarooms.qnaDisabledNotice')}
            </p>
          )}
          <OwnerQnAManager dataroomId={dataroomId} shareLinks={links} />
        </TabsContent>
        <TabsContent value="settings" className="mt-6">
          <section className="space-y-8">
            <div className="pb-6 border-b border-gray-200 dark:border-gray-800">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('datarooms.generalSettings')}</h3>
                <Button size="sm" onClick={handleSaveGeneral} disabled={isSavingGeneral}>
                  {isSavingGeneral ? t('common.saving') : t('common.save')}
                </Button>
              </div>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">{t('datarooms.renameDataroomNotice')}</p>
              <div className="max-w-md">
                <Label htmlFor="dataroom-name">{t('datarooms.dataroomName')}</Label>
                <Input
                  id="dataroom-name"
                  value={dataroomName}
                  onChange={(e) => setDataroomName(e.target.value)}
                  placeholder={t('datarooms.namePlaceholder')}
                />
              </div>
            </div>

            {/* Logo Settings Section */}
            <div className="pb-6 border-b border-gray-200 dark:border-gray-800">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('datarooms.logoMode')}</h3>
                {logoMode === 'dataroom' && (
                  <Button size="sm" onClick={handleSaveLogo} disabled={isSavingLogo}>
                    {isSavingLogo && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                    {isSavingLogo ? t('common.saving') : t('common.save')}
                  </Button>
                )}
              </div>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                {t('datarooms.logoModeDescription')}
              </p>

              {/* Mode Toggle Buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  { value: 'org', label: t('datarooms.logoModeOrg') },
                  { value: 'dataroom', label: t('datarooms.logoModeDataroom') },
                ].map((option) => {
                  const isSelected = logoMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleLogoModeChange(option.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                          : 'bg-background hover:bg-muted text-foreground border-border'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom Logo Upload card when logoMode === 'dataroom' */}
              {logoMode === 'dataroom' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 rounded-xl border border-border p-4 bg-muted/20">
                  <div>
                    <input
                      ref={logoFileInputRef}
                      id="dataroom-custom-logo"
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (file) {
                          if (file.size > 2 * 1024 * 1024) {
                            toast.error(t('datarooms.logoSizeLimitExceeded', { defaultValue: 'Logo file size cannot exceed 2 MB.' }));
                            return;
                          }
                          setBrandLogoOverrideFile(file);
                          setRemoveBrandLogoOverride(false);
                        }
                      }}
                    />
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => logoFileInputRef.current?.click()}
                      >
                        {brandLogoOverrideFile || (!removeBrandLogoOverride && dataroom?.brand_logo_override)
                          ? t('datarooms.replaceLogo')
                          : t('datarooms.uploadLogo')}
                      </Button>
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {brandLogoOverrideFile
                          ? brandLogoOverrideFile.name
                          : !removeBrandLogoOverride && dataroom?.brand_logo_override
                          ? t('common.currentFile', { defaultValue: 'Current logo set' })
                          : t('datarooms.noFileSelected')}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('datarooms.logoRecommendation')}
                    </p>
                    {(!removeBrandLogoOverride && dataroom?.brand_logo_override || brandLogoOverrideFile) && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setBrandLogoOverrideFile(null);
                            setRemoveBrandLogoOverride(true);
                          }}
                        >
                          {t('datarooms.removeLogo')}
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">{t('datarooms.preview')}</Label>
                    <div className="mt-2 flex h-24 items-center justify-center rounded-lg border border-border bg-background p-3">
                      {removeBrandLogoOverride ? (
                        <span className="text-xs text-muted-foreground">
                          {t('datarooms.logoWillBeRemoved', { defaultValue: 'Logo override will be removed' })}
                        </span>
                      ) : brandLogoPreviewUrl || dataroom?.brand_logo_override ? (
                        <img
                          src={brandLogoPreviewUrl || dataroom?.brand_logo_override}
                          alt="Dataroom logo preview"
                          className="max-h-16 max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t('datarooms.noLogoUploaded', { defaultValue: 'No custom logo uploaded' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Banner Settings Section */}
            <div className="pb-6 border-b border-gray-200 dark:border-gray-800">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('datarooms.bannerMode')}</h3>
                {bannerMode === 'single' && (
                  <Button size="sm" onClick={handleSaveBanner} disabled={isSavingBanner}>
                    {isSavingBanner && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                    {isSavingBanner ? t('common.saving') : t('common.save')}
                  </Button>
                )}
              </div>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                {t('datarooms.bannerModeDescription')}
              </p>

              {/* Mode Toggle Buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  { value: 'single', label: t('datarooms.bannerModeSingle') },
                  { value: 'gallery', label: t('datarooms.bannerModeGallery') },
                  { value: 'none', label: t('datarooms.bannerModeNone') },
                ].map((option) => {
                  const isSelected = bannerMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleBannerModeChange(option.value)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                          : 'bg-background hover:bg-muted text-foreground border-border'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {/* Mode Specific Body */}
              {bannerMode === 'single' && (
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
                        {t('datarooms.uploadBanner')}
                      </Button>
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                        {brandingBannerFile ? brandingBannerFile.name : t('datarooms.noFileSelected')}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {t('datarooms.bannerRecommendation')}
                    </p>
                    {(dataroom?.branding_banner || brandingBannerFile) && (
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
                          {t('datarooms.removeBanner')}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label>{t('datarooms.preview')}</Label>
                    <div className="mt-2 overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
                      {removeBrandingBanner ? (
                        <div className="flex h-28 items-center justify-center text-xs text-gray-500">
                          {t('datarooms.bannerWillBeRemoved')}
                        </div>
                      ) : (brandingBannerFile || dataroom?.branding_banner) ? (
                        <img
                          src={brandingPreviewUrl || dataroom?.branding_banner}
                          alt="Banner preview"
                          className="h-28 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-28 items-center justify-center text-xs text-gray-500">
                          {t('datarooms.noBannerUploaded')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {bannerMode === 'gallery' && (
                <div className="mt-2">
                  <DataroomBannerGalleryManager
                    dataroomId={dataroomId}
                    images={galleryImages}
                    onImagesChange={fetchGalleryImages}
                    canManage={canManage}
                  />
                </div>
              )}

              {bannerMode === 'none' && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  {t('datarooms.bannerHiddenNotice', {
                    defaultValue: 'Banner is disabled. Viewers will navigate directly to folder and file listings without a top banner.',
                  })}
                </div>
              )}
            </div>

            <div className="pb-6 border-b border-gray-200 dark:border-gray-800">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('datarooms.brandCustomization')}</h3>
                <Button size="sm" onClick={handleSaveColors} disabled={isSavingColors}>
                  {isSavingColors ? t('common.saving') : t('common.save')}
                </Button>
              </div>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                {t('datarooms.brandColorsNotice')}
              </p>
              <div className="mb-4">
                <Label>{t('datarooms.presetPalettes')}</Label>
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
                  <Label htmlFor="brand-primary">{t('datarooms.primaryColor')}</Label>
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
                  <Label htmlFor="brand-secondary">{t('datarooms.secondaryColor')}</Label>
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
                  <Label htmlFor="brand-accent">{t('datarooms.accentColor')}</Label>
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
                <Label>{t('datarooms.livePreview')}</Label>
                <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                  <div
                    className="px-4 py-3"
                    style={{ backgroundColor: brandingForm.brandPrimaryColor || '#111827', color: '#ffffff' }}
                  >
                    {t('datarooms.previewHeader')}
                  </div>
                  <div className="p-4">
                    <p style={{ color: brandingForm.brandSecondaryColor || '#4b5563' }}>
                      {t('datarooms.secondaryTextPreview')}
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
                      {t('datarooms.accentButton')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {dataroom?.storage_version === 1 && (
              <div className="pb-6 border-b border-amber-200 dark:border-amber-900/50">
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        {t('datarooms.legacyStorageTitle')}
                      </h3>
                      <p className="mt-1 text-xs sm:text-sm text-amber-800 dark:text-amber-300">
                        {t('datarooms.legacyStorageNotice')}
                      </p>
                    </div>
                    {canManage && (
                      <Button
                        size="sm"
                        onClick={() => setIsUpgradeStorageDialogOpen(true)}
                        disabled={isUpgradingStorage}
                        className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        {isUpgradingStorage ? t('datarooms.upgradingStorage') : t('datarooms.upgradeToModernStorage')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="pb-6 border-b border-gray-200 dark:border-gray-800 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">
                  {t('datarooms.storageQuotaTitle')}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('datarooms.storageQuotaNotice')}
                </p>
              </div>

              {/* Storage Usage Dashboard Card */}
              <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-semibold tracking-tight text-foreground">
                        {formatBytes(currentUsedBytes)} {activeQuotaMb > 0 ? `/ ${activeQuotaMb} MB` : `/ ${t('common.unlimited')}`}
                      </span>
                      {isQuotaDirty && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 bg-primary/10 text-primary flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" />
                          {t('admin.preview')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {activeQuotaMb > 0
                        ? `${activeAvailableMb} MB ${t('common.available')}`
                        : t('datarooms.unlimitedStorageActive')}
                    </p>
                  </div>
                  <div className="self-start sm:self-center">
                    {activeQuotaMb > 0 ? (
                      <Badge
                        variant="outline"
                        className={`font-semibold text-xs ${
                          activeUsageRatio > 0.9
                            ? 'border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                            : activeUsageRatio > 0.75
                            ? 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        }`}
                      >
                        {activeUsagePercent}% {t('admin.used')}
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="font-medium text-xs bg-muted/70 text-muted-foreground border-transparent"
                      >
                        {t('common.unlimited')}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div className="w-full bg-muted/60 dark:bg-muted/40 h-2.5 rounded-full overflow-hidden p-0.5 border border-border/50">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      activeQuotaMb > 0
                        ? activeUsageRatio > 0.9
                          ? 'bg-rose-500'
                          : activeUsageRatio > 0.75
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                        : 'bg-emerald-500/40 w-full'
                    }`}
                    style={{
                      width: activeQuotaMb > 0 ? `${activeUsagePercent}%` : '100%',
                    }}
                  />
                </div>

                {/* Quota Management Control & Quick Presets (Owner & Admin only) */}
                {canManage && (
                  <div className="pt-4 border-t border-border/60 space-y-4">
                    {/* Quick Presets */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        {t('admin.quickPresets')}
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {QUOTA_PRESETS.map((preset) => {
                          const isSelected = activeQuotaMb === preset.value;
                          return (
                            <button
                              key={preset.value}
                              type="button"
                              onClick={() => setStorageQuotaMb(preset.value)}
                              className={`px-3 py-1 text-xs font-medium rounded-md border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                  : 'bg-background hover:bg-muted text-foreground border-border'
                              }`}
                            >
                              {preset.value === 0 ? t('common.unlimited') : preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                        <div className="flex-1 max-w-xs space-y-1.5">
                          <Label htmlFor="dataroom-quota" className="text-xs font-medium text-muted-foreground">
                            {t('datarooms.storageQuotaMb')}
                          </Label>
                          <div className="relative">
                            <Input
                              id="dataroom-quota"
                              type="number"
                              min="0"
                              max={MAX_STORAGE_QUOTA_MB}
                              value={storageQuotaMb}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  setStorageQuotaMb('');
                                  return;
                                }
                                const parsed = parseInt(val, 10);
                                if (!isNaN(parsed)) {
                                  setStorageQuotaMb(Math.max(0, Math.min(parsed, MAX_STORAGE_QUOTA_MB)));
                                }
                              }}
                              placeholder="0"
                              className="pr-12 font-medium bg-background"
                            />
                            <span className="absolute right-3 top-2.5 text-xs font-semibold text-muted-foreground pointer-events-none">
                              MB
                            </span>
                          </div>
                        </div>
                        <Button
                          size="default"
                          onClick={handleSaveStorageQuota}
                          disabled={isSavingStorageQuota || isQuotaEmpty || !isQuotaDirty}
                          className="shrink-0 gap-1.5"
                        >
                          {isSavingStorageQuota && <Loader2 className="h-4 w-4 animate-spin" />}
                          {isSavingStorageQuota ? t('common.saving') : t('common.save')}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('datarooms.storageQuotaHelp')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('datarooms.displaySettings')}</h3>
              </div>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                {t('datarooms.displayNotice')}
              </p>
              <div className="flex items-center justify-between rounded border border-gray-200 p-3 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium">{t('datarooms.showFileIndex')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('datarooms.showFileIndexHelp')}</p>
                </div>
                <Switch checked={showFileIndex} onCheckedChange={handleToggleShowFileIndex} />
              </div>
              <div className="mt-3 flex items-center justify-between rounded border border-gray-200 p-3 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium">{t('datarooms.enableQna')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('datarooms.enableQnaHelp')}</p>
                </div>
                <Switch
                  checked={enableQna}
                  onCheckedChange={handleToggleEnableQna}
                  disabled={isSavingEnableQna}
                  aria-label={t('datarooms.enableQna')}
                />
              </div>
            </div>

            {canManage && (
              <div className="rounded-lg border border-red-200 bg-red-50/60 p-5 dark:border-red-900/60 dark:bg-red-950/20 space-y-4">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">{t('datarooms.dangerZone')}</h3>

                {/* Transfer Ownership Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-red-200/80 dark:border-red-900/40">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-red-900 dark:text-red-200">{t('datarooms.transferOwnership')}</p>
                    <p className="text-xs text-red-700/80 dark:text-red-300/80">
                      {t('datarooms.transferOwnershipDangerNotice')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setIsTransferOwnershipOpen(true)}
                  >
                    {t('datarooms.transferOwnership')}
                  </Button>
                </div>

                {/* Delete Dataroom Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-red-200/80 dark:border-red-900/40">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-red-900 dark:text-red-200">{t('datarooms.deleteDataroomTitle')}</p>
                    <p className="text-xs text-red-700/80 dark:text-red-300/80">
                      {t('datarooms.deleteDataroomNotice')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                    onClick={handleOpenDeleteDataroomDialog}
                  >
                    {t('datarooms.deleteDataroomTitle')}
                  </Button>
                </div>
              </div>
            )}
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
        title={t('links.deleteLinkTitle')}
        description={t('links.deleteLinkConfirm', {
          name: linkToDelete?.name || t('links.untitledLink'),
        })}
        confirmText={t('common.delete')}
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
      <TransferOwnershipDialog
        isOpen={isTransferOwnershipOpen}
        onOpenChange={setIsTransferOwnershipOpen}
        dataroom={dataroom}
        onSuccess={() => {
          fetchContent();
        }}
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
        sourceFolderId={currentDataroomFolder?.id || null}
        selectedFolderIds={selection.folders}
        selectedCount={selection.documents.length + selection.folders.length}
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
        title={t('datarooms.removeItemsTitle')}
        description={t('datarooms.removeItemsDescription')}
        confirmText={t('datarooms.remove')}
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
        title={t('datarooms.removeItemTitle', { name: itemToRemove?.name })}
        description={t('datarooms.removeItemDescription')}
        confirmText={t('datarooms.remove')}
      />
      <ConfirmationDialog
        isOpen={isUpgradeStorageDialogOpen}
        onOpenChange={setIsUpgradeStorageDialogOpen}
        onConfirm={async () => {
          setIsUpgradeStorageDialogOpen(false);
          await handleUpgradeStorage();
        }}
        title={t('datarooms.upgradeStorageConfirmTitle')}
        description={t('datarooms.upgradeStorageConfirmMessage')}
        confirmText={t('datarooms.upgradeToModernStorage')}
        variant="default"
        isLoading={isUpgradingStorage}
      />
      <Dialog
        open={isDeleteDataroomDialogOpen}
        onOpenChange={(isOpen) => {
          if (isDeletingDataroom) return;
          setIsDeleteDataroomDialogOpen(isOpen);
          if (!isOpen) {
            setDeleteConfirmationName('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('datarooms.deleteDataroomTitle')}</DialogTitle>
            <DialogDescription>
              {t('datarooms.confirmDeletePrompt', { name: dataroom.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="confirm-delete-dataroom-name">{t('datarooms.nameLabel')}</Label>
            <Input
              id="confirm-delete-dataroom-name"
              value={deleteConfirmationName}
              onChange={(e) => setDeleteConfirmationName(e.target.value)}
              placeholder={dataroom.name}
              disabled={isDeletingDataroom}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteDataroomDialogOpen(false);
                setDeleteConfirmationName('');
              }}
              disabled={isDeletingDataroom}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteDataroom}
              disabled={isDeletingDataroom || deleteConfirmationName !== dataroom.name}
            >
              {isDeletingDataroom ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.deleting')}
                </>
              ) : (
                t('datarooms.deleteDataroomTitle')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
