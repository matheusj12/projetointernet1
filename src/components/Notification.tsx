import { useState, createContext, useContext, useCallback, type ReactNode } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
}

interface NotificationContextType {
    notify: (message: string, type?: Toast['type'], duration?: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

let toastId = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const notify = useCallback((message: string, type: Toast['type'] = 'success', duration = 3000) => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, message, type, duration }]);

        // Play sound for important actions
        if (type === 'success' || type === 'error') {
            try {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                gain.gain.value = 0.08;
                osc.frequency.value = type === 'success' ? 800 : 400;
                osc.type = 'sine';
                osc.start();
                osc.stop(ctx.currentTime + 0.12);
            } catch { /* ignore audio errors */ }
        }

        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const dismiss = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const icons = {
        success: <CheckCircle size={18} />,
        error: <XCircle size={18} />,
        warning: <AlertTriangle size={18} />,
        info: <Info size={18} />,
    };

    const colors = {
        success: { bg: 'rgba(16,185,129,0.95)', border: '#10b981' },
        error: { bg: 'rgba(239,68,68,0.95)', border: '#ef4444' },
        warning: { bg: 'rgba(245,158,11,0.95)', border: '#f59e0b' },
        info: { bg: 'rgba(56,189,248,0.95)', border: '#38bdf8' },
    };

    return (
        <NotificationContext.Provider value={{ notify }}>
            {children}
            <div style={{
                position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
                display: 'flex', flexDirection: 'column-reverse', gap: '8px', maxWidth: '380px',
            }}>
                {toasts.map((toast) => (
                    <div key={toast.id} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '14px 16px', borderRadius: '10px',
                        background: colors[toast.type].bg, color: '#fff',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                        animation: 'toastSlideIn 0.3s ease',
                        fontSize: '14px', fontWeight: 500,
                        borderLeft: `4px solid ${colors[toast.type].border}`,
                        backdropFilter: 'blur(10px)',
                        position: 'relative', overflow: 'hidden',
                    }}>
                        {icons[toast.type]}
                        <span style={{ flex: 1 }}>{toast.message}</span>
                        <button onClick={() => dismiss(toast.id)} style={{
                            background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
                            cursor: 'pointer', padding: '2px', display: 'flex',
                        }}>
                            <X size={14} />
                        </button>
                        {/* Progress bar */}
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px',
                            background: 'rgba(255,255,255,0.3)',
                        }}>
                            <div style={{
                                height: '100%', background: '#fff',
                                animation: `toastProgress ${(toast.duration || 3000) / 1000}s linear`,
                                animationFillMode: 'forwards',
                            }} />
                        </div>
                    </div>
                ))}
            </div>
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    const context = useContext(NotificationContext);
    if (!context) throw new Error('useNotification must be used within NotificationProvider');
    return context;
}
