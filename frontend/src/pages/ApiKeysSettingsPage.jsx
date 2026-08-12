import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Key, Plus, Trash2, Copy, Check, ShieldAlert } from "lucide-react";
import { SettingsTabs } from "../components/settings/SettingsTabs";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select } from "../components/ui/Select";
import { getApiKeys, createApiKey, deleteApiKey } from "../services/api";

export default function ApiKeysSettingsPage() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [tier, setTier] = useState("read_only");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchKeys = async () => {
    try {
      const response = await getApiKeys();
      const results = Array.isArray(response.data) ? response.data : (response.data?.results || []);
      setKeys(results);
    } catch (error) {
      console.error("Failed to fetch API keys:", error);
      toast.error(t('settings.settingsUpdateFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t('settings.settingsUpdateFailed'));
      return;
    }
    setIsCreating(true);
    try {
      const payload = {
        name: name.trim(),
        tier,
        expires_in_days: expiresInDays ? parseInt(expiresInDays, 10) : null,
      };
      const response = await createApiKey(payload);
      toast.success(t('settings.settingsUpdated'));
      setCreatedRawKey(response.data.raw_key);
      setName("");
      setExpiresInDays("");
      fetchKeys();
    } catch (error) {
      console.error("Failed to create API key:", error);
      toast.error(t('settings.settingsUpdateFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteApiKey(deleteTarget.id);
      toast.success(t('settings.settingsUpdated'));
      setDeleteTarget(null);
      fetchKeys();
    } catch (error) {
      console.error("Failed to revoke API key:", error);
      toast.error(t('settings.settingsUpdateFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    toast.success(t('common.success'));
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const getTierBadge = (tierType) => {
    switch (tierType) {
      case "full_access":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">{t('settings.fullAccess')}</span>;
      case "read_write":
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{t('settings.readWrite')}</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{t('settings.readOnly')}</span>;
    }
  };

  return (
    <div className="p-4 sm:mx-4 sm:pt-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">{t('settings.title')}</h1>
        <SettingsTabs />

        {/* Newly Created Key Alert Modal/Banner */}
        {createdRawKey && (
          <div className="mb-6 p-4 border border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-800 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-green-800 dark:text-green-300 font-semibold">
              <Key className="h-5 w-5" />
              <span>{t('settings.apiKeyCreatedAlert')}</span>
            </div>
            <p className="text-sm text-green-700 dark:text-green-400">
              Please copy your API key now. For security reasons, you will <strong>not</strong> be able to view the full raw key again.
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={createdRawKey}
                className="font-mono text-sm bg-white dark:bg-gray-900"
              />
              <Button onClick={() => copyToClipboard(createdRawKey)} variant="outline">
                {copiedKey ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setCreatedRawKey(null)}>
              Done
            </Button>
          </div>
        )}

        {/* Create API Key Form */}
        <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> {t('settings.createApiKeyTitle')}
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor="key-name">{t('settings.keyName')}</Label>
              <Input
                id="key-name"
                placeholder="e.g. MCP Server / Claude Desktop"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="key-tier">{t('settings.permissionsTier')}</Label>
              <Select id="key-tier" value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="read_only">{t('settings.readOnly')}</option>
                <option value="read_write">{t('settings.readWrite')}</option>
                <option value="full_access">{t('settings.fullAccess')}</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="key-expires">{t('settings.expiresInDays')}</Label>
              <Input
                id="key-expires"
                type="number"
                placeholder="e.g. 30 (blank = never)"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <Button type="submit" disabled={isCreating}>
                {isCreating ? t('common.saving') : t('settings.generateApiKey')}
              </Button>
            </div>
          </form>
        </div>

        {/* Active Keys List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold">{t('settings.activeApiKeysTitle')}</h2>
            <p className="text-sm text-gray-500">API keys authenticate external tools (like MCP servers) with your Coneshare account.</p>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-gray-500">{t('common.loading')}</div>
          ) : keys.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No API keys generated yet. Create one above to connect AI tools.
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {keys.map((k) => (
                <div key={k.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{k.name}</span>
                      {getTierBadge(k.tier)}
                    </div>
                    <div className="text-sm font-mono text-gray-500 dark:text-gray-400">
                      Prefix: <span className="font-bold text-gray-700 dark:text-gray-300">{k.prefix}****</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      Created: {new Date(k.created_at).toLocaleDateString()}
                      {k.last_used_at ? ` • Last used: ${new Date(k.last_used_at).toLocaleDateString()}` : " • Never used"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                      onClick={() => setDeleteTarget(k)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> {t('settings.revoke')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full space-y-4 shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 font-semibold text-lg text-red-600 dark:text-red-400">
                <ShieldAlert className="h-5 w-5" /> {t('settings.revokeKeyTitle')}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('settings.revokeKeyDescription', { name: deleteTarget.name })}
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" disabled={isDeleting} onClick={confirmDelete}>
                  {isDeleting ? t('settings.revoking') : t('settings.revoke')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
