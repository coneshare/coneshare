import { formatRelativeTime, getAvatarInitial } from "../../utils/formatters";
import { Star, RefreshCw, AlertTriangle } from "lucide-react";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { formatBytes } from "../../lib/formatters";
import { ActionsDropdown } from "./ActionsDropdown";
import { FileTypeIcon } from "./FileTypeIcon";
import { Badge } from "../ui/Badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/Avatar";
import { useUser } from "../../contexts/UserProvider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/Tooltip";

export function DraggableItem({
  id,
  item,
  type,
  isSelected,
  onSelect,
  onRename,
  onDelete,
  onShare,
  onRequestFiles,
  onSyncDatarooms,
  onUnlink,
  onToggleStar,
  onDownload,
  onCopy,
  isReadOnly = false,
  showActions = true,
  onItemClick,
  themed = false,
  showIndex = false,
  itemIndex = null,
  deleteLabel,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  const handleNameClick = (e) => {
    e.stopPropagation();

    if (onItemClick) {
      onItemClick(item, type);
      return;
    }

    if (type === "folder") {
      navigate(`/documents/folders/${id}`);
    } else if (type === "document") {
      navigate(`/documents/${id}`);
    }
  };

  const handleRowClick = (e) => {
    if (!onSelect) return;
    onSelect(id, type, e);
  };

  const handleRowMouseDown = (e) => {
    // Prevent native browser text selection only for range-selection gesture.
    if (e.shiftKey) {
      e.preventDefault();
    }
  };
  const viewCount = item.view_count ?? item.share_link_view_count ?? item.dataroom_view_count ?? 0;

  const userContext = useUser();
  const currentUser = userContext?.user;

  const getOwnerDetails = () => {
    const resolvedOwner = (typeof item.created_by === 'object' && item.created_by) || item.created_by_user || item.owner;
    if (resolvedOwner) {
      const isMe = Boolean(currentUser?.id && resolvedOwner.id === currentUser.id);
      const fallbackName = resolvedOwner.name || resolvedOwner.email?.split('@')[0] || (isMe ? t('documents.me') : 'Member');
      return {
        displayName: isMe ? t('documents.me') : fallbackName,
        fullName: resolvedOwner.name || (isMe ? currentUser?.name : resolvedOwner.email) || fallbackName,
        email: resolvedOwner.email || (isMe ? currentUser?.email : null),
        avatarUrl: resolvedOwner.avatar_url || (isMe ? currentUser?.avatar_url : null),
        isMe,
      };
    }
    if (typeof item.created_by === 'string') {
      const isMe = Boolean(currentUser?.id && item.created_by === currentUser.id);
      return {
        displayName: isMe ? t('documents.me') : (item.created_by_name || 'Member'),
        fullName: isMe ? (currentUser?.name || t('documents.me')) : (item.created_by_name || 'Member'),
        email: isMe ? currentUser?.email : null,
        avatarUrl: isMe ? currentUser?.avatar_url : null,
        isMe,
      };
    }
    return {
      displayName: t('documents.me'),
      fullName: currentUser?.name || t('documents.me'),
      email: currentUser?.email || null,
      avatarUrl: currentUser?.avatar_url || null,
      isMe: true,
    };
  };

  const hasSyncedDatarooms = type === "folder" && Array.isArray(item.synced_datarooms) && item.synced_datarooms.length > 0;
  const isSyncRootFolder = type === "folder" && Boolean(item.is_synced) && Boolean(item.is_sync_root);
  const isSyncedSourceBroken = Boolean(item.source_folder_deleted) || !item.source_folder;
  const showFolderSyncBadge =
    type === "folder" && Boolean(item.is_synced) && (Boolean(item.is_sync_root) || isSyncedSourceBroken);
  const showManagedSyncIndicator =
    (type === "document" && Boolean(item.is_synced)) ||
    (type === "folder" && Boolean(item.is_synced) && !item.is_sync_root && !isSyncedSourceBroken);
  const isSyncedFolder = isSyncRootFolder || hasSyncedDatarooms;

  return (
    <div
      onClick={handleRowClick}
      onMouseDown={handleRowMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`draggable-item-${id}`}
      className={cn(
        "flex w-full cursor-pointer items-center px-4 py-2 text-sm transition-colors",
        !themed && !isSelected && "hover:bg-gray-50 dark:hover:bg-gray-900/50",
        !themed && isSelected && "bg-blue-100 dark:bg-blue-900/40"
      )}
      style={themed ? {
        backgroundColor: isSelected
          ? "color-mix(in srgb, var(--dataroom-primary) 22%, transparent)"
          : isHovered
            ? "color-mix(in srgb, var(--dataroom-secondary) 10%, transparent)"
            : "transparent",
      } : undefined}
    >
      {showIndex && (
        <div className="w-12 text-xs text-gray-500">
          {itemIndex}
        </div>
      )}
      <div className="flex w-[34%] min-w-0 items-center gap-2 overflow-hidden">
        <FileTypeIcon
          type={type === "folder" ? "folder" : item.document_type || "document"}
          className="h-5 w-5 shrink-0"
          palette={themed ? "dataroom" : "default"}
          isSynced={isSyncedFolder}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              className="block max-w-full truncate font-medium text-left hover:underline"
              style={themed ? { color: "var(--dataroom-primary)" } : undefined}
              onClick={handleNameClick}
            >
              {item.name}
            </button>
            {hasSyncedDatarooms && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSyncDatarooms?.(item);
                    }}
                    aria-label={t('documents.syncedWithDataroomsCount', { count: item.synced_datarooms.length })}
                    className="inline-flex shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60"
                  >
                    <span>{item.synced_datarooms.length}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1 max-w-xs">
                    <p className="font-semibold">{t('documents.syncedDataroomsTooltip')}</p>
                    <ul className="space-y-0.5">
                      {item.synced_datarooms.map((ref) => (
                        <li key={ref.dataroom_folder_id} className="truncate">
                          • {ref.dataroom_name} ({ref.dataroom_folder_path})
                        </li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {showFolderSyncBadge && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    tabIndex={0}
                    variant="secondary"
                    className={cn(
                      "inline-flex shrink-0 cursor-default items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium focus:outline-none focus-visible:ring-2",
                      isSyncedSourceBroken
                        ? "border-amber-200 bg-amber-50 text-amber-700 focus-visible:ring-amber-500 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 focus-visible:ring-emerald-500 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300"
                    )}
                  >
                    {isSyncedSourceBroken && (
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    )}
                    <span>
                      {item.source_folder_deleted
                        ? t('datarooms.syncedSourceDeletedBadge')
                        : t('datarooms.syncedBadge')}
                    </span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-0.5">
                    <p>
                      {item.source_folder_deleted && item.source_folder_name
                        ? t('datarooms.syncedSourceInTrash', { name: item.source_folder_name })
                        : item.source_folder_name
                          ? t('datarooms.syncedFromFolder', { name: item.source_folder_name })
                          : t('datarooms.syncedSourceUnavailable')}
                    </p>
                    {item.last_synced_at && (
                      <p className="text-muted-foreground">
                        {t('documents.lastSyncedAt', { time: formatRelativeTime(item.last_synced_at) })}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {showManagedSyncIndicator && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    role="img"
                    aria-label={t('datarooms.syncedDocumentTooltip')}
                    className="inline-flex shrink-0 cursor-default items-center rounded-sm text-emerald-600/80 dark:text-emerald-400/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{t('datarooms.syncedDocumentTooltip')}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {item.location ? (
            <p className="truncate text-xs text-muted-foreground" title={item.location}>
              {item.location}
            </p>
          ) : null}
        </div>
        {showActions && !isReadOnly && (
          <button
            data-star-button
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(id, type);
            }}
            className={cn("ml-auto p-1 mr-1")}
            aria-label={item.is_starred ? `Unstar ${item.name}` : `Star ${item.name}`}
          >
            <Star
              className={cn(
                "h-4 w-4 text-gray-400",
                item.is_starred && "fill-yellow-400 text-yellow-500"
              )}
            />
          </button>
        )}
      </div>
      <div className="w-[18%] flex items-center gap-1.5 min-w-0" style={themed ? { color: "var(--dataroom-secondary)" } : undefined}>
        {(() => {
          const owner = getOwnerDetails();
          const initial = getAvatarInitial(owner.fullName !== t('documents.me') ? owner.fullName : '', owner.email);
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 min-w-0 max-w-full cursor-default truncate">
                  <Avatar className="h-5 w-5 shrink-0 rounded-full border border-border/50">
                    {owner.avatarUrl && <AvatarImage src={owner.avatarUrl} alt={owner.displayName} />}
                    <AvatarFallback className="text-[9px] font-medium bg-muted text-muted-foreground">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{owner.displayName}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold">{owner.fullName}</p>
                  {owner.email && <p className="text-muted-foreground">{owner.email}</p>}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })()}
        {item.uploader_info && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-default ml-1 shrink-0">
                {item.uploader_info.name}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {t('documents.uploadedBy', { name: item.uploader_info.name, email: item.uploader_info.email })}
              </p>
            </TooltipContent>
          </Tooltip>
        )}        
      </div>
      <div className="w-[18%]" style={themed ? { color: "var(--dataroom-secondary)" } : undefined}>
        {item.updated_at
          ? formatRelativeTime(item.updated_at)
          : "—"}
      </div>
      <div className="w-[10%]" style={themed ? { color: "var(--dataroom-secondary)" } : undefined}>
        {type === "document"
          ? formatBytes(item.file_size)
          : "—"}
      </div>
      <div className="w-[10%]" style={themed ? { color: "var(--dataroom-secondary)" } : undefined}>
        {type === "document" ? viewCount : "—"}
      </div>
      <div className="ml-auto w-16">
        {showActions && !isReadOnly && (
          <div
            className="ml-auto flex justify-end"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ActionsDropdown
              item={item}
              type={type}
              onRename={onRename}
              onDelete={onDelete}
              onShare={onShare}
              onRequestFiles={onRequestFiles}
              onSyncDatarooms={onSyncDatarooms}
              onUnlink={onUnlink}
              onDownload={onDownload}
              onCopy={onCopy}
              deleteLabel={deleteLabel}
            />
          </div>
        )}
      </div>
    </div>
  );
}
