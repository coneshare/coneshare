export function VisitorsTable({ views }) {
  if (!views || views.length === 0) {
    return <p>This document has not been viewed yet.</p>;
  }

  return (
    <div>
      <h2 className="text-xl font-semibold">Visitors</h2>
      {/* A table rendering the views/visitors will go here */}
      <pre className="mt-2 rounded-lg bg-gray-100 p-4 text-sm">
        {JSON.stringify(views, null, 2)}
      </pre>
    </div>
  );
}
