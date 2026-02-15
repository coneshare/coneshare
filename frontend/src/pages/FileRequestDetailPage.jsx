import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { getFileRequest, getDocumentDownloadUrl, updateFileRequest } from '../services/api';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { Download } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/Tooltip';

export function FileRequestDetailPage() {
  const { requestId } = useParams();
  const { setBreadcrumbData } = useBreadcrumb();
  const [fileRequest, setFileRequest] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleDownload = async (documentId, documentName) => {
    try {
      toast.info(`Preparing download for ${documentName}...`);
      const response = await getDocumentDownloadUrl(documentId);
      const url = response.data.download_url;

      // Create a temporary link to trigger the download
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', documentName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to get download URL:', error);
      // Error toast is handled by the API interceptor
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!fileRequest) return;
    try {
      const response = await updateFileRequest(fileRequest.id, { is_active: newStatus });
      setFileRequest(response.data); // Update local state
      toast.success(`Link is now ${newStatus ? 'active' : 'inactive'}.`);
    } catch (error) {
      // Error handled by interceptor
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getFileRequest(requestId);
      setFileRequest(response.data);
      setBreadcrumbData({
        type: 'fileRequest',
        fileRequestName: response.data.name || 'Untitled Request',
      });
    } catch (error) {
      toast.error('Failed to fetch file request details.');
      console.error('Failed to fetch file request details:', error);
    } finally {
      setLoading(false);
    }
  }, [requestId, setBreadcrumbData]);

  useEffect(() => {
    fetchData();
    return () => {
      setBreadcrumbData(null);
    };
  }, [fetchData, setBreadcrumbData]);

  if (!loading && !fileRequest) {
    return <div className="p-4 sm:p-6 text-center">File request not found.</div>;
  }

  return (
    <TooltipProvider>
      <div className="p-4 sm:p-6">
        <Toaster richColors />
        <h2 className="text-xl font-semibold mb-4">Uploaded Files ({fileRequest?.uploaded_files?.length || 0})</h2>
      <div className="rounded-lg border">
        <div className="flex items-center border-b bg-gray-50 px-4 py-3 text-sm font-medium text-muted-foreground dark:bg-gray-900/50">
          <div className="w-[30%]">File Name</div>
          <div className="w-[20%]">Destination Folder</div>
          <div className="w-[15%]">Uploader</div>
          <div className="w-[15%]">Email</div>
          <div className="w-[15%]">Uploaded At</div>
          <div className="w-[5%] text-right"></div>
        </div>
        <div>
          {loading ? (
            <div className="p-4 text-center">Loading...</div>
          ) : fileRequest.uploaded_files.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No files have been uploaded to this link yet.</p>
            </div>
          ) : (
            fileRequest.uploaded_files.map((file) => (
              <div key={file.id} className="flex w-full items-center border-b px-4 py-2 text-sm">
                <div className="w-[30%] truncate font-medium">{file.document_name}</div>
                <div className="w-[20%] truncate">
                  <Link to={`/documents/folders/${file.folder_id}`} className="hover:underline">
                    {file.folder_name}
                  </Link>
                </div>
                <div className="w-[15%] truncate">{file.uploader_name}</div>
                <div className="w-[15%] truncate">{file.uploader_email}</div>
                <div className="w-[15%]">
                  {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
                </div>
                <div className="w-[5%] flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(file.document_id, file.document_name)}
                    title={`Download ${file.document_name}`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
