import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { UAParser } from 'ua-parser-js';
import { PageViewsChart } from './PageViewsChart';
import { Pagination } from './Pagination';
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

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function parseUserAgent(uaString) {
  if (!uaString) return { browser: 'N/A', os: 'N/A' };
  const parser = new UAParser(uaString);
  const result = parser.getResult();
  return {
    browser: result.browser.name || 'Unknown',
    os: result.os.name || 'Unknown',
  };
}

export function VisitorsTable({ views, totalCount, loading, currentPage, onPageChange, pageSize }) {
  const [expandedRowId, setExpandedRowId] = useState(null);

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-semibold">Visitors</h2>
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
        <h2 className="text-xl font-semibold">Visitors</h2>
        <div className="mt-4 rounded-lg border px-4 py-8 text-center">
          <p className="text-muted-foreground">This document has not been viewed yet.</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        <h2 className="text-xl font-semibold">Visitors</h2>
        <div className="mt-4 overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Visitor</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Viewed At</TableHead>
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

                return (
                  <Fragment key={view.id}>
                    <TableRow>
                      <TableCell>
                        {hasPageViews && (
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
                      <TableCell>
                        {new Date(view.viewed_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatDuration(view.duration_seconds)}
                      </TableCell>
                      <TableCell className="text-right">
                        {`${(view.completion_rate * 100).toFixed(0)}%`}
                      </TableCell>
                    </TableRow>
                    {isExpanded && hasPageViews && (
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableCell colSpan={6} className="p-4">
                          <PageViewsChart pageViews={view.page_views} />
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
          count={totalCount}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={onPageChange}
        />
      </div>
    </TooltipProvider>
  );
}
