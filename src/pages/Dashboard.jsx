import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import Drawer, { DrawerTable } from '../components/Drawer';
import useDashboardData from '../hooks/useDashboardData';
import { supabase } from '../supabaseClient';
import OrderDetailsModal from '../components/OrderDetailsModal';

/* ───────── helpers ───────── */
function formatBRL(v) {
    return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

/* ───────── BLOCO 1 : KPI Card (Dark) ───────── */
function KpiCard({ icon, label, value, sub, badge, badgeColor = 'emerald', progress, onClick }) {
    const iconBg = {
        emerald: 'bg-emerald-500/10 text-emerald-400',
        red: 'bg-red-500/10 text-red-400',
        blue: 'bg-blue-500/10 text-blue-400',
        amber: 'bg-amber-500/10 text-amber-400',
    };
    return (
        <div
            onClick={onClick}
            className={`bg-slate-800 rounded-2xl border border-slate-700 p-6 flex flex-col justify-between min-h-[160px] transition-all duration-200 ${onClick ? 'cursor-pointer hover:bg-slate-700/70 hover:border-slate-600 hover:shadow-lg hover:shadow-slate-900/50' : ''
                }`}
        >
            <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg[badgeColor] || iconBg.emerald}`}>
                    {icon}
                </div>
                {badge && (
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${badge.startsWith('+') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                        {badge}
                    </span>
                )}
            </div>
            <div className="mt-4">
                <p className="text-4xl font-bold text-slate-100 tracking-tight">{value}</p>
                <p className="text-sm text-slate-400 mt-1">{label}</p>
                {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
            </div>
            {progress !== undefined && (
                <div className="mt-3">
                    <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(progress, 100)}%`, background: '#B59410' }}
                        />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 text-right">{progress.toFixed(0)}%</p>
                </div>
            )}
        </div>
    );
}

/* ───────── BLOCO 2 : Mini card (Dark) ───────── */
function MiniCard({ icon, label, value, color = 'gray', onClick }) {
    const iconColors = {
        emerald: 'text-emerald-400',
        red: 'text-red-400',
        amber: 'text-amber-400',
        blue: 'text-blue-400',
        gray: 'text-slate-400',
    };
    return (
        <div
            onClick={onClick}
            className={`bg-slate-800 rounded-xl border border-slate-700 px-4 py-3 flex items-center gap-3 transition-all duration-200 ${onClick ? 'cursor-pointer hover:bg-slate-700/70 hover:border-slate-600' : ''
                }`}
        >
            <div className={`${iconColors[color]}`}>{icon}</div>
            <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-lg font-bold text-slate-100">{value}</p>
            </div>
        </div>
    );
}

/* ───────── BLOCO 4 : Alert card (Dark + Clickable) ───────── */
function AlertCard({ icon, label, count, onClick }) {
    return (
        <button
            onClick={onClick}
            className="flex-1 bg-slate-800 rounded-2xl border border-slate-700 px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-700/70 hover:border-slate-600 hover:shadow-lg hover:shadow-slate-900/50 transition-all duration-200 text-left"
        >
            <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400 flex-shrink-0">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-400">{label}</p>
            </div>
            <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full min-w-[28px] text-center">
                {count}
            </span>
        </button>
    );
}

