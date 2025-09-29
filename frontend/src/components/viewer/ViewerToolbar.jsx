import { Download, Maximize, Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '../ui/Button';

export function ViewerToolbar({
  allowDownload,
  onFullScreen,
  onZoomIn,
  onZoomOut,
  currentPage,
  totalPages,
}) {
  // Placeholder functions for actions
  const handleDownload = () => alert('Download not implemented');
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
