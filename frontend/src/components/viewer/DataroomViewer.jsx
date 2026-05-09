import { useCallback, useEffect, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  HomeIcon,
  ChevronRight,
  DownloadIcon,
  MoreHorizontal,
  Eye,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatBytes } from '../../lib/formatters';
import { FileTypeIcon } from '../documents/FileTypeIcon';
import { Button } from '../ui/Button';
import { downloadDataroomFolder, getShareLinkViewData, recordDataroomVisit } from '../../services/api';

function ListItem({ item, onItemClick, onDownloadClick, showIndex = false, index = null }) {
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
          <DropdownMenu.Content
            className="z-20 w-40 origin-top-right rounded-md bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
            sideOffset={5}
            align="end"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
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
                  e.preventDefault();
                  e.stopPropagation();
                  onDownloadClick(item);
                }}
                className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
              >
                <DownloadIcon className="h-4 w-4" aria-hidden="true" />
                <span>Download</span>
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}

export function DataroomViewer({ data, slug, viewId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scopeData, setScopeData] = useState(data);
  const [isNavigating, setIsNavigating] = useState(false);
  const requestRef = useRef(0);
  const parentIdFromUrl = searchParams.get('parent_id');

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
      // Error toast is handled by the api interceptor
    }
  };

  const handleDownloadDocument = (doc) => {
    // This constructs a URL to the existing single-file download endpoint.
    const params = new URLSearchParams({ document_id: doc.document_id });
    if (viewId) {
      params.set('view_session_id', viewId);
    }
    const downloadUrl = `/api/v1/links/${slug}/download-file/?${params.toString()}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    // The browser will handle the 'download' attribute for same-origin URLs.
    // The backend should set 'Content-Disposition' header for this to work robustly.
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

  const allItems = Array.isArray(scopeData.items) ? scopeData.items : [];
  const breadcrumbs = Array.isArray(scopeData.breadcrumbs) ? scopeData.breadcrumbs : [];

  // Keep local scope state aligned with parent-provided data refreshes.
  useEffect(() => {
    setScopeData(data);
  }, [data]);

  const fetchScopeData = useCallback(async (parentId) => {
    const requestId = ++requestRef.current;
    setIsNavigating(true);
    try {
      const response = await getShareLinkViewData(slug, { parentId });
      if (requestId !== requestRef.current) return;
      setScopeData(response.data);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      console.error('Failed to load folder scope:', err);
      toast.error('Could not load folder. Please try again.');
    } finally {
      if (requestId !== requestRef.current) return;
      setIsNavigating(false);
    }
  }, [slug]);

  // User-initiated navigation updates URL; fetching is centralized in the URL-sync effect.
  const navigateToScope = useCallback((parentId) => {
    const nextParams = new URLSearchParams(searchParams);
    if (parentId) {
      nextParams.set('parent_id', parentId);
    } else {
      nextParams.delete('parent_id');
    }
    setSearchParams(nextParams);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const currentParentId = scopeData?.current_parent_id ? String(scopeData.current_parent_id) : null;
    const normalizedUrlParentId = parentIdFromUrl || null;
    if (normalizedUrlParentId === currentParentId) {
      return;
    }
    // URL changed via click/back-forward. Refresh scope data for the target URL state.
    fetchScopeData(normalizedUrlParentId);
  }, [fetchScopeData, parentIdFromUrl, scopeData?.current_parent_id]);

  const handleItemClick = async (item) => {
    if (item.type === 'folder') {
      if (viewId) {
        // Fire-and-forget request to record the folder visit for the activity log.
        recordDataroomVisit(viewId, { dataroomFolderId: item.id }).catch((err) => {
          console.error('Failed to record folder visit:', err);
        });
      }
      navigateToScope(item.id);
    } else {
      // 1. Open a blank window IMMEDIATELY to satisfy Safari's user gesture rule
      const newTab = window.open('about:blank', '_blank');
      if (!newTab) {
        toast.error('Pop-up blocked. Please allow pop-ups for this site.');
        return;
      }

      // This is a document. Record the visit and then open it in a new tab.
      if (viewId) {
        try {
          // Record the visit to get a specific visit ID for page-level tracking.
          const visitResponse = await recordDataroomVisit(viewId, { dataroomDocumentId: item.id });
          const dataroomVisitId = visitResponse.data.id;
          // Construct the URL for the new tab.
          const url = `/view/${slug}?document_id=${item.document_id}&view_session_id=${viewId}&dataroom_visit_id=${dataroomVisitId}`;

          // 2. Update the already-opened window with the actual URL
          newTab.location.href = url;
        } catch (err) {
          console.error('Failed to record document visit or open document:', err);
          newTab.close(); // Close the blank tab if the request fails
          toast.error('Could not open document. Please try again.');
        }
      } else {
        // Fallback for the case where viewId is not ready, though it should be.
        newTab.location.href = `/view/${slug}?document_id=${item.document_id}`;
      }
    }
  };

  const themeStyle = {
    '--viewer-primary': scopeData.brand_primary_color || '#111827',
    '--viewer-secondary': scopeData.brand_secondary_color || '#4b5563',
    '--viewer-accent': scopeData.brand_accent_color || '#1f2937',
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-gray-50" style={themeStyle}>
      <header className="flex flex-shrink-0 items-center justify-between border-b bg-white p-3 sm:p-4">
        <h1 className="mr-2 truncate text-base font-semibold sm:text-xl" style={{ color: 'var(--viewer-primary)' }}>{scopeData.name}</h1>
        <a href="/" className="flex shrink-0 items-center gap-2 rounded-md p-2 font-semibold" style={{ color: 'var(--viewer-primary)' }}>
          <img src="/logo.svg" alt="Coneshare logo" className="h-6 w-6" />
          <span className="hidden sm:inline">Coneshare</span>
        </a>
      </header>
      {scopeData.branding_banner && (
        <section className="flex-shrink-0 border-b bg-white">
          <img src={scopeData.branding_banner} alt={`${scopeData.name} banner`} className="h-32 w-full object-cover md:h-44" />
        </section>
      )}

      <nav className="flex-shrink-0 border-b bg-white px-3 py-2 sm:px-4">
        <ol className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap text-sm" style={{ color: 'var(--viewer-secondary)' }}>
          <li>
            <button
              onClick={() => navigateToScope(null)}
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
                onClick={() => navigateToScope(crumb.id)}
                className="ml-2"
                style={{ color: 'var(--viewer-secondary)' }}
              >
                {crumb.name}
              </button>
            </li>
          ))}
        </ol>
      </nav>

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
                showIndex={Boolean(scopeData.show_file_index)}
                index={idx + 1}
              />
            ))}
          </div>
        )}
        {!isNavigating && allItems.length === 0 && (
          <div className="p-12 text-center" style={{ color: 'var(--viewer-secondary)' }}>This folder is empty.</div>
        )}
      </main>

    </div>
  );
}
