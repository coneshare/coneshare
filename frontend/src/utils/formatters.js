import { format, formatDistanceToNow } from 'date-fns';
import { enUS, zhCN, ru } from 'date-fns/locale';
import i18n from '../i18n';

const localeMap = {
  'en': enUS,
  'zh-hans': zhCN,
  'zh': zhCN,
  'ru': ru,
};

/**
 * Format a date object or ISO string according to the active i18n locale.
 * @param {Date|string|number} date - Date to format
 * @param {string} formatStr - date-fns format string (default 'PP')
 * @returns {string} Formatted date string
 */
export function formatDate(date, formatStr = 'PP') {
  if (date === null || date === undefined || date === '') return '';
  try {
    const currentLang = i18n.language || 'en';
    const locale = localeMap[currentLang] || enUS;
    return format(new Date(date), formatStr, { locale });
  } catch (error) {
    console.error('Failed to format date:', date, error);
    return String(date);
  }
}

/**
 * Format relative distance from date to now according to active i18n locale.
 * @param {Date|string|number} date - Date to format
 * @param {Object} options - date-fns options (default { addSuffix: true })
 * @returns {string} Formatted relative time string
 */
export function formatRelativeTime(date, options = { addSuffix: true }) {
  if (date === null || date === undefined || date === '') return '';
  try {
    const currentLang = i18n.language || 'en';
    const locale = localeMap[currentLang] || enUS;
    return formatDistanceToNow(new Date(date), { ...options, locale });
  } catch (error) {
    console.error('Failed to format relative time:', date, error);
    return String(date);
  }
}
