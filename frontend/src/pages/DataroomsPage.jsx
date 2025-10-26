import { Button } from '../components/ui/Button';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AddDataroomDialog } from '../components/datarooms/AddDataroomDialog';
import { PlusIcon } from '../components/icons/PlusIcon';
import { getDatarooms } from '../services/api';

export function DataroomsPage() {
  const [datarooms, setDatarooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDataroomOpen, setIsAddDataroomOpen] = useState(false);

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
            <Link
              key={dataroom.id}
              to={`/datarooms/${dataroom.id}`}
              className="block rounded-lg border bg-card text-card-foreground shadow-sm p-4 hover:bg-muted/50"
            >
              <h3 className="font-semibold">{dataroom.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Created on {new Date(datarooms.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}

      <AddDataroomDialog
        isOpen={isAddDataroomOpen}
        onOpenChange={setIsAddDataroomOpen}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
