import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

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
import { Textarea } from '../ui/Textarea';
import { FolderBrowser } from '../documents/FolderBrowser';
import {
  createFileRequest,
  updateFileRequest,
  getRootFolderId,
} from '../../services/api';
import { ROOT_FOLDER_NAME } from '../../lib/constants';

const normalizeFileType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return normalized.startsWith('.') ? normalized : `.${normalized}`;
};

const parseAllowedFileTypes = (rawValue) => {
  if (!rawValue || !rawValue.trim()) return null;

  const normalized = rawValue
    .split(',')
    .map((item) => normalizeFileType(item))
    .filter(Boolean);

  if (normalized.length === 0) return null;
  return [...new Set(normalized)];
};

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Select' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'checkbox', label: 'Checkbox' },
];

const makeFieldId = () => `field_${Date.now().toString(36)}`;

const slugifyFieldLabel = (label) => {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'field';
};

const isGeneratedFieldId = (id) => /^field_[a-z0-9]+$/i.test(String(id || ''));

const uniqueFieldId = (baseId, usedIds) => {
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
};

const normalizeCustomFields = (fields) => {
  const usedIds = new Set();
  return fields
    .map((field) => {
      const label = String(field.label || '').trim();
      if (!label) return null;
      const baseId = isGeneratedFieldId(field.id) ? slugifyFieldLabel(label) : field.id;
      const normalized = {
        id: uniqueFieldId(baseId, usedIds),
        label,
        type: field.type || 'text',
        required: Boolean(field.required),
      };
      const placeholder = String(field.placeholder || '').trim();
      if (placeholder) normalized.placeholder = placeholder;
      if (normalized.type === 'select') {
        normalized.options = String(field.optionsText || '')
          .split(',')
          .map((option) => option.trim())
          .filter(Boolean);
      }
      return normalized;
    })
    .filter(Boolean);
};

const hydrateCustomFields = (fields) =>
  Array.isArray(fields)
    ? fields.map((field) => ({
        id: field.id || makeFieldId(),
        label: field.label || '',
        type: field.type || 'text',
        required: Boolean(field.required),
        placeholder: field.placeholder || '',
        optionsText: Array.isArray(field.options) ? field.options.join(', ') : '',
      }))
    : [];

