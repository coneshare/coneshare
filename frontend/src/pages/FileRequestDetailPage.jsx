import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { getFileRequest, getDocumentDownloadUrl } from '../services/api';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { ArrowLeft, Download } from 'lucide-react';
import { Button } from '../components/ui/Button';

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

  useEffect(() => {
    setBreadcrumbData(null); // Use page title from nav item
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
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{fileRequest.name || 'Untitled Request'}</h1>
          <p className="text-muted-foreground">
            Uploading to folder: <span className="font-medium text-foreground">{fileRequest.folder_name}</span>
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/file-requests">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to all requests
          </Link>
        </Button>
      </div>

      <h2 className="text-xl font-semibold mb-4">Uploaded Files ({fileRequest.uploaded_files.length})</h2>
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
          {fileRequest.uploaded_files.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No files have been uploaded to this link yet.</p>
            </div>
          ) : (
            fileRequest.uploaded_files.map((file) => (
              <div key={file.id} className="flex w-full items-center border-b px-4 py-2 text-sm">
                <div className="w-[30%] truncate font-medium">{file.document_name}</div>
                <div className="w-[20%] truncate">{file.folder_name}</div>
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
  );
}
