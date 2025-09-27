import { useEffect, useState } from 'react';
import { getDocumentPreviewData } from '../../services/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Skeleton } from '../ui/Skeleton';
import { PreviewViewer } from './PreviewViewer';

export function DocumentPreviewModal({ documentId, isOpen, onOpenChange }) {
  const [documentData, setDocumentData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && documentId) {
      const fetchPreviewData = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const response = await getDocumentPreviewData(documentId);
          setDocumentData(response.data);
        } catch (err) {
          setError('Failed to load document preview. Please try again.');
          console.error(err);
        } finally {
          setIsLoading(false);
        }
      };
      fetchPreviewData();
    } else {
      // Reset state when modal is closed
      setDocumentData(null);
    }
  }, [isOpen, documentId]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {documentData ? documentData.name : 'Document Preview'}
          </DialogTitle>
        </DialogHeader>
        <div className="h-[calc(90vh-80px)] py-4">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}
          {error && <p className="text-center text-red-500">{error}</p>}
          {documentData && <PreviewViewer documentData={documentData} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
