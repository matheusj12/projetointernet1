import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { exportToExcel } from '../lib/exportExcel';
import { generateInventoryPDF } from '../lib/pdfReport';
import { Download, Package, Warehouse, Truck, AlertTriangle, Clock, Filter, FileText } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface ItemStatus {
    id: string;
    name: string;
    unit: string;
    category: string;
    purchased: number;
    received_ok: number;
    in_quarantine: number;
    in_stock: number;
    in_field: number;
    pending: number;
}

interface LogEntry {
    id: string;
    action: string;
    entity_type: string;
    details: Record<string, unknown>;
    created_at: string;
    user?: { display_name: string };
}

export default function Dashboard() {
    const [items, setItems] = useState<ItemStatus[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterCat, setFilterCat] = useState('');

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);

        // Fetch catalog items
        const { data: catalog } = await supabase.from('catalog_items').select('*').order('name');
        const catalogItems = catalog || [];

        // Fetch receipt items
        const { data: receiptItems } = await supabase.from('receipt_items').select('catalog_item_id, quantity_ok, quantity_quarantine');

        // Fetch withdrawal items
        const { data: withdrawalItems } = await supabase.from('withdrawal_items').select('catalog_item_id, quantity_taken, quantity_returned');

        // Fetch supplier returns
        const { data: supplierReturns } = await supabase.from('supplier_returns').select('catalog_item_id, quantity');

        // Calculate status for each item
        const statusItems: ItemStatus[] = catalogItems.map(ci => {
            const received_ok = (receiptItems || [])
                .filter((ri: { catalog_item_id: string }) => ri.catalog_item_id === ci.id)
                .reduce((s: number, ri: { quantity_ok: number }) => s + ri.quantity_ok, 0);

            const total_quarantine = (receiptItems || [])
                .filter((ri: { catalog_item_id: string }) => ri.catalog_item_id === ci.id)
                .reduce((s: number, ri: { quantity_quarantine: number }) => s + ri.quantity_quarantine, 0);

            const returned_to_supplier = (supplierReturns || [])
                .filter((sr: { catalog_item_id: string }) => sr.catalog_item_id === ci.id)
                .reduce((s: number, sr: { quantity: number }) => s + sr.quantity, 0);

            const withdrawn = (withdrawalItems || [])
                .filter((wi: { catalog_item_id: string }) => wi.catalog_item_id === ci.id)
                .reduce((s: number, wi: { quantity_taken: number }) => s + wi.quantity_taken, 0);

            const returned_from_field = (withdrawalItems || [])
                .filter((wi: { catalog_item_id: string }) => wi.catalog_item_id === ci.id)
                .reduce((s: number, wi: { quantity_returned: number }) => s + wi.quantity_returned, 0);

            const in_quarantine = total_quarantine - returned_to_supplier;
            const in_field = withdrawn - returned_from_field;
            const in_stock = received_ok - withdrawn + returned_from_field;
            const pending = ci.quantity_purchased - received_ok - total_quarantine;

            return {
                id: ci.id,
                name: ci.name,
                unit: ci.unit,
                category: ci.category || '',
                purchased: ci.quantity_purchased,
                received_ok,
                in_quarantine: Math.max(0, in_quarantine),
                in_stock: Math.max(0, in_stock),
                in_field: Math.max(0, in_field),
                pending: Math.max(0, pending),
            };
        });

        setItems(statusItems);

        // Fetch activity logs
        const { data: logData } = await supabase
            .from('activity_log')
            .select('*, user:users(display_name)')
            .order('created_at', { ascending: false })
            .limit(15);
        setLogs(logData || []);

        setLoading(false);
    };

    const totals = items.reduce(
        (acc, i) => ({
            purchased: acc.purchased + i.purchased,
            in_stock: acc.in_stock + i.in_stock,
            in_field: acc.in_field + i.in_field,
            in_quarantine: acc.in_quarantine + i.in_quarantine,
            pending: acc.pending + i.pending,
        }),
        { purchased: 0, in_stock: 0, in_field: 0, in_quarantine: 0, pending: 0 }
    );

    const categories = [...new Set(items.map(i => i.category).filter(Boolean))];
    const filtered = items.filter(i => !filterCat || i.category === filterCat);

    const handleExport = () => {
        exportToExcel(
            filtered.map(i => ({
                'Item': i.name,
                'Unidade': i.unit,
                'Categoria': i.category,
                'Comprado': i.purchased,
                'No Estoque': i.in_stock,
                'Em Campo': i.in_field,
                'Quarentena': i.in_quarantine,
                'Pend. Entrega': i.pending,
            })),
            'dashboard_estoque',
            'Status'
        );
    };

    const handleExportPDF = async () => {
        await generateInventoryPDF();
    };

    // Chart Data
    const COLORS = ['#38bdf8', '#34d399', '#f59e0b', '#ef4444', '#a78bfa', '#fb923c', '#4ade80', '#60a5fa'];

    const categoryData = categories.map(cat => ({
        name: cat || 'Sem Categoria',
        value: items.filter(i => i.category === cat).reduce((s, i) => s + i.in_stock, 0)
    })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

    // Top 5 em campo
    const topInFieldData = [...items]
        .sort((a, b) => b.in_field - a.in_field)
        .slice(0, 5)
        .map(i => ({
            name: i.name.length > 20 ? i.name.substring(0, 20) + '...' : i.name,
            quantidade: i.in_field
        }))
        .filter(d => d.quantidade > 0);

    const actionLabel = (action: string, entity: string) => {
        const actions: Record<string, string> = { create: 'criou', update: 'atualizou', delete: 'removeu' };
        const entities: Record<string, string> = {
            catalog_items: 'item do catálogo',
            people: 'pessoa',
            receipts: 'recebimento',
            withdrawals: 'cautela',
            supplier_returns: 'devolução fornecedor',
        };
        return `${actions[action] || action} ${entities[entity] || entity}`;
    };

    const formatDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    if (loading) return <div className="empty-state"><p>Carregando dashboard...</p></div>;

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>📊 Dashboard</h1>
                <div className="actions">
                    <button className="btn btn-ghost btn-sm" onClick={handleExport}><Download size={16} /> Excel</button>
                    <button className="btn btn-ghost btn-sm" onClick={handleExportPDF} style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}><FileText size={16} /> Relatório PDF</button>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(56,189,248,0.15)' }}><Package size={20} color="var(--accent-blue)" /></div>
                    <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>{totals.purchased}</div>
                    <div className="stat-label">Total Comprado</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(52,211,153,0.15)' }}><Warehouse size={20} color="var(--accent-green)" /></div>
                    <div className="stat-value" style={{ color: 'var(--accent-green)' }}>{totals.in_stock}</div>
                    <div className="stat-label">No Estoque</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(167,139,250,0.15)' }}><Truck size={20} color="var(--accent-purple)" /></div>
                    <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>{totals.in_field}</div>
                    <div className="stat-label">Em Campo</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(251,191,36,0.15)' }}><AlertTriangle size={20} color="var(--accent-yellow)" /></div>
                    <div className="stat-value" style={{ color: 'var(--accent-yellow)' }}>{totals.in_quarantine}</div>
                    <div className="stat-label">Quarentena</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(251,146,60,0.15)' }}><Clock size={20} color="var(--accent-orange)" /></div>
                    <div className="stat-value" style={{ color: 'var(--accent-orange)' }}>{totals.pending}</div>
                    <div className="stat-label">Pend. Entrega</div>
                </div>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>
                <div className="card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '16px', fontWeight: 600 }}>📦 Distribuição em Estoque</h3>
                    {categoryData.length > 0 ? (
                        <div style={{ width: '100%', height: '250px' }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={5}>
                                        {categoryData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                    <RechartsTooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }} itemStyle={{ color: '#fff' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="empty-state" style={{ padding: '40px' }}><p>Sem dados para exibir</p></div>
                    )}
                </div>

                <div className="card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '16px', fontWeight: 600 }}>🚚 Top Itens em Campo</h3>
                    {topInFieldData.length > 0 ? (
                        <div style={{ width: '100%', height: '250px' }}>
                            <ResponsiveContainer>
                                <BarChart data={topInFieldData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                                    <XAxis type="number" stroke="var(--text-secondary)" fontSize={12} />
                                    <YAxis dataKey="name" type="category" width={100} stroke="var(--text-secondary)" fontSize={11} />
                                    <RechartsTooltip cursor={{ fill: 'var(--bg-card-hover)' }} contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }} />
                                    <Bar dataKey="quantidade" fill="var(--accent-purple)" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="empty-state" style={{ padding: '40px' }}><p>Nenhum item em campo</p></div>
                    )}
                </div>
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Filter size={16} color="var(--text-muted)" />
                <select className="form-select" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 'auto', minWidth: '160px' }}>
                    <option value="">Todas categorias</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{filtered.length} itens</span>
            </div>

            {/* Main table */}
            {filtered.length > 0 && (
                <div className="table-container" style={{ marginBottom: '32px' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th style={{ textAlign: 'center' }}>Comprado</th>
                                <th style={{ textAlign: 'center' }}>Estoque</th>
                                <th style={{ textAlign: 'center' }}>Em Campo</th>
                                <th style={{ textAlign: 'center' }}>Quarentena</th>
                                <th style={{ textAlign: 'center' }}>Pend. Entrega</th>
                                <th>Progresso</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(item => {
                                const receivedPct = item.purchased > 0 ? ((item.received_ok + item.in_quarantine) / item.purchased) * 100 : 0;
                                return (
                                    <tr key={item.id}>
                                        <td>
                                            <div style={{ fontWeight: 500 }}>{item.name}</div>
                                            {item.category && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.category}</span>}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>{item.purchased}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className="badge badge-green">{item.in_stock}</span>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {item.in_field > 0 ? <span className="badge badge-purple">{item.in_field}</span> : '—'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {item.in_quarantine > 0 ? <span className="badge badge-red">{item.in_quarantine}</span> : '—'}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {item.pending > 0 ? <span className="badge badge-yellow">{item.pending}</span> : '—'}
                                        </td>
                                        <td style={{ minWidth: '120px' }}>
                                            <div className="progress-bar">
                                                <div className="progress-fill" style={{
                                                    width: `${Math.min(receivedPct, 100)}%`,
                                                    background: receivedPct >= 100 ? 'var(--accent-green)' : 'var(--accent-blue)',
                                                }} />
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                {Math.round(receivedPct)}% recebido
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Activity Log */}
            {logs.length > 0 && (
                <div>
                    <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--text-secondary)' }}>📝 Últimas Atividades</h3>
                    <div className="card" style={{ padding: '8px 16px' }}>
                        {logs.map(log => (
                            <div key={log.id} className="activity-item">
                                <div className="activity-dot" style={{
                                    background: log.action === 'create' ? 'var(--accent-green)' : log.action === 'delete' ? 'var(--accent-red)' : 'var(--accent-blue)',
                                }} />
                                <div>
                                    <div className="activity-text">
                                        <strong>{log.user?.display_name || 'Sistema'}</strong> {actionLabel(log.action, log.entity_type)}
                                        {log.details && typeof (log.details as Record<string, string>).name === 'string' && <> — <em>{(log.details as Record<string, string>).name}</em></>}
                                    </div>
                                    <div className="activity-time">{formatDate(log.created_at)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
