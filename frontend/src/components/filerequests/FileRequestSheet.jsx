import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { createFileRequest, updateFileRequest } from '../../services/api';

export function FileRequestSheet({ isOpen, onOpenChange, folder, currentRequest, onSuccess }) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();
  const isEditing = !!currentRequest;

  useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        const expiresAt = currentRequest.expires_at
          ? new Date(currentRequest.expires_at).toISOString().slice(0, 16)
          : '';
        reset({
          name: currentRequest.name || '',
          expires_at: expiresAt,
          max_file_size: currentRequest.max_file_size || '',
        });
      } else {
        reset({ name: '', expires_at: '', max_file_size: '' });
      }
    }
  }, [isOpen, isEditing, currentRequest, reset]);

  const onSubmit = async (data) => {
    try {
      const payload = {
        ...data,
        folder: folder.id,
        expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : null,
        max_file_size: data.max_file_size ? parseInt(data.max_file_size, 10) : null,
      };

      if (isEditing) {
        await updateFileRequest(currentRequest.id, payload);
        toast.success('File request updated successfully.');
      } else {
        await createFileRequest(payload);
        toast.success('File request created successfully.');
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'An error occurred.');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit File Request' : 'Create File Request'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Update the details for your file request.'
              : `Create a link to request files for the "${folder?.name}" folder.`}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">Name (Optional)</Label>
            <Input id="name" {...register('name')} placeholder="e.g., Q1 Financials from Client" />
          </div>
          <div>
            <Label htmlFor="expires_at">Expires At (Optional)</Label>
            <Input id="expires_at" type="datetime-local" {...register('expires_at')} />
          </div>
          <div>
            <Label htmlFor="max_file_size">Max File Size (Bytes, Optional)</Label>
            <Input id="max_file_size" type="number" {...register('max_file_size')} placeholder="e.g., 10485760 for 10MB" />
          </div>
          <SheetFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Link'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
