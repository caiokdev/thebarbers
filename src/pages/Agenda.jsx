import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Sidebar from '../components/Sidebar';

/* ───────── Constants ───────── */
const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 72;
const AVATAR_COLORS = [
    'bg-emerald-500', 'bg-blue-500', 'bg-violet-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
    'bg-indigo-500', 'bg-pink-500',
];

/* ───────── Helpers ───────── */
function formatDateFull(d) {
    return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
}

function formatDateInput(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    for (let h = startHour; h <= endHour; h++) {
        const minStart = (h === startHour) ? startMin : 0;
        const minEnd = (h === endHour) ? endMin : 59;
        if (minStart <= 0 && minEnd >= 0) slots.push(`${String(h).padStart(2, '0')}:00`);
        if (minStart <= 30 && minEnd >= 30 && h < endHour) slots.push(`${String(h).padStart(2, '0')}:30`);
        if (h === endHour && minEnd >= 30) slots.push(`${String(h).padStart(2, '0')}:30`);
    }
    return slots;
}

function formatCurrency(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
}

const STATUS_CONFIG = {
    scheduled: { label: 'Agendado', bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
    confirmed: { label: 'Confirmado', bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
    open: { label: 'Aberto', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
    completed: { label: 'Concluído', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    cancelled: { label: 'Cancelado', bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
    no_show: { label: 'Não Compareceu', bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
};

/* ═══════════════════════════════════════════════════════════════
   AGENDA COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Agenda() {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [professionals, setProfessionals] = useState([]);
    const [clients, setClients] = useState([]);
    const [catalog, setCatalog] = useState([]);       // services + products combined
    const [barbershopId, setBarbershopId] = useState(null);
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
        async function fetchData() {
            try {
                const { data: shop } = await supabase
                    .from('barbershops')
                    .select('id')
                    .limit(1)
                    .single();

                if (!shop) { setLoading(false); return; }
                setBarbershopId(shop.id);

                const [barbersRes, clientsRes, productsRes] = await Promise.all([
                    supabase.from('professionals').select('id, name, specialty')
                        .eq('barbershop_id', shop.id).order('name'),
                    supabase.from('clients').select('id, name, phone')
                        .eq('barbershop_id', shop.id).order('name'),
                    supabase.from('products').select('id, name, price, current_stock')
                        .eq('barbershop_id', shop.id).order('name'),
                ]);

                setProfessionals(barbersRes.data || []);
                setClients(clientsRes.data || []);

                // Build a combined catalog: products become type='product'
                const productItems = (productsRes.data || []).map(p => ({
                    id: p.id,
                    name: p.name,
                    price: parseFloat(p.price || 0),
                    type: 'product',
                    current_stock: p.current_stock ?? 0,
                }));

                // Try fetching services catalog (may not exist as a table)
                let serviceItems = [];
                try {
                    const { data: svcData } = await supabase
                        .from('services')
                        .select('id, name, price')
                        .eq('barbershop_id', shop.id)
                        .order('name');
                    serviceItems = (svcData || []).map(s => ({
                        id: s.id,
                        name: s.name,
                        price: parseFloat(s.price || 0),
                        type: 'service',
                    }));
                } catch (_) {
                    // services table may not exist
                }

                setCatalog([...serviceItems, ...productItems]);

                // Business hours
                try {
                    const { data: bhData } = await supabase
                        .from('business_hours')
                        .select('*')
                        .eq('barbershop_id', shop.id)
                        .order('day_of_week');
                    setBusinessHours(bhData || []);
                } catch (_) {
                    // business_hours table may not exist yet
                }
            } catch (_) {
                // silently handled
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // ── Fetch day appointments ──
    const fetchAppointments = useCallback(async () => {
        if (!barbershopId) return;
        // Build LOCAL midnight → 23:59 as proper UTC ISO strings so Supabase
        // compares against the correct wall-clock day in this timezone.
        const y = selectedDate.getFullYear();
        const mo = selectedDate.getMonth();
        const d = selectedDate.getDate();
        const startOfDay = new Date(y, mo, d, 0, 0, 0, 0).toISOString();
        const endOfDay = new Date(y, mo, d, 23, 59, 59, 999).toISOString();

        const { data } = await supabase
            .from('orders')
            .select('id, professional_id, client_id, scheduled_at, total_amount, status')
            .eq('barbershop_id', barbershopId)
            .gte('scheduled_at', startOfDay)
            .lte('scheduled_at', endOfDay)
            .in('status', ['scheduled', 'confirmed', 'open', 'no_show']);

        setAppointments(data || []);
    }, [barbershopId, selectedDate]);

    useEffect(() => {
        if (barbershopId) fetchAppointments();
    }, [barbershopId, selectedDate, fetchAppointments]);

    // ── Current time ticker ──
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // ── Date navigation ──
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

    // ── Appointment placement helpers ──
    const appointmentsBySlot = useMemo(() => {
        const map = {};
        // Sort so that no_show comes first. Thus, valid appointments will visually overwrite no_show if in the same slot.
        [...(appointments || [])].sort((a, b) => {
            if (a.status === 'no_show' && b.status !== 'no_show') return -1;
            if (a.status !== 'no_show' && b.status === 'no_show') return 1;
            return 0;
        }).forEach(a => {
            if (!a.scheduled_at || !a.professional_id) return;
            const dt = new Date(a.scheduled_at);
            const hh = String(dt.getHours()).padStart(2, '0');
            const mm = dt.getMinutes() < 30 ? '00' : '30';
            const key = `${hh}:${mm}-${a.professional_id}`;
            map[key] = a;
        });
        return map;
    }, [appointments]);

    // Client lookup
    const clientMap = useMemo(() => {
        const m = {};
        clients.forEach(c => { m[c.id] = c.name; });
        return m;
    }, [clients]);

    // Professional lookup
    const proMap = useMemo(() => {
        const m = {};
        professionals.forEach(p => { m[p.id] = p.name; });
        return m;
    }, [professionals]);

    // ── Modal handlers ──
    const openModalEmpty = () => { setSelectedSlot({ professionalId: '', time: '' }); setIsModalOpen(true); };
    const openModalFromCell = (professionalId, time) => { setSelectedSlot({ professionalId, time }); setIsModalOpen(true); };
    const openDetailsModal = (order) => { setSelectedOrderDetails(order); setIsDetailsModalOpen(true); };

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
            <Sidebar />

            <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* ─── HEADER ─── */}
                <header className="h-[72px] bg-slate-800 border-b border-slate-700 flex items-center justify-between px-8 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-semibold text-slate-100">Agenda</h1>
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-700 text-slate-300 text-sm font-semibold rounded-full">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Gerenciamento de horários
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button className="relative p-2 text-slate-400 hover:text-slate-200 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full"></span>
                        </button>
                    </div>
                </header>

                {/* ─── DATE TOOLBAR ─── */}
                <div className="flex items-center justify-between px-8 py-4 bg-slate-800/50 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <button onClick={goPrev} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors" title="Dia anterior">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <button onClick={goToday} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${isToday ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>Hoje</button>
                            <button onClick={goNext} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors" title="Próximo dia">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                        <h2 className="text-base font-semibold text-slate-100 ml-2">{formatDateFull(selectedDate)}</h2>
                    </div>
                    <button onClick={openModalEmpty} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-500/20">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        Novo Agendamento
                    </button>
                </div>

                {/* ─── TIME GRID ─── */}
                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
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
                                    <svg className="w-10 h-10 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold text-slate-200 mb-1">Estabelecimento Fechado</h3>
                                <p className="text-sm text-slate-500">Não há horários disponíveis para {DAY_NAMES[selectedDate.getDay()]}.</p>
                                <p className="text-xs text-slate-600 mt-2">Configure os horários em Configurações → Horários</p>
                            </div>
                        </div>
                    ) : (
                        <div className="min-w-max relative">
                            <div className="grid" style={{ gridTemplateColumns: `72px repeat(${professionals.length}, minmax(180px, 1fr))` }}>
                                {/* Header row */}
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

                                {/* Time rows */}
                                {timeSlots.map((time) => {
                                    const isFullHour = time.endsWith(':00');
                                    return (
                                        <React.Fragment key={time}>
                                            <div className={`h-14 flex items-start justify-end pr-3 pt-1 border-r border-slate-700 ${isFullHour ? 'border-t border-slate-700/80' : 'border-t border-slate-700/30'}`}>
                                                {isFullHour && <span className="text-xs font-medium text-slate-500 -mt-0.5">{time}</span>}
                                            </div>

                                            {professionals.map((pro, colIdx) => {
                                                const slotKey = `${time}-${pro.id}`;
                                                const appt = appointmentsBySlot[slotKey];

                                                return (
                                                    <div
                                                        key={slotKey}
                                                        onClick={() => appt ? openDetailsModal(appt) : openModalFromCell(pro.id, time)}
                                                        className={`h-14 border-r border-slate-700/30 relative transition-all duration-150 ${isFullHour ? 'border-t border-slate-700/60' : 'border-t border-slate-700/20'
                                                            } ${appt ? 'cursor-pointer' : 'cursor-pointer group hover:bg-emerald-500/5 hover:border-emerald-500/20'}`}
                                                        title={appt ? `${clientMap[appt.client_id] || 'Cliente'} — ${formatCurrency(appt.total_amount)}` : `${time} — ${pro.name}`}
                                                    >
                                                        {appt ? (
                                                            <div className={`absolute inset-0.5 rounded-lg px-2 py-1 flex flex-col justify-center cursor-pointer hover:ring-2 transition-all ${appt.status === 'no_show'
                                                                ? 'bg-slate-700/40 border border-slate-600/40 ring-slate-400 opacity-60'
                                                                : `${AVATAR_COLORS[colIdx % AVATAR_COLORS.length].replace('bg-', 'bg-')}/15 border ${AVATAR_COLORS[colIdx % AVATAR_COLORS.length].replace('bg-', 'border-')}/30 ring-emerald-400`
                                                                }`}>
                                                                <p className={`text-xs font-semibold truncate ${appt.status === 'no_show' ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{clientMap[appt.client_id] || 'Cliente'}</p>
                                                                <div className="flex items-center gap-1">
                                                                    <p className={`text-[10px] truncate ${appt.status === 'no_show' ? 'text-slate-600 line-through' : 'text-slate-400'}`}>{formatCurrency(appt.total_amount)}</p>
                                                                    {appt.status === 'no_show' && (
                                                                        <span className="text-[8px] font-bold text-rose-400 bg-rose-500/15 px-1.5 py-0.5 rounded-full uppercase tracking-wide leading-none">Faltou</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                                                    <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            {/* Now Line */}
                            {isToday && nowLineTop !== null && (
                                <div className="absolute left-[72px] right-0 z-30 pointer-events-none" style={{ top: `${nowLineTop}px` }}>
                                    <div className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                    <div className="h-[2px] bg-emerald-500 w-full shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* ═══════ CREATION MODAL ═══════ */}
            {isModalOpen && (
                <AppointmentModal
                    professionals={professionals}
                    clients={clients}
                    catalog={catalog}
                    selectedDate={selectedDate}
                    selectedSlot={selectedSlot}
                    barbershopId={barbershopId}
                    appointments={appointments}
                    saving={saving}
                    setSaving={setSaving}
                    onClose={() => setIsModalOpen(false)}
                    onSaved={() => { setIsModalOpen(false); fetchAppointments(); }}
                />
            )}

            {/* ═══════ DETAILS MODAL ═══════ */}
            {isDetailsModalOpen && selectedOrderDetails && (
                <OrderDetailsModal
                    order={selectedOrderDetails}
                    clientMap={clientMap}
                    proMap={proMap}
                    onClose={() => { setIsDetailsModalOpen(false); setSelectedOrderDetails(null); }}
                    onDelete={async () => {
                        const { error } = await supabase
                            .from('orders')
                            .delete()
                            .eq('id', selectedOrderDetails.id);
                        if (error) { alert(`Erro ao excluir: ${error.message}`); return; }
                        setIsDetailsModalOpen(false);
                        setSelectedOrderDetails(null);
                        fetchAppointments();
                        alert('Agendamento excluído com sucesso.');
                    }}
                    onCancel={async () => {
                        const { error } = await supabase
                            .from('orders')
                            .update({ status: 'canceled' })
                            .eq('id', selectedOrderDetails.id);
                        if (error) { alert(`Erro ao cancelar: ${error.message}`); return; }
                        setIsDetailsModalOpen(false);
                        setSelectedOrderDetails(null);
                        fetchAppointments();
                        alert('Agendamento cancelado com sucesso.');
                    }}
                    onNoShow={async () => {
                        const { error } = await supabase
                            .from('orders')
                            .update({ status: 'no_show' })
                            .eq('id', selectedOrderDetails.id);
                        if (error) { alert(`Erro ao marcar falta: ${error.message}`); return; }
                        setIsDetailsModalOpen(false);
                        setSelectedOrderDetails(null);
                        fetchAppointments();
                        alert('Cliente marcado como Não Compareceu.');
                    }}
                    onOpenComanda={async () => {
                        const { error } = await supabase
                            .from('orders')
                            .update({ status: 'open' })
                            .eq('id', selectedOrderDetails.id);
                        if (error) { alert(`Erro ao abrir comanda: ${error.message}`); return; }
                        setIsDetailsModalOpen(false);
                        setSelectedOrderDetails(null);
                        fetchAppointments();
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
    barbershopId, appointments, saving, setSaving, onClose, onSaved,
}) {
    const [professionalId, setProfessionalId] = useState(selectedSlot.professionalId || '');
    const [date, setDate] = useState(formatDateInput(selectedDate));
    const [time, setTime] = useState(selectedSlot.time || '');
    const [clientId, setClientId] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [cartItems, setCartItems] = useState([]);
    const [catalogSelect, setCatalogSelect] = useState('');

    // Avulso mode
    const [isAvulso, setIsAvulso] = useState(false);
    const [avulsoValue, setAvulsoValue] = useState('');
    const [avulsoNotes, setAvulsoNotes] = useState('');
    const [origin, setOrigin] = useState('reception');

    // Client search
    const filteredClients = useMemo(() => {
        if (!clientSearch.trim()) return clients.slice(0, 8);
        const q = clientSearch.toLowerCase();
        return clients.filter(c => c.name?.toLowerCase().includes(q)).slice(0, 8);
    }, [clientSearch, clients]);

    // Total
    const totalAmount = useMemo(() => {
        if (isAvulso) return parseFloat(avulsoValue) || 0;
        return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }, [cartItems, isAvulso, avulsoValue]);

    // Cart operations
    const addToCart = (catalogId) => {
        if (!catalogId) return;
        const item = catalog.find(c => c.id === catalogId);
        if (!item) return;

        // Stock validation for products
        if (item.type === 'product') {
            if ((item.current_stock ?? 0) <= 0) {
                alert('Produto esgotado! Não é possível adicionar.');
                setCatalogSelect('');
                return;
            }
            const existingInCart = cartItems.find(ci => ci.id === item.id);
            const currentQtyInCart = existingInCart ? existingInCart.quantity : 0;
            if (currentQtyInCart + 1 > item.current_stock) {
                alert(`Estoque insuficiente. Apenas ${item.current_stock} unidades disponíveis de "${item.name}".`);
                setCatalogSelect('');
                return;
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
        setCartItems(prev =>
            prev.map(ci => {
                if (ci.id !== id) return ci;
                const newQty = ci.quantity + delta;
                if (newQty <= 0) return { ...ci, quantity: 0 };

                // Stock validation for product increment
                if (delta > 0 && ci.type === 'product') {
                    const catItem = catalog.find(c => c.id === ci.id);
                    if (catItem && newQty > (catItem.current_stock ?? 0)) {
                        alert(`Estoque insuficiente. Apenas ${catItem.current_stock} unidades disponíveis de "${ci.name}".`);
                        return ci;
                    }
                }

                return { ...ci, quantity: newQty };
            }).filter(ci => ci.quantity > 0)
        );
    };

    const selectClient = (c) => {
        setClientId(c.id);
        setClientSearch(c.name);
        setShowClientDropdown(false);
    };

    // ── SAVE to Supabase ──
    const handleSave = async () => {
        if (!professionalId || !date || !time) {
            alert('Preencha os campos obrigatórios (Profissional, Data e Horário).');
            return;
        }

        if (!isAvulso && !clientId) {
            alert('Selecione um cliente válido (pesquise e clique na lista) ou marque como Serviço Avulso.');
            return;
        }

        // ── Build a LOCAL Date object from the form inputs ──
        // Using the multi-arg constructor guarantees local timezone interpretation.
        // Example: user picks "13:00" in UTC-3 → localDate.getHours() === 13
        //          .toISOString() → "…T16:00:00.000Z" (correct UTC representation)
        const [y, mo, d] = date.split('-').map(Number);
        const [h, mi] = time.split(':').map(Number);
        const localDate = new Date(y, mo - 1, d, h, mi, 0);

        // ── Double-booking check (against loaded appointments) ──
        const conflict = (appointments || []).find(a => {
            if (a.professional_id !== professionalId) return false;
            if (a.status === 'no_show' || a.status === 'canceled') return false; // freeing the slot mathematically
            const existing = new Date(a.scheduled_at);
            return existing.getFullYear() === localDate.getFullYear()
                && existing.getMonth() === localDate.getMonth()
                && existing.getDate() === localDate.getDate()
                && existing.getHours() === localDate.getHours()
                && existing.getMinutes() === localDate.getMinutes();
        });

        if (conflict) {
            alert('Este profissional já possui um agendamento neste horário.');
            return;
        }

        setSaving(true);
        try {
            // Send as ISO string — Supabase stores correct UTC instant,
            // and JS new Date(...).getHours() will return correct local hours on read-back.
            const scheduledAt = localDate.toISOString();

            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    barbershop_id: barbershopId || null,
                    professional_id: professionalId || null,
                    client_id: clientId || null,
                    scheduled_at: scheduledAt,
                    total_amount: parseFloat(totalAmount) || 0,
                    status: 'scheduled',
                    origin: origin,
                    ...(isAvulso && avulsoNotes ? { notes: avulsoNotes } : {}),
                })
                .select('id')
                .single();

            if (orderError) {
                console.error('Erro no Supabase:', orderError);
                alert('Erro ao salvar no banco: ' + orderError.message);
                setSaving(false);
                return;
            }

            // Insert order_items (skip if avulso)
            if (!isAvulso && cartItems.length > 0 && order?.id) {
                const items = cartItems.map(ci => ({
                    order_id: order.id,
                    item_type: ci.type,
                    name: ci.name,
                    quantity: ci.quantity,
                    price: ci.price,
                }));

                const { error: itemsError } = await supabase
                    .from('order_items')
                    .insert(items);

                if (itemsError) throw itemsError;
            }

            onSaved();
        } catch (err) {
            alert(`Erro ao salvar: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl shadow-black/40 mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Title */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-100">Novo Agendamento</h3>
                            <p className="text-xs text-slate-500">Preencha os dados abaixo</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Professional */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Profissional *</label>
                        <select value={professionalId} onChange={e => setProfessionalId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors appearance-none cursor-pointer">
                            <option value="">Selecione o barbeiro</option>
                            {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    {/* Date + Time */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Data *</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Horário *</label>
                            <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors" />
                        </div>
                    </div>

                    {/* Client (searchable combo) */}
                    <div className="relative">
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Cliente *</label>
                        <input
                            type="text"
                            value={clientSearch}
                            onChange={e => { setClientSearch(e.target.value); setClientId(''); setShowClientDropdown(true); }}
                            onFocus={() => setShowClientDropdown(true)}
                            placeholder="Buscar cliente..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                        />
                        {clientId && (
                            <div className="absolute right-3 top-9 text-xs text-emerald-400">✓</div>
                        )}
                        {showClientDropdown && filteredClients.length > 0 && !clientId && (
                            <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 max-h-48 overflow-y-auto">
                                {filteredClients.map(c => (
                                    <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 first:rounded-t-xl last:rounded-b-xl transition-colors">
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Origin */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Origem do Agendamento</label>
                        <select value={origin} onChange={e => setOrigin(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors appearance-none cursor-pointer">
                            <option value="reception">Recepção</option>
                            <option value="app">Aplicativo</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="phone">Telefone</option>
                        </select>
                    </div>

                    {/* ── Avulso Toggle ── */}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setIsAvulso(!isAvulso)}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isAvulso ? 'bg-emerald-500' : 'bg-slate-600'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${isAvulso ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-sm text-slate-300">Serviço Avulso / Não especificado</span>
                    </div>

                    {isAvulso ? (
                        /* ── Avulso Fields ── */
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Valor Estimado (opcional)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={avulsoValue}
                                    onChange={e => setAvulsoValue(e.target.value)}
                                    placeholder="0,00"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Observação / Descrição</label>
                                <textarea
                                    value={avulsoNotes}
                                    onChange={e => setAvulsoNotes(e.target.value)}
                                    placeholder="Ex: Corte + algo a decidir..."
                                    rows={2}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors resize-none"
                                />
                            </div>
                        </div>
                    ) : (
                        /* ── Cart: Add Service/Product ── */
                        <>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Serviços & Produtos</label>
                                <select
                                    value={catalogSelect}
                                    onChange={e => addToCart(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors appearance-none cursor-pointer"
                                >
                                    <option value="">Adicionar serviço ou produto...</option>
                                    {catalog.filter(c => c.type === 'service').length > 0 && (
                                        <optgroup label="Serviços">
                                            {catalog.filter(c => c.type === 'service').map(c => (
                                                <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.price)}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                    {catalog.filter(c => c.type === 'product').length > 0 && (
                                        <optgroup label="Produtos">
                                            {catalog.filter(c => c.type === 'product').map(c => {
                                                const isOut = (c.current_stock ?? 0) <= 0;
                                                return (
                                                    <option key={c.id} value={c.id} disabled={isOut}>
                                                        {c.name} — {formatCurrency(c.price)}{isOut ? ' [ESGOTADO]' : c.current_stock <= 5 ? ` (${c.current_stock} un.)` : ''}
                                                    </option>
                                                );
                                            })}
                                        </optgroup>
                                    )}
                                </select>
                            </div>

                            {/* ── Cart Items List ── */}
                            {cartItems.length > 0 && (
                                <div className="space-y-2">
                                    {cartItems.map(ci => (
                                        <div key={ci.id} className="flex items-center gap-3 bg-slate-900/60 rounded-xl px-4 py-2.5 border border-slate-700/50">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ci.type === 'service' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-slate-200 truncate">{ci.name}</p>
                                                <p className="text-[11px] text-slate-500">{formatCurrency(ci.price)} un.</p>
                                            </div>

                                            {/* Quantity controls */}
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => updateQty(ci.id, -1)}
                                                    className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 flex items-center justify-center text-sm font-bold transition-colors"
                                                >−</button>
                                                <span className="w-6 text-center text-sm font-semibold text-slate-100">{ci.quantity}</span>
                                                <button
                                                    onClick={() => updateQty(ci.id, 1)}
                                                    className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 flex items-center justify-center text-sm font-bold transition-colors"
                                                >+</button>
                                            </div>

                                            <p className="text-sm font-semibold text-slate-100 w-24 text-right">{formatCurrency(ci.price * ci.quantity)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Total ── */}
                    <div className="flex items-center justify-between pt-2">
                        <p className="text-sm text-slate-400">Total</p>
                        <p className="text-lg font-bold text-emerald-400">{formatCurrency(totalAmount)}</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-6 pt-5 border-t border-slate-700">
                    <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors disabled:opacity-50">
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {saving ? 'Salvando...' : 'Salvar Agendamento'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   ORDER DETAILS MODAL — View appointment details
   ═══════════════════════════════════════════════════════════════ */
function OrderDetailsModal({ order, clientMap, proMap, onClose, onDelete, onCancel, onNoShow, onOpenComanda }) {
    const [actionLoading, setActionLoading] = useState(false);
    const dt = new Date(order.scheduled_at);
    const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.scheduled;
    const statusLabel = order.status === 'open' ? 'Comanda Aberta' : statusCfg.label;
    const clientName = clientMap[order.client_id] || 'Cliente';
    const proName = proMap[order.professional_id] || 'Profissional';

    const handleCancel = async () => {
        if (!confirm('Tem certeza que deseja cancelar este agendamento?')) return;
        setActionLoading(true);
        await onCancel();
        setActionLoading(false);
    };

    const handleNoShow = async () => {
        if (!confirm('Marcar este cliente como "Não Compareceu"?')) return;
        setActionLoading(true);
        await onNoShow();
        setActionLoading(false);
    };

    const handleDelete = async () => {
        if (!confirm('Tem certeza que deseja EXCLUIR este agendamento? Esta ação não pode ser desfeita.')) return;
        setActionLoading(true);
        await onDelete();
        setActionLoading(false);
    };

    const handleOpenComanda = async () => {
        setActionLoading(true);
        await onOpenComanda();
        setActionLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/40 mx-4" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-100">{clientName}</h3>
                            <p className="text-xs text-slate-500">Detalhes do agendamento</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold ${statusCfg.bg} ${statusCfg.text} border ${statusCfg.border}`}>
                            {statusLabel}
                        </span>
                        <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/50">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Data</p>
                        <p className="text-sm font-semibold text-slate-100">{dateStr}</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/50">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Horário</p>
                        <p className="text-sm font-semibold text-slate-100">{timeStr}</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/50">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Barbeiro</p>
                        <p className="text-sm font-semibold text-slate-100">{proName}</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/50">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Valor</p>
                        <p className="text-sm font-bold text-emerald-400">{formatCurrency(order.total_amount)}</p>
                    </div>
                </div>

                {/* Order ID */}
                <div className="bg-slate-900/40 rounded-lg px-4 py-2 mb-6 border border-slate-700/30">
                    <p className="text-[11px] text-slate-500">ID do pedido: <span className="text-slate-400 font-mono">{order.id?.slice(0, 8)}...</span></p>
                </div>

                {/* Actions */}
                {['canceled', 'closed', 'no_show'].includes(order.status) ? (
                    <div className="pt-4 border-t border-slate-700">
                        <p className="text-center text-sm text-slate-500 italic">
                            {order.status === 'no_show' ? '⚠️ Cliente não compareceu a este agendamento.' : 'Nenhuma ação disponível para este status.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 pt-4 border-t border-slate-700">
                        {/* Main actions row */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCancel}
                                disabled={actionLoading || order.status === 'open'}
                                className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors border ${order.status === 'open'
                                    ? 'text-slate-500 bg-slate-800 border-slate-700 cursor-not-allowed opacity-50'
                                    : 'text-rose-400 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-50'
                                    }`}
                            >
                                {actionLoading ? <div className="w-4 h-4 border-2 border-rose-400/30 border-t-rose-400 rounded-full animate-spin" /> : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                )}
                                Cancelar
                            </button>
                            <button
                                onClick={order.status !== 'open' ? handleOpenComanda : undefined}
                                disabled={actionLoading || order.status === 'open'}
                                className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${order.status === 'open'
                                    ? 'text-amber-300 bg-amber-500/10 border border-amber-500/20 cursor-not-allowed opacity-70'
                                    : 'text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 disabled:opacity-50'
                                    }`}
                            >
                                {actionLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                                    order.status === 'open' ? (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    )
                                )}
                                {order.status === 'open' ? 'Comanda Aberta' : 'Abrir Comanda'}
                            </button>
                        </div>
                        {/* No-show button */}
                        {order.status !== 'open' && (
                            <button
                                onClick={handleNoShow}
                                disabled={actionLoading}
                                className="w-full px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors border text-slate-400 bg-slate-800 border-slate-600 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-50"
                            >
                                {actionLoading ? <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" /> : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                )}
                                Marcar como Falta / Não Compareceu
                            </button>
                        )}
                        <button
                            onClick={handleDelete}
                            disabled={actionLoading}
                            className="w-full px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors text-white bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20 disabled:opacity-50"
                        >
                            {actionLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            )}
                            Excluir Agendamento
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
