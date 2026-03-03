import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Catalog from './pages/Catalog';
import People from './pages/People';
import Receipts from './pages/Receipts';
import Withdrawals from './pages/Withdrawals';
import SupplierReturns from './pages/SupplierReturns';
import UserManagement from './pages/UserManagement';
import Exchanges from './pages/Exchanges';
import PhotoGallery from './pages/PhotoGallery';
import { NotificationProvider } from './components/Notification';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'catalog': return <Catalog />;
      case 'people': return <People />;
      case 'receipts': return <Receipts />;
      case 'withdrawals': return <Withdrawals />;
      case 'supplier-returns': return <SupplierReturns />;
      case 'users': return <UserManagement />;
      case 'exchanges': return <Exchanges />;
      case 'photos': return <PhotoGallery />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </NotificationProvider>
  );
}

export default App;
