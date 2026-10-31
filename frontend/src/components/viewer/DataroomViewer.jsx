import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  HomeIcon,
  ChevronRight,
  DownloadIcon,
  MoreHorizontal,
  Eye,
  MessageCircle,
  AlertTriangle,
  ChevronsLeft,
  ChevronsRight,
  Search,
  LayoutGrid,
  List as ListIcon,
  Lock,
  FileText,
} from 'lucide-react';
import { formatRelativeTime } from '../../utils/formatters';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { formatBytes } from '../../lib/formatters';
import { FileTypeIcon, getDocumentBadgeStyle } from '../documents/FileTypeIcon';
import { Button } from '../ui/Button';
import { QnAPanel } from './QnAPanel';
import { DocumentViewerHeader } from './DocumentViewerHeader';
import { DataroomBannerGallery } from './DataroomBannerGallery';
import { DataroomDefaultHeroBanner } from './DataroomDefaultHeroBanner';
import { DataroomFeaturedGrid } from './DataroomFeaturedGrid';
import { DataroomFolderGrid } from './DataroomFolderGrid';
import { DataroomDocumentCard } from './DataroomDocumentCard';
import { DataroomFileTree } from './DataroomFileTree';
import { ViewerToolbar } from './ViewerToolbar';
import { PreviewViewer } from '../documents/PreviewViewer';

const PdfJsViewer = lazy(() => import('../documents/PdfJsViewer').then(m => ({ default: m.PdfJsViewer })));
const VideoViewer = lazy(() => import('../documents/VideoViewer').then(m => ({ default: m.VideoViewer })));
const SpreadsheetViewer = lazy(() => import('../documents/SpreadsheetViewer').then(m => ({ default: m.SpreadsheetViewer })));
const MarkdownViewer = lazy(() => import('../documents/MarkdownViewer').then(m => ({ default: m.MarkdownViewer })));
import { printPdf, printImages } from '../../lib/print';
import {
  hasRenderablePages,
  isPreviewPending,
} from '../../utils/previewState';
import { PreviewStatePanel } from '../documents/PreviewStatePanel';
import {
  downloadDataroomFolder,
  downloadDataroomArchive,
  getPublicQnaSummary,
  getShareLinkViewData,
  recordDataroomVisit,
} from '../../services/api';
import { DATAROOM_VIEWER_PAGE_SIZE } from '../../constants/pagination';
import { useBranding } from '../../contexts/BrandingProvider';
import { LanguagePicker } from '../common/LanguagePicker';

const PREVIEW_POLL_INTERVAL_MS = 3000;

