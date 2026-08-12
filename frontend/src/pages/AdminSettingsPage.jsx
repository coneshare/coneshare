import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AdminNav } from '../components/admin/AdminNav';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { Switch } from '../components/ui/Switch';
import { Textarea } from '../components/ui/Textarea';
import * as api from '../services/api';

const getSettingGroups = (t) => [
  { key: 'general', label: t('admin.groupGeneral'), help: t('admin.groupGeneralHelp') },
  { key: 'quota', label: t('admin.groupQuota'), help: t('admin.groupQuotaHelp') },
  { key: 'cloud', label: t('admin.groupCloud'), help: t('admin.groupCloudHelp') },
  { key: 'security', label: t('admin.groupSecurity'), help: t('admin.groupSecurityHelp') },
  { key: 'other', label: t('admin.groupOther'), help: t('admin.groupOtherHelp') },
];

const SETTING_GROUP_BY_KEY = {
  ENABLE_PUBLIC_SIGNUP: 'security',
  FLATTEN_WATERMARKED_DOWNLOADS: 'security',
  MAX_PREVIEW_FILE_SIZE_MB: 'quota',
  MAX_VIDEO_PREVIEW_SIZE_MB: 'quota',
  MAX_PREVIEW_PAGES: 'quota',
  FILE_SIZE_QUOTA_MB: 'quota',
  MAX_FILES_PER_UPLOAD: 'quota',
  CLOUD_IMPORT_MAX_SIZE_MB: 'quota',
  ENABLED_CLOUD_PROVIDERS: 'cloud',
  CLOUD_IMPORT_FOLDER_MAPPING: 'cloud',
  DROPBOX_APP_KEY: 'cloud',
  DROPBOX_APP_SECRET: 'cloud',
  GOOGLE_DRIVE_CLIENT_ID: 'cloud',
  GOOGLE_DRIVE_CLIENT_SECRET: 'cloud',
  NEXT_CLOUD_HOST: 'cloud',
  NEXT_CLOUD_CLIENT_ID: 'cloud',
  NEXT_CLOUD_CLIENT_SECRET: 'cloud',
};

const humanizeKey = (key) =>
  key
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const isSecretKey = (key) => key.includes('SECRET') || key.includes('KEY');

const normalizeValueForCompare = (valueType, value) => {
  if (valueType === 'json') {
    try {
      return JSON.stringify(value);
    } catch (_err) {
      return '';
    }
  }
  return String(value);
};

const groupSettings = (settings, settingGroups) => {
  const grouped = settingGroups.reduce((acc, group) => {
    acc[group.key] = [];
    return acc;
  }, {});

  settings.forEach((setting) => {
    const groupKey = SETTING_GROUP_BY_KEY[setting.key] || 'other';
    if (!grouped[groupKey]) grouped[groupKey] = [];
    grouped[groupKey].push(setting);
  });

  return settingGroups.map((group) => ({
    ...group,
    settings: grouped[group.key],
  })).filter((group) => group.settings.length > 0);
};

function SettingSkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-72" />
      </div>
      <Skeleton className="mb-4 h-10 w-full" />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}

