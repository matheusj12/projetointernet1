import { useState } from 'react';
import { useAuth } from '../lib/auth';
import {
    LayoutDashboard, Package, Users, PackagePlus, PackageMinus,
    RotateCcw, LogOut, Menu, X, ChevronRight, Shield, ArrowLeftRight, Camera, Image as ImageIcon
} from 'lucide-react';
import './Layout.css';

interface LayoutProps {
    children: React.ReactNode;
    currentPage: string;
    onNavigate: (page: string) => void;
}

const NAV_GROUPS = [
    {
        label: 'Visão Geral',
        items: [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'catalog', label: 'Catálogo', icon: Package },
        ]
    },
    {
        label: 'Operações',
        items: [
            { id: 'people', label: 'Pessoas / Técnicos', icon: Users },
            { id: 'receipts', label: 'Entradas', icon: PackagePlus },
            { id: 'withdrawals', label: 'Saídas', icon: PackageMinus },
            { id: 'supplier-returns', label: 'Devoluções', icon: RotateCcw },
            { id: 'exchanges', label: 'Trocas', icon: ArrowLeftRight },
            { id: 'photos', label: 'Diário de Fotos', icon: ImageIcon },
        ]
    }
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
                    {NAV_GROUPS.map((group, groupIdx) => (
                        <div key={groupIdx} className="nav-group">
                            <div className="nav-section-label">{group.label}</div>
                            {group.items.map(item => (
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
                        </div>
                    ))}

                    {user?.role === 'admin' && (
                        <div className="nav-group" style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                            <div className="nav-section-label">Administração</div>
                            <button
                                className={`nav-item ${currentPage === 'users' ? 'active' : ''}`}
                                onClick={() => { onNavigate('users'); setSidebarOpen(false); }}
                            >
                                <Shield size={20} />
                                <span>Usuários</span>
                                {currentPage === 'users' && <ChevronRight size={16} className="nav-arrow" />}
                            </button>
                        </div>
                    )}
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
                <button className={`bottom-nav-item ${['dashboard', 'catalog'].includes(currentPage) ? 'active' : ''}`} onClick={() => onNavigate('dashboard')}>
                    <LayoutDashboard size={20} />
                    <span>Visão</span>
                </button>
                <button className={`bottom-nav-item ${currentPage === 'withdrawals' ? 'active' : ''}`} onClick={() => onNavigate('withdrawals')}>
                    <PackageMinus size={20} />
                    <span>Saídas</span>
                </button>
                <button className={`bottom-nav-item ${currentPage === 'receipts' ? 'active' : ''}`} onClick={() => onNavigate('receipts')}>
                    <PackagePlus size={20} />
                    <span>Entradas</span>
                </button>
                <button className={`bottom-nav-item ${['supplier-returns', 'exchanges', 'photos'].includes(currentPage) ? 'active' : ''}`} onClick={() => setSidebarOpen(true)}>
                    <Menu size={20} />
                    <span>Mais</span>
                </button>
            </nav>
        </div>
    );
}
