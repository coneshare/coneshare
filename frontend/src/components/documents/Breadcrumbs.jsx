import { ChevronRight as ChevronRightIcon, Home as HomeIcon } from "lucide-react";
import { Link } from "react-router-dom";

export function Breadcrumbs({ currentFolder }) {
  return (
    <nav className="flex" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium text-muted-foreground sm:text-lg">
        <li>
          <Link
            to="/documents"
            className="flex items-center gap-x-2 hover:text-foreground"
          >
            {/* <HomeIcon className="h-5 w-5 flex-shrink-0" /> */}
            <span className="hidden sm:inline">Documents</span>
          </Link>
        </li>
        {currentFolder?.ancestors?.map((ancestor) => (
          <li key={ancestor.id} className="flex items-center">
            <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
            <Link
              to={`/documents/folders/${ancestor.id}`}
              className="ml-2 hover:text-foreground"
            >
              {ancestor.name}
            </Link>
          </li>
        ))}
        {currentFolder && (
          <li className="flex items-center">
            <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
            <span className="ml-2 text-foreground">{currentFolder.name}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}
