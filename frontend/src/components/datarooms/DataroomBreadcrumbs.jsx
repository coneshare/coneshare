import { ChevronRight } from 'lucide-react';

export function DataroomBreadcrumbs({ dataroomName, currentFolder, onNavigate }) {
  const path = currentFolder ? [...(currentFolder.ancestors || []), currentFolder] : [];

  const handleNavigate = (folderId) => {
    // Prevent re-navigating to the current folder
    if (folderId !== (currentFolder?.id || null)) {
      onNavigate(folderId);
    }
  };

  return (
    <nav className="flex items-center text-lg font-semibold" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        <li>
          <button
            onClick={() => handleNavigate(null)}
            className="hover:underline"
          >
            {dataroomName}
          </button>
        </li>
        {path.map((folder) => (
          <li key={folder.id}>
            <div className="flex items-center">
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-400" />
              <button
                onClick={() => handleNavigate(folder.id)}
                className="ml-2 hover:underline"
              >
                {folder.name}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}
