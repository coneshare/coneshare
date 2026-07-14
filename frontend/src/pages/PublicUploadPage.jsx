import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast, Toaster } from 'sonner';
import { UploadCloud, File as FileIcon, X, CheckCircle } from 'lucide-react';

import { getPublicFileRequest, requestPublicUpload, finalizePublicUpload } from '../services/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Progress } from '../components/ui/Progress';
import { Textarea } from '../components/ui/Textarea';
import { formatBytes } from '../lib/formatters';
import { cn } from '../lib/utils';
import { useBranding } from '../contexts/BrandingProvider';

const normalizeExtension = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return normalized.startsWith('.') ? normalized : `.${normalized}`;
};

const getAllowedExtensions = (allowedFileTypes) => {
  if (!Array.isArray(allowedFileTypes) || allowedFileTypes.length === 0) {
    return [];
  }
  return [...new Set(allowedFileTypes.map(normalizeExtension).filter(Boolean))];
};

const getFriendlyUploadError = (err) => {
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  const text = String(detail || '').toLowerCase();

  if (status === 400 && text.includes('security scan detected')) {
    return 'This file was blocked by our security scan. Please remove it and upload a different file.';
  }
  if (status === 503 && text.includes('security scanner')) {
    return 'Uploads are temporarily unavailable because the security scanner is offline. Please try again later.';
  }
  return detail || 'Upload failed.';
};

const isMissingRequiredCustomFieldValue = (field, value) => {
  // Required checkboxes model consent/confirmation, so unchecked is incomplete.
  if (field.type === 'checkbox') {
    return value !== true;
  }

  if (value === undefined || value === null) {
    return true;
  }

  // Match backend behavior by treating whitespace-only text as missing.
  if (typeof value === 'string') {
    return value.trim() === '';
  }

  return value === '';
};

