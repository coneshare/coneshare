import { Route, Routes } from 'react-router'
import './App.css'
import MainLayout from './components/layout/MainLayout'
import DocumentsPage from './pages/DocumentsPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/documents/folders/:folderId" element={<DocumentsPage />} />
      </Route>
    </Routes>
  )
}

export default App
