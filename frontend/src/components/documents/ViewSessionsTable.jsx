import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, FolderIcon } from 'lucide-react';
import { FileTypeIcon } from './FileTypeIcon';
import { PageViewsChart } from './PageViewsChart';
import { Pagination } from '../ui/Pagination';
import { Skeleton } from '../ui/Skeleton';
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
import { parseUserAgent, isSafeUrl } from '../../lib/utils';

function DataroomVisitRow({ visit }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasPageViews = visit.page_views && visit.page_views.length > 0;
  const hasLinkClicks = visit.link_clicks && visit.link_clicks.length > 0;
  const isDocumentVisit = !!visit.dataroom_document_id;
  const isExpandable = isDocumentVisit && (hasPageViews || hasLinkClicks);

  return (
    <li key={visit.id}>
      <div className="flex items-center gap-2 text-sm">
        <div className="flex w-6 flex-shrink-0 items-center justify-center">
          {isExpandable && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="rounded p-1 hover:bg-gray-200"
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
        </div>

        {visit.dataroom_folder_id ? (
          <FileTypeIcon type="folder" className="h-4 w-4 flex-shrink-0" />
        ) : (
          <FileTypeIcon type={visit.dataroom_document_type} className="h-4 w-4 flex-shrink-0" />
        )}
        <span className="truncate">
          {visit.dataroom_folder_name
            ? `Viewed folder: ${visit.dataroom_folder_name}`
            : `Viewed document: ${visit.dataroom_document_name}`}
        </span>
        <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground">
          {new Date(visit.visited_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </div>
      {isExpanded && (hasPageViews || hasLinkClicks) && (
        <div className="ml-8 mt-2 border-l pl-4 space-y-3">
          {hasPageViews && (
            <PageViewsChart pageViews={visit.page_views} documentType={visit.dataroom_document_type} />
          )}
          {hasLinkClicks && (
            <div className="mt-2 text-xs">
              <h5 className="font-semibold text-gray-600 mb-1">Clicked Links:</h5>
              <ul className="space-y-1">
                {visit.link_clicks.map((click) => (
                  <li key={click.id} className="flex items-center gap-1">
                    <span className="text-muted-foreground">Page {click.page_number}:</span>
                    {click.url && isSafeUrl(click.url) ? (
                      <a
                        href={click.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline truncate max-w-[300px] sm:max-w-[400px]"
                        title={click.url}
                      >
                        {click.url}
                      </a>
                    ) : (
                      <span className="text-muted-foreground truncate max-w-[300px] sm:max-w-[400px]" title={click.url}>
                        {click.url}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(click.clicked_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function ViewSessionsTable({ views, totalCount, loading, currentPage, onPageChange, pageSize, isDashboardWidget, contextType = 'document' }) {
  const [expandedRowId, setExpandedRowId] = useState(null);

  const totalPages = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0;

  if (loading) {
    return (
      <div>
        {!isDashboardWidget && <h2 className="text-xl font-semibold">View Sessions</h2>}
        <div className="mt-4 space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (!views || totalCount === 0) {
    return (
      <div>
        {!isDashboardWidget && <h2 className="text-xl font-semibold">View Sessions</h2>}
        <div className="mt-4 rounded-lg border px-4 py-8 text-center">
          <p className="text-muted-foreground">
            {contextType === 'dataroom'
              ? 'This dataroom has not been viewed yet.'
              : 'This document has not been viewed yet.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        {!isDashboardWidget && <h2 className="text-xl font-semibold">View Sessions</h2>}
        <div className="mt-4 overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Visitor</TableHead>
                <TableHead>Link</TableHead>
                {isDashboardWidget && <TableHead>Document</TableHead>}
                <TableHead>Viewed At</TableHead>
                <TableHead>Downloaded At</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Completion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {views.map((view) => {
                const { browser, os } = parseUserAgent(view.user_agent);
                const deviceInfo = browser !== 'Unknown' ? `${browser} on ${os}` : 'Unknown device';
                const locationParts = [view.city, view.country].filter(Boolean);
                const hasLocation = locationParts.length > 0;
                const isExpanded = expandedRowId === view.id;
                const hasPageViews = view.page_views && view.page_views.length > 0;
                const hasDataroomVisits = view.dataroom_visits && view.dataroom_visits.length > 0;
                const hasLinkClicks = view.link_clicks && view.link_clicks.length > 0;
                const isExpandable = hasPageViews || hasDataroomVisits || hasLinkClicks;

                return (
                  <Fragment key={view.id}>
                    <TableRow>
                      <TableCell>
                        {isExpandable && (
                          <button
                            onClick={() => setExpandedRowId(isExpanded ? null : view.id)}
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
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          <span>{view.viewer_email || 'Anonymous'}</span>
                          {view.is_owner_view && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                              You
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
                                <span className="cursor-default"> - Unknown location</span>
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
                      <TableCell>{view.share_link_name || 'Untitled Link'}</TableCell>
                      {isDashboardWidget && (
                        <TableCell>
                          {view.document_id ? (
                            <Link
                              to={`/documents/${view.document_id}`}
                              className="inline-flex items-center gap-1.5 truncate hover:underline"
                              title={view.document_name}
                            >
                              <FileTypeIcon type={view.document_type} className="h-4 w-4" />
                              <span>{view.document_name}</span>
                            </Link>
                          ) : view.dataroom_id ? (
                            <Link
                              to={`/datarooms/${view.dataroom_id}`}
                              className="inline-flex items-center gap-1.5 truncate hover:underline"
                              title={view.dataroom_name}
                            >
                              <FolderIcon className="h-4 w-4 text-blue-500" />
                              <span>{view.dataroom_name}</span>
                            </Link>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {new Date(view.viewed_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </TableCell>
                      <TableCell>
                        {view.downloaded_at
                          ? new Date(view.downloaded_at).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatDuration(view.duration_seconds)}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasDataroomVisits ? '—' : `${(view.completion_rate * 100).toFixed(0)}%`}
                      </TableCell>
                    </TableRow>
                    {isExpanded && isExpandable && (
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableCell colSpan={isDashboardWidget ? 8 : 7}>
                          {hasDataroomVisits ? (
                            <div className="p-4">
                              <h4 className="mb-2 text-sm font-semibold">Activity Log</h4>
                              <ul className="space-y-3">
                                {view.dataroom_visits.map((visit) => (
                                  <DataroomVisitRow key={visit.id} visit={visit} />
                                ))}
                              </ul>
                            </div>
                          ) : (hasPageViews || hasLinkClicks) ? (
                            <div className="p-4 space-y-4">
                              {hasPageViews && (
                                <PageViewsChart pageViews={view.page_views} documentType={view.document_type} />
                              )}
                              {hasLinkClicks && (
                                <div className={`${hasPageViews ? 'border-t pt-3' : ''}`}>
                                  <h4 className="text-sm font-semibold mb-2">Clicked Links</h4>
                                  <ul className="space-y-2 text-xs">
                                    {view.link_clicks.map((click) => (
                                      <li key={click.id} className="flex items-center gap-1">
                                        <span className="text-muted-foreground">Page {click.page_number}:</span>
                                        {click.url && isSafeUrl(click.url) ? (
                                          <a
                                            href={click.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline truncate max-w-[300px] sm:max-w-[400px]"
                                            title={click.url}
                                          >
                                            {click.url}
                                          </a>
                                        ) : (
                                          <span className="text-muted-foreground truncate max-w-[300px] sm:max-w-[400px]" title={click.url}>
                                            {click.url}
                                          </span>
                                        )}
                                        <span className="text-[10px] text-muted-foreground ml-auto">
                                          {new Date(click.clicked_at).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                          })}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <Pagination
          totalPages={totalPages}
          currentPage={currentPage}
          onPageChange={onPageChange}
        />
      </div>
    </TooltipProvider>
  );
}
