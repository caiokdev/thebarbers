import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '../supabaseClient';
import { formatDate, formatTime } from '../utils/dateUtils';
import { formatCurrency } from '../utils/orderUtils';

/* ═══════════════════════════════════════════════════════════════
   AGENDAMENTO PÚBLICO — Interface Mobile-First para o cliente
   ═══════════════════════════════════════════════════════════════ */

const formatBRL = (v) => formatCurrency(v);

const THEME_HEX = {
    emerald: { primary: '#10b981', light: '#d1fae5', dark: '#065f46', bg: '#ecfdf5', ring: 'rgba(16,185,129,0.3)' },
    purple: { primary: '#a855f7', light: '#f3e8ff', dark: '#6b21a8', bg: '#faf5ff', ring: 'rgba(168,85,247,0.3)' },
    blue: { primary: '#3b82f6', light: '#dbeafe', dark: '#1e40af', bg: '#eff6ff', ring: 'rgba(59,130,246,0.3)' },
    amber: { primary: '#f59e0b', light: '#fef3c7', dark: '#92400e', bg: '#fffbeb', ring: 'rgba(245,158,11,0.3)' },
    rose: { primary: '#f43f5e', light: '#ffe4e6', dark: '#9f1239', bg: '#fff1f2', ring: 'rgba(244,63,94,0.3)' },
    cyan: { primary: '#06b6d4', light: '#cffafe', dark: '#155e75', bg: '#ecfeff', ring: 'rgba(6,182,212,0.3)' },
};

