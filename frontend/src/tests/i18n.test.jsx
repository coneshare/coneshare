import { describe, it, expect } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en/translation.json';
import zhHans from '../locales/zh-hans/translation.json';
import ru from '../locales/ru/translation.json';
import { formatDate, formatRelativeTime } from '../utils/formatters';
import appI18n from '../i18n';

function createTestI18n() {
  const instance = i18n.createInstance();
  instance.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      'zh-hans': { translation: zhHans },
      zh: { translation: zhHans },
      ru: { translation: ru },
    },
    fallbackLng: 'en',
    load: 'currentOnly',
    lowerCaseLng: true,
    supportedLngs: ['en', 'zh-hans', 'zh', 'ru'],
    interpolation: { escapeValue: false },
  });
  return instance;
}

describe('Frontend i18n System', () => {
  it('loads English translations by default', () => {
    const testI18n = createTestI18n();
    expect(testI18n.t('common.save')).toBe('Save Changes');
    expect(testI18n.t('common.edit')).toBe('Edit');
    expect(testI18n.t('viewer.preview')).toBe('Preview');
    expect(testI18n.t('nav.dashboard')).toBe('Dashboard');
    expect(testI18n.t('dashboard.title')).toBe('Dashboard');
    expect(testI18n.t('dashboard.dailyVisits')).toBe('Daily Visits (Last 30 Days)');
    expect(testI18n.t('analytics.visitor')).toBe('Visitor');
    expect(testI18n.t('documents.newFolderTitle')).toBe('Create New Folder');
    expect(testI18n.t('documents.renameTitle')).toBe('Rename Item');
    expect(testI18n.t('documents.moveTitle')).toBe('Move Items');
    expect(testI18n.t('settings.title')).toBe('User Settings');
  });

  it('switches language to Simplified Chinese (zh-hans)', async () => {
    const testI18n = createTestI18n();
    await testI18n.changeLanguage('zh-hans');
    expect(testI18n.t('common.save')).toBe('保存修改');
    expect(testI18n.t('common.edit')).toBe('编辑');
    expect(testI18n.t('viewer.preview')).toBe('预览');
    expect(testI18n.t('nav.dashboard')).toBe('仪表盘');
    expect(testI18n.t('dashboard.title')).toBe('仪表盘');
    expect(testI18n.t('dashboard.dailyVisits')).toBe('每日访问量（近30天）');
    expect(testI18n.t('analytics.visitor')).toBe('访客');
    expect(testI18n.t('documents.newFolderTitle')).toBe('新建文件夹');
    expect(testI18n.t('documents.renameTitle')).toBe('重命名项目');
    expect(testI18n.t('documents.moveTitle')).toBe('移动项目');
    expect(testI18n.t('settings.title')).toBe('用户设置');
  });

  it('switches language to Russian (ru)', async () => {
    const testI18n = createTestI18n();
    await testI18n.changeLanguage('ru');
    expect(testI18n.t('common.save')).toBe('Сохранить изменения');
    expect(testI18n.t('common.edit')).toBe('Редактировать');
    expect(testI18n.t('viewer.preview')).toBe('Предпросмотр');
    expect(testI18n.t('nav.dashboard')).toBe('Панель управления');
    expect(testI18n.t('dashboard.title')).toBe('Панель управления');
    expect(testI18n.t('dashboard.dailyVisits')).toBe('Ежедневные посещения (последние 30 дней)');
    expect(testI18n.t('analytics.visitor')).toBe('Посетитель');
    expect(testI18n.t('documents.newFolderTitle')).toBe('Создать новую папку');
    expect(testI18n.t('documents.renameTitle')).toBe('Переименовать объект');
    expect(testI18n.t('documents.moveTitle')).toBe('Переместить элементы');
    expect(testI18n.t('settings.title')).toBe('Настройки пользователя');
  });

  it('falls back to English for missing keys in non-English locale', async () => {
    const testI18n = createTestI18n();
    await testI18n.changeLanguage('zh-hans');
    expect(testI18n.t('nonexistent.key.name')).toBe('nonexistent.key.name');
  });

  it('formats dates localized according to current i18n language', async () => {
    const testDate = new Date('2026-08-10T00:00:00Z');

    await appI18n.changeLanguage('en');
    const formattedEn = formatDate(testDate);
    expect(formattedEn).toContain('Aug');

    await appI18n.changeLanguage('zh-hans');
    const formattedZh = formatDate(testDate);
    expect(formattedZh).toContain('2026');

    // Relative date test (e.g. 60 days ago)
    const pastDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    await appI18n.changeLanguage('en');
    const relativeEn = formatRelativeTime(pastDate);
    expect(relativeEn).toContain('ago');

    await appI18n.changeLanguage('zh-hans');
    const relativeZh = formatRelativeTime(pastDate);
    expect(relativeZh).toContain('前');

    await appI18n.changeLanguage('ru');
    const relativeRu = formatRelativeTime(pastDate);
    expect(relativeRu).toContain('назад');

    // Edge cases
    expect(formatDate(0)).toBeTruthy();
    expect(formatDate(null)).toBe('');
    expect(formatRelativeTime(null)).toBe('');

    // Restore default locale
    await appI18n.changeLanguage('en');
  });
});
