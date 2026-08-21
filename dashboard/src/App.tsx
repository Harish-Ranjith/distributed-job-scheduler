import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useStore } from './store/index.js';

import { Login } from './pages/Login.js';
import { Dashboard } from './pages/Dashboard.js';
import { Jobs } from './pages/Jobs.js';
import { JobDetail } from './pages/JobDetail.js';
import { Workers } from './pages/Workers.js';
import { QueueConfig } from './pages/QueueConfig.js';
import { DeadLetter } from './pages/DeadLetter.js';
import { Metrics } from './pages/Metrics.js';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div style={{ padding: '2rem' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
}

function Layout({ children }: { children: ReactNode }) {
  useWebSocket();
  const wsConnected = useStore((state) => state.wsConnected);
  const { logout } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 240, borderRight: '1px solid var(--panel-border)', background: 'var(--panel-bg)', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: wsConnected ? 'var(--success)' : 'var(--error)' }} className={wsConnected ? '' : 'pulse'} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Scheduler</h2>
        </div>
        
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <NavLink to="/" className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`} style={{ justifyContent: 'flex-start' }} end>Overview</NavLink>
          <NavLink to="/jobs" className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`} style={{ justifyContent: 'flex-start' }}>Jobs</NavLink>
          <NavLink to="/workers" className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`} style={{ justifyContent: 'flex-start' }}>Workers</NavLink>
          <NavLink to="/queues" className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`} style={{ justifyContent: 'flex-start' }}>Queues</NavLink>
          <NavLink to="/dead-letter" className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`} style={{ justifyContent: 'flex-start' }}>Dead Letters</NavLink>
          <NavLink to="/metrics" className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`} style={{ justifyContent: 'flex-start' }}>Metrics</NavLink>
        </nav>

        <button onClick={logout} className="btn btn-outline" style={{ marginTop: 'auto' }}>Sign Out</button>
      </aside>
      
      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/jobs/:id" element={<JobDetail />} />
                <Route path="/workers" element={<Workers />} />
                <Route path="/queues" element={<QueueConfig />} />
                <Route path="/dead-letter" element={<DeadLetter />} />
                <Route path="/metrics" element={<Metrics />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