/* ───────── CHART MODAL (Zoom) ───────── */
function ChartModal({ open, onClose, data, maxRevenue }) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-full max-w-4xl bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl relative"
                onClick={e => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="mb-6">
                    <h2 className="text-xl font-bold text-slate-100">Faturamento — 7 dias</h2>
                    <p className="text-sm text-slate-400 mt-1">
                        Total da semana: <span className="font-semibold" style={{ color: '#B59410' }}>{formatBRL(data.reduce((s, d) => s + d.value, 0))}</span>
                    </p>
                </div>

                <div className="flex items-end justify-between gap-4 h-96">
                    {data.map((d, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-2">
                            <span className="text-sm text-slate-300 font-semibold">{formatBRL(d.value)}</span>
                            <div
                                className="w-full rounded-xl transition-all duration-500"
                                style={{ height: `${(d.value / maxRevenue) * 100}%`, minHeight: '12px', background: d.day === 'Hoje' ? '#B59410' : 'rgba(181,148,16,0.3)' }}
                            />
                            <span className="text-sm text-slate-400 font-medium">{d.day}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════ */
/* DASHBOARD PRINCIPAL (DARK MODE PREMIUM)    */
/* ═══════════════════════════════════════════ */
export default function Dashboard() {
    const { loading, data } = useDashboardData();
    const navigate = useNavigate();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerType, setDrawerType] = useState(null);
    const [isChartModalOpen, setIsChartModalOpen] = useState(false);
    const [detailModal, setDetailModal] = useState({ open: false, title: '', items: [] });
    const [selectedOrder, setSelectedOrder] = useState(null);

    const handleCancelOrder = async (order) => {
        try {
            await supabase.from('orders').update({ status: 'canceled' }).eq('id', order.id);
            toast.success('Agendamento cancelado com sucesso!');
            setSelectedOrder(null);
            window.dispatchEvent(new Event('focus'));
        } catch (e) { toast.error('Erro ao cancelar agendamento.'); }
    };

    const handleNoShowOrder = async (order) => {
        try {
            await supabase.from('orders').update({ status: 'no_show' }).eq('id', order.id);
            toast.success('Cliente marcado como falta!');
            setSelectedOrder(null);
            window.dispatchEvent(new Event('focus'));
        } catch (e) { toast.error('Erro ao registrar falta.'); }
    };

    const handleOpenComanda = async (order) => {
        try {
            await supabase.from('orders').update({ status: 'open' }).eq('id', order.id);
            toast.success('Comanda aberta com sucesso!');
            setSelectedOrder(null);
            window.dispatchEvent(new Event('focus'));
        } catch (e) { toast.error('Erro ao abrir comanda.'); }
    };

    const handleDeleteOrder = async (order) => {
        try {
            if (order.status === 'no_show') {
                const newNotes = order.notes ? order.notes + '\n[HIDDEN_FROM_AGENDA]' : '[HIDDEN_FROM_AGENDA]';
                await supabase.from('orders').update({ notes: newNotes }).eq('id', order.id);
                toast.success('Falta ocultada da agenda visualmente!');
            } else {
                await supabase.from('orders').delete().eq('id', order.id);
                toast.success('Agendamento excluído da base!');
            }
            setSelectedOrder(null);
            window.dispatchEvent(new Event('focus'));
        } catch (e) { toast.error('Erro ao excluir agendamento.'); }
    };

    function openDrawer(type) {
        setDrawerType(type);
        setDrawerOpen(true);
    }

    // Dynamic 7-day revenue from Supabase
    const last7Days = data?.faturamento7Dias || [];

    const maxRevenue = useMemo(() => Math.max(...last7Days.map(d => d.value), 1), [last7Days]);

    // Meta do mês
    const metaMes = 10000;
    const faturamentoMes = data?.kpis?.faturamentoMes || 0;
    const metaPercent = metaMes > 0 ? (faturamentoMes / metaMes) * 100 : 0;

    // Conversão com números brutos
    const conversao = data?.funnel?.conversao || '0.0';
    const funnelTotal = data?.funnel?.total || 0;
    const funnelClosed = data?.funnel?.closed || 0;

    // Drawer content (alerts + KPI drill-down)
    const drawerConfig = useMemo(() => {
        if (!data) return {};
        return {
            estoque: {
                title: 'Estoque Crítico',
                columns: ['Produto', 'Estoque Atual', 'Mínimo'],
                data: (data.estoqueData || []).map(p => ({
                    produto: p.produto,
                    estoque: p.atual,
                    minimo: p.min,
                })),
            },
            contratos: {
                title: 'Contratos Vencendo',
                columns: ['Cliente', 'Plano', 'Vence em'],
                data: data.contratosVencendo || [],
            },
            pagamentos: {
                title: 'Pagamentos Pendentes',
                columns: ['Cliente', 'Telefone', 'Status'],
                data: data.clientesInadimplentes || [],
            },
            // KPI drill-downs
            faturamentoHoje: {
                title: 'Faturamento Hoje — Detalhes',
                columns: ['Hora', 'Cliente', 'Barbeiro', 'Valor'],
                data: data.detalheFaturamentoHoje || [],
            },
            atendimentosHoje: {
                title: 'Atendimentos Fechados Hoje',
                columns: ['Hora', 'Cliente', 'Barbeiro', 'Valor'],
                data: data.detalheAtendimentosHoje || [],
            },
            comandasAbertas: {
                title: 'Comandas Abertas — Detalhes',
                columns: ['Hora Abertura', 'Cliente', 'Barbeiro', 'Valor Atual'],
                data: data.detalheComandasAbertas || [],
            },
            conversaoMes: {
                title: 'Agendamentos do Mês',
                columns: ['Data/Hora', 'Cliente', 'Barbeiro', 'Status', 'Valor'],
                data: data.detalheConversaoMes || [],
            },
            metaMes: {
                title: 'Faturamento do Mês Atual',
                columns: ['Dia', 'Faturamento'],
                data: data.detalheMetaMes || [],
            },
            aniversariantesSemana: {
                title: 'Aniversariantes da Semana',
                columns: ['Cliente', 'Aniversário', 'Ação'],
                data: data.aniversariantesSemana || [],
            },
        };
    }, [data]);

    const currentDrawer = drawerConfig[drawerType] || {};

    if (loading) {
        return (
            <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
                <Sidebar />
                <main className="flex-1 flex flex-col h-full overflow-hidden">
                    <Header />
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-red-600 rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-500 text-sm">Carregando dashboard...</p>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
                <Sidebar />
                <main className="flex-1 flex flex-col h-full overflow-hidden">
                    <Header />
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-red-400 text-sm">Erro ao carregar dados.</p>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
            <Sidebar />

            <main className="flex-1 flex flex-col h-full overflow-hidden">
                <Header userName={data.adminName} totalClientes={data.kpis.clients} totalAssinantes={data.kpis.activeSubsCount} hideSearch={true} hideNotifications={true} />

                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

                    {/* ─── BLOCO 1 : KPIs PRINCIPAIS (Clickable → Drawer) ─── */}
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
                        {/* Esquerda 60% - dois cards empilhados */}
                        <div className="lg:col-span-3 flex flex-col gap-5">
                            {/* Card A: Origem dos Agendamentos */}
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

                            {/* Card B: Próximos Atendimentos da Equipe */}
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
                                                <span className="text-sm font-bold text-slate-200 bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-600 flex-shrink-0 ml-3">
                                                    {pro.hora}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Direita 40% - Resumo rápido */}
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
                                value="11:00"
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
                        {/* Faturamento 7 dias (Clickable → Modal) */}
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

                        {/* Ticket Médio */}
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

                    {/* ─── BLOCO 4 : ALERTAS OPERACIONAIS (Clickable → Drawer) ─── */}
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

                </div>
            </main>

            {/* ─── GAVETA LATERAL (Dark) ─── */}
            <Drawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title={currentDrawer.title || ''}
            >
                <DrawerTable
                    columns={currentDrawer.columns || []}
                    data={currentDrawer.data || []}
                    onRowClick={drawerType === 'comandasAbertas' ? (row) => {
                        setDrawerOpen(false);
                        if (row._id) navigate(`/pdv/${row._id}`);
                    } : undefined}
                />
            </Drawer>

            {/* ─── MODAL ZOOM GRÁFICO ─── */}
            <ChartModal
                open={isChartModalOpen}
                onClose={() => setIsChartModalOpen(false)}
                data={last7Days}
                maxRevenue={maxRevenue}
            />

            {/* ─── MODAL DETAIL (Não Compareceu / Cancelamentos) ─── */}
            {detailModal.open && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailModal({ open: false, title: '', items: [] })} />
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                            <h3 className="text-base font-semibold text-slate-100">{detailModal.title}</h3>
                            <button onClick={() => setDetailModal({ open: false, title: '', items: [] })} className="text-slate-500 hover:text-slate-300 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {/* Body */}
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
                                    <svg className="w-12 h-12 text-slate-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-sm text-slate-500">Nenhum registro para exibir</p>
                                    <p className="text-xs text-slate-600 mt-1">Tudo certo por aqui ✓</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL DETALHES AGENDAMENTO ─── */}
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
