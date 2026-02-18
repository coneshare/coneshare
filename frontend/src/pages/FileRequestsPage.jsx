import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { MoreHorizontal, Edit, Trash2, Copy, UploadCloud } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import { getFileRequests, deleteFileRequest, updateFileRequest } from '../services/api';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { Button } from '../components/ui/Button';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { FileRequestSheet } from '../components/filerequests/FileRequestSheet';
import { Pagination } from '../components/ui/Pagination';
import { Switch } from '../components/ui/Switch';
import { ROOT_FOLDER_NAME } from '../lib/constants';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/Tooltip';

export function FileRequestsPage() {
  const navigate = useNavigate();
  const { setBreadcrumbData } = useBreadcrumb();
  const [fileRequests, setFileRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;

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
      const response = await getFileRequests(currentPage);
      setFileRequests(response.data.results);
      setTotalCount(response.data.count);
    } catch (error) {
      console.error('Failed to fetch file requests:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  const handleStatusChange = async (request, newStatus) => {
    try {
      const response = await updateFileRequest(request.id, { is_active: newStatus });
      toast.success(`Link "${request.name || 'Untitled Request'}" is now ${newStatus ? 'active' : 'inactive'}.`);
      setFileRequests(prev => 
        prev.map(r => r.id === request.id ? response.data : r)
      );
    } catch (error) {
      // Error is handled by API interceptor
    }
  };

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

  const handleSuccess = () => {
    // If editing, refetch current page. If creating, go to page 1.
    if (selectedRequest) {
      fetchData();
    } else {
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        fetchData();
      }
    }
  };

  const confirmDelete = async () => {
    if (!selectedRequest) return;
    try {
      await deleteFileRequest(selectedRequest.id);
      toast.success('File request deleted successfully.');
      // If the deleted item was the last one on a page > 1, go to previous page.
      if (fileRequests.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      } else {
        fetchData();
      }
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
    <TooltipProvider>
      <div className="p-4 sm:p-6">
        <Toaster richColors />
      <FileRequestSheet
        isOpen={isCreateSheetOpen || isEditSheetOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setIsCreateSheetOpen(false);
            setIsEditSheetOpen(false);
            setSelectedRequest(null);
          }
        }}
        currentRequest={selectedRequest}
        folder={selectedRequest ? { id: selectedRequest.folder, name: selectedRequest.folder_name } : null}
        onSuccess={handleSuccess}
      />
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
          <div className="w-[10%]">Status</div>
          <div className="w-[20%]">Created</div>
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
            fileRequests.map((request) => {
              const isExpired = request.expires_at && new Date(request.expires_at) < new Date();
              return (
                <div
                  key={request.id}
                  onClick={(e) => {
                    if (e.defaultPrevented) return;
                    navigate(`/file-requests/${request.id}`);
                  }}                  
                  className="flex w-full cursor-pointer items-center border-b px-4 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50"
                >
                  <div className="w-8" />
                  <div className="w-[30%] flex items-center gap-2 font-medium">
                    <span className="truncate">{request.name || 'Untitled Request'}</span>
                    {isExpired && (
                      <span className="flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Expired
                      </span>
                    )}
                  </div>
                  <div className="w-[25%] truncate">
                    {request.folder_name === ROOT_FOLDER_NAME ? (
                      <Link
                        to="/documents"
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Root
                      </Link>
                    ) : (
                      <Link
                        to={`/documents/folders/${request.folder}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {request.folder_name}
                      </Link>
                    )}
                  </div>
                  <div className="w-[10%]">{request.uploaded_files_count}</div>
                  <div className="w-[10%]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex align-middle" onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={request.is_active}
                            onCheckedChange={(checked) => handleStatusChange(request, checked)}
                            aria-label="Toggle link status"
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{request.is_active ? 'Active' : 'Inactive'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="w-[20%]">
                    {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                  </div>
                  <div className="w-16 flex justify-end">
                    <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content
                          align="end"
                          className="z-20 w-48 rounded-md bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800"
                          onCloseAutoFocus={(e) => e.preventDefault()}
                        >
                          <DropdownMenu.Item onSelect={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyLink(request.slug); }} className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700">
                            <Copy className="h-4 w-4" />
                            <span>Copy Link</span>
                          </DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={(e) => { e.preventDefault(); e.stopPropagation(); handleEditRequest(request); }} className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700">
                            <Edit className="h-4 w-4" />
                            <span>Edit</span>
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                          <DropdownMenu.Item onSelect={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteRequest(request); }} className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 focus:text-red-700 dark:text-red-500 dark:hover:bg-red-900/20">
                            <Trash2 className="h-4 w-4" />
                            <span>Delete</span>
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(totalCount / pageSize)}
        onPageChange={setCurrentPage}
      />
    </div>
    </TooltipProvider>
  );
}
