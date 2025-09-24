import { Route, Routes } from 'react-router'
import { Toaster } from 'sonner'
import './App.css'
import MainLayout from './components/layout/MainLayout'
import DocumentsPage from './pages/DocumentsPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import PasswordSettingsPage from './pages/PasswordSettingsPage'
import UserSettingsPage from './pages/UserSettingsPage'

function App() {
  return (
    <>
      <Toaster richColors />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/folders/:folderId" element={<DocumentsPage />} />
          <Route path="/settings" element={<UserSettingsPage />} />
          <Route path="/settings/password" element={<PasswordSettingsPage />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
