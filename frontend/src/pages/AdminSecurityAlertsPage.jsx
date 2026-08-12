import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminNav } from '../components/admin/AdminNav';
import { Select } from '../components/ui/Select';
import * as api from '../services/api';
import { formatBytes } from '../lib/formatters';

function DetailPanel({ event }) {
  const { t } = useTranslation();
  if (!event) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        {t('admin.selectAlertToViewDetails')}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 text-lg font-semibold">{t('admin.alertDetail')}</h3>
      <div className="space-y-1 text-sm">
        <div><span className="font-medium">{t('admin.idLabel')}:</span> {event.id}</div>
        <div><span className="font-medium">{t('admin.typeLabel')}:</span> {event.event_type}</div>
        <div><span className="font-medium">{t('admin.severityLabel')}:</span> {event.severity}</div>
        <div><span className="font-medium">{t('admin.statusLabel')}:</span> {event.status}</div>
        <div><span className="font-medium">{t('admin.requestLabel')}:</span> {event.file_request_slug}</div>
        <div><span className="font-medium">{t('admin.uploaderLabel')}:</span> {event.uploader_name} ({event.uploader_email})</div>
        <div><span className="font-medium">{t('admin.fileLabel')}:</span> {event.file_name}</div>
        <div><span className="font-medium">{t('admin.sizeLabel')}:</span> {typeof event.file_size === 'number' ? formatBytes(event.file_size) : '-'}</div>
        <div><span className="font-medium">{t('admin.contentTypeLabel')}:</span> {event.content_type || '-'}</div>
        <div><span className="font-medium">{t('admin.scannerLabel')}:</span> {event.scanner_engine}</div>
        <div><span className="font-medium">{t('admin.storageKeyLabel')}:</span> {event.storage_key || '-'}</div>
        <div><span className="font-medium">{t('admin.cleanupStatusLabel')}:</span> {event.storage_cleanup_status || '-'}</div>
        <div><span className="font-medium">{t('admin.cleanupTimeLabel')}:</span> {event.storage_cleanup_at ? new Date(event.storage_cleanup_at).toLocaleString() : '-'}</div>
        <div><span className="font-medium">{t('admin.createdLabel')}:</span> {new Date(event.created_at).toLocaleString()}</div>
        <div className="pt-2">
          <div className="font-medium">{t('admin.scannerMessage')}</div>
          <div className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{event.scanner_message || '-'}</div>
        </div>
        <div className="pt-2">
          <div className="font-medium">{t('admin.cleanupError')}</div>
          <div className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{event.storage_cleanup_error || '-'}</div>
        </div>
      </div>
    </div>
  );
}

export function AdminSecurityAlertsPage() {
  const { t } = useTranslation();
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
        <h2 className="text-2xl font-bold">{t('admin.securityAlerts')}</h2>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('admin.allStatus')}</option>
          <option value="new">{t('admin.statusNew')}</option>
          <option value="acknowledged">{t('admin.statusAcknowledged')}</option>
          <option value="resolved">{t('admin.statusResolved')}</option>
        </Select>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">{t('admin.allSeverity')}</option>
          <option value="high">{t('admin.severityHigh')}</option>
          <option value="medium">{t('admin.severityMedium')}</option>
        </Select>
        <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="">{t('admin.allEventTypes')}</option>
          <option value="malware_detected">{t('admin.malwareDetected')}</option>
          <option value="scan_failed">{t('admin.scanFailed')}</option>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border lg:col-span-2">
          <table className="min-w-full">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="p-3 text-left text-sm font-semibold">{t('admin.time')}</th>
                <th className="p-3 text-left text-sm font-semibold">{t('admin.type')}</th>
                <th className="p-3 text-left text-sm font-semibold">{t('admin.severity')}</th>
                <th className="p-3 text-left text-sm font-semibold">{t('analytics.status')}</th>
                <th className="p-3 text-left text-sm font-semibold">{t('admin.uploader')}</th>
                <th className="p-3 text-left text-sm font-semibold">{t('admin.file')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="p-4 text-sm text-muted-foreground" colSpan={6}>{t('common.loading')}</td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td className="p-4 text-sm text-muted-foreground" colSpan={6}>{t('admin.noSecurityAlertsFound')}</td>
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

export default AdminSecurityAlertsPage;
