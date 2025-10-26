import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShareIcon } from 'lucide-react';
import { getDataroom } from '../services/api';
import { Button } from '../components/ui/Button';
import { DocumentPlusIcon } from '../components/icons/DocumentPlusIcon';

export function DataroomPage() {
  const { dataroomId } = useParams();
  const [dataroom, setDataroom] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDataroom = async () => {
      setIsLoading(true);
      try {
        const response = await getDataroom(dataroomId);
        setDataroom(response.data);
      } catch (error) {
        // Error toast is handled by api interceptor, but might want to redirect on 404
      } finally {
        setIsLoading(false);
      }
    };
    fetchDataroom();
  }, [dataroomId]);

  if (isLoading) {
    return <div className="p-6">Loading dataroom...</div>;
  }

  if (!dataroom) {
    return <div className="p-6">Dataroom not found.</div>;
  }

  const hasContent = dataroom.documents.length > 0 || dataroom.folders.length > 0;

  return (
    <div className="container mx-auto p-4 md:p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{dataroom.name}</h1>
          {/* TODO: Add breadcrumbs here in the future */}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <DocumentPlusIcon className="mr-2 h-4 w-4" />
            Add Content
          </Button>
          <Button>
            <ShareIcon className="mr-2 h-4 w-4" />
            Create Link
          </Button>
        </div>
      </header>

      <main>
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/20 p-12 text-center">
            <h3 className="text-xl font-semibold tracking-tight">This dataroom is empty</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Add content to start sharing.
            </p>
            <Button className="mt-4" variant="outline">
              <DocumentPlusIcon className="mr-2 h-4 w-4" />
              Add Content
            </Button>
          </div>
        ) : (
          <div className="p-8 border-2 border-dashed border-muted rounded-lg text-center">
            <h2 className="text-xl font-medium">Dataroom Content</h2>
            <p className="text-muted-foreground mt-2">
              {dataroom.folders.length} folders, {dataroom.documents.length} documents.
            </p>
            {/* TODO: Implement file browser UI here */}
          </div>
        )}
      </main>
    </div>
  );
}
