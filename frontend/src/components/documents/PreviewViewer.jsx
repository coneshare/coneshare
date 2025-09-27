export function PreviewViewer({ documentData }) {
  return (
    <div className="h-full space-y-4 overflow-y-auto rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
      {documentData.pages.map((page) => (
        <img
          key={page.page_number}
          src={page.file}
          alt={`Page ${page.page_number}`}
          className="mx-auto max-w-full rounded-md shadow-md"
        />
      ))}
    </div>
  );
}
