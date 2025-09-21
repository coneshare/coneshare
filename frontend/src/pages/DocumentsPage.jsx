import { useState, useRef, useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { DocumentsList } from "../components/documents/DocumentsList";
import { Button } from '../components/ui/Button';
import { Separator } from '../components/ui/Separator';
import { SearchBox } from '../components/SearchBox';
import { SortButton } from '../components/documents/filters/SortButton';
import { Pagination } from '../components/documents/Pagination';
import { Toaster } from 'sonner';
import { ChevronDownIcon } from '../components/icons/ChevronDownIcon';
import { DocumentPlusIcon } from '../components/icons/DocumentPlusIcon';
import { FolderPlusIcon } from '../components/icons/FolderPlusIcon';
import { uploadDocument, getDocuments, getFolders, createFolderFromPath } from '../services/api';

function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    setFoldersLoading(true);
    try {
      const [docsResponse, foldersResponse] = await Promise.all([
        getDocuments(),
        getFolders(),
      ]);
      setDocuments(docsResponse.data);
      setFolders(foldersResponse.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
      setFoldersLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFolderSelect = () => {
    folderInputRef.current.click();
  };

  const handleFileSelect = () => {
    fileInputRef.current.click();
  };

  const onFileChange = async (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      const uploadPromises = Array.from(files).map((file) =>
        uploadDocument(file)
      );
      const results = await Promise.allSettled(uploadPromises);

      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) {
        console.error(`${failedCount} file(s) failed to upload.`);
      }

      if (results.some(r => r.status === 'fulfilled')) {
        fetchData();
      }
    }
  };

  const onFolderChange = async (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      // 1. Determine the unique folder paths that need to be created.
      const paths = new Set();
      Array.from(files).forEach((file) => {
        const folderPath = file.webkitRelativePath.substring(
          0,
          file.webkitRelativePath.lastIndexOf('/')
        );
        if (folderPath) {
          paths.add(folderPath);
        }
      });

      // 2. Call the new endpoint to ensure all folder paths exist.
      try {
        // This can be a Promise.all for performance if multiple root folders are selected,
        // but for a single folder selection, a loop is clear and safe.
        for (const path of paths) {
          await createFolderFromPath(path);
        }
      } catch (error) {
        console.error("Failed to create folder structure:", error);
        // The API interceptor will show a toast, so we just log and stop.
        return;
      }

      // 3. Proceed with concurrent file uploads now that folders are guaranteed to exist.
      const uploadPromises = Array.from(files).map((file) => {
        return uploadDocument(file, file.webkitRelativePath);
      });
      const results = await Promise.allSettled(uploadPromises);

      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount > 0) {
        console.error(`${failedCount} file(s) failed to upload.`);
      }

      if (results.some((r) => r.status === 'fulfilled')) {
        fetchData();
      }
    }
  };


  return (
    <div className="sticky top-0 mb-4 rounded-lg bg-white p-4 dark:bg-gray-900 sm:mx-4 sm:pt-8">
      <Toaster richColors />
      <section className="mb-4 flex items-center justify-between space-x-2 sm:space-x-0">
        <div className="space-y-0 sm:space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            All Documents
          </h2>
          <p className="text-xs leading-4 text-muted-foreground sm:text-sm sm:leading-none">
            Manage all your documents in one place.
          </p>
        </div>
        <div className="relative flex items-center gap-x-2">
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={onFileChange}
            className="hidden"
          />
          <input
            type="file"
            ref={folderInputRef}
            onChange={onFolderChange}
            className="hidden"
            webkitdirectory=""
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                className="group flex items-center justify-center gap-x-1 whitespace-nowrap px-3 text-left sm:gap-x-2"
                title="Upload"
              >
                <span className="text-xs sm:text-base">Upload</span>
                <ChevronDownIcon
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              className="w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800"
              sideOffset={8}
            >
              <DropdownMenu.Item
                onSelect={handleFileSelect}
                className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
              >
                <DocumentPlusIcon className="h-5 w-5" aria-hidden="true" />
                <span>Files</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={handleFolderSelect}
                className="flex w-full cursor-pointer items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
              >
                <FolderPlusIcon className="h-5 w-5" aria-hidden="true" />
                <span>Folder</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </section>

      {/* <div className="mb-2 flex justify-end gap-x-2"> */}
      {/*   <div className="relative w-full sm:max-w-xs"> */}
      {/*     <SearchBox loading={loading} inputClassName="h-10" /> */}
      {/*   </div> */}
      {/*   <SortButton /> */}
      {/* </div> */}

      <div id="documents-header-count"></div>

      <Separator className="mb-5 bg-gray-200 dark:bg-gray-800" />

      <DocumentsList
        folders={folders}
        documents={documents}
        loading={loading}
        foldersLoading={foldersLoading}
        onDataRefresh={fetchData}
      />

      {documents.length > 0 && (
        <Pagination />
      )}
    </div>
  );
}

export default DocumentsPage;
