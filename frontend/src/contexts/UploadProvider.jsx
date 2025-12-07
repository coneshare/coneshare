import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { v4 as uuidv4 } from 'uuid';

const UploadContext = createContext();

export function UploadProvider({ children }) {
  const [uploads, setUploads] = useState({});

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      const isUploading = Object.values(uploads).some(
        (upload) => upload.status === 'uploading'
      );
      if (isUploading) {
        event.preventDefault();
        event.returnValue = ''; // For legacy browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [uploads]);

  const addUploads = useCallback((files) => {
    const newUploads = {};
    const fileIdMap = new Map();

    Array.from(files).forEach(file => {
      const id = uuidv4();
      newUploads[id] = {
        id,
        file,
        status: 'uploading',
        progress: 0,
        error: null,
      };
      fileIdMap.set(file, id);
    });

    setUploads(prev => ({ ...prev, ...newUploads }));
    return fileIdMap;
  }, []);

  const updateUpload = useCallback((id, data) => {
    setUploads(prev => {
      if (!prev[id]) return prev;
      const updatedUploads = { ...prev };
      updatedUploads[id] = { ...updatedUploads[id], ...data };
      return updatedUploads;
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => {
      const activeUploads = {};
      Object.values(prev).forEach(upload => {
        if (upload.status === 'uploading') {
          activeUploads[upload.id] = upload;
        }
      });
      return activeUploads;
    });
  }, []);

  const value = useMemo(() => ({
    uploads,
    addUploads,
    updateUpload,
    clearCompleted,
  }), [uploads, addUploads, updateUpload, clearCompleted]);

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
}
