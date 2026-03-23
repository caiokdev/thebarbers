import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '../supabaseClient';
import Sidebar from '../components/Sidebar';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Helpers ──
const formatBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Clientes() {
    // ── State ──
    const [barbershopId, setBarbershopId] = useState(null);
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

    // Plan data & picker
    const [dbPlans, setDbPlans] = useState([]);
    const [planPickerModal, setPlanPickerModal] = useState(null); // { clientId } when open

    const [profileModal, setProfileModal] = useState({ open: false, client: null, orders: [] });
    const [profileLoading, setProfileLoading] = useState(false);

    // Profile Edit State
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editName, setEditName] = useState('');
    const [editBirthDate, setEditBirthDate] = useState('');

    // ── Fetch barbershop_id ──
    useEffect(() => {
        async function fetchShop() {
            const { data: shop } = await supabase
                .from('barbershops')
                .select('id')
                .limit(1)
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

            // Fetch plans for this barbershop
            const { data: plansData } = await supabase.from('plans').select('*').eq('barbershop_id', bId);
            setDbPlans(plansData || []);

            // 1. All clients
            const { data: clients } = await supabase
                .from('clients')
                .select('id, name, phone, birth_date, is_subscriber, subscription_status, created_at')
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
                dataNascimento: c.birth_date ? new Date(c.birth_date + 'T12:00:00') : null, // Fix timezone issue for birth dates
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

    // ── Filtered list (text search + status filter) ──
    const filteredClientes = useMemo(() => {
        return clientesLista
            .filter(c => {
                // Status filter
                if (statusFilter === 'all') return true;
                if (statusFilter === 'active') return c.isSubscriber === true && c.subscriptionStatus === 'active';
                if (statusFilter === 'overdue') return c.isSubscriber === true && c.subscriptionStatus === 'overdue';
                if (statusFilter === 'avulso') return !c.isSubscriber;
                return true;
            })
            .filter(c => {
                // Text search
                if (!searchTerm.trim()) return true;
                const term = searchTerm.toLowerCase();
                return c.nome.toLowerCase().includes(term) || c.telefone.includes(term);
            });
    }, [clientesLista, searchTerm, statusFilter]);

    // ── Save new client ──
    const handleSaveClient = async () => {
        if (!newName.trim()) return toast.error('Nome é obrigatório.');
        if (newIsSub && !newSelectedPlanId) return toast.error('Selecione um plano para o assinante.');
        setSaving(true);
        try {
            const { data: newClientData, error } = await supabase.from('clients').insert({
                name: newName.trim(),
                phone: newPhone.trim() || null,
                birth_date: newBirthDate || null,
                is_subscriber: newIsSub,
                subscription_status: newIsSub ? 'active' : 'none',
                barbershop_id: barbershopId,
            }).select('id').single();
            if (error) throw error;
            
            if (newIsSub && newClientData?.id) {
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

            setNewClientModal(false);
            setNewName('');
            setNewPhone('');
            setNewBirthDate('');
            setNewIsSub(false);
            setNewSelectedPlanId(null);
            setCardInfo({ name: '', number: '', exp: '', cvv: '' });
            setIsCardSectionOpen(false);
            fetchClientes();
            
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
        setEditName(client.nome || '');
        setEditBirthDate(client.dataNascimento ? client.dataNascimento.toISOString().split('T')[0] : '');
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
                const { data: profiles } = await supabase.from('professionals').select('id, name').in('id', proIds);
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

    // ── Update Client Profile ──
    const handleUpdateClientProfile = async () => {
        if (!editName.trim()) return toast.error('Nome é obrigatório.');

        try {
            const { error } = await supabase
                .from('clients')
                .update({
                    name: editName.trim(),
                    birth_date: editBirthDate || null,
                })
                .eq('id', profileModal.client.id);

            if (error) throw error;

            // Re-fetch to update all lists and current modal
            await fetchClientes();

            // Update modal locally to feel instant
            setProfileModal(prev => ({
                ...prev,
                client: {
                    ...prev.client,
                    nome: editName.trim(),
                    dataNascimento: editBirthDate ? new Date(editBirthDate + 'T12:00:00') : null
                }
            }));

            setIsEditingProfile(false);
        } catch (err) {
            toast.error('Erro ao atualizar perfil: ' + err.message);
        }
    };

    // ── Delete Client ──
    const handleDeleteClient = async () => {
        if (!window.confirm("Tem certeza que deseja excluir este cliente permanentemente? Isso pode apagar ou desvincular seu histórico dependendo do banco de dados.")) {
            return;
        }

        try {
            const { error } = await supabase
                .from('clients')
                .delete()
                .eq('id', profileModal.client.id);

            if (error) throw error;

            setProfileModal({ open: false, client: null, orders: [] });
            fetchClientes();
        } catch (err) {
            toast.error('Erro ao excluir cliente: ' + err.message);
        }
    };

    // ── Toggle subscription ──
    const toggleSubscription = async (clientId, currentStatus) => {
        const newIsSub = !currentStatus;
        if (newIsSub) {
            // Show plan picker modal first
            setPlanPickerModal({ clientId });
            setCardInfo({ name: '', number: '', exp: '', cvv: '' });
            setIsCardSectionOpen(false);
            return;
        }
        // Unsubscribing: update directly
        try {
            const { error } = await supabase
                .from('clients')
                .update({ is_subscriber: false, subscription_status: 'none' })
                .eq('id', clientId);
            if (error) throw error;
            // Remove subscription record
            await supabase.from('client_subscriptions').delete().eq('client_id', clientId);
            setProfileModal(prev => ({
                ...prev,
                client: prev.client ? { ...prev.client, isSubscriber: false, subscriptionStatus: 'none' } : prev.client,
            }));
            fetchClientes();
        } catch (err) {
            toast.error('Erro ao remover assinatura: ' + err.message);
        }
    };

    const confirmPlanSelection = async (planId) => {
        if (!planPickerModal) return;
        const clientId = planPickerModal.clientId;
        setPlanPickerModal(null);
        try {
            const { error } = await supabase
                .from('clients')
                .update({ is_subscriber: true, subscription_status: 'active' })
                .eq('id', clientId);
            if (error) throw error;

            const { data: existingSub } = await supabase.from('client_subscriptions').select('id').eq('client_id', clientId).single();
            if (!existingSub) {
                const validUntil = new Date();
                validUntil.setDate(validUntil.getDate() + 30);
                await supabase.from('client_subscriptions').insert({
                    client_id: clientId,
                    plan_id: planId,
                    status: 'active',
                    haircuts_used: 0,
                    shaves_used: 0,
                    valid_until: validUntil.toISOString(),
                    payment_method: 'PIX'
                });
            } else {
                // Update plan
                await supabase.from('client_subscriptions').update({ 
                    plan_id: planId,
                    payment_method: 'PIX' 
                }).eq('client_id', clientId);
            }

            setProfileModal(prev => ({
                ...prev,
                client: prev.client ? { ...prev.client, isSubscriber: true, subscriptionStatus: 'active' } : prev.client,
            }));
            fetchClientes();

            // Trigger Celcoin if card info provided
            if (cardInfo.number) {
                const { data: { session } } = await supabase.auth.getSession();
                const plan = dbPlans.find(p => p.id === planId);
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
            if (subErr) throw subErr;

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
            toast.error('Erro ao atualizar status: ' + err.message);
        }
    };

    // ── Excel Export ──
    const exportToExcel = () => {
        if (!filteredClientes || filteredClientes.length === 0) {
            toast.error('Não há clientes para exportar com os filtros atuais.');
            return;
        }

        const dataToExport = filteredClientes.map(c => ({
            'Nome': c.nome,
            'Contato': c.telefone,
            'Status': c.isSubscriber ? (c.subscriptionStatus === 'overdue' ? 'Atrasado' : 'Assinante') : 'Avulso',
            'Última Visita': c.ultimaVisita
                ? `${String(c.ultimaVisita.getDate()).padStart(2, '0')}/${String(c.ultimaVisita.getMonth() + 1).padStart(2, '0')}/${c.ultimaVisita.getFullYear()}`
                : '—',
            'Total Gasto (R$)': c.totalGasto.toFixed(2).replace('.', ',')
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Clientes");
        XLSX.writeFile(wb, `Lista_Clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // ── PDF Export ──
    const exportToPDF = () => {
        if (!filteredClientes || filteredClientes.length === 0) {
            toast.error('Não há clientes para exportar com os filtros atuais.');
            return;
        }

        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text(`Relatório de Clientes`, 14, 22);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);
        doc.text(`Total de Clientes no relatório: ${filteredClientes.length}`, 14, 36);

        const tableColumn = ["Nome", "Contato", "Status", "Última Visita", "Total Gasto"];
        const tableRows = [];

        filteredClientes.forEach(c => {
            const status = c.isSubscriber ? (c.subscriptionStatus === 'overdue' ? 'Atrasado' : 'Assinante') : 'Avulso';
            const ultimaVisita = c.ultimaVisita
                ? `${String(c.ultimaVisita.getDate()).padStart(2, '0')}/${String(c.ultimaVisita.getMonth() + 1).padStart(2, '0')}/${c.ultimaVisita.getFullYear()}`
                : '—';

            const rowData = [
                c.nome,
                c.telefone,
                status,
                ultimaVisita,
                formatBRL(c.totalGasto)
            ];
            tableRows.push(rowData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 44,
            theme: 'striped',
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            alternateRowStyles: { fillColor: [241, 245, 249] },
        });

        doc.save(`Lista_Clientes_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    // ── Render ──
    if (loading && clientesLista.length === 0) {
        return (
            <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
                <Sidebar />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin mb-4"></div>
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
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-red-600/20"
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
                        <div className="bg-slate-800 rounded-2xl p-5" style={{ border: '1px solid rgba(181,148,16,0.3)' }}>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(181,148,16,0.12)' }}>
                                    <svg className="w-5 h-5" style={{ color: '#B59410' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                    </svg>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Assinantes</p>
                            </div>
                            <p className="text-3xl font-bold" style={{ color: '#B59410' }}>{totalAssinantes}</p>
                            <p className="text-[10px] text-slate-600 mt-1">{totalClientes > 0 ? ((totalAssinantes / totalClientes) * 100).toFixed(0) : 0}% da base</p>
                        </div>
                        {/* Novos este mês */}
                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                                    </svg>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Novos este mês</p>
                            </div>
                            <p className="text-3xl font-bold text-emerald-400">{novosEsteMes}</p>
                        </div>
                    </div>

                    {/* ══════════ LINHA 2 — Filtros + Search ══════════ */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full">
                            {/* Filter Pills */}
                            <div className="flex flex-wrap items-center gap-1.5 bg-slate-800 rounded-xl border border-slate-700 p-1">
                                {[
                                    { key: 'all', label: 'Todos' },
                                    { key: 'active', label: 'Em Dia' },
                                    { key: 'overdue', label: 'Atrasados' },
                                    { key: 'avulso', label: 'Avulsos' },
                                ].map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => setStatusFilter(f.key)}
                                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${statusFilter === f.key
                                            ? f.key === 'overdue'
                                                ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30 shadow-sm'
                                                : f.key === 'active'
                                                    ? 'bg-red-600/20 text-red-500 ring-1 ring-red-600/30 shadow-sm'
                                                    : 'bg-slate-700 text-slate-200 ring-1 ring-slate-600 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
                                            }`}
                                    >
                                        {f.label}
                                        {f.key !== 'all' && (
                                            <span className="ml-1.5 text-[10px] opacity-70">
                                                {f.key === 'active' ? clientesLista.filter(c => c.isSubscriber && c.subscriptionStatus === 'active').length
                                                    : f.key === 'overdue' ? clientesLista.filter(c => c.isSubscriber && c.subscriptionStatus === 'overdue').length
                                                        : clientesLista.filter(c => !c.isSubscriber).length}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── Export Buttons ── */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                onClick={exportToExcel}
                                className="px-3 py-2 bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-600/20 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                Excel
                            </button>
                            <button
                                onClick={exportToPDF}
                                className="px-3 py-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                                PDF
                            </button>
                        </div>
                    </div>

                    {/* ══════════ Search Bar ══════════ */}
                    <div className="relative">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Pesquisar por nome ou telefone..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-600/50 focus:ring-1 focus:ring-red-600/30 transition-all"
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
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-600 text-white ring-1 ring-red-500">
                                                                ⚠ Atrasado
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: '#111', color: '#fff', boxShadow: '0 0 0 1px rgba(181,148,16,0.5)' }}>
                                                                ★ Assinante
                                                            </span>
                                                        )
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-700 text-slate-300 ring-1 ring-inset ring-slate-600">
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
                        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Nome *</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="Nome completo"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-600/50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Telefone / WhatsApp</label>
                                <input
                                    type="text"
                                    value={newPhone}
                                    onChange={e => setNewPhone(e.target.value)}
                                    placeholder="(00) 00000-0000"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-600/50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Data de Nascimento</label>
                                <input
                                    type="date"
                                    value={newBirthDate}
                                    onChange={e => setNewBirthDate(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-red-600/50"
                                />
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${newIsSub ? 'bg-red-600' : 'bg-slate-700'}`}
                                    onClick={() => { setNewIsSub(v => !v); setNewSelectedPlanId(null); }}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${newIsSub ? 'translate-x-4' : 'translate-x-0'}`} />
                                </div>
                                <span className="text-sm text-slate-300 group-hover:text-slate-200">Assinante do clube</span>
                                <input type="checkbox" checked={newIsSub} onChange={e => { setNewIsSub(e.target.checked); setNewSelectedPlanId(null); }} className="hidden" />
                            </label>
                            {/* ── Plan selector (shown when subscriber toggle is on) ── */}
                            {newIsSub && (
                                <div className="mt-1">
                                    <p className="text-xs font-semibold text-slate-400 mb-2">Plano do assinante *</p>
                                    {dbPlans.length === 0 ? (
                                        <p className="text-xs text-slate-500 bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700">
                                            Nenhum plano cadastrado. Crie os planos na aba "Planos" primeiro.
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {dbPlans.map(plan => (
                                                <button
                                                    key={plan.id}
                                                    type="button"
                                                    onClick={() => setNewSelectedPlanId(plan.id)}
                                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                                                        newSelectedPlanId === plan.id
                                                            ? 'bg-red-600/15 border-red-500/50 ring-1 ring-red-500/30'
                                                            : 'bg-slate-900/60 border-slate-700 hover:border-slate-500'
                                                    }`}
                                                >
                                                    <div>
                                                        <p className={`text-sm font-semibold ${newSelectedPlanId === plan.id ? 'text-white' : 'text-slate-200'}`}>
                                                            {plan.name}
                                                        </p>
                                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                                            {plan.haircut_limit > 0 ? `${plan.haircut_limit} cortes` : ''}
                                                            {plan.haircut_limit > 0 && plan.shave_limit > 0 ? ' + ' : ''}
                                                            {plan.shave_limit > 0 ? `${plan.shave_limit} barbas` : ''}
                                                            {' · '}
                                                            {(plan.price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês
                                                        </p>
                                                    </div>
                                                    {newSelectedPlanId === plan.id && (
                                                        <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Card Capture "Gavetinha" ── */}
                            {newIsSub && (
                                <div className="mt-4">
                                    <button 
                                        type="button"
                                        onClick={() => setIsCardSectionOpen(!isCardSectionOpen)}
                                        className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl hover:border-emerald-500/50 transition-all"
                                    >
                                        <div className="flex items-center gap-2">
                                            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                            </svg>
                                            <span className="text-sm font-semibold text-slate-300">Dados do Cartão (Celcoin)</span>
                                        </div>
                                        <svg className={`w-4 h-4 text-slate-500 transition-transform ${isCardSectionOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    
                                    {isCardSectionOpen && (
                                        <div className="mt-2 p-4 bg-slate-900 border border-slate-700 rounded-xl space-y-4 animate-in slide-in-from-top-2 duration-200">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Número do Cartão</label>
                                                <input
                                                    type="text"
                                                    value={cardInfo.number}
                                                    onChange={e => {
                                                        const val = e.target.value.replace(/\D/g, '').substring(0, 16);
                                                        const fmt = val.replace(/(\d{4})(?=\d)/g, '$1 ');
                                                        setCardInfo({ ...cardInfo, number: fmt });
                                                    }}
                                                    placeholder="0000 0000 0000 0000"
                                                    className="w-full bg-slate-800 border-none rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome no Cartão</label>
                                                <input
                                                    type="text"
                                                    value={cardInfo.name}
                                                    onChange={e => setCardInfo({ ...cardInfo, name: e.target.value.toUpperCase() })}
                                                    placeholder="NOME COMPLETO"
                                                    className="w-full bg-slate-800 border-none rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 uppercase"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Validade</label>
                                                    <input
                                                        type="text"
                                                        value={cardInfo.exp}
                                                        onChange={e => {
                                                            let val = e.target.value.replace(/\D/g, '').substring(0, 4);
                                                            if (val.length > 2) val = val.substring(0, 2) + '/' + val.substring(2);
                                                            setCardInfo({ ...cardInfo, exp: val });
                                                        }}
                                                        placeholder="MM/AA"
                                                        className="w-full bg-slate-800 border-none rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 text-center font-mono"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">CVV</label>
                                                    <input
                                                        type="text"
                                                        value={cardInfo.cvv}
                                                        onChange={e => setCardInfo({ ...cardInfo, cvv: e.target.value.replace(/\D/g, '').substring(0, 4) })}
                                                        placeholder="123"
                                                        className="w-full bg-slate-800 border-none rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 text-center font-mono"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
                            <button onClick={() => setNewClientModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveClient}
                                disabled={saving}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
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
                                        {isEditingProfile ? (
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-red-600/50"
                                            />
                                        ) : (
                                            <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                                                {profileModal.client?.nome}
                                                {profileModal.client?.isSubscriber && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-600/15 text-red-500 border border-red-600/30">
                                                        Assinante
                                                    </span>
                                                )}
                                            </h3>
                                        )}
                                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                            {profileModal.client?.telefone}
                                            <span className="pl-2 border-l border-slate-600 flex items-center gap-2">
                                                Nasc:
                                                {isEditingProfile ? (
                                                    <input
                                                        type="date"
                                                        value={editBirthDate}
                                                        onChange={(e) => setEditBirthDate(e.target.value)}
                                                        className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 focus:outline-none focus:border-red-600/50"
                                                    />
                                                ) : (
                                                    profileModal.client?.dataNascimento ? profileModal.client.dataNascimento.toLocaleDateString('pt-BR') : '—'
                                                )}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isEditingProfile ? (
                                        <>
                                            <button onClick={() => setIsEditingProfile(false)} className="text-slate-400 hover:text-slate-200 transition-colors text-xs font-medium px-2 py-1">
                                                Cancelar
                                            </button>
                                            <button onClick={handleUpdateClientProfile} className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors">
                                                Salvar
                                            </button>
                                        </>
                                    ) : (
                                        <button onClick={() => setIsEditingProfile(true)} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded-lg transition-colors" title="Editar Cliente">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>
                                    )}
                                    <button onClick={() => setProfileModal({ open: false, client: null, orders: [] })} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 rounded-lg transition-colors">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            {/* Subscription toggle */}
                            <div className="mt-4 flex items-center justify-between bg-slate-900/50 rounded-xl px-4 py-3 border border-slate-700/50">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                    </svg>
                                    <span className="text-sm font-medium text-slate-300">Clube de Assinatura</span>
                                </div>
                                <button
                                    onClick={() => toggleSubscription(profileModal.client?.id, profileModal.client?.isSubscriber)}
                                    className="relative"
                                >
                                    <div className={`w-12 h-7 rounded-full transition-colors flex items-center ${profileModal.client?.isSubscriber ? 'bg-red-600' : 'bg-slate-700'}`}>
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
                                            ? 'bg-red-600/10 border-emerald-500/25 hover:bg-red-600/20'
                                            : 'bg-rose-500/10 border-rose-500/25 hover:bg-rose-500/20'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-semibold ${profileModal.client?.subscriptionStatus === 'active' ? 'text-red-500' : 'text-rose-400'
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
                            {/* Financial summary & Delete action */}
                            <div className="mt-3 flex gap-3">
                                <div className="flex-1 bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Total deixado na barbearia</p>
                                    <p className="text-2xl font-bold" style={{ color: '#B59410' }}>{formatBRL(profileModal.client?.totalGasto)}</p>
                                </div>
                                <button
                                    onClick={handleDeleteClient}
                                    className="flex items-center justify-center p-4 bg-slate-900/50 rounded-xl border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 transition-colors"
                                    title="Excluir Cliente Permanentemente"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        {/* Orders list */}
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Últimas Comandas</h4>
                            {profileLoading ? (
                                <div className="text-center py-8">
                                    <div className="inline-block w-6 h-6 border-2 border-slate-700 border-t-red-600 rounded-full animate-spin"></div>
                                </div>
                            ) : profileModal.orders.length > 0 ? (
                                <div className="space-y-2">
                                    {profileModal.orders.map((o) => (
                                        <div key={o.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-700/40 hover:border-slate-600 transition-colors">
                                            <div>
                                                <p className="text-sm font-medium text-slate-200">{o.data} <span className="text-slate-600 text-xs ml-1">{o.hora}</span></p>
                                                <p className="text-[11px] text-slate-500">{o.barbeiro} • {o.pagamento}</p>
                                            </div>
                                            <p className="text-sm font-bold text-red-500">{formatBRL(o.valor)}</p>
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

            {/* ════════ PLAN PICKER MODAL ════════ */}
            {planPickerModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPlanPickerModal(null)}></div>
                    <div className="relative bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-sm p-8 shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-1">Escolha o Plano</h3>
                        <p className="text-sm text-slate-400 mb-6">Selecione o plano que este cliente irá assinar:</p>
                        {dbPlans.length === 0 ? (
                            <div className="text-center py-4">
                                <p className="text-slate-500 text-sm">Nenhum plano cadastrado ainda.</p>
                                <p className="text-slate-600 text-xs mt-1">Crie os planos na aba "Planos" primeiro.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {dbPlans.map(plan => (
                                    <button
                                        key={plan.id}
                                        onClick={() => confirmPlanSelection(plan.id)}
                                        className="w-full flex items-center justify-between px-4 py-4 bg-slate-900 hover:bg-slate-700 border border-slate-700 hover:border-red-500/50 rounded-2xl transition-all group"
                                    >
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-slate-100 group-hover:text-white">{plan.name}</p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {plan.haircut_limit > 0 ? `${plan.haircut_limit} cortes` : ''}
                                                {plan.haircut_limit > 0 && plan.shave_limit > 0 ? ' + ' : ''}
                                                {plan.shave_limit > 0 ? `${plan.shave_limit} barbas` : ''}
                                                {' · '}
                                                {(plan.price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês
                                            </p>
                                        </div>
                                        <svg className="w-5 h-5 text-slate-600 group-hover:text-red-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* ── Card Capture for Existing Client ── */}
                        <div className="mt-4">
                            <button 
                                type="button"
                                onClick={() => setIsCardSectionOpen(!isCardSectionOpen)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl hover:border-emerald-500/50 transition-all"
                            >
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-slate-300">Dados do Cartão (Opcional)</span>
                                </div>
                                <svg className={`w-4 h-4 text-slate-500 transition-transform ${isCardSectionOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            
                            {isCardSectionOpen && (
                                <div className="mt-2 p-4 bg-slate-900 border border-slate-700 rounded-xl space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Número do Cartão</label>
                                        <input
                                            type="text"
                                            value={cardInfo.number}
                                            onChange={e => {
                                                const val = e.target.value.replace(/\D/g, '').substring(0, 16);
                                                const fmt = val.replace(/(\d{4})(?=\d)/g, '$1 ');
                                                setCardInfo({ ...cardInfo, number: fmt });
                                            }}
                                            placeholder="0000 0000 0000 0000"
                                            className="w-full bg-slate-800 border-none rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 font-mono"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Validade</label>
                                            <input
                                                type="text"
                                                value={cardInfo.exp}
                                                onChange={e => {
                                                    let val = e.target.value.replace(/\D/g, '').substring(0, 4);
                                                    if (val.length > 2) val = val.substring(0, 2) + '/' + val.substring(2);
                                                    setCardInfo({ ...cardInfo, exp: val });
                                                }}
                                                placeholder="MM/AA"
                                                className="w-full bg-slate-800 border-none rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 text-center font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">CVV</label>
                                            <input
                                                type="text"
                                                value={cardInfo.cvv}
                                                onChange={e => setCardInfo({ ...cardInfo, cvv: e.target.value.replace(/\D/g, '').substring(0, 4) })}
                                                placeholder="123"
                                                className="w-full bg-slate-800 border-none rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-emerald-500 text-center font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button onClick={() => setPlanPickerModal(null)} className="mt-6 w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
