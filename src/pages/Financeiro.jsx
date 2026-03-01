import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import Sidebar from '../components/Sidebar';

/* ═══════════════════════════════════════════════════════════════
   Financeiro — Visão de Águia
   KPIs de Médio Prazo • Caixa do Dia • Comissões • Histórico
   ═══════════════════════════════════════════════════════════════ */

const MASTER_PASSWORD = 'admin123';

const _fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function formatBRL(v) {
    return _fmtBRL.format(Number(v) || 0);
}

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Financeiro() {
    // ── Commission vault ──
    const [isCommissionUnlocked, setIsCommissionUnlocked] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [isPasswordError, setIsPasswordError] = useState(false);

    // ── Core state ──
    const [barbershopId, setBarbershopId] = useState(null);
    const [loading, setLoading] = useState(true);

    // ── Caixa do Dia ──
    const [entradasHoje, setEntradasHoje] = useState(0);
    const [saidasHoje, setSaidasHoje] = useState(0);
    const [listaSaidas, setListaSaidas] = useState([]);

    // ── KPI states (net balance) ──
    const [entradas7Dias, setEntradas7Dias] = useState(0);
    const [saidas7Dias, setSaidas7Dias] = useState(0);
    const [entradasMes, setEntradasMes] = useState(0);
    const [saidasMes, setSaidasMes] = useState(0);
    const [totalAssinantes, setTotalAssinantes] = useState(0);
    const [assinantesAtivos, setAssinantesAtivos] = useState(0);
    const [assinantesAtrasados, setAssinantesAtrasados] = useState(0);

    // ── Commissions ──
    const [periodoComissao, setPeriodoComissao] = useState('semana');
    const [allClosedOrders, setAllClosedOrders] = useState([]);
    const [proMapState, setProMapState] = useState({});
    const [rateMap, setRateMap] = useState({}); // { proId: commission_rate }

    // ── Global month filter ──
    const nowInit = new Date();
    const [selectedMonth, setSelectedMonth] = useState(`${nowInit.getFullYear()}-${String(nowInit.getMonth() + 1).padStart(2, '0')}`);

    // ── Drill-down arrays (para o modal) ──
    const [pedidosHoje, setPedidosHoje] = useState([]);
    const [pedidos7Dias, setPedidos7Dias] = useState([]);
    const [pedidosMes, setPedidosMes] = useState([]);
    const [listaAssinantes, setListaAssinantes] = useState([]);

    // ── Details modal ──
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [detailsModalConfig, setDetailsModalConfig] = useState({ title: '', data: [], type: 'orders' });

    // ── Histórico + Paginação ──
    const [historicoComandas, setHistoricoComandas] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // ── Expandable row states ──
    const [expandedModalOrderId, setExpandedModalOrderId] = useState(null);
    const [expandedHistoricoOrderId, setExpandedHistoricoOrderId] = useState(null);

    // ── Expense modal ──
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [expenseDesc, setExpenseDesc] = useState('');
    const [expenseAmount, setExpenseAmount] = useState('');
    const [savingExpense, setSavingExpense] = useState(false);

    // ── Dates (UTC ISO — local midnight → UTC for Supabase comparison) ──
    const today = new Date();

    // Hoje: meia-noite local → UTC ISO (ex: 00:00 BRT → 03:00Z)
    const startOfDayISO = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString();
    const endOfDayISO = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();
    const sevenDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 0, 0, 0, 0).toISOString();

    // Mês selecionado: primeiro/último dia local → UTC ISO
    const [selYear, selMonthNum] = selectedMonth.split('-').map(Number);
    const startOfMonthISO = new Date(selYear, selMonthNum - 1, 1, 0, 0, 0, 0).toISOString();
    const endOfMonthISO = new Date(selYear, selMonthNum, 0, 23, 59, 59, 999).toISOString();
    const selectedMonthLabel = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][selMonthNum - 1];
    const isCurrentMonth = selYear === today.getFullYear() && selMonthNum === (today.getMonth() + 1);

    // ── Fetch barbershop_id ──
    useEffect(() => {
        async function fetchShop() {
            const { data: shop } = await supabase
                .from('barbershops')
                .select('id')
                .eq('name', 'The Barbers Club')
                .single();
            if (shop) setBarbershopId(shop.id);
            else setLoading(false);
        }
        fetchShop();
    }, []);

    // ── Master fetch ──
    const fetchAll = useCallback(async () => {
        if (!barbershopId) return;
        setLoading(true);
        try {
            const bId = barbershopId;

            // ═══ 1. ENTRADAS HOJE (orders closed today) — com dados para drill-down ═══
            const { data: todayOrders } = await supabase
                .from('orders')
                .select('id, total_amount, closed_at, client_id, professional_id, order_items(name, price, quantity, item_type)')
                .eq('barbershop_id', bId)
                .eq('status', 'closed')
                .gte('closed_at', startOfDayISO)
                .lte('closed_at', endOfDayISO);

            const totalEntradas = (todayOrders || []).reduce(
                (sum, o) => sum + parseFloat(o.total_amount || 0), 0
            );
            setEntradasHoje(totalEntradas);

            // ═══ 2. SAÍDAS DO MÊS SELECIONADO (expenses) ═══
            const { data: expenses } = await supabase
                .from('expenses')
                .select('id, description, amount, created_at')
                .eq('barbershop_id', bId)
                .gte('created_at', startOfMonthISO)
                .lte('created_at', endOfMonthISO)
                .order('created_at', { ascending: false });

            const totalSaidas = (expenses || []).reduce(
                (sum, e) => sum + parseFloat(e.amount || 0), 0
            );
            setSaidasHoje(totalSaidas);
            setListaSaidas(expenses || []);

            // ═══ 3. FATURAMENTO 7 DIAS + DESPESAS 7 DIAS ═══
            const { data: orders7d } = await supabase
                .from('orders')
                .select('id, total_amount, closed_at, client_id, professional_id, order_items(name, price, quantity, item_type)')
                .eq('barbershop_id', bId)
                .eq('status', 'closed')
                .gte('closed_at', sevenDaysAgo);

            const ent7 = (orders7d || []).reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
            setEntradas7Dias(ent7);

            const { data: expenses7d } = await supabase
                .from('expenses')
                .select('amount')
                .eq('barbershop_id', bId)
                .gte('created_at', sevenDaysAgo);
            const sai7 = (expenses7d || []).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            setSaidas7Dias(sai7);

            // ═══ 4. FATURAMENTO MÊS + DESPESAS MÊS ═══
            const { data: ordersMes } = await supabase
                .from('orders')
                .select('id, total_amount, closed_at, client_id, professional_id, order_items(name, price, quantity, item_type)')
                .eq('barbershop_id', bId)
                .eq('status', 'closed')
                .gte('closed_at', startOfMonthISO)
                .lte('closed_at', endOfMonthISO);

            const entM = (ordersMes || []).reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
            setEntradasMes(entM);

            const { data: expensesMes } = await supabase
                .from('expenses')
                .select('amount')
                .eq('barbershop_id', bId)
                .gte('created_at', startOfMonthISO)
                .lte('created_at', endOfMonthISO);
            const saiM = (expensesMes || []).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
            setSaidasMes(saiM);

            // ═══ 5. MÉTRICAS DE ASSINANTES (tabela clients, NÃO subscriptions) ═══
            const { data: assinantesData } = await supabase
                .from('clients')
                .select('id, name, subscription_status')
                .eq('barbershop_id', bId)
                .eq('is_subscriber', true);

            const allSubs = assinantesData || [];
            setTotalAssinantes(allSubs.length);
            setAssinantesAtivos(allSubs.filter(s => s.subscription_status === 'active').length);
            setAssinantesAtrasados(allSubs.filter(s => s.subscription_status !== 'active' && s.subscription_status !== 'none').length);

            // ═══ 6. HISTÓRICO DE COMANDAS FECHADAS (filtrado pelo mês) ═══
            const { data: historico } = await supabase
                .from('orders')
                .select('id, total_amount, created_at, scheduled_at, closed_at, payment_method, client_id, professional_id, order_items(name, price, quantity, item_type)')
                .eq('barbershop_id', bId)
                .eq('status', 'closed')
                .gte('closed_at', startOfMonthISO)
                .lte('closed_at', endOfMonthISO)
                .order('closed_at', { ascending: false })
                .limit(100);

            // Resolve client + professional names (for ALL order arrays)
            const allOrderArrays = [todayOrders, orders7d, ordersMes, historico].filter(Boolean);
            const allOrders = allOrderArrays.flat();
            const clientIds = [...new Set(allOrders.map(o => o.client_id).filter(Boolean))];
            const proIds = [...new Set(allOrders.map(o => o.professional_id).filter(Boolean))];
            // Subscribers already have names from the query above
            const allClientIds = [...new Set(clientIds)];

            let clientMap = {}, proMap = {};

            if (allClientIds.length > 0) {
                const { data: clients } = await supabase.from('clients').select('id, name').in('id', allClientIds);
                (clients || []).forEach(c => { clientMap[c.id] = c.name; });
            }
            if (proIds.length > 0) {
                const { data: pros } = await supabase.from('profiles').select('id, name, commission_rate').in('id', proIds);
                const newRateMap = {};
                (pros || []).forEach(p => { proMap[p.id] = p.name; newRateMap[p.id] = p.commission_rate ?? 50; });
                setRateMap(newRateMap);
            }
            setProMapState(proMap);

            // Store all closed orders for commission calculation
            setAllClosedOrders((historico || []).map(o => ({
                ...o, total_amount: parseFloat(o.total_amount || 0),
            })));

            // Build enriched arrays for drill-down
            const enrich = (arr) => (arr || []).map(o => ({
                id: o.id, cliente: clientMap[o.client_id] || 'Cliente Avulso',
                valor: parseFloat(o.total_amount || 0), data: o.closed_at,
                order_items: o.order_items || [],
            }));
            setPedidosHoje(enrich(todayOrders));
            setPedidos7Dias(enrich(orders7d));
            setPedidosMes(enrich(ordersMes));
            setListaAssinantes(allSubs.map(s => ({
                id: s.id, cliente: s.name || 'Sem nome', status: s.subscription_status || 'active',
            })));

            setHistoricoComandas((historico || []).map(o => ({
                id: o.id,
                cliente: clientMap[o.client_id] || 'Sem nome',
                profissional: proMap[o.professional_id] || 'Sem nome',
                abertura: o.scheduled_at || o.created_at,
                fechamento: o.closed_at,
                valor: parseFloat(o.total_amount || 0),
                pagamento: o.payment_method || '—',
                order_items: o.order_items || [],
            })));

        } catch (err) {
            console.error('Erro ao buscar dados do financeiro:', err);
        } finally {
            setLoading(false);
        }
    }, [barbershopId, startOfDayISO, endOfDayISO, sevenDaysAgo, startOfMonthISO, endOfMonthISO, selectedMonth]);

    useEffect(() => {
        if (barbershopId) fetchAll();
    }, [barbershopId, fetchAll]);

    // ── Reset pagination on month change ──
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedMonth]);

    // ── Saldos ──
    const saldoDia = entradasHoje - saidasHoje;
    const saldo7Dias = entradas7Dias - saidas7Dias;
    const saldoMes = entradasMes - saidasMes;

    // ── Commissions engine (dynamic rates) ──
    const comissoesPorBarbeiro = React.useMemo(() => {
        const now = new Date();
        let filteredOrders = allClosedOrders;
        if (periodoComissao === 'hoje') {
            const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            filteredOrders = allClosedOrders.filter(o => o.closed_at >= dayStart);
        } else if (periodoComissao === 'semana') {
            const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString();
            filteredOrders = allClosedOrders.filter(o => o.closed_at >= weekStart);
        }
        const grouped = {};
        filteredOrders.forEach(o => {
            const pid = o.professional_id;
            if (!pid) return;
            if (!grouped[pid]) grouped[pid] = { nome: proMapState[pid] || 'Sem nome', total: 0 };
            grouped[pid].total += o.total_amount;
        });
        return Object.entries(grouped).map(([id, v]) => {
            const rawRate = rateMap[id];
            const rate = (typeof rawRate === 'number' && !isNaN(rawRate)) ? rawRate : 50;
            const comissao = v.total * (rate / 100);
            return {
                id, nome: v.nome, totalGerado: v.total,
                rate, valorComissao: isNaN(comissao) ? 0 : comissao,
            };
        }).sort((a, b) => b.totalGerado - a.totalGerado);
    }, [allClosedOrders, periodoComissao, proMapState, rateMap]);

    // ── Save expense ──
    async function handleSaveExpense() {
        if (!expenseDesc.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0) {
            alert('Preencha a descrição e um valor válido.');
            return;
        }
        setSavingExpense(true);
        try {
            const { error } = await supabase
                .from('expenses')
                .insert({
                    barbershop_id: barbershopId,
                    description: expenseDesc.trim(),
                    amount: parseFloat(expenseAmount),
                });
            if (error) throw error;
            setIsExpenseModalOpen(false);
            setExpenseDesc('');
            setExpenseAmount('');
            fetchAll();
        } catch (err) {
            alert(`Erro ao registrar saída: ${err.message}`);
        } finally {
            setSavingExpense(false);
        }
    }

    // ── Commission handlers ──
    function handleUnlock() {
        if (passwordInput === MASTER_PASSWORD) {
            setIsCommissionUnlocked(true);
            setIsPasswordModalOpen(false);
            setPasswordInput('');
            setIsPasswordError(false);
        } else {
            setIsPasswordError(true);
        }
    }

    async function handleEditRate(proId, proName) {
        const input = prompt(`Nova porcentagem de comissão para ${proName} (ex: 45):`);
        if (input === null) return;
        const newRate = parseFloat(input);
        if (isNaN(newRate) || newRate < 0 || newRate > 100) { alert('Valor inválido. Use um número entre 0 e 100.'); return; }
        const { error } = await supabase.from('profiles').update({ commission_rate: newRate }).eq('id', proId);
        if (error) { alert(`Erro: ${error.message}`); return; }
        setRateMap(prev => ({ ...prev, [proId]: newRate }));
    }

    // ── Date label ──
    const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const dateLabel = `${DAY_NAMES[today.getDay()]}, ${today.getDate()} de ${MONTH_NAMES[today.getMonth()]}`;

    // ── Payment method labels ──
    const payLabels = { pix: 'PIX', cash: 'Dinheiro', credit: 'Crédito', debit: 'Débito', credit_card: 'Crédito', debit_card: 'Débito', transfer: 'Transferência' };

    // ── Drill-down helper ──
    function openDetails(title, data, type) {
        setDetailsModalConfig({ title, data, type });
        setDetailsModalOpen(true);
    }

    // ── Pagination helpers ──
    const totalPages = Math.max(1, Math.ceil(historicoComandas.length / itemsPerPage));
    const paginatedHistorico = historicoComandas.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const showingFrom = historicoComandas.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const showingTo = Math.min(currentPage * itemsPerPage, historicoComandas.length);

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden font-sans">
            <Sidebar />
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-xl font-bold text-slate-100">Financeiro</h1>
                            <p className="text-xs text-slate-500 mt-0.5">Visão de Águia • {dateLabel}</p>
                        </div>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={e => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
                            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                        />
                    </div>
                    <button
                        onClick={() => setIsExpenseModalOpen(true)}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/25 text-sm font-semibold hover:bg-rose-500/20 hover:border-rose-500/40 transition-all duration-200"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                        </svg>
                        Registrar Saída
                    </button>
                </div>

                {/* ── Content ── */}
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

                    {loading ? (
                        <div className="flex items-center justify-center py-32">
                            <div className="text-center">
                                <div className="inline-block w-10 h-10 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-3" />
                                <p className="text-sm text-slate-500">Carregando financeiro...</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* ══════════════════════════════════════════
                                LINHA 1 — 4 KPI Cards de Resumo
                            ══════════════════════════════════════════ */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Card 1: Saldo Hoje */}
                                <div onClick={() => isCurrentMonth && openDetails('Faturamento Hoje', pedidosHoje, 'orders')} className={`bg-slate-800 rounded-2xl border border-slate-700 p-5 transition-all ${isCurrentMonth ? 'hover:border-slate-600 hover:ring-2 ring-slate-600 cursor-pointer' : 'opacity-50'}`}>
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Saldo Hoje</p>
                                            <p className="text-[10px] text-slate-600">{isCurrentMonth ? 'Entradas - Saídas' : 'Mês passado'}</p>
                                        </div>
                                    </div>
                                    {isCurrentMonth ? (
                                        <>
                                            <p className={`text-2xl font-bold ${saldoDia >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {saldoDia < 0 ? '- ' : ''}{formatBRL(Math.abs(saldoDia))}
                                            </p>
                                            <div className="flex gap-4 mt-2">
                                                <span className="text-[11px] text-emerald-400/70">↑ {formatBRL(entradasHoje)}</span>
                                                <span className="text-[11px] text-rose-400/70">↓ {formatBRL(saidasHoje)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-2xl font-bold text-slate-600">N/A</p>
                                    )}
                                </div>

                                {/* Card 2: Saldo 7 Dias */}
                                <div onClick={() => isCurrentMonth && openDetails('Faturamento — 7 Dias', pedidos7Dias, 'orders')} className={`bg-slate-800 rounded-2xl border border-slate-700 p-5 transition-all ${isCurrentMonth ? 'hover:border-slate-600 hover:ring-2 ring-slate-600 cursor-pointer' : 'opacity-50'}`}>
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Últimos 7 dias</p>
                                            <p className="text-[10px] text-slate-600">{isCurrentMonth ? 'Saldo líquido' : 'Mês passado'}</p>
                                        </div>
                                    </div>
                                    {isCurrentMonth ? (
                                        <>
                                            <p className={`text-2xl font-bold ${saldo7Dias >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                                                {saldo7Dias < 0 ? '- ' : ''}{formatBRL(Math.abs(saldo7Dias))}
                                            </p>
                                            <div className="flex gap-4 mt-2">
                                                <span className="text-[11px] text-emerald-400/70">↑ {formatBRL(entradas7Dias)}</span>
                                                <span className="text-[11px] text-rose-400/70">↓ {formatBRL(saidas7Dias)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-2xl font-bold text-slate-600">N/A</p>
                                    )}
                                </div>

                                {/* Card 3: Saldo Mês */}
                                <div onClick={() => openDetails(`Faturamento — ${MONTH_NAMES[today.getMonth()]}`, pedidosMes, 'orders')} className="bg-slate-800 rounded-2xl border border-slate-700 p-5 hover:border-slate-600 hover:ring-2 ring-slate-600 transition-all cursor-pointer">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{selectedMonthLabel}</p>
                                            <p className="text-[10px] text-slate-600">Saldo líquido</p>
                                        </div>
                                    </div>
                                    <p className={`text-2xl font-bold ${saldoMes >= 0 ? 'text-violet-400' : 'text-rose-400'}`}>
                                        {saldoMes < 0 ? '- ' : ''}{formatBRL(Math.abs(saldoMes))}
                                    </p>
                                    <div className="flex gap-4 mt-2">
                                        <span className="text-[11px] text-emerald-400/70">↑ {formatBRL(entradasMes)}</span>
                                        <span className="text-[11px] text-rose-400/70">↓ {formatBRL(saidasMes)}</span>
                                    </div>
                                </div>

                                {/* Card 4: Assinantes */}
                                <div onClick={() => openDetails('Assinantes', listaAssinantes, 'subscribers')} className="bg-slate-800 rounded-2xl border border-slate-700 p-5 hover:border-slate-600 hover:ring-2 ring-slate-600 transition-all cursor-pointer">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Assinantes</p>
                                            <p className="text-[10px] text-slate-600">Planos ativos</p>
                                        </div>
                                    </div>
                                    <p className="text-2xl font-bold text-amber-400">{totalAssinantes}</p>
                                    <div className="flex gap-4 mt-2">
                                        <span className="text-[11px] text-emerald-400/70">✓ {assinantesAtivos} Em dia</span>
                                        {assinantesAtrasados > 0 && (
                                            <span className="text-[11px] text-rose-400/70">⚠ {assinantesAtrasados} Atrasados</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ══════════════════════════════════════════
                                LINHA 2 — Saídas do Dia + Comissões
                            ══════════════════════════════════════════ */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* ── Saídas do Dia ── */}
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                    <h2 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                                        </svg>
                                        Saídas — {selectedMonthLabel}
                                        <span className="text-xs font-normal text-slate-600 ml-auto">{listaSaidas.length} registro{listaSaidas.length !== 1 ? 's' : ''}</span>
                                    </h2>

                                    {listaSaidas.length > 0 ? (
                                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                            {listaSaidas.map((s) => (
                                                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900/40 border border-slate-700/30 hover:border-slate-600 transition-colors">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                                                            <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                                                            </svg>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm text-slate-200 truncate">{s.description}</p>
                                                            <p className="text-[11px] text-slate-600">{formatTime(s.created_at)}</p>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm font-semibold text-rose-400 ml-3 flex-shrink-0">- {formatBRL(s.amount)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10">
                                            <svg className="w-10 h-10 text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <p className="text-sm text-slate-500">Nenhuma saída registrada hoje.</p>
                                            <p className="text-xs text-slate-600 mt-1">Caixa 100% positivo ✓</p>
                                        </div>
                                    )}
                                </div>

                                {/* ── Comissões (Cofre) ── */}
                                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                    <h2 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                        </svg>
                                        Comissões
                                    </h2>

                                    {!isCommissionUnlocked ? (
                                        <div className="text-center py-8">
                                            <div className="w-16 h-16 rounded-2xl bg-slate-900/80 border border-slate-700 flex items-center justify-center mx-auto mb-4">
                                                <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-base font-semibold text-slate-200 mb-1">Área Restrita</h3>
                                            <p className="text-xs text-slate-500 mb-5 max-w-xs mx-auto">Protegido por senha master</p>
                                            <button
                                                onClick={() => { setPasswordInput(''); setIsPasswordError(false); setIsPasswordModalOpen(true); }}
                                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 text-sm font-semibold hover:bg-amber-500/25 hover:border-amber-500/50 transition-all duration-200"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                </svg>
                                                Desbloquear
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            {/* Period filter */}
                                            <div className="flex gap-1.5 mb-4">
                                                {[{ k: 'hoje', l: 'Hoje' }, { k: 'semana', l: 'Esta Semana' }, { k: 'mes', l: 'Este Mês' }].map(p => (
                                                    <button key={p.k} onClick={() => setPeriodoComissao(p.k)}
                                                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${periodoComissao === p.k
                                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                            : 'bg-slate-900/50 text-slate-500 border border-slate-700/30 hover:text-slate-300'
                                                            }`}
                                                    >{p.l}</button>
                                                ))}
                                            </div>

                                            {/* Barber list */}
                                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                                {comissoesPorBarbeiro.length > 0 ? comissoesPorBarbeiro.map(b => (
                                                    <div key={b.id} className="bg-slate-900/40 border border-slate-700/30 rounded-xl p-4 hover:border-slate-600 transition-colors">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-sm font-semibold text-slate-200">{b.nome}</p>
                                                            <button className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-400 transition-all">
                                                                ✓ Marcar como Pago
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[11px] text-slate-500">Produção Bruta: {formatBRL(b.totalGerado)}</span>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-sm font-bold text-emerald-400">Comissão ({b.rate}%): {formatBRL(b.valorComissao)}</span>
                                                                <button onClick={() => handleEditRate(b.id, b.nome)} className="text-slate-500 hover:text-amber-400 transition-colors" title="Editar taxa">
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="text-center py-6">
                                                        <p className="text-xs text-slate-500">Nenhum atendimento no período.</p>
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => setIsCommissionUnlocked(false)}
                                                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900/60 border border-slate-700/50 text-slate-500 text-xs hover:text-slate-300 hover:border-slate-600 transition-all"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                                </svg>
                                                Bloquear Novamente
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ══════════════════════════════════════════
                                LINHA 3 — Histórico de Transações
                            ══════════════════════════════════════════ */}
                            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
                                <div className="flex items-center justify-between mb-5">
                                    <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                        </svg>
                                        Histórico de Comandas Fechadas
                                        <span className="text-xs font-normal text-slate-600 ml-2">Últimas {historicoComandas.length}</span>
                                    </h2>
                                </div>

                                {historicoComandas.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
                                                    <th className="pb-3 pr-4">Cliente</th>
                                                    <th className="pb-3 pr-4">Profissional</th>
                                                    <th className="pb-3 pr-4">Abertura</th>
                                                    <th className="pb-3 pr-4">Fechamento</th>
                                                    <th className="pb-3 pr-4">Pagamento</th>
                                                    <th className="pb-3 text-right">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/30">
                                                {paginatedHistorico.map((h) => {
                                                    const items = h.order_items || [];
                                                    const isExpH = expandedHistoricoOrderId === h.id;
                                                    return (
                                                        <React.Fragment key={h.id}>
                                                            <tr
                                                                className="hover:bg-slate-800 transition-colors cursor-pointer"
                                                                onClick={() => setExpandedHistoricoOrderId(isExpH ? null : h.id)}
                                                            >
                                                                <td className="py-3 pr-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <svg className={`w-3.5 h-3.5 text-slate-600 transition-transform duration-200 ${isExpH ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                                        </svg>
                                                                        <p className="text-slate-200 font-medium">{h.cliente}</p>
                                                                    </div>
                                                                </td>
                                                                <td className="py-3 pr-4">
                                                                    <p className="text-slate-400">{h.profissional}</p>
                                                                </td>
                                                                <td className="py-3 pr-4">
                                                                    <span className="text-slate-500">{formatDate(h.abertura)}</span>
                                                                    <span className="text-slate-600 ml-1">{formatTime(h.abertura)}</span>
                                                                </td>
                                                                <td className="py-3 pr-4">
                                                                    <span className="text-slate-500">{formatDate(h.fechamento)}</span>
                                                                    <span className="text-slate-600 ml-1">{formatTime(h.fechamento)}</span>
                                                                </td>
                                                                <td className="py-3 pr-4">
                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-slate-700/50 text-xs text-slate-400">
                                                                        {payLabels[h.pagamento] || h.pagamento}
                                                                    </span>
                                                                </td>
                                                                <td className="py-3 text-right">
                                                                    <p className="text-emerald-400 font-bold">{formatBRL(h.valor)}</p>
                                                                </td>
                                                            </tr>
                                                            {isExpH && (
                                                                <tr>
                                                                    <td colSpan={6} className="p-0">
                                                                        <div className="bg-slate-900/50 border-l-2 border-emerald-500/30 px-5 py-3 mx-2 mb-2 rounded-lg">
                                                                            {items.length > 0 ? (
                                                                                <div className="space-y-1.5">
                                                                                    {items.filter(it => it.item_type === 'service').length > 0 && (
                                                                                        <div>
                                                                                            <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Serviços</p>
                                                                                            {items.filter(it => it.item_type === 'service').map((it, j) => (
                                                                                                <div key={j} className="flex justify-between text-xs text-slate-300 py-0.5">
                                                                                                    <span>{it.quantity}x {it.name}</span>
                                                                                                    <span className="text-slate-400">{formatBRL(parseFloat(it.price || 0))}</span>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                    {items.filter(it => it.item_type === 'product').length > 0 && (
                                                                                        <div>
                                                                                            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1 mt-2">Produtos</p>
                                                                                            {items.filter(it => it.item_type === 'product').map((it, j) => (
                                                                                                <div key={j} className="flex justify-between text-xs text-slate-300 py-0.5">
                                                                                                    <span>{it.quantity}x {it.name}</span>
                                                                                                    <span className="text-slate-400">{formatBRL(parseFloat(it.price || 0))}</span>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <p className="text-xs text-slate-600 italic">Nenhum item detalhado registrado.</p>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {/* Pagination controls */}
                                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
                                            <p className="text-xs text-slate-500">Mostrando {showingFrom} a {showingTo} de {historicoComandas.length} registros</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-xs text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Anterior</button>
                                                <span className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-xs text-emerald-400 font-semibold">{currentPage} / {totalPages}</span>
                                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-xs text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Próximo →</button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-10">
                                        <svg className="w-10 h-10 text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                        </svg>
                                        <p className="text-sm text-slate-500">Nenhuma comanda fechada ainda.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* ══════════════════════════════════
                    Modal de Senha Master
                ══════════════════════════════════ */}
                {
                    isPasswordModalOpen && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setIsPasswordModalOpen(false)}>
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-slate-100">Senha Master</h3>
                                        <p className="text-xs text-slate-500">Digite a senha do proprietário</p>
                                    </div>
                                </div>
                                <input
                                    type="password"
                                    value={passwordInput}
                                    onChange={e => { setPasswordInput(e.target.value); setIsPasswordError(false); }}
                                    onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                                    placeholder="••••••••"
                                    autoFocus
                                    className={`w-full bg-slate-900 border rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-colors mb-4 ${isPasswordError ? 'border-red-500 focus:border-red-500' : 'border-slate-700 focus:border-emerald-500'}`}
                                />
                                {isPasswordError && <p className="text-xs text-red-400 mb-3 -mt-2">Senha incorreta.</p>}
                                <div className="flex gap-3">
                                    <button onClick={() => setIsPasswordModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl bg-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-600 transition-colors">Cancelar</button>
                                    <button onClick={handleUnlock} className="flex-1 px-4 py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 shadow-lg shadow-emerald-500/25 transition-all">Desbloquear</button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* ══════════════════════════════════
                    Modal de Nova Saída
                ══════════════════════════════════ */}
                {
                    isExpenseModalOpen && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setIsExpenseModalOpen(false)}>
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-slate-100">Registrar Saída</h3>
                                        <p className="text-xs text-slate-500">Despesa, sangria ou reforço</p>
                                    </div>
                                </div>

                                <div className="space-y-4 mb-5">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Descrição *</label>
                                        <input
                                            type="text"
                                            value={expenseDesc}
                                            onChange={e => setExpenseDesc(e.target.value)}
                                            placeholder="Ex: Conta de Luz, Café..."
                                            autoFocus
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Valor (R$) *</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={expenseAmount}
                                            onChange={e => setExpenseAmount(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSaveExpense()}
                                            placeholder="0,00"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                                        />
                                    </div>
                                </div>

                                {expenseAmount && parseFloat(expenseAmount) > 0 && (
                                    <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl px-4 py-3 mb-5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-500">Valor a registrar</span>
                                            <span className="text-base font-bold text-rose-400">- {formatBRL(parseFloat(expenseAmount))}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <button onClick={() => setIsExpenseModalOpen(false)} disabled={savingExpense} className="flex-1 px-4 py-3 rounded-xl bg-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-600 transition-colors disabled:opacity-50">Cancelar</button>
                                    <button onClick={handleSaveExpense} disabled={savingExpense} className="flex-1 px-4 py-3 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 shadow-lg shadow-rose-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                        {savingExpense && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                        {savingExpense ? 'Salvando...' : 'Confirmar Saída'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* ══════════════════════════════════
                    Modal de Drill-down (Detalhes)
                ══════════════════════════════════ */}
                {
                    detailsModalOpen && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setDetailsModalOpen(false)}>
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl shadow-black/50" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-base font-semibold text-slate-100">{detailsModalConfig.title}</h3>
                                    <button onClick={() => setDetailsModalOpen(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                <div className="max-h-[60vh] overflow-y-auto space-y-1.5 pr-1">
                                    {detailsModalConfig.data.length === 0 && (
                                        <p className="text-sm text-slate-500 text-center py-8">Nenhum registro encontrado.</p>
                                    )}

                                    {detailsModalConfig.type === 'orders' && detailsModalConfig.data.map((item, i) => {
                                        const items = item.order_items || [];
                                        const isExpM = expandedModalOrderId === (item.id || i);
                                        return (
                                            <div key={item.id || i}>
                                                <div
                                                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/40 border border-slate-700/30 cursor-pointer hover:bg-slate-800 transition-colors"
                                                    onClick={() => setExpandedModalOrderId(isExpM ? null : (item.id || i))}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <svg className={`w-3.5 h-3.5 text-slate-600 flex-shrink-0 transition-transform duration-200 ${isExpM ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                        </svg>
                                                        <div className="min-w-0">
                                                            <p className="text-sm text-slate-200 font-medium truncate">{item.cliente}</p>
                                                            <p className="text-[11px] text-slate-600">{formatDate(item.data)} {formatTime(item.data)}</p>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm font-bold text-emerald-400 ml-3 flex-shrink-0">{formatBRL(item.valor)}</p>
                                                </div>
                                                {isExpM && (
                                                    <div className="bg-slate-900/50 border-l-2 border-emerald-500/30 px-5 py-3 mx-2 mb-1 rounded-lg mt-1">
                                                        {items.length > 0 ? (
                                                            <div className="space-y-1.5">
                                                                {items.filter(it => it.item_type === 'service').length > 0 && (
                                                                    <div>
                                                                        <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">Serviços</p>
                                                                        {items.filter(it => it.item_type === 'service').map((it, j) => (
                                                                            <div key={j} className="flex justify-between text-xs text-slate-300 py-0.5">
                                                                                <span>{it.quantity}x {it.name}</span>
                                                                                <span className="text-slate-400">{formatBRL(parseFloat(it.price || 0))}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {items.filter(it => it.item_type === 'product').length > 0 && (
                                                                    <div>
                                                                        <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1 mt-2">Produtos</p>
                                                                        {items.filter(it => it.item_type === 'product').map((it, j) => (
                                                                            <div key={j} className="flex justify-between text-xs text-slate-300 py-0.5">
                                                                                <span>{it.quantity}x {it.name}</span>
                                                                                <span className="text-slate-400">{formatBRL(parseFloat(it.price || 0))}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-slate-600 italic">Nenhum item detalhado registrado.</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {detailsModalConfig.type === 'subscribers' && detailsModalConfig.data.map((item, i) => (
                                        <div key={item.id || i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/40 border border-slate-700/30">
                                            <p className="text-sm text-slate-200 font-medium truncate">{item.cliente}</p>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${item.status === 'active'
                                                ? 'bg-emerald-500/15 text-emerald-400'
                                                : 'bg-rose-500/15 text-rose-400'
                                                }`}>
                                                {item.status === 'active' ? '✓ Em dia' : '⚠ Atrasado'}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {detailsModalConfig.type === 'orders' && detailsModalConfig.data.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between">
                                        <span className="text-xs text-slate-500">{detailsModalConfig.data.length} registro{detailsModalConfig.data.length !== 1 ? 's' : ''}</span>
                                        <span className="text-sm font-bold text-emerald-400">
                                            Total: {formatBRL(detailsModalConfig.data.reduce((s, o) => s + (o.valor || 0), 0))}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }
            </main >
        </div >
    );
}
