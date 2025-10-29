import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSortedList } from '../hooks/useSortedList';
import { useItemSelection } from '../hooks/useItemSelection';
import { ShareIcon } from 'lucide-react';
import { toast } from 'sonner';
import { getDataroom, addContentToDataroom, createDataroomFolder, moveDataroomContent, getDataroomFolderContents } from '../services/api';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
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
  const { setBreadcrumbData } = useBreadcrumb();
  const [dataroom, setDataroom] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddContentOpen, setIsAddContentOpen] = useState(false);
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false);
  const [isMoveItemsOpen, setIsMoveItemsOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [currentDataroomFolder, setCurrentDataroomFolder] = useState(null);
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [activeTab, setActiveTab] = useState('documents');

  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    try {
      let response;
      if (currentFolderId) {
        response = await getDataroomFolderContents(currentFolderId);
        setCurrentDataroomFolder(response.data);
        setFolders(response.data.sub_folders || []);
        setDocuments(response.data.documents || []);
      } else {
        response = await getDataroom(dataroomId);
        setDataroom(response.data); // This holds the dataroom's own metadata
        setCurrentDataroomFolder(null);
        setFolders(response.data.folders || []);
        setDocuments(response.data.documents || []);
      }
    } catch (error) {
      // Error toast is handled by api interceptor, but might want to redirect on 404
    } finally {
      setIsLoading(false);
    }
  }, [dataroomId, currentFolderId]);

  const unsortedItems = useMemo(() => {
    if (!dataroom) return [];

    return [
      ...(folders || []).map(f => ({
        ...f,
        type: 'folder'
      })),
      ...(documents || []).map(d => ({
        ...d,
        // Use dataroom_document_id for selection, document_id for navigation
        id: d.id, 
        document_id: d.document_id,
        name: d.document_name,
        type: 'document'
      }))
    ];
  }, [dataroom, folders, documents]);

  const { sortedItems: allItems, sortConfig, handleSort } = useSortedList(unsortedItems);
  const { selection, setSelection, setLastSelectedItem, handleItemSelect, handleClearSelection } = useItemSelection(allItems);

  useEffect(() => {
    // Reset selection when folder changes
    setSelection({ documents: [], folders: [] });
    setLastSelectedItem(null);
    fetchContent();

    return () => {
      setBreadcrumbData(null);
    };
  }, [fetchContent, setBreadcrumbData]);

  const handleBreadcrumbNavigate = useCallback((folderId) => {
    setCurrentFolderId(folderId);
  }, []);

  useEffect(() => {
    if (dataroom) {
      setBreadcrumbData({
        folder: currentDataroomFolder,
        dataroomName: dataroom.name,
        onNavigate: handleBreadcrumbNavigate,
      });
    }
  }, [dataroom, currentDataroomFolder, setBreadcrumbData, handleBreadcrumbNavigate]);

  const handleAddContent = async ({ document_ids, folder_ids }) => {
    try {
      await addContentToDataroom(dataroomId, { document_ids, folder_ids });
      toast.success('Content added to dataroom successfully.');
      fetchContent(); // Refresh
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
        parent: currentFolderId,
      });
      toast.success(`Folder "${name}" created successfully.`);
      fetchContent(); // Refresh
    } catch (error) {
      // Toast is handled by api interceptor
    } finally {
      setIsAddFolderOpen(false);
    }
  };

  const handleItemClick = (item, type) => {
    if (type === 'folder') {
      setCurrentFolderId(item.id);
    } else {
      // For documents, we need the actual document_id for navigation
      navigate(`/documents/${item.document_id}`);
    }
  };


  const handleMoveItems = async (destinationFolderId) => {
    try {
      await moveDataroomContent(dataroomId, {
        dataroom_document_ids: selection.documents,
        dataroom_folder_ids: selection.folders,
        destination_folder_id: destinationFolderId,
      });
      toast.success("Items moved successfully.");
      fetchContent();
    } finally {
      setIsMoveItemsOpen(false);
    }
  };


  if (isLoading) {
    return <div className="p-6">Loading dataroom...</div>;
  }

  if (!dataroom) {
    return <div className="p-6">Dataroom not found.</div>;
  }

  const hasContent = documents.length > 0 || folders.length > 0;

  return (
    <div className="container mx-auto p-4 md:p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{dataroom.name}</h1>
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

      <Tabs defaultValue="documents" onValueChange={setActiveTab} className="mt-4">
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
              <h3 className="text-xl font-semibold tracking-tight">
                {currentDataroomFolder ? 'This folder is empty' : 'This dataroom is empty'}
              </h3>
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
              onItemClick={handleItemClick}
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
