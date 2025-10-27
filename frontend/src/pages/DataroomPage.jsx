import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShareIcon } from 'lucide-react';
import { toast } from 'sonner';
import { getDataroom, addContentToDataroom } from '../services/api';
import { Button } from '../components/ui/Button';
import { DocumentPlusIcon } from '../components/icons/DocumentPlusIcon';
import { AddContentDialog } from '../components/dialogs/AddContentDialog';
import { DocumentsList } from '../components/documents/DocumentsList';

export function DataroomPage() {
  const { dataroomId } = useParams();
  const navigate = useNavigate();
  const [dataroom, setDataroom] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddContentOpen, setIsAddContentOpen] = useState(false);

  const fetchDataroom = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getDataroom(dataroomId);
      setDataroom(response.data);
    } catch (error) {
      // Error toast is handled by api interceptor, but might want to redirect on 404
    } finally {
      setIsLoading(false);
    }
  }, [dataroomId]);

  useEffect(() => {
    fetchDataroom();
  }, [fetchDataroom]);

  const allItems = useMemo(() => {
    if (!dataroom) return [];

    const folders = (dataroom.folders || []).map(f => ({
      ...f,
      type: 'folder'
    }));
    const documents = (dataroom.documents || []).map(d => ({
      ...d,
      id: d.document_id,
      name: d.document_name,
      type: 'document'
    }));
    return [...folders, ...documents];
  }, [dataroom]);

  if (isLoading) {
    return <div className="p-6">Loading dataroom...</div>;
  }

  if (!dataroom) {
    return <div className="p-6">Dataroom not found.</div>;
  }

  const handleAddContent = async ({ document_ids, folder_ids }) => {
    try {
      await addContentToDataroom(dataroomId, { document_ids, folder_ids });
      toast.success('Content added to dataroom successfully.');
      fetchDataroom(); // Refresh
    } catch (error) {
      // Toast is handled by api interceptor
    } finally {
      setIsAddContentOpen(false);
    }
  };

  const handleItemClick = (id, type) => {
    if (type === 'folder') {
      toast.info("Navigating dataroom folders is not yet implemented.");
    } else {
      navigate(`/documents/${id}`);
    }
  };

  const hasContent = dataroom.documents.length > 0 || dataroom.folders.length > 0;

  return (
    <div className="container mx-auto p-4 md:p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{dataroom.name}</h1>
          {/* TODO: Add breadcrumbs here in the future */}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsAddContentOpen(true)}>
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
              A Dataroom is a place to securely organize and share documents with granular access control.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => setIsAddContentOpen(true)}>
              <DocumentPlusIcon className="mr-2 h-4 w-4" />
              Add Content
            </Button>
          </div>
        ) : (
          <DocumentsList
            allItems={allItems}
            loading={isLoading}
            isReadOnly={true}
            onItemClick={handleItemClick}
          />
        )}
      </main>
      <AddContentDialog
        isOpen={isAddContentOpen}
        onOpenChange={setIsAddContentOpen}
        onConfirm={handleAddContent}
      />
    </div>
  );
}
