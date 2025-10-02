import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/Table';

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function VisitorsTable({ views }) {
  if (!views || views.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-semibold">Visitors</h2>
        <div className="mt-4 rounded-lg border px-4 py-8 text-center">
          <p className="text-muted-foreground">This document has not been viewed yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold">Visitors</h2>
      <div className="mt-4 overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Visitor</TableHead>
              <TableHead>Viewed At</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Completion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {views.map((view) => (
              <TableRow key={view.id}>
                <TableCell className="font-medium">{view.viewer_email || 'Anonymous'}</TableCell>
                <TableCell>
                  {new Date(view.viewed_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </TableCell>
                <TableCell className="text-right">{formatDuration(view.duration_seconds)}</TableCell>
                <TableCell className="text-right">
                  {`${(view.completion_rate * 100).toFixed(0)}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
