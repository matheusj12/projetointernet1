import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logActivity } from '../lib/activityLog';
import { exportToExcel } from '../lib/exportExcel';
import { Download, Send, Camera, Printer } from 'lucide-react';

interface QuarantineItem {
    catalog_item_id: string;
    name: string;
    unit: string;
    total_quarantine: number;
    total_returned: number;
    available: number;
}

interface SupplierReturn {
    id: string;
    catalog_item_id: string;
    quantity: number;
    returned_at: string;
    notes: string;
    photo_url: string;
    catalog_item?: { name: string; unit: string };
}

export default function SupplierReturns() {
    const { user } = useAuth();
    const [quarantineItems, setQuarantineItems] = useState<QuarantineItem[]>([]);
    const [returns, setReturns] = useState<SupplierReturn[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState<QuarantineItem | null>(null);
    const [qty, setQty] = useState(0);
    const [notes, setNotes] = useState('');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        const [r1, r2, r3] = await Promise.all([
            supabase.from('receipt_items').select('catalog_item_id, quantity_quarantine, catalog_item:catalog_items(name, unit)'),
            supabase.from('supplier_returns').select('catalog_item_id, quantity'),
            supabase.from('supplier_returns').select('*, catalog_item:catalog_items(name, unit)').order('returned_at', { ascending: false }),
        ]);

        // Aggregate quarantine
        const qMap: Record<string, QuarantineItem> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r1.data || []).forEach((ri: any) => {
            if (ri.quantity_quarantine > 0) {
                if (!qMap[ri.catalog_item_id]) {
                    const cat = Array.isArray(ri.catalog_item) ? ri.catalog_item[0] : ri.catalog_item;
                    qMap[ri.catalog_item_id] = {
                        catalog_item_id: ri.catalog_item_id,
                        name: cat?.name || '',
                        unit: cat?.unit || '',
                        total_quarantine: 0,
                        total_returned: 0,
                        available: 0,
                    };
                }
                qMap[ri.catalog_item_id].total_quarantine += ri.quantity_quarantine;
            }
        });

        // Subtract already returned
        (r2.data || []).forEach((sr: { catalog_item_id: string; quantity: number }) => {
            if (qMap[sr.catalog_item_id]) {
                qMap[sr.catalog_item_id].total_returned += sr.quantity;
            }
        });

        Object.values(qMap).forEach(q => { q.available = q.total_quarantine - q.total_returned; });
        setQuarantineItems(Object.values(qMap).filter(q => q.available > 0));
        setReturns(r3.data || []);
        setLoading(false);
    };

    const showToast = (msg: string, type = 'success') => {
        setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
    };

    const openReturn = (item: QuarantineItem) => {
        setSelectedItem(item);
        setQty(item.available);
        setNotes('');
        setPhotoFile(null);
        setPhotoPreview(null);
        setShowModal(true);
    };

    const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
    };

    const handleSave = async () => {
        if (!selectedItem || qty <= 0) return;

        let photo_url = '';
        if (photoFile) {
            const fileName = `supplier_returns/${Date.now()}_${photoFile.name}`;
            const { error } = await supabase.storage.from('photos').upload(fileName, photoFile);
            if (!error) {
                const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
                photo_url = urlData.publicUrl;
            }
        }

        const { data } = await supabase.from('supplier_returns').insert({
            catalog_item_id: selectedItem.catalog_item_id,
            quantity: qty,
            notes,
            photo_url,
            returned_at: new Date().toISOString(),
        }).select().single();

        if (data) {
            logActivity(user!.id, 'create', 'supplier_returns', data.id, {
                item: selectedItem.name, quantity: qty,
            });
            showToast('Devolução ao fornecedor registrada!');
        }
        setShowModal(false);
        fetchAll();
    };

    const handleExport = () => {
        exportToExcel(
            returns.map(r => ({
                'Data': new Date(r.returned_at).toLocaleString('pt-BR'),
                'Item': r.catalog_item?.name || '',
                'Quantidade': r.quantity,
                'Observações': r.notes || '',
            })),
            'devolucoes_fornecedor',
            'Devoluções'
        );
    };

    const printReceipt = (r: SupplierReturn) => {
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`
      <html><head><title>Comprovante de Devolução</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;max-width:600px;margin:0 auto}h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:10px}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px;border-bottom:1px solid #ddd}.label{font-weight:bold;width:140px}img{max-width:300px;margin:10px 0}.footer{margin-top:40px;text-align:center;font-size:12px;color:#666}</style>
      </head><body>
      <h1>Comprovante de Devolução ao Fornecedor</h1>
      <table>
        <tr><td class="label">Item:</td><td>${r.catalog_item?.name}</td></tr>
        <tr><td class="label">Quantidade:</td><td>${r.quantity} ${r.catalog_item?.unit}</td></tr>
        <tr><td class="label">Data:</td><td>${new Date(r.returned_at).toLocaleString('pt-BR')}</td></tr>
        <tr><td class="label">Observações:</td><td>${r.notes || '—'}</td></tr>
      </table>
      ${r.photo_url ? `<img src="${r.photo_url}" alt="Foto" />` : ''}
      <div style="margin-top:60px;display:flex;justify-content:space-between">
        <div style="border-top:1px solid #333;width:200px;text-align:center;padding-top:5px">Responsável</div>
        <div style="border-top:1px solid #333;width:200px;text-align:center;padding-top:5px">Fornecedor</div>
      </div>
      <div class="footer">Almoxarifado Digital — Gerado em ${new Date().toLocaleString('pt-BR')}</div>
      </body></html>
    `);
        w.document.close();
        w.print();
    };

    const formatDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>🔄 Logística Reversa</h1>
                <div className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={handleExport}><Download size={16} /> Excel</button>
                </div>
            </div>

            {loading ? (
                <div className="empty-state"><p>Carregando...</p></div>
            ) : (
                <>
                    {/* Quarantine items */}
                    <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--accent-yellow)' }}>
                        ⚠️ Itens em Quarentena ({quarantineItems.length})
                    </h3>
                    {quarantineItems.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                            Nenhum item em quarentena 🎉
                        </div>
                    ) : (
                        <div className="table-container" style={{ marginBottom: '32px' }}>
                            <table>
                                <thead><tr><th>Item</th><th>Qtd Quarentena</th><th>Já Devolvido</th><th>Pendente</th><th>Ação</th></tr></thead>
                                <tbody>
                                    {quarantineItems.map(q => (
                                        <tr key={q.catalog_item_id}>
                                            <td><strong>{q.name}</strong> <span style={{ color: 'var(--text-muted)' }}>({q.unit})</span></td>
                                            <td>{q.total_quarantine}</td>
                                            <td>{q.total_returned > 0 ? q.total_returned : '—'}</td>
                                            <td><span className="badge badge-red">{q.available}</span></td>
                                            <td>
                                                <button className="btn btn-warning btn-sm" onClick={() => openReturn(q)}>
                                                    <Send size={14} /> Devolver
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* History */}
                    <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                        📋 Histórico de Devoluções ({returns.length})
                    </h3>
                    {returns.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                            Nenhuma devolução registrada ainda
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {returns.map(r => (
                                <div key={r.id} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600 }}>{r.catalog_item?.name}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px' }}>
                                            <span>📅 {formatDate(r.returned_at)}</span>
                                            <span>📦 {r.quantity} {r.catalog_item?.unit}</span>
                                            {r.notes && <span>📝 {r.notes}</span>}
                                        </div>
                                    </div>
                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => printReceipt(r)} title="Imprimir comprovante">
                                        <Printer size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Modal */}
            {showModal && selectedItem && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal slide-in" onClick={e => e.stopPropagation()}>
                        <h2>Devolver ao Fornecedor</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="card" style={{ background: 'var(--bg-input)', padding: '16px' }}>
                                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{selectedItem.name}</div>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Pendente: {selectedItem.available} {selectedItem.unit}</div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Quantidade a devolver *</label>
                                <input className="form-input" type="number" min="1" max={selectedItem.available} value={qty} onChange={e => setQty(Math.min(parseInt(e.target.value) || 0, selectedItem.available))} />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Observações</label>
                                <textarea className="form-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="NF de devolução, protocolo, etc." />
                            </div>

                            <div className="form-group">
                                <label className="form-label">📸 Foto (comprovante)</label>
                                <div className="photo-upload" onClick={() => fileRef.current?.click()}>
                                    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} />
                                    {photoPreview ? <img src={photoPreview} alt="Preview" /> : (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                            <Camera size={32} /><span>Foto do material defeituoso</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-warning" onClick={handleSave}><Send size={16} /> Registrar Devolução</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
