import { useEffect, useState, useRef } from "react";
import { jwtDecode } from "jwt-decode";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useUser } from "../contexts/UserProvider";
import { getUser, updateUser } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/Avatar";
import { SettingsTabs } from "../components/settings/SettingsTabs";
import { SUPPORTED_LANGUAGES } from "../lib/constants";
import { getAvatarInitial } from "../utils/formatters";

function UserSettingsPage() {
  const { t, i18n } = useTranslation();
  const { refreshUser } = useUser();
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState(i18n.language || "en");
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef(null);


  useEffect(() => {
    let isMounted = true;
    const fetchUser = async () => {
      const token = localStorage.getItem("access_token");
      if (token) {
        try {
          const decoded = jwtDecode(token);
          const response = await getUser(decoded.user_id);
          if (isMounted) {
            setUser(response.data);
            setName(response.data.name || "");
            setLanguage(response.data.language || i18n.language || "en");
            setAvatarPreview(response.data.avatar_url || null);
          }
        } catch (error) {
          if (isMounted) {
            console.error("Failed to fetch user:", error);
            toast.error(t('settings.profileLoadFailed'));
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      } else {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    fetchUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // This effect is for cleaning up the blob URL to prevent memory leaks.
    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      return () => {
        URL.revokeObjectURL(avatarPreview);
      };
    }
  }, [avatarPreview]);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      setIsRemovingAvatar(false);
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview(previewUrl);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("language", language);
    if (avatarFile) {
      formData.append("avatar", avatarFile);
    } else if (isRemovingAvatar) {
      formData.append("avatar", ""); // Empty value signals removal
    }

    try {
      const response = await updateUser(user.id, formData);
      setUser(response.data);
      setName(response.data.name || "");
      setLanguage(response.data.language || language);
      setAvatarPreview(response.data.avatar_url || null);
      setAvatarFile(null); // Reset file input state
      setIsRemovingAvatar(false); // Reset removal state
      await i18n.changeLanguage(response.data.language || language);
      toast.success(t('settings.settingsUpdated'));
      refreshUser(response.data);
    } catch (error) {
      console.error("Failed to update user:", error);
      toast.error(t('settings.settingsUpdateFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-4 sm:mx-4 sm:pt-8">{t('common.loading')}</div>;
  }

  if (!user) {
    return <div className="p-4 sm:mx-4 sm:pt-8">{t('common.error')}</div>;
  }

  return (
    <div className="p-4 sm:mx-4 sm:pt-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">{t('settings.title')}</h1>
        <SettingsTabs />
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">{t('settings.email')}</Label>
            <Input
              id="email"
              type="email"
              value={user.email}
              readOnly
              className="bg-gray-100 dark:bg-gray-800"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">{t('settings.name')}</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.name')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">{t('settings.language')}</Label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t('settings.languageDescription')}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t('settings.avatar')}</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarPreview} />
                <AvatarFallback>{getAvatarInitial(name, user?.email)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current.click()}
                >
                  {t('common.change')}
                </Button>
              </div>
              <Input
                ref={fileInputRef}
                id="avatar"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
          </div>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default UserSettingsPage;
