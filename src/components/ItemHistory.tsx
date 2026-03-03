import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Package, PackagePlus, PackageMinus, RotateCcw, User, Clock, ArrowLeftRight } from 'lucide-react';

interface HistoryEvent {
    id: string;
    type: 'receipt' | 'withdrawal' | 'return' | 'exchange';
    date: string;
    quantity: number;
    description: string;
    user?: string;
    person?: string;
}

interface ItemHistoryProps {
    itemId: string;
    itemName: string;
    onClose: () => void;
}

export default function ItemHistory({ itemId, itemName, onClose }: ItemHistoryProps) {
    const [events, setEvents] = useState<HistoryEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchHistory();
    }, [itemId]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            // Fetch receipts
            const { data: receipts } = await supabase
                .from('receipts')
                .select('*, users(display_name)')
                .eq('item_id', itemId);

            // Fetch withdrawals
            const { data: withdrawals } = await supabase
                .from('withdrawals')
                .select('*, people(name), users(display_name)')
                .eq('item_id', itemId);

            // Fetch supplier returns
            const { data: returns } = await supabase
                .from('supplier_returns')
                .select('*, users(display_name)')
                .eq('item_id', itemId);

            // Fetch exchanges
            const { data: exchanges } = await supabase
                .from('exchanges')
                .select('*, users(display_name)')
                .or(`wrong_item_id.eq.${itemId},correct_item_id.eq.${itemId}`);

            const allEvents: HistoryEvent[] = [];

            if (receipts) {
                receipts.forEach(r => {
                    allEvents.push({
                        id: `r-${r.id}`, type: 'receipt', date: r.received_at, quantity: r.quantity,
                        description: `Entrada via ${r.supplier || 'Fornecedor não info.'}`,
                        user: r.users?.display_name
                    });
                });
            }

            if (withdrawals) {
                withdrawals.forEach(w => {
                    allEvents.push({
                        id: `w-${w.id}`, type: 'withdrawal', date: w.withdrawn_at, quantity: w.quantity,
                        description: `Saída para projeto: ${w.project || '-'}`,
                        person: w.people?.name, user: w.users?.display_name
                    });
                    if (w.status === 'returned' && w.returned_at) {
                        allEvents.push({
                            id: `ret-${w.id}`, type: 'return', date: w.returned_at, quantity: w.quantity,
                            description: `Devolução de cautela`,
                            person: w.people?.name, user: w.users?.display_name
                        });
                    }
                });
            }

            if (returns) {
                returns.forEach(r => {
                    allEvents.push({
                        id: `sr-${r.id}`, type: 'return', date: r.returned_at, quantity: r.quantity,
                        description: `Devolução ao fornecedor: ${r.reason}`,
                        user: r.users?.display_name
                    });
                });
            }

            if (exchanges) {
                exchanges.forEach(ex => {
                    if (ex.wrong_item_id === itemId) {
                        allEvents.push({
                            id: `exW-${ex.id}`, type: 'exchange', date: ex.requested_at, quantity: ex.quantity,
                            description: `Trocado (enviado errado): ${ex.reason}`,
                            user: ex.users?.display_name
                        });
                    }
                    if (ex.correct_item_id === itemId && ex.status === 'received' && ex.received_at) {
                        allEvents.push({
                            id: `exC-${ex.id}`, type: 'receipt', date: ex.received_at, quantity: ex.quantity,
                            description: `Recebido de troca`,
                            user: ex.users?.display_name
                        });
                    }
                });
            }

            // Sort by date descending
            allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setEvents(allEvents);
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setLoading(false);
        }
    };

    const getEventIcon = (type: string) => {
        switch (type) {
            case 'receipt': return <div style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '8px', borderRadius: '50%' }}><PackagePlus size={18} /></div>;
            case 'withdrawal': return <div style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '8px', borderRadius: '50%' }}><PackageMinus size={18} /></div>;
            case 'return': return <div style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '8px', borderRadius: '50%' }}><RotateCcw size={18} /></div>;
            case 'exchange': return <div style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '8px', borderRadius: '50%' }}><ArrowLeftRight size={18} /></div>;
            default: return <Package size={18} />;
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal slide-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <h2 style={{ marginBottom: '4px' }}>Histórico do Item</h2>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Package size={14} /> {itemName}
                        </div>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                    {loading ? (
                        <div className="empty-state">Carregando histórico...</div>
                    ) : events.length === 0 ? (
                        <div className="empty-state">
                            <Clock size={48} />
                            <p>Nenhuma movimentação registrada para este item.</p>
                        </div>
                    ) : (
                        <div style={{ position: 'relative', paddingLeft: '24px', borderLeft: '2px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '20px', marginLeft: '12px' }}>
                            {events.map((event, idx) => (
                                <div key={`${event.id}-${idx}`} style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '-43px', top: '0', background: 'var(--bg-secondary)', borderRadius: '50%', border: '4px solid var(--bg-secondary)' }}>
                                        {getEventIcon(event.type)}
                                    </div>
                                    <div className="card" style={{ padding: '16px', marginLeft: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                            <div style={{ fontWeight: 600, fontSize: '15px' }}>
                                                {event.type === 'receipt' && <span style={{ color: 'var(--accent-green)' }}>Entrada (+{event.quantity})</span>}
                                                {event.type === 'withdrawal' && <span style={{ color: 'var(--accent-red)' }}>Saída (-{event.quantity})</span>}
                                                {event.type === 'return' && <span style={{ color: 'var(--accent-blue)' }}>Devolução (+{event.quantity})</span>}
                                                {event.type === 'exchange' && <span style={{ color: 'var(--accent-yellow)' }}>Troca/RMA (-{event.quantity})</span>}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {formatDate(event.date)}
                                            </div>
                                        </div>
                                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                            {event.description}
                                        </p>
                                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                            {event.person && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <User size={12} /> Técnico: {event.person}
                                                </div>
                                            )}
                                            {event.user && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={12} /> Reg. por: {event.user}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="modal-actions" style={{ marginTop: '20px' }}>
                    <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
                </div>
            </div>
        </div>
    );
}
