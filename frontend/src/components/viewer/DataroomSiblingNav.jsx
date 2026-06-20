import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { FileTypeIcon } from '../documents/FileTypeIcon';

export function DataroomSiblingNav({
  items,
  selectedDocumentId,
  onItemClick,
  isCollapsed,
  onToggleCollapse,
  currentFolderName,
}) {
  return (
    <aside
      className={`group/sidebar flex flex-col border-r bg-white transition-all duration-300 h-full shrink-0 relative ${
        isCollapsed ? 'w-12' : 'w-64'
      }`}
    >
      {/* Header section with toggle button */}
      <div className="flex h-12 items-center justify-between border-b px-3 shrink-0">
        {!isCollapsed && (
          <span className="truncate text-xs font-semibold uppercase tracking-wider text-gray-400 select-none">
            {currentFolderName || 'Folder Contents'}
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-900 mx-auto"
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
        {items.map((item) => {
          const isFolder = item.type === 'folder';
          const isActive = !isFolder && String(item.id) === String(selectedDocumentId);
          const displayName = item.name || item.document_name;

          return (
            <button
              key={item.id}
              onClick={() => onItemClick(item)}
              className={`flex w-full items-center rounded-lg transition-all ${
                isCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2 text-sm font-medium'
              } ${
                isActive
                  ? 'bg-[var(--viewer-row-active-bg)] text-[var(--viewer-primary)]'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
              title={displayName}
              style={
                isActive
                  ? {
                      '--viewer-row-active-bg': 'color-mix(in srgb, var(--viewer-accent) 12%, white)',
                    }
                  : {}
              }
            >
              <FileTypeIcon
                type={isFolder ? 'folder' : item.document_type}
                className={`h-4.5 w-4.5 shrink-0 ${
                  isActive ? 'text-[var(--viewer-primary)]' : 'text-gray-400'
                }`}
                palette="viewer"
              />
              
              {!isCollapsed && (
                <>
                  <span className="truncate flex-1 text-left">{displayName}</span>
                  {isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--viewer-primary)] shrink-0" />
                  )}
                </>
              )}
            </button>
          );
        })}
        
        {items.length === 0 && !isCollapsed && (
          <div className="py-8 text-center text-xs text-gray-400">
            No other items in this folder
          </div>
        )}
      </div>
    </aside>
  );
}