function SettingCard({ setting, onSave }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(setting.value);
  const [jsonText, setJsonText] = useState(
    setting.value_type === 'json' ? JSON.stringify(setting.value, null, 2) : ''
  );
  const [showSecret, setShowSecret] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isBoolean = setting.value_type === 'bool';
  const isInteger = setting.value_type === 'int';
  const isJson = setting.value_type === 'json';
  const isSecret = !isJson && setting.value_type === 'string' && isSecretKey(setting.key);

  const isDirty = isJson
    ? jsonText !== JSON.stringify(setting.value, null, 2)
    : normalizeValueForCompare(setting.value_type, value) !==
      normalizeValueForCompare(setting.value_type, setting.value);

  const handleReset = () => {
    setValue(setting.value);
    if (isJson) setJsonText(JSON.stringify(setting.value, null, 2));
    setValidationError('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setValidationError('');

    let payload = value;
    if (isJson) {
      try {
        payload = JSON.parse(jsonText);
      } catch (_error) {
        setValidationError(t('admin.invalidJson'));
        setIsSaving(false);
        return;
      }
    }

    try {
      await onSave(setting.key, payload);
      toast.success(t('admin.savedSetting', { name: humanizeKey(setting.key) }));
    } catch (_error) {
      setValue(setting.value);
      if (isJson) setJsonText(JSON.stringify(setting.value, null, 2));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            {humanizeKey(setting.key)}{' '}
            <span className="font-mono text-xs text-muted-foreground/80">({setting.key})</span>
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`admin.settingDescriptions.${setting.key}`, { defaultValue: setting.description })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px] uppercase tracking-wide">
            {setting.value_type}
          </Badge>
          {isDirty && (
            <Badge variant="secondary" className="text-[11px]">
              {t('admin.unsaved')}
            </Badge>
          )}
        </div>
      </div>

      <div className="mb-3">
        {isBoolean ? (
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm text-muted-foreground">{value ? t('admin.enabled') : t('admin.disabled')}</span>
            <Switch checked={Boolean(value)} onCheckedChange={(checked) => setValue(Boolean(checked))} />
          </div>
        ) : isJson ? (
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
        ) : (
          <Input
            type={isInteger ? 'number' : showSecret ? 'text' : isSecret ? 'password' : 'text'}
            value={value}
            onChange={(e) => {
              if (isInteger) {
                setValue(e.target.value === '' ? '' : Number(e.target.value));
                return;
              }
              setValue(e.target.value);
            }}
            className="font-mono text-sm"
          />
        )}

        {isSecret && (
          <button
            type="button"
            className="mt-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setShowSecret((prev) => !prev)}
          >
            {showSecret ? t('admin.hideValue') : t('admin.revealValue')}
          </button>
        )}

        {validationError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{validationError}</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleReset} disabled={!isDirty || isSaving}>
          {t('admin.reset')}
        </Button>
        <Button onClick={handleSave} disabled={!isDirty || isSaving}>
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}

export function AdminSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const settingGroups = useMemo(() => getSettingGroups(t), [t]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await api.getAdminSettings();
        setSettings(response.data.map((item) => ({ ...item, baseline_value: item.value })));
      } catch (_error) {
        // Error toast is handled by the global interceptor
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveSetting = async (key, value) => {
    const response = await api.updateAdminSetting(key, value);
    setSettings((prevSettings) =>
      prevSettings.map((s) =>
        s.key === key
          ? {
              ...s,
              value: response.data.value,
              baseline_value: response.data.value,
              raw_value: response.data.raw_value,
              value_type: response.data.value_type,
            }
          : s
      )
    );
  };

  const filteredSettings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return settings.filter((setting) => {
      return (
        q.length === 0 ||
        setting.key.toLowerCase().includes(q) ||
        setting.description.toLowerCase().includes(q) ||
        humanizeKey(setting.key).toLowerCase().includes(q)
      );
    });
  }, [settings, searchQuery]);

  const grouped = useMemo(() => groupSettings(filteredSettings, settingGroups), [filteredSettings, settingGroups]);

  return (
    <div className="container mx-auto py-6">
      <AdminNav />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.appSettings')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.appSettingsSubtitle')}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('admin.searchSettings')}
            className="sm:w-72"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, idx) => (
            <SettingSkeletonCard key={idx} />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('admin.noSettingsMatch')}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.key} className="space-y-3">
              <div>
                <h3 className="text-lg font-semibold">{group.label}</h3>
                <p className="text-sm text-muted-foreground">{group.help}</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {group.settings.map((setting) => (
                  <SettingCard
                    key={setting.key}
                    setting={setting}
                    onSave={handleSaveSetting}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
