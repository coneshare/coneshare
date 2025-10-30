    import { formatDistanceToNow } from 'date-fns';
    import { MoreVertical, Link as LinkIcon, Edit, Trash2, ShieldCheck, Copy } from 'lucide-react';
    import { toast } from 'sonner';
    import { Button } from '../ui/Button';
    import { Badge } from '../ui/Badge';
    import {
      Table,
      TableBody,
      TableCell,
      TableHead,
      TableHeader,
      TableRow,
    } from '../ui/Table';
    import {
      DropdownMenu,
      DropdownMenuContent,
      DropdownMenuItem,
      DropdownMenuTrigger,
    } from '../ui/DropdownMenu';
    
    export function DataroomLinksTable({ links, onEditLink, onDeleteLink, onManagePermissions }) {
      const copyLinkToClipboard = (slug) => {
        const url = `${window.location.origin}/view/${slug}`;
        navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard!');
      };
    
      return (
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Links & Permissions</h2>
          <div className="mt-4 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Viewed</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No links created yet.
                    </TableCell>
                  </TableRow>
                )}
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">{link.name || 'Untitled Link'}</TableCell>
                    <TableCell>
                      <Badge variant={link.is_active ? 'default' : 'outline'} className={link.is_active ? 'bg-green-100 text-green-800' : ''}>
                        {link.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>{link.view_count}</TableCell>
                    <TableCell>{formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}</TableCell>
                    <TableCell>{link.last_viewed_at ? formatDistanceToNow(new Date(link.last_viewed_at), { addSuffix: true }) : 'Never'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditLink(link)}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onManagePermissions(link)}>
                            <ShieldCheck className="mr-2 h-4 w-4" /> Manage Permissions
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyLinkToClipboard(link.slug)}>
                            <Copy className="mr-2 h-4 w-4" /> Copy Link
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDeleteLink(link)} className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      );
    }
