import { useState, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen, ChevronRight, ChevronDown } from 'lucide-react';
import { FileTypeIcon } from '../documents/FileTypeIcon';
import { getShareLinkViewData } from '../../services/api';
import { toast } from 'sonner';

function SidebarItem({ item, selectedDocumentId, onItemClick, isCollapsed, onToggleCollapse, level = 0, slug, viewId }) {
  const isFolder = item.type === 'folder';
  const isActive = !isFolder && String(item.id) === String(selectedDocumentId);
  const displayName = item.name || item.document_name;

  const [isExpanded, setIsExpanded] = useState(false);
  const [childrenItems, setChildrenItems] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (isFolder) {
      if (isCollapsed) {
        if (onToggleCollapse) {
          onToggleCollapse();
        }
        setIsExpanded(true);
      } else {
        setIsExpanded(prev => !prev);
      }

      // Load children if we are expanding or if we just forced it to expand from collapsed
      const expanding = isCollapsed || !isExpanded;
      if (expanding && !childrenItems && !isLoading) {
        setIsLoading(true);
        try {
          const response = await getShareLinkViewData(slug, {
            parentId: item.id,
            viewSessionId: viewId || undefined,
          });
          setChildrenItems(response.data.items || []);
        } catch (err) {
          console.error('Failed to load folder contents', err);
          toast.error('Could not load folder contents.');
          setIsExpanded(false);
        } finally {
          setIsLoading(false);
        }
      }
    } else {
      onItemClick(item);
    }
  }, [isFolder, isCollapsed, onToggleCollapse, isExpanded, childrenItems, isLoading, item, slug, viewId, onItemClick]);

  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        className={`flex w-full items-center rounded-lg transition-all ${
          isCollapsed ? 'justify-center p-2.5' : 'gap-1.5 py-2 pr-3 text-sm font-medium'
        } ${
          isActive
            ? 'bg-[var(--viewer-row-active-bg)] text-[var(--viewer-primary)]'
            : 'text-gray-700 hover:bg-gray-50'
        }`}
        title={displayName}
        style={{
          paddingLeft: isCollapsed ? undefined : `${(level * 16) + 12}px`,
          ...(isActive ? { '--viewer-row-active-bg': 'color-mix(in srgb, var(--viewer-accent) 12%, white)' } : {})
        }}
      >
        <div className={`flex items-center shrink-0 ${isCollapsed ? 'w-8 justify-center' : 'gap-1'}`}>
          {isFolder && !isCollapsed && (
            <div className="mr-1 text-gray-400">
              {isLoading ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
              ) : isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </div>
          )}
          {!isFolder && !isCollapsed && <div className="w-4.5 shrink-0" />}
          <FileTypeIcon
            type={isFolder ? 'folder' : item.document_type}
            className={`h-4 w-4 shrink-0 ${
              isActive ? 'text-[var(--viewer-primary)]' : 'text-gray-400'
            }`}
            palette="viewer"
          />
        </div>
        
        {!isCollapsed && (
          <>
            <span className="truncate flex-1 text-left ml-1">{displayName}</span>
            {isActive && (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--viewer-primary)] shrink-0" />
            )}
          </>
        )}
      </button>

      {isFolder && isExpanded && childrenItems && !isCollapsed && (
        <div className="flex flex-col w-full">
          {childrenItems.map(child => (
            <SidebarItem
              key={child.id}
              item={child}
              selectedDocumentId={selectedDocumentId}
              onItemClick={onItemClick}
              isCollapsed={isCollapsed}
              onToggleCollapse={onToggleCollapse}
              level={level + 1}
              slug={slug}
              viewId={viewId}
            />
          ))}
          {childrenItems.length === 0 && (
            <div 
              className="py-2 text-xs text-gray-400 text-left italic"
              style={{ paddingLeft: `${((level + 1) * 16) + 12 + 32}px` }}
            >
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DataroomSiblingNav({
  items,
  selectedDocumentId,
  onItemClick,
  isCollapsed,
  onToggleCollapse,
  currentFolderName,
  slug,
  viewId,
}) {
  return (
    <aside
      className={`group/sidebar flex flex-col border-r bg-white transition-all duration-300 h-full shrink-0 relative ${
        isCollapsed ? 'w-12' : 'w-64'
      }`}
    >
      <div className={`flex h-12 items-center border-b shrink-0 ${
        isCollapsed ? 'justify-center px-0' : 'justify-between px-3'
      }`}>
        {!isCollapsed && (
          <span className="truncate text-xs font-semibold uppercase tracking-wider text-gray-400 select-none">
            {currentFolderName || 'Folder Contents'}
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-900"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4.5 w-4.5" />
          ) : (
            <PanelLeftClose className="h-4.5 w-4.5" />
          )}
        </button>
      </div>

      {/* Sibling navigation items list */}
      <div className="flex-1 overflow-y-auto py-2 space-y-1 select-none">
        {items.map((item) => (
          <SidebarItem
            key={item.id}
            item={item}
            selectedDocumentId={selectedDocumentId}
            onItemClick={onItemClick}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
            level={0}
            slug={slug}
            viewId={viewId}
          />
        ))}
        
        {items.length === 0 && !isCollapsed && (
          <div className="py-8 text-center text-xs text-gray-400">
            No other items in this folder
          </div>
        )}
      </div>
    </aside>
  );
}
