import { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Expand, 
  Maximize, 
  Minus, 
  Plus, 
  Printer,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { recordDownload } from '../../services/api';
import { Button } from '../ui/Button';

export function ViewerToolbar({
  // Page navigation
  currentPage,
  totalPages,
  onPageChange,

  // Zoom
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onFitWidth,

  // Actions
  allowDownload,
  downloadUrl,
  downloadFileName,
  downloadDocumentId = null,
  viewId,
  onFullScreen,
  onPrint,

  // Sibling controls (Optional, for dataroom mode)
  hasPrevSibling,
  hasNextSibling,
  onPrevSibling,
  onNextSibling,
}) {
  const [isVisible, setIsVisible] = useState(true);
  const hideTimeoutRef = useRef(null);
  const isHoveredRef = useRef(false);
  const [inputValue, setInputValue] = useState(currentPage.toString());

  // Synchronize local input state with currentPage
  useEffect(() => {
    setInputValue(currentPage.toString());
  }, [currentPage]);

  // Handle inactivity auto-hide
  useEffect(() => {
    const handleActivity = () => {
      setIsVisible(true);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      if (!isHoveredRef.current) {
        hideTimeoutRef.current = setTimeout(() => {
          setIsVisible(false);
        }, 3000);
      }
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('scroll', handleActivity, { passive: true });
    
    // Set initial timer
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 3000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    isHoveredRef.current = true;
    setIsVisible(true);
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
  };

  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 3000);
  };

  const handleDownload = () => {
    if (downloadUrl) {
      if (viewId) {
        recordDownload(viewId, downloadDocumentId).catch(err => 
          console.error("Failed to record download", err)
        );
      }
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', downloadFileName || '');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (/^\d*$/.test(val)) {
      setInputValue(val);
    }
  };

  const handleInputBlurOrSubmit = () => {
    const val = parseInt(inputValue, 10);
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      if (val !== currentPage) {
        onPageChange(val);
      } else {
        setInputValue(currentPage.toString());
      }
    } else {
      setInputValue(currentPage.toString());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleInputBlurOrSubmit();
      e.target.blur();
    } else if (e.key === 'Escape') {
      setInputValue(currentPage.toString());
      e.target.blur();
    }
  };

  return (
    <div 
      className={`fixed bottom-6 left-1/2 z-30 -translate-x-1/2 transform transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/90 p-1.5 shadow-lg backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-950/90">
        
        {/* Group 1: Page Navigation */}
        <div className="flex items-center gap-1 pr-1.5">
          {onPrevSibling && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onPrevSibling} 
              disabled={!hasPrevSibling}
              title="Previous file"
              className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronsLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </Button>
          )}

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => onPageChange(currentPage - 1)} 
            disabled={currentPage <= 1}
            title="Previous page"
            className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </Button>
          
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlurOrSubmit}
              onKeyDown={handleKeyDown}
              className="w-10 rounded border border-gray-200 bg-white py-0.5 text-center text-sm font-semibold text-gray-700 focus:border-gray-400 focus:ring-1 focus:ring-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <span className="text-sm font-medium text-gray-500 whitespace-nowrap">
              / {totalPages}
            </span>
          </div>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => onPageChange(currentPage + 1)} 
            disabled={currentPage >= totalPages}
            title="Next page"
            className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </Button>

          {onNextSibling && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onNextSibling} 
              disabled={!hasNextSibling}
              title="Next file"
              className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronsRight className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </Button>
          )}
        </div>
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />

        {/* Group 2: Zoom Controls */}
        <div className="flex items-center gap-1 px-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onZoomOut} 
            disabled={zoomLevel <= 0.5}
            title="Zoom out"
            className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Minus className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </Button>

          <span className="hidden min-w-[3rem] text-center text-sm font-semibold text-gray-700 dark:text-gray-300 md:inline-block">
            {Math.round(zoomLevel * 100)}%
          </span>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onZoomIn} 
            disabled={zoomLevel >= 3.0}
            title="Zoom in"
            className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Plus className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onFitWidth} 
            title="Fit to width"
            className="hidden h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800 md:inline-flex"
          >
            <Expand className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </Button>
        </div>
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />

        {/* Group 3: Actions */}
        <div className="flex items-center gap-1 pl-1.5">
          {allowDownload && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleDownload} 
              title="Download file"
              className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Download className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </Button>
          )}

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onPrint} 
            title="Print document"
            className="hidden h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800 md:inline-flex"
          >
            <Printer className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onFullScreen} 
            title="Toggle fullscreen"
            className="hidden h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800 md:inline-flex"
          >
            <Maximize className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </Button>
        </div>

      </div>
    </div>
  );
}
