import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logActivity } from '../lib/activityLog';
import { Plus, Edit2, Trash2, Phone, UserCheck, Wrench } from 'lucide-react';

interface Person {
    id: string;
    name: string;
    role: 'authorizer' | 'technician';
    phone: string;
    active: boolean;
    created_at: string;
}

export default function People() {
    const { user } = useAuth();
    const [people, setPeople] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Person | null>(null);
    const [form, setForm] = useState({ name: '', role: 'technician' as string, phone: '' });
    const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

    useEffect(() => { fetchPeople(); }, []);

    const fetchPeople = async () => {
        setLoading(true);
        const { data } = await supabase.from('people').select('*').order('name');
        setPeople(data || []);
        setLoading(false);
    };

    const showToast = (msg: string, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const openNew = () => {
        setEditing(null);
        setForm({ name: '', role: 'technician', phone: '' });
        setShowModal(true);
    };

    const openEdit = (p: Person) => {
        setEditing(p);
        setForm({ name: p.name, role: p.role, phone: p.phone || '' });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        if (editing) {
            await supabase.from('people').update(form).eq('id', editing.id);
            logActivity(user!.id, 'update', 'people', editing.id, { name: form.name });
            showToast('Pessoa atualizada!');
        } else {
            const { data } = await supabase.from('people').insert(form).select().single();
            if (data) logActivity(user!.id, 'create', 'people', data.id, { name: form.name });
            showToast('Pessoa cadastrada!');
        }
        setShowModal(false);
        fetchPeople();
    };

    const toggleActive = async (p: Person) => {
        await supabase.from('people').update({ active: !p.active }).eq('id', p.id);
        logActivity(user!.id, 'update', 'people', p.id, { name: p.name, active: !p.active });
        showToast(p.active ? 'Desativado' : 'Ativado');
        fetchPeople();
    };

    const handleDelete = async (p: Person) => {
        if (!confirm(`Excluir "${p.name}"?`)) return;
        await supabase.from('people').delete().eq('id', p.id);
        logActivity(user!.id, 'delete', 'people', p.id, { name: p.name });
        showToast('Pessoa removida!', 'error');
        fetchPeople();
    };

    const authorizers = people.filter(p => p.role === 'authorizer');
    const technicians = people.filter(p => p.role === 'technician');

    const renderCard = (p: Person) => (
        <div key={p.id} className="card" style={{ opacity: p.active ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: '16px', padding: '16px' }}>
            <div style={{
                width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0,
                background: p.role === 'authorizer' ? 'var(--gradient-blue)' : 'var(--gradient-green)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: 700, color: '#fff'
            }}>
                {p.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{p.name}</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                    <span className={`badge ${p.role === 'authorizer' ? 'badge-blue' : 'badge-green'}`}>
                        {p.role === 'authorizer' ? '🔑 Autorizador' : '🔧 Técnico'}
                    </span>
                    {p.phone && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Phone size={12} /> {p.phone}
                        </span>
                    )}
                    {!p.active && <span className="badge badge-red">Inativo</span>}
                </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => toggleActive(p)} title={p.active ? 'Desativar' : 'Ativar'}>
                    {p.active ? '🟢' : '🔴'}
                </button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(p)}><Edit2 size={15} /></button>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(p)} style={{ color: 'var(--accent-red)' }}><Trash2 size={15} /></button>
            </div>
        </div>
    );

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>👥 Gestão de Pessoas</h1>
                <div className="actions">
                    <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Nova Pessoa</button>
                </div>
            </div>

            {loading ? (
                <div className="empty-state"><p>Carregando...</p></div>
            ) : (
                <>
                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '16px', color: 'var(--accent-blue)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserCheck size={20} /> Autorizadores ({authorizers.length})
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {authorizers.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Nenhum autorizador cadastrado</p> : authorizers.map(renderCard)}
                        </div>
                    </div>
                    <div>
                        <h3 style={{ fontSize: '16px', color: 'var(--accent-green)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Wrench size={20} /> Técnicos ({technicians.length})
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {technicians.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Nenhum técnico cadastrado</p> : technicians.map(renderCard)}
                        </div>
                    </div>
                </>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal slide-in" onClick={e => e.stopPropagation()}>
                        <h2>{editing ? 'Editar Pessoa' : 'Nova Pessoa'}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="form-group">
                                <label className="form-label">Nome Completo *</label>
                                <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" autoFocus />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Função *</label>
                                    <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                        <option value="technician">🔧 Técnico</option>
                                        <option value="authorizer">🔑 Autorizador</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Telefone</label>
                                    <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" />
                                </div>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Salvar' : 'Cadastrar'}</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
