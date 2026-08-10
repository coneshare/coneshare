import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUser } from '../contexts/UserProvider';

/**
 * Syncs i18next language with the authenticated user's
 * language preference from the backend.
 */
export function useLanguageSync() {
  const { i18n } = useTranslation();
  const { user } = useUser();

  useEffect(() => {
    if (user?.language && user.language !== i18n.language) {
      i18n.changeLanguage(user.language);
    }
  }, [user?.language, i18n]);
}
