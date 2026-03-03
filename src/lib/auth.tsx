import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from './supabase';

interface User {
    id: string;
    username: string;
    display_name: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<{ error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem('almox_user');
        if (saved) {
            setUser(JSON.parse(saved));
        }
        setLoading(false);
    }, []);

    const login = async (username: string, password: string) => {
        const passwordHash = await hashPassword(password);

        const { data, error } = await supabase
            .from('users')
            .select('id, username, display_name, role')
            .eq('username', username)
            .eq('password_hash', passwordHash)
            .single();

        if (error || !data) {
            return { error: 'Usuário ou senha incorretos' };
        }

        setUser(data);
        localStorage.setItem('almox_user', JSON.stringify(data));
        return {};
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('almox_user');
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
