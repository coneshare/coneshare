import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';

export function DestinationForm({
  onSubmit,
  loading = false,
  initialValues = null,
  submitLabel = 'Save Destination',
  onCancel = null,
  title = 'Create Destination',
  description = 'Destinations receive automation events via generic webhook, Slack, WeChat Work, FeiShu, or Discord webhook.',
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialValues?.name || '');
  const [destinationType, setDestinationType] = useState(initialValues?.destination_type || 'slack');
  const [endpointUrl, setEndpointUrl] = useState(initialValues?.endpoint_url || '');
  const [httpMethod, setHttpMethod] = useState(initialValues?.http_method || 'POST');
  const [signingSecret, setSigningSecret] = useState('');

  useEffect(() => {
    if (!initialValues) return;
    setName(initialValues.name || '');
    setDestinationType(initialValues.destination_type || 'slack');
    setEndpointUrl(initialValues.endpoint_url || '');
    setHttpMethod(initialValues.http_method || 'POST');
    setSigningSecret('');
  }, [initialValues]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name,
      destination_type: destinationType,
      endpoint_url: endpointUrl,
      http_method: httpMethod,
      signing_secret: signingSecret || undefined,
      headers: initialValues?.headers || {},
      is_active: initialValues?.is_active ?? true,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      <div>
        <Label htmlFor="destination-name">{t('analytics.name')}</Label>
        <Input
          id="destination-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sales Slack"
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="destination-type">{t('fileRequests.fieldType')}</Label>
          <select
            id="destination-type"
            className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
            value={destinationType}
            onChange={(e) => setDestinationType(e.target.value)}
          >
            <option value="slack">Slack</option>
            <option value="discord">Discord</option>
            <option value="wechat">WeChat Work</option>
            <option value="feishu">FeiShu</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>

        <div>
          <Label htmlFor="http-method">{t('automations.httpMethod')}</Label>
          <select
            id="http-method"
            className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
            value={httpMethod}
            onChange={(e) => setHttpMethod(e.target.value)}
          >
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="endpoint-url">{t('automations.endpointUrl')}</Label>
        <Input
          id="endpoint-url"
          type="url"
          value={endpointUrl}
          onChange={(e) => setEndpointUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          required
        />
      </div>

      <div>
        <Label htmlFor="signing-secret">{t('automations.signingSecret')}</Label>
        <Input
          id="signing-secret"
          value={signingSecret}
          onChange={(e) => setSigningSecret(e.target.value)}
          placeholder="Used for HMAC signature"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
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
