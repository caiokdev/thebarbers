import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '../supabaseClient';
import { useTheme } from '../context/ThemeContext';
import { useGlobalData } from '../context/GlobalDataContext';

const formatBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const DEFAULT_PLANS = [
    { 
        key: 'corte', 
        name: 'Plano de corte', 
        haircut_limit: 4, 
        shave_limit: 0, 
        description: '4 cortes de cabelo mensais (30 dias)',
        icon: (
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.12 8.12 12 12" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 4 8.12 15.88" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.8 14.8 20 20" />
            </svg>
        ),
        bgIcon: 'bg-blue-500/15'
    },
    { 
        key: 'barba', 
        name: 'Plano de barba', 
        haircut_limit: 0, 
        shave_limit: 4, 
        description: '4 barbas feitas mensais (30 dias)',
        icon: (
            <svg className="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 4h10l2 4v8l-2 4H7l-2-4V8l2-4z" />
                <circle cx="12" cy="12" r="2" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
            </svg>
        ),
        bgIcon: 'bg-emerald-500/15'
    },
    { 
        key: 'gold', 
        name: 'Plano gold', 
        haircut_limit: 4, 
        shave_limit: 4, 
        description: '4 cortes e 4 barbas mensais (30 dias)',
        icon: (
            <svg className="w-8 h-8 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
            </svg>
        ),
        bgIcon: 'bg-yellow-500/15'
    },
];

