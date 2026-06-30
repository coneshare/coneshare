import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  HomeIcon,
  ChevronRight,
  DownloadIcon,
  MoreHorizontal,
  Eye,
  MessageCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatBytes } from '../../lib/formatters';
import { FileTypeIcon } from '../documents/FileTypeIcon';
import { Button } from '../ui/Button';
import { QnAPanel } from './QnAPanel';
import { DataroomSiblingNav } from './DataroomSiblingNav';
import { ViewerToolbar } from './ViewerToolbar';
import { PreviewViewer } from '../documents/PreviewViewer';
import { PdfJsViewer } from '../documents/PdfJsViewer';
import { printPdf, printImages } from '../../lib/print';
import {
  hasRenderablePages,
  isPreviewPending,
  PreviewStatePanel,
} from '../documents/PreviewStatePanel';
import {
  downloadDataroomFolder,
  getPublicQnaSummary,
  getShareLinkViewData,
  recordDataroomVisit,
} from '../../services/api';
import { DATAROOM_VIEWER_PAGE_SIZE } from '../../constants/pagination';

const PREVIEW_POLL_INTERVAL_MS = 3000;

function ListItem({ item, onItemClick, onDownloadClick, onQnaClick, showIndex = false, index = null }) {
  const isFolder = item.type === 'folder';
  const mobileMeta = [
    item.updated_at ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true }) : null,
    !isFolder && typeof item.file_size === 'number' ? formatBytes(item.file_size) : null,
  ].filter(Boolean).join(' • ');
  return (
    <div
      className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors sm:px-4 hover:bg-[var(--viewer-row-hover-bg)]"
      style={{
        color: 'var(--viewer-primary)',
        '--viewer-row-hover-bg': 'color-mix(in srgb, var(--viewer-secondary) 10%, transparent)',
      }}
    >
      {showIndex && <div className="hidden w-10 text-xs sm:block" style={{ color: 'var(--viewer-secondary)' }}>{index}</div>}
      <div className="flex w-7 shrink-0 items-center justify-center sm:w-8">
        <FileTypeIcon
          type={isFolder ? 'folder' : item.document_type}
          className="h-5 w-5 shrink-0"
          palette="viewer"
        />
      </div>
      <div className="min-w-0 flex-1 pr-2 sm:pr-4">
        <button
          onClick={() => onItemClick(item)}
          className="w-full truncate text-left font-medium"
          title={item.name || item.document_name}
        >
          {item.name || item.document_name}
        </button>
        {mobileMeta && (
          <div className="mt-0.5 truncate text-xs sm:hidden" style={{ color: 'var(--viewer-secondary)' }}>
            {mobileMeta}
          </div>
        )}
      </div>
      <div className="hidden w-[20%] text-sm sm:block" style={{ color: 'var(--viewer-secondary)' }}>
        {item.updated_at && formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
      </div>
      <div className="hidden w-[10%] text-sm sm:block" style={{ color: 'var(--viewer-secondary)' }}>
        {!isFolder && typeof item.file_size === 'number' ? formatBytes(item.file_size) : '—'}
      </div>
      <div className="ml-1 w-9 shrink-0 text-right sm:ml-0 sm:w-[10%]">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              style={{ color: 'var(--viewer-accent)' }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              aria-label={`Actions for ${item.name || item.document_name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-[9999] w-40 origin-top-right rounded-md bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
              sideOffset={5}
              align="end"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.stopPropagation();
                  onItemClick(item);
                }}
                className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                <span>View</span>
              </DropdownMenu.Item>
              {item.allow_download && (
                <DropdownMenu.Item
                  onSelect={(e) => {
                    e.stopPropagation();
                    onDownloadClick(item);
                  }}
                  className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                >
                  <DownloadIcon className="h-4 w-4" aria-hidden="true" />
                  <span>Download</span>
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.stopPropagation();
                  onQnaClick(item);
                }}
                className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-700 dark:hover:bg-gray-100 dark:focus:bg-gray-100"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                <span>Q&amp;A</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}

export function DataroomViewer({ data, slug, viewId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const dataroomDocumentIdFromUrl = searchParams.get('dataroom_document_id');
  const parentIdFromUrl = searchParams.get('parent_id');

  const [scopeData, setScopeData] = useState(() => {
    if (data && data.link_type === 'dataroom') {
      return data;
    }
    if (data && data.dataroom_context) {
      return {
        id: data.dataroom_context.id,
        name: data.dataroom_context.name,
        show_file_index: data.dataroom_context.show_file_index,
        branding_banner: data.dataroom_context.branding_banner,
        brand_primary_color: data.dataroom_context.brand_primary_color,
        brand_secondary_color: data.dataroom_context.brand_secondary_color,
        brand_accent_color: data.dataroom_context.brand_accent_color,
        breadcrumbs: [],
        items: [],
      };
    }
    return data;
  });

  const [documentViewData, setDocumentViewData] = useState(() => {
    if (data && data.link_type === 'document') {
      return data;
    }
    return null;
  });

  const [currentDataroomVisitId, setCurrentDataroomVisitId] = useState(null);

  const selectedDocumentId = searchParams.get('dataroom_document_id') || null;
  const [isDocumentLoading, setIsDocumentLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [qnaContext, setQnaContext] = useState(null);
  const [currentScopeQnaThreadCount, setCurrentScopeQnaThreadCount] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('coneshare_dataroom_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('coneshare_dataroom_sidebar_collapsed', String(next));
      } catch (err) {
        console.error('Failed to save sidebar collapsed state', err);
      }
      return next;
    });
  }, []);
  const requestRef = useRef(0);
  const docRequestRef = useRef(0);
  const activeDocIdRef = useRef(null);
  const lastRecordedVisitRef = useRef(null);
  const initialFolderLoadedRef = useRef(false);

  // Document viewing sub-states
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const viewerRef = useRef(null);
  const viewerComponentRef = useRef(null);

  // Synchronize totalPages with documentViewData when it loads
  useEffect(() => {
    if (documentViewData) {
      setTotalPages(documentViewData.num_pages || (documentViewData.pages?.length || 1));
    }
  }, [documentViewData]);

  const handleDocumentLoad = useCallback(({ numPages }) => {
    setTotalPages(numPages);
  }, []);

  const handleFullScreen = () => {
    if (viewerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        viewerRef.current.requestFullscreen();
      }
    }
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.1, 0.5));
  const handleFitWidth = () => setZoomLevel(1);
  const handlePageChange = (pageNumber) => {
    viewerComponentRef.current?.goToPage(pageNumber);
  };

  const handleDownloadFolder = async (folder) => {
    toast.info(`Preparing to download "${folder.name}"...`);
    try {
      const response = await downloadDataroomFolder(slug, folder.id, viewId);

      const contentDisposition = response.headers['content-disposition'];
      let filename = `${folder.name}.zip`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch.length > 1) {
          filename = filenameMatch[1];
        }
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(`Successfully downloaded "${filename}".`);
    } catch (error) {
      console.error('Failed to download folder:', error);
    }
  };

  const handleDownloadDocument = (doc) => {
    const params = new URLSearchParams({ dataroom_document_id: doc.id });
    if (viewId) {
      params.set('view_session_id', viewId);
    }
    const downloadUrl = `/api/v1/links/${slug}/download-file/?${params.toString()}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', doc.name || doc.document_name);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDownloadClick = (item) => {
    if (item.type === 'folder') {
      handleDownloadFolder(item);
    } else {
      handleDownloadDocument(item);
    }
  };

  const handleQnaClick = (item) => {
    setQnaContext({
      id: item.id,
      type: item.type,
      label: item.name || item.document_name,
    });
  };

  const handleCurrentScopeQnaClick = () => {
    const currentFolderId = scopeData?.current_parent_id || null;
    const nextContext = {
      id: currentFolderId,
      type: currentFolderId ? 'folder' : 'dataroom',
      label: currentFolderId
        ? breadcrumbs[breadcrumbs.length - 1]?.name || scopeData.name
        : scopeData.name,
    };
    setQnaContext((current) => (
      current
        && current.id === nextContext.id
        && current.type === nextContext.type
        ? null
        : nextContext
    ));
  };

  const allItems = useMemo(() => (Array.isArray(scopeData.items) ? scopeData.items : []), [scopeData.items]);
  const breadcrumbs = Array.isArray(scopeData.breadcrumbs) ? scopeData.breadcrumbs : [];
  const currentFolderId = scopeData?.current_parent_id || null;

  // Keep local scope state aligned with parent-provided data refreshes.
  useEffect(() => {
    initialFolderLoadedRef.current = false;
    if (data) {
      if (data.link_type === 'dataroom') {
        setScopeData(data);
      } else if (data.link_type === 'document') {
        setDocumentViewData(data);
        if (data.dataroom_context) {
          setScopeData((prev) => ({
            ...prev,
            id: data.dataroom_context.id,
            name: data.dataroom_context.name,
            show_file_index: data.dataroom_context.show_file_index,
            branding_banner: data.dataroom_context.branding_banner,
            brand_primary_color: data.dataroom_context.brand_primary_color,
            brand_secondary_color: data.dataroom_context.brand_secondary_color,
            brand_accent_color: data.dataroom_context.brand_accent_color,
          }));
        }
      }
    }
  }, [data]);

  useEffect(() => {
    let isCancelled = false;
    const fetchCurrentScopeQnaThreadCount = async () => {
      if (!viewId) {
        setCurrentScopeQnaThreadCount(0);
        return;
      }

      try {
        const response = await getPublicQnaSummary(slug, {
          viewSessionId: viewId,
          dataroomFolderId: currentFolderId,
        });
        if (!isCancelled) {
          setCurrentScopeQnaThreadCount(response.data?.thread_count || 0);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to load current scope Q&A thread count:', error);
          setCurrentScopeQnaThreadCount(0);
        }
      }
    };

    fetchCurrentScopeQnaThreadCount();
    return () => {
      isCancelled = true;
    };
  }, [slug, viewId, currentFolderId]);

  const fetchScopeData = useCallback(async (parentId, options = {}) => {
    const { append = false, offset = 0 } = options;
    const requestId = ++requestRef.current;
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsNavigating(true);
    }
    try {
      const response = await getShareLinkViewData(slug, { parentId, limit: DATAROOM_VIEWER_PAGE_SIZE, offset });
      if (requestId !== requestRef.current) return;
      if (append) {
        setScopeData((prev) => ({
          ...prev,
          items: [...(prev?.items || []), ...(response.data.items || [])],
        }));
      } else {
        setScopeData(response.data);
      }
    } catch (err) {
      if (requestId !== requestRef.current) return;
      console.error('Failed to load folder scope:', err);
      toast.error('Could not load folder. Please try again.');
    } finally {
      if (requestId === requestRef.current) {
        if (append) {
          setIsLoadingMore(false);
        } else {
          setIsNavigating(false);
        }
      }
    }
  }, [slug]);

  useEffect(() => {
    const currentParentId = scopeData?.current_parent_id ? String(scopeData.current_parent_id) : null;
    const normalizedUrlParentId = parentIdFromUrl || null;
    if (normalizedUrlParentId === currentParentId) {
      return;
    }
    fetchScopeData(normalizedUrlParentId);
  }, [fetchScopeData, parentIdFromUrl, scopeData?.current_parent_id]);

  const handleLoadMore = useCallback(() => {
    const nextOffset = scopeData?.pagination?.next_offset;
    if (nextOffset === null || nextOffset === undefined) return;
    const normalizedUrlParentId = parentIdFromUrl || null;
    fetchScopeData(normalizedUrlParentId, { append: true, offset: nextOffset });
  }, [scopeData?.pagination?.next_offset, parentIdFromUrl, fetchScopeData]);

  // Document inline viewing logic
  const fetchDocumentViewData = useCallback(async (docId, { force = false } = {}) => {
    if (activeDocIdRef.current === docId && !force) {
      return;
    }
    activeDocIdRef.current = docId;

    const requestId = ++docRequestRef.current;
    setIsDocumentLoading(true);
    try {
      const response = await getShareLinkViewData(slug, {
        dataroomDocumentId: docId,
        viewSessionId: viewId || undefined,
      });

      if (requestId !== docRequestRef.current) return;

      setDocumentViewData(response.data);
    } catch (err) {
      if (requestId !== docRequestRef.current) return;
      console.error('Failed to load document view data:', err);
      toast.error('Could not load document. Please try again.');
    } finally {
      if (requestId === docRequestRef.current) {
        setIsDocumentLoading(false);
      }
    }
  }, [slug, viewId]);

  useEffect(() => {
    if (selectedDocumentId) {
      if (!documentViewData || String(documentViewData.id) !== String(selectedDocumentId)) {
        fetchDocumentViewData(selectedDocumentId);
      }
    } else {
      setDocumentViewData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocumentId, documentViewData?.id, fetchDocumentViewData]);

  // Reset current visit ID when document changes.
  // Clearing lastRecordedVisitRef when selectedDocumentId is falsy ensures that
  // navigating away and returning to the same document correctly records the visit again.
  useEffect(() => {
    setCurrentDataroomVisitId(null);
    if (!selectedDocumentId) {
      lastRecordedVisitRef.current = null;
    }
  }, [selectedDocumentId]);

  // Record visit once viewId and selectedDocumentId are both available
  useEffect(() => {
    if (!viewId || !selectedDocumentId) {
      return;
    }
    const visitKey = `${viewId}-${selectedDocumentId}`;
    if (lastRecordedVisitRef.current === visitKey) {
      return;
    }
    lastRecordedVisitRef.current = visitKey;

    const recordVisit = async () => {
      try {
        const visitRes = await recordDataroomVisit(viewId, { dataroomDocumentId: selectedDocumentId });
        setCurrentDataroomVisitId(visitRes.data.id);
      } catch (err) {
        console.error('Failed to record document visit:', err);
      }
    };

    recordVisit();
  }, [viewId, selectedDocumentId]);

  // Rewrite URL on direct deep link load to include parent_id
  useEffect(() => {
    if (dataroomDocumentIdFromUrl && !parentIdFromUrl) {
      const parentFolderId = data?.dataroom_context?.parent_folder_id;
      if (parentFolderId) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('parent_id', parentFolderId);
        if (viewId) {
          nextParams.set('view_session_id', viewId);
        }
        setSearchParams(nextParams);
      }
    }
  }, [dataroomDocumentIdFromUrl, parentIdFromUrl, data, searchParams, setSearchParams, viewId]);

  // Trigger parent folder load if starting with document deep-link but folder items not loaded
  useEffect(() => {
    if (data && data.dataroom_context && !scopeData?.items?.length && !initialFolderLoadedRef.current) {
      initialFolderLoadedRef.current = true;
      const parentId = data.dataroom_context.parent_folder_id;
      fetchScopeData(parentId);
    }
  }, [data, fetchScopeData, scopeData?.items?.length]);

  // Reset zoom & page when active document changes
  useEffect(() => {
    setCurrentPage(1);
    setZoomLevel(1);
  }, [selectedDocumentId]);

  // Poll for document preview rendering status updates if pending
  useEffect(() => {
    if (!documentViewData || !isPreviewPending(documentViewData)) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      fetchDocumentViewData(selectedDocumentId, { force: true });
    }, PREVIEW_POLL_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [documentViewData, selectedDocumentId, fetchDocumentViewData]);

  const handleItemClick = useCallback(async (item) => {
    if (item.type === 'folder') {
      if (viewId) {
        recordDataroomVisit(viewId, { dataroomFolderId: item.id }).catch((err) => {
          console.error('Failed to record folder visit:', err);
        });
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('parent_id', item.id);
      nextParams.delete('dataroom_document_id');
      if (viewId) {
        nextParams.set('view_session_id', viewId);
      }
      setSearchParams(nextParams);

      setDocumentViewData(null);
    } else {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('dataroom_document_id', item.id);
      const currentFolderId = scopeData?.current_parent_id || parentIdFromUrl || null;
      if (currentFolderId) {
        nextParams.set('parent_id', currentFolderId);
      } else {
        nextParams.delete('parent_id');
      }
      if (viewId) {
        nextParams.set('view_session_id', viewId);
      }
      setSearchParams(nextParams);
    }
  }, [viewId, searchParams, setSearchParams, scopeData?.current_parent_id, parentIdFromUrl]);

  const siblingDocs = useMemo(() => allItems.filter((item) => item.type === 'document'), [allItems]);
  const currentIndex = useMemo(() => {
    if (!selectedDocumentId) return -1;
    return siblingDocs.findIndex((item) => String(item.id) === String(selectedDocumentId));
  }, [siblingDocs, selectedDocumentId]);

  const hasPrevSibling = currentIndex > 0;
  const hasNextSibling = currentIndex !== -1 && currentIndex < siblingDocs.length - 1;

  const onPrevSibling = useCallback(() => {
    if (hasPrevSibling) {
      handleItemClick(siblingDocs[currentIndex - 1]);
    }
  }, [hasPrevSibling, currentIndex, siblingDocs, handleItemClick]);

  const onNextSibling = useCallback(() => {
    if (hasNextSibling) {
      handleItemClick(siblingDocs[currentIndex + 1]);
    }
  }, [hasNextSibling, currentIndex, siblingDocs, handleItemClick]);

  // Keyboard navigation event listener
  useEffect(() => {
    if (!selectedDocumentId) {
      return undefined;
    }

    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        return;
      }

      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
        e.preventDefault();
        onNextSibling();
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        onPrevSibling();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextPage = Math.min(currentPage + 1, totalPages);
        if (nextPage !== currentPage) {
          viewerComponentRef.current?.goToPage(nextPage);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevPage = Math.max(currentPage - 1, 1);
        if (prevPage !== currentPage) {
          viewerComponentRef.current?.goToPage(prevPage);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        setZoomLevel((prev) => Math.min(prev + 0.1, 3));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setZoomLevel((prev) => Math.max(prev - 0.1, 0.5));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        setZoomLevel(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDocumentId, currentPage, totalPages, onPrevSibling, onNextSibling]);

  const handlePrint = () => {
    if (!documentViewData) return;

    if (documentViewData.preview_mode === 'client_pdf') {
      printPdf(documentViewData.pdf_preview_url);
    } else {
      if (documentViewData.link_settings?.allow_download && documentViewData.type === 'pdf') {
        printPdf(docDownloadUrl);
      } else {
        const imageUrls = documentViewData.pages?.map((p) => p.url) || [];
        printImages(imageUrls);
      }
    }
  };

  const themeStyle = {
    '--viewer-primary': scopeData.brand_primary_color || '#111827',
    '--viewer-secondary': scopeData.brand_secondary_color || '#4b5563',
    '--viewer-accent': scopeData.brand_accent_color || '#1f2937',
  };

  const showDocumentViewer = Boolean(selectedDocumentId);

  const isDocActive = showDocumentViewer;
  const isCurrentScopeQnaOpen = Boolean(
    qnaContext
      && !isDocActive
      && qnaContext.type === (currentFolderId ? 'folder' : 'dataroom')
      && qnaContext.id === currentFolderId
  );
  const isDocQnaOpen = Boolean(
    qnaContext
      && isDocActive
      && qnaContext.type === 'document'
      && qnaContext.id === selectedDocumentId
  );

  const handleQnaToggle = () => {
    if (isDocActive) {
      if (!documentViewData) return;
      const nextContext = {
        id: selectedDocumentId,
        type: 'document',
        label: documentViewData.name,
      };
      setQnaContext((current) => (
        current && current.id === nextContext.id && current.type === nextContext.type
          ? null
          : nextContext
      ));
    } else {
      handleCurrentScopeQnaClick();
    }
  };

  const currentScopeQnaButtonLabel = isDocActive
    ? `${isDocQnaOpen ? 'Close' : 'Open'} Q&A for this document`
    : `${isCurrentScopeQnaOpen ? 'Close' : 'Open'} Q&A for current folder${
        currentScopeQnaThreadCount > 0 ? `, ${currentScopeQnaThreadCount} threads` : ''
      }`;

  // Inline Document Viewer specific layout parameters
  const PREVIEWABLE_TYPES = ['image', 'pdf', 'document'];
  const isPreviewable = documentViewData && PREVIEWABLE_TYPES.includes(documentViewData.type);
  const canDownload = Boolean(documentViewData?.link_settings?.allow_download);
  const canRenderPages = hasRenderablePages(documentViewData);
  const showPreviewState = documentViewData && isPreviewable && !documentViewData.download_only && !canRenderPages && documentViewData.preview_mode !== 'client_pdf';

  let docDownloadUrl = `/api/v1/links/${slug}/download-file/`;
  if (selectedDocumentId) {
    docDownloadUrl += `?dataroom_document_id=${selectedDocumentId}`;
  }
  if (viewId) {
    docDownloadUrl += `&view_session_id=${viewId}`;
  }

  return (
    <div
      className={`flex h-screen w-screen flex-col bg-gray-50 transition-[padding] duration-200 ${qnaContext ? 'lg:pr-[34rem] xl:pr-[38rem]' : ''}`}
      style={themeStyle}
    >
      <header className="flex flex-shrink-0 items-center justify-between border-b bg-white p-3 sm:p-4">
        <h1 className="mr-2 truncate text-base font-semibold sm:text-xl" style={{ color: 'var(--viewer-primary)' }}>{scopeData.name}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full bg-white px-3 text-gray-900 hover:bg-gray-100 hover:text-gray-900 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:hover:text-gray-900"
            onClick={handleQnaToggle}
            disabled={!viewId}
            aria-label={currentScopeQnaButtonLabel}
            title={currentScopeQnaButtonLabel}
          >
            <MessageCircle className="h-4 w-4" />
            <span className="ml-2 font-semibold">{isDocActive ? 'Document Q&A' : 'Q&A'}</span>
            {!isDocActive && currentScopeQnaThreadCount > 0 && (
              <span
                className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
                aria-hidden="true"
              >
                {currentScopeQnaThreadCount}
              </span>
            )}
          </Button>
          <a href="/" className="flex items-center gap-2 rounded-md p-2 font-semibold" style={{ color: 'var(--viewer-primary)' }}>
            <img src="/logo.svg" alt="Coneshare logo" className="h-6 w-6" />
            <span className="hidden sm:inline">Coneshare</span>
          </a>
        </div>
      </header>
      {scopeData.branding_banner && !showDocumentViewer && (
        <section className="flex-shrink-0 border-b bg-white">
          <img src={scopeData.branding_banner} alt={`${scopeData.name} banner`} className="h-32 w-full object-cover md:h-44" />
        </section>
      )}

      <nav className="flex-shrink-0 border-b bg-white px-3 py-2 sm:px-4">
        <ol className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap text-sm" style={{ color: 'var(--viewer-secondary)' }}>
          <li>
            <button
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.delete('parent_id');
                nextParams.delete('dataroom_document_id');
                if (viewId) {
                  nextParams.set('view_session_id', viewId);
                }
                setSearchParams(nextParams);
                setDocumentViewData(null);
              }}
              className="flex items-center gap-2"
              style={{ color: 'var(--viewer-secondary)' }}
            >
              <HomeIcon className="h-4 w-4" />
              <span>Root</span>
            </button>
          </li>
          {breadcrumbs.map(crumb => (
            <li key={crumb.id} className="flex items-center">
              <ChevronRight className="h-4 w-4" style={{ color: 'var(--viewer-secondary)' }} />
              <button
                onClick={() => {
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.set('parent_id', crumb.id);
                  nextParams.delete('dataroom_document_id');
                  if (viewId) {
                    nextParams.set('view_session_id', viewId);
                  }
                  setSearchParams(nextParams);
                  setDocumentViewData(null);
                }}
                className="ml-2"
                style={{ color: 'var(--viewer-secondary)' }}
              >
                {crumb.name}
              </button>
            </li>
          ))}
          {showDocumentViewer && documentViewData && (
            <li className="flex items-center">
              <ChevronRight className="h-4 w-4" style={{ color: 'var(--viewer-secondary)' }} />
              <span className="ml-2 font-medium" style={{ color: 'var(--viewer-primary)' }}>
                {documentViewData.name}
              </span>
            </li>
          )}
        </ol>
      </nav>

      {showDocumentViewer ? (
        <main className="flex-1 flex overflow-hidden border-t relative">
          <DataroomSiblingNav
            slug={slug}
            viewId={viewId}
            items={allItems}
            selectedDocumentId={selectedDocumentId}
            onItemClick={handleItemClick}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={handleToggleSidebarCollapse}
            currentFolderName={breadcrumbs[breadcrumbs.length - 1]?.name || scopeData.name}
          />
          {isDocumentLoading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-primary mx-auto mb-4" />
                <p className="text-gray-500 text-sm">Loading document...</p>
              </div>
            </div>
          ) : documentViewData ? (
            <div className="flex-1 flex flex-col relative h-full bg-gray-100 overflow-hidden" ref={viewerRef}>
              {documentViewData.download_only || !isPreviewable ? (
                <div className="flex h-full items-center justify-center p-4 w-full bg-white">
                  <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-lg border">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                      <DownloadIcon className="h-6 w-6 text-gray-600" />
                    </div>
                    <h1 className="mb-1 text-xl font-bold text-gray-900 truncate" title={documentViewData.name}>
                      {documentViewData.name}
                    </h1>
                    {documentViewData.file_size ? (
                      <p className="mb-6 text-sm text-gray-500">{formatBytes(documentViewData.file_size)}</p>
                    ) : null}
                    <p className="mb-6 text-gray-700">
                      This type of file is not available for online preview. Download the file and open it
                      on your device.
                    </p>
                    {canDownload ? (
                      <Button asChild size="lg" className="w-full">
                        <a href={docDownloadUrl} download={documentViewData.name}>
                          Download
                        </a>
                      </Button>
                    ) : (
                      <>
                        <Button size="lg" className="w-full" disabled>
                          Download
                        </Button>
                        <p className="mt-2 text-sm text-gray-500">
                          Download is disabled for this document by the link permissions.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : showPreviewState ? (
                <div className="flex-1 flex items-center justify-center bg-gray-50 h-full w-full">
                  <PreviewStatePanel
                    documentData={documentViewData}
                    allowDownload={canDownload}
                    downloadUrl={docDownloadUrl}
                  />
                </div>
              ) : (
                <div className="relative flex-1 flex flex-col h-full overflow-hidden">
                  <ViewerToolbar
                    allowDownload={documentViewData.link_settings.allow_download}
                    downloadUrl={docDownloadUrl}
                    downloadFileName={documentViewData.name}
                    downloadDocumentId={selectedDocumentId}
                    onFullScreen={handleFullScreen}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    zoomLevel={zoomLevel}
                    onFitWidth={handleFitWidth}
                    onPageChange={handlePageChange}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    viewId={viewId}
                    previewMode={documentViewData.preview_mode}
                    onPrint={handlePrint}
                    hasPrevSibling={hasPrevSibling}
                    hasNextSibling={hasNextSibling}
                    onPrevSibling={onPrevSibling}
                    onNextSibling={onNextSibling}
                  />
                  {documentViewData.preview_mode === 'client_pdf' ? (
                    <PdfJsViewer
                      ref={viewerComponentRef}
                      pdfUrl={documentViewData.pdf_preview_url}
                      title={documentViewData.name}
                      viewId={viewId}
                      dataroomVisitId={currentDataroomVisitId}
                      watermarkText={
                        documentViewData.link_settings?.enable_watermark
                          ? (documentViewData.link_settings.resolved_watermark_text || documentViewData.link_settings.watermark_text || '')
                          : ''
                      }
                      zoomLevel={zoomLevel}
                      onPageChange={setCurrentPage}
                      onDocumentLoad={handleDocumentLoad}
                    />
                  ) : (
                    <PreviewViewer
                      ref={viewerComponentRef}
                      documentData={documentViewData}
                      zoomLevel={zoomLevel}
                      onPageChange={setCurrentPage}
                      viewId={viewId}
                      dataroomVisitId={currentDataroomVisitId}
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <p className="text-gray-500">No document view data available.</p>
            </div>
          )}
        </main>
      ) : (
        <main className="flex-1 overflow-y-auto border-t">
          <div
            className="flex w-full items-center border-b px-3 py-2 text-xs font-medium sm:px-4"
            style={{
              color: 'var(--viewer-secondary)',
              backgroundColor: 'color-mix(in srgb, var(--viewer-secondary) 8%, white)',
            }}
          >
            {scopeData.show_file_index && <div className="hidden w-10 sm:block">#</div>}
            <div className="w-7 sm:w-8" />
            <div className="min-w-0 flex-1 pr-2 sm:pr-4">Name</div>
            <div className="hidden w-[20%] sm:block">Last Modified</div>
            <div className="hidden w-[10%] sm:block">Size</div>
            <div className="w-9 shrink-0 text-right sm:w-[10%]">Actions</div>
          </div>
          {isNavigating ? (
            <div className="divide-y">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex w-full items-center px-4 py-2">
                  {scopeData.show_file_index && <div className="w-10"><div className="h-3 w-4 animate-pulse rounded bg-gray-200" /></div>}
                  <div className="w-8"><div className="h-4 w-4 animate-pulse rounded bg-gray-200" /></div>
                  <div className="w-[50%] pr-4"><div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" /></div>
                  <div className="w-[20%]"><div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" /></div>
                  <div className="w-[10%]"><div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" /></div>
                  <div className="w-[10%] text-right"><div className="ml-auto h-4 w-4 animate-pulse rounded bg-gray-200" /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {allItems.map((item, idx) => (
                <ListItem
                  key={item.id}
                  item={item}
                  onItemClick={handleItemClick}
                  onDownloadClick={handleDownloadClick}
                  onQnaClick={handleQnaClick}
                  showIndex={Boolean(scopeData.show_file_index)}
                  index={idx + 1}
                />
              ))}
              {scopeData?.pagination?.has_more && (
                <div className="flex justify-center py-4">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? 'Loading...' : 'Load more'}
                  </Button>
                </div>
              )}
            </div>
          )}
          {!isNavigating && allItems.length === 0 && (
            <div className="p-12 text-center" style={{ color: 'var(--viewer-secondary)' }}>This folder is empty.</div>
          )}
        </main>
      )}

      <QnAPanel
        open={Boolean(qnaContext)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setQnaContext(null);
        }}
        slug={slug}
        viewId={viewId}
        dataroomDocumentId={qnaContext?.type === 'document' ? qnaContext.id : null}
        dataroomFolderId={qnaContext?.type === 'folder' ? qnaContext.id : null}
        contextLabel={qnaContext?.label || scopeData.name}
        onThreadCountChange={(count) => {
          if (
            qnaContext
            && qnaContext.type === (currentFolderId ? 'folder' : 'dataroom')
            && qnaContext.id === currentFolderId
          ) {
            setCurrentScopeQnaThreadCount(count);
          }
        }}
      />
    </div>
  );
}
