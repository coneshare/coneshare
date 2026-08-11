import { useTranslation } from "react-i18next";
import { ChevronRight as ChevronRightIcon } from "lucide-react";
import { Link } from "react-router-dom";

export function Breadcrumbs({ currentFolder: data }) {
  const { t } = useTranslation();
  const { dataroomContext, documentName } = data || {};

  if (dataroomContext) {
    const { dataroom, folder } = dataroomContext;
    return (
      <nav className="flex" aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium text-muted-foreground sm:text-lg">
          <li>
            <Link to="/datarooms" className="hover:text-foreground">
              {t('datarooms.title')}
            </Link>
          </li>
          <li className="flex items-center">
            <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
            <Link to={`/datarooms/${dataroom.id}`} className="ml-2 hover:text-foreground">
              {dataroom.name}
            </Link>
          </li>
          {folder?.ancestors?.map((ancestor) => (
            <li key={ancestor.id} className="flex items-center">
              <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
              <Link to={`/datarooms/${dataroom.id}?folder=${ancestor.id}`} className="ml-2 hover:text-foreground">
                {ancestor.name}
              </Link>
            </li>
          ))}
          {folder && (
            <li className="flex items-center">
              <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
              {documentName ? (
                <Link to={`/datarooms/${dataroom.id}?folder=${folder.id}`} className="ml-2 hover:text-foreground">
                  {folder.name}
                </Link>
              ) : (
                <span className="ml-2 text-foreground">{folder.name}</span>
              )}
            </li>
          )}
          {documentName && (
            <li className="flex items-center">
              <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
              <span className="ml-2 text-foreground truncate max-w-xs">{documentName}</span>
            </li>
          )}          
        </ol>
      </nav>
    );
  }

  // Handle regular document/folder breadcrumbs
  const folder = data?.documentName ? data.folder : data;

  return (
    <nav className="flex" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium text-muted-foreground sm:text-lg">
        <li>
          <Link
            to="/documents"
            className="flex items-center gap-x-2 hover:text-foreground"
          >
            <span className="hidden sm:inline">{t('documents.title')}</span>
          </Link>
        </li>
        {folder?.ancestors?.map((ancestor) => (
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
        {folder && folder.name && folder.name !== '__root__' && (
          <li className="flex items-center">
            <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
            {documentName ? (
              <Link
                to={`/documents/folders/${folder.id}`}
                className="ml-2 hover:text-foreground"
              >
                {folder.name}
              </Link>
            ) : (
              <span className="ml-2 text-foreground">{folder.name}</span>
            )}
          </li>
        )}
        {documentName && (
          <li className="flex items-center">
            <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />
            <span className="ml-2 text-foreground truncate max-w-xs">{documentName}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}
