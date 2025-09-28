import { Download, Maximize, Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '../ui/Button';

export function ViewerToolbar({ allowDownload }) {
  // Placeholder functions for actions
  const handleFullScreen = () => alert('Full screen not implemented');
  const handleZoomIn = () => alert('Zoom in not implemented');
  const handleZoomOut = () => alert('Zoom out not implemented');
  const handleDownload = () => alert('Download not implemented');
  const handlePrint = () => alert('Print not implemented');

  return (
    <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 transform">
      <div className="flex items-center gap-1 rounded-lg bg-white p-1 shadow-md">
        <Button variant="ghost" size="icon" onClick={handleFullScreen} title="Full screen">
          <Maximize className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom in">
          <ZoomIn className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom out">
          <ZoomOut className="h-5 w-5" />
        </Button>
        {allowDownload && (
          <>
            <Button variant="ghost" size="icon" onClick={handleDownload} title="Download">
              <Download className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handlePrint} title="Print">
              <Printer className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
