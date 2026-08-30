import { format, formatDistanceToNow } from 'date-fns';
import { enUS, zhCN, ru, de } from 'date-fns/locale';
import i18n from '../i18n';

const localeMap = {
  'en': enUS,
  'zh-hans': zhCN,
  'zh': zhCN,
  'ru': ru,
  'de': de,
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
export function formatRelativeTime(date, options = {}) {
  if (date === null || date === undefined || date === '') return '';
  try {
    const currentLang = i18n.language || 'en';
    const locale = localeMap[currentLang] || enUS;
    return formatDistanceToNow(new Date(date), { addSuffix: true, ...options, locale });
  } catch (error) {
    console.error('Failed to format relative time:', date, error);
    return String(date);
  }
}

/**
 * Extract two-letter initials for user avatar fallback.
 * - Multi-word names: First + Last initial (e.g. "Alice Chen" -> "AC")
 * - Single-word names: First two letters (e.g. "Admin" -> "AD")
 * - Email fallback: First two letters of local-part (e.g. "alice@example.com" -> "AL")
 * @param {string} [name] - User full name
 * @param {string} [email] - User email address
 * @returns {string} Two-character uppercase initials or '?'
 */
export function getAvatarInitial(name, email) {
  if (name && typeof name === 'string') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    if (parts.length === 1 && parts[0].length > 0) {
      return parts[0].slice(0, 2).toUpperCase();
    }
  }
  if (email && typeof email === 'string') {
    const userPart = email.split('@')[0].trim();
    if (userPart.length > 0) {
      return userPart.slice(0, 2).toUpperCase();
    }
  }
  return '?';
}

/**
 * Authoritatively determines if the current user is the owner of a dataroom.
 * Prioritizes server-computed `current_user_role` followed by created_by and owner ID comparisons.
 * @param {Object} dataroom - Dataroom object
 * @param {Object} user - Current authenticated user
 * @returns {boolean}
 */
export function isDataroomOwner(dataroom, user) {
  if (!dataroom || !user) return false;
  if (dataroom.current_user_role === 'owner') return true;
  const userId = user.id;
  return (
    dataroom.created_by === userId ||
    dataroom.created_by?.id === userId ||
    dataroom.owner?.id === userId
  );
}

/**
 * Determines if the current user is an active collaborator of a dataroom (and not the owner).
 * @param {Object} dataroom - Dataroom object
 * @param {Object} user - Current authenticated user
 * @returns {boolean}
 */
export function isDataroomCollaborator(dataroom, user) {
  if (!dataroom || !user) return false;
  if (isDataroomOwner(dataroom, user)) return false;
  if (dataroom.current_user_role === 'collaborator') return true;
  const userId = user.id;
  return (
    dataroom.collaborators?.some(
      (c) => (c.user_id || c.user?.id) === userId
    ) ?? false
  );
}


