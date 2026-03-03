import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logActivity } from '../lib/activityLog';
import { exportToExcel } from '../lib/exportExcel';
import { Plus, Edit2, Trash2, Download, Search, Package } from 'lucide-react';

interface CatalogItem {
    id: string;
    name: string;
    description: string;
    unit: string;
    quantity_purchased: number;
    category: string;
    created_at: string;
}

const CATEGORIES = ['Cabos', 'Conectores', 'Access Points', 'Switches', 'Patch Panel', 'Tomadas/Espelhos', 'Eletrodutos', 'Ferragens', 'Outros'];

export default function Catalog() {
    const { user } = useAuth();
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<CatalogItem | null>(null);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [form, setForm] = useState({ name: '', description: '', unit: 'un', quantity_purchased: 0, category: '' });
    const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

    useEffect(() => { fetchItems(); }, []);

    const fetchItems = async () => {
        setLoading(true);
        const { data } = await supabase.from('catalog_items').select('*').order('name');
        setItems(data || []);
        setLoading(false);
    };

    const showToast = (msg: string, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const openNew = () => {
        setEditing(null);
        setForm({ name: '', description: '', unit: 'un', quantity_purchased: 0, category: '' });
        setShowModal(true);
    };

    const openEdit = (item: CatalogItem) => {
        setEditing(item);
        setForm({ name: item.name, description: item.description || '', unit: item.unit, quantity_purchased: item.quantity_purchased, category: item.category || '' });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        if (editing) {
            await supabase.from('catalog_items').update(form).eq('id', editing.id);
            logActivity(user!.id, 'update', 'catalog_items', editing.id, { name: form.name });
            showToast('Item atualizado!');
        } else {
            const { data } = await supabase.from('catalog_items').insert(form).select().single();
            if (data) logActivity(user!.id, 'create', 'catalog_items', data.id, { name: form.name });
            showToast('Item cadastrado!');
        }
        setShowModal(false);
        fetchItems();
    };

    const handleDelete = async (item: CatalogItem) => {
        if (!confirm(`Excluir "${item.name}"?`)) return;
        await supabase.from('catalog_items').delete().eq('id', item.id);
        logActivity(user!.id, 'delete', 'catalog_items', item.id, { name: item.name });
        showToast('Item removido!', 'error');
        fetchItems();
    };

    const handleExport = () => {
        exportToExcel(
            items.map(i => ({
                Nome: i.name,
                Descrição: i.description || '',
                Unidade: i.unit,
                'Qtd Comprada': i.quantity_purchased,
                Categoria: i.category || '',
            })),
            'catalogo_compras',
            'Catálogo'
        );
    };

    const filtered = items.filter(i =>
        (!search || i.name.toLowerCase().includes(search.toLowerCase())) &&
        (!filterCat || i.category === filterCat)
    );

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>📦 Catálogo de Compras</h1>
                <div className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={handleExport}><Download size={16} /> Excel</button>
                    <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Item</button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input" placeholder="Buscar item..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: '40px' }} />
                </div>
                <select className="form-select" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
                    <option value="">Todas categorias</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            {loading ? (
                <div className="empty-state"><p>Carregando...</p></div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <Package size={48} />
                    <p>Nenhum item cadastrado</p>
                </div>
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Unidade</th>
                                <th>Qtd Comprada</th>
                                <th>Categoria</th>
                                <th style={{ width: '100px' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(item => (
                                <tr key={item.id}>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{item.name}</div>
                                        {item.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.description}</div>}
                                    </td>
                                    <td>{item.unit}</td>
                                    <td><strong>{item.quantity_purchased}</strong></td>
                                    <td>{item.category && <span className="badge badge-blue">{item.category}</span>}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)}><Edit2 size={15} /></button>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDelete(item)} style={{ color: 'var(--accent-red)' }}><Trash2 size={15} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                {filtered.length} item(ns) • Total comprado: {filtered.reduce((s, i) => s + i.quantity_purchased, 0)} unidades
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal slide-in" onClick={e => e.stopPropagation()}>
                        <h2>{editing ? 'Editar Item' : 'Novo Item'}</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="form-group">
                                <label className="form-label">Nome do Item *</label>
                                <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Cabo UTP CAT.6" autoFocus />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Descrição</label>
                                <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Especificações, marca, modelo..." />
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
                                    <input className="form-input" type="number" min="0" value={form.quantity_purchased} onChange={e => setForm({ ...form, quantity_purchased: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Categoria</label>
                                <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                                    <option value="">Selecione...</option>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
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
