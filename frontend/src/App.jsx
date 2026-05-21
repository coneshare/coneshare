import { Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import './App.css';
import MainLayout from './components/layout/MainLayout';
import { UploadProvider } from './contexts/UploadProvider';
import { AllLinksPage } from './pages/AllLinksPage';
import { AllViewSessionsPage } from './pages/AllViewSessionsPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { CloudAuthCallbackPage } from './pages/CloudAuthCallbackPage';
import { DataroomPage } from './pages/DataroomPage';
import { DataroomsPage } from './pages/DataroomsPage';
import { FileRequestsPage } from './pages/FileRequestsPage';
import { FileRequestDetailPage } from './pages/FileRequestDetailPage';
import { DocumentPage } from './pages/DocumentPage';
import DocumentsPage from './pages/DocumentsPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { SignupVerifyPage } from './pages/SignupVerifyPage';
import PasswordSettingsPage from './pages/PasswordSettingsPage';
import { PublicUploadPage } from './pages/PublicUploadPage';
import { ShareLinkAnalyticsPage } from './pages/ShareLinkAnalyticsPage';
import { ShareLinkViewerPage } from './pages/ShareLinkViewerPage';
import UserSettingsPage from './pages/UserSettingsPage';
import { AdminSettingsPage } from './pages/AdminSettingsPage';
import { AdminLoginActivityPage } from './pages/AdminLoginActivityPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { ErrorPage } from './pages/ErrorPage';
import { NotFoundPage } from './pages/NotFoundPage';

function App() {
  return (
    <>
      <Toaster richColors />
      <UploadProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/signup/verify" element={<SignupVerifyPage />} />
          <Route path="/view/:slug" element={<ShareLinkViewerPage />} />
          <Route path="/upload/:slug" element={<PublicUploadPage />} />
          <Route path="/auth/:providerName/callback" element={<CloudAuthCallbackPage />} />
          <Route path="/500" element={<ErrorPage />} />
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/folders/:folderId" element={<DocumentsPage />} />
            <Route path="/documents/:documentId" element={<DocumentPage />} />
            <Route path="/documents/:documentId/links/:linkId" element={<ShareLinkAnalyticsPage />} />
            <Route path="/datarooms" element={<DataroomsPage />} />
            <Route path="/datarooms/:dataroomId" element={<DataroomPage />} />
            <Route path="/file-requests" element={<FileRequestsPage />} />
            <Route path="/file-requests/:requestId" element={<FileRequestDetailPage />} />
            <Route path="/analytics/links" element={<AllLinksPage />} />
            <Route path="/analytics/view-sessions" element={<AllViewSessionsPage />} />
            <Route path="/automations" element={<AutomationsPage />} />
            <Route path="/settings" element={<UserSettingsPage />} />
            <Route path="/settings/password" element={<PasswordSettingsPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/login-activity" element={<AdminLoginActivityPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </UploadProvider>
    </>
  );
}

export default App;
