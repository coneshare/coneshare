import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useState } from 'react';
import { toast } from 'sonner';
import { createDataroom } from '@/services/api';

export function AddDataroomDialog({ isOpen, onOpenChange, onSuccess }) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Dataroom name cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    try {
      await createDataroom({ name });
      toast.success('Dataroom created successfully.');
      onSuccess();
      setName('');
    } catch (error) {
      // Toast is handled by api interceptor
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Dataroom</DialogTitle>
          <DialogDescription>
            Create a new dataroom to group and share documents.
          </DialogDescription>
        </DialogHeader>
        <form
          id="add-dataroom-form"
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        >
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                placeholder="e.g., Project Alpha"
                disabled={isSubmitting}
                autoFocus
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="add-dataroom-form" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Dataroom'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
