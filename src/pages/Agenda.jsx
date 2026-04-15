import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../supabaseClient';
import { formatDate, formatTime, getLocalDateISO } from '../utils/dateUtils';
import { formatCurrency } from '../utils/orderUtils';
import { useGlobalData } from '../context/GlobalDataContext';

/* ───────── Constants ───────── */
const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 72;
const AVATAR_COLORS = [
    'bg-red-600', 'bg-blue-500', 'bg-violet-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
    'bg-indigo-500', 'bg-pink-500',
];

/* ───────── Helpers ───────── */
function formatDateFull(d) {
    return d.toLocaleDateString('pt-BR', { 
        timeZone: 'America/Sao_Paulo', 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
    });
}

function formatDateInput(d) {
    return getLocalDateISO(d);
}

function getInitials(name) {
    if (!name) return '??';
    const parts = name.split(' ');
    return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.substring(0, 2).toUpperCase();
}

function generateTimeSlots(startHour, endHour, startMin = 0, endMin = 0) {
    const slots = [];
    const startTotal = startHour * 60 + startMin;
    const endTotal = endHour * 60 + endMin;
    
    for (let current = startTotal; current < endTotal; current += 30) {
        const h = Math.floor(current / 60);
        const m = current % 60;
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
    return slots;
}

const STATUS_CONFIG = {
    scheduled: { label: 'Agendado', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
    confirmed: { label: 'Confirmado', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
    open: { label: 'Aberto', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
    completed: { label: 'Concluído', bg: 'bg-red-600/15', text: 'text-red-500', border: 'border-red-600/30' },
    cancelled: { label: 'Cancelado', bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
    no_show: { label: 'Não Compareceu', bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
};

/* ═══════════════════════════════════════════════════════════════
   AGENDA COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Agenda() {
    const navigate = useNavigate();
    const { adminProfile } = useGlobalData();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [professionals, setProfessionals] = useState([]);
    const [clients, setClients] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [catalog, setCatalog] = useState([]);       // services + products combined
    const barbershopId = adminProfile?.barbershopId;
    const noshowActive = adminProfile?.noshowActive;
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);

    // Creation Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState({ professionalId: '', time: '' });
    const [saving, setSaving] = useState(false);

    // Details Modal
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);

    // Now Line
    const [currentTime, setCurrentTime] = useState(new Date());
    const [businessHours, setBusinessHours] = useState([]);

    // Dynamic day config based on selected date
    const dayConfig = useMemo(() => {
        const dow = selectedDate.getDay(); // 0=Sun ... 6=Sat
        const found = businessHours.find(h => h.day_of_week === dow);
        if (!found) return { is_closed: false, open_time: '09:00', close_time: '20:00' };
        return found;
    }, [selectedDate, businessHours]);

    const dynamicStartHour = useMemo(() => {
        if (dayConfig.is_closed) return 9;
        const [h] = (dayConfig.open_time || '09:00').split(':').map(Number);
        return h;
    }, [dayConfig]);

    const dynamicEndHour = useMemo(() => {
        if (dayConfig.is_closed) return 20;
        const [h] = (dayConfig.close_time || '20:00').split(':').map(Number);
        return h;
    }, [dayConfig]);

    const timeSlots = useMemo(() => {
        if (dayConfig.is_closed) return [];
        return generateTimeSlots(dynamicStartHour, dynamicEndHour);
    }, [dayConfig, dynamicStartHour, dynamicEndHour]);

    // ── Fetch master data ──
    useEffect(() => {
        if (!barbershopId) return;

        async function fetchData() {
            try {
                const [barbersRes, profileBarbersRes, clientsRes, productsRes] = await Promise.all([
                    supabase.from('professionals').select('id, name, specialty')
                        .eq('barbershop_id', barbershopId).order('name'),
                    supabase.from('profiles').select('id, name, specialty')
                        .eq('barbershop_id', barbershopId).eq('role', 'barber').order('name'),
                    supabase.from('clients').select('id, name, phone, is_subscriber, subscription_status')
                        .eq('barbershop_id', barbershopId).order('name'),
                    supabase.from('products').select('id, name, price, current_stock')
                        .eq('barbershop_id', barbershopId).order('name'),
                ]);

                const mergedProfessionals = [
                    ...(barbersRes.data || []),
                    ...(profileBarbersRes.data || [])
                ].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

                setProfessionals(mergedProfessionals);
                setClients(clientsRes.data || []);

                // Build a combined catalog
                const productItems = (productsRes.data || []).map(p => ({
                    id: p.id,
                    name: p.name,
                    price: parseFloat(p.price || 0),
                    type: 'product',
                    current_stock: p.current_stock ?? 0,
                }));

                let serviceItems = [];
                try {
                    const { data: svcData } = await supabase
                        .from('services')
                        .select('id, name, price')
                        .eq('barbershop_id', barbershopId)
                        .order('name');
                    serviceItems = (svcData || []).map(s => ({
                        id: s.id,
                        name: s.name,
                        price: parseFloat(s.price || 0),
                        type: 'service',
                    }));
                } catch (_) {}

                setCatalog([...serviceItems, ...productItems]);

                try {
                    const { data: bhData } = await supabase
                        .from('business_hours')
                        .select('*')
                        .eq('barbershop_id', barbershopId)
                        .order('day_of_week');
                    setBusinessHours(bhData || []);
                } catch (_) {}
            } catch (_) {} finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [barbershopId]);

    const fetchAppointments = useCallback(async () => {
        if (!barbershopId) return;
        const y = selectedDate.getFullYear();
        const mo = selectedDate.getMonth();
        const d = selectedDate.getDate();
        const startOfDay = new Date(y, mo, d, 0, 0, 0, 0).toISOString();
        const endOfDay = new Date(y, mo, d, 23, 59, 59, 999).toISOString();

        const { data } = await supabase
            .from('orders')
            .select('id, professional_id, client_id, scheduled_at, total_amount, status, origin, notes')
            .eq('barbershop_id', barbershopId)
            .gte('scheduled_at', startOfDay)
            .lte('scheduled_at', endOfDay)
            .in('status', ['scheduled', 'confirmed', 'open', 'no_show']);

        setAppointments((data || []).filter(o => !o.notes?.includes('[HIDDEN_FROM_AGENDA]')));
    }, [barbershopId, selectedDate]);

    useEffect(() => {
        if (barbershopId) fetchAppointments();
    }, [barbershopId, selectedDate, fetchAppointments]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const goToday = () => setSelectedDate(new Date());
    const goPrev = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); };
    const goNext = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); };

    const isToday = (() => {
        const now = new Date();
        return selectedDate.getFullYear() === now.getFullYear()
            && selectedDate.getMonth() === now.getMonth()
            && selectedDate.getDate() === now.getDate();
    })();

    const nowLineTop = useMemo(() => {
        const h = currentTime.getHours();
        const m = currentTime.getMinutes();
        if (dayConfig.is_closed || h < dynamicStartHour || h > dynamicEndHour) return null;
        return HEADER_HEIGHT + ((h - dynamicStartHour) * 60 + m) / 30 * ROW_HEIGHT;
    }, [currentTime, dayConfig, dynamicStartHour, dynamicEndHour]);

    const clientMap = useMemo(() => {
        const m = {};
        clients.forEach(c => { m[c.id] = c.name; });
        return m;
    }, [clients]);

    const subscriberMap = useMemo(() => {
        const m = {};
        clients.forEach(c => {
            if (c.is_subscriber) m[c.id] = c.subscription_status || 'active';
        });
        return m;
    }, [clients]);

    const proMap = useMemo(() => {
        const m = {};
        professionals.forEach(p => { m[p.id] = p.name; });
        return m;
    }, [professionals]);

    const appointmentsBySlot = useMemo(() => {
        const map = {};
        [...(appointments || [])].sort((a, b) => {
            const timeA = new Date(a.scheduled_at).getTime();
            const timeB = new Date(b.scheduled_at).getTime();
            if (timeA !== timeB) return timeA - timeB;
            if (a.status === 'no_show' && b.status !== 'no_show') return 1;
            if (a.status !== 'no_show' && b.status === 'no_show') return -1;
            return 0;
        }).forEach(a => {
            if (!a.scheduled_at || !a.professional_id) return;

            if (searchQuery.trim() !== '') {
                const clientName = clientMap[a.client_id] || '';
                if (!clientName.toLowerCase().includes(searchQuery.toLowerCase())) return;
            }

            const dt = new Date(a.scheduled_at);
            const timeStr = dt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
            const [hh, mmRaw] = timeStr.split(':');
            const mm = parseInt(mmRaw) < 30 ? '00' : '30';
            const key = `${hh}:${mm}-${a.professional_id}`;
            if (!map[key]) map[key] = [];
            map[key].push(a);
        });
        return map;
    }, [appointments, searchQuery, clientMap]);

    const openModalEmpty = () => { setSelectedSlot({ professionalId: '', time: '' }); setIsModalOpen(true); };
    const openModalFromCell = (professionalId, time) => { setSelectedSlot({ professionalId, time }); setIsModalOpen(true); };
    const openDetailsModal = (order) => { setSelectedOrderDetails(order); setIsDetailsModalOpen(true); };

    const refundOrderServices = async (orderId, clientId) => {
        const client = clients.find(c => c.id === clientId);
        if (!client || !client.is_subscriber) return;
        const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId);
        if (!items || items.length === 0) return;
        let c_refund = 0, b_refund = 0;
        items.forEach(itm => {
            const n = (itm.name || '').toLowerCase();
            if (n.includes('corte') || n.includes('cabelo')) c_refund += itm.quantity;
            if (n.includes('barba')) b_refund += itm.quantity;
        });
        if (c_refund > 0 || b_refund > 0) {
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
                    haircuts_used: Math.max(0, (sub.haircuts_used || 0) - c_refund),
                    shaves_used: Math.max(0, (sub.shaves_used || 0) - b_refund)
                }).eq('id', sub.id);
            }
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden -m-8">
            <div className="flex flex-col flex-1 overflow-hidden">
                {/* ─── DATE TOOLBAR ─── */}
                <div className="flex items-center justify-between px-8 py-4 bg-slate-800/50 border-b border-slate-700/50 flex-shrink-0">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-1">
                            <button onClick={goPrev} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors" title="Dia anterior">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <button onClick={goToday} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${isToday ? 'bg-red-600/15 text-red-500 border border-red-600/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Hoje</button>
                            <button onClick={goNext} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors" title="Próximo dia">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                        <h2 className="text-base font-semibold text-slate-100 min-w-[200px]">{formatDateFull(selectedDate)}</h2>

                        <div className="hidden md:flex items-center gap-2 bg-slate-900/50 rounded-xl px-4 py-2 text-sm text-slate-400 border border-slate-700 focus-within:border-red-600 transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input
                                type="text"
                                placeholder="Buscar cliente..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-transparent border-none outline-none text-slate-200 placeholder-slate-500 w-48"
                            />
                        </div>
                    </div>

                    <button onClick={openModalEmpty} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-red-600/20">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        Novo Agendamento
                    </button>
                </div>

                {/* ─── TIME GRID ─── */}
                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin mb-4"></div>
                                <p className="text-slate-500 text-sm">Carregando agenda...</p>
                            </div>
                        </div>
                    ) : professionals.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-sm text-slate-500">Nenhum profissional cadastrado.</p>
                        </div>
                    ) : dayConfig.is_closed ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <div className="w-20 h-20 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-10 h-10 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                </div>
                                <h3 className="text-lg font-semibold text-slate-200 mb-1">Estabelecimento Fechado</h3>
                                <p className="text-sm text-slate-500">Não há horários disponíveis para {DAY_NAMES[selectedDate.getDay()]}.</p>
                                <p className="text-xs text-slate-600 mt-2">Configure os horários em Configurações → Horários</p>
                            </div>
                        </div>
                    ) : (
                        <div className="min-w-max relative">
                            <div className="grid" style={{ gridTemplateColumns: `72px repeat(${professionals.length}, minmax(180px, 1fr))` }}>
                                <div className="sticky top-0 z-20 bg-slate-900 border-b border-r border-slate-700 h-[72px]" />
                                {professionals.map((pro, idx) => (
                                    <div key={pro.id} className="sticky top-0 z-20 bg-slate-900 border-b border-r border-slate-700/50 h-[72px] flex items-center justify-center gap-3 px-4">
                                        <div className={`w-10 h-10 ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-lg`}>{getInitials(pro.name)}</div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-100 truncate">{pro.name}</p>
                                            <p className="text-[11px] text-slate-500">Barbeiro</p>
                                        </div>
                                    </div>
                                ))}

                                {timeSlots.map((time) => {
                                    const isFullHour = time.endsWith(':00');
                                    return (
                                        <React.Fragment key={time}>
                                            <div className={`h-14 flex items-start justify-end pr-3 pt-1 border-r border-slate-700 ${isFullHour ? 'border-t border-slate-700/80' : 'border-t border-slate-700/30'}`}>
                                                {isFullHour && <span className="text-xs font-medium text-slate-500 -mt-0.5">{time}</span>}
                                            </div>

                                            {professionals.map((pro, colIdx) => {
                                                const slotKey = `${time}-${pro.id}`;
                                                const appts = appointmentsBySlot[slotKey] || [];

                                                return (
                                                    <div
                                                        key={slotKey}
                                                        onClick={(e) => { appts.length === 0 && openModalFromCell(pro.id, time); }}
                                                        className={`min-h-[56px] border-r border-slate-700/30 relative transition-all duration-150 p-0.5 flex flex-col gap-1 ${isFullHour ? 'border-t border-slate-700/60' : 'border-t border-slate-700/20'} ${appts.length === 0 ? 'cursor-pointer group hover:bg-emerald-500/5 hover:border-red-600/20' : ''}`}
                                                    >
                                                        {appts.length > 0 ? (
                                                            appts.map((appt, i) => (
                                                                <div
                                                                    key={appt.id || i}
                                                                    onClick={(e) => { e.stopPropagation(); openDetailsModal(appt); }}
                                                                    title={`${clientMap[appt.client_id] || 'Cliente'} — ${formatCurrency(appt.total_amount)}`}
                                                                    className={`w-full rounded-lg px-2 py-1 flex flex-col justify-center cursor-pointer hover:ring-2 transition-all min-h-[48px] relative ${appt.status === 'no_show'
                                                                        ? 'bg-slate-700/40 border border-slate-600/40 ring-slate-400 opacity-60'
                                                                        : `${AVATAR_COLORS[colIdx % AVATAR_COLORS.length].replace('bg-', 'bg-')}/15 border ${AVATAR_COLORS[colIdx % AVATAR_COLORS.length].replace('bg-', 'border-')}/30 ring-emerald-400`
                                                                        }`}>
                                                                    <p className={`text-xs font-semibold truncate ${appt.status === 'no_show' ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{clientMap[appt.client_id] || 'Cliente'}</p>
                                                                    <div className="flex items-center justify-between gap-1">
                                                                        <p className={`text-[10px] truncate ${appt.status === 'no_show' ? 'text-slate-600 line-through' : 'text-slate-400'}`}>{formatCurrency(appt.total_amount)}</p>
                                                                        <div className="flex items-center gap-1 flex-shrink-0">
                                                                            {appt.status === 'no_show' && <span className="text-[8px] font-bold text-rose-400 bg-rose-500/15 px-1.5 py-0.5 rounded-full uppercase tracking-wide leading-none">Faltou</span>}
                                                                            {appt.status !== 'no_show' && subscriberMap[appt.client_id] === 'overdue' && <span className="text-[8px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded-full uppercase tracking-wide leading-none">⚠ Atr</span>}
                                                                            {appt.status !== 'no_show' && subscriberMap[appt.client_id] && subscriberMap[appt.client_id] !== 'overdue' && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide leading-none" style={{ background: '#111', color: '#fff', boxShadow: '0 0 0 1px rgba(181,148,16,0.5)' }}>★</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <div className="w-6 h-6 rounded-full bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-600">+</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            {isToday && nowLineTop !== null && (
                                <div className="absolute left-[72px] right-0 z-30 pointer-events-none" style={{ top: `${nowLineTop}px` }}>
                                    <div className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-red-600 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                    <div className="h-[2px] bg-red-600 w-full shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <AppointmentModal
                    professionals={professionals} clients={clients} catalog={catalog}
                    selectedDate={selectedDate} selectedSlot={selectedSlot}
                    barbershopId={barbershopId} noshowActive={noshowActive} appointments={appointments}
                    saving={saving} setSaving={setSaving}
                    onClose={() => setIsModalOpen(false)}
                    onSaved={() => { setIsModalOpen(false); fetchAppointments(); }}
                />
            )}

            {isDetailsModalOpen && selectedOrderDetails && (
                <OrderDetailsModal
                    order={selectedOrderDetails} clientMap={clientMap} proMap={proMap}
                    barbershopId={barbershopId} noshowActive={noshowActive}
                    onClose={() => { setIsDetailsModalOpen(false); setSelectedOrderDetails(null); }}
                    onDelete={async () => {
                        if (!['canceled', 'no_show'].includes(selectedOrderDetails.status)) await refundOrderServices(selectedOrderDetails.id, selectedOrderDetails.client_id);
                        if (selectedOrderDetails.status === 'no_show') {
                            const newNotes = selectedOrderDetails.notes ? selectedOrderDetails.notes + '\n[HIDDEN_FROM_AGENDA]' : '[HIDDEN_FROM_AGENDA]';
                            const { error } = await supabase.from('orders').update({ notes: newNotes }).eq('id', selectedOrderDetails.id);
                            if (error) { toast.error(`Erro ao ocultar: ${error.message}`); return; }
                            toast.success('Falta ocultada da agenda!');
                        } else {
                            const { error } = await supabase.from('orders').delete().eq('id', selectedOrderDetails.id);
                            if (error) { toast.error(`Erro ao excluir: ${error.message}`); return; }
                            toast.success('Agendamento excluído com sucesso.');
                        }
                        setIsDetailsModalOpen(false); setSelectedOrderDetails(null); fetchAppointments();
                    }}
                    onCancel={async () => {
                        await refundOrderServices(selectedOrderDetails.id, selectedOrderDetails.client_id);
                        const { error } = await supabase.from('orders').update({ status: 'canceled' }).eq('id', selectedOrderDetails.id);
                        if (error) { toast.error(`Erro ao cancelar: ${error.message}`); return; }
                        setIsDetailsModalOpen(false); setSelectedOrderDetails(null); fetchAppointments();
                        toast.success('Agendamento cancelado com sucesso.');
                    }}
                    onNoShow={async () => {
                        await refundOrderServices(selectedOrderDetails.id, selectedOrderDetails.client_id);
                        const { error } = await supabase.from('orders').update({ status: 'no_show' }).eq('id', selectedOrderDetails.id);
                        if (error) { toast.error(`Erro ao marcar falta: ${error.message}`); return; }
                        try {
                            if (noshowActive) {
                                await fetch('https://caiokdev.app.n8n.cloud/webhook-test/naocompareceu', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ orderId: selectedOrderDetails.id, barbershopId, clientId: selectedOrderDetails.client_id, professionalId: selectedOrderDetails.professional_id, scheduledAt: selectedOrderDetails.scheduled_at })
                                });
                            }
                        } catch (err) { console.error('Erro ao acionar webhook n8n (no_show):', err); }
                        setIsDetailsModalOpen(false); setSelectedOrderDetails(null); fetchAppointments();
                        toast.success('Cliente marcado como Não Compareceu.');
                    }}
                    onOpenComanda={async () => {
                        const { error } = await supabase.from('orders').update({ status: 'open' }).eq('id', selectedOrderDetails.id);
                        if (error) { toast.error(`Erro ao abrir comanda: ${error.message}`); return; }
                        setIsDetailsModalOpen(false); setSelectedOrderDetails(null); fetchAppointments();
                        navigate(`/pdv/${selectedOrderDetails.id}`);
                    }}
                />
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   APPOINTMENT MODAL — with Cart System
   ═══════════════════════════════════════════════════════════════ */
function AppointmentModal({
    professionals, clients, catalog, selectedDate, selectedSlot,
    barbershopId, noshowActive, appointments, saving, setSaving, onClose, onSaved,
}) {
    const [professionalId, setProfessionalId] = useState(selectedSlot.professionalId || '');
    const [date, setDate] = useState(formatDateInput(selectedDate));
    const [time, setTime] = useState(selectedSlot.time || '');
    const [clientId, setClientId] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [cartItems, setCartItems] = useState([]);
    const [catalogSelect, setCatalogSelect] = useState('');

    const [isAvulso, setIsAvulso] = useState(false);
    const [avulsoValue, setAvulsoValue] = useState('');
    const [avulsoNotes, setAvulsoNotes] = useState('');
    const [origin, setOrigin] = useState('reception');

    const [clientSub, setClientSub] = useState(null);
    const [subLoading, setSubLoading] = useState(false);
    const [isSyncError, setIsSyncError] = useState(false);
    const [showPlanWarningModal, setShowPlanWarningModal] = useState(false);

    const filteredClients = useMemo(() => {
        if (!clientSearch.trim()) return clients;
        const q = clientSearch.toLowerCase();
        return clients.filter(c => c.name?.toLowerCase().includes(q));
    }, [clientSearch, clients]);

    useEffect(() => {
        if (!clientId) { setClientSub(null); return; }
        const clientObj = clients.find(c => c.id === clientId);
        if (!clientObj?.is_subscriber) { setClientSub(null); return; }
        setSubLoading(true);
        setIsSyncError(false);
        supabase.from('client_subscriptions')
            .select('*, plans(name, haircut_limit, shave_limit, allowed_days)')
            .eq('client_id', clientId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .then(async ({ data: records }) => {
                let subData = records && records.length > 0 ? records[0] : null;
                
                if (subData && !subData.plans && subData.plan_id) {
                    const { data: planData } = await supabase.from('plans').select('name, haircut_limit, shave_limit, allowed_days').eq('id', subData.plan_id).maybeSingle();
                    if (planData) subData.plans = planData;
                }
                
                if (!subData && clientObj?.is_subscriber) {
                    setIsSyncError(true);
                }
                
                setClientSub(subData || null); 
                setSubLoading(false);
            }).catch(err => {
                console.error('Error fetching subscription:', err);
                setSubLoading(false);
            });
    }, [clientId, clients]);

    const totalAmount = useMemo(() => {
        if (isAvulso) return parseFloat(avulsoValue) || 0;
        return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }, [cartItems, isAvulso, avulsoValue]);

    const addToCart = (catalogId) => {
        if (!catalogId) return;
        const item = catalog.find(c => c.id === catalogId);
        if (!item) return;

        if (item.type === 'product') {
            if ((item.current_stock ?? 0) <= 0) { toast.error('Produto esgotado!'); setCatalogSelect(''); return; }
            const existing = cartItems.find(ci => ci.id === item.id);
            if ((existing?.quantity || 0) + 1 > item.current_stock) { toast.error(`Estoque insuficiente (${item.current_stock} disponíveis).`); setCatalogSelect(''); return; }
        }

        if (item.type === 'service' && clientSub) {
            const n = (item.name || '').toLowerCase();
            const isHaircut = n.includes('corte') || n.includes('cabelo');
            const isShave = n.includes('barba');
            if (isHaircut) {
                const limit = clientSub.plans?.haircut_limit ?? 999;
                const used = cartItems.filter(ci => ci.type === 'service' && (ci.name.toLowerCase().includes('corte') || ci.name.toLowerCase().includes('cabelo'))).reduce((s, ci) => s + ci.quantity, 0);
                if (limit === 0) {
                    toast.warning(`Corte não incluso no plano. Será cobrado à parte.`);
                } else if ((clientSub.haircuts_used || 0) + used >= limit) {
                    toast.warning(`Limite de cortes do plano atingido. Será cobrado à parte.`);
                }
            }
            if (isShave) {
                const limit = clientSub.plans?.shave_limit ?? 999;
                const used = cartItems.filter(ci => ci.type === 'service' && ci.name.toLowerCase().includes('barba')).reduce((s, ci) => s + ci.quantity, 0);
                if (limit === 0) {
                    toast.warning(`Barba não inclusa no plano. Será cobrado à parte.`);
                } else if ((clientSub.shaves_used || 0) + used >= limit) {
                    toast.warning(`Limite de barbas do plano atingido. Será cobrado à parte.`);
                }
            }
        }

        setCartItems(prev => {
            const exists = prev.find(ci => ci.id === item.id);
            if (exists) return prev.map(ci => ci.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci);
            return [...prev, { id: item.id, name: item.name, price: item.price, type: item.type, quantity: 1 }];
        });
        setCatalogSelect('');
    };

    const updateQty = (id, delta) => {
        setCartItems(prev => prev.map(ci => {
            if (ci.id !== id) return ci;
            const newQty = ci.quantity + delta;
            if (newQty <= 0) return { ...ci, quantity: 0 };
            if (delta > 0 && ci.type === 'product') {
                const catItem = catalog.find(c => c.id === ci.id);
                if (catItem && newQty > (catItem.current_stock ?? 0)) { toast.error(`Estoque insuficiente.`); return ci; }
            }
            return { ...ci, quantity: newQty };
        }).filter(ci => ci.quantity > 0));
    };

    const selectClient = async (c) => {
        setClientId(c.id); setClientSearch(c.name); setShowClientDropdown(false);
        if (c.is_subscriber) {
            const { data: subRecords } = await supabase
                .from('client_subscriptions')
                .select('*, plans(haircut_limit, shave_limit)')
                .eq('client_id', c.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1);
            const sub = subRecords && subRecords.length > 0 ? subRecords[0] : null;
            if (sub) {
                let remainC = (sub.plans?.haircut_limit ?? 999) - (sub.haircuts_used || 0);
                let remainB = (sub.plans?.shave_limit ?? 999) - (sub.shaves_used || 0);
                setCartItems(prev => {
                    let newCart = prev.filter(item => !item.name.includes('(Plano)') && !item.name.includes('do Plano'));
                    if (remainC > 0) newCart.push({ id: 'plano-corte', type: 'service', name: 'Corte do Plano', price: 0, quantity: 1 });
                    if (remainB > 0) newCart.push({ id: 'plano-barba', type: 'service', name: 'Barba do Plano', price: 0, quantity: 1 });
                    return newCart;
                });
            }
        }
    };

    const handleSave = async (forceSubmit = false) => {
        if (!professionalId || !date || !time) { toast.error('Preencha os campos obrigatórios.'); return; }
        if (!isAvulso && !clientId) { toast.error('Selecione um cliente ou marque Serviço Avulso.'); return; }
        if (clientId && subLoading) { toast.error('Carregando dados da assinatura...'); return; }

        const [y, mo, d] = date.split('-').map(Number);
        const [h, mi] = time.split(':').map(Number);
        const localDate = new Date(y, mo - 1, d, h, mi, 0);

        const conflict = (appointments || []).find(a => {
            if (a.professional_id !== professionalId || ['no_show', 'canceled'].includes(a.status)) return false;
            const ex = new Date(a.scheduled_at);
            return ex.getTime() === localDate.getTime();
        });
        if (conflict) { toast.error('Este profissional já possui um agendamento neste horário.'); return; }

        let isOutsidePlan = false;
        if (!isAvulso && clientId) {
            const dayOfWeek = localDate.getDay();
            if (clientSub?.plans?.allowed_days && dayOfWeek !== undefined && !clientSub.plans.allowed_days.includes(dayOfWeek)) {
                isOutsidePlan = true;
                if (forceSubmit !== true) {
                    setShowPlanWarningModal(true);
                    return;
                }
            }
        }

        setSaving(true);
        try {
            const { data: order, error } = await supabase.from('orders').insert({ barbershop_id: barbershopId, professional_id: professionalId, client_id: clientId || null, scheduled_at: localDate.toISOString(), total_amount: parseFloat(totalAmount), status: 'scheduled', origin, ...(isAvulso && avulsoNotes ? { notes: avulsoNotes } : {}) }).select('id').single();
            if (error) throw error;

            if (!isAvulso && cartItems.length > 0 && order?.id) {
                await supabase.from('order_items').insert(cartItems.map(ci => ({ order_id: order.id, item_type: ci.type, name: ci.name, quantity: ci.quantity, price: ci.price })));
                const clientObj = clients.find(c => c.id === clientId);
                if (clientObj?.is_subscriber && !isOutsidePlan) {
                    let cu = 0, bu = 0;
                    cartItems.forEach(ci => {
                        if (ci.name.toLowerCase().includes('corte') || ci.name.toLowerCase().includes('cabelo')) cu += ci.quantity;
                        if (ci.name.toLowerCase().includes('barba')) bu += ci.quantity;
                    });
                    if (cu > 0 || bu > 0) {
                        const { data: subRecords } = await supabase
                            .from('client_subscriptions')
                            .select('*, plans(haircut_limit, shave_limit)')
                            .eq('client_id', clientId)
                            .eq('status', 'active')
                            .order('created_at', { ascending: false })
                            .limit(1);
                        const sub = subRecords && subRecords.length > 0 ? subRecords[0] : null;

                        if (sub) {
                            await supabase.from('client_subscriptions').update({ 
                                haircuts_used: (sub.haircuts_used || 0) + (sub.plans?.haircut_limit > 0 ? cu : 0), 
                                shaves_used: (sub.shaves_used || 0) + (sub.plans?.shave_limit > 0 ? bu : 0) 
                            }).eq('id', sub.id);
                        }
                    }
                }
            }
            onSaved();
        } catch (err) { toast.error(`Erro: ${err.message}`); } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-100">Novo Agendamento</h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200 transition-colors">✕</button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Profissional *</label>
                        <select value={professionalId} onChange={e => setProfessionalId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-red-600 transition-colors">
                            <option value="">Selecione o barbeiro</option>
                            {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none" />
                        <input type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none" />
                    </div>
                    <div className="relative">
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Cliente *</label>
                        <input type="text" value={clientSearch} onChange={e => { setClientSearch(e.target.value); setClientId(''); setShowClientDropdown(true); }} onFocus={() => setShowClientDropdown(true)} placeholder="Buscar cliente..." className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-red-600 transition-colors" />
                        {showClientDropdown && filteredClients.length > 0 && !clientId && (
                            <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                {filteredClients.map(c => (
                                    <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors">
                                        {c.name} {c.is_subscriber && <span className="ml-2 text-[10px] text-yellow-500 font-bold">★ Assinante</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                        {clientId && !subLoading && clientSub && (
                            <div className="mt-2 text-[11px] text-yellow-400 bg-yellow-500/10 p-2 rounded-lg border border-yellow-500/20">
                                ★ {clientSub.plans?.name}: C: {clientSub.haircuts_used}/{clientSub.plans?.haircut_limit} · B: {clientSub.shaves_used}/{clientSub.plans?.shave_limit}
                            </div>
                        )}
                        {clientId && clientSub && clientSub.plans?.allowed_days && !clientSub.plans.allowed_days.includes(new Date(date + 'T12:00:00').getDay()) && (
                            <div className="mt-2 text-[11px] text-amber-400 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 flex items-center gap-2 font-bold uppercase tracking-tight">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                Fora dos dias do plano (Cobrança à parte)
                            </div>
                        )}
                        {clientId && !subLoading && isSyncError && (
                            <div className="mt-2 text-[11px] text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 flex flex-col gap-1">
                                <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    Atenção: Assinatura não sincronizada
                                </div>
                                <p className="opacity-80">O registro detalhado deste assinante não foi encontrado. Por favor, re-vincule o plano na aba de Planos para restaurar o controle de serviços.</p>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1.5">Origem</label>
                        <select value={origin} onChange={e => setOrigin(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none">
                            <option value="reception">Recepção</option><option value="app">App</option><option value="whatsapp">WhatsApp</option><option value="phone">Telefone</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-3">
                        <input type="checkbox" checked={isAvulso} onChange={e => setIsAvulso(e.target.checked)} className="accent-red-600" />
                        <span className="text-sm text-slate-300">Serviço Avulso</span>
                    </div>
                    {isAvulso ? (
                        <div className="space-y-3">
                            <input type="number" step="0.01" value={avulsoValue} onChange={e => setAvulsoValue(e.target.value)} placeholder="Valor R$ 0,00" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100" />
                            <textarea value={avulsoNotes} onChange={e => setAvulsoNotes(e.target.value)} placeholder="Observações..." className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 resize-none h-16" />
                        </div>
                    ) : (
                        <>
                            <select value={catalogSelect} onChange={e => addToCart(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-red-600 transition-colors">
                                <option value="">Adicionar item...</option>
                                {catalog.map(c => <option key={c.id} value={c.id} disabled={c.type==='product'&&c.current_stock<=0}>{c.name} — {formatCurrency(c.price)}</option>)}
                            </select>
                            {cartItems.map(ci => (
                                <div key={ci.id} className="flex items-center justify-between bg-slate-900/40 p-2 rounded-lg text-sm text-slate-200">
                                    <span className="truncate flex-1">{ci.name}</span>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => updateQty(ci.id, -1)} className="w-6 h-6 bg-slate-700 rounded-md">-</button>
                                        <span>{ci.quantity}</span>
                                        <button onClick={() => updateQty(ci.id, 1)} className="w-6 h-6 bg-slate-700 rounded-md">+</button>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                    <div className="flex justify-between items-center pt-2 font-bold text-red-500">
                        <span>Total</span><span>{formatCurrency(totalAmount)}</span>
                    </div>
                </div>
                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="flex-1 py-3 bg-slate-700 rounded-xl text-slate-100 font-semibold transition-colors hover:bg-slate-600">Cancelar</button>
                    <button onClick={() => handleSave()} disabled={saving} className="flex-1 py-3 bg-red-600 rounded-xl text-white font-semibold transition-colors hover:bg-red-700 shadow-lg shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />} {saving ? 'Salvando...' : 'Confirmar'}
                    </button>
                </div>
            </div>

            {/* Warning Modal */}
            {showPlanWarningModal && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowPlanWarningModal(false)}></div>
                    <div className="relative bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-sm p-8 shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in duration-200">
                        <div className="w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6 ring-8 ring-amber-500/5">
                            <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 italic">Atenção ao Plano</h3>
                        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                            Este agendamento está <strong className="text-slate-200 border-b border-amber-500/50">fora dos dias cobertos</strong> pelo plano. O serviço deverá ser cobrado separadamente. 
                        </p>
                        <div className="flex w-full gap-3">
                            <button onClick={() => setShowPlanWarningModal(false)} className="flex-1 py-3.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold transition-colors">Cancelar</button>
                            <button onClick={() => { setShowPlanWarningModal(false); handleSave(true); }} className="flex-1 py-3.5 rounded-xl text-white text-sm font-bold transition-all bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20 uppercase tracking-tight">Continuar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function OrderDetailsModal({ order, clientMap, proMap, barbershopId, noshowActive, onClose, onDelete, onCancel, onNoShow, onOpenComanda }) {
    const dt = new Date(order.scheduled_at);
    const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.scheduled;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-100">{clientMap[order.client_id] || 'Cliente'}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusCfg.bg} ${statusCfg.text} border ${statusCfg.border}`}>{statusCfg.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/50">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Data/Hora</p>
                        <p className="text-sm font-semibold text-slate-100">{dateStr} {timeStr}</p>
                    </div>
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/50">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Barbeiro</p>
                        <p className="text-sm font-semibold text-slate-100">{proMap[order.professional_id] || 'N/A'}</p>
                    </div>
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/50 col-span-2">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Valor</p>
                        <p className="text-base font-bold text-red-500">{formatCurrency(order.total_amount)}</p>
                    </div>
                </div>
                <div className="space-y-3 pt-4 border-t border-slate-700">
                    {!['canceled', 'closed', 'no_show'].includes(order.status) && (
                        <div className="flex gap-3">
                            <button onClick={onCancel} className="flex-1 py-3 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl font-bold hover:bg-rose-500/20">Cancelar</button>
                            <button onClick={onOpenComanda} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-red-600/20">Abrir Comanda</button>
                        </div>
                    )}
                    {order.status !== 'closed' && (
                        <button onClick={onNoShow} className="w-full py-3 bg-slate-700 text-slate-300 rounded-xl font-bold hover:bg-slate-600">Marcar Falta</button>
                    )}
                    <button onClick={onDelete} className="w-full py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 shadow-rose-500/20">Excluir</button>
                </div>
            </div>
        </div>
    );
}
