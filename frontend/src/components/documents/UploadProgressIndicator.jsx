import { CheckCircle2, ChevronDown, ChevronUp, File, Loader2, UploadCloud, X, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useUpload } from '../../contexts/UploadProvider';
import { formatBytes } from '../../lib/formatters';
import { Button } from '../ui/Button';
import { Progress } from '../ui/Progress';

export function UploadProgressIndicator() {
  const { uploads, clearCompleted } = useUpload();
  const [isExpanded, setIsExpanded] = useState(true);

  const activeUploads = useMemo(() => Object.values(uploads), [uploads]);

  const { totalProgress, completedCount, errorCount, inProgressCount } = useMemo(() => {
    let totalSize = 0;
    let totalUploaded = 0;
    let completedCount = 0;
    let errorCount = 0;

    activeUploads.forEach((upload) => {
      totalSize += upload.file.size;
      totalUploaded += (upload.file.size * upload.progress) / 100;
      if (upload.status === 'complete') completedCount++;
      if (upload.status === 'error') errorCount++;
    });

    const totalProgress = totalSize > 0 ? (totalUploaded / totalSize) * 100 : 0;
    const inProgressCount = activeUploads.length - completedCount - errorCount;

    return { totalProgress, completedCount, errorCount, inProgressCount };
  }, [activeUploads]);

  if (activeUploads.length === 0) {
    return null;
  }

  const isComplete = inProgressCount === 0;

  const getStatusText = () => {
    if (isComplete) {
      if (errorCount > 0) {
        return `${errorCount} upload(s) failed.`;
      }
      return 'All uploads complete!';
    }
    return `Uploading ${activeUploads.length} file(s)...`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm rounded-lg bg-white shadow-lg dark:bg-gray-800">
      <div className="flex items-center p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 flex-1">
            <UploadCloud className="h-5 w-5" />
            <span className="font-semibold text-sm">{getStatusText()}</span>
        </div>
        <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(!isExpanded)} title={isExpanded ? "Collapse" : "Expand"}>
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            {isComplete && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearCompleted} title="Close">
                    <X className="h-4 w-4" />
                </Button>
            )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 max-h-60 overflow-y-auto">
          {activeUploads.map((upload) => (
            <div key={upload.id} className="flex items-center gap-3 mb-2 last:mb-0">
              <File className="h-6 w-6 flex-shrink-0 text-gray-500" />
              <div className="flex-1 overflow-hidden">
                <div className="text-sm truncate">{upload.file.name}</div>
                <div className="text-xs text-gray-500">{formatBytes(upload.file.size)}</div>
                {upload.status === 'error' && (
                  <div className="text-xs text-red-500 truncate">{upload.error}</div>
                )}
                <Progress value={upload.progress} className="h-1 mt-1" />
              </div>
              <div className="flex-shrink-0">
                {upload.status === 'uploading' && <Loader2 className="h-5 w-5 animate-spin text-gray-500" />}
                {upload.status === 'complete' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                {upload.status === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex justify-between text-xs mb-1 font-medium">
            <span>Overall Progress</span>
            <span>{Math.round(totalProgress)}%</span>
        </div>
        <Progress value={totalProgress} className="h-2" />
      </div>
    </div>
  );
}
