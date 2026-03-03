import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logActivity } from '../lib/activityLog';
import { exportToExcel } from '../lib/exportExcel';
import { Plus, Download, Camera, ChevronDown, ChevronUp, Image } from 'lucide-react';

interface CatalogItem { id: string; name: string; unit: string; quantity_purchased: number; category: string; }
interface Receipt {
    id: string; received_by: string; received_at: string; notes: string; photo_url: string;
    person?: { name: string };
    items?: ReceiptItem[];
}
interface ReceiptItem {
    id: string; receipt_id: string; catalog_item_id: string; quantity_ok: number; quantity_quarantine: number; notes: string;
    catalog_item?: { name: string; unit: string };
}

export default function Receipts() {
    const { user } = useAuth();
    const [receipts, setReceipts] = useState<Receipt[]>([]);
    const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
    const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [form, setForm] = useState({ received_by: '', notes: '' });
    const [formItems, setFormItems] = useState<{ catalog_item_id: string; quantity_ok: number; quantity_quarantine: number; notes: string }[]>([]);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        const [r1, r2, r3] = await Promise.all([
            supabase.from('receipts').select('*, person:people!received_by(name)').order('received_at', { ascending: false }),
            supabase.from('catalog_items').select('id, name, unit, quantity_purchased, category').order('name'),
            supabase.from('people').select('id, name').eq('active', true),
        ]);
        setReceipts(r1.data || []);
        setCatalogItems(r2.data || []);
        setPeople(r3.data || []);
        setLoading(false);
    };

    const showToast = (msg: string, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const openNew = () => {
        setForm({ received_by: '', notes: '' });
        setFormItems([{ catalog_item_id: '', quantity_ok: 0, quantity_quarantine: 0, notes: '' }]);
        setPhotoFile(null);
        setPhotoPreview(null);
        setShowModal(true);
    };

    const addItem = () => {
        setFormItems([...formItems, { catalog_item_id: '', quantity_ok: 0, quantity_quarantine: 0, notes: '' }]);
    };

    const removeItem = (idx: number) => {
        setFormItems(formItems.filter((_, i) => i !== idx));
    };

    const updateItem = (idx: number, field: string, value: string | number) => {
        const updated = [...formItems];
        (updated[idx] as Record<string, string | number>)[field] = value;
        setFormItems(updated);
    };

    const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        if (!form.received_by) { showToast('Selecione quem recebeu', 'error'); return; }
        const validItems = formItems.filter(i => i.catalog_item_id && (i.quantity_ok > 0 || i.quantity_quarantine > 0));
        if (validItems.length === 0) { showToast('Adicione pelo menos 1 item', 'error'); return; }

        let photo_url = '';
        if (photoFile) {
            const fileName = `receipts/${Date.now()}_${photoFile.name}`;
            const { error } = await supabase.storage.from('photos').upload(fileName, photoFile);
            if (!error) {
                const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
                photo_url = urlData.publicUrl;
            }
        }

        const { data: receipt } = await supabase.from('receipts').insert({
            received_by: form.received_by,
            notes: form.notes,
            photo_url,
            received_at: new Date().toISOString(),
        }).select().single();

        if (receipt) {
            const items = validItems.map(i => ({ ...i, receipt_id: receipt.id }));
            await supabase.from('receipt_items').insert(items);
            logActivity(user!.id, 'create', 'receipts', receipt.id, {
                items: validItems.length,
                total_ok: validItems.reduce((s, i) => s + i.quantity_ok, 0),
                total_quarantine: validItems.reduce((s, i) => s + i.quantity_quarantine, 0),
            });
            showToast('Recebimento registrado!');
        }
        setShowModal(false);
        fetchAll();
    };

    const loadReceiptItems = async (receiptId: string) => {
        if (expandedId === receiptId) { setExpandedId(null); return; }
        const { data } = await supabase.from('receipt_items')
            .select('*, catalog_item:catalog_items(name, unit)')
            .eq('receipt_id', receiptId);
        setReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, items: data || [] } : r));
        setExpandedId(receiptId);
    };

    const handleExport = () => {
        exportToExcel(
            receipts.map(r => ({
                Data: new Date(r.received_at).toLocaleString('pt-BR'),
                'Recebido Por': r.person?.name || '',
                Observações: r.notes || '',
            })),
            'entradas_material',
            'Entradas'
        );
    };

    const formatDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>📥 Entradas de Material</h1>
                <div className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={handleExport}><Download size={16} /> Excel</button>
                    <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Recebimento</button>
                </div>
            </div>

            {loading ? (
                <div className="empty-state"><p>Carregando...</p></div>
            ) : receipts.length === 0 ? (
                <div className="empty-state"><p>Nenhum recebimento registrado</p></div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {receipts.map(r => (
                        <div key={r.id} className="card" style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => loadReceiptItems(r.id)}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600 }}>
                                        Recebimento #{r.id.slice(0, 8)}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px' }}>
                                        <span>📅 {formatDate(r.received_at)}</span>
                                        <span>👤 {r.person?.name || '—'}</span>
                                        {r.notes && <span>📝 {r.notes}</span>}
                                    </div>
                                </div>
                                {r.photo_url && <Image size={18} style={{ color: 'var(--accent-blue)' }} />}
                                {expandedId === r.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </div>

                            {expandedId === r.id && r.items && (
                                <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                    {r.photo_url && (
                                        <img src={r.photo_url} alt="Foto do recebimento" style={{ maxWidth: '200px', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }} />
                                    )}
                                    <table style={{ width: '100%' }}>
                                        <thead><tr><th>Item</th><th>Qtd OK</th><th>Quarentena</th><th>Obs</th></tr></thead>
                                        <tbody>
                                            {r.items.map(item => (
                                                <tr key={item.id}>
                                                    <td>{item.catalog_item?.name}</td>
                                                    <td><span className="badge badge-green">{item.quantity_ok}</span></td>
                                                    <td>{item.quantity_quarantine > 0 && <span className="badge badge-red">{item.quantity_quarantine}</span>}</td>
                                                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.notes || '—'}</td>
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

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal slide-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                        <h2>Novo Recebimento</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Recebido por *</label>
                                    <select className="form-select" value={form.received_by} onChange={e => setForm({ ...form, received_by: e.target.value })}>
                                        <option value="">Selecione...</option>
                                        {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Observações (NF, transportadora)</label>
                                    <input className="form-input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Ex: NF 12345" />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">📸 Foto do Recebimento</label>
                                <div className="photo-upload" onClick={() => fileRef.current?.click()}>
                                    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} />
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Preview" />
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                            <Camera size={32} />
                                            <span>Toque para tirar foto ou selecionar</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <label className="form-label">Itens Recebidos</label>
                                    <button className="btn btn-ghost btn-sm" onClick={addItem}><Plus size={14} /> Adicionar Item</button>
                                </div>
                                {formItems.map((item, idx) => (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'end' }}>
                                        <div className="form-group">
                                            {idx === 0 && <label className="form-label" style={{ fontSize: '11px' }}>Item</label>}
                                            <select className="form-select" value={item.catalog_item_id} onChange={e => updateItem(idx, 'catalog_item_id', e.target.value)}>
                                                <option value="">Selecione...</option>
                                                {catalogItems.map(c => <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            {idx === 0 && <label className="form-label" style={{ fontSize: '11px' }}>Qtd OK</label>}
                                            <input className="form-input" type="number" min="0" value={item.quantity_ok} onChange={e => updateItem(idx, 'quantity_ok', parseInt(e.target.value) || 0)} />
                                        </div>
                                        <div className="form-group">
                                            {idx === 0 && <label className="form-label" style={{ fontSize: '11px' }}>Quarentena</label>}
                                            <input className="form-input" type="number" min="0" value={item.quantity_quarantine} onChange={e => updateItem(idx, 'quantity_quarantine', parseInt(e.target.value) || 0)} />
                                        </div>
                                        {formItems.length > 1 && (
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeItem(idx)} style={{ color: 'var(--accent-red)', marginBottom: '2px' }}>✕</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-success" onClick={handleSave}>Registrar Recebimento</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
