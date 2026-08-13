import { describe, it, expect } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en/translation.json';
import zhHans from '../locales/zh-hans/translation.json';
import ru from '../locales/ru/translation.json';
import { formatDate, formatRelativeTime } from '../utils/formatters';
import { getLocalizedErrorMessage } from '../utils/errorTranslator';
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

  it('correctly formats v4 plurals across languages', async () => {
    const testI18n = createTestI18n();

    // English plurals (_one / _other)
    await testI18n.changeLanguage('en');
    expect(testI18n.t('links.settingCount', { count: 1 })).toBe('1 Setting');
    expect(testI18n.t('links.settingCount', { count: 5 })).toBe('5 Settings');
    expect(testI18n.t('documents.itemCount', { count: 1 })).toBe('1 item');
    expect(testI18n.t('documents.itemCount', { count: 3 })).toBe('3 items');
    expect(testI18n.t('datarooms.addSelectedItems', { count: 1 })).toBe('Add 1 item');
    expect(testI18n.t('datarooms.addSelectedItems', { count: 4 })).toBe('Add 4 items');
    expect(testI18n.t('trash.itemsSelected', { count: 1 })).toBe('1 item selected');
    expect(testI18n.t('trash.itemsSelected', { count: 2 })).toBe('2 items selected');

    // Chinese plurals (_other)
    await testI18n.changeLanguage('zh-hans');
    expect(testI18n.t('links.settingCount', { count: 1 })).toBe('1 项设置');
    expect(testI18n.t('links.settingCount', { count: 5 })).toBe('5 项设置');
    expect(testI18n.t('documents.itemCount', { count: 1 })).toBe('1 个项目');
    expect(testI18n.t('documents.itemCount', { count: 3 })).toBe('3 个项目');
    expect(testI18n.t('datarooms.addSelectedItems', { count: 1 })).toBe('添加 1 个项目');
    expect(testI18n.t('datarooms.addSelectedItems', { count: 4 })).toBe('添加 4 个项目');
    expect(testI18n.t('trash.itemsSelected', { count: 1 })).toBe('已选择 1 个项目');
    expect(testI18n.t('trash.itemsSelected', { count: 2 })).toBe('已选择 2 个项目');

    // Russian plurals (_one / _few / _many)
    await testI18n.changeLanguage('ru');
    expect(testI18n.t('links.settingCount', { count: 1 })).toBe('1 настройка');
    expect(testI18n.t('links.settingCount', { count: 3 })).toBe('3 настройки');
    expect(testI18n.t('links.settingCount', { count: 5 })).toBe('5 настроек');
    expect(testI18n.t('documents.itemCount', { count: 1 })).toBe('1 элемент');
    expect(testI18n.t('documents.itemCount', { count: 2 })).toBe('2 элемента');
    expect(testI18n.t('documents.itemCount', { count: 5 })).toBe('5 элементов');
    expect(testI18n.t('datarooms.addSelectedItems', { count: 1 })).toBe('Добавить 1 элемент');
    expect(testI18n.t('datarooms.addSelectedItems', { count: 3 })).toBe('Добавить 3 элемента');
    expect(testI18n.t('datarooms.addSelectedItems', { count: 10 })).toBe('Добавить 10 элементов');
    expect(testI18n.t('trash.itemsSelected', { count: 1 })).toBe('Выбран 1 элемент');
    expect(testI18n.t('trash.itemsSelected', { count: 4 })).toBe('Выбрано 4 элемента');
    expect(testI18n.t('trash.itemsSelected', { count: 6 })).toBe('Выбрано 6 элементов');
  });

  it('translates folder creation and upload progress indicator strings correctly across locales', async () => {
    const testI18n = createTestI18n();

    // English
    await testI18n.changeLanguage('en');
    expect(testI18n.t('documents.folderCreatedSuccess', { name: 'Projects' })).toBe('Folder "Projects" created successfully.');
    expect(testI18n.t('documents.requestFiles')).toBe('Request Files');
    expect(testI18n.t('documents.copy')).toBe('Copy');
    expect(testI18n.t('documents.copyingItem', { name: 'Doc.pdf' })).toBe('Copying "Doc.pdf"...');
    expect(testI18n.t('documents.copySuccess', { name: 'Doc.pdf' })).toBe('"Doc.pdf" was copied successfully.');
    expect(testI18n.t('documents.deleteConfirmTitleName', { name: 'Report.pdf' })).toBe('Move "Report.pdf" to Trash?');
    expect(testI18n.t('documents.moveToTrash')).toBe('Move to Trash');
    expect(testI18n.t('documents.deleteItemSuccess', { name: 'Report.pdf' })).toBe('"Report.pdf" deleted successfully.');
    expect(testI18n.t('documents.uploadedBy', { name: 'Alice', email: 'alice@example.com' })).toBe('Uploaded by Alice (alice@example.com)');
    expect(testI18n.t('documents.me')).toBe('Me');
    expect(testI18n.t('cloudImport.title', { provider: 'Dropbox' })).toBe('Import from Dropbox');
    expect(testI18n.t('cloudImport.import')).toBe('Import');
    expect(testI18n.t('links.statusToggleSuccess', { name: 'Public Link', status: testI18n.t('links.activeStatus') })).toBe('Link "Public Link" is now active.');
    expect(testI18n.t('links.copiedToClipboard')).toBe('Link copied to clipboard!');
    expect(testI18n.t('fileRequests.copyLinkSuccess')).toBe('Link copied to clipboard!');
    expect(testI18n.t('errors.linkRequiresEmail')).toBe('This link requires an email address to view.');
    expect(testI18n.t('errors.linkPasswordProtected')).toBe('This link is password-protected. Please enter the password to continue.');
    expect(testI18n.t('viewer.previousPage')).toBe('Previous page');
    expect(testI18n.t('viewer.toggleFullscreen')).toBe('Toggle fullscreen');
    expect(testI18n.t('viewer.view')).toBe('View');
    expect(testI18n.t('viewer.download')).toBe('Download');
    expect(testI18n.t('viewer.prevFile')).toBe('Prev File');
    expect(testI18n.t('viewer.nextFileLabel')).toBe('Next File');
    expect(testI18n.t('viewer.collapseSidebar')).toBe('Collapse Sidebar');
    expect(testI18n.t('viewer.previewUnavailable')).toBe('Preview unavailable');
    expect(testI18n.t('viewer.previewNotAvailableNotice')).toBe('This type of file is not available for online preview. Download the file and open it on your device.');
    expect(testI18n.t('errors.documentTooManyPages')).toBe('Document has too many pages to generate a preview.');
    expect(testI18n.t('qna.title')).toBe('Q&A');
    expect(testI18n.t('qna.documentQna')).toBe('Document Q&A');
    expect(testI18n.t('qna.openDocumentQna')).toBe('Open Q&A for this document');
    expect(testI18n.t('qna.askPlaceholder')).toBe('Ask a question');
    expect(testI18n.t('qna.questionSent')).toBe('Question sent.');
    expect(testI18n.t('uploads.uploading', { count: 2 })).toBe('Uploading 2 files...');
    expect(testI18n.t('uploads.allComplete')).toBe('All uploads complete!');
    expect(testI18n.t('uploads.failedCount', { count: 1 })).toBe('1 upload failed.');
    expect(testI18n.t('uploads.overallProgress')).toBe('Overall Progress');

    // Chinese (Simplified)
    await testI18n.changeLanguage('zh-hans');
    expect(testI18n.t('documents.folderCreatedSuccess', { name: 'Projects' })).toBe('文件夹 "Projects" 创建成功。');
    expect(testI18n.t('documents.requestFiles')).toBe('收集文件');
    expect(testI18n.t('documents.copy')).toBe('复制');
    expect(testI18n.t('documents.copyingItem', { name: 'Doc.pdf' })).toBe('正在复制“Doc.pdf”...');
    expect(testI18n.t('documents.copySuccess', { name: 'Doc.pdf' })).toBe('“Doc.pdf”已成功复制。');
    expect(testI18n.t('documents.deleteConfirmTitleName', { name: 'Report.pdf' })).toBe('将“Report.pdf”移动到回收站？');
    expect(testI18n.t('documents.moveToTrash')).toBe('移动到回收站');
    expect(testI18n.t('documents.deleteItemSuccess', { name: 'Report.pdf' })).toBe('“Report.pdf”已成功删除。');
    expect(testI18n.t('documents.uploadedBy', { name: 'Alice', email: 'alice@example.com' })).toBe('由 Alice (alice@example.com) 上传');
    expect(testI18n.t('documents.me')).toBe('我');
    expect(testI18n.t('cloudImport.title', { provider: 'Dropbox' })).toBe('从 Dropbox 导入');
    expect(testI18n.t('cloudImport.import')).toBe('导入');
    expect(testI18n.t('links.statusToggleSuccess', { name: 'Public Link', status: testI18n.t('links.activeStatus') })).toBe('链接“Public Link”现已启用。');
    expect(testI18n.t('links.copiedToClipboard')).toBe('链接已复制到剪贴板！');
    expect(testI18n.t('fileRequests.copyLinkSuccess')).toBe('链接已复制到剪贴板！');
    expect(testI18n.t('errors.linkRequiresEmail')).toBe('此链接需要输入邮箱地址才能查看。');
    expect(testI18n.t('errors.linkPasswordProtected')).toBe('此链接受密码保护。请输入密码继续。');
    expect(testI18n.t('viewer.previousPage')).toBe('上一页');
    expect(testI18n.t('viewer.toggleFullscreen')).toBe('切换全屏');
    expect(testI18n.t('viewer.view')).toBe('查看');
    expect(testI18n.t('viewer.download')).toBe('下载');
    expect(testI18n.t('viewer.prevFile')).toBe('上一个文件');
    expect(testI18n.t('viewer.nextFileLabel')).toBe('下一个文件');
    expect(testI18n.t('viewer.collapseSidebar')).toBe('折叠侧边栏');
    expect(testI18n.t('viewer.previewUnavailable')).toBe('预览不可用');
    expect(testI18n.t('viewer.previewNotAvailableNotice')).toBe('此文件类型不支持在线预览。请下载文件并在您的设备上打开。');
    expect(testI18n.t('errors.documentTooManyPages')).toBe('文档页数过多，无法生成预览。');
    expect(testI18n.t('qna.title')).toBe('问答');
    expect(testI18n.t('qna.documentQna')).toBe('文档问答');
    expect(testI18n.t('qna.openDocumentQna')).toBe('打开此文档问答');
    expect(testI18n.t('qna.askPlaceholder')).toBe('提问...');
    expect(testI18n.t('qna.questionSent')).toBe('问题已发送。');
    expect(testI18n.t('uploads.uploading', { count: 2 })).toBe('正在上传 2 个文件...');
    expect(testI18n.t('uploads.allComplete')).toBe('所有上传已完成！');
    expect(testI18n.t('uploads.failedCount', { count: 1 })).toBe('1 个文件上传失败。');
    expect(testI18n.t('uploads.overallProgress')).toBe('总体进度');

    // Russian
    await testI18n.changeLanguage('ru');
    expect(testI18n.t('documents.folderCreatedSuccess', { name: 'Projects' })).toBe('Папка «Projects» успешно создана.');
    expect(testI18n.t('documents.requestFiles')).toBe('Запросить файлы');
    expect(testI18n.t('documents.copy')).toBe('Копировать');
    expect(testI18n.t('documents.copyingItem', { name: 'Doc.pdf' })).toBe('Копирование «Doc.pdf»...');
    expect(testI18n.t('documents.copySuccess', { name: 'Doc.pdf' })).toBe('«Doc.pdf» успешно скопирован.');
    expect(testI18n.t('documents.deleteConfirmTitleName', { name: 'Report.pdf' })).toBe('Переместить «Report.pdf» в корзину?');
    expect(testI18n.t('documents.moveToTrash')).toBe('В корзину');
    expect(testI18n.t('documents.deleteItemSuccess', { name: 'Report.pdf' })).toBe('«Report.pdf» успешно удален.');
    expect(testI18n.t('documents.uploadedBy', { name: 'Alice', email: 'alice@example.com' })).toBe('Загружено Alice (alice@example.com)');
    expect(testI18n.t('documents.me')).toBe('Я');
    expect(testI18n.t('cloudImport.title', { provider: 'Dropbox' })).toBe('Импортировать из Dropbox');
    expect(testI18n.t('cloudImport.import')).toBe('Импортировать');
    expect(testI18n.t('links.statusToggleSuccess', { name: 'Public Link', status: testI18n.t('links.activeStatus') })).toBe('Ссылка «Public Link» теперь активна.');
    expect(testI18n.t('links.copiedToClipboard')).toBe('Ссылка скопирована в буфер обмена!');
    expect(testI18n.t('fileRequests.copyLinkSuccess')).toBe('Ссылка скопирована в буфер обмена!');
    expect(testI18n.t('errors.linkRequiresEmail')).toBe('Для просмотра этой ссылки требуется адрес электронной почты.');
    expect(testI18n.t('errors.linkPasswordProtected')).toBe('Эта ссылка защищена паролем. Пожалуйста, введите пароль для продолжения.');
    expect(testI18n.t('viewer.previousPage')).toBe('Предыдущая страница');
    expect(testI18n.t('viewer.toggleFullscreen')).toBe('На весь экран');
    expect(testI18n.t('viewer.view')).toBe('Просмотр');
    expect(testI18n.t('viewer.download')).toBe('Скачать');
    expect(testI18n.t('viewer.prevFile')).toBe('Пред. файл');
    expect(testI18n.t('viewer.nextFileLabel')).toBe('След. файл');
    expect(testI18n.t('viewer.collapseSidebar')).toBe('Свернуть панель');
    expect(testI18n.t('viewer.previewUnavailable')).toBe('Предпросмотр недоступен');
    expect(testI18n.t('viewer.previewNotAvailableNotice')).toBe('Этот тип файла недоступен для онлайн-просмотра. Скачайте файл и откройте его на своем устройстве.');
    expect(testI18n.t('errors.documentTooManyPages')).toBe('В документе слишком много страниц для создания предпросмотра.');
    expect(testI18n.t('qna.title')).toBe('Вопросы и ответы');
    expect(testI18n.t('qna.documentQna')).toBe('Вопросы по документу');
    expect(testI18n.t('qna.openDocumentQna')).toBe('Открыть вопросы по этому документу');
    expect(testI18n.t('qna.askPlaceholder')).toBe('Задать вопрос...');
    expect(testI18n.t('qna.questionSent')).toBe('Вопрос отправлен.');
    expect(testI18n.t('uploads.uploading', { count: 2 })).toBe('Загрузка 2 файлов...');
    expect(testI18n.t('uploads.allComplete')).toBe('Все загрузки завершены!');
    expect(testI18n.t('uploads.failedCount', { count: 1 })).toBe('Не удалось загрузить 1 файл.');
    expect(testI18n.t('uploads.overallProgress')).toBe('Общий прогресс');
  });

  it('translates raw backend Google Drive token expired error message using errorTranslator', async () => {
    const rawError = {
      response: {
        data: {
          detail: 'Failed to access Google Drive. Your authorization token may have expired or been revoked. Please reconnect your account.',
        },
      },
    };

    await appI18n.changeLanguage('en');
    expect(getLocalizedErrorMessage(rawError)).toBe('Failed to access Google Drive. Your authorization token may have expired or been revoked. Please reconnect your account.');

    await appI18n.changeLanguage('zh-hans');
    expect(getLocalizedErrorMessage(rawError)).toBe('无法访问 Google Drive。您的授权令牌可能已过期或已被撤销。请重新连接您的账户。');

    await appI18n.changeLanguage('ru');
    expect(getLocalizedErrorMessage(rawError)).toBe('Не удалось получить доступ к Google Drive. Срок действия токена авторизации истёк или он был отозван. Пожалуйста, подключите аккаунт заново.');
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

    // Options merging tests
    await appI18n.changeLanguage('en');
    const withIncludeSeconds = formatRelativeTime(pastDate, { includeSeconds: true });
    expect(withIncludeSeconds).toContain('ago'); // addSuffix defaults to true when options has partial keys

    const withAddSuffixFalse = formatRelativeTime(pastDate, { addSuffix: false });
    expect(withAddSuffixFalse).not.toContain('ago'); // explicit addSuffix: false is respected

    // Edge cases
    expect(formatDate(0)).toBeTruthy();
    expect(formatDate(null)).toBe('');
    expect(formatRelativeTime(null)).toBe('');

    // Restore default locale
    await appI18n.changeLanguage('en');
  });
});
