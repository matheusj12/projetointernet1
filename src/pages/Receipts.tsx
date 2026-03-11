import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logActivity } from '../lib/activityLog';
import { exportToExcel } from '../lib/exportExcel';
import {
  Plus, Download, Camera, ChevronDown, ChevronUp,
  Image, Search, X, AlertTriangle, Package, RefreshCw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  name: string;
  unit: string;
  category: string;
}

interface ReceiptItem {
  id: string;
  receipt_id: string;
  catalog_item_id: string;
  quantity_ok: number;
  quantity_quarantine: number;
  notes: string;
  catalog_item?: { name: string; unit: string };
}

interface Receipt {
  id: string;
  received_by: string;
  received_at: string;
  notes: string;
  photo_url: string;
  person?: { name: string };
  items?: ReceiptItem[];
  _loadingItems?: boolean;
}

interface FormItem {
  catalog_item_id: string;
  quantity_ok: number;
  quantity_quarantine: number;
  notes: string;
}

const EMPTY_FORM_ITEM: FormItem = {
  catalog_item_id: '',
  quantity_ok: 0,
  quantity_quarantine: 0,
  notes: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (d: string) =>
  new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

const sanitizeFileName = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ height: '16px', width: '40%', background: 'var(--border-color)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
          <div style={{ height: '13px', width: '60%', background: 'var(--border-color)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
        </div>
        <div style={{ width: '20px', height: '20px', background: 'var(--border-color)', borderRadius: '4px' }} />
      </div>
    </div>
  );
}

function QuarantineWarning({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      background: 'rgba(248,113,113,0.15)', color: 'var(--accent-red)',
      padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 500,
    }}>
      <AlertTriangle size={11} />
      {count} quarentena
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Receipts() {
  const { user } = useAuth();

  // Data
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Form state
  const [form, setForm] = useState({ received_by: '', notes: '' });
  const [formItems, setFormItems] = useState<FormItem[]>([{ ...EMPTY_FORM_ITEM }]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [r1, r2, r3] = await Promise.all([
      supabase
        .from('receipts')
        .select('*, person:people!received_by(name)')
        .order('received_at', { ascending: false }),
      supabase.from('catalog_items').select('id, name, unit, category').order('name'),
      supabase.from('people').select('id, name').eq('active', true).order('name'),
    ]);
    setReceipts(r1.data || []);
    setCatalogItems(r2.data || []);
    setPeople(r3.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Toast ───────────────────────────────────────────────────────────────────

  const showToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── Modal helpers ────────────────────────────────────────────────────────────

  const openNew = () => {
    setForm({ received_by: '', notes: '' });
    setFormItems([{ ...EMPTY_FORM_ITEM }]);
    setPhotoFile(null);
    setPhotoPreview(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
  };

  // ─── Form items ───────────────────────────────────────────────────────────────

  const addItem = () =>
    setFormItems(prev => [...prev, { ...EMPTY_FORM_ITEM }]);

  const removeItem = (idx: number) =>
    setFormItems(prev => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof FormItem, value: string | number) =>
    setFormItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  // ─── Photo ────────────────────────────────────────────────────────────────────

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('Foto muito grande. Máximo 10MB.', 'error');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const clearPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // ─── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.received_by) { showToast('Selecione quem recebeu', 'error'); return; }

    const validItems = formItems.filter(
      i => i.catalog_item_id && (i.quantity_ok > 0 || i.quantity_quarantine > 0)
    );
    if (validItems.length === 0) {
      showToast('Adicione pelo menos 1 item com quantidade', 'error');
      return;
    }

    // Detect duplicate items
    const ids = validItems.map(i => i.catalog_item_id);
    if (new Set(ids).size !== ids.length) {
      showToast('Existem itens duplicados na lista', 'warning');
      return;
    }

    setSaving(true);

    try {
      // Upload photo
      let photo_url = '';
      if (photoFile) {
        const safeName = sanitizeFileName(photoFile.name);
        const fileName = `receipts/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, photoFile, { cacheControl: '3600', upsert: false });

        if (uploadError) {
          showToast(`Erro no upload da foto: ${uploadError.message}`, 'error');
          setSaving(false);
          return;
        }
        const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
        photo_url = urlData.publicUrl;
      }

      // Insert receipt
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          received_by: form.received_by,
          notes: form.notes.trim(),
          photo_url,
          received_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (receiptError || !receipt) {
        showToast(`Erro ao registrar: ${receiptError?.message || 'Tente novamente'}`, 'error');
        setSaving(false);
        return;
      }

      // Insert items
      const { error: itemsError } = await supabase
        .from('receipt_items')
        .insert(validItems.map(i => ({ ...i, receipt_id: receipt.id })));

      if (itemsError) {
        showToast(`Recebimento salvo, mas erro nos itens: ${itemsError.message}`, 'warning');
      } else {
        const totalOk = validItems.reduce((s, i) => s + i.quantity_ok, 0);
        const totalQ = validItems.reduce((s, i) => s + i.quantity_quarantine, 0);
        logActivity(user!.id, 'create', 'receipts', receipt.id, {
          items: validItems.length,
          total_ok: totalOk,
          total_quarantine: totalQ,
        });
        showToast('✅ Recebimento registrado com sucesso!');
      }

      setShowModal(false);
      fetchAll();
    } finally {
      setSaving(false);
    }
  };

  // ─── Expand receipt items ────────────────────────────────────────────────────

  const loadReceiptItems = async (receiptId: string) => {
    if (expandedId === receiptId) { setExpandedId(null); return; }

    // Optimistic loading indicator
    setReceipts(prev =>
      prev.map(r => r.id === receiptId ? { ...r, _loadingItems: true } : r)
    );
    setExpandedId(receiptId);

    const { data, error } = await supabase
      .from('receipt_items')
      .select('*, catalog_item:catalog_items(name, unit)')
      .eq('receipt_id', receiptId);

    if (error) {
      showToast('Erro ao carregar itens', 'error');
      setExpandedId(null);
    }

    setReceipts(prev =>
      prev.map(r =>
        r.id === receiptId ? { ...r, items: data || [], _loadingItems: false } : r
      )
    );
  };

  // ─── Export ───────────────────────────────────────────────────────────────────

  const handleExport = () => {
    if (receipts.length === 0) { showToast('Nenhum dado para exportar', 'warning'); return; }
    exportToExcel(
      receipts.map(r => ({
        Data: formatDate(r.received_at),
        'Recebido Por': r.person?.name || '—',
        Observações: r.notes || '',
        'Com Foto': r.photo_url ? 'Sim' : 'Não',
      })),
      'entradas_material',
      'Entradas'
    );
    showToast('📊 Exportado com sucesso!');
  };

  // ─── Filter ────────────────────────────────────────────────────────────────

  const filtered = receipts.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.person?.name?.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q)
    );
  });

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fade-in">
      {/* ── Header ── */}
      <div className="page-header">
        <h1>📥 Entradas de Material</h1>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={loading}>
            <Download size={16} /> Excel
          </button>
          <button className="btn btn-ghost btn-sm" onClick={fetchAll} disabled={loading} title="Atualizar">
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={18} /> Novo Recebimento
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      {!loading && receipts.length > 0 && (
        <div style={{ position: 'relative', marginBottom: '16px', maxWidth: '400px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            className="form-input"
            style={{ paddingLeft: '36px' }}
            placeholder="Buscar por pessoa, observação..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3].map(n => <SkeletonRow key={n} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Package size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <p>{search ? `Nenhum resultado para "${search}"` : 'Nenhum recebimento registrado'}</p>
          {!search && (
            <button className="btn btn-primary" onClick={openNew} style={{ marginTop: '16px' }}>
              <Plus size={16} /> Registrar primeiro recebimento
            </button>
          )}
        </div>
      ) : (
        <>
          {search && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(r => {
              const quarantineTotal = r.items?.reduce((s, i) => s + i.quantity_quarantine, 0) ?? 0;
              const isExpanded = expandedId === r.id;

              return (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    padding: '16px',
                    borderColor: isExpanded ? 'var(--accent-blue)' : undefined,
                    transition: 'border-color 0.2s',
                  }}
                >
                  {/* ── Receipt header row ── */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                    onClick={() => loadReceiptItems(r.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>Recebimento #{r.id.slice(0, 8)}</span>
                        {quarantineTotal > 0 && <QuarantineWarning count={quarantineTotal} />}
                      </div>
                      <div style={{
                        fontSize: '13px', color: 'var(--text-secondary)',
                        display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px',
                      }}>
                        <span>📅 {formatDate(r.received_at)}</span>
                        <span>👤 {r.person?.name || '—'}</span>
                        {r.notes && <span>📝 {r.notes}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {r.photo_url && <Image size={16} style={{ color: 'var(--accent-blue)' }} />}
                      {r._loadingItems ? (
                        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
                      ) : isExpanded ? (
                        <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} />
                      ) : (
                        <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                  </div>

                  {/* ── Expanded items ── */}
                  {isExpanded && r.items && !r._loadingItems && (
                    <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      {r.photo_url && (
                        <a href={r.photo_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={r.photo_url}
                            alt="Foto do recebimento"
                            style={{ maxWidth: '200px', borderRadius: 'var(--radius-sm)', marginBottom: '12px', display: 'block' }}
                          />
                        </a>
                      )}
                      {r.items.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nenhum item registrado.</p>
                      ) : (
                        <div className="table-container">
                          <table>
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th>Unidade</th>
                                <th>Qtd OK</th>
                                <th>Quarentena</th>
                                <th>Obs</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.items.map(item => (
                                <tr key={item.id}>
                                  <td>{item.catalog_item?.name || '—'}</td>
                                  <td style={{ color: 'var(--text-muted)' }}>{item.catalog_item?.unit || '—'}</td>
                                  <td>
                                    <span className="badge badge-green">{item.quantity_ok}</span>
                                  </td>
                                  <td>
                                    {item.quantity_quarantine > 0 ? (
                                      <span className="badge badge-red">
                                        <AlertTriangle size={10} style={{ marginRight: '3px' }} />
                                        {item.quantity_quarantine}
                                      </span>
                                    ) : '—'}
                                  </td>
                                  <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {item.notes || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal slide-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <h2>📦 Novo Recebimento</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Row 1: person + notes */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Recebido por *</label>
                  <select
                    className="form-select"
                    value={form.received_by}
                    onChange={e => setForm({ ...form, received_by: e.target.value })}
                    disabled={saving}
                  >
                    <option value="">Selecione...</option>
                    {people.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Observações (NF, transportadora)</label>
                  <input
                    className="form-input"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Ex: NF 12345"
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Photo upload */}
              <div className="form-group">
                <label className="form-label">📸 Foto do Recebimento</label>
                <div
                  className="photo-upload"
                  onClick={() => !saving && fileRef.current?.click()}
                  style={{ opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhoto}
                    disabled={saving}
                    style={{ display: 'none' }}
                  />
                  {photoPreview ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={photoPreview} alt="Preview" style={{ maxHeight: '150px', borderRadius: 'var(--radius-sm)' }} />
                      <button
                        onClick={clearPhoto}
                        style={{
                          position: 'absolute', top: '-8px', right: '-8px',
                          background: 'var(--accent-red)', border: 'none', borderRadius: '50%',
                          width: '22px', height: '22px', cursor: 'pointer', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                      <Camera size={32} />
                      <span style={{ fontSize: '14px' }}>Toque para tirar foto ou selecionar</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Máximo 10MB</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items list */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Itens Recebidos
                    <span style={{ marginLeft: '8px', background: 'var(--bg-primary)', color: 'var(--accent-blue)', borderRadius: '10px', padding: '1px 7px', fontSize: '11px' }}>
                      {formItems.length}
                    </span>
                  </label>
                  <button className="btn btn-ghost btn-sm" onClick={addItem} disabled={saving}>
                    <Plus size={14} /> Adicionar Item
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {formItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}
                    >
                      <div className="form-group">
                        {idx === 0 && <label className="form-label" style={{ fontSize: '11px' }}>Item</label>}
                        <select
                          className="form-select"
                          value={item.catalog_item_id}
                          onChange={e => updateItem(idx, 'catalog_item_id', e.target.value)}
                          disabled={saving}
                        >
                          <option value="">Selecione...</option>
                          {catalogItems.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        {idx === 0 && <label className="form-label" style={{ fontSize: '11px' }}>Qtd OK</label>}
                        <input
                          className="form-input"
                          type="number" min="0"
                          value={item.quantity_ok}
                          onChange={e => updateItem(idx, 'quantity_ok', parseInt(e.target.value) || 0)}
                          disabled={saving}
                        />
                      </div>
                      <div className="form-group">
                        {idx === 0 && (
                          <label className="form-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlertTriangle size={11} style={{ color: 'var(--accent-red)' }} /> Quarentena
                          </label>
                        )}
                        <input
                          className="form-input"
                          type="number" min="0"
                          value={item.quantity_quarantine}
                          onChange={e => updateItem(idx, 'quantity_quarantine', parseInt(e.target.value) || 0)}
                          disabled={saving}
                          style={item.quantity_quarantine > 0 ? { borderColor: 'var(--accent-red)' } : {}}
                        />
                      </div>
                      {formItems.length > 1 && (
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => removeItem(idx)}
                          disabled={saving}
                          style={{ color: 'var(--accent-red)', marginBottom: idx === 0 ? '0' : '0' }}
                          title="Remover item"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeModal} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-success" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Package size={15} />
                    Registrar Recebimento
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
