import { useEffect, useState } from 'react';
import {
  FolderIcon,
  HomeIcon,
  ChevronRight,
  FileImageIcon,
  FileTextIcon,
  FileQuestion,
  DownloadIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatBytes } from '../../lib/formatters';
import { Button } from '../ui/Button';
import { downloadDataroomFolder, getShareLinkViewData, recordDataroomVisit } from '../../services/api';

function DocumentItemIcon({ type }) {
  const commonProps = { className: "h-5 w-5", style: { color: 'var(--viewer-secondary)' } };
  switch (type) {
    case 'pdf':
    case 'document':
      return <FileTextIcon {...commonProps} />;
    case 'image':
      return <FileImageIcon {...commonProps} />;
    default:
      return <FileQuestion {...commonProps} />;
  }
}

function ListItem({ item, onItemClick, onDownloadClick, showIndex = false, index = null }) {
  const isFolder = item.type === 'folder';
  return (
    <div
      className="group flex w-full items-center px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--viewer-row-hover-bg)]"
      style={{
        color: 'var(--viewer-primary)',
        '--viewer-row-hover-bg': 'color-mix(in srgb, var(--viewer-secondary) 10%, transparent)',
      }}
    >
      {showIndex && <div className="w-10 text-xs" style={{ color: 'var(--viewer-secondary)' }}>{index}</div>}
      <div className="flex w-8 items-center justify-center">
        {isFolder ? (
          <FolderIcon className="h-5 w-5" style={{ color: 'var(--viewer-accent)' }} />
        ) : (
          <DocumentItemIcon type={item.document_type} />
        )}
      </div>
      <button
        onClick={() => onItemClick(item)}
        className="w-[50%] truncate pr-4 text-left font-medium"
        title={item.name || item.document_name}
      >
        {item.name || item.document_name}
      </button>
      <div className="w-[20%] text-sm" style={{ color: 'var(--viewer-secondary)' }}>
        {item.updated_at && formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
      </div>
      <div className="w-[10%] text-sm" style={{ color: 'var(--viewer-secondary)' }}>
        {!isFolder && typeof item.file_size === 'number' ? formatBytes(item.file_size) : '—'}
      </div>
      <div className="w-[10%] text-right">
        {item.allow_download && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100"
            style={{ color: 'var(--viewer-accent)' }}
            onClick={() => onDownloadClick(item)}
            title={`Download "${item.name || item.document_name}"`}
          >
            <DownloadIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function DataroomViewer({ data, slug, viewId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scopeData, setScopeData] = useState(data);
  const [isNavigating, setIsNavigating] = useState(false);
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

  // `updateUrl=false` is used for popstate/back-forward sync to avoid writing
  // a new history entry while we are already replaying history.
  const navigateToScope = async (parentId, { updateUrl = true } = {}) => {
    setIsNavigating(true);
    try {
      const response = await getShareLinkViewData(slug, { parentId });
      setScopeData(response.data);
      if (updateUrl) {
        // User-initiated navigation updates URL so folder scopes are shareable
        // and browser history can step through navigation.
        const nextParams = new URLSearchParams(searchParams);
        if (parentId) {
          nextParams.set('parent_id', parentId);
        } else {
          nextParams.delete('parent_id');
        }
        setSearchParams(nextParams);
      }
    } catch (err) {
      console.error('Failed to load folder scope:', err);
      toast.error('Could not load folder. Please try again.');
    } finally {
      setIsNavigating(false);
    }
  };

  useEffect(() => {
    const currentParentId = scopeData?.current_parent_id ? String(scopeData.current_parent_id) : null;
    const normalizedUrlParentId = parentIdFromUrl || null;
    if (normalizedUrlParentId === currentParentId) {
      return;
    }
    // URL changed via Back/Forward. Refresh scope data only; do not mutate URL/history.
    navigateToScope(normalizedUrlParentId, { updateUrl: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentIdFromUrl, slug]);

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
      <header className="flex flex-shrink-0 items-center justify-between border-b bg-white p-4">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--viewer-primary)' }}>{scopeData.name}</h1>
        <a href="/" className="flex items-center gap-2 rounded-md p-2 font-semibold" style={{ color: 'var(--viewer-primary)' }}>
          <img src="/logo.svg" alt="Coneshare logo" className="h-6 w-6" />
          <span>Coneshare</span>
        </a>
      </header>
      {scopeData.branding_banner && (
        <section className="flex-shrink-0 border-b bg-white">
          <img src={scopeData.branding_banner} alt={`${scopeData.name} banner`} className="h-32 w-full object-cover md:h-44" />
        </section>
      )}

      <nav className="flex-shrink-0 border-b bg-white px-4 py-2">
        <ol className="flex items-center space-x-2 text-sm" style={{ color: 'var(--viewer-secondary)' }}>
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
          className="flex w-full items-center border-b px-4 py-2 text-xs font-medium uppercase"
          style={{
            color: 'var(--viewer-secondary)',
            backgroundColor: 'color-mix(in srgb, var(--viewer-secondary) 8%, white)',
          }}
        >
          {scopeData.show_file_index && <div className="w-10">#</div>}
          <div className="w-8" />
          <div className="w-[50%] pr-4">Name</div>
          <div className="w-[20%]">Last Modified</div>
          <div className="w-[10%]">File Size</div>
          <div className="w-[10%] text-right">Actions</div>
        </div>
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
        {isNavigating && (
          <div className="p-4 text-center text-sm" style={{ color: 'var(--viewer-secondary)' }}>
            Loading...
          </div>
        )}
        {!isNavigating && allItems.length === 0 && (
          <div className="p-12 text-center" style={{ color: 'var(--viewer-secondary)' }}>This folder is empty.</div>
        )}
      </main>

    </div>
  );
}
