import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import * as api from '../services/api';

function SettingRow({ setting, onSave }) {
  const [value, setValue] = useState(setting.value);
  const [isSaving, setIsSaving] = useState(false);
  const isTextArea =
    setting.value.length > 80 ||
    setting.value.includes('\n') ||
    setting.key.includes('ENABLED_CLOUD_PROVIDERS') ||
    setting.key.includes('CLOUD_IMPORT_FOLDER_MAPPING');

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(setting.key, value);
      toast.success(`Setting '${setting.key}' updated successfully.`);
    } catch (error) {
      setValue(setting.value); // Revert on failure
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <tr className="border-b">
      <td className="p-4 align-top">
        <div className="font-semibold">{setting.key}</div>
        <div className="text-sm text-muted-foreground">
          {setting.description}
        </div>
      </td>
      <td className="w-1/2 p-4 align-top">
        {isTextArea ? (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            className="font-mono text-sm"
          />
        ) : (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono text-sm"
          />
        )}
      </td>
      <td className="p-4 align-top">
        <Button
          onClick={handleSave}
          disabled={isSaving || value === setting.value}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </td>
    </tr>
  );
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await api.getAdminSettings();
        setSettings(response.data);
      } catch (error) {
        // Error toast is handled by the global interceptor
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveSetting = async (key, value) => {
    const response = await api.updateAdminSetting(key, value);
    // Update local state to reflect the saved value without a full refetch
    setSettings((prevSettings) =>
      prevSettings.map((s) =>
        s.key === key ? { ...s, value: response.data.value } : s
      )
    );
  };

  if (isLoading) {
    return <div>Loading settings...</div>;
  }

  return (
    <div className="container mx-auto py-6">
      <h1 className="mb-6 text-2xl font-bold">
        Application Settings
      </h1>
      <div className="overflow-hidden rounded-lg border">
        <table className="min-w-full">
          <thead className="bg-muted/50">
            <tr className="border-b">
              <th className="p-4 text-left font-semibold">Setting</th>
              <th className="p-4 text-left font-semibold">Value</th>
              <th className="p-4 text-left font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((setting) => (
              <SettingRow
                key={setting.key}
                setting={setting}
                onSave={handleSaveSetting}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
