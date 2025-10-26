import { Button } from '../components/ui/Button';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AddDataroomDialog } from '../components/datarooms/AddDataroomDialog';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { RenameItemDialog } from '../components/dialogs/RenameItemDialog';
import { PlusIcon } from '../components/icons/PlusIcon';
import { getDatarooms, updateDataroom, deleteDataroom } from '../services/api';

export function DataroomsPage() {
  const [datarooms, setDatarooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDataroomOpen, setIsAddDataroomOpen] = useState(false);
  const [dataroomToDelete, setDataroomToDelete] = useState(null);
  const [dataroomToRename, setDataroomToRename] = useState(null);
  const navigate = useNavigate();

  const fetchDatarooms = async () => {
    setIsLoading(true);
    try {
      const response = await getDatarooms();
      setDatarooms(response.data);
    } catch (error) {
      // Error toast is handled by api interceptor
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDatarooms();
  }, []);

  const handleSuccess = () => {
    setIsAddDataroomOpen(false);
    fetchDatarooms();
  };

  const handleDeleteDataroom = async () => {
    if (!dataroomToDelete) return;
    try {
      await deleteDataroom(dataroomToDelete.id);
      toast.success(`Dataroom "${dataroomToDelete.name}" deleted successfully.`);
      fetchDatarooms();
    } finally {
      setDataroomToDelete(null);
    }
  };

  const handleRenameDataroom = async (newName) => {
    if (!dataroomToRename) return;
    try {
      await updateDataroom(dataroomToRename.id, { name: newName });
      toast.success(`Dataroom renamed to "${newName}".`);
      fetchDatarooms();
    } finally {
      setDataroomToRename(null);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Datarooms</h1>
        <Button onClick={() => setIsAddDataroomOpen(true)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Dataroom
        </Button>
      </div>

      {isLoading ? (
        <p>Loading datarooms...</p>
      ) : datarooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/20 p-12 text-center">
          <h3 className="text-xl font-semibold tracking-tight">No datarooms found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Get started by creating your first dataroom.
          </p>
          <Button className="mt-4" onClick={() => setIsAddDataroomOpen(true)}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add Dataroom
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {datarooms.map((dataroom) => (
            <div
              key={dataroom.id}
              className="group relative cursor-pointer rounded-lg border bg-card p-4 text-card-foreground shadow-sm hover:bg-muted/50"
              onClick={() => navigate(`/datarooms/${dataroom.id}`)}
            >
              <div className="absolute right-1 top-1 z-10">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content
                    className="z-50 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800"
                    sideOffset={5}
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu.Item
                      onClick={() => setDataroomToRename(dataroom)}
                      className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      <span>Rename</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onClick={() => toast.info('Share functionality coming soon!')}
                      className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      <span>Share</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                    <DropdownMenu.Item
                      onClick={() => setDataroomToDelete(dataroom)}
                      className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none dark:text-red-400 hover:dark:bg-red-900/50 focus:dark:bg-red-900/50"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Delete</span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
              <h3 className="font-semibold pr-8">{dataroom.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Created on {new Date(dataroom.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      <AddDataroomDialog
        isOpen={isAddDataroomOpen}
        onOpenChange={setIsAddDataroomOpen}
        onSuccess={handleSuccess}
      />
      <ConfirmationDialog
        isOpen={!!dataroomToDelete}
        onOpenChange={() => setDataroomToDelete(null)}
        title={`Delete "${dataroomToDelete?.name}"?`}
        description="This action cannot be undone. This will permanently delete the dataroom and all its contents."
        onConfirm={handleDeleteDataroom}
        confirmText="Delete"
      />
      <RenameItemDialog
        isOpen={!!dataroomToRename}
        onOpenChange={() => setDataroomToRename(null)}
        onConfirm={handleRenameDataroom}
        itemType="Dataroom"
        currentItem={dataroomToRename}
      />
    </div>
  );
}
