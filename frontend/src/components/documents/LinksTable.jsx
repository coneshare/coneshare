export function LinksTable({ links }) {
  if (!links || links.length === 0) {
    return <p>No share links have been created for this document.</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-semibold">Share Links</h2>
      {/* A table rendering the links will go here */}
      <pre className="mt-2 rounded-lg bg-gray-100 p-4 text-sm">
        {JSON.stringify(links, null, 2)}
      </pre>
    </div>
  );
}
