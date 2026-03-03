import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Plus, Edit2, Trash2, Eye, EyeOff, Shield, User as UserIcon, Save, X } from 'lucide-react';

interface UserRecord {
    id: string;
    username: string;
    display_name: string;
    role: string;
    created_at: string;
}

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function UserManagement() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
    const [form, setForm] = useState({ username: '', display_name: '', password: '', role: 'viewer' });
    const [showPass, setShowPass] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => { fetchUsers(); }, []);

    const fetchUsers = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('users')
            .select('id, username, display_name, role, created_at')
            .order('created_at', { ascending: true });
        setUsers(data || []);
        setLoading(false);
    };

    const showToast = (msg: string, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const openNew = () => {
        setEditingUser(null);
        setForm({ username: '', display_name: '', password: '', role: 'viewer' });
        setShowPass(false);
        setShowModal(true);
    };

    const openEdit = (u: UserRecord) => {
        setEditingUser(u);
        setForm({ username: u.username, display_name: u.display_name, password: '', role: u.role });
        setShowPass(false);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.username.trim()) { showToast('Preencha o usuário', 'error'); return; }
        if (!form.display_name.trim()) { showToast('Preencha o nome', 'error'); return; }

        if (editingUser) {
            // Editing existing user
            const updateData: Record<string, string> = {
                username: form.username.trim().toLowerCase(),
                display_name: form.display_name.trim(),
                role: form.role,
            };

            // Only update password if a new one was provided
            if (form.password.trim()) {
                updateData.password_hash = await hashPassword(form.password);
            }

            const { error } = await supabase
                .from('users')
                .update(updateData)
                .eq('id', editingUser.id);

            if (error) {
                showToast(error.message.includes('duplicate') ? 'Usuário já existe!' : 'Erro ao atualizar', 'error');
                return;
            }
            showToast('Usuário atualizado com sucesso!');
        } else {
            // Creating new user
            if (!form.password.trim()) { showToast('Preencha a senha', 'error'); return; }
            if (form.password.trim().length < 4) { showToast('Senha deve ter no mínimo 4 caracteres', 'error'); return; }

            const password_hash = await hashPassword(form.password);

            const { error } = await supabase
                .from('users')
                .insert({
                    username: form.username.trim().toLowerCase(),
                    display_name: form.display_name.trim(),
                    password_hash,
                    role: form.role,
                });

            if (error) {
                showToast(error.message.includes('duplicate') ? 'Usuário já existe!' : 'Erro ao criar', 'error');
                return;
            }
            showToast('Usuário criado com sucesso!');
        }

        setShowModal(false);
        fetchUsers();
    };

    const handleDelete = async (userId: string) => {
        if (userId === currentUser?.id) {
            showToast('Você não pode excluir sua própria conta!', 'error');
            return;
        }

        const { error } = await supabase.from('users').delete().eq('id', userId);
        if (error) {
            showToast('Erro ao excluir usuário', 'error');
            return;
        }
        showToast('Usuário excluído!');
        setDeleteConfirm(null);
        fetchUsers();
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit'
    });

    if (currentUser?.role !== 'admin') {
        return (
            <div className="empty-state">
                <Shield size={48} style={{ color: 'var(--accent-red)', marginBottom: '12px' }} />
                <p style={{ fontSize: '16px', fontWeight: 600 }}>Acesso Restrito</p>
                <p style={{ color: 'var(--text-muted)' }}>Apenas administradores podem gerenciar usuários.</p>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>🔐 Gerenciar Usuários</h1>
                <div className="actions">
                    <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Usuário</button>
                </div>
            </div>

            {loading ? (
                <div className="empty-state"><p>Carregando...</p></div>
            ) : users.length === 0 ? (
                <div className="empty-state"><p>Nenhum usuário cadastrado</p></div>
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Usuário</th>
                                <th>Nome</th>
                                <th>Perfil</th>
                                <th>Criado em</th>
                                <th style={{ textAlign: 'center' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{
                                                width: '36px', height: '36px', borderRadius: '50%',
                                                background: u.role === 'admin' ? 'var(--gradient-blue)' : 'linear-gradient(135deg, #64748b, #94a3b8)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0
                                            }}>
                                                {u.display_name.charAt(0).toUpperCase()}
                                            </div>
                                            <span style={{ fontWeight: 500 }}>{u.username}</span>
                                        </div>
                                    </td>
                                    <td>{u.display_name}</td>
                                    <td>
                                        <span className={`badge ${u.role === 'admin' ? 'badge-blue' : 'badge-default'}`}
                                            style={u.role !== 'admin' ? { background: 'rgba(148,163,184,0.15)', color: '#94a3b8' } : {}}>
                                            {u.role === 'admin' ? '🛡️ Admin' : '👁️ Visualizador'}
                                        </span>
                                    </td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{formatDate(u.created_at)}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(u)}
                                                title="Editar">
                                                <Edit2 size={15} />
                                            </button>
                                            {u.id !== currentUser?.id && (
                                                deleteConfirm === u.id ? (
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button className="btn btn-ghost btn-sm btn-icon"
                                                            style={{ color: 'var(--accent-red)' }}
                                                            onClick={() => handleDelete(u.id)} title="Confirmar">
                                                            <Trash2 size={15} />
                                                        </button>
                                                        <button className="btn btn-ghost btn-sm btn-icon"
                                                            onClick={() => setDeleteConfirm(null)} title="Cancelar">
                                                            <X size={15} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button className="btn btn-ghost btn-sm btn-icon"
                                                        style={{ color: 'var(--accent-red)' }}
                                                        onClick={() => setDeleteConfirm(u.id)} title="Excluir">
                                                        <Trash2 size={15} />
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal slide-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                        <h2>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="form-group">
                                <label className="form-label">Nome Completo *</label>
                                <input className="form-input" value={form.display_name}
                                    onChange={e => setForm({ ...form, display_name: e.target.value })}
                                    placeholder="Ex: Maria Silva" />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Usuário de Login *</label>
                                <input className="form-input" value={form.username}
                                    onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                                    placeholder="Ex: mariasilva" />
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Sem espaços, apenas letras minúsculas e números
                                </span>
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                    Senha {editingUser ? '(deixe vazio para manter a atual)' : '*'}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input className="form-input"
                                        type={showPass ? 'text' : 'password'}
                                        value={form.password}
                                        onChange={e => setForm({ ...form, password: e.target.value })}
                                        placeholder={editingUser ? 'Nova senha (opcional)' : 'Senha de acesso'}
                                        style={{ paddingRight: '44px' }} />
                                    <button type="button" onClick={() => setShowPass(!showPass)}
                                        style={{
                                            position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer'
                                        }}>
                                        {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Perfil de Acesso</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        className={`btn ${form.role === 'admin' ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => setForm({ ...form, role: 'admin' })}
                                        style={{ flex: 1, justifyContent: 'center' }}>
                                        <Shield size={16} /> Admin
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn ${form.role === 'viewer' ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => setForm({ ...form, role: 'viewer' })}
                                        style={{ flex: 1, justifyContent: 'center' }}>
                                        <UserIcon size={16} /> Visualizador
                                    </button>
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    {form.role === 'admin'
                                        ? '🛡️ Admin: acesso total ao sistema (criar, editar, excluir)'
                                        : '👁️ Visualizador: pode ver dados mas não pode modificar'}
                                </span>
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-success" onClick={handleSave}>
                                <Save size={16} /> {editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
