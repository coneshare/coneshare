import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

const getEventOptions = (t) => [
  { value: 'dataroom_opened', label: t('automations.eventDataroomOpened') },
  { value: 'document_viewed', label: t('automations.eventDocumentViewed') },
  { value: 'document_downloaded', label: t('automations.eventDocumentDownloaded') },
  { value: 'email_identified', label: t('automations.eventEmailIdentified') },
  { value: 'file_request_uploaded', label: t('automations.eventFileRequestUploaded') },
];

export function AutomationBuilder({
  destinations,
  shareLinks,
  datarooms,
  onScopeTypeChange = null,
  onSubmit,
  loading = false,
  initialValues = null,
  submitLabel = 'Create Automation',
  onCancel = null,
  title = 'Automation Rule',
  description = 'Define event triggers and route alerts to one or more destinations.',
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialValues?.name || '');
  const [scopeType, setScopeType] = useState(initialValues?.scope_type || 'global');
  const [shareLinkId, setShareLinkId] = useState(initialValues?.share_link || '');
  const [dataroomId, setDataroomId] = useState(initialValues?.dataroom || '');
  const [subscribedEvents, setSubscribedEvents] = useState(initialValues?.subscribed_events || ['document_viewed']);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState(initialValues?.destinations || []);

  const eventOptions = getEventOptions(t);

  useEffect(() => {
    if (!initialValues) return;
    setName(initialValues.name || '');
    setScopeType(initialValues.scope_type || 'global');
    setShareLinkId(initialValues.share_link || '');
    setDataroomId(initialValues.dataroom || '');
    setSubscribedEvents(initialValues.subscribed_events || ['document_viewed']);
    setSelectedDestinationIds(initialValues.destinations || []);
  }, [initialValues]);

  useEffect(() => {
    if (!onScopeTypeChange) return;
    onScopeTypeChange(scopeType);
  }, [scopeType, onScopeTypeChange]);

  useEffect(() => {
    if (scopeType === 'global') return;
    setSubscribedEvents((prev) => prev.filter((event) => event !== 'file_request_uploaded'));
  }, [scopeType]);

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (scopeType === 'share_link' && !shareLinkId) return false;
    if (scopeType === 'dataroom' && !dataroomId) return false;
    if (subscribedEvents.length === 0) return false;
    return selectedDestinationIds.length > 0;
  }, [name, scopeType, shareLinkId, dataroomId, subscribedEvents, selectedDestinationIds]);

  const toggleEvent = (eventValue) => {
    setSubscribedEvents((prev) =>
      prev.includes(eventValue)
        ? prev.filter((e) => e !== eventValue)
        : [...prev, eventValue]
    );
  };

  const toggleDestination = (destinationId) => {
    setSelectedDestinationIds((prev) =>
      prev.includes(destinationId)
        ? prev.filter((id) => id !== destinationId)
        : [...prev, destinationId]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      scope_type: scopeType,
      share_link: scopeType === 'share_link' ? shareLinkId : null,
      dataroom: scopeType === 'dataroom' ? dataroomId : null,
      subscribed_events: subscribedEvents,
      actions: [{ type: 'notify_destination' }],
      destinations: selectedDestinationIds,
      is_active: true,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      <div>
        <Label htmlFor="automation-name">{t('analytics.name')}</Label>
        <Input
          id="automation-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Investor Link Alerts"
          required
        />
      </div>

      <div>
        <Label htmlFor="scope-type">{t('analytics.scope')}</Label>
        <select
          id="scope-type"
          className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
          value={scopeType}
          onChange={(e) => setScopeType(e.target.value)}
        >
          <option value="global">{t('automations.scopeGlobal')}</option>
          <option value="share_link">{t('automations.scopeLink')}</option>
          <option value="dataroom">{t('automations.scopeDataroom')}</option>
        </select>
      </div>

      {scopeType === 'share_link' && (
        <div>
          <Label htmlFor="share-link">{t('shareLinks.title')}</Label>
          <select
            id="share-link"
            className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
            value={shareLinkId}
            onChange={(e) => setShareLinkId(e.target.value)}
            required
          >
            <option value="">{t('common.none')}</option>
            {shareLinks.map((link) => (
              <option key={link.id} value={link.id}>
                {link.name || 'Untitled Link'}
              </option>
            ))}
          </select>
        </div>
      )}

      {scopeType === 'dataroom' && (
        <div>
          <Label htmlFor="dataroom">{t('datarooms.title')}</Label>
          <select
            id="dataroom"
            className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
            value={dataroomId}
            onChange={(e) => setDataroomId(e.target.value)}
            required
          >
            <option value="">{t('common.none')}</option>
            {datarooms.map((dataroom) => (
              <option key={dataroom.id} value={dataroom.id}>
                {dataroom.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label>{t('automations.event')}</Label>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {eventOptions.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${
                option.value === 'file_request_uploaded' && scopeType !== 'global'
                  ? 'cursor-not-allowed opacity-50'
                  : ''
              }`}
            >
              <input
                type="checkbox"
                checked={subscribedEvents.includes(option.value)}
                disabled={option.value === 'file_request_uploaded' && scopeType !== 'global'}
                onChange={() => toggleEvent(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>{t('automations.destinations')}</Label>
          <span className="text-xs text-gray-500">
            Selected: {selectedDestinationIds.length}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {destinations.length === 0 && <p className="text-sm text-gray-500">{t('automations.createDestinationFirst')}</p>}
          {destinations.map((destination) => (
            <label key={destination.id} className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={selectedDestinationIds.includes(destination.id)}
                onChange={() => toggleDestination(destination.id)}
              />
              {destination.name} ({destination.destination_type})
            </label>
          ))}
        </div>
        {destinations.length > 0 && selectedDestinationIds.length === 0 && (
          <p className="mt-2 text-xs text-amber-700">{t('automations.selectDestinationWarning')}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSubmit || loading} className="w-full sm:w-auto">
          {loading ? t('common.saving') : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
