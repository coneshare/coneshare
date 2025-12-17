import { Link } from 'react-router-dom';
import { Eye, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { Fragment, useState } from 'react';
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

function parseUserAgent(uaString) {
  if (!uaString) return { browser: 'Unknown', os: 'Unknown' };
  const parser = new UAParser(uaString);
  const result = parser.getResult();
  return {
    browser: result.browser.name || 'Unknown',
    os: result.os.name || 'Unknown',
  };
}

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function CopyableLink({ slug, isExpired, expires_at }) {
  const url = `${window.location.origin}/view/${slug}`;
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const handleCopy = () => {
    if (isExpired) return;
    copyTextToClipboard(url, 'Link copied to clipboard!', 'Failed to copy link.');
  };

  if (isExpired) {
    const formattedDate = new Date(expires_at).toLocaleDateString();
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="relative w-full cursor-not-allowed rounded px-1 py-0.5 text-left text-sm text-gray-400"
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
          className="w-full cursor-pointer rounded px-1 py-0.5 text-left text-sm text-gray-600 transition-colors hover:bg-gray-100"
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
  const [expandedRowId, setExpandedRowId] = useState(null);

  const handleStatusChange = async (link, newStatus) => {
    try {
      const response = await updateShareLink(link.id, { is_active: newStatus });
      toast.success(`Link "${link.name || 'Untitled Link'}" is now ${newStatus ? 'active' : 'inactive'}.`);
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
      toast.error('Could not generate preview link. Please try again.');
    }
  };

  if (!links || links.length === 0) {
    return (
      <div>
        {!isDashboardWidget && <h2 className="text-xl font-semibold">Share Links</h2>}
        <p className="mt-2 text-sm text-gray-500">
          {contextType === 'dataroom'
            ? 'No share links have been created for this dataroom yet.'
            : 'No share links have been created for this document yet.'}
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        {!isDashboardWidget && <h2 className="text-xl font-semibold">Share Links</h2>}
      <div className="mt-4 overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Name</TableHead>
              <TableHead>Link</TableHead>
              {isDashboardWidget && <TableHead>Document</TableHead>}
              <TableHead>Views</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Last Viewed At</TableHead>
              <TableHead>Settings</TableHead>
              {!isDashboardWidget && <TableHead>Status</TableHead>}
              {!isDashboardWidget && (
                <TableHead>
                  <span className="sr-only">Actions</span>
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
                    <TableCell>
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
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{link.name || 'Untitled Link'}</span>
                        {isExpired && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            Expired
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CopyableLink
                        slug={link.slug}
                        isExpired={isExpired}
                        expires_at={link.expires_at}
                      />
                    </TableCell>
                    {isDashboardWidget && (
                      <TableCell>
                        <Link
                          to={`/documents/${link.document}`}
                          className="truncate hover:underline"
                          title={link.document_name}
                        >
                          {link.document_name}
                        </Link>
                      </TableCell>
                    )}
                    <TableCell>{link.view_count}</TableCell>
                    <TableCell>{new Date(link.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {link.last_viewed_at
                        ? new Date(link.last_viewed_at).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <LinkSettingsSummary link={link} onClick={() => onEditLink(link)} />
                    </TableCell>
                    {!isDashboardWidget && (
                      <>
                        <TableCell>
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
                              <p>{link.is_active ? 'Active' : 'Inactive'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-right">
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
                          {/* <h4 className="mb-2 text-sm font-semibold text-gray-600"> */}
                          {/*   View Sessions */}
                          {/* </h4> */}
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Visitor</TableHead>
                                <TableHead>Viewed At</TableHead>
                                <TableHead>Downloaded At</TableHead>
                                <TableHead className="text-right">Duration</TableHead>
                                <TableHead className="text-right">Completion</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {link.recent_view_sessions.map((view) => {
                                const { browser, os } = parseUserAgent(view.user_agent);
                                const deviceInfo =
                                  browser !== 'Unknown' ? `${browser} on ${os}` : 'Unknown device';
                                const locationParts = [view.city, view.country].filter(Boolean);
                                const hasLocation = locationParts.length > 0;
                                return (
                                  <TableRow key={view.id}>
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
                                    <TableCell>
                                      {new Date(view.viewed_at).toLocaleString(undefined, {
                                        dateStyle: 'medium',
                                        timeStyle: 'short',
                                      })}
                                    </TableCell>
                                    <TableCell>
                                      {view.downloaded_at
                                        ? new Date(view.downloaded_at).toLocaleString(
                                            undefined,
                                            {
                                              dateStyle: 'medium',
                                              timeStyle: 'short',
                                            }
                                          )
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
                                View all {link.view_count} sessions
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
