import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { MoreHorizontal, Edit, Trash2, Copy, UploadCloud } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import { getFileRequests, deleteFileRequest } from '../services/api';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { Button } from '../components/ui/Button';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { FileRequestSheet } from '../components/filerequests/FileRequestSheet';

export function FileRequestsPage() {
  const navigate = useNavigate();
  const { setBreadcrumbData } = useBreadcrumb();
  const [fileRequests, setFileRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  useEffect(() => {
    setBreadcrumbData(null); // Use page title from nav item
  }, [setBreadcrumbData]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getFileRequests();
      setFileRequests(response.data);
    } catch (error) {
      console.error('Failed to fetch file requests:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEditRequest = (request) => {
    setSelectedRequest(request);
    setIsEditSheetOpen(true);
  };

  const handleDeleteRequest = (request) => {
    setSelectedRequest(request);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedRequest) return;
    try {
      await deleteFileRequest(selectedRequest.id);
      toast.success('File request deleted successfully.');
      fetchData();
    } catch (error) {
      console.error('Failed to delete file request:', error);
    } finally {
      setIsDeleteConfirmOpen(false);
      setSelectedRequest(null);
    }
  };

  const handleCopyLink = (slug) => {
    const url = `${window.location.origin}/upload/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
  };

  return (
    <div className="p-4 sm:p-6">
      <Toaster richColors />
      <FileRequestSheet
        isOpen={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
        onSuccess={fetchData}
      />
      {selectedRequest && (
        <FileRequestSheet
          isOpen={isEditSheetOpen}
          onOpenChange={setIsEditSheetOpen}
          currentRequest={selectedRequest}
          folder={{ id: selectedRequest.folder, name: selectedRequest.folder_name }}
          onSuccess={fetchData}
        />
      )}
      <ConfirmationDialog
        isOpen={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="Delete File Request?"
        description="This action cannot be undone. This will permanently delete the file request link."
        onConfirm={confirmDelete}
        confirmText="Delete"
      />

      <div className="mb-4 flex items-center justify-end">
        <Button onClick={() => setIsCreateSheetOpen(true)}>
          <UploadCloud className="mr-2 h-4 w-4" />
          Create File Request
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center border-b bg-gray-50 px-4 py-3 text-sm font-medium text-muted-foreground dark:bg-gray-900/50">
          <div className="w-[30%] pl-8">Name</div>
          <div className="w-[25%]">Destination Folder</div>
          <div className="w-[10%]">Uploaded</div>
          <div className="w-[15%]">Expires</div>
          <div className="w-[15%]">Created</div>
          <div className="w-16 text-right">Actions</div>
        </div>
        <div>
          {loading && <div className="p-4 text-center">Loading...</div>}
          {!loading && fileRequests.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <p>No file requests found.</p>
              <p className="mt-2 text-sm">
                Click "Create File Request" to get started.
              </p>
            </div>
          )}
          {!loading &&
            fileRequests.map((request) => (
              <div
                key={request.id}
                onClick={() => navigate(`/file-requests/${request.id}`)}
                className="flex w-full cursor-pointer items-center border-b px-4 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50"
              >
                <div className="w-8" />
                <div className="w-[30%] truncate font-medium">{request.name || 'Untitled Request'}</div>
                <div className="w-[25%] truncate">
                  <Link
                    to={`/documents/folders/${request.folder}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {request.folder_name}
                  </Link>
                </div>
                <div className="w-[10%]">{request.uploaded_files_count}</div>
                <div className="w-[15%]">
                  {request.expires_at ? format(new Date(request.expires_at), 'PPp') : 'Never'}
                </div>
                <div className="w-[15%]">
                  {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                </div>
                <div className="w-16 flex justify-end">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end" className="z-20 w-48 rounded-md bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800">
                      <DropdownMenu.Item onSelect={(e) => { e.stopPropagation(); handleCopyLink(request.slug); }} className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700">
                        <Copy className="h-4 w-4" />
                        <span>Copy Link</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={(e) => { e.stopPropagation(); handleEditRequest(request); }} className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700">
                        <Edit className="h-4 w-4" />
                        <span>Edit</span>
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                      <DropdownMenu.Item onSelect={(e) => { e.stopPropagation(); handleDeleteRequest(request); }} className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 focus:text-red-700 dark:text-red-500 dark:hover:bg-red-900/20">
                        <Trash2 className="h-4 w-4" />
                        <span>Delete</span>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
