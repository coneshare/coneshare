import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Cone } from 'lucide-react';
import { PasswordForm } from '../components/viewer/PasswordForm';
import { PreviewViewer } from '../components/documents/PreviewViewer';
import { Skeleton } from '../components/ui/Skeleton';
import { getShareLinkViewData } from '../services/api';

export function ShareLinkViewerPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const previewToken = searchParams.get('previewToken');

  const [documentData, setDocumentData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [protectionType, setProtectionType] = useState(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    const fetchData = async () => {
      // Reset state before fetching
      setIsLoading(true);
      setError(null);
      setProtectionType(null);

      try {
        const response = await getShareLinkViewData(slug, previewToken);
        if (!isCancelled) {
          setDocumentData(response.data);
        }
      } catch (err) {
        if (!isCancelled) {
          const errorData =
            err.response?.data || { message: 'Failed to load document. The link may be invalid or expired.' };
          setError(errorData);

          if (err.response?.status === 401 && errorData?.protectionType === 'password') {
            setProtectionType('password');
          }
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      isCancelled = true;
    };
  }, [slug, previewToken, refetchTrigger]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (protectionType === 'password') {
    return (
      <PasswordForm
        slug={slug}
        message={error?.message}
        onSuccess={() => setRefetchTrigger((c) => c + 1)}
      />
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg bg-white p-8 text-center shadow-md">
          <h1 className="mb-4 text-2xl font-bold text-red-600">Error</h1>
          <p className="text-gray-700">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-gray-50">
      <div className="absolute left-6 top-4 z-10">
        <a
          href="/"
          className="flex items-center gap-2 rounded-md bg-white p-2 font-semibold shadow-sm"
        >
          <Cone className="h-6 w-6" />
          <span>ConeShare</span>
        </a>
      </div>
      {documentData && <PreviewViewer documentData={documentData} />}
    </div>
  );
}