export default function Planos() {
    const { theme } = useTheme();
    const { adminProfile, loading: globalLoading, refreshData } = useGlobalData();
    const barbershopId = adminProfile?.barbershopId;
    const [loading, setLoading] = useState(true);

    const [dbPlans, setDbPlans] = useState([]);
    const [subscribers, setSubscribers] = useState([]);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingPlanDef, setEditingPlanDef] = useState(null);
    const [editForm, setEditForm] = useState({ price: '' });
    const [saving, setSaving] = useState(false);

    // Subscriber Details Modal State
    const [selectedSubscriber, setSelectedSubscriber] = useState(null);
    const [subDetails, setSubDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [subForm, setSubForm] = useState({ haircuts_used: 0, shaves_used: 0, valid_until: '', status: 'active' });

    // Checkout Modal State
    const [checkoutPlan, setCheckoutPlan] = useState(null);
    const [clientSearch, setClientSearch] = useState('');
    const [selectedClient, setSelectedClient] = useState(null);
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [allClients, setAllClients] = useState([]);
    const [checkoutCardInfo, setCheckoutCardInfo] = useState({ name: '', number: '', exp: '', cvv: '' });
    const [checkingOut, setCheckingOut] = useState(false);

    const fetchPlans = useCallback(async () => {
        if (!barbershopId) return;
        
        // Fetch plans
        const { data: plansData } = await supabase
            .from('plans')
            .select('*')
            .eq('barbershop_id', barbershopId);
        setDbPlans(plansData || []);

        // Fetch subscribers
        const { data: subsData } = await supabase
            .from('clients')
            .select('id, name, phone, subscription_status')
            .eq('barbershop_id', barbershopId)
            .eq('is_subscriber', true)
            .order('name', { ascending: true });
        setSubscribers(subsData || []);

        setLoading(false);
    }, [barbershopId]);

    const fetchAllClients = useCallback(async () => {
        if (!barbershopId) return;
        const { data } = await supabase
            .from('clients')
            .select('id, name, phone, is_subscriber')
            .eq('barbershop_id', barbershopId)
            .order('name', { ascending: true });
        setAllClients(data || []);
    }, [barbershopId]);

    useEffect(() => {
        if (barbershopId) {
            fetchPlans();
            fetchAllClients();
        }
    }, [barbershopId, fetchPlans, fetchAllClients]);

    const openEditModal = (planDef) => {
        setEditingPlanDef(planDef);
        const existing = dbPlans.find(db => db.name === planDef.name);
        setEditForm({ price: existing?.price?.toString() || '0' });
        setShowEditModal(true);
    };

    const handleSavePlan = async () => {
        if (!editingPlanDef) return;
        setSaving(true);
        try {
            const priceVal = parseFloat(editForm.price.replace(',', '.')) || 0;
            const existing = dbPlans.find(db => db.name === editingPlanDef.name);
            
            const payload = {
                barbershop_id: barbershopId,
                name: editingPlanDef.name,
                price: priceVal,
                haircut_limit: editingPlanDef.haircut_limit,
                shave_limit: editingPlanDef.shave_limit
            };

            if (existing) {
                const { error } = await supabase.from('plans').update(payload).eq('id', existing.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('plans').insert(payload);
                if (error) throw error;
            }
            
            setShowEditModal(false);
            fetchPlans();
            if (refreshData) refreshData();
        } catch (err) {
            toast.error(`Erro ao salvar: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ── Subscriber Details Handlers ──
    const openSubscriberDetails = async (client) => {
        setSelectedSubscriber(client);
        setDetailsLoading(true);
        try {
            const { data: subData, error } = await supabase
                .from('client_subscriptions')
                .select('*, plans(name, haircut_limit, shave_limit)')
                .eq('client_id', client.id)
                .single();

            if (error && error.code !== 'PGRST116') { // not found
                console.error(error);
                throw error;
            }

            if (subData) {
                setSubDetails(subData);
                setSubForm({
                    haircuts_used: subData.haircuts_used || 0,
                    shaves_used: subData.shaves_used || 0,
                    valid_until: subData.valid_until ? new Date(subData.valid_until).toISOString().split('T')[0] : '',
                    status: subData.status || 'active'
                });
            } else {
                setSubDetails(null);
            }
        } catch (err) {
            toast.error('Erro ao carregar os detalhes da assinatura.');
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleSaveSubDetails = async () => {
        if (!subDetails) return;
        setSaving(true);
        try {
            const validUntilIso = new Date(subForm.valid_until + 'T23:59:59').toISOString();
            
            const dateIsOverdue = new Date(subForm.valid_until + 'T23:59:59') < new Date();
            const newStatus = (subForm.status === 'overdue' || dateIsOverdue) ? 'overdue' : 'active';
            
            const { error: subErr } = await supabase.from('client_subscriptions').update({
                haircuts_used: parseInt(subForm.haircuts_used, 10),
                shaves_used: parseInt(subForm.shaves_used, 10),
                valid_until: validUntilIso,
                status: newStatus
            }).eq('id', subDetails.id);
            if (subErr) throw subErr;

            const { error: clientErr } = await supabase.from('clients').update({
                subscription_status: newStatus
            }).eq('id', selectedSubscriber.id);
            if (clientErr) throw clientErr;

            toast.success('Assinatura atualizada com sucesso!');
            setSelectedSubscriber(null);
            fetchPlans();
            if (refreshData) refreshData();
        } catch (err) {
            toast.error(`Erro ao atualizar assinatura: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleRenewSub = async () => {
        if (!subDetails) return;
        setSaving(true);
        try {
            const currentValid = subDetails.valid_until ? new Date(subDetails.valid_until) : new Date();
            const now = new Date();
            let newValid = new Date();

            if (currentValid > now) {
                newValid = new Date(currentValid.setDate(currentValid.getDate() + 30));
            } else {
                newValid.setDate(now.getDate() + 30);
            }

            const { error: subErr } = await supabase.from('client_subscriptions').update({
                haircuts_used: 0,
                shaves_used: 0,
                valid_until: newValid.toISOString(),
                status: 'active'
            }).eq('id', subDetails.id);
            if (subErr) throw subErr;

            const { error: clientErr } = await supabase.from('clients').update({
                subscription_status: 'active'
            }).eq('id', selectedSubscriber.id);
            if (clientErr) throw clientErr;

            toast.success('Assinatura renovada (zerada) com sucesso para mais 30 dias!');
            setSelectedSubscriber(null);
            fetchPlans();
            if (refreshData) refreshData();
        } catch (err) {
            toast.error(`Erro ao renovar: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleCancelSubscription = async () => {
        if (!subDetails) return;
        if (!window.confirm(`Tem certeza que deseja cancelar a assinatura de ${selectedSubscriber.name}?`)) return;
        
        setSaving(true);
        try {
            const { error: subErr } = await supabase
                .from('client_subscriptions')
                .delete()
                .eq('id', subDetails.id);
            if (subErr) throw subErr;

            const { error: clientErr } = await supabase
                .from('clients')
                .update({ is_subscriber: false, subscription_status: 'none' })
                .eq('id', selectedSubscriber.id);
            if (clientErr) throw clientErr;

            toast.success('Assinatura cancelada com sucesso.');
            setSelectedSubscriber(null);
            fetchPlans();
            if (refreshData) refreshData();
        } catch (err) {
            toast.error(`Erro ao cancelar assinatura: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ── Checkout / Subscription Handlers ──
    const openCheckout = (planDef) => {
        setCheckoutPlan(planDef);
        setClientSearch('');
        setSelectedClient(null);
        setShowClientDropdown(false);
        setCheckoutCardInfo({ name: '', number: '', exp: '', cvv: '' });
    };

    const handleCheckout = async () => {
        if (!selectedClient) {
            toast.error("Selecione um cliente para prosseguir.");
            return;
        }
        if (!checkoutCardInfo.name || !checkoutCardInfo.number || !checkoutCardInfo.exp || !checkoutCardInfo.cvv) {
            toast.error("Preencha todos os dados do cartão.");
            return;
        }

        setCheckingOut(true);
        try {
            const client = selectedClient;
            const existingPlan = dbPlans.find(db => db.name === checkoutPlan.name);
            const planValue = existingPlan ? existingPlan.price : 0;

            const { data: { session } } = await supabase.auth.getSession();
            
            const response = await fetch(`${supabase.supabaseUrl}/functions/v1/celcoin-subscription`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    clientId: client.id,
                    planValue: planValue,
                    celcoinToken: "mock_card_token_from_front"
                })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || "Erro ao processar assinatura na Celcoin");
            }

            const { data: existingSub } = await supabase
                .from('client_subscriptions')
                .select('id')
                .eq('client_id', client.id)
                .single();

            if (!existingSub) {
                const validUntil = new Date();
                validUntil.setDate(validUntil.getDate() + 30);
                await supabase.from('client_subscriptions').insert({
                    client_id: client.id,
                    plan_id: existingPlan?.id,
                    status: 'active',
                    haircuts_used: 0,
                    shaves_used: 0,
                    valid_until: validUntil.toISOString(),
                    payment_method: 'PIX'
                });
            } else {
                await supabase.from('client_subscriptions').update({ 
                    plan_id: existingPlan?.id,
                    status: 'active',
                    payment_method: 'PIX'
                }).eq('client_id', client.id);
            }

            await supabase.from('clients').update({
                is_subscriber: true,
                subscription_status: 'active'
            }).eq('id', client.id);

            toast.success("Assinatura criada com sucesso! A cobrança recorrente foi ativada.");
            setCheckoutPlan(null);
            fetchPlans();
            if (refreshData) refreshData();
        } catch (err) {
            toast.error(`Erro no Checkout: ${err.message}`);
        } finally {
            setCheckingOut(false);
        }
    };

    if (loading || globalLoading) {
        return (
            <div className="flex h-full items-center justify-center p-12">
                <div className="text-center">
                    <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin mb-4" />
                    <p className="text-slate-500 text-sm">Carregando planos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-12">
            {/* ── HEADER CONTENT ── */}
            <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        Planos de Assinatura
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-yellow-500/20 text-yellow-500 uppercase tracking-widest border border-yellow-500/20">
                            Premium
                        </span>
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">Configure os preços e gerencie as assinaturas dos seus clientes</p>
                </div>
            </div>

            {/* ── PLANS GRID ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {DEFAULT_PLANS.map(planDef => {
                    const existing = dbPlans.find(db => db.name === planDef.name);
                    const currentPrice = existing ? existing.price : 0;
                    const isActive = !!existing;

                    return (
                        <div key={planDef.key} className="relative group bg-slate-800 rounded-3xl border border-slate-700 overflow-hidden hover:border-slate-500 transition-all duration-300 shadow-xl flex flex-col">
                            <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                                {planDef.icon}
                            </div>
                            <div className="p-8 pb-6 flex-1">
                                <div className={`w-14 h-14 rounded-2xl ${planDef.bgIcon} flex items-center justify-center mb-6`}>
                                    {planDef.icon}
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2">{planDef.name}</h3>
                                <p className="text-sm text-slate-400 mb-6 min-h-[40px] leading-relaxed">{planDef.description}</p>
                                
                                <div className="space-y-3 mb-8">
                                    <div className="flex items-center gap-3 text-sm text-slate-300">
                                        <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        <span>{planDef.haircut_limit} Cortes por mês</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-slate-300">
                                        <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        <span>{planDef.shave_limit} Barbas por mês</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-slate-300 opacity-60">
                                        <svg className="w-5 h-5 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        <span>Validade de 30 dias</span>
                                    </div>
                                </div>

                                <div className="flex items-end gap-2 mb-2">
                                    <span className="text-3xl font-black text-white">{formatBRL(currentPrice)}</span>
                                    <span className="text-sm text-slate-500 font-medium mb-1.5">/mês</span>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-900/50 border-t border-slate-700/50 mt-auto flex flex-col gap-2">
                                <button 
                                    onClick={() => openEditModal(planDef)}
                                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors flex items-center justify-center gap-2 border border-slate-700"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                                    {isActive ? 'Alterar Preço' : 'Definir Preço'}
                                </button>
                                <button 
                                    onClick={() => openCheckout(planDef)}
                                    title="Assinar para um cliente"
                                    className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-black/20 flex items-center justify-center gap-2"
                                >
                                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                    Assinar Plano
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── SUBSCRIBERS LIST ── */}
            <div className="bg-slate-800 rounded-3xl border border-slate-700 overflow-hidden shadow-xl">
                <div className="p-6 border-b border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-white">Assinantes do Clube</h2>
                        <p className="text-sm text-slate-400 mt-1">Todos os clientes com assinatura ativa ou atrasada</p>
                    </div>
                    <div className="px-4 py-2 bg-slate-900 rounded-xl border border-slate-700 flex items-center gap-2 shadow-inner">
                        <span className="text-sm text-slate-400 font-medium">Total:</span>
                        <span className="text-lg font-bold text-white">{subscribers.length}</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-900/50">
                            <tr>
                                <th className="px-8 py-4 font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Cliente</th>
                                <th className="px-8 py-4 font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Contato</th>
                                <th className="px-8 py-4 font-semibold text-slate-400 uppercase tracking-wider text-[11px]">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {subscribers.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-8 py-12 text-center text-slate-500">
                                        Nenhum assinante cadastrado.
                                    </td>
                                </tr>
                            ) : (
                                subscribers.map(sub => (
                                    <tr key={sub.id} onClick={() => openSubscriberDetails(sub)} className="hover:bg-slate-700/30 transition-colors cursor-pointer group">
                                        <td className="px-8 py-4 border-l-4 border-transparent group-hover:border-red-500 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0 border border-slate-600 shadow-sm">
                                                    {(sub.name || '??').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className="font-semibold text-slate-200">{sub.name || 'Sem Nome'}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-4 text-slate-400 font-medium">
                                            {sub.phone || '—'}
                                        </td>
                                        <td className="px-8 py-4">
                                            {sub.subscription_status === 'overdue' ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-600/10 text-red-500 border border-red-500/20 shadow-sm">
                                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                                    Atrasado
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                    Em dia
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── MODALS ── */}
            {showEditModal && editingPlanDef && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)}></div>
                    <div className="relative bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-sm p-8 shadow-2xl">
                        <div className="flex flex-col items-center text-center">
                            <div className={`w-14 h-14 rounded-2xl ${editingPlanDef.bgIcon} flex items-center justify-center mb-6 ring-8 ring-slate-800/10`}>
                                {editingPlanDef.icon}
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">{editingPlanDef.name}</h3>
                            <p className="text-sm text-slate-400 mb-8 leading-relaxed">{editingPlanDef.description}</p>
                            <div className="w-full text-left mb-8 relative">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 ml-1">Preço Mensal (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="10000"
                                    value={editForm.price}
                                    onChange={e => setEditForm({ ...editForm, price: e.target.value })}
                                    onKeyDown={e => e.key === 'Enter' && handleSavePlan()}
                                    placeholder="Ex: 89.90"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4 text-xl font-medium text-white placeholder-slate-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 transition-all text-center"
                                    autoFocus
                                />
                            </div>
                            <div className="flex w-full gap-3">
                                <button onClick={() => setShowEditModal(false)} disabled={saving} className="flex-1 py-3.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold transition-colors disabled:opacity-50">
                                    Cancelar
                                </button>
                                <button onClick={handleSavePlan} disabled={saving} className={`flex-1 py-3.5 rounded-xl ${theme.bg} ${theme.bgHover} text-white text-sm font-bold transition-all shadow-lg ${theme.shadow} disabled:opacity-50 flex items-center justify-center gap-2`}>
                                    {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    {saving ? '...' : 'Salvar Preço'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {selectedSubscriber && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSubscriber(null)}></div>
                    <div className="relative bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className={`px-6 py-4 flex items-center justify-between border-b ${
                            selectedSubscriber.subscription_status === 'overdue' 
                            ? 'bg-red-500/10 border-red-500/20' 
                            : 'bg-emerald-500/10 border-emerald-500/20'
                        }`}>
                            <div className="flex flex-col">
                                <h3 className="text-xl font-bold text-white">{selectedSubscriber.name}</h3>
                                <p className="text-sm text-slate-400">{selectedSubscriber.phone || 'Sem telefone'}</p>
                            </div>
                            {selectedSubscriber.subscription_status === 'overdue' ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-600 text-white shadow-sm">Atrasado</span>
                            ) : (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm">Em Dia</span>
                            )}
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {detailsLoading ? (
                                <div className="flex justify-center py-12">
                                    <div className="w-8 h-8 border-4 border-slate-600 border-t-red-500 rounded-full animate-spin" />
                                </div>
                            ) : !subDetails ? (
                                <div className="text-center py-8">
                                    <p className="text-slate-400 text-sm mb-4">Nenhum registro de controle de assinatura encontrado.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">PLANO</p>
                                            <p className="text-lg font-semibold text-slate-100">{subDetails.plans?.name || 'Vustomizado'}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Pagamento:</span>
                                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20 uppercase">
                                                    {subDetails.payment_method || 'PIX'}
                                                </span>
                                            </div>
                                        </div>
                                        <button onClick={handleCancelSubscription} disabled={saving} className="px-3 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-500 text-[10px] font-bold rounded-lg border border-red-500/20 transition-colors uppercase">Cancelar Plano</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Cortes</p>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    value={subForm.haircuts_used}
                                                    onChange={e => setSubForm({...subForm, haircuts_used: Math.min(Number(e.target.value), subDetails.plans?.haircut_limit ?? 9999)})}
                                                    className="w-16 bg-slate-800 border border-slate-600 rounded-lg p-2 text-center text-white font-bold focus:outline-none focus:border-red-500"
                                                />
                                                <span className="text-slate-400 text-sm">/ {subDetails.plans?.haircut_limit || 0}</span>
                                            </div>
                                        </div>
                                        <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Barbas</p>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    value={subForm.shaves_used}
                                                    onChange={e => setSubForm({...subForm, shaves_used: Math.min(Number(e.target.value), subDetails.plans?.shave_limit ?? 9999)})}
                                                    className="w-16 bg-slate-800 border border-slate-600 rounded-lg p-2 text-center text-white font-bold focus:outline-none focus:border-red-500"
                                                />
                                                <span className="text-slate-400 text-sm">/ {subDetails.plans?.shave_limit || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Situação</p>
                                        <div className="flex p-1 bg-slate-800 rounded-xl border border-slate-700">
                                            <button onClick={() => setSubForm({...subForm, status: 'active'})} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${subForm.status === 'active' ? 'bg-emerald-500 text-white' : 'text-slate-500'}`}>Em Dia</button>
                                            <button onClick={() => setSubForm({...subForm, status: 'overdue'})} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${subForm.status === 'overdue' ? 'bg-red-500 text-white' : 'text-slate-500'}`}>Atrasado</button>
                                        </div>
                                    </div>
                                    <div className={`bg-slate-900/50 p-4 rounded-2xl border border-slate-700 ${subForm.status === 'overdue' ? 'opacity-40 pointer-events-none' : ''}`}>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Válido até</label>
                                        <input type="date" value={subForm.valid_until} onChange={e => setSubForm({...subForm, valid_until: e.target.value})} className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500" />
                                    </div>
                                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl">
                                        <p className="text-sm text-slate-300 mb-4">Renovação adiciona 30 dias e zera o uso.</p>
                                        <button onClick={handleRenewSub} disabled={saving} className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-600 text-slate-900 text-sm font-bold rounded-xl transition-colors">Renovar e Zerar</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-6 bg-slate-900/50 border-t border-slate-700 flex gap-3">
                            <button onClick={() => setSelectedSubscriber(null)} disabled={saving} className="flex-1 py-3.5 rounded-xl bg-slate-700 text-slate-200 text-sm font-semibold">Cancelar</button>
                            <button onClick={handleSaveSubDetails} disabled={saving} className="flex-1 py-3.5 rounded-xl bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2">
                                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Salvar Alterações'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {checkoutPlan && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCheckoutPlan(null)}></div>
                    <div className="relative bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-lg p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <h3 className="text-xl font-bold text-white mb-6">Assinar {checkoutPlan.name}</h3>
                        <div className="space-y-5">
                            <div className="relative">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cliente</label>
                                <input
                                    type="text"
                                    value={clientSearch}
                                    onChange={e => { setClientSearch(e.target.value); setSelectedClient(null); setShowClientDropdown(true); }}
                                    onFocus={() => setShowClientDropdown(true)}
                                    placeholder="Buscar por nome..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                                />
                                {showClientDropdown && !selectedClient && (
                                    <div className="absolute z-[70] w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-y-auto max-h-48">
                                        {allClients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 10).map(c => (
                                            <button key={c.id} onClick={() => { setSelectedClient(c); setClientSearch(c.name); setShowClientDropdown(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-700 border-b border-slate-700/50 last:border-none flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-200">{c.name}</p>
                                                    <p className="text-[10px] text-slate-500">{c.phone || 'Sem telefone'}</p>
                                                </div>
                                                {c.is_subscriber && <span className="text-[9px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded-full border border-yellow-500/20">Assinante</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700 space-y-4">
                                <input type="text" maxLength="19" value={checkoutCardInfo.number} onChange={e => setCheckoutCardInfo({...checkoutCardInfo, number: e.target.value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ')})} placeholder="0000 0000 0000 0000" className="w-full bg-slate-800 rounded-lg px-4 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 font-mono" />
                                <input type="text" value={checkoutCardInfo.name} onChange={e => setCheckoutCardInfo({...checkoutCardInfo, name: e.target.value})} placeholder="NOME NO CARTÃO" className="w-full bg-slate-800 rounded-lg px-4 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 uppercase" />
                                <div className="grid grid-cols-2 gap-4">
                                    <input type="text" maxLength="5" value={checkoutCardInfo.exp} onChange={e => setCheckoutCardInfo({...checkoutCardInfo, exp: e.target.value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2')})} placeholder="MM/AA" className="w-full bg-slate-800 rounded-lg px-4 py-3 text-sm text-white text-center font-mono" />
                                    <input type="text" maxLength="4" value={checkoutCardInfo.cvv} onChange={e => setCheckoutCardInfo({...checkoutCardInfo, cvv: e.target.value.replace(/\D/g, '')})} placeholder="CVV" className="w-full bg-slate-800 rounded-lg px-4 py-3 text-sm text-white text-center font-mono" />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={() => setCheckoutPlan(null)} disabled={checkingOut} className="flex-1 py-3.5 rounded-xl bg-slate-700 text-slate-200 text-sm font-semibold">Cancelar</button>
                            <button onClick={handleCheckout} disabled={checkingOut} className="flex-1 py-3.5 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2">
                                {checkingOut ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Assinar Agora'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