function ListItem({ item, onItemClick, onDownloadClick, onQnaClick, qnaEnabled = true, showIndex = false, index = null }) {
  const { t } = useTranslation();
  const isFolder = item.type === 'folder';
  const isVideo = item.document_type === 'video' || item.type === 'video';
  const indexLabel = index !== null ? `#${String(index).padStart(2, '0')}` : null;

  return (
    <article
      data-testid={`document-row-${item.id}`}
      className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-xl bg-white hover:bg-gray-50/70 border border-gray-200/60 shadow-2xs hover:shadow-xs hover:border-gray-300 transition-all gap-3"
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        {showIndex && indexLabel && (
          <span className="font-mono text-xs text-gray-400 font-bold shrink-0 mt-0.5 sm:mt-0">
            {indexLabel}
          </span>
        )}
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${getDocumentBadgeStyle(isFolder ? 'folder' : item.document_type)}`}>
          <FileTypeIcon
            type={isFolder ? 'folder' : item.document_type}
            className="h-5 w-5 shrink-0"
            palette="viewer"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onItemClick(item)}
              className="truncate text-left text-sm sm:text-base font-medium text-gray-900 hover:text-primary transition-colors"
              title={item.name || item.document_name}
            >
              {item.name || item.document_name}
            </button>
            {!isFolder && item.document_type && (
              <span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px] text-gray-600 uppercase font-semibold">
                {item.document_type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
            {!isFolder && typeof item.file_size === 'number' && (
              <span>{formatBytes(item.file_size)}</span>
            )}
            {item.updated_at && (
              <>
                {!isFolder && typeof item.file_size === 'number' && <span>•</span>}
                <span>{formatRelativeTime(item.updated_at)}</span>
              </>
            )}
            {item.enable_watermark && (
              <>
                <span>•</span>
                <span className="inline-flex items-center gap-0.5 text-gray-500 dark:text-gray-400">
                  <Lock className="h-3 w-3" />
                  <span>{t('viewer.watermarked', { defaultValue: 'Watermarked' })}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 self-end sm:self-center ml-auto">
        {qnaEnabled && onQnaClick && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex h-8 w-8 text-gray-500 hover:text-gray-900"
            title={t('qna.askQuestion', { defaultValue: 'Ask question' })}
            onClick={(e) => {
              e.stopPropagation();
              onQnaClick(item);
            }}
          >
            <MessageCircle className="h-4 w-4" />
          </Button>
        )}
        {item.allow_download && onDownloadClick && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden sm:inline-flex h-8 w-8 text-gray-500 hover:text-gray-900"
            title={t('viewer.download', { defaultValue: 'Download' })}
            onClick={(e) => {
              e.stopPropagation();
              onDownloadClick(item);
            }}
          >
            <DownloadIcon className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="sm"
          className="h-8 px-3 text-xs font-medium gap-1.5 shrink-0 rounded-lg bg-gray-950 hover:bg-gray-800 text-white shadow-xs transition-all"
          onClick={(e) => {
            e.stopPropagation();
            onItemClick(item);
          }}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>
            {isVideo
              ? t('viewer.watchVideo', { defaultValue: 'Watch Video' })
              : t('viewer.viewDocument', { defaultValue: 'View Document' })}
          </span>
        </Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden h-8 w-8 text-gray-500 hover:text-gray-900 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
              }}
              aria-label={t('common.actionsFor', { name: item.name || item.document_name, defaultValue: `Actions for ${item.name || item.document_name}` })}
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
                <span>{t('viewer.view')}</span>
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
                  <span>{t('viewer.download')}</span>
                </DropdownMenu.Item>
              )}
              {qnaEnabled && (
                <DropdownMenu.Item
                  onSelect={(e) => {
                    e.stopPropagation();
                    onQnaClick(item);
                  }}
                  className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  <span>{t('qna.title')}</span>
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </article>
  );
}

export function DataroomViewer({ data, slug, viewId, publicMeta }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { brandName, brandLogoUrl, brandWebsiteUrl } = useBranding();
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
        updated_at: data.dataroom_context.updated_at || data.updated_at,
        created_at: data.dataroom_context.created_at || data.created_at,
        show_file_index: data.dataroom_context.show_file_index,
        branding_banner: data.dataroom_context.branding_banner,
        banner_mode: data.dataroom_context.banner_mode,
        banner_images: data.dataroom_context.banner_images || [],
        logo_mode: data.dataroom_context.logo_mode,
        brand_logo_override: data.dataroom_context.brand_logo_override,
        resolved_brand_logo_url: data.dataroom_context.resolved_brand_logo_url,
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
  const showDocumentViewer = Boolean(selectedDocumentId);
  const [isDocumentLoading, setIsDocumentLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [rootItems, setRootItems] = useState([]);
  const [isRootLoading, setIsRootLoading] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [qnaContext, setQnaContext] = useState(null);
  const [currentScopeQnaThreadCount, setCurrentScopeQnaThreadCount] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    // On mobile devices (< 768px), default to collapsed so the document gets full width
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return true;
    }
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
  const visitRequestRef = useRef(0);
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

  const handleDownloadFolder = useCallback(async (folder) => {
    setIsDownloadingAll(true);
    toast.info(`Preparing to download "${folder.name}"...`);
    try {
      const response = await downloadDataroomFolder(slug, folder.id, viewId);

      const contentDisposition = response.headers?.['content-disposition'];
      let filename = `${folder.name}.zip`;
      if (contentDisposition) {
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match && utf8Match[1]) {
          filename = decodeURIComponent(utf8Match[1]);
        } else {
          const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
          if (asciiMatch && asciiMatch[1]) {
            filename = asciiMatch[1];
          }
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
      toast.error('Failed to download folder');
    } finally {
      setIsDownloadingAll(false);
    }
  }, [slug, viewId]);

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

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('coneshare_dataroom_view_mode') || 'list';
    } catch {
      return 'list';
    }
  });

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('coneshare_dataroom_view_mode', mode);
    } catch {
      // ignore storage access errors
    }
  };

  const allItems = useMemo(() => (Array.isArray(scopeData.items) ? scopeData.items : []), [scopeData.items]);
  const breadcrumbs = useMemo(() => {
    return (Boolean(selectedDocumentId) && documentViewData?.dataroom_context?.breadcrumbs)
      ? documentViewData.dataroom_context.breadcrumbs
      : (Array.isArray(scopeData.breadcrumbs) ? scopeData.breadcrumbs : []);
  }, [selectedDocumentId, documentViewData?.dataroom_context?.breadcrumbs, scopeData.breadcrumbs]);
  const activePathFolderIds = useMemo(() => breadcrumbs.map((b) => String(b.id)), [breadcrumbs]);
  const currentFolderId = scopeData?.current_parent_id || null;
  const isScopeQnaEnabled = (
    scopeData?.link_settings?.enable_qna
    ?? data?.link_settings?.enable_qna
    ?? true
  ) !== false;

  // Filter items by client-side search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems;
    const q = searchQuery.trim().toLowerCase();
    return allItems.filter((item) => {
      const name = (item.name || item.document_name || '').toLowerCase();
      const docType = (item.document_type || '').toLowerCase();
      return name.includes(q) || docType.includes(q);
    });
  }, [allItems, searchQuery]);

  const featuredItems = useMemo(
    () => filteredItems.filter((item) => Boolean(item.is_starred)),
    [filteredItems]
  );
  const folderItems = useMemo(
    () => filteredItems.filter((item) => item.type === 'folder'),
    [filteredItems]
  );
  const documentItems = useMemo(
    () => filteredItems.filter((item) => item.type !== 'folder'),
    [filteredItems]
  );

  // Global ⌘K / Ctrl+K listener to focus search input
  const shortcutHint = useMemo(() => {
    if (typeof navigator === 'undefined') return '⌘K';
    const platform =
      navigator.userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      '';
    return /Mac|iPhone|iPod|iPad/i.test(platform) ? '⌘K' : 'Ctrl+K';
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        if (!showDocumentViewer && searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDocumentViewer]);

  // Reset search filter when navigating to a different folder
  useEffect(() => {
    setSearchQuery('');
  }, [scopeData?.current_parent_id]);

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
      if (!viewId || !isScopeQnaEnabled) {
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
  }, [slug, viewId, currentFolderId, isScopeQnaEnabled]);

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
    if (scopeData && (scopeData.current_parent_id === null || scopeData.current_parent_id === undefined) && Array.isArray(scopeData.items) && scopeData.items.length > 0) {
      setRootItems(scopeData.items);
    }
  }, [scopeData]);

  useEffect(() => {
    if (!selectedDocumentId || rootItems.length > 0 || isRootLoading) return;
    const fetchRootItems = async () => {
      setIsRootLoading(true);
      try {
        const response = await getShareLinkViewData(slug, { parentId: null });
        setRootItems(response.data.items || []);
      } catch (err) {
        console.error('Failed to load root folder:', err);
      } finally {
        setIsRootLoading(false);
      }
    };
    fetchRootItems();
  }, [slug, selectedDocumentId, rootItems.length, isRootLoading]);

  useEffect(() => {
    const currentParentId = scopeData?.current_parent_id ? String(scopeData.current_parent_id) : null;
    const normalizedUrlParentId = parentIdFromUrl || null;
    if (normalizedUrlParentId === currentParentId) {
      return;
    }
    // If the URL has no parent_id on direct deep link load, let the rewrite useEffect run first
    if (dataroomDocumentIdFromUrl && !searchParams.has('parent_id')) {
      return;
    }
    fetchScopeData(normalizedUrlParentId);
  }, [fetchScopeData, parentIdFromUrl, scopeData?.current_parent_id, dataroomDocumentIdFromUrl, searchParams]);

  const handleLoadMore = useCallback(() => {
    const nextOffset = scopeData?.pagination?.next_offset;
    if (nextOffset === null || nextOffset === undefined) return;
    const normalizedUrlParentId = parentIdFromUrl || null;
    fetchScopeData(normalizedUrlParentId, { append: true, offset: nextOffset });
  }, [scopeData?.pagination?.next_offset, parentIdFromUrl, fetchScopeData]);

  // Document inline viewing logic
  // activeDocIdRef must always be cleared with documentViewData, or the guard below blocks refetches.
  const clearDocumentView = useCallback(() => {
    activeDocIdRef.current = null;
    setDocumentViewData(null);
  }, []);

  const fetchDocumentViewData = useCallback(async (docId, { force = false, silent = false } = {}) => {
    if (activeDocIdRef.current === docId && !force) {
      return;
    }
    activeDocIdRef.current = docId;

    const requestId = ++docRequestRef.current;
    if (!silent) {
      setIsDocumentLoading(true);
    }
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
      if (activeDocIdRef.current === docId) {
        activeDocIdRef.current = null;
      }
      toast.error('Could not load document. Please try again.');
    } finally {
      if (requestId === docRequestRef.current && !silent) {
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
      clearDocumentView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocumentId, documentViewData?.id, fetchDocumentViewData]);

  // Reset current visit ID when document changes.
  // Clearing lastRecordedVisitRef when selectedDocumentId is falsy ensures that
  // navigating away and returning to the same document correctly records the visit again.
  useEffect(() => {
    setCurrentDataroomVisitId(null);
    visitRequestRef.current += 1;
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
    const currentRequestId = ++visitRequestRef.current;
    let isCurrent = true;

    const recordVisit = async () => {
      try {
        const visitRes = await recordDataroomVisit(viewId, { dataroomDocumentId: selectedDocumentId });
        if (isCurrent && currentRequestId === visitRequestRef.current) {
          setCurrentDataroomVisitId(visitRes.data.id);
        }
      } catch (err) {
        console.error('Failed to record document visit:', err);
      }
    };

    recordVisit();
    return () => {
      isCurrent = false;
    };
  }, [viewId, selectedDocumentId]);

  // Rewrite URL on direct deep link load to include parent_id
  useEffect(() => {
    if (dataroomDocumentIdFromUrl && !searchParams.has('parent_id')) {
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
  }, [dataroomDocumentIdFromUrl, data, searchParams, setSearchParams, viewId]);

  // Trigger parent folder load if starting with document deep-link but folder items not loaded
  useEffect(() => {
    if (data && data.dataroom_context && !scopeData?.items?.length && !initialFolderLoadedRef.current && !parentIdFromUrl) {
      initialFolderLoadedRef.current = true;
      const parentId = searchParams.has('parent_id') ? (parentIdFromUrl || null) : data.dataroom_context.parent_folder_id;
      fetchScopeData(parentId);
    }
  }, [data, fetchScopeData, scopeData?.items?.length, parentIdFromUrl, searchParams]);

  // Reset zoom & page when active document changes
  useEffect(() => {
    setCurrentPage(1);
    setZoomLevel(1);
  }, [selectedDocumentId]);

  // Synchronize documentViewData name with allItems/sidebar list updates
  useEffect(() => {
    if (selectedDocumentId && documentViewData && String(documentViewData.id) === String(selectedDocumentId)) {
      const matchingItem = allItems.find(item => item.type === 'document' && String(item.id) === String(selectedDocumentId));
      if (matchingItem && matchingItem.name !== documentViewData.name) {
        setDocumentViewData(prev => prev ? { ...prev, name: matchingItem.name } : null);
      }
    }
  }, [allItems, selectedDocumentId, documentViewData]);

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

      clearDocumentView();
    } else {
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setIsSidebarCollapsed(true);
      }
      if (documentViewData && String(documentViewData.id) === String(item.id) && documentViewData.name !== item.name) {
        setDocumentViewData(prev => prev ? { ...prev, name: item.name } : null);
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('dataroom_document_id', item.id);
      if (!nextParams.has('parent_id')) {
        nextParams.set('parent_id', '');
      }
      if (viewId) {
        nextParams.set('view_session_id', viewId);
      }
      setSearchParams(nextParams);

      if (String(selectedDocumentId) === String(item.id) && !documentViewData && !isDocumentLoading) {
        fetchDocumentViewData(item.id, { force: true });
      }
    }
  }, [
    viewId,
    searchParams,
    setSearchParams,
    documentViewData,
    clearDocumentView,
    selectedDocumentId,
    isDocumentLoading,
    fetchDocumentViewData,
  ]);

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

      // Allow ArrowDown / ArrowUp to scroll naturally without hijacking.
      // ArrowLeft / ArrowRight are used for slide/page navigation or video seeking.
      if (e.key === 'ArrowRight') {
        if (typeof viewerComponentRef.current?.seekBy === 'function') {
          e.preventDefault();
          viewerComponentRef.current.seekBy(5);
        } else if (typeof viewerComponentRef.current?.goToPage === 'function') {
          const nextPage = Math.min(currentPage + 1, totalPages);
          if (nextPage !== currentPage) {
            e.preventDefault();
            viewerComponentRef.current.goToPage(nextPage);
          }
        }
      } else if (e.key === 'ArrowLeft') {
        if (typeof viewerComponentRef.current?.seekBy === 'function') {
          e.preventDefault();
          viewerComponentRef.current.seekBy(-5);
        } else if (typeof viewerComponentRef.current?.goToPage === 'function') {
          const prevPage = Math.max(currentPage - 1, 1);
          if (prevPage !== currentPage) {
            e.preventDefault();
            viewerComponentRef.current.goToPage(prevPage);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDocumentId, currentPage, totalPages]);

  const handlePrint = () => {
    if (!documentViewData || !documentViewData.link_settings?.allow_download) return;

    const isWatermarked = Boolean(
      documentViewData.link_settings?.enable_watermark ?? scopeData?.link_settings?.enable_watermark
    );

    if (documentViewData.preview_mode === 'client_pdf') {
      if (isWatermarked && docDownloadUrl) {
        const inlineUrl = docDownloadUrl.includes('?') ? `${docDownloadUrl}&inline=true` : `${docDownloadUrl}?inline=true`;
        printPdf(inlineUrl);
      } else {
        printPdf(documentViewData.pdf_preview_url);
      }
    } else {
      if (documentViewData.type === 'pdf' && docDownloadUrl) {
        const inlineUrl = docDownloadUrl.includes('?') ? `${docDownloadUrl}&inline=true` : `${docDownloadUrl}?inline=true`;
        printPdf(inlineUrl);
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

  const isDocActive = showDocumentViewer;
  const isQnaEnabled = (
    documentViewData?.link_settings?.enable_qna
    ?? scopeData?.link_settings?.enable_qna
    ?? true
  ) !== false;
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
    ? (isDocQnaOpen
        ? t('qna.closeDocumentQna', { defaultValue: 'Close Q&A for this document' })
        : t('qna.openDocumentQna', { defaultValue: 'Open Q&A for this document' }))
    : (isCurrentScopeQnaOpen
        ? t('qna.closeFolderQna', { defaultValue: 'Close Q&A for current folder' })
        : t('qna.openFolderQna', { defaultValue: 'Open Q&A for current folder' })) +
      (currentScopeQnaThreadCount > 0 ? `, ${t('qna.threadsCount', { count: currentScopeQnaThreadCount, defaultValue: `${currentScopeQnaThreadCount} threads` })}` : '');

  // Inline Document Viewer specific layout parameters
  const PREVIEWABLE_TYPES = ['image', 'pdf', 'document', 'video', 'spreadsheet', 'markdown'];
  const isPreviewable = documentViewData && PREVIEWABLE_TYPES.includes(documentViewData.type);
  const canDownload = Boolean(documentViewData?.link_settings?.allow_download);
  const isVideo = documentViewData && documentViewData.type === 'video';
  const isVideoReady = isVideo && documentViewData.preview_status === 'ready';
  const isSpreadsheet = documentViewData && documentViewData.preview_mode === 'spreadsheet';
  const isSpreadsheetReady = isSpreadsheet && (documentViewData.preview_status === 'ready' || Boolean(documentViewData.spreadsheet_preview_url));
  const isMarkdown = documentViewData && documentViewData.preview_mode === 'markdown';
  const isMarkdownReady = isMarkdown && (documentViewData.preview_status === 'ready' || Boolean(documentViewData.markdown_preview_url));
  const canRenderPages = hasRenderablePages(documentViewData);
  const showPreviewState = documentViewData && isPreviewable && !documentViewData.download_only && (
    isVideo
      ? !isVideoReady
      : isSpreadsheet
        ? !isSpreadsheetReady
        : isMarkdown
          ? !isMarkdownReady
          : (!canRenderPages && documentViewData.preview_mode !== 'client_pdf')
  );

  let docDownloadUrl = `/api/v1/links/${slug}/download-file/`;
  if (selectedDocumentId) {
    docDownloadUrl += `?dataroom_document_id=${selectedDocumentId}`;
  }
  if (viewId) {
    docDownloadUrl += `&view_session_id=${viewId}`;
  }

  const effectiveLogoUrl = scopeData?.resolved_brand_logo_url || publicMeta?.resolved_brand_logo_url || brandLogoUrl;
  const isWatermarked = Boolean(
    documentViewData?.link_settings?.enable_watermark ?? scopeData?.link_settings?.enable_watermark
  );
  const isNdaProtected = Boolean(
    scopeData?.link_settings?.require_nda || publicMeta?.require_nda
  );

  const isLinkDownloadAllowed = Boolean(
    scopeData?.link_settings?.allow_download ?? data?.link_settings?.allow_download
  );

  const downloadButtonLabel = currentFolderId ? 'Download folder' : 'Download all';

  const hasDownloadableItems = useMemo(() => {
    if (currentFolderId) {
      return allItems.some((item) => item.allow_download);
    }
    return isLinkDownloadAllowed;
  }, [allItems, isLinkDownloadAllowed, currentFolderId]);

  const isDownloadAllowed = isLinkDownloadAllowed && hasDownloadableItems;

  const handleDownloadAll = useCallback(async () => {
    if (!slug) return;
    setIsDownloadingAll(true);
    try {
      const response = await downloadDataroomArchive(slug, viewId);

      const contentDisposition = response.headers?.['content-disposition'];
      let filename = `${scopeData?.name || 'dataroom'}.zip`;
      if (contentDisposition) {
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match && utf8Match[1]) {
          filename = decodeURIComponent(utf8Match[1]);
        } else {
          const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
          if (asciiMatch && asciiMatch[1]) {
            filename = asciiMatch[1];
          }
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

      toast.success('Download started');
    } catch (error) {
      console.error('Failed to download dataroom archive:', error);
      toast.error('Failed to download dataroom archive');
    } finally {
      setIsDownloadingAll(false);
    }
  }, [slug, viewId, scopeData?.name]);

  const handleHeaderDownload = useCallback(() => {
    if (currentFolderId) {
      const currentFolderName = breadcrumbs[breadcrumbs.length - 1]?.name || scopeData?.name || 'folder';
      handleDownloadFolder({ id: currentFolderId, name: currentFolderName });
    } else {
      handleDownloadAll();
    }
  }, [currentFolderId, breadcrumbs, scopeData?.name, handleDownloadFolder, handleDownloadAll]);

  const hasCustomBanner = Boolean(
    (scopeData?.banner_images && scopeData.banner_images.length > 0) ||
    scopeData?.branding_banner ||
    (scopeData?.branding_banner_images && scopeData.branding_banner_images.length > 0)
  );

  return (
    <div
      className={`flex h-screen w-screen flex-col bg-gray-50 transition-[padding] duration-200 ${isQnaEnabled && qnaContext ? 'lg:pr-[34rem] xl:pr-[38rem]' : ''}`}
      style={themeStyle}
    >
      <DocumentViewerHeader
        documentName={scopeData.name}
        brandName={brandName}
        brandLogoUrl={effectiveLogoUrl}
        brandWebsiteUrl={brandWebsiteUrl}
        ownerName={publicMeta?.owner_name}
        ownerAvatarUrl={publicMeta?.owner_avatar_url}
        isQnaEnabled={isDocActive && isQnaEnabled}
        isQnaOpen={isDocQnaOpen}
        onToggleQna={handleQnaToggle}
        qnaButtonLabel={currentScopeQnaButtonLabel}
        hasViewSession={Boolean(viewId)}
        isWatermarked={isWatermarked}
        isNdaProtected={isNdaProtected}
        isDownloadAllAllowed={isDownloadAllowed}
        isDownloadingAll={isDownloadingAll}
        onDownloadAll={handleHeaderDownload}
        downloadAllButtonLabel={downloadButtonLabel}
      />
      {showDocumentViewer ? (
        <>
          <nav className="flex-shrink-0 border-b bg-white px-3 py-2 sm:px-4 flex items-center justify-between gap-2">
            <ol className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap text-sm min-w-0 flex-1" style={{ color: 'var(--viewer-secondary)' }}>
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
                    clearDocumentView();
                  }}
                  className="flex items-center gap-2"
                  style={{ color: 'var(--viewer-secondary)' }}
                >
                  <HomeIcon className="h-4 w-4" />
                  <span>Home</span>
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
                      clearDocumentView();
                    }}
                    className="ml-2"
                    style={{ color: 'var(--viewer-secondary)' }}
                  >
                    {crumb.name}
                  </button>
                </li>
              ))}
              {documentViewData && (
                <li className="flex items-center">
                  <ChevronRight className="h-4 w-4" style={{ color: 'var(--viewer-secondary)' }} />
                  <span className="ml-2 font-medium truncate max-w-[200px] sm:max-w-[300px]" style={{ color: 'var(--viewer-primary)' }}>
                    {documentViewData.name}
                  </span>
                </li>
              )}
            </ol>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onPrevSibling}
                disabled={!hasPrevSibling}
                title={`${t('viewer.previousFile')} (Alt+Left)`}
                className="h-8 gap-1 px-2 text-xs"
              >
                <ChevronsLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{t('viewer.prevFile')}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onNextSibling}
                disabled={!hasNextSibling}
                title={`${t('viewer.nextFile')} (Alt+Right)`}
                className="h-8 gap-1 px-2 text-xs"
              >
                <span className="hidden sm:inline">{t('viewer.nextFileLabel')}</span>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>

          <main className="flex-1 flex overflow-hidden border-t relative">
            <DataroomFileTree
              slug={slug}
              viewId={viewId}
              items={rootItems}
              selectedDocumentId={selectedDocumentId}
              onItemClick={handleItemClick}
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={handleToggleSidebarCollapse}
              currentFolderName={breadcrumbs[breadcrumbs.length - 1]?.name || scopeData.name}
              activePathFolderIds={activePathFolderIds}
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
                  <div className="flex h-full items-center justify-center p-4 w-full bg-gray-50">
                    <div className="w-full max-w-xl rounded-2xl bg-white border border-gray-200/80 p-8 sm:p-10 text-center shadow-xl shadow-gray-200/50">
                      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl">
                        {documentViewData.type === 'video' && documentViewData.link_settings?.enable_watermark && documentViewData.download_only ? (
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-8 ring-amber-50/50">
                            <AlertTriangle className="h-8 w-8" />
                          </div>
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 ring-8 ring-gray-100/60">
                            <DownloadIcon className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 truncate" title={documentViewData.name}>
                        {documentViewData.name}
                      </h1>
                      {documentViewData.file_size ? (
                        <p className="mt-1 text-sm font-medium text-gray-500">{formatBytes(documentViewData.file_size)}</p>
                      ) : null}
                      <p className="mt-3 mb-6 text-sm text-gray-600 leading-relaxed max-w-sm mx-auto">
                        {documentViewData.type === 'video' && documentViewData.link_settings?.enable_watermark && documentViewData.download_only
                          ? t('viewer.watermarkedVideoBlockedNotice')
                          : t('viewer.previewNotAvailableNotice')}
                      </p>
                      {documentViewData.type === 'video' && documentViewData.link_settings?.enable_watermark && documentViewData.download_only ? (
                        <Button size="lg" className="w-full h-11 rounded-xl font-medium" disabled>
                          {t('viewer.downloadRestricted')}
                        </Button>
                      ) : canDownload ? (
                        <Button asChild size="lg" className="w-full h-11 rounded-xl font-medium gap-2 shadow-sm">
                          <a href={docDownloadUrl} download={documentViewData.name}>
                            <DownloadIcon className="h-4 w-4" />
                            <span>{t('viewer.download')}</span>
                          </a>
                        </Button>
                      ) : (
                        <div>
                          <Button size="lg" className="w-full h-11 rounded-xl font-medium gap-2" disabled>
                            <DownloadIcon className="h-4 w-4" />
                            <span>{t('viewer.download')}</span>
                          </Button>
                          <p className="mt-2.5 text-xs text-gray-500">
                            {t('viewer.downloadDisabledNotice')}
                          </p>
                        </div>
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
                    {documentViewData.preview_mode !== 'video' && (
                      <ViewerToolbar
                        allowDownload={canDownload}
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
                    )}
                    <Suspense
                      fallback={
                        <div className="flex-1 flex items-center justify-center p-8 bg-zinc-900 h-full w-full">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                        </div>
                      }
                    >
                      {documentViewData.preview_mode === 'video' ? (
                        <div className="flex-1 flex items-center justify-center p-8 bg-zinc-900 h-full w-full">
                          <VideoViewer
                            ref={viewerComponentRef}
                            videoUrl={documentViewData.video_preview_url}
                            viewId={viewId}
                            dataroomVisitId={currentDataroomVisitId}
                            allowDownload={documentViewData.link_settings?.allow_download}
                            downloadUrl={docDownloadUrl}
                            onTokenExpired={() => fetchDocumentViewData(selectedDocumentId, { force: true, silent: true })}
                          />
                        </div>
                      ) : documentViewData.preview_mode === 'spreadsheet' ? (
                        <SpreadsheetViewer
                          ref={viewerComponentRef}
                          spreadsheetUrl={documentViewData.spreadsheet_preview_url}
                          title={documentViewData.name}
                          viewId={viewId}
                          dataroomVisitId={currentDataroomVisitId}
                          watermarkText={
                            documentViewData.link_settings?.enable_watermark
                              ? (documentViewData.link_settings.resolved_watermark_text || documentViewData.link_settings.watermark_text || '')
                              : ''
                          }
                          allowDownload={canDownload}
                          canCopy={documentViewData.link_settings?.can_copy ?? null}
                          zoomLevel={zoomLevel}
                          onPageChange={setCurrentPage}
                          onDocumentLoad={handleDocumentLoad}
                          documentData={documentViewData}
                        />
                      ) : documentViewData.preview_mode === 'markdown' ? (
                        <MarkdownViewer
                          ref={viewerComponentRef}
                          markdownUrl={documentViewData.markdown_preview_url}
                          title={documentViewData.name}
                          viewId={viewId}
                          dataroomVisitId={currentDataroomVisitId}
                          watermarkText={
                            documentViewData.link_settings?.enable_watermark
                              ? (documentViewData.link_settings.resolved_watermark_text || documentViewData.link_settings.watermark_text || '')
                              : ''
                          }
                          allowDownload={canDownload}
                          canCopy={documentViewData.link_settings?.can_copy ?? null}
                          zoomLevel={zoomLevel}
                          documentData={documentViewData}
                        />
                      ) : documentViewData.preview_mode === 'client_pdf' ? (
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
                          allowDownload={canDownload}
                          isWatermarked={Boolean(
                            documentViewData.link_settings?.enable_watermark ?? scopeData?.link_settings?.enable_watermark
                          )}
                          zoomLevel={zoomLevel}
                          onPageChange={setCurrentPage}
                          onDocumentLoad={handleDocumentLoad}
                          documentData={documentViewData}
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
                    </Suspense>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gray-50">
                <p className="text-gray-500">No document view data available.</p>
              </div>
            )}
          </main>
        </>
      ) : (
        <main className="flex-1 overflow-y-auto bg-gray-50/60 py-6">
          <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 space-y-6">
            {/* 1. Hero Banner Card */}
            {hasCustomBanner ? (
              <DataroomBannerGallery
                images={scopeData?.banner_images || scopeData?.branding_banner_images || []}
                bannerMode={scopeData?.banner_mode || (scopeData?.branding_banner ? 'single' : 'none')}
                singleBannerUrl={scopeData?.branding_banner}
                dataroomName={scopeData?.name || ''}
                isRootFolder={!scopeData?.current_parent_id && breadcrumbs.length === 0}
                updatedAt={scopeData?.updated_at || data?.updated_at || data?.dataroom_context?.updated_at || data?.created_at}
                isWatermarked={isWatermarked}
                isNdaProtected={isNdaProtected}
              />
            ) : scopeData?.banner_mode !== 'none' ? (
              <DataroomDefaultHeroBanner
                dataroomName={scopeData?.name || ''}
                dataroomId={slug || scopeData?.id}
                description={scopeData?.description}
                updatedAt={scopeData?.updated_at || data?.updated_at || data?.dataroom_context?.updated_at || data?.created_at}
                isWatermarked={isWatermarked}
                isNdaProtected={isNdaProtected}
                hasViewSession={Boolean(viewId)}
              />
            ) : null}

            {/* 2. Unified Breadcrumbs & Controls Toolbar Card */}
            <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-xl shadow-2xs border border-gray-200/60">
              {/* Breadcrumb Trail (Left) */}
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.delete('parent_id');
                    nextParams.delete('dataroom_document_id');
                    if (viewId) {
                      nextParams.set('view_session_id', viewId);
                    }
                    setSearchParams(nextParams);
                    clearDocumentView();
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <HomeIcon className="h-4 w-4" />
                  <span>Home</span>
                </button>
                {breadcrumbs.map((crumb) => (
                  <div key={crumb.id} className="flex items-center gap-1.5">
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                    <button
                      type="button"
                      onClick={() => {
                        const nextParams = new URLSearchParams(searchParams);
                        nextParams.set('parent_id', crumb.id);
                        nextParams.delete('dataroom_document_id');
                        if (viewId) {
                          nextParams.set('view_session_id', viewId);
                        }
                        setSearchParams(nextParams);
                        clearDocumentView();
                      }}
                      className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      {crumb.name}
                    </button>
                  </div>
                ))}
              </div>

              {/* Controls (Right) */}
              <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0 justify-between sm:justify-end">
                {/* Search */}
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('viewer.filterPlaceholder')}
                    aria-label={t('viewer.filterPlaceholder')}
                    aria-keyshortcuts="Control+K Meta+K"
                    className="w-full pl-8 pr-10 py-1.5 text-xs sm:text-sm bg-gray-100/70 border-0 rounded-lg placeholder:text-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-300 transition-all"
                  />
                  <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-100 border border-gray-200 rounded hidden sm:inline-block pointer-events-none">
                    {shortcutHint}
                  </kbd>
                </div>

                {/* View Switcher Toggle */}
                <div
                  role="group"
                  aria-label={t('viewer.viewMode', { defaultValue: 'View Mode' })}
                  className="inline-flex items-center p-0.5 rounded-lg bg-gray-100 border-0 shrink-0"
                >
                  <button
                    type="button"
                    onClick={() => handleViewModeChange('grid')}
                    aria-label={t('viewer.gridView', { defaultValue: 'Grid view' })}
                    aria-pressed={viewMode === 'grid'}
                    className={`p-1.5 rounded-md transition-all cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-white text-gray-900 shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleViewModeChange('list')}
                    aria-label={t('viewer.listView', { defaultValue: 'List view' })}
                    aria-pressed={viewMode === 'list'}
                    className={`p-1.5 rounded-md transition-all cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-white text-gray-900 shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <ListIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Scope Q&A Button */}
                {isScopeQnaEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCurrentScopeQnaClick}
                    className="h-8 px-2.5 text-xs gap-1.5 text-gray-800 bg-gray-100 border border-gray-200/60 shadow-2xs hover:bg-gray-200/80 shrink-0 transition-colors"
                    title={currentScopeQnaButtonLabel}
                    aria-label={currentScopeQnaButtonLabel}
                  >
                    <MessageCircle className="h-3.5 w-3.5 text-gray-700" />
                    <span className="hidden md:inline font-medium">{t('qna.title', { defaultValue: 'Q&A' })}</span>
                    {currentScopeQnaThreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-gray-200 text-gray-800 font-mono text-[10px] font-semibold">
                        {currentScopeQnaThreadCount}
                      </span>
                    )}
                  </Button>
                )}
              </div>
            </section>

            {/* 3. Folders Grid & Curated Documents Canvas */}
            {isNavigating ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="h-16 rounded-xl bg-white border border-gray-200/80 p-4 animate-pulse flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/3 rounded bg-gray-200" />
                      <div className="h-3 w-1/4 rounded bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Empty State: Search yielded no matches across both folders and documents */}
                {allItems.length > 0 && filteredItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-sm text-gray-500">
                    {t('viewer.noMatchingFiles', { defaultValue: 'No files or folders match your filter.' })}
                  </div>
                ) : (
                  <>
                    {/* Featured Resources (Rendered only when starred items exist) */}
                    <DataroomFeaturedGrid
                      items={featuredItems}
                      onItemClick={handleItemClick}
                      onFolderClick={handleItemClick}
                      onDownloadClick={handleDownloadClick}
                      onQnaClick={handleQnaClick}
                      qnaEnabled={isQnaEnabled}
                    />

                    {/* 3-Column Folder Sections Grid (Always rendered) */}
                    <DataroomFolderGrid
                      folders={folderItems}
                      onFolderClick={handleItemClick}
                      onDownloadClick={handleDownloadClick}
                      onQnaClick={handleQnaClick}
                      qnaEnabled={isQnaEnabled}
                      showIndex={Boolean(scopeData.show_file_index)}
                      showEmpty={true}
                      emptyMessage={
                        searchQuery.trim()
                          ? t('viewer.noMatchingFolders', { defaultValue: 'No folders match your filter' })
                          : t('viewer.noFolders', { defaultValue: 'No folders in this directory' })
                      }
                    />

                    {/* Documents Section (Always rendered) */}
                    <section aria-label={t('documents.documents', { defaultValue: 'Documents' })} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs uppercase tracking-wider font-semibold text-gray-900">
                          {t('documents.documentsWithCount', { count: documentItems.length, defaultValue: `DOCUMENTS (${documentItems.length})` })}
                        </span>
                      </div>

                      {documentItems.length > 0 ? (
                        viewMode === 'grid' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pb-6">
                            {documentItems.map((doc, idx) => (
                              <DataroomDocumentCard
                                key={doc.id}
                                item={doc}
                                index={idx + 1}
                                showIndex={Boolean(scopeData.show_file_index)}
                                onItemClick={handleItemClick}
                                onDownloadClick={handleDownloadClick}
                                onQnaClick={handleQnaClick}
                                qnaEnabled={isQnaEnabled}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2.5 pb-6">
                            {documentItems.map((item, idx) => (
                              <ListItem
                                key={item.id}
                                item={item}
                                onItemClick={handleItemClick}
                                onDownloadClick={handleDownloadClick}
                                onQnaClick={handleQnaClick}
                                qnaEnabled={isQnaEnabled}
                                showIndex={Boolean(scopeData.show_file_index)}
                                index={idx + 1}
                              />
                            ))}
                          </div>
                        )
                      ) : (
                        <div className="rounded-xl border border-gray-200/60 bg-white dark:bg-zinc-950 p-6 flex flex-col items-center justify-center text-center shadow-2xs mb-6">
                          <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-zinc-900 flex items-center justify-center text-gray-400 mb-2">
                            <FileText className="h-4 w-4" />
                          </div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            {searchQuery.trim()
                              ? t('viewer.noMatchingDocuments', { defaultValue: 'No documents match your filter' })
                              : t('viewer.noDocuments', { defaultValue: 'No documents in this directory' })}
                          </p>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {/* Pagination: Load more */}
                {scopeData?.pagination?.has_more && (
                  <div className="flex justify-center py-6">
                    <Button
                      variant="outline"
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore ? t('viewer.loading', { defaultValue: 'Loading...' }) : t('documents.loadMore', { defaultValue: 'Load more' })}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      )}

      <QnAPanel
        open={isQnaEnabled && Boolean(qnaContext)}
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