const DAY_NAMES_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function AgendamentoPublico() {
    // ── Core state ──
    const [step, setStep] = useState(1);
    const [barbershopId, setBarbershopId] = useState(null);
    const [shopInfo, setShopInfo] = useState({ name: '', phone: '', address: '' });
    const [themeKey, setThemeKey] = useState('emerald');
    const theme = THEME_HEX[themeKey] || THEME_HEX.emerald;
    const [loading, setLoading] = useState(true);

    // ── Step 1: Services ──
    const [services, setServices] = useState([]);
    const [selectedServices, setSelectedServices] = useState([]);

    // ── Step 2: Professional ──
    const [professionals, setProfessionals] = useState([]);
    const [selectedProfessional, setSelectedProfessional] = useState(null);

    // ── Step 3: Date & Time ──
    const [businessHours, setBusinessHours] = useState([]);
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedTime, setSelectedTime] = useState(null);
    const [busySlots, setBusySlots] = useState([]);
    const [loadingSlots, setLoadingSlots] = useState(false);

    // ── Step 4: Client info ──
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [clientBirthDate, setClientBirthDate] = useState('');
    const [saving, setSaving] = useState(false);

    // ── Success ──
    const [success, setSuccess] = useState(false);

    // ── Subscription Warning ──
    const [showPlanWarningModal, setShowPlanWarningModal] = useState(false);

    // ── Total ──
    const totalAmount = useMemo(() => selectedServices.reduce((s, svc) => s + (svc.price || 0), 0), [selectedServices]);
    const totalDuration = useMemo(() => selectedServices.reduce((s, svc) => s + (svc.duration_minutes || 30), 0), [selectedServices]);

    // ════════════════ INIT: Fetch barbershop + data ════════════════
    useEffect(() => {
        async function init() {
            try {
                const { data: shop } = await supabase
                    .from('barbershops')
                    .select('id, name, phone, address, theme_color')
                    .limit(1)
                    .single();

                if (!shop) return;
                setBarbershopId(shop.id);
                setShopInfo({ name: shop.name || '', phone: shop.phone || '', address: shop.address || '' });
                if (shop.theme_color && THEME_HEX[shop.theme_color]) setThemeKey(shop.theme_color);

                // Fetch services, professionals, business_hours in parallel
                const [svcRes, proRes, profilesProRes, bhRes] = await Promise.all([
                    supabase.from('services').select('*').eq('barbershop_id', shop.id).order('name'),
                    supabase.from('professionals').select('id, name, specialty').eq('barbershop_id', shop.id).eq('role', 'barber').order('name'),
                    supabase.from('profiles').select('id, name, specialty').eq('barbershop_id', shop.id).eq('role', 'barber').order('name'),
                    supabase.from('business_hours').select('*').eq('barbershop_id', shop.id).order('day_of_week'),
                ]);

                const mergedProfessionals = [
                    ...(proRes.data || []),
                    ...(profilesProRes.data || [])
                ].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

                setServices(svcRes.data || []);
                setProfessionals(mergedProfessionals);
                setBusinessHours(bhRes.data || []);
            } catch (err) {
                console.error('Error loading booking data:', err);
            } finally {
                setLoading(false);
            }
        }
        init();
    }, []);

    // ════════════════ DATE GRID — next 14 days ════════════════
    const dateOptions = useMemo(() => {
        const dates = [];
        const today = new Date();
        for (let i = 0; i < 14; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const dow = d.getDay();
            const bh = businessHours.find(h => h.day_of_week === dow);
            const isClosed = !bh || bh.is_closed;
            dates.push({
                date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
                day: d.getDate(),
                dayName: DAY_NAMES_SHORT[dow],
                monthName: MONTH_NAMES[d.getMonth()],
                isClosed,
                bh,
            });
        }
        return dates;
    }, [businessHours]);

    // ════════════════ SLOT GENERATION + ANTI-CONFLICT ════════════════
    useEffect(() => {
        if (!selectedDate || !selectedProfessional || !barbershopId) return;

        async function fetchBusySlots() {
            setLoadingSlots(true);
            setSelectedTime(null);
            try {
                const y = selectedDate.date.getFullYear();
                const mo = selectedDate.date.getMonth();
                const d = selectedDate.date.getDate();
                const startOfDay = new Date(y, mo, d, 0, 0, 0, 0).toISOString();
                const endOfDay = new Date(y, mo, d, 23, 59, 59, 999).toISOString();

                const proFilter = selectedProfessional === 'any' ? {} : { professional_id: selectedProfessional };

                let query = supabase
                    .from('orders')
                    .select('scheduled_at, professional_id')
                    .eq('barbershop_id', barbershopId)
                    .gte('scheduled_at', startOfDay)
                    .lte('scheduled_at', endOfDay)
                    .in('status', ['scheduled', 'confirmed', 'open', 'pending']);

                if (selectedProfessional !== 'any') {
                    query = query.eq('professional_id', selectedProfessional);
                }

                const { data } = await query;
                setBusySlots(data || []);
            } catch (err) {
                console.error('Error fetching busy slots:', err);
            } finally {
                setLoadingSlots(false);
            }
        }
        fetchBusySlots();
    }, [selectedDate, selectedProfessional, barbershopId]);

    const timeSlots = useMemo(() => {
        if (!selectedDate || selectedDate.isClosed || !selectedDate.bh) return [];

        const open_time = selectedDate.bh.open_time || '09:00';
        const close_time = selectedDate.bh.close_time || '20:00';

        const [openH, openM] = open_time.split(':').map(Number);
        const [closeH, closeM] = close_time.split(':').map(Number);
        const openMinutes = openH * 60 + openM;
        const closeMinutes = closeH * 60 + closeM;

        const slots = [];
        // Generate slots every 30 min. The last valid slot start must leave room for
        // at least the service duration before closing time.
        for (let m = openMinutes; m + totalDuration <= closeMinutes; m += 30) {
            const hh = String(Math.floor(m / 60)).padStart(2, '0');
            const mm = String(m % 60).padStart(2, '0');
            const timeStr = `${hh}:${mm}`;

            // Check if this slot overlaps with any busy appointment
            // For each busy appointment, we check if the candidate slot's service window
            // [slotStart, slotStart + totalDuration) overlaps with [busyStart, busyStart + 30min)
            const isBusy = busySlots.some(bs => {
                const bsDate = new Date(bs.scheduled_at);
                const bsTimeStr = bsDate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
                const [h, min] = bsTimeStr.split(':').map(Number);
                const bsMinutes = h * 60 + min;
                const bsDuration = 30; // assume each existing appointment occupies at least 30 min
                // Overlap: slotStart < busyEnd AND busyStart < slotEnd
                return m < (bsMinutes + bsDuration) && bsMinutes < (m + totalDuration);
            });

            // Also filter past times for today
            const now = new Date();
            const isToday = selectedDate.date.getDate() === now.getDate()
                && selectedDate.date.getMonth() === now.getMonth()
                && selectedDate.date.getFullYear() === now.getFullYear();
            const isPast = isToday && (Math.floor(m / 60) < now.getHours() || (Math.floor(m / 60) === now.getHours() && (m % 60) <= now.getMinutes()));

            slots.push({ time: timeStr, isBusy, isPast });
        }
        return slots;
    }, [selectedDate, busySlots, totalDuration]);

    // ════════════════ SUBMIT ════════════════
    const handleSubmit = async (e, forceSubmit = false) => {
        if (e && e.preventDefault) e.preventDefault();
        
        if (!clientName.trim() || !clientPhone.trim()) {
            toast.error('Preencha seu nome e WhatsApp.');
            return;
        }
        setSaving(true);
        try {
            const phoneClean = clientPhone.replace(/\D/g, '');

            // 0) Verify Plan & Allowed Days limits BEFORE creating order
            let isOutsidePlan = false;
            let existingClient = await supabase
                .from('clients')
                .select('id, name, is_subscriber')
                .eq('barbershop_id', barbershopId)
                .eq('phone', phoneClean)
                .limit(1)
                .maybeSingle()
                .then(res => res.data);

            if (existingClient?.is_subscriber) {
                const { data: subRecords } = await supabase
                    .from('client_subscriptions')
                    .select('*, plans(allowed_days)')
                    .eq('client_id', existingClient.id)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false })
                    .limit(1);
                const sub = subRecords && subRecords.length > 0 ? subRecords[0] : null;
                
                if (sub?.plans?.allowed_days) {
                    const dayOfWeek = selectedDate?.date?.getDay();
                    if (dayOfWeek !== undefined && !sub.plans.allowed_days.includes(dayOfWeek)) {
                        isOutsidePlan = true;
                        if (!forceSubmit) {
                            setSaving(false);
                            setShowPlanWarningModal(true);
                            return;
                        }
                    }
                }
            }

            // 1) Upsert client by phone
            let clientId = null;
            if (existingClient) {
                clientId = existingClient.id;
                // Update name and birth date if provided
                const updateData = { name: clientName.trim() };
                if (clientBirthDate) updateData.birth_date = clientBirthDate;
                await supabase.from('clients').update(updateData).eq('id', clientId);
            } else {
                const { data: newClient, error: clientErr } = await supabase
                    .from('clients')
                    .insert({ barbershop_id: barbershopId, name: clientName.trim(), phone: phoneClean, birth_date: clientBirthDate || null })
                    .select('id')
                    .single();
                if (clientErr) throw clientErr;
                clientId = newClient.id;
            }

            // 2) Build scheduled_at
            const [h, mi] = selectedTime.split(':').map(Number);
            const localDate = new Date(
                selectedDate.date.getFullYear(),
                selectedDate.date.getMonth(),
                selectedDate.date.getDate(),
                h, mi, 0
            );
            const scheduledAt = localDate.toISOString();

            // 3) Determine professional_id
            let professionalId = selectedProfessional;
            if (professionalId === 'any') {
                // Pick the professional with the fewest appointments on this day
                const proAppCounts = {};
                professionals.forEach(p => { proAppCounts[p.id] = 0; });
                busySlots.forEach(bs => {
                    if (proAppCounts[bs.professional_id] !== undefined) {
                        proAppCounts[bs.professional_id]++;
                    }
                });
                professionalId = professionals.reduce((best, p) =>
                    (proAppCounts[p.id] || 0) < (proAppCounts[best.id] || 0) ? p : best
                    , professionals[0]).id;
            }

            // 4) Insert order
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    barbershop_id: barbershopId || null,
                    professional_id: professionalId || null,
                    client_id: clientId || null,
                    scheduled_at: scheduledAt,
                    total_amount: parseFloat(totalAmount) || 0,
                    status: 'scheduled',
                    origin: 'app',
                })
                .select('id')
                .single();

            if (orderError) {
                console.error('Erro no Supabase:', orderError);
                toast.error('Erro ao salvar no banco: ' + orderError.message);
                setSaving(false);
                return;
            }

            // 5) Insert order_items
            if (selectedServices.length > 0 && order?.id) {
                const items = selectedServices.map(svc => ({
                    order_id: order.id,
                    item_type: 'service',
                    name: svc.name,
                    quantity: 1,
                    price: svc.price,
                }));
                const { error: itemsError } = await supabase.from('order_items').insert(items);
                if (itemsError) throw itemsError;

                // ── DEDUCT Subscription Usages ──
                if (!isOutsidePlan) {
                    // Re-check client details just in case it's a new sub
                    const { data: clientObj } = await supabase.from('clients').select('is_subscriber').eq('id', clientId).single();
                    if (clientObj?.is_subscriber) {
                        let cortes_used = 0, barbas_used = 0;
                        selectedServices.forEach(svc => {
                            const n = (svc.name || '').toLowerCase();
                            if (n.includes('corte') || n.includes('cabelo')) cortes_used += 1;
                            if (n.includes('barba')) barbas_used += 1;
                        });
                        
                        if (cortes_used > 0 || barbas_used > 0) {
                            const { data: subRecords } = await supabase
                                .from('client_subscriptions')
                                .select('*')
                                .eq('client_id', clientId)
                                .eq('status', 'active')
                                .order('created_at', { ascending: false })
                                .limit(1);
                            const sub = subRecords && subRecords.length > 0 ? subRecords[0] : null;

                            if (sub) {
                                await supabase.from('client_subscriptions').update({
                                    haircuts_used: (sub.haircuts_used || 0) + cortes_used,
                                    shaves_used: (sub.shaves_used || 0) + barbas_used
                                }).eq('id', sub.id);
                            }
                        }
                    }
                }
            }

            setSuccess(true);
        } catch (err) {
            toast.error(`Erro ao agendar: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ════════════════ RESET ════════════════
    const handleReset = () => {
        setStep(1);
        setSelectedServices([]);
        setSelectedProfessional(null);
        setSelectedDate(null);
        setSelectedTime(null);
        setClientName('');
        setClientPhone('');
        setSuccess(false);
    };

    // ── Service toggle ──
    const toggleService = (svc) => {
        setSelectedServices(prev => {
            const exists = prev.find(s => s.id === svc.id);
            if (exists) return prev.filter(s => s.id !== svc.id);
            return [...prev, svc];
        });
    };

    // ════════════════ RENDER ════════════════
    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div
                        className="inline-block w-10 h-10 border-4 border-slate-200 rounded-full animate-spin mb-3"
                        style={{ borderTopColor: theme.primary }}
                    />
                    <p className="text-sm text-slate-500">Carregando...</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="text-center max-w-sm">
                    {/* Animated check */}
                    <div
                        className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce"
                        style={{ backgroundColor: `${theme.primary}15` }}
                    >
                        <svg className="w-12 h-12" style={{ color: theme.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Agendamento Confirmado!</h2>
                    <p className="text-slate-500 text-sm mb-1">Seu horário foi reservado com sucesso.</p>
                    <p className="text-slate-500 text-sm mb-8">Você receberá uma confirmação em breve.</p>

                    <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 text-left">
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Serviço(s)</span>
                                <span className="font-medium text-slate-800">{selectedServices.map(s => s.name).join(', ')}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Data</span>
                                <span className="font-medium text-slate-800">
                                    {selectedDate && formatDate(selectedDate.date)}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Horário</span>
                                <span className="font-medium text-slate-800">{selectedTime}</span>
                            </div>
                            <div className="border-t border-slate-100 pt-3 flex justify-between text-sm">
                                <span className="text-slate-500">Total</span>
                                <span className="font-bold" style={{ color: theme.primary }}>{formatBRL(totalAmount)}</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleReset}
                        className="w-full py-4 rounded-2xl text-white font-semibold text-base transition-all active:scale-95"
                        style={{ backgroundColor: theme.primary }}
                    >
                        Fazer Novo Agendamento
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            {/* ── Header ── */}
            <header className="bg-white border-b border-slate-200 safe-area-top sticky top-0 z-50">
                <div className="max-w-lg mx-auto px-5 py-4 flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                        style={{ backgroundColor: theme.primary }}
                    >
                        {shopInfo.name?.charAt(0) || 'B'}
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base font-bold text-slate-800 truncate">{shopInfo.name || 'Barbearia'}</h1>
                        <p className="text-[11px] text-slate-400">Agendamento Online</p>
                    </div>
                </div>
            </header>

            {/* ── Step indicator ── */}
            <div className="max-w-lg mx-auto px-5 py-4">
                <div className="flex items-center gap-1">
                    {[1, 2, 3, 4].map(s => (
                        <div key={s} className="flex-1 h-1.5 rounded-full transition-all duration-300" style={{
                            backgroundColor: s <= step ? theme.primary : '#e2e8f0',
                        }} />
                    ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2 text-center">
                    {step === 1 && 'Escolha os serviços'}
                    {step === 2 && 'Escolha o profissional'}
                    {step === 3 && 'Escolha a data e horário'}
                    {step === 4 && 'Confirme seus dados'}
                </p>
            </div>

            <div className="max-w-lg mx-auto px-5 pb-32">

                {/* ═══════════════ STEP 1: SERVICES ═══════════════ */}
                {step === 1 && (
                    <div className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-800 mb-1">Qual serviço você deseja?</h2>
                        <p className="text-sm text-slate-500 mb-4">Selecione um ou mais serviços abaixo</p>

                        {services.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 text-sm">Nenhum serviço disponível no momento.</div>
                        ) : (
                            services.map(svc => {
                                const isSelected = selectedServices.some(s => s.id === svc.id);
                                return (
                                    <button
                                        key={svc.id}
                                        onClick={() => toggleService(svc)}
                                        className="w-full text-left bg-white rounded-2xl border-2 p-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                                        style={{
                                            borderColor: isSelected ? theme.primary : '#e2e8f0',
                                            boxShadow: isSelected ? `0 0 0 3px ${theme.ring}` : 'none',
                                        }}
                                    >
                                        {/* Icon */}
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                            style={{ backgroundColor: isSelected ? `${theme.primary}15` : '#f1f5f9' }}
                                        >
                                            <svg className="w-5 h-5" style={{ color: isSelected ? theme.primary : '#94a3b8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121A3 3 0 1 0 9.879 9.879m4.242 4.242L9.88 9.88m4.242 4.242l2.829 2.829M9.879 9.879L7.05 7.05" />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-800">{svc.name}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">{svc.duration_minutes || 30} min</p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-sm font-bold" style={{ color: theme.primary }}>{formatBRL(svc.price)}</p>
                                        </div>
                                        {/* Check */}
                                        {isSelected && (
                                            <div
                                                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ backgroundColor: theme.primary }}
                                            >
                                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}

                {/* ═══════════════ STEP 2: PROFESSIONAL ═══════════════ */}
                {step === 2 && (
                    <div className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-800 mb-1">Com quem você prefere?</h2>
                        <p className="text-sm text-slate-500 mb-4">Escolha seu profissional favorito</p>

                        {/* Any professional option */}
                        <button
                            onClick={() => setSelectedProfessional('any')}
                            className="w-full text-left bg-white rounded-2xl border-2 p-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                            style={{
                                borderColor: selectedProfessional === 'any' ? theme.primary : '#e2e8f0',
                                boxShadow: selectedProfessional === 'any' ? `0 0 0 3px ${theme.ring}` : 'none',
                            }}
                        >
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: selectedProfessional === 'any' ? `${theme.primary}15` : '#f1f5f9' }}
                            >
                                <svg className="w-5 h-5" style={{ color: selectedProfessional === 'any' ? theme.primary : '#94a3b8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-slate-800">Qualquer profissional</p>
                                <p className="text-xs text-slate-400">Deixe-nos escolher o melhor horário</p>
                            </div>
                        </button>

                        {professionals.map(pro => {
                            const isSelected = selectedProfessional === pro.id;
                            const initials = pro.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                            return (
                                <button
                                    key={pro.id}
                                    onClick={() => setSelectedProfessional(pro.id)}
                                    className="w-full text-left bg-white rounded-2xl border-2 p-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                                    style={{
                                        borderColor: isSelected ? theme.primary : '#e2e8f0',
                                        boxShadow: isSelected ? `0 0 0 3px ${theme.ring}` : 'none',
                                    }}
                                >
                                    <div
                                        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
                                        style={{ backgroundColor: isSelected ? theme.primary : '#64748b' }}
                                    >
                                        {initials}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-slate-800">{pro.name}</p>
                                        <p className="text-xs text-slate-400">{pro.specialty || 'Barbeiro'}</p>
                                    </div>
                                    {isSelected && (
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: theme.primary }}>
                                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ═══════════════ STEP 3: DATE & TIME ═══════════════ */}
                {step === 3 && (
                    <div className="space-y-5">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 mb-1">Quando você gostaria?</h2>
                            <p className="text-sm text-slate-500 mb-4">Escolha a data e o horário</p>
                        </div>

                        {/* Date scroll */}
                        <div>
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Selecione o dia</h3>
                            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                                {dateOptions.map((opt, i) => {
                                    const isSelected = selectedDate?.date?.getTime() === opt.date.getTime();
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => { if (!opt.isClosed) { setSelectedDate(opt); setSelectedTime(null); } }}
                                            disabled={opt.isClosed}
                                            className={`flex-shrink-0 w-16 py-3 rounded-2xl text-center transition-all active:scale-95 ${opt.isClosed ? 'opacity-40 cursor-not-allowed' : ''}`}
                                            style={{
                                                backgroundColor: isSelected ? theme.primary : '#fff',
                                                border: `2px solid ${isSelected ? theme.primary : '#e2e8f0'}`,
                                                color: isSelected ? '#fff' : undefined,
                                            }}
                                        >
                                            <p className={`text-[10px] font-medium ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{opt.dayName}</p>
                                            <p className={`text-lg font-bold ${isSelected ? 'text-white' : 'text-slate-800'}`}>{opt.day}</p>
                                            <p className={`text-[9px] ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>{opt.monthName.slice(0, 3)}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Time slots */}
                        {selectedDate && (
                            <div>
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Horários disponíveis</h3>
                                {loadingSlots ? (
                                    <div className="flex justify-center py-8">
                                        <div className="w-6 h-6 border-2 border-slate-200 rounded-full animate-spin" style={{ borderTopColor: theme.primary }} />
                                    </div>
                                ) : selectedDate.isClosed ? (
                                    <div className="bg-rose-50 rounded-2xl p-6 text-center border border-rose-100">
                                        <p className="text-rose-500 font-medium text-sm">Estabelecimento fechado neste dia</p>
                                    </div>
                                ) : timeSlots.filter(s => !s.isPast).length === 0 ? (
                                    <div className="bg-amber-50 rounded-2xl p-6 text-center border border-amber-100">
                                        <p className="text-amber-600 font-medium text-sm">Nenhum horário disponível neste dia</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2">
                                        {timeSlots.filter(s => !s.isPast).map(slot => {
                                            const isSelected = selectedTime === slot.time;
                                            return (
                                                <button
                                                    key={slot.time}
                                                    onClick={() => { if (!slot.isBusy) setSelectedTime(slot.time); }}
                                                    disabled={slot.isBusy}
                                                    className={`py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 ${slot.isBusy ? 'bg-slate-100 text-slate-300 line-through cursor-not-allowed' : ''}`}
                                                    style={slot.isBusy ? {} : {
                                                        backgroundColor: isSelected ? theme.primary : '#fff',
                                                        color: isSelected ? '#fff' : '#334155',
                                                        border: `2px solid ${isSelected ? theme.primary : '#e2e8f0'}`,
                                                    }}
                                                >
                                                    {slot.time}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════ STEP 4: CONFIRMATION ═══════════════ */}
                {step === 4 && (
                    <div className="space-y-5">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 mb-1">Quase lá!</h2>
                            <p className="text-sm text-slate-500 mb-4">Confirme seus dados para finalizar</p>
                        </div>

                        {/* Booking summary */}
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-100" style={{ backgroundColor: `${theme.primary}08` }}>
                                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.primary }}>Resumo do agendamento</p>
                            </div>
                            <div className="px-5 py-4 space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Serviço(s)</span>
                                    <span className="font-medium text-slate-800 text-right max-w-[200px]">{selectedServices.map(s => s.name).join(', ')}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Profissional</span>
                                    <span className="font-medium text-slate-800">
                                        {selectedProfessional === 'any' ? 'Qualquer' : professionals.find(p => p.id === selectedProfessional)?.name}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Data</span>
                                    <span className="font-medium text-slate-800">
                                        {selectedDate && formatDate(selectedDate.date)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Horário</span>
                                    <span className="font-medium text-slate-800">{selectedTime}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Duração</span>
                                    <span className="font-medium text-slate-800">{totalDuration} min</span>
                                </div>
                                <div className="border-t border-slate-100 pt-3 flex justify-between">
                                    <span className="text-sm font-semibold text-slate-600">Total</span>
                                    <span className="text-lg font-bold" style={{ color: theme.primary }}>{formatBRL(totalAmount)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Client info */}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Seu nome completo</label>
                                <input
                                    type="text"
                                    value={clientName}
                                    onChange={e => setClientName(e.target.value)}
                                    placeholder="Ex: João Silva"
                                    className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none transition-colors"
                                    style={{ '--tw-ring-color': theme.ring }}
                                    onFocus={e => { e.target.style.borderColor = theme.primary; }}
                                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">WhatsApp</label>
                                <input
                                    type="tel"
                                    value={clientPhone}
                                    onChange={e => setClientPhone(e.target.value)}
                                    placeholder="(11) 99999-9999"
                                    className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none transition-colors"
                                    onFocus={e => { e.target.style.borderColor = theme.primary; }}
                                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Data de Nascimento (Opcional)</label>
                                <input
                                    type="date"
                                    value={clientBirthDate}
                                    onChange={e => setClientBirthDate(e.target.value)}
                                    className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none transition-colors"
                                    onFocus={e => { e.target.style.borderColor = theme.primary; }}
                                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Bottom fixed bar ── */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 safe-area-bottom z-50">
                <div className="max-w-lg mx-auto px-5 py-4 flex items-center gap-3">
                    {step > 1 && (
                        <button
                            onClick={() => setStep(s => s - 1)}
                            className="px-5 py-3.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors active:scale-95"
                        >
                            Voltar
                        </button>
                    )}

                    {step < 4 ? (
                        <button
                            onClick={() => setStep(s => s + 1)}
                            disabled={
                                (step === 1 && selectedServices.length === 0) ||
                                (step === 2 && !selectedProfessional) ||
                                (step === 3 && (!selectedDate || !selectedTime))
                            }
                            className="flex-1 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ backgroundColor: theme.primary }}
                        >
                            Continuar
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={saving || !clientName.trim() || !clientPhone.trim()}
                            className="flex-1 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            style={{ backgroundColor: theme.primary }}
                        >
                            {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                            {saving ? 'Agendando...' : 'Confirmar Agendamento'}
                        </button>
                    )}
                </div>

                {/* Total badge */}
                {selectedServices.length > 0 && step < 4 && (
                    <div className="max-w-lg mx-auto px-5 pb-3 -mt-1">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{selectedServices.length} serviço(s) • {totalDuration} min</span>
                            <span className="font-bold" style={{ color: theme.primary }}>{formatBRL(totalAmount)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Warning Modal (Outside Plan Days) ── */}
            {showPlanWarningModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPlanWarningModal(false)}></div>
                    <div className="relative bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in duration-200">
                        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Atenção ao seu Plano</h3>
                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            Este agendamento está <strong className="text-slate-700">fora dos dias cobertos pelo seu plano</strong>. O serviço deverá ser cobrado separadamente. Deseja continuar?
                        </p>
                        <div className="flex w-full gap-3">
                            <button
                                onClick={() => setShowPlanWarningModal(false)}
                                className="flex-1 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    setShowPlanWarningModal(false);
                                    handleSubmit(null, true);
                                }}
                                className="flex-1 py-3.5 rounded-xl text-white text-sm font-bold transition-all"
                                style={{ backgroundColor: theme.primary }}
                            >
                                Continuar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
