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

const formatBRL = (v) => `R$ ${(v || 0).toFixed(2).replace('.', ',')}`;

export default function Relatorios() {
    const [barbershopId, setBarbershopId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // ── Data states ──
    const [monthlyRevenue, setMonthlyRevenue] = useState([]);
    const [barberPerformance, setBarberPerformance] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [monthlyClients, setMonthlyClients] = useState([]);

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

                // 1. All closed orders for the year
                const { data: orders } = await supabase
                    .from('orders')
                    .select('id, total_amount, closed_at, professional_id, payment_method, client_id')
                    .eq('barbershop_id', barbershopId)
                    .eq('status', 'closed')
                    .gte('closed_at', startOfYear)
                    .lte('closed_at', endOfYear);

                const allOrders = orders || [];

                // 2. All expenses for the year
                const { data: expenses } = await supabase
                    .from('expenses')
                    .select('amount, created_at')
                    .eq('barbershop_id', barbershopId)
                    .gte('created_at', startOfYear)
                    .lte('created_at', endOfYear);

                const allExpenses = expenses || [];

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

                // ═══ Barber performance (horizontal bar) ═══
                const proIds = [...new Set(allOrders.map(o => o.professional_id).filter(Boolean))];
                let proMap = {};
                if (proIds.length > 0) {
                    const { data: pros } = await supabase.from('profiles').select('id, name').in('id', proIds);
                    (pros || []).forEach(p => { proMap[p.id] = p.name; });
                }

                const grouped = {};
                allOrders.forEach(o => {
                    const pid = o.professional_id;
                    if (!pid) return;
                    if (!grouped[pid]) grouped[pid] = { nome: proMap[pid] || 'Sem nome', total: 0, qtd: 0 };
                    grouped[pid].total += parseFloat(o.total_amount || 0);
                    grouped[pid].qtd += 1;
                });
                setBarberPerformance(Object.values(grouped).sort((a, b) => b.total - a.total));

                // ═══ Payment methods (pie chart) ═══
                const payMap = {};
                const payLabels = { pix: 'PIX', cash: 'Dinheiro', credit: 'Crédito', debit: 'Débito', credit_card: 'Crédito', debit_card: 'Débito', transfer: 'Transferência' };
                allOrders.forEach(o => {
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

            } catch (err) {
                console.error('Erro ao buscar relatórios:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [barbershopId, selectedYear]);

    // ── Totals ──
    const totalAnual = useMemo(() => monthlyRevenue.reduce((s, m) => s + m.entradas, 0), [monthlyRevenue]);
    const totalSaidas = useMemo(() => monthlyRevenue.reduce((s, m) => s + m.saidas, 0), [monthlyRevenue]);
    const totalComandas = useMemo(() => barberPerformance.reduce((s, b) => s + b.qtd, 0), [barberPerformance]);

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

    // ── Year options ──
    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm flex-shrink-0">
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Relatórios e Gráficos</h1>
                        <p className="text-xs text-slate-500 mt-0.5">Análise visual de desempenho</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Ano</label>
                        <select
                            value={selectedYear}
                            onChange={e => setSelectedYear(parseInt(e.target.value))}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                        >
                            {yearOptions.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
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
                            {/* ═══ KPI Summary ═══ */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Faturamento {selectedYear}</p>
                                    <p className="text-2xl font-bold text-emerald-400 mt-1">{formatBRL(totalAnual)}</p>
                                </div>
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Saídas {selectedYear}</p>
                                    <p className="text-2xl font-bold text-rose-400 mt-1">{formatBRL(totalSaidas)}</p>
                                </div>
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
                                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Comandas Fechadas</p>
                                    <p className="text-2xl font-bold text-blue-400 mt-1">{totalComandas}</p>
                                </div>
                            </div>

                            {/* ═══ Chart Row 1: Revenue + Barbers ═══ */}
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

                                {/* Barber Performance */}
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                    <h2 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                        </svg>
                                        Desempenho por Barbeiro — {selectedYear}
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

                            {/* ═══ Chart Row 2: Payment Methods + Client Volume ═══ */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Payment Methods Pie */}
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                    <h2 className="text-sm font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                        <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                                        </svg>
                                        Métodos de Pagamento
                                    </h2>
                                    {paymentMethods.length === 0 ? (
                                        <div className="flex items-center justify-center h-64 text-slate-500 text-sm">Nenhum dado disponível</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={280}>
                                            <PieChart>
                                                <Pie
                                                    data={paymentMethods}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={100}
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
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
