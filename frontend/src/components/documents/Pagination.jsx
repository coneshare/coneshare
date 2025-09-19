// Placeholder for Pagination component
export function Pagination() {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="text-sm text-muted-foreground">
        Showing <strong>1-3</strong> of <strong>3</strong> documents.
      </div>
      <div className="flex items-center space-x-2">
        <button className="px-2 py-1 border rounded" disabled>Previous</button>
        <button className="px-2 py-1 border rounded" disabled>Next</button>
      </div>
    </div>
  );
}
