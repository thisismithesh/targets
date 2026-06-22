import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import Dashboard from './pages/Dashboard'
import AdminPanel from './pages/AdminPanel'
import TeamMemberDetail from './pages/TeamMemberDetail'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/team/:memberId/week/:weekId" element={<TeamMemberDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
