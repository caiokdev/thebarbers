import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import Sidebar from '../components/Sidebar';

// ── Helpers ──
const formatBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Clientes() {
    // ── State ──
    const [barbershopId, setBarbershopId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [clientesLista, setClientesLista] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    // KPIs
    const [totalClientes, setTotalClientes] = useState(0);
    const [totalAssinantes, setTotalAssinantes] = useState(0);
    const [novosEsteMes, setNovosEsteMes] = useState(0);

    // Modals
    const [newClientModal, setNewClientModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newIsSub, setNewIsSub] = useState(false);
    const [saving, setSaving] = useState(false);

    const [profileModal, setProfileModal] = useState({ open: false, client: null, orders: [] });
    const [profileLoading, setProfileLoading] = useState(false);

    // ── Fetch barbershop_id ──
    useEffect(() => {
        async function fetchShop() {
            const { data: shop } = await supabase
                .from('barbershops')
                .select('id')
                .eq('name', 'The Barbers Club')
                .single();
            if (shop) setBarbershopId(shop.id);
            else setLoading(false);
        }
        fetchShop();
    }, []);

    // ── Fetch clients + cross-join orders ──
    const fetchClientes = useCallback(async () => {
        if (!barbershopId) return;
        setLoading(true);
        try {
            const bId = barbershopId;

            // 1. All clients
            const { data: clients } = await supabase
                .from('clients')
                .select('id, name, phone, is_subscriber, subscription_status, created_at')
                .eq('barbershop_id', bId)
                .order('name', { ascending: true });

            const allClients = clients || [];

            // 2. All closed orders for this barbershop (for cross-join)
            const { data: closedOrders } = await supabase
                .from('orders')
                .select('client_id, total_amount, closed_at')
                .eq('barbershop_id', bId)
                .eq('status', 'closed');

            // Group orders by client
            const ordersByClient = {};
            (closedOrders || []).forEach(o => {
                const cId = o.client_id;
                if (!cId) return;
                if (!ordersByClient[cId]) ordersByClient[cId] = { total: 0, lastVisit: null };
                ordersByClient[cId].total += parseFloat(o.total_amount || 0);
                const closedDate = o.closed_at ? new Date(o.closed_at) : null;
                if (closedDate && (!ordersByClient[cId].lastVisit || closedDate > ordersByClient[cId].lastVisit)) {
                    ordersByClient[cId].lastVisit = closedDate;
                }
            });

            // 3. Build enriched client list
            const enriched = allClients.map(c => ({
                id: c.id,
                nome: c.name || 'Sem nome',
                telefone: c.phone || '—',
                isSubscriber: c.is_subscriber === true,
                subscriptionStatus: c.subscription_status || 'none',
                createdAt: c.created_at,
                totalGasto: ordersByClient[c.id]?.total || 0,
                ultimaVisita: ordersByClient[c.id]?.lastVisit || null,
            }));

            setClientesLista(enriched);
            setTotalClientes(allClients.length);
            setTotalAssinantes(allClients.filter(c => c.is_subscriber === true).length);

            // Novos este mês
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const novos = allClients.filter(c => c.created_at && c.created_at >= startOfMonth).length;
            setNovosEsteMes(novos);

        } catch (err) {
            console.error('Erro ao buscar clientes:', err);
        } finally {
            setLoading(false);
        }
    }, [barbershopId]);

    useEffect(() => {
        if (barbershopId) fetchClientes();
    }, [barbershopId, fetchClientes]);

    // ── Filtered list ──
    const filteredClientes = useMemo(() => {
        if (!searchTerm.trim()) return clientesLista;
        const term = searchTerm.toLowerCase();
        return clientesLista.filter(c =>
            c.nome.toLowerCase().includes(term) || c.telefone.includes(term)
        );
    }, [clientesLista, searchTerm]);

    // ── Save new client ──
    const handleSaveClient = async () => {
        if (!newName.trim()) return alert('Nome é obrigatório.');
        setSaving(true);
        try {
            const { error } = await supabase.from('clients').insert({
                name: newName.trim(),
                phone: newPhone.trim() || null,
                is_subscriber: newIsSub,
                barbershop_id: barbershopId,
            });
            if (error) throw error;
            setNewClientModal(false);
            setNewName('');
            setNewPhone('');
            setNewIsSub(false);
            fetchClientes();
        } catch (err) {
            alert('Erro ao salvar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Open profile modal ──
    const openProfile = async (client) => {
        setProfileModal({ open: true, client, orders: [] });
        setProfileLoading(true);
        try {
            const { data: orders } = await supabase
                .from('orders')
                .select('id, total_amount, closed_at, professional_id, payment_method')
                .eq('barbershop_id', barbershopId)
                .eq('client_id', client.id)
                .eq('status', 'closed')
                .order('closed_at', { ascending: false })
                .limit(10);

            // Resolve professional names
            const proIds = [...new Set((orders || []).map(o => o.professional_id).filter(Boolean))];
            let proMap = {};
            if (proIds.length > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', proIds);
                (profiles || []).forEach(p => { proMap[p.id] = p.name; });
            }

            const enrichedOrders = (orders || []).map(o => {
                const d = o.closed_at ? new Date(o.closed_at) : null;
                return {
                    id: o.id,
                    data: d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—',
                    hora: d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '',
                    barbeiro: proMap[o.professional_id] || 'Sem nome',
                    valor: parseFloat(o.total_amount || 0),
                    pagamento: o.payment_method || '—',
                };
            });

            setProfileModal(prev => ({ ...prev, orders: enrichedOrders }));
        } catch (err) {
            console.error('Erro ao buscar perfil:', err);
        } finally {
            setProfileLoading(false);
        }
    };

    // ── Toggle subscription ──
    const toggleSubscription = async (clientId, currentStatus) => {
        const newIsSub = !currentStatus;
        const newSubStatus = newIsSub ? 'active' : 'none';
        try {
            const { error } = await supabase
                .from('clients')
                .update({ is_subscriber: newIsSub, subscription_status: newSubStatus })
                .eq('id', clientId);
            if (error) throw error;

            // Update modal state instantly
            setProfileModal(prev => ({
                ...prev,
                client: prev.client ? { ...prev.client, isSubscriber: newIsSub, subscriptionStatus: newSubStatus } : prev.client,
            }));

            // Update main list + KPIs
            setClientesLista(prev => {
                const updated = prev.map(c => c.id === clientId ? { ...c, isSubscriber: newIsSub, subscriptionStatus: newSubStatus } : c);
                setTotalAssinantes(updated.filter(c => c.isSubscriber === true).length);
                return updated;
            });
        } catch (err) {
            alert('Erro ao atualizar assinatura: ' + err.message);
        }
    };

    // ── Toggle payment status (Em dia ↔ Atrasado) ──
    const handleTogglePaymentStatus = async (clientId, currentSubStatus) => {
        const newStatus = currentSubStatus === 'active' ? 'overdue' : 'active';
        try {
            const { error } = await supabase
                .from('clients')
                .update({ subscription_status: newStatus })
                .eq('id', clientId);
            if (error) throw error;

            // Update modal state instantly
            setProfileModal(prev => ({
                ...prev,
                client: prev.client ? { ...prev.client, subscriptionStatus: newStatus } : prev.client,
            }));

            // Update main list
            setClientesLista(prev =>
                prev.map(c => c.id === clientId ? { ...c, subscriptionStatus: newStatus } : c)
            );
        } catch (err) {
            alert('Erro ao atualizar status: ' + err.message);
        }
    };

    // ── Render ──
    if (loading && clientesLista.length === 0) {
        return (
            <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
                <Sidebar />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                        <p className="text-slate-500 text-sm">Carregando clientes...</p>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
            <Sidebar />

            <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* ── HEADER ── */}
                <header className="h-[72px] bg-slate-800 border-b border-slate-700 flex items-center justify-between px-8 flex-shrink-0">
                    <div>
                        <h1 className="text-lg font-semibold text-slate-100">Clientes</h1>
                        <p className="text-xs text-slate-500">Gestão e Fidelização</p>
                    </div>
                    <button
                        onClick={() => setNewClientModal(true)}
                        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Novo Cliente
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

                    {/* ══════════ LINHA 1 — KPI Cards ══════════ */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Total Clientes */}
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Cadastrados</p>
                            </div>
                            <p className="text-3xl font-bold text-slate-100">{totalClientes}</p>
                        </div>
                        {/* Assinantes */}
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Assinantes</p>
                            </div>
                            <p className="text-3xl font-bold text-emerald-400">{totalAssinantes}</p>
                            <p className="text-[10px] text-slate-600 mt-1">{totalClientes > 0 ? ((totalAssinantes / totalClientes) * 100).toFixed(0) : 0}% da base</p>
                        </div>
                        {/* Novos este mês */}
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                                    </svg>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Novos este mês</p>
                            </div>
                            <p className="text-3xl font-bold text-amber-400">{novosEsteMes}</p>
                        </div>
                    </div>

                    {/* ══════════ LINHA 2 — Search Bar ══════════ */}
                    <div className="relative">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Pesquisar por nome ou telefone..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                        />
                    </div>

                    {/* ══════════ LINHA 3 — Tabela de Clientes ══════════ */}
                    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-700">
                                        <th className="text-left px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Nome</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Contacto</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Última Visita</th>
                                        <th className="text-right px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Gasto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClientes.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-slate-600">
                                                {searchTerm ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredClientes.map((c) => (
                                            <tr
                                                key={c.id}
                                                onClick={() => openProfile(c)}
                                                className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors"
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                                                            {c.nome.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <span className="font-medium text-slate-200">{c.nome}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-slate-400">{c.telefone}</td>
                                                <td className="px-6 py-4">
                                                    {c.isSubscriber ? (
                                                        c.subscriptionStatus === 'overdue' ? (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20">
                                                                Atrasado
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                                                                Assinante
                                                            </span>
                                                        )
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-400 ring-1 ring-inset ring-slate-500/20">
                                                            Avulso
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-slate-400">
                                                    {c.ultimaVisita
                                                        ? `${String(c.ultimaVisita.getDate()).padStart(2, '0')}/${String(c.ultimaVisita.getMonth() + 1).padStart(2, '0')}/${c.ultimaVisita.getFullYear()}`
                                                        : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-right font-semibold text-slate-200">{formatBRL(c.totalGasto)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </main>

            {/* ══════════ MODAL: Novo Cliente ══════════ */}
            {newClientModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setNewClientModal(false)} />
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                            <h3 className="text-base font-semibold text-slate-100">Novo Cliente</h3>
                            <button onClick={() => setNewClientModal(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {/* Body */}
                        <div className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Nome *</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="Nome completo"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Telefone / WhatsApp</label>
                                <input
                                    type="text"
                                    value={newPhone}
                                    onChange={e => setNewPhone(e.target.value)}
                                    placeholder="(00) 00000-0000"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                                />
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${newIsSub ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${newIsSub ? 'translate-x-4' : 'translate-x-0'}`} />
                                </div>
                                <span className="text-sm text-slate-300 group-hover:text-slate-200">Assinante do clube</span>
                                <input type="checkbox" checked={newIsSub} onChange={e => setNewIsSub(e.target.checked)} className="hidden" />
                            </label>
                        </div>
                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
                            <button onClick={() => setNewClientModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveClient}
                                disabled={saving}
                                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                            >
                                {saving ? 'Salvando...' : 'Salvar Cliente'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════ MODAL: Perfil do Cliente (Drill-down) ══════════ */}
            {profileModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setProfileModal({ open: false, client: null, orders: [] })} />
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-slate-700">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-300">
                                        {profileModal.client?.nome.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                                            {profileModal.client?.nome}
                                            {profileModal.client?.isSubscriber && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                    Assinante
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-xs text-slate-500">{profileModal.client?.telefone}</p>
                                    </div>
                                </div>
                                <button onClick={() => setProfileModal({ open: false, client: null, orders: [] })} className="text-slate-500 hover:text-slate-300 transition-colors">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            {/* Subscription toggle */}
                            <div className="mt-4 flex items-center justify-between bg-slate-900/50 rounded-xl px-4 py-3 border border-slate-700/50">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                    </svg>
                                    <span className="text-sm font-medium text-slate-300">Clube de Assinatura</span>
                                </div>
                                <button
                                    onClick={() => toggleSubscription(profileModal.client?.id, profileModal.client?.isSubscriber)}
                                    className="relative"
                                >
                                    <div className={`w-12 h-7 rounded-full transition-colors flex items-center ${profileModal.client?.isSubscriber ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                        <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform mx-1 ${profileModal.client?.isSubscriber ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </div>
                                </button>
                            </div>
                            {/* Payment status toggle (only for subscribers) */}
                            {profileModal.client?.isSubscriber === true && (
                                <div className="mt-2">
                                    <button
                                        onClick={() => handleTogglePaymentStatus(profileModal.client?.id, profileModal.client?.subscriptionStatus)}
                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${profileModal.client?.subscriptionStatus === 'active'
                                            ? 'bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20'
                                            : 'bg-rose-500/10 border-rose-500/25 hover:bg-rose-500/20'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-semibold ${profileModal.client?.subscriptionStatus === 'active' ? 'text-emerald-400' : 'text-rose-400'
                                                }`}>
                                                {profileModal.client?.subscriptionStatus === 'active' ? '✓ Em dia' : '⚠️ Atrasado'}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-slate-500">
                                            Clicar para marcar como {profileModal.client?.subscriptionStatus === 'active' ? 'Atrasado' : 'Em dia'}
                                        </span>
                                    </button>
                                </div>
                            )}
                            {/* Financial summary */}
                            <div className="mt-3 bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Total deixado na barbearia</p>
                                <p className="text-2xl font-bold text-emerald-400">{formatBRL(profileModal.client?.totalGasto)}</p>
                            </div>
                        </div>
                        {/* Orders list */}
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Últimas Comandas</h4>
                            {profileLoading ? (
                                <div className="text-center py-8">
                                    <div className="inline-block w-6 h-6 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin"></div>
                                </div>
                            ) : profileModal.orders.length > 0 ? (
                                <div className="space-y-2">
                                    {profileModal.orders.map((o) => (
                                        <div key={o.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-700/40 hover:border-slate-600 transition-colors">
                                            <div>
                                                <p className="text-sm font-medium text-slate-200">{o.data} <span className="text-slate-600 text-xs ml-1">{o.hora}</span></p>
                                                <p className="text-[11px] text-slate-500">{o.barbeiro} • {o.pagamento}</p>
                                            </div>
                                            <p className="text-sm font-bold text-emerald-400">{formatBRL(o.valor)}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-sm text-slate-600">Nenhuma comanda fechada</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
