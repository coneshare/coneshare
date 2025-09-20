import { useState, useRef, useEffect } from 'react';
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
import { uploadDocument, getDocuments, getFolders } from '../services/api';

function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
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
    setIsDropdownOpen(false); // Close dropdown after click
  };

  const handleFileSelect = () => {
    fileInputRef.current.click();
    setIsDropdownOpen(false); // Close dropdown after click
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
      const uploadPromises = Array.from(files).map((file) => {
        const path = file.webkitRelativePath.substring(
          0,
          file.webkitRelativePath.lastIndexOf('/')
        );
        return uploadDocument(file, path);
      });
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
        <div className="relative flex items-center gap-x-2" ref={dropdownRef}>
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
          <Button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="group flex items-center justify-center gap-x-1 whitespace-nowrap px-3 text-left sm:gap-x-2"
            title="Upload"
          >
            <span className="text-xs sm:text-base">Upload</span>
            <ChevronDownIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Button>

          {isDropdownOpen && (
            <div className="absolute right-0 top-full z-10 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800">
              <div className="py-1">
                <button
                  onClick={handleFileSelect}
                  className="flex w-full items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 hover:dark:bg-gray-700"
                >
                  <DocumentPlusIcon className="h-5 w-5" aria-hidden="true" />
                  <span>Files</span>
                </button>
                <button
                  onClick={handleFolderSelect}
                  className="flex w-full items-center gap-x-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 hover:dark:bg-gray-700"
                >
                  <FolderPlusIcon className="h-5 w-5" aria-hidden="true" />
                  <span>Folder</span>
                </button>
              </div>
            </div>
          )}
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
      />

      {documents.length > 0 && (
        <Pagination />
      )}
    </div>
  );
}

export default DocumentsPage;