export function FileRequestSheet({ isOpen, onOpenChange, folder, currentRequest, onSuccess }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxFileSize, setMaxFileSize] = useState('');
  const [allowedFileTypes, setAllowedFileTypes] = useState('');
  const [customFields, setCustomFields] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFolderLoading, setIsFolderLoading] = useState(true);
  const isEditing = !!currentRequest;

  // State for folder browser
  const [destinationFolder, setDestinationFolder] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        const expiresAtValue = currentRequest.expires_at
          ? new Date(currentRequest.expires_at).toISOString().slice(0, 16)
          : '';
        setName(currentRequest.name || '');
        setMessage(currentRequest.message || '');
        setExpiresAt(expiresAtValue);
        setMaxFileSize(currentRequest.max_file_size ? String(currentRequest.max_file_size / (1024 * 1024)) : '');
        setAllowedFileTypes(Array.isArray(currentRequest.allowed_file_types) ? currentRequest.allowed_file_types.join(', ') : '');
        setCustomFields(hydrateCustomFields(currentRequest.custom_fields));
      } else {
        // Reset for create mode
        setName('');
        setMessage('');
        setExpiresAt('');
        setMaxFileSize('');
        setAllowedFileTypes('');
        setCustomFields([]);
        setDestinationFolder(folder || null);
      }
      setIsFolderLoading(true);
    }
  }, [isOpen, isEditing, currentRequest, folder]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const folderId = destinationFolder?.id || (await getRootFolderId()).data.id;

      const payload = {
        name,
        message,
        folder: folderId,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        max_file_size: maxFileSize ? parseInt(maxFileSize, 10) * 1024 * 1024 : null,
        allowed_file_types: parseAllowedFileTypes(allowedFileTypes),
        custom_fields: normalizeCustomFields(customFields),
      };

      if (isEditing) {
        const response = await updateFileRequest(currentRequest.id, payload);
        toast.success('File request updated successfully.');
        onSuccess(response.data);
      } else {
        const response = await createFileRequest(payload);
        toast.success('File request created successfully.');
        onSuccess(response.data);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateCustomField = (id, changes) => {
    setCustomFields((prev) => prev.map((field) => (field.id === id ? { ...field, ...changes } : field)));
  };

  const addCustomField = () => {
    setCustomFields((prev) => [
      ...prev,
      {
        id: makeFieldId(),
        label: '',
        type: 'text',
        required: false,
        placeholder: '',
        optionsText: '',
      },
    ]);
  };

  const removeCustomField = (id) => {
    setCustomFields((prev) => prev.filter((field) => field.id !== id));
  };
  
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-3xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit File Request' : 'Create File Request'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? `Editing file request for folder "${currentRequest.folder_name === ROOT_FOLDER_NAME ? 'Root' : currentRequest.folder_name}".`
              : 'Create a link to request files. Select a destination folder and set your options.'}
          </SheetDescription>
        </SheetHeader>
        <form id="file-request-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="space-y-4 py-4 pr-6">
            <div className="space-y-2">
              <Label>Destination Folder</Label>
            <FolderBrowser
              initialFolderId={isEditing ? (currentRequest.folder_name === ROOT_FOLDER_NAME ? null : currentRequest.folder) : (folder?.id || null)}
              onCurrentFolderChange={setDestinationFolder}
              onLoadingChange={setIsFolderLoading}
            />
          </div>

          <div>
            <Label htmlFor="name">Name (Visible to public)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q1 Financials from Client"
            />
          </div>
          <div>
            <Label htmlFor="message">Message (Optional)</Label>
            <Input
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g., A short message to display on the upload page"
            />
          </div>
          <div>
            <Label htmlFor="expires_at">Expires At (Optional)</Label>
            <Input
              id="expires_at"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="max_file_size">Max File Size (MB, Optional)</Label>
            <Input
              id="max_file_size"
              type="number"
              value={maxFileSize}
              onChange={(e) => setMaxFileSize(e.target.value)}
              placeholder="e.g., 10 for 10MB"
            />
          </div>
          <div>
            <Label htmlFor="allowed_file_types">Allowed File Types (Optional)</Label>
            <Input
              id="allowed_file_types"
              value={allowedFileTypes}
              onChange={(e) => setAllowedFileTypes(e.target.value)}
              placeholder="e.g., .pdf, docx, xlsx"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Comma-separated extensions. Matching is case-insensitive and values are normalized (for example, `pdf` becomes `.pdf`).
            </p>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Custom Intake Fields</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Collect project, case, order, or document metadata from uploaders.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addCustomField}>
                <Plus className="mr-2 h-4 w-4" />
                Add Field
              </Button>
            </div>

            {customFields.length > 0 && (
              <div className="space-y-3">
                {customFields.map((field, index) => (
                  <div key={field.id} className="rounded-md border bg-muted/20 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Field {index + 1}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeCustomField(field.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`${field.id}-label`}>Label</Label>
                        <Input
                          id={`${field.id}-label`}
                          value={field.label}
                          onChange={(e) => updateCustomField(field.id, { label: e.target.value })}
                          placeholder="e.g., Case Number"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${field.id}-type`}>Type</Label>
                        <select
                          id={`${field.id}-type`}
                          value={field.type}
                          onChange={(e) => updateCustomField(field.id, { type: e.target.value })}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`${field.id}-placeholder`}>Placeholder</Label>
                        <Input
                          id={`${field.id}-placeholder`}
                          value={field.placeholder}
                          onChange={(e) => updateCustomField(field.id, { placeholder: e.target.value })}
                          placeholder="Optional"
                        />
                      </div>
                      <label className="flex items-center gap-2 pt-7 text-sm">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateCustomField(field.id, { required: e.target.checked })}
                        />
                        Required
                      </label>
                    </div>
                    {field.type === 'select' && (
                      <div className="mt-3">
                        <Label htmlFor={`${field.id}-options`}>Options</Label>
                        <Textarea
                          id={`${field.id}-options`}
                          value={field.optionsText}
                          onChange={(e) => updateCustomField(field.id, { optionsText: e.target.value })}
                          rows={2}
                          placeholder="Invoice, Contract, ID Document"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        </form>
        <SheetFooter>
          <Button type="submit" form="file-request-form" disabled={isSubmitting || isFolderLoading}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Link'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
