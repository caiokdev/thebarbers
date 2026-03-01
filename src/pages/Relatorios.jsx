import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import Sidebar from '../components/Sidebar';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart
} from 'recharts';

/* ═══════════════════════════════════════════════════════════════
   RELATÓRIOS — Visualização de métricas em gráficos
   ═══════════════════════════════════════════════════════════════ */

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171', '#38bdf8', '#c084fc', '#fb923c'];
const MRR_FALLBACK_VALUE = 80; // valor padrão da assinatura

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatBRL = (v) => fmtBRL.format(v || 0);

const TABS = [
    { key: 'visao_geral', label: 'Visão Geral', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
    { key: 'vendas', label: 'Vendas e Serviços', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z' },
    { key: 'pagamentos', label: 'Formas de Pagamento', icon: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z' },
    { key: 'historico', label: 'Histórico de Movimentações', icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' },
];

/* ── Print styles (injected once) ── */
if (typeof document !== 'undefined' && !document.getElementById('print-styles')) {
    const style = document.createElement('style');
    style.id = 'print-styles';
    style.textContent = `
        @media print {
            .print-hidden { display: none !important; }
            body { background: #0f172a !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    `;
    document.head.appendChild(style);
}

export default function Relatorios() {
    const now = new Date();
    const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [barbershopId, setBarbershopId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
    const [activeTab, setActiveTab] = useState('visao_geral');

    // ── Data states ──
    const [monthlyRevenue, setMonthlyRevenue] = useState([]);
    const [barberPerformance, setBarberPerformance] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [monthlyClients, setMonthlyClients] = useState([]);
    const [extratoMovimentacoes, setExtratoMovimentacoes] = useState([]);

    // ── KPI states ──
    const [kpis, setKpis] = useState({
        faturamentoMes: 0,
        crescimentoMM: null,
        clientesHoje: 0,
        comandasMes: 0,
        ticketMedio: 0,
        taxaRetorno: 0,
        horarioPico: null,
        mrr: 0,
        activeSubsCount: 0,
    });

    // ── Derived date values ──
    const selectedYear = useMemo(() => parseInt(selectedPeriod.split('-')[0]), [selectedPeriod]);
    const selectedMonth = useMemo(() => parseInt(selectedPeriod.split('-')[1]) - 1, [selectedPeriod]);
    const periodLabel = useMemo(() => `${MONTH_LABELS[selectedMonth]} ${selectedYear}`, [selectedMonth, selectedYear]);

    // ── Fetch barbershop ──
    useEffect(() => {
        async function fetchShop() {
            const { data: shop } = await supabase
                .from('barbershops')
                .select('id')
                .eq('name', 'The Barbers Club')
                .single();
            if (shop) setBarbershopId(shop.id);
        }
        fetchShop();
    }, []);

    // ── Master fetch ──
    useEffect(() => {
        if (!barbershopId) return;
        async function fetchData() {
            setLoading(true);
            try {
                const startOfYear = new Date(selectedYear, 0, 1).toISOString();
                const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString();

                // Current month boundaries
                const startOfMonth = new Date(selectedYear, selectedMonth, 1).toISOString();
                const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999).toISOString();

                // Previous month boundaries
                const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
                const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
                const startOfPrevMonth = new Date(prevYear, prevMonth, 1).toISOString();
                const endOfPrevMonth = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999).toISOString();

                // 1. All closed orders for the year
                const { data: orders } = await supabase
                    .from('orders')
                    .select('id, total_amount, closed_at, scheduled_at, created_at, professional_id, payment_method, client_id')
                    .eq('barbershop_id', barbershopId)
                    .eq('status', 'closed')
                    .gte('closed_at', startOfYear)
                    .lte('closed_at', endOfYear);

                const allOrders = orders || [];

                // 2. Previous month orders (for growth comparison)
                let prevMonthOrders = [];
                if (prevYear < selectedYear) {
                    const { data: pOrders } = await supabase
                        .from('orders')
                        .select('total_amount')
                        .eq('barbershop_id', barbershopId)
                        .eq('status', 'closed')
                        .gte('closed_at', startOfPrevMonth)
                        .lte('closed_at', endOfPrevMonth);
                    prevMonthOrders = pOrders || [];
                } else {
                    prevMonthOrders = allOrders.filter(o => {
                        const m = new Date(o.closed_at).getMonth();
                        return m === prevMonth;
                    });
                }

                // 3. All expenses for the year
                const { data: expenses } = await supabase
                    .from('expenses')
                    .select('amount, created_at, description')
                    .eq('barbershop_id', barbershopId)
                    .gte('created_at', startOfYear)
                    .lte('created_at', endOfYear);

                const allExpenses = expenses || [];

                // 4. Active subscribers for MRR
                const { data: activeSubs } = await supabase
                    .from('clients')
                    .select('id')
                    .eq('barbershop_id', barbershopId)
                    .eq('is_subscriber', true)
                    .eq('subscription_status', 'active');
                const activeSubsCount = (activeSubs || []).length;

                // ═══ Filter orders for current month ═══
                const currentMonthOrders = allOrders.filter(o => {
                    const d = new Date(o.closed_at);
                    return d.getMonth() === selectedMonth;
                });

                // ═══ KPI: Faturamento Mês ═══
                const faturamentoMes = currentMonthOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);

                // ═══ KPI: Crescimento M/M ═══
                const faturamentoPrev = prevMonthOrders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
                let crescimentoMM = null;
                if (faturamentoPrev > 0) {
                    crescimentoMM = ((faturamentoMes - faturamentoPrev) / faturamentoPrev) * 100;
                } else if (faturamentoMes > 0) {
                    crescimentoMM = 100;
                }

                // ═══ KPI: Clientes Hoje ═══
                const hoje = new Date().toLocaleDateString();
                const comandasHoje = allOrders.filter(o => o.closed_at && new Date(o.closed_at).toLocaleDateString() === hoje);
                const clientesHoje = comandasHoje.length;

                // ═══ KPI: Comandas Mês ═══
                const comandasMes = currentMonthOrders.length;

                // ═══ KPI: Ticket Médio ═══
                const ticketMedio = comandasMes > 0 ? faturamentoMes / comandasMes : 0;

                // ═══ KPI: Taxa de Retorno (Fidelização no Mês) ═══
                // 1) Clientes únicos do mês selecionado
                const clientesDoMesSet = new Set();
                currentMonthOrders.forEach(o => { if (o.client_id) clientesDoMesSet.add(o.client_id); });
                const clientesDoMes = [...clientesDoMesSet];

                // 2) Buscar TODAS as comandas desses clientes (histórico total, sem filtro de mês)
                let totalVisitasMap = {};
                if (clientesDoMes.length > 0) {
                    const { data: allTimeOrders } = await supabase
                        .from('orders')
                        .select('client_id')
                        .eq('barbershop_id', barbershopId)
                        .eq('status', 'closed')
                        .in('client_id', clientesDoMes);
                    (allTimeOrders || []).forEach(o => {
                        if (o.client_id) totalVisitasMap[o.client_id] = (totalVisitasMap[o.client_id] || 0) + 1;
                    });
                }

                // 3) Quantos desses clientes do mês têm > 1 visita no histórico total
                const clientesFieis = clientesDoMes.filter(cid => (totalVisitasMap[cid] || 0) > 1).length;
                const taxaRetorno = clientesDoMes.length > 0 ? (clientesFieis / clientesDoMes.length) * 100 : 0;

                // ═══ KPI: Horário de Pico (usa scheduled_at, fallback created_at) ═══
                const hourCounts = {};
                currentMonthOrders.forEach(o => {
                    const h = new Date(o.scheduled_at || o.created_at).getHours();
                    hourCounts[h] = (hourCounts[h] || 0) + 1;
                });
                let horarioPico = null;
                let maxCount = 0;
                Object.entries(hourCounts).forEach(([h, count]) => {
                    if (count > maxCount) {
                        maxCount = count;
                        horarioPico = parseInt(h);
                    }
                });

                // ═══ KPI: MRR ═══
                const mrr = activeSubsCount * MRR_FALLBACK_VALUE;

                setKpis({
                    faturamentoMes,
                    crescimentoMM,
                    clientesHoje,
                    comandasMes,
                    ticketMedio,
                    taxaRetorno,
                    horarioPico,
                    mrr,
                    activeSubsCount,
                });

                // ═══ Monthly Revenue (bar chart) ═══
                const revenueByMonth = Array.from({ length: 12 }, (_, i) => ({
                    mes: MONTH_LABELS[i],
                    entradas: 0,
                    saidas: 0,
                }));

                allOrders.forEach(o => {
                    const m = new Date(o.closed_at).getMonth();
                    revenueByMonth[m].entradas += parseFloat(o.total_amount || 0);
                });
                allExpenses.forEach(e => {
                    const m = new Date(e.created_at).getMonth();
                    revenueByMonth[m].saidas += parseFloat(e.amount || 0);
                });

                setMonthlyRevenue(revenueByMonth);

                // ═══ Barber performance (horizontal bar) — filtered to selected month ═══
                const proIds = [...new Set(currentMonthOrders.map(o => o.professional_id).filter(Boolean))];
                let proMap = {};
                if (proIds.length > 0) {
                    const { data: pros } = await supabase.from('profiles').select('id, name').in('id', proIds);
                    (pros || []).forEach(p => { proMap[p.id] = p.name; });
                }

                const grouped = {};
                currentMonthOrders.forEach(o => {
                    const pid = o.professional_id;
                    if (!pid) return;
                    if (!grouped[pid]) grouped[pid] = { nome: proMap[pid] || 'Sem nome', total: 0, qtd: 0 };
                    grouped[pid].total += parseFloat(o.total_amount || 0);
                    grouped[pid].qtd += 1;
                });
                setBarberPerformance(Object.values(grouped).sort((a, b) => b.total - a.total));

                // ═══ Payment methods (pie chart) — filtered to selected month ═══
                const payMap = {};
                const payLabels = { pix: 'PIX', cash: 'Dinheiro', credit: 'Crédito', debit: 'Débito', credit_card: 'Crédito', debit_card: 'Débito', transfer: 'Transferência' };
                currentMonthOrders.forEach(o => {
                    const method = payLabels[o.payment_method] || o.payment_method || 'Outro';
                    if (!payMap[method]) payMap[method] = 0;
                    payMap[method] += parseFloat(o.total_amount || 0);
                });
                setPaymentMethods(Object.entries(payMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));

                // ═══ Monthly unique clients (line chart) ═══
                const clientsByMonth = Array.from({ length: 12 }, (_, i) => ({
                    mes: MONTH_LABELS[i],
                    clientes: 0,
                }));
                const clientSets = Array.from({ length: 12 }, () => new Set());
                allOrders.forEach(o => {
                    if (o.client_id) {
                        const m = new Date(o.closed_at).getMonth();
                        clientSets[m].add(o.client_id);
                    }
                });
                clientSets.forEach((s, i) => { clientsByMonth[i].clientes = s.size; });
                setMonthlyClients(clientsByMonth);

                // ═══ Extrato de Movimentações (orders + expenses combined) — selected month ═══
                const clientIds = [...new Set(currentMonthOrders.map(o => o.client_id).filter(Boolean))];
                let clientMap = {};
                if (clientIds.length > 0) {
                    const { data: clients } = await supabase.from('clients').select('id, name').in('id', clientIds);
                    (clients || []).forEach(c => { clientMap[c.id] = c.name; });
                }

                const monthExpenses = allExpenses.filter(e => new Date(e.created_at).getMonth() === selectedMonth);

                const entradas = currentMonthOrders.map(o => ({
                    tipo: 'entrada',
                    data: o.closed_at,
                    valor: parseFloat(o.total_amount || 0),
                    descricao: 'Comanda — ' + (clientMap[o.client_id] || 'Cliente avulso'),
                }));
                const saidas = monthExpenses.map(e => ({
                    tipo: 'saida',
                    data: e.created_at,
                    valor: parseFloat(e.amount || 0),
                    descricao: e.description || 'Despesa',
                }));
                const combined = [...entradas, ...saidas].sort((a, b) => new Date(b.data) - new Date(a.data));
                setExtratoMovimentacoes(combined);

            } catch (err) {
                console.error('Erro ao buscar relatórios:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [barbershopId, selectedPeriod, selectedYear, selectedMonth]);

    // ── Totals (year-level) ──
    const totalAnual = useMemo(() => monthlyRevenue.reduce((s, m) => s + m.entradas, 0), [monthlyRevenue]);
    const totalSaidas = useMemo(() => monthlyRevenue.reduce((s, m) => s + m.saidas, 0), [monthlyRevenue]);

    // ── Custom tooltip ──
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload?.length) {
            return (
                <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 shadow-xl">
                    <p className="text-xs font-semibold text-slate-300 mb-1">{label}</p>
                    {payload.map((p, i) => (
                        <p key={i} className="text-xs" style={{ color: p.color }}>
                            {p.name === 'entradas' ? '↑ Entradas' : p.name === 'saidas' ? '↓ Saídas' : p.name}: {formatBRL(p.value)}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    // ── PDF Export ──
    const handlePrint = () => window.print();

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
            <div className="print-hidden">
                <Sidebar />
            </div>
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm flex-shrink-0 print-hidden">
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Relatórios e Gráficos</h1>
                        <p className="text-xs text-slate-500 mt-0.5">Análise visual de desempenho</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Período</label>
                        <input
                            type="month"
                            value={selectedPeriod}
                            onChange={e => setSelectedPeriod(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                        />
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-slate-100 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            Exportar PDF
                        </button>
                    </div>
                </div>

                {/* ── Tab Navigation ── */}
                <div className="px-8 border-b border-slate-800 flex-shrink-0 print-hidden">
                    <nav className="flex gap-1 -mb-px">
                        {TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg border-b-2 transition-all duration-200 ${activeTab === tab.key
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500'
                                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/50'
                                    }`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                                </svg>
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* ── Content ── */}
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-32">
                            <div className="text-center">
                                <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-3" />
                                <p className="text-sm text-slate-500">Carregando relatórios...</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* ═══ Top KPIs (always visible) ═══ */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Faturamento Mês + Crescimento M/M */}
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Faturamento — {periodLabel}</p>
                                    <p className="text-2xl font-bold text-emerald-400 mt-1">{formatBRL(kpis.faturamentoMes)}</p>
                                    {kpis.crescimentoMM !== null && (
                                        <div className="flex items-center gap-1.5 mt-2">
                                            {kpis.crescimentoMM >= 0 ? (
                                                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
                                                </svg>
                                            )}
                                            <span className={`text-xs font-semibold ${kpis.crescimentoMM >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {kpis.crescimentoMM >= 0 ? '+' : ''}{kpis.crescimentoMM.toFixed(1)}% vs mês anterior
                                            </span>
                                        </div>
                                    )}
                                </div>
                                {/* Clientes Hoje */}
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Clientes Hoje</p>
                                    <p className="text-2xl font-bold text-blue-400 mt-1">{kpis.clientesHoje}</p>
                                    <p className="text-[10px] text-slate-600 mt-1">Comandas fechadas hoje</p>
                                </div>
                                {/* Comandas do Mês */}
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Comandas — {periodLabel}</p>
                                    <p className="text-2xl font-bold text-amber-400 mt-1">{kpis.comandasMes}</p>
                                    <p className="text-[10px] text-slate-600 mt-1">Fechadas no período</p>
                                </div>
                            </div>

                            {/* ═════════════════════════════════════════ */}
                            {/* TAB: Visão Geral                        */}
                            {/* ═════════════════════════════════════════ */}
                            {activeTab === 'visao_geral' && (
                                <div className="space-y-6">
                                    {/* KPI highlight row */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Taxa de Retorno */}
                                        <div className="bg-gradient-to-br from-slate-800 to-slate-800/80 rounded-2xl border border-slate-700 p-6 flex items-center gap-5">
                                            <div className="w-14 h-14 rounded-2xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Taxa de Retorno</p>
                                                <p className="text-3xl font-bold text-violet-400">{kpis.taxaRetorno.toFixed(0)}%</p>
                                                <p className="text-[10px] text-slate-600 mt-0.5">Clientes com +1 visita no ano</p>
                                            </div>
                                        </div>
                                        {/* MRR */}
                                        <div className="bg-gradient-to-br from-slate-800 to-slate-800/80 rounded-2xl border border-slate-700 p-6 flex items-center gap-5">
                                            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Receita Recorrente (MRR)</p>
                                                <p className="text-3xl font-bold text-emerald-400">{formatBRL(kpis.mrr)}</p>
                                                <p className="text-[10px] text-slate-600 mt-0.5">{kpis.activeSubsCount} assinantes ativos × {formatBRL(MRR_FALLBACK_VALUE)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Charts row */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Monthly Revenue */}
                                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                            <h2 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                                </svg>
                                                Faturamento Mensal — {selectedYear}
                                            </h2>
                                            <ResponsiveContainer width="100%" height={280}>
                                                <BarChart data={monthlyRevenue} barGap={2}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                                    <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Bar dataKey="entradas" name="entradas" fill="#34d399" radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="saidas" name="saidas" fill="#f87171" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Monthly Clients (Area Chart) */}
                                        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                            <h2 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                                                </svg>
                                                Clientes Atendidos por Mês
                                            </h2>
                                            <ResponsiveContainer width="100%" height={280}>
                                                <AreaChart data={monthlyClients}>
                                                    <defs>
                                                        <linearGradient id="clientGradient" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                                    <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                                                        itemStyle={{ color: '#fbbf24' }}
                                                        formatter={(v) => [`${v} clientes`, 'Atendidos']}
                                                    />
                                                    <Area type="monotone" dataKey="clientes" stroke="#fbbf24" strokeWidth={2.5} fill="url(#clientGradient)" dot={{ fill: '#fbbf24', r: 3 }} activeDot={{ r: 5 }} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ═════════════════════════════════════════ */}
                            {/* TAB: Vendas e Serviços                   */}
                            {/* ═════════════════════════════════════════ */}
                            {activeTab === 'vendas' && (
                                <div className="space-y-6">
                                    {/* KPI highlight row */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Ticket Médio */}
                                        <div className="bg-gradient-to-br from-slate-800 to-slate-800/80 rounded-2xl border border-slate-700 p-6 flex items-center gap-5">
                                            <div className="w-14 h-14 rounded-2xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Ticket Médio — {periodLabel}</p>
                                                <p className="text-3xl font-bold text-blue-400">{formatBRL(kpis.ticketMedio)}</p>
                                                <p className="text-[10px] text-slate-600 mt-0.5">Média por comanda fechada</p>
                                            </div>
                                        </div>
                                        {/* Horário de Pico */}
                                        <div className="bg-gradient-to-br from-slate-800 to-slate-800/80 rounded-2xl border border-slate-700 p-6 flex items-center gap-5">
                                            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Horário Mais Movimentado</p>
                                                <p className="text-3xl font-bold text-amber-400">
                                                    {kpis.horarioPico !== null ? `${String(kpis.horarioPico).padStart(2, '0')}:00` : '—'}
                                                </p>
                                                <p className="text-[10px] text-slate-600 mt-0.5">Pico de atendimento em {periodLabel}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Barber Performance */}
                                    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                        <h2 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                            </svg>
                                            Desempenho por Barbeiro — {periodLabel}
                                        </h2>
                                        {barberPerformance.length === 0 ? (
                                            <div className="flex items-center justify-center h-64 text-slate-500 text-sm">Nenhum dado disponível</div>
                                        ) : (
                                            <div className="space-y-3">
                                                {barberPerformance.map((b, i) => {
                                                    const maxTotal = barberPerformance[0]?.total || 1;
                                                    const pct = (b.total / maxTotal) * 100;
                                                    return (
                                                        <div key={i}>
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-sm text-slate-300 font-medium">{b.nome}</span>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-[11px] text-slate-500">{b.qtd} atend.</span>
                                                                    <span className="text-sm font-bold text-emerald-400">{formatBRL(b.total)}</span>
                                                                </div>
                                                            </div>
                                                            <div className="w-full bg-slate-900 rounded-full h-2.5">
                                                                <div
                                                                    className="h-2.5 rounded-full transition-all duration-500"
                                                                    style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ═════════════════════════════════════════ */}
                            {/* TAB: Formas de Pagamento                 */}
                            {/* ═════════════════════════════════════════ */}
                            {activeTab === 'pagamentos' && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Payment Methods Pie */}
                                    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                        <h2 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                                            </svg>
                                            Métodos de Pagamento — {periodLabel}
                                        </h2>
                                        {paymentMethods.length === 0 ? (
                                            <div className="flex items-center justify-center h-64 text-slate-500 text-sm">Nenhum dado disponível</div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height={320}>
                                                <PieChart>
                                                    <Pie
                                                        data={paymentMethods}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={70}
                                                        outerRadius={110}
                                                        paddingAngle={3}
                                                        dataKey="value"
                                                        stroke="none"
                                                    >
                                                        {paymentMethods.map((_, i) => (
                                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        formatter={(value) => formatBRL(value)}
                                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
                                                        itemStyle={{ color: '#e2e8f0' }}
                                                    />
                                                    <Legend
                                                        verticalAlign="bottom"
                                                        iconType="circle"
                                                        iconSize={8}
                                                        formatter={(value) => <span style={{ color: '#94a3b8', fontSize: '11px' }}>{value}</span>}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>

                                    {/* Payment breakdown list */}
                                    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                        <h2 className="text-sm font-semibold text-slate-100 mb-4">Detalhamento por Método</h2>
                                        {paymentMethods.length === 0 ? (
                                            <div className="flex items-center justify-center h-64 text-slate-500 text-sm">Nenhum dado disponível</div>
                                        ) : (
                                            <div className="space-y-3">
                                                {paymentMethods.map((pm, i) => {
                                                    const totalPay = paymentMethods.reduce((s, p) => s + p.value, 0) || 1;
                                                    const pct = ((pm.value / totalPay) * 100).toFixed(1);
                                                    return (
                                                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-700/40">
                                                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-slate-200">{pm.name}</p>
                                                                <p className="text-[11px] text-slate-500">{pct}% do total</p>
                                                            </div>
                                                            <span className="text-sm font-bold text-slate-200">{formatBRL(pm.value)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ═════════════════════════════════════════ */}
                            {/* TAB: Histórico de Movimentações          */}
                            {/* ═════════════════════════════════════════ */}
                            {activeTab === 'historico' && (
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                                    <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                                        <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Extrato de Movimentações — {periodLabel}
                                        </h2>
                                        <span className="text-xs text-slate-500 font-medium">{extratoMovimentacoes.length} movimentações</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-700">
                                                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Data / Hora</th>
                                                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Descrição</th>
                                                    <th className="text-left px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                                                    <th className="text-right px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {extratoMovimentacoes.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} className="px-6 py-12 text-center text-slate-600">
                                                            Nenhuma movimentação encontrada para {periodLabel}.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    extratoMovimentacoes.map((mov, idx) => {
                                                        const d = mov.data ? new Date(mov.data) : null;
                                                        const dataStr = d
                                                            ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
                                                            : '—';
                                                        const horaStr = d
                                                            ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                                                            : '';
                                                        return (
                                                            <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                                                                <td className="px-6 py-3">
                                                                    <span className="text-slate-200">{dataStr}</span>
                                                                    {horaStr && <span className="text-slate-500 text-xs ml-2">{horaStr}</span>}
                                                                </td>
                                                                <td className="px-6 py-3 text-slate-300 max-w-[300px] truncate">{mov.descricao}</td>
                                                                <td className="px-6 py-3">
                                                                    {mov.tipo === 'entrada' ? (
                                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                                                                            ↑ Entrada
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20">
                                                                            ↓ Saída
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className={`px-6 py-3 text-right font-semibold ${mov.tipo === 'entrada' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                    {mov.tipo === 'entrada' ? '+' : '-'} {formatBRL(mov.valor)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
