import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logActivity } from '../lib/activityLog';
import { Plus, ArrowLeftRight, Send, CheckCircle, ChevronDown, ChevronUp, Camera, Package } from 'lucide-react';

interface CatalogItem { id: string; name: string; unit: string; }
interface Exchange {
    id: number;
    wrong_item_id: string;
    correct_item_id: string;
    quantity: number;
    reason: string;
    status: string;
    requested_at: string;
    sent_at: string | null;
    received_at: string | null;
    notes: string;
    photo_url: string;
    wrong_item?: { name: string };
    correct_item?: { name: string };
}

export default function Exchanges() {
    const { user } = useAuth();
    const [exchanges, setExchanges] = useState<Exchange[]>([]);
    const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [form, setForm] = useState({ wrong_item_id: '', correct_item_id: '', quantity: 1, reason: '', notes: '' });
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        const [r1, r2] = await Promise.all([
            supabase.from('exchanges').select('*, wrong_item:catalog_items!wrong_item_id(name), correct_item:catalog_items!correct_item_id(name)').order('requested_at', { ascending: false }),
            supabase.from('catalog_items').select('id, name, unit').order('name'),
        ]);
        setExchanges(r1.data || []);
        setCatalogItems(r2.data || []);
        setLoading(false);
    };

    const showToast = (msg: string, type = 'success') => {
        setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
    };

    const openNew = () => {
        setForm({ wrong_item_id: '', correct_item_id: '', quantity: 1, reason: '', notes: '' });
        setPhotoFile(null); setPhotoPreview(null);
        setShowModal(true);
    };

    const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
    };

    const handleSave = async () => {
        if (!form.wrong_item_id || !form.reason.trim()) {
            showToast('Preencha o item errado e o motivo', 'error'); return;
        }

        let photo_url = '';
        if (photoFile) {
            const fileName = `exchanges/${Date.now()}_${photoFile.name}`;
            const { error } = await supabase.storage.from('photos').upload(fileName, photoFile);
            if (!error) {
                const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
                photo_url = urlData.publicUrl;
            }
        }

        const { data, error } = await supabase.from('exchanges').insert({
            wrong_item_id: form.wrong_item_id,
            correct_item_id: form.correct_item_id || null,
            quantity: form.quantity,
            reason: form.reason,
            notes: form.notes,
            photo_url,
            created_by: user?.id,
            status: 'pending',
        }).select().single();

        if (error) { showToast('Erro ao registrar troca', 'error'); return; }
        if (data) logActivity(user!.id, 'create', 'exchanges', String(data.id), { reason: form.reason });
        showToast('Solicitação de troca registrada!');
        setShowModal(false);
        fetchAll();
    };

    const updateStatus = async (ex: Exchange, newStatus: string) => {
        const updateData: Record<string, unknown> = { status: newStatus };
        if (newStatus === 'sent') updateData.sent_at = new Date().toISOString();
        if (newStatus === 'received') updateData.received_at = new Date().toISOString();

        await supabase.from('exchanges').update(updateData).eq('id', ex.id);
        logActivity(user!.id, 'update', 'exchanges', String(ex.id), { status: newStatus });
        showToast(newStatus === 'sent' ? 'Marcado como enviado!' : newStatus === 'received' ? 'Item recebido!' : 'Status atualizado!');
        fetchAll();
    };

    const statusBadge = (s: string) => {
        const map: Record<string, { cls: string; label: string }> = {
            pending: { cls: 'badge-yellow', label: '⏳ Pendente' },
            sent: { cls: 'badge-blue', label: '📦 Enviado' },
            received: { cls: 'badge-green', label: '✅ Recebido' },
            closed: { cls: 'badge-purple', label: '🔒 Fechado' },
        };
        const m = map[s] || { cls: 'badge-default', label: s };
        return <span className={`badge ${m.cls}`}>{m.label}</span>;
    };

    const statusActions = (ex: Exchange) => {
        if (ex.status === 'pending') return (
            <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); updateStatus(ex, 'sent'); }}>
                <Send size={14} /> Marcar Enviado
            </button>
        );
        if (ex.status === 'sent') return (
            <button className="btn btn-success btn-sm" onClick={e => { e.stopPropagation(); updateStatus(ex, 'received'); }}>
                <CheckCircle size={14} /> Item Recebido
            </button>
        );
        return null;
    };

    const formatDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

    const reasons = ['Item diferente do pedido', 'Item com defeito', 'Quantidade incorreta', 'Modelo/versão errada', 'Danificado no transporte', 'Outro'];

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>🔄 Trocas / RMA</h1>
                <div className="actions">
                    <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Nova Troca</button>
                </div>
            </div>

            {/* Status summary */}
            <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <div className="stat-card">
                    <div className="stat-value" style={{ color: 'var(--accent-yellow)', fontSize: '24px' }}>{exchanges.filter(e => e.status === 'pending').length}</div>
                    <div className="stat-label">⏳ Pendentes</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value" style={{ color: 'var(--accent-blue)', fontSize: '24px' }}>{exchanges.filter(e => e.status === 'sent').length}</div>
                    <div className="stat-label">📦 Enviados</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value" style={{ color: 'var(--accent-green)', fontSize: '24px' }}>{exchanges.filter(e => e.status === 'received').length}</div>
                    <div className="stat-label">✅ Recebidos</div>
                </div>
            </div>

            {loading ? (
                <div className="empty-state"><p>Carregando...</p></div>
            ) : exchanges.length === 0 ? (
                <div className="empty-state">
                    <ArrowLeftRight size={48} />
                    <p>Nenhuma troca registrada</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {exchanges.map(ex => (
                        <div key={ex.id} className="card" style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                                onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600 }}>Troca #{ex.id}</span>
                                        {statusBadge(ex.status)}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                        <span>❌ {ex.wrong_item?.name || 'Item errado'}</span>
                                        {ex.correct_item?.name && <span> → ✅ {ex.correct_item.name}</span>}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        📅 {formatDate(ex.requested_at)} • Qtd: {ex.quantity}
                                    </div>
                                </div>
                                {statusActions(ex)}
                                {expandedId === ex.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </div>

                            {expandedId === ex.id && (
                                <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>❌ Item Errado</div>
                                            <div style={{ fontWeight: 500 }}>{ex.wrong_item?.name}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>✅ Item Correto</div>
                                            <div style={{ fontWeight: 500 }}>{ex.correct_item?.name || '—'}</div>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Motivo</div>
                                        <div>{ex.reason}</div>
                                    </div>
                                    {ex.notes && (
                                        <div style={{ marginBottom: '12px' }}>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Observações</div>
                                            <div>{ex.notes}</div>
                                        </div>
                                    )}
                                    {ex.photo_url && <img src={ex.photo_url} alt="Foto" style={{ maxWidth: '200px', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }} />}

                                    {/* Timeline */}
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                        <span>📝 Solicitado: {formatDate(ex.requested_at)}</span>
                                        {ex.sent_at && <span>📦 Enviado: {formatDate(ex.sent_at)}</span>}
                                        {ex.received_at && <span>✅ Recebido: {formatDate(ex.received_at)}</span>}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* New Exchange Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal slide-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <h2>🔄 Nova Solicitação de Troca</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="form-group">
                                <label className="form-label">❌ Item Errado (recebido) *</label>
                                <select className="form-select" value={form.wrong_item_id} onChange={e => setForm({ ...form, wrong_item_id: e.target.value })}>
                                    <option value="">Selecione o item que veio errado...</option>
                                    {catalogItems.map(c => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">✅ Item Correto (esperado)</label>
                                <select className="form-select" value={form.correct_item_id} onChange={e => setForm({ ...form, correct_item_id: e.target.value })}>
                                    <option value="">Selecione o item que deveria ter vindo...</option>
                                    {catalogItems.map(c => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
                                </select>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Quantidade *</label>
                                    <input className="form-input" type="number" min="1" value={form.quantity}
                                        onChange={e => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Motivo *</label>
                                    <select className="form-select" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>
                                        <option value="">Selecione...</option>
                                        {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Observações</label>
                                <textarea className="form-textarea" value={form.notes}
                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                    placeholder="Detalhes adicionais sobre o problema..." />
                            </div>

                            <div className="form-group">
                                <label className="form-label">📸 Foto do Item Errado</label>
                                <div className="photo-upload" onClick={() => fileRef.current?.click()}>
                                    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} />
                                    {photoPreview ? <img src={photoPreview} alt="Preview" /> : (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                            <Camera size={32} /><span>Foto do item errado</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave}>Registrar Troca</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
