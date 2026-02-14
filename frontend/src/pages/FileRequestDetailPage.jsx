import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { getFileRequest } from '../services/api';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function FileRequestDetailPage() {
  const { requestId } = useParams();
  const { setBreadcrumbData } = useBreadcrumb();
  const [fileRequest, setFileRequest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Empty breadcrumb, page title is handled by h1
    setBreadcrumbData({});
  }, [setBreadcrumbData]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getFileRequest(requestId);
      setFileRequest(response.data);
    } catch (error) {
      toast.error('Failed to fetch file request details.');
      console.error('Failed to fetch file request details:', error);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="p-4 sm:p-6 text-center">Loading...</div>;
  }

  if (!fileRequest) {
    return <div className="p-4 sm:p-6 text-center">File request not found.</div>;
  }

  return (
    <div className="p-4 sm:p-6">
      <Toaster richColors />
      <div className="mb-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/file-requests">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to all requests
          </Link>
        </Button>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{fileRequest.name || 'Untitled Request'}</h1>
        <p className="text-muted-foreground">
          Uploading to folder: <span className="font-medium text-foreground">{fileRequest.folder_name}</span>
        </p>
      </div>

      <h2 className="text-xl font-semibold mb-4">Uploaded Files ({fileRequest.uploaded_files.length})</h2>
      <div className="rounded-lg border">
        <div className="flex items-center border-b bg-gray-50 px-4 py-3 text-sm font-medium text-muted-foreground dark:bg-gray-900/50">
          <div className="w-[40%]">File Name</div>
          <div className="w-[25%]">Uploader</div>
          <div className="w-[20%]">Email</div>
          <div className="w-[15%]">Uploaded At</div>
        </div>
        <div>
          {fileRequest.uploaded_files.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No files have been uploaded to this link yet.</p>
            </div>
          ) : (
            fileRequest.uploaded_files.map((file) => (
              <div key={file.id} className="flex w-full items-center border-b px-4 py-2 text-sm">
                <div className="w-[40%] truncate font-medium">{file.document_name}</div>
                <div className="w-[25%] truncate">{file.uploader_name}</div>
                <div className="w-[20%] truncate">{file.uploader_email}</div>
                <div className="w-[15%]">
                  {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
