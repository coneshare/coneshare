import { Folder as FolderIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { ActionsDropdown } from "./ActionsDropdown";

function FolderCard({ folder, onRename, onDelete }) {
  return (
    <div className="group relative flex w-full items-center space-x-3 rounded-lg border bg-white px-4 py-5 shadow-sm hover:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-500">
      <div className="flex-shrink-0">
        <FolderIcon className="h-6 w-6 text-gray-400" />
      </div>
      <div className="min-w-0 flex-1">
        <Link to={`/documents/folders/${folder.id}`} className="focus:outline-none">
          <span className="absolute inset-0" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {folder.name}
          </p>
          <p className="truncate text-sm text-gray-500 dark:text-gray-400">
            Folder
          </p>
        </Link>
      </div>
      <ActionsDropdown
        item={folder}
        type="folder"
        onRename={onRename}
        onDelete={onDelete}
      />
    </div>
  );
}

export default FolderCard;
