import { useState, useRef, useEffect } from 'react';
import { DocumentsList } from "../components/documents/DocumentsList";
import { Button } from '../components/ui/Button';
import { Separator } from '../components/ui/Separator';
import { SearchBox } from '../components/SearchBox';
import { SortButton } from '../components/documents/filters/SortButton';
import { Pagination } from '../components/documents/Pagination';
import { ChevronDownIcon } from '../components/icons/ChevronDownIcon';
import { DocumentPlusIcon } from '../components/icons/DocumentPlusIcon';
import { FolderPlusIcon } from '../components/icons/FolderPlusIcon';
import { uploadDocument } from '../services/api';

// Mock data to simulate fetching from an API
const mockFolders = [
  { id: 'folder-1', name: 'Project Alpha', _count: { documents: 3 }, path: '/folder-1' },
  { id: 'folder-2', name: 'Marketing Materials', _count: { documents: 5 }, path: '/folder-2' },
];

const mockDocuments = [
  { id: 'doc-1', name: 'Q1 Report.pdf', links: [], _count: { links: 2, views: 15 } },
  { id: 'doc-2', name: 'Competitor Analysis.docx', links: [], _count: { links: 1, views: 7 } },
  { id: 'doc-3', name: 'Onboarding Presentation.pptx', links: [], _count: { links: 5, views: 42 } },
];

function DocumentsPage() {
  const loading = false;
  const foldersLoading = false;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

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
      try {
        const uploadPromises = Array.from(files).map((file) =>
          uploadDocument(file)
        );
        await Promise.all(uploadPromises);
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }
  };

  const onFolderChange = async (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      try {
        const uploadPromises = Array.from(files).map((file) => {
          const path = file.webkitRelativePath.substring(
            0,
            file.webkitRelativePath.lastIndexOf('/')
          );
          return uploadDocument(file, path);
        });
        await Promise.all(uploadPromises);
      } catch (error) {
        console.error('Folder upload failed:', error);
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
        folders={mockFolders}
        documents={mockDocuments}
        loading={loading}
        foldersLoading={foldersLoading}
      />

      {mockDocuments.length > 0 && (
        <Pagination />
      )}
    </div>
  );
}

export default DocumentsPage;
