export function DocumentHeader({ documentName }) {
  return (
    <div className="border-b border-gray-200 pb-5">
      <h1 className="text-2xl font-bold leading-6 text-gray-900">{documentName}</h1>
      {/* Action buttons like "Create Link" and "Preview" will go here */}
    </div>
  );
}
