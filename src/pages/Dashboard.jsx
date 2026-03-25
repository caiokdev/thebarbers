import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import Drawer, { DrawerTable } from '../components/Drawer';
import useDashboardData from '../hooks/useDashboardData';
import { supabase } from '../supabaseClient';
import OrderDetailsModal from '../components/OrderDetailsModal';
import { formatBRL } from '../utils/orderUtils';

// ─── COMPONENTES INTERNOS ───

const KpiCard = ({ icon, value, label, sub, badge, badgeColor = 'blue', progress, onClick }) => {
    const badgeColors = {
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        red: 'bg-red-500/10 text-red-400 border-red-500/20',
    };

    return (
        <div 
            onClick={onClick}
            className="group bg-slate-800 rounded-2xl border border-slate-700 p-5 hover:border-slate-500 hover:shadow-xl hover:shadow-black/20 transition-all duration-300 cursor-pointer relative overflow-hidden"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 bg-slate-900 rounded-xl text-slate-400 group-hover:text-amber-400 group-hover:bg-amber-400/10 transition-colors">
                    {icon}
                </div>
                {badge && (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${badgeColors[badgeColor]}`}>
                        {badge}
                    </span>
                )}
            </div>
            <div>
                <h3 className="text-2xl font-bold text-slate-100 tracking-tight">{value}</h3>
                <p className="text-sm font-semibold text-slate-400 mt-1">{label}</p>
                {sub && <p className="text-[11px] text-slate-500 mt-1 font-medium italic">{sub}</p>}
            </div>
            {progress !== undefined && (
                <div className="mt-4 w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
                    <div 
                        className={`h-full rounded-full transition-all duration-1000 ${badgeColor === 'amber' ? 'bg-amber-500' : 'bg-blue-500'}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}
        </div>
    );
};

const MiniCard = ({ icon, label, value, color = 'blue', onClick }) => {
    const colors = {
        blue: 'text-blue-400 bg-blue-400/10 border-blue-400/20 hover:border-blue-400/40',
        amber: 'text-amber-400 bg-amber-400/10 border-amber-400/20 hover:border-amber-400/40',
        red: 'text-red-400 bg-red-400/10 border-red-400/20 hover:border-red-400/40',
    };

    return (
        <div 
            onClick={onClick}
            className={`flex items-center justify-between p-4 rounded-2xl bg-slate-800 border transition-all cursor-pointer ${colors[color]}`}
        >
            <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-900/50 rounded-xl">
                    {icon}
                </div>
                <span className="text-sm font-medium text-slate-300">{label}</span>
            </div>
            <span className="text-lg font-bold text-slate-100">{value}</span>
        </div>
    );
};

const AlertCard = ({ icon, label, count, onClick }) => (
    <div 
        onClick={onClick}
        className="flex-1 flex items-center justify-between p-4 bg-slate-800/40 border border-slate-700 rounded-2xl hover:bg-slate-700 cursor-pointer transition-colors"
    >
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-slate-900 ${count > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                {icon}
            </div>
            <span className="text-sm font-medium text-slate-300">{label}</span>
        </div>
        <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${count > 0 ? 'bg-amber-400/10 text-amber-400' : 'bg-slate-700 text-slate-500'}`}>
            {count}
        </span>
    </div>
);



const ChartModal = ({ open, onClose, data, maxRevenue, title }) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-6xl p-8 animate-in fade-in zoom-in duration-300">
                <div className="flex items-center justify-between mb-10">
                    <div>
                        <h2 className="text-xl font-bold text-slate-100">{title || 'Faturamento Detalhado'}</h2>
                        <p className="text-sm text-slate-400">Visão detalhada dos registros</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-slate-200 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="flex items-end justify-between gap-2 h-[300px] overflow-x-auto custom-scrollbar pb-4">
                    {data.map((d, i) => (
                        <div key={i} className="flex-1 min-w-[40px] flex flex-col items-center justify-end h-full gap-3">
                            <span className="text-[10px] font-bold text-slate-200 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700 shadow-xl whitespace-nowrap">{formatBRL(d.value)}</span>
                            <div 
                                className="w-full max-w-[40px] rounded-t-lg transition-all duration-700 ease-out shadow-lg"
                                style={{ 
                                    height: `${Math.max((d.value / (maxRevenue || 1)) * 100, 2)}%`, 
                                    minHeight: '8px',
                                    background: d.day === 'Hoje' ? 'linear-gradient(to top, #866d0b, #B59410)' : 'rgba(181,148,16,0.3)',
                                    boxShadow: d.day === 'Hoje' ? '0 0 30px rgba(181,148,16,0.2)' : 'none'
                                }}
                            />
                            <span className={`text-[10px] font-bold whitespace-nowrap ${d.day === 'Hoje' ? 'text-amber-400' : 'text-slate-400'}`}>{d.day}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ─── PÁGINA PRINCIPAL ───

export default function Dashboard() {
    const navigate = useNavigate();
    const { loading, data, refresh } = useDashboardData();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerType, setDrawerType] = useState(null);
    const [isChartModalOpen, setIsChartModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [detailModal, setDetailModal] = useState({ open: false, title: '', items: [] });

    // Funnel Data — hook exports data.funnel.total / data.funnel.closed
    const funnelTotal = data?.funnel?.total || 0;
    const funnelClosed = data?.funnel?.closed || 0;
    const conversao = funnelTotal > 0 ? ((funnelClosed / funnelTotal) * 100).toFixed(1) : 0;

    // Revenue Data & Meta
    const faturamentoMes = data?.kpis?.faturamentoMes || 0;
    const metaMes = 15000; // Meta Estática
    const metaPercent = Math.min((faturamentoMes / metaMes) * 100, 100);

    // Chart Data — hook exports data.faturamento7Dias with {day, value}
    const last7Days = useMemo(() => {
        if (!data?.faturamento7Dias) return [];
        return data.faturamento7Dias;
    }, [data]);

    const maxRevenue = useMemo(() => {
        const values = last7Days.map(d => d.value);
        return values.length > 0 ? Math.max(...values, 100) : 1000;
    }, [last7Days]);

    const maxMonthlyRevenue = useMemo(() => {
        const values = (data?.faturamentoMensal || []).map(d => d.value);
        return values.length > 0 ? Math.max(...values, 100) : 1000;
    }, [data]);

    // Handle Actions
    const handleDeleteOrder = async (orderId) => {
        try {
            const { error } = await supabase.from('orders').delete().eq('id', orderId);
            if (error) throw error;
            toast.success('Agendamento excluído');
            refresh();
            setSelectedOrder(null);
        } catch (err) {
            toast.error('Erro ao excluir agendamento');
        }
    };

    const handleCancelOrder = async (orderId) => {
        try {
            const { error } = await supabase.from('orders').update({ status: 'canceled' }).eq('id', orderId);
            if (error) throw error;
            toast.success('Agendamento cancelado');
            refresh();
            setSelectedOrder(null);
        } catch (err) {
            toast.error('Erro ao cancelar agendamento');
        }
    };

    const handleNoShowOrder = async (orderId) => {
        try {
            const { error } = await supabase.from('orders').update({ status: 'no_show' }).eq('id', orderId);
            if (error) throw error;
            toast.success('Marcado como Não Compareceu');
            refresh();
            setSelectedOrder(null);
        } catch (err) {
            toast.error('Erro ao atualizar status');
        }
    };

    const handleOpenComanda = (orderId) => {
        navigate(`/pdv/${orderId}`);
    };

    // Drawer Configuration
    const openDrawer = (type) => {
        setDrawerType(type);
        setDrawerOpen(true);
    };

    const currentDrawer = useMemo(() => {
        if (!data) return {};
        switch (drawerType) {
            case 'comandasAbertas':
                return {
                    title: 'Comandas em Aberto',
                    columns: ['Horário', 'Cliente', 'Profissional', 'Total'],
                    data: (data.ordersOpen || []).map(o => ({
                        horario: o.hora,
                        cliente: o.cliente,
                        pro: o.barbeiro,
                        total: o.valor,
                        _id: o._id
                    }))
                };
            case 'atendimentosHoje':
                return {
                    title: 'Atendimentos de Hoje',
                    columns: ['Horário', 'Cliente', 'Profissional', 'Status'],
                    data: (data.ordersToday || []).map(o => ({
                        horario: o.hora,
                        cliente: o.cliente,
                        pro: o.barbeiro,
                        status: o.statusLabel || 'Fechado'
                    }))
                };
            case 'faturamentoHoje':
                return {
                    title: 'Faturamento de Hoje',
                    columns: ['Horário', 'Cliente', 'Total'],
                    data: (data.ordersTodayClosed || []).map(o => ({
                        horario: o.hora,
                        cliente: o.cliente,
                        total: o.valor
                    }))
                };
            case 'estoque':
                return {
                    title: 'Estoque Crítico',
                    columns: ['Produto', 'Atual', 'Mínimo'],
                    data: (data.estoqueData || []).map(p => ({
                        nome: p.produto,
                        stock: p.atual,
                        preco: `mín: ${p.min}`
                    }))
                };
            case 'pagamentos':
                return {
                    title: 'Pagamentos Pendentes',
                    columns: ['Cliente', 'Telefone'],
                    data: (data.clientesInadimplentes || []).map(c => ({
                        nome: c.name,
                        phone: c.phone
                    }))
                };
            case 'contratos':
                return {
                    title: 'Contratos Vencendo (7 dias)',
                    columns: ['Cliente', 'Plano', 'Vencimento'],
                    data: (data.contratosVencendo || []).map(s => ({
                        cliente: s.nome,
                        plano: s.plano,
                        vence: s.vence
                    }))
                };
            default:
                return {};
        }
    }, [drawerType, data]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-slate-400 animate-pulse">Carregando painel...</p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-red-400 text-sm">Erro ao carregar dados.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ─── BLOCO 1 : KPIs PRINCIPAIS ─── */}
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                <KpiCard
                    icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    value={formatBRL(data.kpis.faturamentoDia)}
                    label="Faturamento Hoje"
                    badge="+12% vs ontem"
                    badgeColor="amber"
                    onClick={() => openDrawer('faturamentoHoje')}
                />
                <KpiCard
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                    value={data.kpis.atendimentosHojeClosed}
                    label="Atendimentos Hoje"
                    sub={`${data.kpis.atendimentosHojeClosed} de ${data.kpis.atendimentosHojeTotal} agendados`}
                    badgeColor="blue"
                    onClick={() => openDrawer('atendimentosHoje')}
                />
                <KpiCard
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                    value={`${conversao}%`}
                    label="Conversão do Mês"
                    sub={`${funnelClosed} de ${funnelTotal} agendados`}
                    badgeColor="amber"
                    progress={parseFloat(conversao)}
                    onClick={() => openDrawer('conversaoMes')}
                />
                <KpiCard
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
                    value={formatBRL(faturamentoMes)}
                    label="Meta do Mês"
                    sub={`Meta: ${formatBRL(metaMes)}`}
                    badgeColor="amber"
                    progress={metaPercent}
                    onClick={() => openDrawer('metaMes')}
                />
            </section>

            {/* ─── BLOCO 2 : ORIGEM + PRÓXIMOS ATENDIMENTOS + RESUMO ─── */}
            <section className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <div className="lg:col-span-3 flex flex-col gap-5">
                    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                        <h2 className="text-base font-semibold text-slate-100 mb-5">Origem dos Agendamentos</h2>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="text-center border-r border-slate-700">
                                <p className="text-3xl font-bold text-slate-100">{data.origins.total}</p>
                                <p className="text-xs text-slate-400 mt-1">Total</p>
                            </div>
                            <div className="text-center border-r border-slate-700">
                                <p className="text-3xl font-bold text-emerald-400">{data.origins.whatsapp}</p>
                                <p className="text-xs text-slate-400 mt-1">WhatsApp <span className="font-medium text-emerald-400">({data.origins.whatsappPercent}%)</span></p>
                            </div>
                            <div className="text-center border-r border-slate-700">
                                <p className="text-3xl font-bold" style={{ color: 'var(--brand-red)' }}>{data.origins.app}</p>
                                <p className="text-xs text-slate-400 mt-1">App <span className="font-medium" style={{ color: 'var(--brand-red)' }}>({data.origins.appPercent}%)</span></p>
                            </div>
                            <div className="text-center">
                                <p className="text-3xl font-bold text-blue-400">{data.origins.reception}</p>
                                <p className="text-xs text-slate-400 mt-1">Recepção <span className="text-blue-400 font-medium">({data.origins.receptionPercent}%)</span></p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                        <h2 className="text-base font-semibold text-slate-100 mb-4">Próximos Atendimentos</h2>
                        {(data.proximosAtendimentos || []).length === 0 ? (
                            <p className="text-sm text-slate-500">Nenhum agendamento próximo.</p>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {data.proximosAtendimentos.map((pro, i) => (
                                    <div
                                        key={i}
                                        onClick={() => setSelectedOrder(pro.orderInfo)}
                                        className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700 cursor-pointer transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                {pro.initials}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-slate-200 truncate">{pro.nome}</p>
                                                <p className="text-xs text-slate-500 truncate">{pro.cliente}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-3">
                                            <span className="text-sm font-bold text-slate-200 bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-600">
                                                {pro.hora}
                                            </span>
                                            {pro.data && (
                                                <span className="text-[10px] text-slate-500 font-medium">
                                                    {pro.data}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-2 flex flex-col gap-3">
                    <MiniCard
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                        label="Comandas abertas"
                        value={data.kpis.openOrders}
                        color="red"
                        onClick={() => openDrawer('comandasAbertas')}
                    />
                    <MiniCard
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        label="Próximo horário livre"
                        value={data.proximoHorarioLivre || '—'}
                        color="amber"
                    />
                    <MiniCard
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
                        label="Não compareceu"
                        value={data.funnel?.noShowCount || 0}
                        color="red"
                        onClick={() => setDetailModal({ open: true, title: 'Não Compareceu', items: data.funnel?.listaNaoCompareceuHoje || [] })}
                    />
                    <MiniCard
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                        label="Cancelamentos hoje"
                        value={data.funnel?.canceledCount || 0}
                        color="amber"
                        onClick={() => setDetailModal({ open: true, title: 'Cancelamentos', items: data.funnel?.listaCanceladosHoje || [] })}
                    />
                </div>
            </section>

            {/* ─── BLOCO 3 : PERFORMANCE FINANCEIRA ─── */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div
                    className="bg-slate-800 rounded-2xl border border-slate-700 p-6 cursor-pointer hover:bg-slate-700/70 hover:border-slate-600 transition-all duration-200"
                    onClick={() => setIsChartModalOpen(true)}
                >
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-base font-semibold text-slate-100">Faturamento — 7 dias</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Visão semanal • Clique para expandir</p>
                        </div>
                        <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: 'rgba(181,148,16,0.15)', color: '#B59410' }}>
                            {formatBRL(last7Days.reduce((s, d) => s + d.value, 0))}
                        </span>
                    </div>
                    <div className="flex items-end justify-between gap-2 h-[140px]">
                        {last7Days.map((d, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                                <span className="text-[10px] text-slate-500 font-medium">{formatBRL(d.value)}</span>
                                <div
                                    className="w-full rounded-lg transition-all duration-500"
                                    style={{ height: `${(d.value / maxRevenue) * 100}%`, minHeight: '8px', background: d.day === 'Hoje' ? '#B59410' : 'rgba(181,148,16,0.25)' }}
                                />
                                <span className="text-[11px] text-slate-500 font-medium">{d.day}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 flex flex-col justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-slate-100">Ticket Médio</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Média por comanda fechada</p>
                    </div>
                    <div className="my-6">
                        <p className="text-5xl font-bold text-slate-100 tracking-tight">{formatBRL(data.kpis.ticketMedio)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-red-500/10 text-red-400">
                            -5% vs mês anterior
                        </span>
                        <span className="text-xs text-slate-500">Simulado</span>
                    </div>
                </div>
            </section>

            {/* ─── BLOCO 4 : ALERTAS OPERACIONAIS ─── */}
            <section className="flex flex-col sm:flex-row gap-5">
                <AlertCard
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                    label="Estoque crítico"
                    count={data.estoqueData?.length || 0}
                    onClick={() => openDrawer('estoque')}
                />
                <AlertCard
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                    label="Contratos vencendo"
                    count={data.contracts?.expiring || 0}
                    onClick={() => openDrawer('contratos')}
                />
                <AlertCard
                    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.999L13.732 4.001c-.77-1.333-2.694-1.333-3.464 0L3.34 16.001C2.57 17.334 3.532 19 5.072 19z" /></svg>}
                    label="Pagamentos pendentes"
                    count={data.clientesInadimplentes?.length || 0}
                    onClick={() => openDrawer('pagamentos')}
                />
            </section>

            {/* Modals & Drawer */}
            <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={currentDrawer.title || ''}>
                <DrawerTable
                    columns={currentDrawer.columns || []}
                    data={currentDrawer.data || []}
                    onRowClick={drawerType === 'comandasAbertas' ? (row) => {
                        setDrawerOpen(false);
                        if (row._id) navigate(`/pdv/${row._id}`);
                    } : undefined}
                />
            </Drawer>

            <ChartModal 
                open={isChartModalOpen} 
                onClose={() => setIsChartModalOpen(false)} 
                data={data?.faturamentoMensal || last7Days} 
                maxRevenue={maxMonthlyRevenue} 
                title={data?.faturamentoMensal ? "Faturamento Mensal" : "Faturamento — 7 dias"}
            />

            {detailModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailModal({ open: false, title: '', items: [] })} />
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                            <h3 className="text-base font-semibold text-slate-100">{detailModal.title}</h3>
                            <button onClick={() => setDetailModal({ open: false, title: '', items: [] })} className="text-slate-500 hover:text-slate-300 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            {detailModal.items.length > 0 ? (
                                <div className="space-y-2">
                                    {detailModal.items.map((item, i) => (
                                        <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-700/40 hover:border-slate-600 transition-colors">
                                            <div className="flex-1 min-w-0 pr-4">
                                                <p className="text-sm font-medium text-slate-200 truncate" title={item.cliente}>{item.cliente}</p>
                                                <p className="text-[11px] text-slate-500 truncate" title={item.profissional}>{item.profissional}</p>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-sm font-bold text-slate-300 whitespace-nowrap">{item.horario}</p>
                                                <p className="text-[10px] text-slate-600 whitespace-nowrap">{item.data}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <svg className="w-12 h-12 text-slate-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <p className="text-sm text-slate-500">Nenhum registro para exibir</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedOrder && (
                <OrderDetailsModal
                    order={selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onDelete={handleDeleteOrder}
                    onCancel={handleCancelOrder}
                    onNoShow={handleNoShowOrder}
                    onOpenComanda={handleOpenComanda}
                />
            )}
        </div>
    );
}
