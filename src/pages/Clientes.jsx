import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '../supabaseClient';
import { formatDate, formatTime, formatDateTime } from '../utils/dateUtils';
import { formatCurrency } from '../utils/orderUtils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useGlobalData } from '../context/GlobalDataContext';

// ── Helpers ──
const formatBRL = (v) => formatCurrency(v);

export default function Clientes() {
    const { adminProfile, loading: globalLoading, plans: dbPlans, refreshData } = useGlobalData();
    const barbershopId = adminProfile?.barbershopId;
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Card Info for subscriptions
    const [cardInfo, setCardInfo] = useState({ name: '', number: '', exp: '', cvv: '' });
    const [isCardSectionOpen, setIsCardSectionOpen] = useState(false);
    const [clientesLista, setClientesLista] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // KPIs
    const [totalClientes, setTotalClientes] = useState(0);
    const [totalAssinantes, setTotalAssinantes] = useState(0);
    const [novosEsteMes, setNovosEsteMes] = useState(0);

    // Modals
    const [newClientModal, setNewClientModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newBirthDate, setNewBirthDate] = useState('');
    const [newIsSub, setNewIsSub] = useState(false);
    const [newSelectedPlanId, setNewSelectedPlanId] = useState(null);

    // Plan picker
    const [planPickerModal, setPlanPickerModal] = useState(null); // { clientId } when open

    const [profileModal, setProfileModal] = useState({ open: false, client: null, orders: [] });
    const [profileLoading, setProfileLoading] = useState(false);

    // Profile Edit State
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editName, setEditName] = useState('');
    const [editBirthDate, setEditBirthDate] = useState('');

    // ── Fetch clients + cross-join orders ──
    const fetchClientes = useCallback(async () => {
        if (!barbershopId) return;
        setLoading(true);
        try {
            const bId = barbershopId;

            // 1. All clients
            const { data: clients } = await supabase
                .from('clients')
                .select('*')
                .eq('barbershop_id', bId)
                .order('name');

            // 2. All closed orders to count visits
            const { data: orders } = await supabase
                .from('orders')
                .select('client_id')
                .eq('barbershop_id', bId)
                .eq('status', 'closed');

            const visitCounts = (orders || []).reduce((acc, o) => {
                if (o.client_id) acc[o.client_id] = (acc[o.client_id] || 0) + 1;
                return acc;
            }, {});

            const mapped = (clients || []).map(c => ({
                id: c.id,
                name: c.name,
                phone: c.phone || 'Sem telefone',
                isSubscriber: c.is_subscriber || false,
                subscriptionStatus: c.subscription_status || 'none',
                totalVisits: visitCounts[c.id] || 0,
                createdAt: new Date(c.created_at),
                birthDate: c.birth_date ? new Date(c.birth_date + 'T12:00:00') : null
            }));

            setClientesLista(mapped);
            setTotalClientes(mapped.length);
            setTotalAssinantes(mapped.filter(c => c.isSubscriber).length);

            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            setNovosEsteMes(mapped.filter(c => c.createdAt >= startOfMonth).length);

        } catch (err) {
            console.error('Erro ao buscar clientes:', err);
            toast.error('Erro ao carregar lista de clientes');
        } finally {
            setLoading(false);
        }
    }, [barbershopId]);

    useEffect(() => {
        if (barbershopId) fetchClientes();
    }, [barbershopId, fetchClientes]);

    // ── Save new client ──
    const handleSaveClient = async () => {
        if (!newName.trim()) return toast.error('Nome é obrigatório');
        if (!barbershopId) return;

        setSaving(true);
        try {
            const { data: newClientData, error } = await supabase
                .from('clients')
                .insert([{
                    barbershop_id: barbershopId,
                    name: newName,
                    phone: newPhone,
                    birth_date: newBirthDate || null,
                    is_subscriber: newIsSub,
                    subscription_status: newIsSub ? 'active' : 'none'
                }])
                .select()
                .single();

            if (error) throw error;

            toast.success('Cliente cadastrado com sucesso!');
            setNewClientModal(false);
            setNewName('');
            setNewPhone('');
            setNewBirthDate('');
            setNewIsSub(false);
            setNewSelectedPlanId(null);
            setCardInfo({ name: '', number: '', exp: '', cvv: '' });
            setIsCardSectionOpen(false);
            fetchClientes();
            refreshData();
            
            if (newIsSub && newSelectedPlanId) {
                const validUntil = new Date();
                validUntil.setDate(validUntil.getDate() + 30);
                await supabase.from('client_subscriptions').insert({
                    client_id: newClientData.id,
                    plan_id: newSelectedPlanId,
                    status: 'active',
                    haircuts_used: 0,
                    shaves_used: 0,
                    valid_until: validUntil.toISOString(),
                    payment_method: 'PIX'
                });
            }
            
            // If subscribed, try to trigger Celcoin (if card info provided)
            if (newIsSub && cardInfo.number) {
                 const { data: { session } } = await supabase.auth.getSession();
                 const plan = dbPlans.find(p => p.id === newSelectedPlanId);
                 await fetch(`${supabase.supabaseUrl}/functions/v1/celcoin-subscription`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token}`
                    },
                    body: JSON.stringify({
                        clientId: newClientData.id,
                        planValue: plan?.price || 0,
                        celcoinToken: "mock_card_token_from_front"
                    })
                });
            }
        } catch (err) {
            toast.error('Erro ao salvar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Open profile modal ──
    const openProfile = async (client) => {
        setProfileModal({ open: true, client, orders: [] });
        setIsEditingProfile(false);
        setEditName(client.name || '');
        setEditBirthDate(client.birthDate ? client.birthDate.toISOString().split('T')[0] : '');
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

            setProfileModal(prev => ({ ...prev, orders: orders || [] }));
        } catch (err) {
            console.error('Erro ao buscar pedidos:', err);
        } finally {
            setProfileLoading(false);
        }
    };

    const handleUpdateProfile = async () => {
        if (!editName.trim()) return toast.error('Nome não pode ser vazio');
        try {
            const { error } = await supabase
                .from('clients')
                .update({ name: editName, birth_date: editBirthDate || null })
                .eq('id', profileModal.client.id);

            if (error) throw error;

            toast.success('Perfil atualizado!');
            setIsEditingProfile(false);
            
            // Re-fetch to update all lists and current modal
            await fetchClientes();
            refreshData();

            // Update modal locally to feel instant
            setProfileModal(prev => ({
                ...prev,
                client: {
                    ...prev.client,
                    name: editName,
                    birthDate: editBirthDate ? new Date(editBirthDate + 'T12:00:00') : null
                }
            }));
        } catch (err) {
            toast.error('Erro ao atualizar: ' + err.message);
        }
    };

    const handleDeleteClient = async () => {
        if (!window.confirm('Tem certeza? Isso excluirá o histórico deste cliente.')) return;
        try {
            const { error } = await supabase
                .from('clients')
                .delete()
                .eq('id', profileModal.client.id);

            if (error) throw error;
            toast.success('Cliente removido.');

            setProfileModal({ open: false, client: null, orders: [] });
            fetchClientes();
            refreshData();
        } catch (err) {
            toast.error('Erro ao excluir cliente: ' + err.message);
        }
    };

    const handleRemoveSubscription = async (clientId) => {
        if (!window.confirm('Remover assinatura deste cliente?')) return;
        try {
            const { error } = await supabase
                .from('clients')
                .update({ is_subscriber: false, subscription_status: 'none' })
                .eq('id', clientId);
            if (error) throw error;
            
            await supabase.from('client_subscriptions').delete().eq('client_id', clientId);

            toast.success('Assinatura removida.');
            setProfileModal(prev => ({
                ...prev,
                client: prev.client ? { ...prev.client, isSubscriber: false, subscriptionStatus: 'none' } : prev.client,
            }));
            fetchClientes();
            refreshData();
        } catch (err) {
            toast.error('Erro ao remover assinatura: ' + err.message);
        }
    };

    const confirmPlanSelection = async () => {
        if (!planPickerModal?.clientId) return;
        if (!newSelectedPlanId) return toast.error('Selecione um plano');

        const clientId = planPickerModal.clientId;
        try {
            const { error } = await supabase
                .from('clients')
                .update({ is_subscriber: true, subscription_status: 'active' })
                .eq('id', clientId);
            if (error) throw error;

            toast.success('Plano vinculado com sucesso!');
            setPlanPickerModal(null);

            const validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + 30);
            // Delete any old subscription records before inserting new one
            await supabase.from('client_subscriptions').delete().eq('client_id', clientId);
            const { error: subErr } = await supabase.from('client_subscriptions').insert({
                client_id: clientId,
                plan_id: newSelectedPlanId,
                status: 'active',
                haircuts_used: 0,
                shaves_used: 0,
                valid_until: validUntil.toISOString(),
                payment_method: 'PIX'
            });
            if (subErr) throw subErr;
            
            // If card info provided, try to trigger Celcoin
            if (cardInfo.number) {
                 const { data: { session } } = await supabase.auth.getSession();
                 const plan = dbPlans.find(p => p.id === newSelectedPlanId);
                 await fetch(`${supabase.supabaseUrl}/functions/v1/celcoin-subscription`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token}`
                    },
                    body: JSON.stringify({
                        clientId: clientId,
                        planValue: plan?.price || 0,
                        celcoinToken: "mock_card_token_from_front"
                    })
                });
            }
            fetchClientes();
            refreshData();
            setCardInfo({ name: '', number: '', exp: '', cvv: '' });
            setIsCardSectionOpen(false);
        } catch (err) {
            toast.error('Erro ao vincular plano: ' + err.message);
        }
    };

    // ── Toggle payment status (Em dia ↔ Atrasado) ──
    const handleTogglePaymentStatus = async (clientId, currentSubStatus) => {
        const newStatus = currentSubStatus === 'active' ? 'overdue' : 'active';
        try {
            // 1. Update clients table
            const { error: clientErr } = await supabase
                .from('clients')
                .update({ subscription_status: newStatus })
                .eq('id', clientId);
            if (clientErr) throw clientErr;

            // 2. Update client_subscriptions table to keep them in sync
            const { error: subErr } = await supabase
                .from('client_subscriptions')
                .update({ status: newStatus })
                .eq('client_id', clientId);
            // Non-blocking error check for subscription table
            if (subErr) console.warn('Aviso: Tabela subscriptions não atualizada:', subErr.message);

            toast.success(`Status alterado para ${newStatus === 'active' ? 'Em dia' : 'Atrasado'}`);
            setProfileModal(prev => 
                prev.client && prev.client.id === clientId 
                    ? { ...prev, client: { ...prev.client, subscriptionStatus: newStatus } }
                    : prev
            );
            setClientesLista(prev =>
                prev.map(c => c.id === clientId ? { ...c, subscriptionStatus: newStatus } : c)
            );
            refreshData();
        } catch (err) {
            toast.error('Erro ao atualizar status: ' + err.message);
        }
    };

    // ── Filtration ──
    const filteredClientes = useMemo(() => {
        let result = [...clientesLista];
        if (searchTerm) {
            const low = searchTerm.toLowerCase();
            result = result.filter(c => c.name.toLowerCase().includes(low) || c.phone.includes(low));
        }
        if (statusFilter === 'sub') result = result.filter(c => c.isSubscriber);
        if (statusFilter === 'free') result = result.filter(c => !c.isSubscriber);
        return result;
    }, [clientesLista, searchTerm, statusFilter]);

    // ── Pagination ──
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter]);

    const paginatedClientes = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredClientes.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredClientes, currentPage]);

    const totalPages = Math.ceil(filteredClientes.length / itemsPerPage);

    // ── Export ──
    const handleExportExcel = () => {
        const data = filteredClientes.map(c => ({
            Nome: c.name,
            Telefone: c.phone,
            Assinante: c.isSubscriber ? 'Sim' : 'Não',
            Status: c.subscriptionStatus,
            Visitas: c.totalVisits,
            'Data Cadastro': formatDate(c.createdAt)
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Clientes");
        XLSX.writeFile(wb, `Lista_Clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text("Lista de Clientes", 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${formatDateTime(new Date())}`, 14, 30);

        const tableData = filteredClientes.map(c => [
            c.name,
            c.phone,
            c.isSubscriber ? 'Sim' : 'Não',
            c.subscriptionStatus,
            c.totalVisits.toString(),
            formatDate(c.createdAt)
        ]);

        autoTable(doc, {
            startY: 35,
            head: [['Nome', 'Telefone', 'Assinador', 'Status', 'Visitas', 'Cadastro']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59] }
        });

        doc.save(`Lista_Clientes_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    // ── Render ──
    if ((loading || globalLoading) && clientesLista.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-500 text-sm">Carregando clientes...</p>
                </div>
            </div>
        );
    }

    return (
        <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* ── HEADER ── */}
                <header className="h-[72px] bg-slate-800 border-b border-slate-700 flex items-center justify-between px-8 flex-shrink-0">
                    <div>
                        <h1 className="text-lg font-semibold text-slate-100">Clientes</h1>
                        <p className="text-xs text-slate-500">Gestão e Fidelização</p>
                    </div>
                    <button
                        onClick={() => setNewClientModal(true)}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-red-600/20"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Novo Cliente
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {/* ── KPI HIGHLIGHTS ── */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total de Clientes</p>
                            <div className="flex items-baseline gap-2">
                                <h2 className="text-3xl font-bold text-slate-100">{totalClientes}</h2>
                                <span className="text-[10px] text-emerald-500 font-medium">+5% este mês</span>
                            </div>
                        </div>
                        <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Assinantes Ativos</p>
                            <div className="flex items-baseline gap-2">
                                <h2 className="text-3xl font-bold text-blue-500">{totalAssinantes}</h2>
                                <span className="text-[10px] text-slate-500 font-medium">{(totalClientes > 0 ? (totalAssinantes / totalClientes * 100).toFixed(0) : 0)}% da base</span>
                            </div>
                        </div>
                        <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Novos (Este Mês)</p>
                            <h2 className="text-3xl font-bold text-amber-500">{novosEsteMes}</h2>
                        </div>
                    </div>

                    {/* ── BARRA DE FERRAMENTAS ── */}
                    <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="relative w-full md:w-80">
                                <svg className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Buscar por nome ou telefone..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-red-600 transition-colors"
                                />
                            </div>
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-red-600 transition-colors cursor-pointer"
                            >
                                <option value="all">Todos os clientes</option>
                                <option value="sub">Assinantes</option>
                                <option value="free">Não Assinantes</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={handleExportExcel} className="p-2.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-xl text-slate-300 transition-colors" title="Exportar Excel">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                            </button>
                            <button onClick={handleExportPDF} className="p-2.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-xl text-slate-300 transition-colors" title="Exportar PDF">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* ── LISTA DE CLIENTES ── */}
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900/50">
                                <tr>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Contato</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Assinante</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Visitas</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {paginatedClientes.map((c) => (
                                    <tr key={c.id} className="hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 bg-slate-700 border border-slate-600 rounded-xl flex items-center justify-center text-xs font-bold text-slate-300">
                                                    {c.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-100">{c.name}</p>
                                                    <p className="text-[10px] text-slate-500">Cadastrado em {formatDate(c.createdAt)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-slate-400">{c.phone}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {c.isSubscriber ? (
                                                <div className="flex flex-col gap-1">
                                                    <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                        ASSINANTE
                                                    </span>
                                                    {c.subscriptionStatus === 'overdue' && (
                                                        <span className="text-[9px] font-bold text-red-500 uppercase">ATRASADO</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setPlanPickerModal({ clientId: c.id })}
                                                    className="text-[10px] font-bold text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 group"
                                                >
                                                    VINCULAR PLANO
                                                    <svg className="w-3 h-3 translate-y-px opacity-0 group-hover:opacity-100 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-sm font-bold text-slate-200">{c.totalVisits}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => openProfile(c)}
                                                className="p-2 py-1.5 text-xs bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 font-semibold transition-all"
                                            >
                                                Ver Perfil
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredClientes.length === 0 && (
                            <div className="px-6 py-16 text-center">
                                <p className="text-slate-500 text-sm">Nenhum cliente encontrado.</p>
                            </div>
                        )}
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-sm">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Anterior
                            </button>
                            <span className="text-slate-400 text-sm font-medium">
                                Página <span className="text-white font-bold">{currentPage}</span> de <span className="text-white font-bold">{totalPages}</span>
                            </span>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Próxima
                            </button>
                        </div>
                    )}
                </div>

                {/* ── MODAL: NOVO CLIENTE ── */}
                {newClientModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                        <div className="bg-slate-800 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                            <header className="px-6 py-5 border-b border-slate-700 flex items-center justify-between">
                                <h3 className="font-bold text-slate-100">Novo Cliente</h3>
                                <button onClick={() => setNewClientModal(false)} className="text-slate-500 hover:text-white transition-colors">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </header>
                            <div className="p-6 space-y-5">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nome Completo</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: João Silva"
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-red-600 transition-colors"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">WhatsApp / Telefone</label>
                                    <input
                                        type="text"
                                        placeholder="(00) 00000-0000"
                                        value={newPhone}
                                        onChange={e => { let val = e.target.value.replace(/\D/g, ''); if (val.length > 11) val = val.slice(0, 11); if (val.length > 7) { val = `(${val.slice(0,2)}) ${val.slice(2,7)}-${val.slice(7)}`; } else if (val.length > 2) { val = `(${val.slice(0,2)}) ${val.slice(2)}`; } setNewPhone(val); }}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-red-600 transition-colors"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nascimento</label>
                                    <input
                                        type="date"
                                        value={newBirthDate}
                                        onChange={e => setNewBirthDate(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:border-red-600 transition-colors"
                                    />
                                </div>

                                {/* Seção Assinatura */}
                                <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-xl space-y-4">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="sub-check"
                                            checked={newIsSub}
                                            onChange={e => setNewIsSub(e.target.checked)}
                                            className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-blue-600"
                                        />
                                        <label htmlFor="sub-check" className="text-sm font-semibold text-slate-300 cursor-pointer">
                                            Assinatura Recorrente?
                                        </label>
                                    </div>

                                    {newIsSub && (
                                        <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase">Escolha o Plano</label>
                                                <select
                                                    value={newSelectedPlanId || ''}
                                                    onChange={e => setNewSelectedPlanId(e.target.value)}
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-300 focus:outline-none"
                                                >
                                                    <option value="">Selecione...</option>
                                                    {dbPlans.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.price)}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Dados do Cartão (Opcional)</label>
                                                    <button 
                                                        onClick={() => setIsCardSectionOpen(!isCardSectionOpen)}
                                                        className="text-[10px] text-blue-400 font-bold hover:underline"
                                                    >
                                                        {isCardSectionOpen ? 'OCULTAR' : 'PREENCHER AGORA'}
                                                    </button>
                                                </div>
                                                
                                                {isCardSectionOpen && (
                                                    <div className="space-y-3 bg-slate-800 p-3 rounded-lg border border-slate-700">
                                                        <input 
                                                            placeholder="Nome no Cartão"
                                                            value={cardInfo.name}
                                                            onChange={e => setCardInfo({...cardInfo, name: e.target.value})}
                                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                                                        />
                                                        <input 
                                                            placeholder="Número do Cartão"
                                                            value={cardInfo.number}
                                                            onChange={e => setCardInfo({...cardInfo, number: e.target.value})}
                                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                                                        />
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <input 
                                                                placeholder="MM/AA"
                                                                value={cardInfo.exp}
                                                                onChange={e => setCardInfo({...cardInfo, exp: e.target.value})}
                                                                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                                                            />
                                                            <input 
                                                                placeholder="CVV"
                                                                value={cardInfo.cvv}
                                                                onChange={e => setCardInfo({...cardInfo, cvv: e.target.value})}
                                                                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <footer className="p-6 bg-slate-900/50 border-t border-slate-700 flex gap-3">
                                <button
                                    onClick={() => setNewClientModal(false)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 font-semibold hover:bg-slate-800 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveClient}
                                    disabled={saving}
                                    className="flex-3 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50 disabled:grayscale"
                                >
                                    {saving ? 'Gravando...' : 'Cadastrar Cliente'}
                                </button>
                            </footer>
                        </div>
                    </div>
                )}

                {/* ── MODAL: PICK PLAN (for existing free client) ── */}
                {planPickerModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                        <div className="bg-slate-800 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl animate-in zoom-in duration-200">
                            <header className="px-6 py-5 border-b border-slate-700 flex items-center justify-between">
                                <h3 className="font-bold text-slate-100 italic tracking-tight">Vincular Assinatura</h3>
                                <button onClick={() => setPlanPickerModal(null)} className="text-slate-500 hover:text-white transition-colors">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </header>
                            <div className="p-6 space-y-4">
                                <p className="text-xs text-slate-400 text-center px-4 leading-relaxed">
                                    Transforme este cliente em um assinante e garanta receita recorrente para sua barbearia.
                                </p>
                                <select
                                    value={newSelectedPlanId || ''}
                                    onChange={e => setNewSelectedPlanId(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                                >
                                    <option value="">Selecione um plano...</option>
                                    {dbPlans.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.price)}</option>
                                    ))}
                                </select>

                                {/* Dados do Cartão (Opcional aqui também) */}
                                <div className="p-3 bg-slate-900 rounded-xl border border-slate-700 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-500">DADOS DE PAGAMENTO</span>
                                        <button 
                                            onClick={() => setIsCardSectionOpen(!isCardSectionOpen)}
                                            className="text-[10px] text-blue-400 font-bold hover:underline"
                                        >
                                            {isCardSectionOpen ? 'CANCELAR' : 'ADICIONAR CARTÃO'}
                                        </button>
                                    </div>
                                    {isCardSectionOpen && (
                                        <div className="space-y-3 animate-in fade-in duration-300">
                                            <input 
                                                placeholder="Nome no Cartão"
                                                value={cardInfo.name}
                                                onChange={e => setCardInfo({...cardInfo, name: e.target.value})}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                                            />
                                            <input 
                                                placeholder="Número do Cartão"
                                                value={cardInfo.number}
                                                onChange={e => setCardInfo({...cardInfo, number: e.target.value})}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                                            />
                                            <div className="grid grid-cols-2 gap-2">
                                                <input 
                                                    placeholder="MM/AA"
                                                    value={cardInfo.exp}
                                                    onChange={e => setCardInfo({...cardInfo, exp: e.target.value})}
                                                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                                                />
                                                <input 
                                                    placeholder="CVV"
                                                    value={cardInfo.cvv}
                                                    onChange={e => setCardInfo({...cardInfo, cvv: e.target.value})}
                                                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <footer className="p-6 pt-2">
                                <button
                                    onClick={confirmPlanSelection}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
                                >
                                    Confirmar Assinatura
                                </button>
                            </footer>
                        </div>
                    </div>
                )}

                {/* ── MODAL: PERFIL DO CLIENTE ── */}
                {profileModal.open && (
                    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-[2px]">
                        <div className="bg-slate-800 w-full max-w-lg h-full border-l border-slate-700 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                            <header className="px-8 py-6 border-b border-slate-700 flex items-center justify-between bg-slate-800/50 backdrop-blur-md sticky top-0 z-10">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-100">Perfil do Cliente</h3>
                                    <p className="text-xs text-slate-500 font-medium tracking-tight">Análise e Gestão de Conta</p>
                                </div>
                                <button onClick={() => setProfileModal({ open: false, client: null, orders: [] })} className="p-2 hover:bg-slate-700 rounded-xl text-slate-400 transition-colors">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </header>

                            <div className="flex-1 overflow-y-auto p-8 space-y-8">
                                {/* CARD PRINCIPAL */}
                                <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-5">
                                            <div className="w-16 h-16 bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl border border-slate-600 flex items-center justify-center text-xl font-bold text-slate-100 shadow-inner">
                                                {profileModal.client.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                {isEditingProfile ? (
                                                    <div className="space-y-3 mt-1">
                                                        <input 
                                                            value={editName}
                                                            onChange={e => setEditName(e.target.value)}
                                                            className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white w-full"
                                                        />
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[10px] text-slate-500 uppercase font-bold">Nascimento</span>
                                                            <input 
                                                                type="date"
                                                                value={editBirthDate}
                                                                onChange={e => setEditBirthDate(e.target.value)}
                                                                className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white"
                                                            />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={handleUpdateProfile} className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-lg border border-emerald-500/20">SALVAR</button>
                                                            <button onClick={() => setIsEditingProfile(false)} className="text-[10px] font-bold bg-slate-700 text-slate-400 px-3 py-1.5 rounded-lg">CANCELAR</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <h4 className="text-xl font-bold text-white flex items-center gap-2">
                                                            {profileModal.client.name}
                                                            <button onClick={() => setIsEditingProfile(true)} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-500 transition-colors">
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                                                            </button>
                                                        </h4>
                                                        <div className="flex items-center gap-3 mt-1.5">
                                                            <span className="text-sm font-medium text-slate-400">{profileModal.client.phone}</span>
                                                            {profileModal.client.isSubscriber && (
                                                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-blue-500 text-white select-none">ASSINANTE</span>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {profileModal.client.birthDate && !isEditingProfile && (
                                        <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-2 text-slate-500">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
                                            <span className="text-xs font-medium">Aniversário em: {formatDate(profileModal.client.birthDate)}</span>
                                        </div>
                                    )}
                                </div>

                                {/* CONTROLE DE ASSINATURA */}
                                {profileModal.client.isSubscriber && (
                                    <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-6">
                                        <h5 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4">Gestão de Assinatura</h5>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex items-baseline justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Status do Pagamento</p>
                                                    <p className={`text-sm font-bold mt-1 ${profileModal.client.subscriptionStatus === 'active' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                        {profileModal.client.subscriptionStatus === 'active' ? '● Em dia' : '● Pagamento Atrasado'}
                                                    </p>
                                                </div>
                                                <button 
                                                    onClick={() => handleTogglePaymentStatus(profileModal.client.id, profileModal.client.subscriptionStatus)}
                                                    className="text-[9px] font-bold border border-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                                                >
                                                    {profileModal.client.subscriptionStatus === 'active' ? 'MARCAR COMO ATRASADO' : 'MARCAR COMO EM DIA'}
                                                </button>
                                            </div>
                                            <button 
                                                onClick={() => handleRemoveSubscription(profileModal.client.id)}
                                                className="w-full py-2.5 rounded-xl text-[10px] font-bold bg-red-600/10 text-red-500 border border-red-600/20 hover:bg-red-600/20 transition-all"
                                            >
                                                CANCELAR ASSINATURA RECORRENTE
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* HISTÓRICO DE COMANDAS */}
                                <div className="space-y-4">
                                    <div className="flex items-baseline justify-between">
                                        <h5 className="text-xs font-bold text-slate-100 uppercase tracking-widest">Últimas 10 Comandas</h5>
                                        <span className="text-[10px] text-slate-500 font-bold">{profileModal.orders.length} comandas no total</span>
                                    </div>

                                    {profileLoading ? (
                                        <div className="flex py-10 justify-center"><div className="w-5 h-5 border-2 border-slate-700 border-t-red-600 rounded-full animate-spin" /></div>
                                    ) : (
                                        <div className="space-y-3">
                                            {profileModal.orders.length > 0 ? (
                                                profileModal.orders.map((o) => (
                                                    <div key={o.id} className="bg-slate-900 p-4 rounded-xl border border-slate-700/50 flex items-center justify-between group">
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-200">{formatDate(new Date(o.closed_at))}</p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[10px] text-slate-500 uppercase font-bold">{o.payment_method === 'pix' ? 'PIX' : 'Dinheiro'}</span>
                                                                <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                                                <span className="text-[10px] text-slate-600">Comanda definitiva</span>
                                                            </div>
                                                        </div>
                                                        <p className="text-sm font-bold text-red-500 group-hover:scale-105 transition-transform">{formatBRL(o.total_amount)}</p>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="bg-slate-900 border border-slate-700 border-dashed p-10 rounded-2xl text-center">
                                                    <p className="text-xs text-slate-500 italic">Nenhuma comanda registrada para este cliente.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* PERIGO */}
                                <div className="pt-8 mt-4 border-t border-slate-700">
                                    <button 
                                        onClick={handleDeleteClient}
                                        className="w-full py-3.5 rounded-xl text-xs font-bold text-slate-500 hover:text-red-500 hover:bg-red-500/5 transition-all flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                        Excluir Cliente Permanentemente
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
        </main>
    );
}
