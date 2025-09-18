import { File as FileIcon } from "lucide-react";

export function EmptyDocuments() {
  return (
    <div className="mt-12 text-center">
      <FileIcon className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
        No documents
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Get started by uploading a document.
      </p>
    </div>
  );
}
