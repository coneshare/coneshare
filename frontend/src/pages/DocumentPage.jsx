import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getDocumentDetails } from '../services/api';
import { DocumentHeader } from '../components/documents/DocumentHeader';
import { LinksTable } from '../components/documents/LinksTable';
import { VisitorsTable } from '../components/documents/VisitorsTable';
import { Stats } from '../components/documents/Stats';
import { Skeleton } from '../components/ui/Skeleton';

export function DocumentPage() {
  const { documentId } = useParams();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        setLoading(true);
        const response = await getDocumentDetails(documentId);
        setDocument(response.data);
      } catch (err) {
        setError('Failed to fetch document details.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [documentId]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-1/4" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div>
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center">
        <p>Document not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <DocumentHeader documentName={document.name} />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          <LinksTable links={document.share_links} />
          <VisitorsTable views={document.views} />
        </div>
        <div>
          <Stats views={document.views} />
        </div>
      </div>
    </div>
  );
}
