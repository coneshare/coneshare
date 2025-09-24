import { UploadCloud as UploadIcon } from "lucide-react";

export function EmptyDocuments() {
  return (
    <div className="py-24 text-center">
      <UploadIcon className="mx-auto h-16 w-16 text-gray-400" />
      <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">
        No documents yet
      </h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Get started by uploading a document.
      </p>
    </div>
  );
}
