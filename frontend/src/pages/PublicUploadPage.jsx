import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast, Toaster } from 'sonner';
import { UploadCloud, File as FileIcon, X, CheckCircle } from 'lucide-react';

import { getPublicFileRequest, requestPublicUpload, finalizePublicUpload } from '../services/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Progress } from '../components/ui/Progress';
import { formatBytes } from '../lib/formatters';

export function PublicUploadPage() {
  const { slug } = useParams();
  const [fileRequest, setFileRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [files, setFiles] = useState([]);
  const [uploaderName, setUploaderName] = useState('');
  const [uploaderEmail, setUploaderEmail] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadSuccess, setUploadSuccess] = useState(false);

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

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
  };

  const removeFile = (fileToRemove) => {
    setFiles((prevFiles) => prevFiles.filter((file) => file !== fileToRemove));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please select at least one file to upload.');
      return;
    }
    setIsUploading(true);

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
        });
        return { success: true };
      } catch (err) {
        const errorMessage = err.response?.data?.detail || 'Upload failed.';
        toast.error(`Error uploading ${file.name}: ${errorMessage}`);
        setUploadProgress((prev) => ({ ...prev, [fileId]: 'error' }));
        return { success: false, error: errorMessage };
      }
    });

    await Promise.all(uploadPromises);
    setIsUploading(false);
    setUploadSuccess(true);
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (error) {
    return <div className="flex h-screen items-center justify-center text-red-500">{error}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
      <Toaster richColors />
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
        {uploadSuccess ? (
          <div className="text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-2xl font-bold">Upload Complete!</h1>
            <p className="mt-2 text-muted-foreground">Your files have been successfully submitted.</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">
                {fileRequest.name || 'File Upload'}
              </h1>
              <p className="mt-2 text-muted-foreground">
                You have been invited to upload files.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="uploaderName">Your Name (Optional)</Label>
                  <Input
                    id="uploaderName"
                    value={uploaderName}
                    onChange={(e) => setUploaderName(e.target.value)}
                    disabled={isUploading}
                  />
                </div>
                <div>
                  <Label htmlFor="uploaderEmail">Your Email (Optional)</Label>
                  <Input
                    id="uploaderEmail"
                    type="email"
                    value={uploaderEmail}
                    onChange={(e) => setUploaderEmail(e.target.value)}
                    disabled={isUploading}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Files
                </Label>
                <div className="mt-1 flex justify-center rounded-md border-2 border-dashed border-gray-300 px-6 pt-5 pb-6 dark:border-gray-600">
                  <div className="space-y-1 text-center">
                    <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600 dark:text-gray-400">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer rounded-md bg-white font-medium text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:text-indigo-500 dark:bg-transparent"
                      >
                        <span>Choose files</span>
                        <input id="file-upload" name="file-upload" type="file" multiple className="sr-only" onChange={handleFileChange} disabled={isUploading} />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    {fileRequest.max_file_size && (
                      <p className="text-xs text-gray-500">Max file size: {formatBytes(fileRequest.max_file_size)}</p>
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
                          {progress === 'error' && <p className="text-xs text-red-500">Upload failed</p>}
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
    </div>
  );
}
