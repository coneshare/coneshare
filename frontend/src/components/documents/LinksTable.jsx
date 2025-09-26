import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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

function CopyableLink({ slug }) {
  const [isHovered, setIsHovered] = useState(false);
  const url = `${window.location.origin}/view/${slug}`;
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
  };

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
        <span className="absolute inset-0 flex items-center justify-center">
          Copy to Clipboard
        </span>
      )}
    </div>
  );
}

export function LinksTable({ links, onEditLink }) {
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
            {links.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="font-medium">{link.name || 'Untitled Link'}</TableCell>
                <TableCell>
                  <CopyableLink slug={link.slug} />
                </TableCell>
                <TableCell>{new Date(link.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{link.expires_at ? new Date(link.expires_at).toLocaleDateString() : 'Never'}</TableCell>
                <TableCell>{link.has_password ? 'Yes' : 'No'}</TableCell>
                <TableCell className="text-right">
                  <TooltipProvider>
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
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
