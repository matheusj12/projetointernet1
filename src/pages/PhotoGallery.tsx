import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logActivity } from '../lib/activityLog';
import { Plus, Camera, Calendar, MapPin, User, Trash2, ChevronDown, ChevronUp, ImageIcon } from 'lucide-react';

interface Person { id: string; name: string; }
interface PhotoEntry {
    id: string;
    title: string;
    description: string;
    technician_id: string;
    location: string;
    photo_urls: string[];
    taken_at: string;
    created_at: string;
    technician?: { name: string };
}

export default function PhotoGallery() {
    const { user } = useAuth();
    const [entries, setEntries] = useState<PhotoEntry[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [form, setForm] = useState({ title: '', description: '', technician_id: '', location: '', taken_at: new Date().toISOString().split('T')[0] });
    const [photoFiles, setPhotoFiles] = useState<File[]>([]);
    const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
    const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
    const [filterTech, setFilterTech] = useState('');
    const [lightboxImg, setLightboxImg] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        const [r1, r2] = await Promise.all([
            supabase.from('photo_diary').select('*, technician:people!technician_id(name)').order('taken_at', { ascending: false }),
            supabase.from('people').select('id, name').eq('active', true),
        ]);
        setEntries(r1.data || []);
        setPeople(r2.data || []);
        setLoading(false);
    };

    const showToast = (msg: string, type = 'success') => {
        setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
    };

    const openNew = () => {
        setForm({ title: '', description: '', technician_id: '', location: '', taken_at: new Date().toISOString().split('T')[0] });
        setPhotoFiles([]); setPhotoPreviews([]);
        setShowModal(true);
    };

    const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setPhotoFiles(prev => [...prev, ...files]);
        setPhotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    };

    const removePhoto = (idx: number) => {
        setPhotoFiles(prev => prev.filter((_, i) => i !== idx));
        setPhotoPreviews(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSave = async () => {
        if (!form.title.trim()) { showToast('Informe o título', 'error'); return; }
        if (photoFiles.length === 0) { showToast('Adicione pelo menos uma foto', 'error'); return; }

        // Upload photos
        const urls: string[] = [];
        for (const file of photoFiles) {
            const fileName = `diary/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
            const { error } = await supabase.storage.from('photos').upload(fileName, file);
            if (!error) {
                const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName);
                urls.push(urlData.publicUrl);
            }
        }

        const { data, error } = await supabase.from('photo_diary').insert({
            title: form.title,
            description: form.description,
            technician_id: form.technician_id || null,
            location: form.location,
            photo_urls: urls,
            taken_at: form.taken_at,
            created_by: user?.id,
        }).select().single();

        if (error) { showToast('Erro ao salvar', 'error'); return; }
        if (data) logActivity(user!.id, 'create', 'photo_diary', data.id, { title: form.title, photos: urls.length });
        showToast(`Registro salvo com ${urls.length} foto(s)!`);
        setShowModal(false);
        fetchAll();
    };

    const handleDelete = async (entry: PhotoEntry) => {
        if (!confirm(`Excluir registro "${entry.title}"?`)) return;
        await supabase.from('photo_diary').delete().eq('id', entry.id);
        logActivity(user!.id, 'delete', 'photo_diary', entry.id, { title: entry.title });
        showToast('Registro excluído');
        fetchAll();
    };

    const filtered = entries.filter(e => !filterTech || e.technician_id === filterTech);

    const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const formatDateShort = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

    // Group by date
    const grouped = filtered.reduce<Record<string, PhotoEntry[]>>((acc, e) => {
        const date = e.taken_at.split('T')[0];
        (acc[date] = acc[date] || []).push(e);
        return acc;
    }, {});

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>📸 Galeria de Fotos</h1>
                <div className="actions">
                    <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> Novo Registro</button>
                </div>
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                <User size={16} color="var(--text-muted)" />
                <select className="form-select" value={filterTech} onChange={e => setFilterTech(e.target.value)} style={{ width: 'auto', minWidth: '180px' }}>
                    <option value="">Todos os técnicos</option>
                    {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    {filtered.length} registro(s) • {filtered.reduce((s, e) => s + (e.photo_urls?.length || 0), 0)} foto(s)
                </span>
            </div>

            {loading ? (
                <div className="empty-state"><p>Carregando...</p></div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <ImageIcon size={48} />
                    <p>Nenhum registro de fotos</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(date => (
                        <div key={date}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <Calendar size={16} color="var(--accent-blue)" />
                                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--accent-blue)' }}>{formatDate(date)}</h3>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {grouped[date].map(entry => (
                                    <div key={entry.id} className="card" style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                                            onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                                            {/* Thumbnail */}
                                            {entry.photo_urls?.[0] ? (
                                                <img src={entry.photo_urls[0]} alt="" style={{
                                                    width: '56px', height: '56px', borderRadius: 'var(--radius-sm)',
                                                    objectFit: 'cover', border: '1px solid var(--border-color)'
                                                }} />
                                            ) : (
                                                <div style={{
                                                    width: '56px', height: '56px', borderRadius: 'var(--radius-sm)',
                                                    background: 'var(--bg-primary)', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', border: '1px solid var(--border-color)'
                                                }}>
                                                    <Camera size={20} color="var(--text-muted)" />
                                                </div>
                                            )}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600 }}>{entry.title}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '2px' }}>
                                                    {entry.technician?.name && <span>🔧 {entry.technician.name}</span>}
                                                    {entry.location && <span>📍 {entry.location}</span>}
                                                    <span>📷 {entry.photo_urls?.length || 0} foto(s)</span>
                                                </div>
                                            </div>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={e => { e.stopPropagation(); handleDelete(entry); }}
                                                style={{ color: 'var(--accent-red)' }}>
                                                <Trash2 size={15} />
                                            </button>
                                            {expandedId === entry.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </div>

                                        {expandedId === entry.id && (
                                            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                                {entry.description && (
                                                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{entry.description}</p>
                                                )}
                                                {entry.photo_urls && entry.photo_urls.length > 0 && (
                                                    <div style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                                                        gap: '8px',
                                                    }}>
                                                        {entry.photo_urls.map((url, idx) => (
                                                            <img key={idx} src={url} alt={`Foto ${idx + 1}`}
                                                                onClick={() => setLightboxImg(url)}
                                                                style={{
                                                                    width: '100%', aspectRatio: '4/3', objectFit: 'cover',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    border: '1px solid var(--border-color)',
                                                                    cursor: 'pointer', transition: 'var(--transition)',
                                                                }}
                                                                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                                                                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Lightbox */}
            {lightboxImg && (
                <div className="modal-overlay" onClick={() => setLightboxImg(null)} style={{ cursor: 'zoom-out' }}>
                    <img src={lightboxImg} alt="Foto ampliada" style={{
                        maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
                        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                    }} />
                </div>
            )}

            {/* New Entry Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal slide-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <h2>📸 Novo Registro de Fotos</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="form-group">
                                <label className="form-label">Título *</label>
                                <input className="form-input" value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    placeholder="Ex: Instalação rack 3º andar" autoFocus />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">🔧 Técnico</label>
                                    <select className="form-select" value={form.technician_id} onChange={e => setForm({ ...form, technician_id: e.target.value })}>
                                        <option value="">Selecione...</option>
                                        {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">📅 Data</label>
                                    <input className="form-input" type="date" value={form.taken_at}
                                        onChange={e => setForm({ ...form, taken_at: e.target.value })} />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">📍 Local</label>
                                <input className="form-input" value={form.location}
                                    onChange={e => setForm({ ...form, location: e.target.value })}
                                    placeholder="Ex: Bloco B, 3º andar, sala de TI" />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Descrição</label>
                                <textarea className="form-textarea" value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="O que foi feito no dia..." />
                            </div>

                            <div className="form-group">
                                <label className="form-label">📷 Fotos * (múltiplas)</label>
                                <div className="photo-upload" onClick={() => fileRef.current?.click()}>
                                    <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhotos} />
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                        <Camera size={32} /><span>Clique para adicionar fotos</span>
                                    </div>
                                </div>
                                {photoPreviews.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px', marginTop: '8px' }}>
                                        {photoPreviews.map((url, idx) => (
                                            <div key={idx} style={{ position: 'relative' }}>
                                                <img src={url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }} />
                                                <button onClick={() => removePhoto(idx)} style={{
                                                    position: 'absolute', top: '2px', right: '2px', background: 'rgba(239,68,68,0.9)',
                                                    color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '12px'
                                                }}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSave}>Salvar Registro</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        </div>
    );
}
