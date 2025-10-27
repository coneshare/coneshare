import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShareIcon } from 'lucide-react';
import { toast } from 'sonner';
import { getDataroom, addContentToDataroom, createDataroomFolder, moveDataroomContent } from '../services/api';
import { Button } from '../components/ui/Button';
import { DocumentPlusIcon } from '../components/icons/DocumentPlusIcon';
import { FolderPlusIcon } from '../components/icons/FolderPlusIcon';
import { AddContentDialog } from '../components/dialogs/AddContentDialog';
import { AddFolderDialog } from '../components/dialogs/AddFolderDialog';
import { DataroomMoveItemsDialog } from '../components/dialogs/DataroomMoveItemsDialog';
import { DocumentsList } from '../components/documents/DocumentsList';
import { SelectionActionBar } from '../components/documents/SelectionActionBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';

export function DataroomPage() {
  const { dataroomId } = useParams();
  const navigate = useNavigate();
  const [dataroom, setDataroom] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddContentOpen, setIsAddContentOpen] = useState(false);
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false);
  const [isMoveItemsOpen, setIsMoveItemsOpen] = useState(false);
  const [selection, setSelection] = useState({ documents: [], folders: [] });
  const [lastSelectedItem, setLastSelectedItem] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: "name",
    direction: "ascending",
  });
  const [activeTab, setActiveTab] = useState('documents');

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
    // Reset selection when data re-fetches
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
  }, [dataroomId]);

  useEffect(() => {
    fetchDataroom();
  }, [fetchDataroom]);

  const allItems = useMemo(() => {
    if (!dataroom) return [];

    let combined = [
      ...(dataroom.folders || []).map(f => ({
        ...f,
        type: 'folder'
      })),
      ...(dataroom.documents || []).map(d => ({
        ...d,
        // Use dataroom_document_id for selection, document_id for navigation
        id: d.id, 
        document_id: d.document_id,
        name: d.document_name,
        type: 'document'
      }))
    ];

    combined.sort((a, b) => {
      // Folders always come first
      if (a.type === "folder" && b.type === "document") return -1;
      if (a.type === "document" && b.type === "folder") return 1;
      
      const dir = sortConfig.direction === "ascending" ? 1 : -1;
      const key = sortConfig.key;

      const aVal = a[key];
      const bVal = b[key];

      if (key === "updated_at") {
        return (new Date(aVal) - new Date(bVal)) * dir;
      }

      if (key === 'file_size') {
        return ((aVal || 0) - (bVal || 0)) * dir;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * dir;
      }
      
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;

      return 0;
    });

    return combined;
  }, [dataroom, sortConfig]);

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

  const handleCreateFolderInDataroom = async (name) => {
    try {
      await createDataroomFolder({
        name,
        dataroom: dataroomId,
        parent: null, // For now, only support creating root folders
      });
      toast.success(`Folder "${name}" created successfully.`);
      fetchDataroom(); // Refresh
    } catch (error) {
      // Toast is handled by api interceptor
    } finally {
      setIsAddFolderOpen(false);
    }
  };

  const handleItemClick = (item, type) => {
    if (type === 'folder') {
      toast.info("Navigating dataroom folders is not yet implemented.");
    } else {
      // For documents, we need the actual document_id for navigation
      navigate(`/documents/${item.document_id}`);
    }
  };

  const handleItemSelect = useCallback((id, type, event) => {
    setSelection((prev) => {
      const newSelection = { ...prev };
      const listKey = type === 'document' ? 'documents' : 'folders';
      const currentList = newSelection[listKey];
      
      if (currentList.includes(id)) {
        newSelection[listKey] = currentList.filter(itemId => itemId !== id);
      } else {
        newSelection[listKey] = [...currentList, id];
      }
      return newSelection;
    });
    setLastSelectedItem({ id, type });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
  }, []);

  const handleMoveItems = async (destinationFolderId) => {
    try {
      await moveDataroomContent(dataroomId, {
        dataroom_document_ids: selection.documents,
        dataroom_folder_ids: selection.folders,
        destination_folder_id: destinationFolderId,
      });
      toast.success("Items moved successfully.");
      fetchDataroom();
    } finally {
      setIsMoveItemsOpen(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === key) {
        return {
          ...prevConfig,
          direction:
            prevConfig.direction === "ascending" ? "descending" : "ascending",
        };
      }
      return { key, direction: "ascending" };
    });
  };

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
          {activeTab === 'documents' && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setIsAddFolderOpen(true)}
                title="Add Folder"
              >
                <FolderPlusIcon className="h-5 w-5" />
              </Button>
              <Button variant="outline" onClick={() => setIsAddContentOpen(true)}>
                <DocumentPlusIcon className="mr-2 h-4 w-4" />
                Add Content
              </Button>
            </>
          )}
          {activeTab === 'links' && (
            <Button>
              <ShareIcon className="mr-2 h-4 w-4" />
              Create Link
            </Button>
          )}
        </div>
      </header>

      <Tabs defaultValue="documents" onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="links">Links & Permissions</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="mt-6">
          {(selection.documents.length > 0 || selection.folders.length > 0) && (
            <div className="mb-4">
              <SelectionActionBar
                selectedDocumentsCount={selection.documents.length}
                selectedFoldersCount={selection.folders.length}
                onClearSelection={handleClearSelection}
                onMove={() => setIsMoveItemsOpen(true)}
                // Delete is a future feature for datarooms
                onDelete={null}
              />
            </div>
          )}
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
              isReadOnly={false}
              showActions={false}
              onItemClick={(id, type) => handleItemClick(allItems.find(item => item.id === id), type)}
              onItemSelect={handleItemSelect}
              selectedDocuments={selection.documents}
              selectedFolders={selection.folders}
              onSort={handleSort}
              sortConfig={sortConfig}
            />
          )}
        </TabsContent>
        <TabsContent value="links" className="mt-6">
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/20 p-12 text-center">
            <h3 className="text-xl font-semibold tracking-tight">Coming Soon</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage share links and granular permissions for this dataroom.
            </p>
          </div>
        </TabsContent>
      </Tabs>
      <AddContentDialog
        isOpen={isAddContentOpen}
        onOpenChange={setIsAddContentOpen}
        onConfirm={handleAddContent}
      />
      <AddFolderDialog
        isOpen={isAddFolderOpen}
        onOpenChange={setIsAddFolderOpen}
        onConfirm={handleCreateFolderInDataroom}
      />
      <DataroomMoveItemsDialog
        isOpen={isMoveItemsOpen}
        onOpenChange={setIsMoveItemsOpen}
        onConfirm={handleMoveItems}
        dataroomId={dataroomId}
        selectedFolderIds={selection.folders}
      />
    </div>
  );
}
