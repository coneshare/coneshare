import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, Pencil, Trash2, ChevronRight, ChevronDown, FolderIcon } from 'lucide-react';
import { Fragment, useState } from 'react';
import { FileTypeIcon } from './FileTypeIcon';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';
import { generateShareLinkPreview, updateShareLink } from '../../services/api';
import { LinkSettingsSummary } from './LinkSettingsSummary';
import { LinkActionsDropdown } from './LinkActionsDropdown';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/Table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/Tooltip';
import { copyTextToClipboard } from '../../lib/utils';
import { parseUserAgent } from '../../lib/utils';
import { formatDate } from '../../utils/formatters';

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function CopyableLink({ slug, isExpired, expires_at }) {
  const { t } = useTranslation();
  const url = `${window.location.origin}/view/${slug}`;
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const handleCopy = () => {
    if (isExpired) return;
    copyTextToClipboard(url, t('links.copiedToClipboard'), t('links.copyFailed'));
  };

  if (isExpired) {
    const formattedDate = new Date(expires_at).toLocaleDateString();
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="relative w-full max-w-[220px] cursor-not-allowed rounded px-1 py-0.5 text-left text-sm text-gray-400"
            title={url}
          >
            <span className="block truncate">{displayUrl}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            Link expired on {formattedDate}. To reactivate this link, please update the expiration
            date in the settings.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          onClick={handleCopy}
          className="w-full max-w-[220px] cursor-pointer rounded px-1 py-0.5 text-left text-sm text-gray-600 transition-colors hover:bg-gray-100"
          title={url}
          data-testid={`copyable-link-div-${slug}`}
        >
          <span className="block truncate">{displayUrl}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Copy to Clipboard</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function LinksTable({
  links,
  onEditLink,
  onDeleteLink,
  onLinkUpdate,
  onManagePermissions,
  isDashboardWidget,
  contextType = 'document',
}) {
  const { t } = useTranslation();
  const [expandedRowId, setExpandedRowId] = useState(null);

  const handleStatusChange = async (link, newStatus) => {
    try {
      const response = await updateShareLink(link.id, { is_active: newStatus });
      const statusText = newStatus ? t('links.activeStatus') : t('links.inactiveStatus');
      const linkName = link.name || t('links.untitledLink');
      toast.success(t('links.statusToggleSuccess', { name: linkName, status: statusText }));
      if (onLinkUpdate) {
        onLinkUpdate(response.data);
      }
    } catch (error) {
    }
  };  

  const handlePreview = async (linkId, slug) => {
    try {
      const response = await generateShareLinkPreview(linkId);
      const { previewToken } = response.data;
      window.open(`/view/${slug}?previewToken=${previewToken}`, '_blank');
    } catch (error) {
      toast.error(t('links.previewFailed'));
    }
  };

  if (!links || links.length === 0) {
    return (
      <div>
        {!isDashboardWidget && <h2 className="text-xl font-semibold">{t('analytics.shareLinks')}</h2>}
        <p className="mt-2 text-sm text-gray-500">
          {contextType === 'dataroom'
            ? t('analytics.noLinksDataroom')
            : t('analytics.noLinksDocument')}
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        {!isDashboardWidget && <h2 className="text-xl font-semibold">{t('analytics.shareLinks')}</h2>}
      <div className="mt-4 overflow-hidden rounded-lg border">
        <Table className={isDashboardWidget ? 'min-w-[900px]' : 'min-w-[750px]'}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 px-2" />
              <TableHead className="min-w-[140px] max-w-[200px] whitespace-nowrap">{t('analytics.name')}</TableHead>
              <TableHead className="min-w-[160px] max-w-[220px] whitespace-nowrap">{t('analytics.link')}</TableHead>
              {isDashboardWidget && <TableHead className="min-w-[160px] max-w-[240px] whitespace-nowrap">{t('analytics.document')}</TableHead>}
              <TableHead className="w-20 whitespace-nowrap">{t('analytics.visits')}</TableHead>
              <TableHead className="w-28 whitespace-nowrap">{t('analytics.created')}</TableHead>
              <TableHead className="w-28 whitespace-nowrap">{t('analytics.viewedAt')}</TableHead>
              <TableHead className="w-28 whitespace-nowrap">{t('analytics.settings')}</TableHead>
              {!isDashboardWidget && <TableHead className="w-24 whitespace-nowrap">{t('analytics.status')}</TableHead>}
              {!isDashboardWidget && (
                <TableHead className="w-20 text-right whitespace-nowrap">
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((link) => {
              const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
              const hasViews = link.view_count > 0;
              const isExpanded = expandedRowId === link.id;
              return (
                <Fragment key={link.id}>
                  <TableRow>
                    <TableCell className="w-8 px-2">
                      {hasViews && (
                        <button
                          onClick={() => setExpandedRowId(isExpanded ? null : link.id)}
                          className="flex items-center justify-center rounded-full p-1 hover:bg-gray-100"
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="font-medium min-w-[140px] max-w-[200px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate" title={link.name || t('links.untitledLink')}>
                          {link.name || t('links.untitledLink')}
                        </span>
                        {isExpired && (
                          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            {t('analytics.expired')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[160px] max-w-[220px]">
                      <CopyableLink
                        slug={link.slug}
                        isExpired={isExpired}
                        expires_at={link.expires_at}
                      />
                    </TableCell>
                    {isDashboardWidget && (
                      <TableCell className="min-w-[160px] max-w-[240px]">
                        {link.document ? (
                          <Link
                            to={`/documents/${link.document}`}
                            className="inline-flex items-center gap-1.5 max-w-full hover:underline"
                            title={link.document_name}
                          >
                            <FileTypeIcon type={link.document_type} className="h-4 w-4 shrink-0" />
                            <span className="truncate">{link.document_name}</span>
                          </Link>
                        ) : link.dataroom ? (
                          <Link
                            to={`/datarooms/${link.dataroom}`}
                            className="inline-flex items-center gap-1.5 max-w-full hover:underline"
                            title={link.dataroom_name}
                          >
                            <FolderIcon className="h-4 w-4 text-blue-500 shrink-0" />
                            <span className="truncate">{link.dataroom_name}</span>
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="w-20 whitespace-nowrap">{link.view_count}</TableCell>
                    <TableCell className="w-28 whitespace-nowrap text-muted-foreground">{formatDate(link.created_at, 'PP')}</TableCell>
                    <TableCell className="w-28 whitespace-nowrap text-muted-foreground">
                      {link.last_viewed_at
                        ? formatDate(link.last_viewed_at, 'PP')
                        : '—'}
                    </TableCell>
                    <TableCell className="w-28 whitespace-nowrap">
                      <LinkSettingsSummary link={link} onClick={() => onEditLink(link)} />
                    </TableCell>
                    {!isDashboardWidget && (
                      <>
                        <TableCell className="w-24 whitespace-nowrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {/* Wrap Switch in a span to resolve event conflicts with TooltipTrigger */}
                              <span className="inline-flex align-middle">
                                <Switch
                                  checked={link.is_active}
                                  onCheckedChange={(checked) => handleStatusChange(link, checked)}
                                  aria-label="Toggle link status"
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{link.is_active ? t('analytics.active') : t('analytics.disabled')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="w-20 text-right whitespace-nowrap">
                          <LinkActionsDropdown
                            link={link}
                            onPreview={handlePreview}
                            onEdit={onEditLink}
                            onDelete={onDeleteLink}
                            onManagePermissions={onManagePermissions}
                            contextType={contextType}
                          />
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                  {isExpanded && hasViews && (
                    <TableRow className="bg-gray-50 hover:bg-gray-50">
                      <TableCell colSpan={isDashboardWidget ? 8 : 9} className="p-4">
                        <div className="p-2">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('analytics.visitor')}</TableHead>
                                <TableHead>{t('analytics.viewedAt')}</TableHead>
                                <TableHead>{t('analytics.downloadedAt')}</TableHead>
                                <TableHead className="text-right">{t('viewSessions.duration')}</TableHead>
                                <TableHead className="text-right">{t('analytics.completion')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {link.recent_view_sessions.map((view) => {
                                const { browser, os } = parseUserAgent(view.user_agent);
                                const deviceInfo =
                                  browser !== 'Unknown' ? `${browser} on ${os}` : t('analytics.unknownDevice');
                                const locationParts = [view.city, view.country].filter(Boolean);
                                const hasLocation = locationParts.length > 0;
                                return (
                                  <TableRow key={view.id}>
                                    <TableCell>
                                      <div className="flex items-center gap-2 font-medium">
                                        <span>{view.viewer_email || t('viewSessions.anonymous')}</span>
                                        {view.is_owner_view && (
                                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                                            {t('viewSessions.you')}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {deviceInfo}
                                        {hasLocation ? (
                                          ` - ${locationParts.join(', ')}`
                                        ) : (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="cursor-default"> - {t('viewSessions.unknownLocation')}</span>
                                            </TooltipTrigger>
                                            {view.ip_address && (
                                              <TooltipContent>
                                                <p>{view.ip_address}</p>
                                              </TooltipContent>
                                            )}
                                          </Tooltip>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {formatDate(view.viewed_at, 'PP p')}
                                    </TableCell>
                                    <TableCell>
                                      {view.downloaded_at
                                        ? formatDate(view.downloaded_at, 'PP p')
                                        : '—'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {formatDuration(view.duration_seconds)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {`${(view.completion_rate * 100).toFixed(0)}%`}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          {contextType === 'document' && link.view_count > link.recent_view_sessions.length && (
                            <div className="mt-2 text-center">
                              <Link
                                to={`/documents/${link.document}/links/${link.id}`}
                                className="text-sm font-medium text-blue-600 hover:underline"
                              >
                                {t('analytics.viewAllSessions', { count: link.view_count })}
                              </Link>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
    </TooltipProvider>
  );
}
