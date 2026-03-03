import { useState } from 'react';
import { useAuth } from '../lib/auth';
import {
    LayoutDashboard, Package, Users, PackagePlus, PackageMinus,
    RotateCcw, LogOut, Menu, X, ChevronRight
} from 'lucide-react';
import './Layout.css';

interface LayoutProps {
    children: React.ReactNode;
    currentPage: string;
    onNavigate: (page: string) => void;
}

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'catalog', label: 'Catálogo', icon: Package },
    { id: 'people', label: 'Pessoas', icon: Users },
    { id: 'receipts', label: 'Entradas', icon: PackagePlus },
    { id: 'withdrawals', label: 'Saídas', icon: PackageMinus },
    { id: 'supplier-returns', label: 'Devoluções', icon: RotateCcw },
];

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
    const { user, logout } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="layout">
            {/* Mobile header */}
            <header className="mobile-header">
                <button className="btn-icon" onClick={() => setSidebarOpen(true)}>
                    <Menu size={24} />
                </button>
                <h1 className="mobile-title">Almoxarifado</h1>
                <div className="user-badge-small">{user?.display_name?.charAt(0)}</div>
            </header>

            {/* Sidebar overlay on mobile */}
            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <Package size={28} />
                        <span>Almoxarifado</span>
                    </div>
                    <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
                        <X size={20} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {NAV_ITEMS.map(item => (
                        <button
                            key={item.id}
                            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                            onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                            {currentPage === item.id && <ChevronRight size={16} className="nav-arrow" />}
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar">{user?.display_name?.charAt(0)}</div>
                        <div className="user-details">
                            <div className="user-name">{user?.display_name}</div>
                            <div className="user-role">{user?.role === 'admin' ? 'Administrador' : 'Visualizador'}</div>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={logout}>
                        <LogOut size={16} />
                        Sair
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="main-content">
                {children}
            </main>

            {/* Bottom nav on mobile */}
            <nav className="bottom-nav">
                {NAV_ITEMS.slice(0, 5).map(item => (
                    <button
                        key={item.id}
                        className={`bottom-nav-item ${currentPage === item.id ? 'active' : ''}`}
                        onClick={() => onNavigate(item.id)}
                    >
                        <item.icon size={20} />
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
}