export function PublicUploadPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const isEmbedMode = searchParams.get('embed') === '1';
  const { brandName, brandLogoUrl, brandWebsiteUrl, termsUrl, privacyPolicyUrl } = useBranding();
  const [fileRequest, setFileRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [files, setFiles] = useState([]);
  const [uploaderName, setUploaderName] = useState('');
  const [uploaderEmail, setUploaderEmail] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState({});
  const [customFieldErrors, setCustomFieldErrors] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadErrors, setUploadErrors] = useState({});
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const fetchRequestDetails = async () => {
      try {
        const response = await getPublicFileRequest(slug);
        setFileRequest(response.data);
      } catch (err) {
        setError(err.response?.data?.detail || 'This file request is not available.');
      } finally {
        setLoading(false);
      }
    };
    fetchRequestDetails();
  }, [slug]);

  useEffect(() => {
    if (fileRequest) {
      document.title = `${fileRequest.name} - ${brandName}`;
    }
  }, [fileRequest, brandName]);

  const addFiles = (newFiles) => {
    const incomingFiles = Array.from(newFiles);
    const allowedExtensions = getAllowedExtensions(fileRequest?.allowed_file_types);

    if (allowedExtensions.length === 0) {
      setFiles((prevFiles) => [...prevFiles, ...incomingFiles]);
      return;
    }

    const accepted = [];
    const rejected = [];
    for (const file of incomingFiles) {
      const normalizedName = String(file.name || '').trim().toLowerCase();
      const isAllowed = allowedExtensions.some((allowedExtension) => normalizedName.endsWith(allowedExtension));
      if (isAllowed) {
        accepted.push(file);
      } else {
        rejected.push(file.name);
      }
    }

    if (accepted.length > 0) {
      setFiles((prevFiles) => [...prevFiles, ...accepted]);
    }
    if (rejected.length > 0) {
      toast.error(`These files are not allowed: ${rejected.join(', ')}. Allowed types: ${allowedExtensions.join(', ')}`);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
  };

  const removeFile = (fileToRemove) => {
    const fileId = fileToRemove.name + fileToRemove.size;
    setUploadErrors((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    setFiles((prevFiles) => prevFiles.filter((file) => file !== fileToRemove));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please select at least one file to upload.');
      return;
    }
    if (!uploaderName || !uploaderEmail) {
      toast.error('Please enter your name and email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(uploaderEmail)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    const missingRequired = {};
    for (const field of fileRequest?.custom_fields || []) {
      const value = customFieldValues[field.id];
      if (field.required && isMissingRequiredCustomFieldValue(field, value)) {
        missingRequired[field.id] = field.type === 'checkbox'
          ? `${field.label} must be checked.`
          : `${field.label} is required.`;
      }
    }
    if (Object.keys(missingRequired).length > 0) {
      setCustomFieldErrors(missingRequired);
      toast.error('Please complete the required fields.');
      return;
    }

    setIsUploading(true);
    setUploadErrors({});
    setCustomFieldErrors({});

    const uploadPromises = files.map(async (file) => {
      const fileId = file.name + file.size;
      try {
        // Step 1: Request upload URL
        const requestRes = await requestPublicUpload(slug, {
          file_name: file.name,
          file_size: file.size,
        });
        const { upload_url, storage_key, unique_name } = requestRes.data;

        // Step 2: Upload file to file server
        await axios.put(upload_url, file, {
          headers: { 'Content-Type': file.type },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress((prev) => ({ ...prev, [fileId]: percentCompleted }));
          },
        });

        // Step 3: Finalize upload
        await finalizePublicUpload(slug, {
          storage_key,
          unique_name,
          file_size: file.size,
          content_type: file.type,
          uploader_name: uploaderName,
          uploader_email: uploaderEmail,
          custom_field_values: customFieldValues,
        });
        return { success: true };
      } catch (err) {
        const fieldErrors = err?.response?.data?.custom_field_values;
        if (fieldErrors && typeof fieldErrors === 'object') {
          setCustomFieldErrors(fieldErrors);
        }
        const errorMessage = getFriendlyUploadError(err);
        toast.error(`Error uploading ${file.name}: ${errorMessage}`);
        setUploadErrors((prev) => ({ ...prev, [fileId]: errorMessage }));
        setUploadProgress((prev) => ({ ...prev, [fileId]: 'error' }));
        return { success: false, error: errorMessage };
      }
    });

    const results = await Promise.all(uploadPromises);
    setIsUploading(false);
    
    const allSucceeded = results.every((result) => result.success);
    if (allSucceeded) {
      setUploadSuccess(true);
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (error) {
    return <div className="flex h-screen items-center justify-center text-red-500">{error}</div>;
  }

  const allowedExtensions = getAllowedExtensions(fileRequest?.allowed_file_types);
  const fileInputAccept = allowedExtensions.join(',');
  const customFields = Array.isArray(fileRequest?.custom_fields) ? fileRequest.custom_fields : [];

  const updateCustomFieldValue = (fieldId, value) => {
    setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
    setCustomFieldErrors((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const renderCustomField = (field) => {
    const fieldId = `custom-${field.id}`;
    const value = customFieldValues[field.id] ?? (field.type === 'checkbox' ? false : '');
    const errorText = customFieldErrors[field.id];

    return (
      <div key={field.id}>
        <Label htmlFor={fieldId}>
          {field.label}
          {field.required ? <span className="text-red-500"> *</span> : null}
        </Label>
        {field.type === 'textarea' ? (
          <Textarea
            id={fieldId}
            value={value}
            onChange={(e) => updateCustomFieldValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            disabled={isUploading}
            rows={3}
          />
        ) : field.type === 'select' ? (
          <select
            id={fieldId}
            value={value}
            onChange={(e) => updateCustomFieldValue(field.id, e.target.value)}
            disabled={isUploading}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select...</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : field.type === 'checkbox' ? (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              id={fieldId}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => updateCustomFieldValue(field.id, e.target.checked)}
              disabled={isUploading}
            />
            <span>{field.placeholder || field.label}</span>
          </label>
        ) : (
          <Input
            id={fieldId}
            type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
            value={value}
            onChange={(e) => updateCustomFieldValue(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            disabled={isUploading}
          />
        )}
        {errorText && <p className="mt-1 text-xs text-red-600">{errorText}</p>}
      </div>
    );
  };

  return (
    <div
      data-testid="public-upload-shell"
      className={cn(
        'flex flex-col items-center justify-center p-4',
        isEmbedMode ? 'min-h-0 bg-transparent p-2' : 'min-h-screen bg-gray-50 dark:bg-gray-900'
      )}
    >
      <Toaster richColors />
      <div className={cn('w-full max-w-lg rounded-2xl bg-white p-8 dark:bg-gray-800 border border-gray-100/80', !isEmbedMode && 'shadow-lg')}>
        {!isEmbedMode && (
          <div className="flex flex-col items-center justify-center mb-8">
            <div className="flex items-center gap-2">
              <img src={brandLogoUrl} alt={`${brandName} Logo`} className="h-8 w-8 object-contain" />
              <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">{brandName}</span>
            </div>
            <p className="mt-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Secure File Share
            </p>
          </div>
        )}

        {uploadSuccess ? (
          <div className="text-center py-6">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500 animate-scaleIn" />
            <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Upload Complete!</h1>
            <p className="mt-2 text-muted-foreground text-sm">Your files have been successfully submitted.</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                {fileRequest.owner_name || 'Someone'} has invited you to upload files for:
              </p>
              <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-white">
                {fileRequest.name}
              </h1>
              {fileRequest.message && (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed bg-gray-50/50 dark:bg-gray-900/10 p-3 rounded-lg border border-gray-100/50 dark:border-gray-800/40 text-left">
                  {fileRequest.message}
                </p>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="uploaderName">Your Name</Label>
                  <Input
                    id="uploaderName"
                    value={uploaderName}
                    onChange={(e) => setUploaderName(e.target.value)}
                    disabled={isUploading}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="uploaderEmail">Your Email</Label>
                  <Input
                    id="uploaderEmail"
                    type="email"
                    value={uploaderEmail}
                    onChange={(e) => setUploaderEmail(e.target.value)}
                    disabled={isUploading}
                    required
                  />
                </div>
              </div>

              {customFields.length > 0 && (
                <div className="space-y-4 rounded-md border p-3">
                  {customFields.map(renderCustomField)}
                </div>
              )}

              <div>
                <Label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Files
                </Label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    'mt-1 flex justify-center rounded-md border-2 border-dashed border-gray-300 px-6 pt-5 pb-6 transition-colors dark:border-gray-600',
                    isDragging && 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10'
                  )}
                >
                  <div className="space-y-1 text-center">
                    <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600 dark:text-gray-400">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer rounded-md bg-white font-medium text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:text-indigo-500 dark:bg-transparent"
                      >
                        <span>Choose files</span>
                        <input id="file-upload" name="file-upload" type="file" multiple accept={fileInputAccept || undefined} className="sr-only" onChange={handleFileChange} disabled={isUploading} />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    {fileRequest.max_file_size && (
                      <p className="text-xs text-gray-500">Max file size: {formatBytes(fileRequest.max_file_size)}</p>
                    )}
                    {allowedExtensions.length > 0 && (
                      <p className="text-xs text-gray-500">Allowed file types: {allowedExtensions.join(', ')}</p>
                    )}
                  </div>
                </div>
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((file, index) => {
                    const fileId = file.name + file.size;
                    const progress = uploadProgress[fileId];
                    return (
                      <div key={index} className="flex items-center gap-3 rounded-md border p-2">
                        <FileIcon className="h-6 w-6 text-gray-500" />
                        <div className="flex-1">
                          <p className="truncate text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                          {isUploading && progress !== 'error' && <Progress value={progress || 0} className="mt-1 h-1.5" />}
                          {progress === 'error' && <p className="text-xs text-red-500">{uploadErrors[fileId] || 'Upload failed'}</p>}
                        </div>
                        {!isUploading && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(file)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <Button onClick={handleUpload} disabled={isUploading || files.length === 0} className="w-full">
                {isUploading ? 'Uploading...' : `Upload ${files.length} File(s)`}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Footer Links */}
      {!isEmbedMode && (
        <div className="mt-6 flex flex-col items-center justify-center gap-2 text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <a
              href={brandWebsiteUrl || "https://www.coneshare.com/about"}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-600 transition-colors"
            >
              {brandWebsiteUrl ? `About ${brandName}` : "About Coneshare"}
            </a>
            <span className="text-gray-300">&bull;</span>
            <a
              href={termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-600 transition-colors"
            >
              Terms
            </a>
            <span className="text-gray-300">&bull;</span>
            <a
              href={privacyPolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-600 transition-colors"
            >
              Privacy Policy
            </a>
          </div>
          <div className="text-[11px] text-gray-400/80">
            Powered by <a href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-gray-700 dark:text-gray-100 dark:hover:text-gray-300 font-semibold underline transition-colors">Coneshare</a>
          </div>
        </div>
      )}
    </div>
  );
}
