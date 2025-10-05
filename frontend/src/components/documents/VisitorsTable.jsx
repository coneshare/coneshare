import { UAParser } from 'ua-parser-js';
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

export function VisitorsTable({ viewsData, loading, currentPage, onPageChange, pageSize }) {
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

  if (!viewsData || viewsData.count === 0) {
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
                <TableHead>Visitor</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Viewed At</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Completion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewsData.results.map((view) => {
                const { browser, os } = parseUserAgent(view.user_agent);
                const deviceInfo = browser !== 'Unknown' ? `${browser} on ${os}` : 'Unknown device';
                const locationParts = [view.city, view.country].filter(Boolean);
                const hasLocation = locationParts.length > 0;

                return (
                  <TableRow key={view.id}>
                    <TableCell>
                      <div className="font-medium">{view.viewer_email || 'Anonymous'}</div>
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
                    <TableCell className="text-right">{formatDuration(view.duration_seconds)}</TableCell>
                    <TableCell className="text-right">
                      {`${(view.completion_rate * 100).toFixed(0)}%`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <Pagination
          count={viewsData.count}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={onPageChange}
        />
      </div>
    </TooltipProvider>
  );
}
