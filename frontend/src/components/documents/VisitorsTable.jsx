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

function parseUserAgent(uaString) {
  if (!uaString) return { browser: 'N/A', os: 'N/A' };

  let browser = 'Unknown';
  let os = 'Unknown';

  // A very basic parser. A library like ua-parser-js would be more robust.
  if (uaString.includes('Windows')) os = 'Windows';
  else if (uaString.includes('Macintosh')) os = 'macOS';
  else if (uaString.includes('Linux')) os = 'Linux';
  else if (uaString.includes('Android')) os = 'Android';
  else if (uaString.includes('iPhone') || uaString.includes('iPad')) os = 'iOS';

  if (uaString.includes('Edg/')) browser = 'Edge';
  else if (uaString.includes('Chrome/') && !uaString.includes('Chromium')) browser = 'Chrome';
  else if (uaString.includes('Firefox/')) browser = 'Firefox';
  else if (uaString.includes('Safari/') && !uaString.includes('Chrome')) browser = 'Safari';

  return { browser, os };
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
              <TableHead>Location</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Viewed At</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Completion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {views.map((view) => {
              const { browser, os } = parseUserAgent(view.user_agent);
              return (
                <TableRow key={view.id}>
                  <TableCell className="font-medium">{view.viewer_email || 'Anonymous'}</TableCell>
                  <TableCell>{view.ip_address || 'N/A'}</TableCell>
                  <TableCell>{browser !== 'Unknown' ? `${browser} on ${os}` : 'N/A'}</TableCell>
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
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
