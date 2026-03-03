import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logActivity } from '../lib/activityLog';
import { exportToExcel } from '../lib/exportExcel';
import { generateWithdrawalsPDF } from '../lib/pdfReport';
import { Plus, Download, Camera, RotateCcw, ChevronDown, ChevronUp, AlertCircle, FileText } from 'lucide-react';

interface Person { id: string; name: string; role: string; }
interface CatalogItem { id: string; name: string; unit: string; }
interface WithdrawalItem {
    id: string; withdrawal_id: number; catalog_item_id: string; quantity_taken: number; quantity_returned: number; returned_at: string | null;
    catalog_item?: { name: string; unit: string };
}
interface Withdrawal {
    id: number; technician_id: string; authorized_by: string; withdrawn_at: string; status: string; notes: string; photo_url: string;
    technician?: { name: string }; authorizer?: { name: string };
    items?: WithdrawalItem[];
}

export default function Withdrawals() {
    const { user } = useAuth();
    const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNewModal, setShowNewModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [form, setForm] = useState({ technician_id: '', authorized_by: '', notes: '' });
    const [formItems, setFormItems] = useState<{ catalog_item_id: string; quantity_taken: number }[]>([]);
    const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [stockMap, setStockMap] = useState<Record<string, number>>({});
    const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        const [r1, r2, r3] = await Promise.all([
            supabase.from('withdrawals').select('*, technician:people!technician_id(name), authorizer:people!authorized_by(name)').order('withdrawn_at', { ascending: false }),
            supabase.from('people').select('id, name, role').eq('active', true),
            supabase.from('catalog_items').select('id, name, unit'),
        ]);
        setWithdrawals(r1.data || []);
        setPeople(r2.data || []);
        setCatalogItems(r3.data || []);

        // Calculate available stock
        const [recOk, wdItems] = await Promise.all([
            supabase.from('receipt_items').select('catalog_item_id, quantity_ok'),
            supabase.from('withdrawal_items').select('catalog_item_id, quantity_taken, quantity_returned'),
        ]);

        const stock: Record<string, number> = {};
        (recOk.data || []).forEach((r: { catalog_item_id: string; quantity_ok: number }) => {
            stock[r.catalog_item_id] = (stock[r.catalog_item_id] || 0) + r.quantity_ok;
        });
        (wdItems.data || []).forEach((w: { catalog_item_id: string; quantity_taken: number; quantity_returned: number }) => {
            stock[w.catalog_item_id] = (stock[w.catalog_item_id] || 0) - w.quantity_taken + w.quantity_returned;
        });
        setStockMap(stock);
        setLoading(false);
    };

    const showToast = (msg: string, type = 'success') => {
        setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
    };

    const openNew = () => {
        setForm({ technician_id: '', authorized_by: '', notes: '' });
        setFormItems([{ catalog_item_id: '', quantity_taken: 0 }]);
        setPhotoFile(null); setPhotoPreview(null);
        setShowNewModal(true);
    };

    const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
    };

    const handleSave = async () => {
        if (!form.technician_id || !form.authorized_by) { showToast('Selecione técnico e autorizador', 'error'); return; }
        const validItems = formItems.filter(i => i.catalog_item_id && i.quantity_taken > 0);
        if (validItems.length === 0) { showToast('Adicione pelo menos 1 item', 'error'); return; }

        // Validate stock
        for (const item of validItems) {
            const available = stockMap[item.catalog_item_id] || 0;
            if (item.quantity_taken > available) {
                const catItem = catalogItems.find(c => c.id === item.catalog_item_id);
                showToast(`Estoque insuficiente para "${catItem?.name}". Disponível: ${available}`, 'error');
                return;
            }
        }

        let photo_url = '';
        if (photoFile) {
            const fileName = `withdrawals/${Date.now()}_${photoFile.name}`;
            const { error } = await supabase.storage.from('photos').upload(fileName, photoFile);
            if (!error) {
                const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
                photo_url = urlData.publicUrl;
            }
        }

        const { data: wd } = await supabase.from('withdrawals').insert({
            technician_id: form.technician_id,
            authorized_by: form.authorized_by,
            notes: form.notes,
            photo_url,
            status: 'open',
            withdrawn_at: new Date().toISOString(),
        }).select().single();

        if (wd) {
            const items = validItems.map(i => ({ ...i, withdrawal_id: wd.id, quantity_returned: 0 }));
            await supabase.from('withdrawal_items').insert(items);
            const tech = people.find(p => p.id === form.technician_id);
            logActivity(user!.id, 'create', 'withdrawals', String(wd.id), {
                technician: tech?.name, items: validItems.length,
            });
            showToast('Cautela registrada!');
        }
        setShowNewModal(false);
        fetchAll();
    };

    const openReturn = async (w: Withdrawal) => {
        const { data } = await supabase.from('withdrawal_items')
            .select('*, catalog_item:catalog_items(name, unit)')
            .eq('withdrawal_id', w.id);
        setSelectedWithdrawal({ ...w, items: data || [] });
        const qtys: Record<string, number> = {};
        (data || []).forEach((i: WithdrawalItem) => { qtys[i.id] = 0; });
        setReturnQtys(qtys);
        setShowReturnModal(true);
    };

    const handleReturn = async () => {
        if (!selectedWithdrawal?.items) return;
        for (const item of selectedWithdrawal.items) {
            const qty = returnQtys[item.id] || 0;
            if (qty > 0) {
                const newReturned = item.quantity_returned + qty;
                await supabase.from('withdrawal_items').update({
                    quantity_returned: newReturned,
                    returned_at: new Date().toISOString(),
                }).eq('id', item.id);
            }
        }

        // Update withdrawal status
        const { data: updatedItems } = await supabase.from('withdrawal_items')
            .select('quantity_taken, quantity_returned')
            .eq('withdrawal_id', selectedWithdrawal.id);

        const allReturned = (updatedItems || []).every((i: { quantity_taken: number; quantity_returned: number }) => i.quantity_returned >= i.quantity_taken);
        const someReturned = (updatedItems || []).some((i: { quantity_taken: number; quantity_returned: number }) => i.quantity_returned > 0);

        await supabase.from('withdrawals').update({
            status: allReturned ? 'returned' : someReturned ? 'partial' : 'open',
        }).eq('id', selectedWithdrawal.id);

        logActivity(user!.id, 'update', 'withdrawals', String(selectedWithdrawal.id), { action: 'return' });
        showToast('Devolução registrada!');
        setShowReturnModal(false);
        fetchAll();
    };

    const loadItems = async (wdId: number) => {
        if (expandedId === wdId) { setExpandedId(null); return; }
        const { data } = await supabase.from('withdrawal_items')
            .select('*, catalog_item:catalog_items(name, unit)')
            .eq('withdrawal_id', wdId);
        setWithdrawals(prev => prev.map(w => w.id === wdId ? { ...w, items: data || [] } : w));
        setExpandedId(wdId);
    };

    const handleExport = () => {
        exportToExcel(
            withdrawals.map(w => ({
                'Ticket': w.id,
                'Data': new Date(w.withdrawn_at).toLocaleString('pt-BR'),
                'Técnico': w.technician?.name || '',
                'Autorizador': w.authorizer?.name || '',
                'Status': w.status === 'open' ? 'Aberto' : w.status === 'partial' ? 'Parcial' : 'Devolvido',
                'Obs': w.notes || '',
            })),
            'cautelas_saida',
            'Cautelas'
        );
    };

    const handleExportPDF = async () => {
        await generateWithdrawalsPDF();
    };

    const statusBadge = (s: string) => {
        if (s === 'returned') return <span className="badge badge-green">✅ Devolvido</span>;
        if (s === 'partial') return <span className="badge badge-yellow">⚠️ Parcial</span>;
        return <span className="badge badge-red">🔴 Aberto</span>;
    };

    const technicians = people.filter(p => p.role === 'technician');
    const authorizers = people.filter(p => p.role === 'authorizer');
    const formatDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>📤 Saídas / Cautela</h1>
                <div className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={handleExport}><Download size={16} /> Excel</button>
                    <button className="btn btn-ghost btn-sm" onClick={handleExportPDF} style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}><FileText size={16} /> Relatório PDF</button>
                    <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Nova Cautela</button>
                </div>
            </div>

            {loading ? (
                <div className="empty-state"><p>Carregando...</p></div>
            ) : withdrawals.length === 0 ? (
                <div className="empty-state"><p>Nenhuma cautela registrada</p></div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {withdrawals.map(w => (
                        <div key={w.id} className="card" style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => loadItems(w.id)}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600 }}>Ticket #{w.id}</span>
                                        {statusBadge(w.status)}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px' }}>
                                        <span>📅 {formatDate(w.withdrawn_at)}</span>
                                        <span>🔧 {w.technician?.name}</span>
                                        <span>🔑 {w.authorizer?.name}</span>
                                    </div>
                                </div>
                                {w.status !== 'returned' && (
                                    <button className="btn btn-warning btn-sm" onClick={e => { e.stopPropagation(); openReturn(w); }}>
                                        <RotateCcw size={14} /> Devolver
                                    </button>
                                )}
                                {expandedId === w.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </div>

                            {expandedId === w.id && w.items && (
                                <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                    {w.photo_url && <img src={w.photo_url} alt="Foto" style={{ maxWidth: '200px', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }} />}
                                    <table style={{ width: '100%' }}>
                                        <thead><tr><th>Item</th><th>Retirado</th><th>Devolvido</th><th>Em campo</th></tr></thead>
                                        <tbody>
                                            {w.items.map(item => (
                                                <tr key={item.id}>
                                                    <td>{item.catalog_item?.name}</td>
                                                    <td>{item.quantity_taken}</td>
                                                    <td>{item.quantity_returned > 0 ? <span className="badge badge-green">{item.quantity_returned}</span> : '—'}</td>
                                                    <td><strong>{item.quantity_taken - item.quantity_returned}</strong></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* New Withdrawal Modal */}
            {showNewModal && (
                <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
                    <div className="modal slide-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                        <h2>Nova Cautela (Ticket de Saída)</h2>
                        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', fontSize: '13px', color: 'var(--accent-blue)', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <AlertCircle size={16} /> Regra das Duas Pontas: técnico + autorizador obrigatórios
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">🔧 Técnico (quem retira) *</label>
                                    <select className="form-select" value={form.technician_id} onChange={e => setForm({ ...form, technician_id: e.target.value })}>
                                        <option value="">Selecione...</option>
                                        {technicians.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">🔑 Autorizador (quem entrega) *</label>
                                    <select className="form-select" value={form.authorized_by} onChange={e => setForm({ ...form, authorized_by: e.target.value })}>
                                        <option value="">Selecione...</option>
                                        {authorizers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Observações</label>
                                <input className="form-input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Local de instalação, andar, etc." />
                            </div>

                            <div className="form-group">
                                <label className="form-label">📸 Foto</label>
                                <div className="photo-upload" onClick={() => fileRef.current?.click()}>
                                    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} />
                                    {photoPreview ? <img src={photoPreview} alt="Preview" /> : (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                            <Camera size={32} /><span>Foto do material</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label className="form-label">Itens para Retirada</label>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setFormItems([...formItems, { catalog_item_id: '', quantity_taken: 0 }])}>
                                        <Plus size={14} /> Item
                                    </button>
                                </div>
                                {formItems.map((item, idx) => (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px auto', gap: '8px', marginBottom: '8px', alignItems: 'end' }}>
                                        <div className="form-group">
                                            {idx === 0 && <label className="form-label" style={{ fontSize: '11px' }}>Item</label>}
                                            <select className="form-select" value={item.catalog_item_id} onChange={e => {
                                                const updated = [...formItems]; updated[idx].catalog_item_id = e.target.value; setFormItems(updated);
                                            }}>
                                                <option value="">Selecione...</option>
                                                {catalogItems.map(c => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            {idx === 0 && <label className="form-label" style={{ fontSize: '11px' }}>Quantidade</label>}
                                            <input className="form-input" type="number" min="0" value={item.quantity_taken}
                                                onChange={e => { const updated = [...formItems]; updated[idx].quantity_taken = parseInt(e.target.value) || 0; setFormItems(updated); }} />
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', paddingBottom: '10px' }}>
                                            Disp: {item.catalog_item_id ? (stockMap[item.catalog_item_id] || 0) : '—'}
                                        </div>
                                        {formItems.length > 1 && (
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))} style={{ color: 'var(--accent-red)', marginBottom: '2px' }}>✕</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowNewModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave}>Registrar Cautela</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Return Modal */}
            {showReturnModal && selectedWithdrawal?.items && (
                <div className="modal-overlay" onClick={() => setShowReturnModal(false)}>
                    <div className="modal slide-in" onClick={e => e.stopPropagation()}>
                        <h2>Devolução — Ticket #{selectedWithdrawal.id}</h2>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            Técnico: <strong>{selectedWithdrawal.technician?.name}</strong>
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {selectedWithdrawal.items.filter(i => i.quantity_taken > i.quantity_returned).map(item => (
                                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 500 }}>{item.catalog_item?.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            Levou: {item.quantity_taken} | Já devolveu: {item.quantity_returned} | Pendente: {item.quantity_taken - item.quantity_returned}
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontSize: '11px' }}>Devolvendo</label>
                                        <input className="form-input" type="number" min="0" max={item.quantity_taken - item.quantity_returned}
                                            value={returnQtys[item.id] || 0}
                                            onChange={e => setReturnQtys({ ...returnQtys, [item.id]: Math.min(parseInt(e.target.value) || 0, item.quantity_taken - item.quantity_returned) })} />
                                    </div>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setReturnQtys({ ...returnQtys, [item.id]: item.quantity_taken - item.quantity_returned })}>
                                        Tudo
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowReturnModal(false)}>Cancelar</button>
                            <button className="btn btn-success" onClick={handleReturn}><RotateCcw size={16} /> Registrar Devolução</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
