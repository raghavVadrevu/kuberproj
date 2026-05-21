import { Routes, Route } from 'react-router-dom'
import RequireAuth from './components/auth/RequireAuth'
import Layout from './components/layout/Layout'
import PulsePage from './pages/Pulse'
import DecisionPage from './pages/Decision'
import TabPage from './pages/Tab'
import VaultPage from './pages/Vault'
import ConciergePage from './pages/Concierge'
import ProfilePage from './pages/Profile'
import FriendsPage from './pages/Friends'
import GroupsPage from './pages/Groups'
import ForgotPasswordPage from './pages/ForgotPassword'
import LoginPage from './pages/Login'
import SignupPage from './pages/Signup'

function App() {
  return (
    <Routes>
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<PulsePage />} />
        <Route path="decision" element={<DecisionPage />} />
        <Route path="tab" element={<TabPage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="ai" element={<ConciergePage />} />
        <Route path="concierge" element={<ConciergePage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="friends" element={<FriendsPage />} />
        <Route path="groups" element={<GroupsPage />} />
      </Route>
    </Routes>
  )
}

export default App
