import { Download, Maximize, Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { recordDownload } from '../../services/api';
import { Button } from '../ui/Button';

export function ViewerToolbar({
  allowDownload,
  downloadUrl,
  downloadFileName,
  onFullScreen,
  onZoomIn,
  onZoomOut,
  currentPage,
  totalPages,
  viewId,
  downloadDocumentId = null,
  previewMode = 'server_pages',
}) {
  const handleDownload = () => {
    if (viewId && downloadUrl) {
      // Log the download event in the background
      recordDownload(viewId, downloadDocumentId).catch(err => console.error("Failed to record download", err));
      
      // Create a temporary link element to trigger the download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', downloadFileName || ''); // An empty download attribute prompts the user to save the file
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  const handlePrint = () => alert('Print not implemented');

  return (
    <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 transform">
      <div className="flex items-center gap-2 rounded-lg bg-white p-1 shadow-md">
        <Button variant="ghost" size="icon" onClick={onFullScreen} title="Full screen">
          <Maximize className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onZoomOut} title="Zoom out">
            <ZoomOut className="h-5 w-5" />
          </Button>
          <span className="min-w-[4rem] text-center text-sm font-medium text-gray-700">
            {currentPage} / {totalPages}
          </span>
          <Button variant="ghost" size="icon" onClick={onZoomIn} title="Zoom in">
            <ZoomIn className="h-5 w-5" />
          </Button>
        </div>

        {allowDownload && (
          <div className="flex items-center gap-1 border-l pl-1">
            <Button variant="ghost" size="icon" onClick={handleDownload} title="Download">
              <Download className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handlePrint} title="Print">
              <Printer className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
