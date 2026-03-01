import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Sidebar from '../components/Sidebar';

const formatBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TABS = [
    { key: 'geral', label: 'Dados da Barbearia', icon: '🏪' },
    { key: 'horarios', label: 'Horários', icon: '🕐' },
    { key: 'servicos', label: 'Serviços', icon: '✂️' },
    { key: 'equipa', label: 'Equipa', icon: '👥' },
];

const DAYS = [
    { key: 0, label: 'Domingo' },
    { key: 1, label: 'Segunda-feira' },
    { key: 2, label: 'Terça-feira' },
    { key: 3, label: 'Quarta-feira' },
    { key: 4, label: 'Quinta-feira' },
    { key: 5, label: 'Sexta-feira' },
    { key: 6, label: 'Sábado' },
];

const DEFAULT_HOURS = DAYS.map(d => ({
    day_of_week: d.key,
    open_time: d.key === 0 ? '' : '09:00',
    close_time: d.key === 0 ? '' : '20:00',
    is_closed: d.key === 0,
}));

export default function Configuracoes() {
    const [activeTab, setActiveTab] = useState('geral');
    const [barbershopId, setBarbershopId] = useState(null);
    const [loading, setLoading] = useState(true);

    // ── Geral ──
    const [shopData, setShopData] = useState({ name: '', address: '', phone: '' });
    const [savingShop, setSavingShop] = useState(false);

    // ── Horários ──
    const [businessHours, setBusinessHours] = useState(DEFAULT_HOURS);
    const [savingHours, setSavingHours] = useState(false);

    // ── Serviços ──
    const [services, setServices] = useState([]);
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [serviceForm, setServiceForm] = useState({ name: '', price: '', duration_minutes: 30 });
    const [savingService, setSavingService] = useState(false);

    // ── Equipa ──
    const [professionals, setProfessionals] = useState([]);
    const [showProModal, setShowProModal] = useState(false);
    const [editingPro, setEditingPro] = useState(null);
    const [proForm, setProForm] = useState({ name: '', phone: '', specialty: 'Barbeiro' });
    const [savingPro, setSavingPro] = useState(false);

    // ── Init ──
    useEffect(() => {
        async function init() {
            const { data: shop } = await supabase
                .from('barbershops')
                .select('*')
                .limit(1)
                .single();
            if (shop) {
                setBarbershopId(shop.id);
                setShopData({ name: shop.name || '', address: shop.address || '', phone: shop.phone || '' });
            }
            setLoading(false);
        }
        init();
    }, []);

    // ── Fetch all data when barbershopId is ready ──
    const fetchAll = useCallback(async () => {
        if (!barbershopId) return;
        const bId = barbershopId;

        // Business hours
        const { data: hours } = await supabase
            .from('business_hours')
            .select('*')
            .eq('barbershop_id', bId)
            .order('day_of_week');
        if (hours && hours.length > 0) {
            setBusinessHours(DAYS.map(d => {
                const found = hours.find(h => h.day_of_week === d.key);
                return found || { day_of_week: d.key, open_time: '09:00', close_time: '20:00', is_closed: true };
            }));
        }

        // Services
        const { data: svcData } = await supabase
            .from('services')
            .select('*')
            .eq('barbershop_id', bId)
            .order('name');
        setServices(svcData || []);

        // Professionals
        const { data: prosData } = await supabase
            .from('professionals')
            .select('*')
            .eq('barbershop_id', bId)
            .eq('role', 'barber')
            .order('name');
        setProfessionals(prosData || []);
    }, [barbershopId]);

    useEffect(() => {
        if (barbershopId) fetchAll();
    }, [barbershopId, fetchAll]);

    // ── Save shop info ──
    const handleSaveShop = async () => {
        setSavingShop(true);
        try {
            const { error } = await supabase
                .from('barbershops')
                .update({ name: shopData.name, address: shopData.address, phone: shopData.phone })
                .eq('id', barbershopId);
            if (error) throw error;
            alert('Dados salvos com sucesso!');
        } catch (err) {
            alert(`Erro: ${err.message}`);
        } finally {
            setSavingShop(false);
        }
    };

    // ── Save business hours (upsert) ──
    const handleSaveHours = async () => {
        setSavingHours(true);
        try {
            const horariosFormatados = businessHours.map(h => ({
                barbershop_id: barbershopId,
                day_of_week: h.day_of_week,
                open_time: h.is_closed ? null : h.open_time,
                close_time: h.is_closed ? null : h.close_time,
                is_closed: h.is_closed,
            }));
            const { data, error } = await supabase
                .from('business_hours')
                .upsert(horariosFormatados, { onConflict: 'barbershop_id, day_of_week' })
                .select();
            if (error) throw error;
            if (data) {
                setBusinessHours(data.sort((a, b) => a.day_of_week - b.day_of_week));
            }
            alert('Horários salvos com sucesso!');
        } catch (err) {
            alert(`Erro: ${err.message}`);
        } finally {
            setSavingHours(false);
        }
    };

    // ── Service CRUD ──
    const openNewService = () => {
        setEditingService(null);
        setServiceForm({ name: '', price: '', duration_minutes: 30 });
        setShowServiceModal(true);
    };
    const openEditService = (svc) => {
        setEditingService(svc);
        setServiceForm({ name: svc.name, price: svc.price?.toString() || '', duration_minutes: svc.duration_minutes || 30 });
        setShowServiceModal(true);
    };
    const handleSaveService = async () => {
        if (!serviceForm.name.trim()) { alert('Nome é obrigatório.'); return; }
        setSavingService(true);
        try {
            const payload = {
                barbershop_id: barbershopId,
                name: serviceForm.name.trim(),
                price: parseFloat(serviceForm.price) || 0,
                duration_minutes: parseInt(serviceForm.duration_minutes) || 30,
            };
            if (editingService) {
                const { error } = await supabase.from('services').update(payload).eq('id', editingService.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('services').insert(payload);
                if (error) throw error;
            }
            setShowServiceModal(false);
            fetchAll();
        } catch (err) {
            alert(`Erro: ${err.message}`);
        } finally {
            setSavingService(false);
        }
    };

    // ── Professional CRUD ──
    const openNewPro = () => {
        setEditingPro(null);
        setProForm({ name: '', phone: '', specialty: 'Barbeiro' });
        setShowProModal(true);
    };
    const openEditPro = (pro) => {
        setEditingPro(pro);
        setProForm({ name: pro.name || '', phone: pro.phone || '', specialty: pro.specialty || 'Barbeiro' });
        setShowProModal(true);
    };
    const handleSavePro = async () => {
        if (!proForm.name.trim()) { alert('Nome é obrigatório.'); return; }
        setSavingPro(true);
        try {
            const payload = {
                barbershop_id: barbershopId,
                name: proForm.name.trim(),
                phone: proForm.phone.trim(),
                role: 'barber',
                specialty: proForm.specialty,
            };
            if (editingPro) {
                const { error } = await supabase.from('professionals').update(payload).eq('id', editingPro.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('professionals').insert(payload);
                if (error) throw error;
            }
            setShowProModal(false);
            fetchAll();
        } catch (err) {
            alert(`Erro: ${err.message}`);
        } finally {
            setSavingPro(false);
        }
    };
    const handleDeletePro = async (pro) => {
        if (!confirm(`Deseja excluir "${pro.name}"?`)) return;
        try {
            const { error } = await supabase.from('professionals').delete().eq('id', pro.id);
            if (error) throw error;
            fetchAll();
        } catch (err) {
            alert(`Erro ao excluir: ${err.message}`);
        }
    };

    const updateHour = (dayKey, field, value) => {
        setBusinessHours(prev => prev.map(h =>
            h.day_of_week === dayKey ? { ...h, [field]: value } : h
        ));
    };

    // ── Loading ──
    if (loading) {
        return (
            <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
                <Sidebar />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-4" />
                        <p className="text-slate-500 text-sm">Carregando configurações...</p>
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
                        <h1 className="text-lg font-semibold text-slate-100">Configurações</h1>
                        <p className="text-xs text-slate-500">Gerencie os dados da barbearia, horários e catálogos</p>
                    </div>
                </header>

                {/* ── TABS ── */}
                <div className="bg-slate-800 border-b border-slate-700 px-8 flex-shrink-0">
                    <div className="flex gap-1">
                        {TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-5 py-3 text-sm font-medium rounded-t-xl transition-all ${activeTab === tab.key
                                    ? 'bg-slate-900 text-emerald-400 border-t-2 border-x border-emerald-500 border-slate-700'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                                    }`}
                            >
                                <span className="mr-2">{tab.icon}</span>{tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6">

                    {/* ════════════════ TAB GERAL ════════════════ */}
                    {activeTab === 'geral' && (
                        <div className="w-full">
                            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                <h2 className="text-base font-semibold text-slate-100 mb-1">Dados da Barbearia</h2>
                                <p className="text-xs text-slate-500 mb-6">Informações gerais do estabelecimento</p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Nome</label>
                                        <input type="text" value={shopData.name} onChange={e => setShopData(p => ({ ...p, name: e.target.value }))}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Endereço</label>
                                        <input type="text" value={shopData.address} onChange={e => setShopData(p => ({ ...p, address: e.target.value }))}
                                            placeholder="Rua, número, bairro, cidade"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Telefone / WhatsApp</label>
                                        <input type="text" value={shopData.phone} onChange={e => setShopData(p => ({ ...p, phone: e.target.value }))}
                                            placeholder="(11) 99999-9999"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
                                    </div>
                                </div>

                                <div className="flex justify-end mt-6 pt-5 border-t border-slate-700">
                                    <button onClick={handleSaveShop} disabled={savingShop}
                                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2">
                                        {savingShop && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                        {savingShop ? 'Salvando...' : 'Salvar Dados'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ════════════════ TAB HORÁRIOS ════════════════ */}
                    {activeTab === 'horarios' && (
                        <div className="w-full">
                            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                <h2 className="text-base font-semibold text-slate-100 mb-1">Horários de Funcionamento</h2>
                                <p className="text-xs text-slate-500 mb-6">Defina os dias e horários de abertura para agendamentos</p>

                                <div className="space-y-3">
                                    {DAYS.map(day => {
                                        const h = businessHours.find(bh => bh.day_of_week === day.key) || { is_closed: true, open_time: '', close_time: '' };
                                        return (
                                            <div key={day.key} className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${h.is_closed ? 'bg-slate-900/40 border-slate-700/50 opacity-60' : 'bg-slate-900/60 border-slate-700'}`}>
                                                <div className="w-36 flex-shrink-0">
                                                    <span className="text-sm font-medium text-slate-200">{day.label}</span>
                                                </div>

                                                {/* Toggle */}
                                                <button
                                                    onClick={() => updateHour(day.key, 'is_closed', !h.is_closed)}
                                                    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${h.is_closed ? 'bg-slate-700' : 'bg-emerald-500'}`}
                                                >
                                                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${h.is_closed ? 'left-0.5' : 'left-[26px]'}`} />
                                                </button>
                                                <span className={`text-xs font-medium w-16 flex-shrink-0 ${h.is_closed ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                    {h.is_closed ? 'Fechado' : 'Aberto'}
                                                </span>

                                                {/* Time inputs */}
                                                {!h.is_closed && (
                                                    <>
                                                        <input type="time" value={h.open_time || '09:00'}
                                                            onChange={e => updateHour(day.key, 'open_time', e.target.value)}
                                                            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 [color-scheme:dark]" />
                                                        <span className="text-slate-500 text-xs">até</span>
                                                        <input type="time" value={h.close_time || '20:00'}
                                                            onChange={e => updateHour(day.key, 'close_time', e.target.value)}
                                                            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 [color-scheme:dark]" />
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex justify-end mt-6 pt-5 border-t border-slate-700">
                                    <button onClick={handleSaveHours} disabled={savingHours}
                                        className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2">
                                        {savingHours && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                        {savingHours ? 'Salvando...' : 'Salvar Horários'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ════════════════ TAB SERVIÇOS ════════════════ */}
                    {activeTab === 'servicos' && (
                        <div className="w-full">
                            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                                {/* Header */}
                                <div className="flex items-center justify-between p-6 border-b border-slate-700">
                                    <div>
                                        <h2 className="text-base font-semibold text-slate-100">Catálogo de Serviços</h2>
                                        <p className="text-xs text-slate-500">Serviços disponíveis para agendamento</p>
                                    </div>
                                    <button onClick={openNewService}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                        Novo Serviço
                                    </button>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-700">
                                                <th className="text-left px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Serviço</th>
                                                <th className="text-center px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Duração</th>
                                                <th className="text-right px-6 py-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Preço</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {services.length === 0 ? (
                                                <tr>
                                                    <td colSpan={3} className="px-6 py-12 text-center text-slate-600">Nenhum serviço cadastrado.</td>
                                                </tr>
                                            ) : (
                                                services.map(svc => (
                                                    <tr key={svc.id} onClick={() => openEditService(svc)} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer" title="Clique para editar">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                                                                    <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121A3 3 0 1 0 9.879 9.879m4.242 4.242L9.88 9.88m4.242 4.242l2.829 2.829M9.879 9.879L7.05 7.05" />
                                                                    </svg>
                                                                </div>
                                                                <span className="font-medium text-slate-200">{svc.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20">
                                                                {svc.duration_minutes || 30} min
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-semibold text-emerald-400">{formatBRL(svc.price)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ════════════════ TAB EQUIPA ════════════════ */}
                    {activeTab === 'equipa' && (
                        <div className="w-full">
                            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                                <div className="flex items-center justify-between p-6 border-b border-slate-700">
                                    <div>
                                        <h2 className="text-base font-semibold text-slate-100">Profissionais</h2>
                                        <p className="text-xs text-slate-500">Barbeiros e profissionais cadastrados</p>
                                    </div>
                                    <button onClick={openNewPro}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                        Novo Profissional
                                    </button>
                                </div>
                                {professionals.length === 0 ? (
                                    <div className="px-6 py-12 text-center text-slate-600">Nenhum profissional cadastrado.</div>
                                ) : (
                                    <div className="divide-y divide-slate-700/50">
                                        {professionals.map(pro => (
                                            <div key={pro.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-700/30 transition-colors">
                                                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0">
                                                    {pro.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-200 truncate">{pro.name}</p>
                                                    <p className="text-xs text-slate-500">{pro.specialty || 'Barbeiro'} {pro.phone ? `• ${pro.phone}` : ''}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => openEditPro(pro)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-blue-400 transition-colors" title="Editar">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                                                    </button>
                                                    <button onClick={() => handleDeletePro(pro)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-rose-400 transition-colors" title="Excluir">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>
            </main>

            {/* ════════ SERVICE MODAL ════════ */}
            {showServiceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowServiceModal(false)}>
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/40 mx-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-violet-500/15 rounded-xl flex items-center justify-center">
                                    <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121A3 3 0 1 0 9.879 9.879m4.242 4.242L9.88 9.88m4.242 4.242l2.829 2.829M9.879 9.879L7.05 7.05" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-100">{editingService ? 'Editar Serviço' : 'Novo Serviço'}</h3>
                                    <p className="text-xs text-slate-500">Catálogo de serviços para agendamento</p>
                                </div>
                            </div>
                            <button onClick={() => setShowServiceModal(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Nome do Serviço *</label>
                                <input type="text" value={serviceForm.name} onChange={e => setServiceForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Ex: Corte Degradê"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Preço (R$)</label>
                                    <input type="number" step="0.01" min="0" value={serviceForm.price}
                                        onChange={e => setServiceForm(p => ({ ...p, price: e.target.value }))}
                                        placeholder="0,00"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Duração (min)</label>
                                    <select value={serviceForm.duration_minutes}
                                        onChange={e => setServiceForm(p => ({ ...p, duration_minutes: parseInt(e.target.value) }))}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors">
                                        <option value={15}>15 min</option>
                                        <option value={30}>30 min</option>
                                        <option value={45}>45 min</option>
                                        <option value={60}>1 hora</option>
                                        <option value={90}>1h30</option>
                                        <option value={120}>2 horas</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-700">
                            <button onClick={() => setShowServiceModal(false)} disabled={savingService}
                                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors disabled:opacity-50">
                                Cancelar
                            </button>
                            <button onClick={handleSaveService} disabled={savingService}
                                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                                {savingService && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {savingService ? 'Salvando...' : (editingService ? 'Salvar' : 'Cadastrar Serviço')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════ PROFESSIONAL MODAL ════════ */}
            {showProModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowProModal(false)}>
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/40 mx-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center">
                                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-100">{editingPro ? 'Editar Profissional' : 'Novo Profissional'}</h3>
                                    <p className="text-xs text-slate-500">Cadastro de barbeiro/profissional</p>
                                </div>
                            </div>
                            <button onClick={() => setShowProModal(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Nome *</label>
                                <input type="text" value={proForm.name} onChange={e => setProForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Nome completo"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Telefone</label>
                                <input type="text" value={proForm.phone} onChange={e => setProForm(p => ({ ...p, phone: e.target.value }))}
                                    placeholder="(11) 99999-9999"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Especialidade</label>
                                <select value={proForm.specialty} onChange={e => setProForm(p => ({ ...p, specialty: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors">
                                    <option value="Barbeiro">Barbeiro</option>
                                    <option value="Cabeleireiro">Cabeleireiro</option>
                                    <option value="Assistente">Assistente</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-700">
                            <button onClick={() => setShowProModal(false)} disabled={savingPro}
                                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors disabled:opacity-50">
                                Cancelar
                            </button>
                            <button onClick={handleSavePro} disabled={savingPro}
                                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                                {savingPro && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {savingPro ? 'Salvando...' : (editingPro ? 'Salvar' : 'Cadastrar')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
