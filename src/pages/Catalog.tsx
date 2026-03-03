import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logActivity } from '../lib/activityLog';
import { exportToExcel } from '../lib/exportExcel';
import { Plus, Search, Edit2, Trash2, Download, Package, X, Filter, History, Camera } from 'lucide-react';
import ItemHistory from '../components/ItemHistory';

interface CatalogItem {
    id: string;
    name: string;
    description: string;
    unit: string;
    quantity_purchased: number;
    unit_price?: number;
    total_price?: number;
    image_url?: string;
    category: string;
    created_at: string;
}

export default function Catalog() {
    const { user } = useAuth();
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<CatalogItem | null>(null);
    const [historyItem, setHistoryItem] = useState<CatalogItem | null>(null);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [form, setForm] = useState({ name: '', description: '', unit: 'un', quantity_purchased: 0, category: '', unit_price: 0, total_price: 0, image_url: '' });
    const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string>('');
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { fetchItems(); }, []);

    const fetchItems = async () => {
        setLoading(true);
        const { data } = await supabase.from('catalog_items').select('*').order('name');
        setItems(data || []);
        setLoading(false);
    };

    // Categorias dinâmicas extraídas do banco
    const categories = useMemo(() => {
        const cats = [...new Set(items.map(i => i.category).filter(Boolean))];
        return cats.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [items]);

    const showToast = (msg: string, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const openNew = () => {
        setEditing(null);
        setForm({ name: '', description: '', unit: 'un', quantity_purchased: 0, category: '', unit_price: 0, total_price: 0, image_url: '' });
        setPhotoFile(null);
        setPhotoPreview('');
        setShowModal(true);
    };

    const openEdit = (item: CatalogItem) => {
        setEditing(item);
        setForm({ name: item.name, description: item.description || '', unit: item.unit, quantity_purchased: item.quantity_purchased, category: item.category || '', unit_price: item.unit_price || 0, total_price: item.total_price || ((item.unit_price || 0) * item.quantity_purchased), image_url: item.image_url || '' });
        setPhotoFile(null);
        setPhotoPreview(item.image_url || '');
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) { showToast('Informe o nome', 'error'); return; }
        setLoading(true);

        let uploadedUrl = form.image_url;

        // Upload photo if new file selected
        if (photoFile) {
            const sanitizedName = photoFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
            const fileName = `catalog/${Date.now()}_${Math.random().toString(36).slice(2)}_${sanitizedName}`;
            const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, photoFile);
            if (!uploadError) {
                const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
                uploadedUrl = data.publicUrl;
            } else {
                showToast('Erro ao fazer upload da foto', 'error');
                setLoading(false);
                return;
            }
        }

        // Build payload with only columns that exist in catalog_items table
        // (total_price is computed in UI but not a DB column)
        const payload = {
            name: form.name,
            description: form.description,
            unit: form.unit,
            quantity_purchased: form.quantity_purchased,
            unit_price: form.unit_price,
            category: form.category,
            image_url: uploadedUrl,
        };

        if (editing) {
            const oldItem = items.find(i => i.id === editing.id);
            const { error } = await supabase.from('catalog_items')
                .update(payload).eq('id', editing.id).select().single();
            if (error) { showToast('Erro ao editar', 'error'); setLoading(false); return; }
            logActivity(user!.id, 'update', 'catalog_items', editing.id, { before: oldItem, after: payload });
            showToast('Item atualizado');
        } else {
            const { data, error } = await supabase.from('catalog_items').insert([payload]).select().single();
            if (error) { showToast('Erro ao salvar', 'error'); setLoading(false); return; }
            logActivity(user!.id, 'create', 'catalog_items', data.id, payload);
            showToast('Item salvo');
        }
        setShowModal(false);
        fetchItems();
    };

    const handleDelete = async (item: CatalogItem) => {
        if (!confirm(`Excluir "${item.name}" ? `)) return;
        await supabase.from('catalog_items').delete().eq('id', item.id);
        logActivity(user!.id, 'delete', 'catalog_items', item.id, { name: item.name });
        showToast('Item removido!', 'error');
        fetchItems();
    };

    const handleExport = () => {
        exportToExcel(
            filtered.map(i => ({
                Nome: i.name,
                Descrição: i.description || '',
                Unidade: i.unit,
                'Valor Unitário': i.unit_price || 0,
                'Qtd Comprada': i.quantity_purchased,
                'Valor Total': i.total_price || ((i.unit_price || 0) * i.quantity_purchased),
                Categoria: i.category || '',
            })),
            'catalogo_compras',
            'Catálogo'
        );
    };

    // Pesquisa case-insensitive em nome, descrição e categoria
    const normalize = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const filtered = useMemo(() => {
        const term = normalize(search);
        return items.filter(i => {
            const matchSearch = !term ||
                normalize(i.name).includes(term) ||
                normalize(i.description || '').includes(term) ||
                normalize(i.category || '').includes(term);
            const matchCat = !filterCat || i.category === filterCat;
            return matchSearch && matchCat;
        });
    }, [items, search, filterCat]);

    const clearFilters = () => { setSearch(''); setFilterCat(''); };
    const hasFilters = search || filterCat;

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>📦 Catálogo de Compras</h1>
                <div className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={handleExport}><Download size={16} /> Excel</button>
                    <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Item</button>
                </div>
            </div>

            {/* Barra de pesquisa melhorada */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input"
                        placeholder="Buscar por nome, descrição ou categoria..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: '40px', paddingRight: search ? '36px' : '12px' }} />
                    {search && (
                        <button onClick={() => setSearch('')}
                            style={{
                                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                                background: 'rgba(248,113,113,0.15)', border: 'none', borderRadius: '50%',
                                width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: 'var(--accent-red)'
                            }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Filter size={16} color="var(--text-muted)" />
                    <select className="form-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}
                        style={{ width: 'auto', minWidth: '180px' }}>
                        <option value="">Todas categorias ({items.length})</option>
                        {categories.map(c => (
                            <option key={c} value={c}>
                                {c} ({items.filter(i => i.category === c).length})
                            </option>
                        ))}
                    </select>
                </div>
                {hasFilters && (
                    <button className="btn btn-ghost btn-sm" onClick={clearFilters}
                        style={{ color: 'var(--accent-red)', whiteSpace: 'nowrap' }}>
                        <X size={14} /> Limpar filtros
                    </button>
                )}
            </div>

            {/* Contador de resultados */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                <span>{filtered.length} de {items.length} item(ns)</span>
                <span>•</span>
                <span>Total comprado: <strong style={{ color: 'var(--text-primary)' }}>{filtered.reduce((s, i) => s + i.quantity_purchased, 0).toLocaleString('pt-BR')}</strong> unidades</span>
                <span>•</span>
                <span>Valor Total: <strong style={{ color: 'var(--text-primary)' }}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(filtered.reduce((s, i) => s + (i.total_price || ((i.unit_price || 0) * i.quantity_purchased)), 0))}</strong></span>
                {filterCat && (
                    <>
                        <span>•</span>
                        <span className="badge badge-blue" style={{ fontSize: '11px' }}>{filterCat}</span>
                    </>
                )}
            </div>

            {loading ? (
                <div className="empty-state"><p>Carregando...</p></div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <Package size={48} />
                    <p>{hasFilters ? 'Nenhum item encontrado com os filtros aplicados' : 'Nenhum item cadastrado'}</p>
                    {hasFilters && (
                        <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ marginTop: '8px' }}>
                            Limpar filtros
                        </button>
                    )}
                </div>
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>Foto</th>
                                <th>Nome</th>
                                <th>Unidade</th>
                                <th>Valor Unit.</th>
                                <th>Qtd Comprada</th>
                                <th>Valor Total</th>
                                <th>Categoria</th>
                                <th style={{ width: '100px' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(item => (
                                <tr key={item.id}>
                                    <td>
                                        {item.image_url ? (
                                            <a href={item.image_url} target="_blank" rel="noopener noreferrer">
                                                <img src={item.image_url} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-color)' }} />
                                            </a>
                                        ) : (
                                            <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)' }}>
                                                <Camera size={14} color="var(--text-muted)" />
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{item.name}</div>
                                        {item.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.description}</div>}
                                    </td>
                                    <td>{item.unit}</td>
                                    <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price || 0)}</td>
                                    <td><strong>{item.quantity_purchased}</strong></td>
                                    <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price || ((item.unit_price || 0) * item.quantity_purchased))}</td>
                                    <td>{item.category && <span className="badge badge-blue">{item.category}</span>}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setHistoryItem(item)} style={{ color: 'var(--accent-blue)' }} title="Histórico"><History size={15} /></button>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)} title="Editar"><Edit2 size={15} /></button>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item)} style={{ color: 'var(--accent-red)' }} title="Excluir"><Trash2 size={15} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal slide-in" onClick={e => e.stopPropagation()}>
                        <h2>{editing ? '📝 Editar Item' : '📦 Novo Item'}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div className="form-group">
                                        <label className="form-label">Nome do Item *</label>
                                        <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Descrição</label>
                                        <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-group" style={{ width: '120px' }}>
                                    <label className="form-label">Foto do Produto</label>
                                    <div className="photo-upload" onClick={() => fileRef.current?.click()} style={{ height: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
                                        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                                            if (e.target.files && e.target.files[0]) {
                                                setPhotoFile(e.target.files[0]);
                                                setPhotoPreview(URL.createObjectURL(e.target.files[0]));
                                            }
                                        }} />
                                        {photoPreview ? (
                                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                                <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                <button onClick={(e) => { e.stopPropagation(); setPhotoFile(null); setPhotoPreview(''); setForm({ ...form, image_url: '' }); }} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(255,0,0,0.8)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>×</button>
                                            </div>
                                        ) : (
                                            <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                                                <Camera size={24} style={{ margin: '0 auto 4px' }} />
                                                <span style={{ fontSize: '11px' }}>Adicionar</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Unidade</label>
                                    <select className="form-select" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                                        <option value="un">Unidade (un)</option>
                                        <option value="cx">Caixa (cx)</option>
                                        <option value="m">Metro (m)</option>
                                        <option value="pc">Peça (pc)</option>
                                        <option value="rl">Rolo (rl)</option>
                                        <option value="pct">Pacote (pct)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Quantidade Comprada *</label>
                                    <input className="form-input" type="number" min="0" value={form.quantity_purchased} onChange={e => {
                                        const qty = parseInt(e.target.value) || 0;
                                        setForm({ ...form, quantity_purchased: qty, total_price: parseFloat((qty * form.unit_price).toFixed(2)) });
                                    }} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Valor Unitário (R$)</label>
                                    <input className="form-input" type="number" step="0.01" min="0" value={form.unit_price} onChange={e => {
                                        const up = parseFloat(e.target.value) || 0;
                                        setForm({ ...form, unit_price: up, total_price: parseFloat((form.quantity_purchased * up).toFixed(2)) });
                                    }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Valor Total (R$) *</label>
                                    <input className="form-input" type="number" step="0.01" min="0" value={form.total_price} onChange={e => setForm({ ...form, total_price: parseFloat(e.target.value) || 0 })} />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px', display: 'block' }}>Permite ajustar centavos da Nota Fiscal</small>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Categoria</label>
                                    <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                                        <option value="">Selecione...</option>
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
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

            {historyItem && (
                <ItemHistory
                    itemId={historyItem.id}
                    itemName={historyItem.name}
                    onClose={() => setHistoryItem(null)}
                />
            )}
            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}

