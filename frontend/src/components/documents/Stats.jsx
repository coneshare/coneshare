export function Stats({ views }) {
  const totalViews = views?.length || 0;

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-xl font-semibold">Analytics</h2>
      <p className="mt-4">Total Views: {totalViews}</p>
      {/* More stats will go here */}
    </div>
  );
}
