import { useEffect, useState } from 'react';
import { AdminNav } from '../components/admin/AdminNav';
import { Select } from '../components/ui/Select';
import * as api from '../services/api';
import { formatBytes } from '../lib/formatters';

function DetailPanel({ event }) {
  if (!event) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Select an alert to view details.
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 text-lg font-semibold">Alert Detail</h3>
      <div className="space-y-1 text-sm">
        <div><span className="font-medium">ID:</span> {event.id}</div>
        <div><span className="font-medium">Type:</span> {event.event_type}</div>
        <div><span className="font-medium">Severity:</span> {event.severity}</div>
        <div><span className="font-medium">Status:</span> {event.status}</div>
        <div><span className="font-medium">Request:</span> {event.file_request_slug}</div>
        <div><span className="font-medium">Uploader:</span> {event.uploader_name} ({event.uploader_email})</div>
        <div><span className="font-medium">File:</span> {event.file_name}</div>
        <div><span className="font-medium">Size:</span> {typeof event.file_size === 'number' ? formatBytes(event.file_size) : '-'}</div>
        <div><span className="font-medium">Content Type:</span> {event.content_type || '-'}</div>
        <div><span className="font-medium">Scanner:</span> {event.scanner_engine}</div>
        <div><span className="font-medium">Storage Key:</span> {event.storage_key || '-'}</div>
        <div><span className="font-medium">Cleanup Status:</span> {event.storage_cleanup_status || '-'}</div>
        <div><span className="font-medium">Cleanup Time:</span> {event.storage_cleanup_at ? new Date(event.storage_cleanup_at).toLocaleString() : '-'}</div>
        <div><span className="font-medium">Created:</span> {new Date(event.created_at).toLocaleString()}</div>
        <div className="pt-2">
          <div className="font-medium">Scanner Message</div>
          <div className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{event.scanner_message || '-'}</div>
        </div>
        <div className="pt-2">
          <div className="font-medium">Cleanup Error</div>
          <div className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{event.storage_cleanup_error || '-'}</div>
        </div>
      </div>
    </div>
  );
}

export function AdminSecurityAlertsPage() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [eventType, setEventType] = useState('');

  useEffect(() => {
    const fetchEvents = async () => {
      setIsLoading(true);
      try {
        const response = await api.getAdminSecurityThreatEvents({ status, severity, eventType });
        const rows = response.data.results || [];
        setEvents(rows);
        setSelectedEvent((current) => rows.find((row) => row.id === current?.id) || rows[0] || null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, [status, severity, eventType]);

  return (
    <div className="container mx-auto py-6">
      <AdminNav />
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Security Alerts</h2>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </Select>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All Severity</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </Select>
        <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="">All Event Types</option>
          <option value="malware_detected">Malware Detected</option>
          <option value="scan_failed">Scan Failed</option>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border lg:col-span-2">
          <table className="min-w-full">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="p-3 text-left text-sm font-semibold">Time</th>
                <th className="p-3 text-left text-sm font-semibold">Type</th>
                <th className="p-3 text-left text-sm font-semibold">Severity</th>
                <th className="p-3 text-left text-sm font-semibold">Status</th>
                <th className="p-3 text-left text-sm font-semibold">Uploader</th>
                <th className="p-3 text-left text-sm font-semibold">File</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="p-4 text-sm text-muted-foreground" colSpan={6}>Loading alerts...</td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td className="p-4 text-sm text-muted-foreground" colSpan={6}>No security alerts found.</td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr
                    key={event.id}
                    className={`cursor-pointer border-b ${selectedEvent?.id === event.id ? 'bg-muted/50' : ''}`}
                    onClick={() => setSelectedEvent(event)}
                  >
                    <td className="p-3 text-sm">{new Date(event.created_at).toLocaleString()}</td>
                    <td className="p-3 text-sm">{event.event_type}</td>
                    <td className="p-3 text-sm">{event.severity}</td>
                    <td className="p-3 text-sm">{event.status}</td>
                    <td className="p-3 text-sm">{event.uploader_email || '-'}</td>
                    <td className="p-3 text-sm">{event.file_name || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <DetailPanel event={selectedEvent} />
      </div>
    </div>
  );
}
