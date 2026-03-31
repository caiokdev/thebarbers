import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useGlobalData } from '../context/GlobalDataContext';

export function useFinanceiroData() {
    const { adminProfile } = useGlobalData();
    const barbershopId = adminProfile?.barbershopId;

    const today = useMemo(() => new Date(), []);
    const [selectedMonth, setSelectedMonth] = useState(today.toISOString().slice(0, 7)); // 'YYYY-MM'

    // Core Metrics
    const [entradasHoje, setEntradasHoje] = useState(0);
    const [saidasHoje, setSaidasHoje] = useState(0);
    const [entradas7Dias, setEntradas7Dias] = useState(0);
    const [saidas7Dias, setSaidas7Dias] = useState(0);
    const [entradasMes, setEntradasMes] = useState(0);
    const [saidasMes, setSaidasMes] = useState(0);

    // Subscribers
    const [totalAssinantes, setTotalAssinantes] = useState(0);
    const [assinantesAtivos, setAssinantesAtivos] = useState(0);
    const [assinantesAtrasados, setAssinantesAtrasados] = useState(0);

    // Lists
    const [listaSaidas, setListaSaidas] = useState([]);
    const [historicoComandas, setHistoricoComandas] = useState([]);
    const [showAllHistorico, setShowAllHistorico] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 7;

    const [allClosedOrders, setAllClosedOrders] = useState([]);
    const [rateMap, setRateMap] = useState({});
    const [clientMapState, setClientMapState] = useState({});
    const [proMapState, setProMapState] = useState({});
    const [commissionPayments, setCommissionPayments] = useState([]);

    // Drill-down Details
    const [pedidosHoje, setPedidosHoje] = useState([]);
    const [pedidos7Dias, setPedidos7Dias] = useState([]);
    const [pedidosMes, setPedidosMes] = useState([]);
    const [listaAssinantes, setListaAssinantes] = useState([]);

    // Loading State
    const [loading, setLoading] = useState(true);

    // Commissions UI State
    const [periodoComissao, setPeriodoComissao] = useState('mes');

    // Dates calculations memoized to stabilize fetchAll dependencies
    const {
        isCurrentMonth,
        startOfDayISO,
        endOfDayISO,
        sevenDaysAgo,
        startOfMonthISO,
        endOfMonthISO,
        selectedMonthLabel,
        selYear,
        selMonth
    } = useMemo(() => {
        const [y, m] = selectedMonth.split('-');
        const yInt = parseInt(y, 10);
        const mIdx = parseInt(m, 10) - 1;
        const isCurr = today.getFullYear() === yInt && today.getMonth() === mIdx;

        const startOfMonth = new Date(yInt, mIdx, 1).toISOString();
        const endOfMonth = new Date(yInt, mIdx + 1, 0, 23, 59, 59, 999).toISOString();

        let startOfDay = null;
        let endOfDay = null;
        let s7d = null;

        if (isCurr) {
            startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
            endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();
            
            const sevenDaysAgoDate = new Date();
            sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 6);
            sevenDaysAgoDate.setHours(0, 0, 0, 0);
            s7d = sevenDaysAgoDate.toISOString();
        }

        const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        return {
            isCurrentMonth: isCurr,
            startOfDayISO: startOfDay,
            endOfDayISO: endOfDay,
            sevenDaysAgo: s7d,
            startOfMonthISO: startOfMonth,
            endOfMonthISO: endOfMonth,
            selectedMonthLabel: MONTH_NAMES[mIdx],
            selYear: y,
            selMonth: m
        };
    }, [selectedMonth, today]);

    const fetchAll = useCallback(async () => {
        if (!barbershopId) return;
        setLoading(true);
        try {
            const bId = barbershopId;

            // 1. ENTRADAS HOJE
            let todayOrders = [];
            if (isCurrentMonth) {
                const { data } = await supabase
                    .from('orders')
                    .select('id, total_amount, closed_at, client_id, professional_id, professionals(name), order_items(name, price, quantity, item_type), notes')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed')
                    .gte('closed_at', startOfDayISO)
                    .lte('closed_at', endOfDayISO);
                todayOrders = data || [];
                setEntradasHoje(todayOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0));
            } else {
                setEntradasHoje(0);
            }

            // 2. SAÍDAS MÊS / HOJE
            const { data: expenses } = await supabase
                .from('expenses')
                .select('id, description, amount, created_at')
                .eq('barbershop_id', bId)
                .gte('created_at', startOfMonthISO)
                .lte('created_at', endOfMonthISO)
                .order('created_at', { ascending: false });

            setListaSaidas(expenses || []);
            
            let todayExpenses = [];
            if (isCurrentMonth) {
                todayExpenses = (expenses || []).filter(e => e.created_at >= startOfDayISO && e.created_at <= endOfDayISO);
                setSaidasHoje(todayExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0));
            } else {
                setSaidasHoje(0);
            }

            // 3. 7 DIAS
            let orders7d = [];
            if (isCurrentMonth) {
                const { data: o7d } = await supabase
                    .from('orders')
                    .select('id, total_amount, closed_at, client_id, professional_id, professionals(name), order_items(name, price, quantity, item_type), notes')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed')
                    .gte('closed_at', sevenDaysAgo);
                orders7d = o7d || [];
                setEntradas7Dias(orders7d.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0));

                const { data: e7d } = await supabase
                    .from('expenses')
                    .select('amount')
                    .eq('barbershop_id', bId)
                    .gte('created_at', sevenDaysAgo);
                setSaidas7Dias((e7d || []).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0));
            } else {
                setEntradas7Dias(0);
                setSaidas7Dias(0);
            }

            // 4. MÊS
            const { data: ordersMes } = await supabase
                .from('orders')
                .select('id, total_amount, closed_at, client_id, professional_id, professionals(name), order_items(name, price, quantity, item_type), notes, payment_method, scheduled_at, created_at')
                .eq('barbershop_id', bId)
                .eq('status', 'closed')
                .gte('closed_at', startOfMonthISO)
                .lte('closed_at', endOfMonthISO);

            const oMes = ordersMes || [];
            setEntradasMes(oMes.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0));
            setSaidasMes((expenses || []).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0));

            // 5. ASSINANTES
            const { data: assinantesData } = await supabase
                .from('clients')
                .select('id, name, subscription_status')
                .eq('barbershop_id', bId)
                .eq('is_subscriber', true);

            const allSubs = assinantesData || [];
            setTotalAssinantes(allSubs.length);
            setAssinantesAtivos(allSubs.filter(s => s.subscription_status === 'active').length);
            setAssinantesAtrasados(allSubs.filter(s => s.subscription_status !== 'active' && s.subscription_status !== 'none').length);

            // 5.5 PAGAMENTOS DE COMISSÕES
            const { data: payments } = await supabase
                .from('commission_payments')
                .select('*')
                .eq('barbershop_id', bId);
            setCommissionPayments(payments || []);

            // 6. HISTORICO
            let historico = [...oMes].sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at));
            if (!showAllHistorico) {
                historico = historico.slice(0, 25);
            }

            // Resolve Names
            const allOrderArrays = [todayOrders, orders7d, oMes].filter(Boolean);
            const allOrders = allOrderArrays.flat();
            const clientIds = [...new Set(allOrders.map(o => o.client_id).filter(Boolean))];
            const proIds = [...new Set(allOrders.map(o => o.professional_id).filter(Boolean))];

            let clientMap = {}, proMap = {}, newRateMap = {};

            if (clientIds.length > 0) {
                const { data: clients } = await supabase.from('clients').select('id, name').in('id', clientIds);
                (clients || []).forEach(c => { clientMap[c.id] = c.name; });
            }
            if (proIds.length > 0) {
                // Fetch from both tables to bypass potential RLS blocks on either side
                const [prosRes, profilesProsRes] = await Promise.all([
                    supabase.from('professionals').select('id, name, commission_rate').in('id', proIds),
                    supabase.from('profiles').select('id, name, commission_rate').in('id', proIds)
                ]);
                
                const allPros = [...(prosRes.data || []), ...(profilesProsRes.data || [])];
                allPros.forEach(p => {
                    proMap[p.id] = p.name;
                    newRateMap[p.id] = parseFloat(p.commission_rate) || 50;
                });
                setRateMap(newRateMap);
            }
            setProMapState(proMap);
            setClientMapState(clientMap);

            setAllClosedOrders(oMes.map(o => ({ ...o, total_amount: parseFloat(o.total_amount || 0) })));

            const enrich = (arr) => (arr || []).map(o => ({
                id: o.id, cliente: clientMap[o.client_id] || 'Cliente Avulso',
                valor: parseFloat(o.total_amount || 0), data: o.closed_at,
                order_items: o.order_items || [],
            }));

            setPedidosHoje(enrich(todayOrders));
            setPedidos7Dias(enrich(orders7d));
            setPedidosMes(enrich(oMes));
            
            setListaAssinantes(allSubs.map(s => ({
                id: s.id, cliente: s.name || 'Sem nome', status: s.subscription_status || 'active',
            })));

            setHistoricoComandas(historico.map(o => ({
                id: o.id,
                cliente: clientMap[o.client_id] || 'Sem nome',
                profissional: o.professionals?.name || proMap[o.professional_id] || 'Sem identificação',
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
    }, [barbershopId, startOfDayISO, endOfDayISO, sevenDaysAgo, startOfMonthISO, endOfMonthISO, showAllHistorico, isCurrentMonth]);

    useEffect(() => {
        if (barbershopId) fetchAll();
    }, [barbershopId, fetchAll]);

    useEffect(() => {
        setCurrentPage(1);
        if (!isCurrentMonth) setPeriodoComissao('mes');
    }, [selectedMonth, isCurrentMonth]);

    const saldoDia = entradasHoje - saidasHoje;
    const saldo7Dias = entradas7Dias - saidas7Dias;
    const saldoMes = entradasMes - saidasMes;

    const comissoesPorBarbeiro = useMemo(() => {
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
            if (!grouped[pid]) grouped[pid] = { nome: o.professionals?.name || proMapState[pid] || 'Sem nome', total: 0, orders: [] };
            grouped[pid].total += o.total_amount;
            grouped[pid].orders.push({
                ...o,
                cliente: clientMapState[o.client_id] || 'Cliente Avulso',
            });
        });

        let comissoes = Object.entries(grouped).map(([id, v]) => {
            const rawRate = rateMap[id];
            const rate = (typeof rawRate === 'number' && !isNaN(rawRate)) ? rawRate : 50;
            
            const unpaidOrders = v.orders.filter(o => !(o.notes || '').includes('[PAID]'));
            const paidOrders = v.orders.filter(o => (o.notes || '').includes('[PAID]'));

            const unpaidTotal = unpaidOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
            const paidTotal = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);

            let remainingCommission = unpaidTotal * (rate / 100);
            let alreadyPaidCommission = paidTotal * (rate / 100);
            if (remainingCommission < 0.01) remainingCommission = 0;

            const valorComissaoTotal = unpaidTotal * (rate / 100) + paidTotal * (rate / 100);

            return {
                id, nome: v.nome, totalGerado: v.total, rate, 
                valorComissaoTotal,
                valorComissao: remainingCommission, valorPago: alreadyPaidCommission,
                orders: v.orders.sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at)),
                unpaidOrders
            };
        });

        return comissoes.filter(c => c.valorComissao > 0).sort((a, b) => b.totalGerado - a.totalGerado);
    }, [allClosedOrders, periodoComissao, proMapState, rateMap, clientMapState, commissionPayments, selectedMonthLabel]);

    // Derived Actions
    const addExpense = async (desc, amount) => {
        if (!barbershopId) throw new Error("Barbershop ID missing");
        const { error } = await supabase.from('expenses').insert({
            barbershop_id: barbershopId,
            description: desc,
            amount: amount,
        });
        if (error) throw error;
        await fetchAll();
    };

    const verifyPassword = async (password) => {
        const { data: isValid, error } = await supabase.rpc('verify_master_password', {
            p_barbershop_id: barbershopId,
            p_password: password
        });
        if (error) throw error;
        return isValid;
    };

    const updateCommissionRate = async (proId, newRate) => {
        const { error } = await supabase.from('profiles').update({ commission_rate: newRate }).eq('id', proId);
        if (error) throw error;
        setRateMap(prev => ({ ...prev, [proId]: newRate }));
    };

    const payCommission = async (b) => {
        if (b.unpaidOrders && b.unpaidOrders.length > 0) {
            await Promise.all(b.unpaidOrders.map(async (o) => {
                const newNotes = (o.notes || '') + '\n[PAID]';
                await supabase.from('orders').update({ notes: newNotes.trim() }).eq('id', o.id);
            }));
        }
        const periodLabel = periodoComissao === 'mes' ? selectedMonthLabel : (periodoComissao === 'semana' ? 'Esta Semana' : 'Hoje');
        const { error } = await supabase.from('commission_payments').insert({
            barbershop_id: barbershopId,
            professional_id: b.id,
            amount: b.valorComissao,
            commission_rate: b.rate,
            gross_production: b.totalGerado,
            period_label: periodLabel
        });
        if (error) throw error;
        await fetchAll();
    };

    return {
        today,
        loading,
        selectedMonth, setSelectedMonth,
        isCurrentMonth, selectedMonthLabel, selYear,
        
        entradasHoje, saidasHoje, saldoDia,
        entradas7Dias, saidas7Dias, saldo7Dias,
        entradasMes, saidasMes, saldoMes,
        
        totalAssinantes, assinantesAtivos, assinantesAtrasados,
        
        listaSaidas,
        historicoComandas,
        showAllHistorico, setShowAllHistorico,
        currentPage, setCurrentPage, itemsPerPage,
        
        pedidosHoje, pedidos7Dias, pedidosMes, listaAssinantes,
        
        periodoComissao, setPeriodoComissao,
        comissoesPorBarbeiro,
        
        addExpense, verifyPassword, updateCommissionRate, payCommission
    };
}
