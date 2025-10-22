import { Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import './App.css';
import MainLayout from './components/layout/MainLayout';
import { AllLinksPage } from './pages/AllLinksPage';
import { AllViewSessionsPage } from './pages/AllViewSessionsPage';
import { DocumentPage } from './pages/DocumentPage';
import DocumentsPage from './pages/DocumentsPage';
import { DropboxCallbackPage } from './pages/DropboxCallbackPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import PasswordSettingsPage from './pages/PasswordSettingsPage';
import { ShareLinkAnalyticsPage } from './pages/ShareLinkAnalyticsPage';
import { ShareLinkViewerPage } from './pages/ShareLinkViewerPage';
import UserSettingsPage from './pages/UserSettingsPage';

function App() {
  return (
    <>
      <Toaster richColors />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/view/:slug" element={<ShareLinkViewerPage />} />
        <Route path="/auth/dropbox/callback" element={<DropboxCallbackPage />} />
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/folders/:folderId" element={<DocumentsPage />} />
          <Route path="/documents/:documentId" element={<DocumentPage />} />
          <Route path="/documents/:documentId/links/:linkId" element={<ShareLinkAnalyticsPage />} />
          <Route path="/analytics/links" element={<AllLinksPage />} />
          <Route path="/analytics/view-sessions" element={<AllViewSessionsPage />} />
          <Route path="/settings" element={<UserSettingsPage />} />
          <Route path="/settings/password" element={<PasswordSettingsPage />} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
