import { Eye, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { generateShareLinkPreview } from '../../services/api';
import { Button } from '../ui/Button';
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

function CopyableLink({ slug, isExpired, expires_at }) {
  const [isHovered, setIsHovered] = useState(false);
  const url = `${window.location.origin}/view/${slug}`;
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const handleCopy = () => {
    if (isExpired) return;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
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
    <div
      onClick={handleCopy}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative w-full cursor-pointer rounded px-1 py-0.5 text-left text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-blue-600"
      title={url}
    >
      <span className={`block truncate ${isHovered ? 'invisible' : ''}`}>{displayUrl}</span>
      {isHovered && (
        <span className="absolute inset-0 flex items-center justify-center rounded-md border border-blue-600">
          Copy to Clipboard
        </span>
      )}
    </div>
  );
}

export function LinksTable({ links, onEditLink, onDeleteLink }) {
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
        <h2 className="text-xl font-semibold">Share Links</h2>
        <p className="mt-2 text-sm text-gray-500">
          No share links have been created for this document yet.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div>
        <h2 className="text-xl font-semibold">Share Links</h2>
      <div className="mt-4 overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Password</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((link) => {
              const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
              return (
                <TableRow key={link.id}>
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
                  <TableCell>{new Date(link.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{link.expires_at ? new Date(link.expires_at).toLocaleDateString() : 'Never'}</TableCell>
                <TableCell>{link.has_password ? 'Yes' : 'No'}</TableCell>
                <TableCell className="text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handlePreview(link.id, link.slug)}
                      >
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">Preview Link</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Preview Link</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => onEditLink(link)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit Link</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit Link</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => onDeleteLink(link)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete Link</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete Link</p>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
    </TooltipProvider>
  );
}
