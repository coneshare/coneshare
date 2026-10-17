import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../../lib/constants';

// Maps a detected browser language (e.g. "nl-be", "zh-tw") to a supported code.
const baseOf = (code) => code.split('-')[0];

function resolveLanguage(rawLang) {
  const match =
    SUPPORTED_LANGUAGES.find((lang) => lang.code === rawLang) ||
    SUPPORTED_LANGUAGES.find((lang) => baseOf(lang.code) === baseOf(rawLang));
  return match ? match.code : rawLang;
}

export function LanguagePicker({ className = '' }) {
  const { i18n, t } = useTranslation();

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    i18n.changeLanguage(newLang);
  };

  const currentLang = resolveLanguage((i18n.language || 'en').toLowerCase());

  return (
    <div className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      <Globe className="h-3.5 w-3.5" />
      <select
        value={currentLang}
        onChange={handleLanguageChange}
        aria-label={t('settings.language')}
        className="bg-transparent text-xs cursor-pointer border-none focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:ring-offset-1 text-muted-foreground hover:text-foreground transition-colors rounded"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code} className="bg-background text-foreground">
            {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
}
