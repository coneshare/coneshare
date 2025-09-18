import { File as FileIcon } from "lucide-react";
import { Link } from "react-router-dom";

function DocumentCard({ document }) {
  return (
    <div className="relative flex w-full items-center space-x-3 rounded-lg border bg-white px-4 py-5 shadow-sm hover:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-500">
      <div className="flex-shrink-0">
        <FileIcon className="h-6 w-6 text-gray-400" />
      </div>
      <div className="min-w-0 flex-1">
        <Link to={`/documents/${document.id}`} className="focus:outline-none">
          <span className="absolute inset-0" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {document.name}
          </p>
          <p className="truncate text-sm text-gray-500 dark:text-gray-400">
            {document._count.links} Links · {document._count.views} Views
          </p>
        </Link>
      </div>
    </div>
  );
}

export default DocumentCard;
