export const ROOT_FOLDER_NAME = '__root__';

const appVersion = import.meta.env.VITE_APP_VERSION?.trim();
const gitSha = import.meta.env.VITE_GIT_SHA?.trim();

export const APP_DISPLAY_VERSION = appVersion
  ? (gitSha ? `${appVersion}-${gitSha.slice(0, 10)}` : appVersion)
  : (gitSha ? `dev-${gitSha.slice(0, 10)}` : null);

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'zh-hans', name: '简体中文' },
  { code: 'ru', name: 'Русский' },
  { code: 'de', name: 'Deutsch' },
];
