import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function useDashboardData() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [refetchKey, setRefetchKey] = useState(0);
    const location = useLocation();

    // Re-fetch when window regains focus (silent — no loading spinner)
    useEffect(() => {
        function handleFocus() { setRefetchKey(k => k + 1); }
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    useEffect(() => {
        async function fetchAll() {
            try {
                // --- Buscar barbershop_id ---
                const { data: shop } = await supabase
                    .from('barbershops')
                    .select('id')
                    .eq('name', 'The Barbers Club')
                    .single();

                if (!shop) {
                    console.error('Barbershop "The Barbers Club" não encontrado.');
                    setLoading(false);
                    return;
                }

                const bId = shop.id;

                // --- PASSO 1: Admin profile ---
                const { data: adminProfile } = await supabase
                    .from('profiles')
                    .select('name')
                    .eq('barbershop_id', bId)
                    .eq('role', 'admin')
                    .limit(1)
                    .single();

                const adminName = adminProfile?.name || 'Admin';
                const nameParts = adminName.split(' ');
                const adminInitials =
                    nameParts.length >= 2
                        ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
                        : adminName.substring(0, 2).toUpperCase();

                // --- PASSO 2: KPI Cards (counts) ---
                const [
                    { count: barbersCount },
                    { count: openOrdersCount },
                    { count: clientsCount },
                    { count: errorSubsCount },
                ] = await Promise.all([
                    supabase
                        .from('profiles')
                        .select('*', { count: 'exact', head: true })
                        .eq('barbershop_id', bId)
                        .eq('role', 'barber'),
                    supabase
                        .from('orders')
                        .select('*', { count: 'exact', head: true })
                        .eq('barbershop_id', bId)
                        .eq('status', 'open'),
                    supabase
                        .from('clients')
                        .select('*', { count: 'exact', head: true })
                        .eq('barbershop_id', bId),
                    supabase
                        .from('subscriptions')
                        .select('*', { count: 'exact', head: true })
                        .eq('barbershop_id', bId)
                        .eq('status', 'error'),
                ]);

                // --- Variáveis de data (UTC ISO strings para comparar com closed_at) ---
                const today = new Date();
                const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                // Timestamps corretos: converte meia-noite LOCAL → UTC ISO string
                // Ex: 2026-02-28 00:00:00 BRT (UTC-3) → 2026-02-28T03:00:00.000Z
                const startOfDayISO = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString();
                const endOfDayISO = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

                // Para queries que usam campos date (não timestamp)
                const todayISO = localDate(today);
                const in30Days = new Date(today);
                in30Days.setDate(in30Days.getDate() + 30);
                const in30DaysISO = localDate(in30Days);

                // --- Faturamento do Dia (status=closed + timestamps explícitos) ---
                const { data: todayOrders } = await supabase
                    .from('orders')
                    .select('total_amount')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed')
                    .gte('closed_at', startOfDayISO)
                    .lte('closed_at', endOfDayISO);

                const faturamentoDia = (todayOrders || []).reduce(
                    (sum, o) => sum + parseFloat(o.total_amount || 0), 0
                );

                // --- DRILL-DOWN: Detalhes do Faturamento Hoje ---
                const { data: todayDetailOrders } = await supabase
                    .from('orders')
                    .select('total_amount, closed_at, client_id, professional_id')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed')
                    .gte('closed_at', startOfDayISO)
                    .lte('closed_at', endOfDayISO)
                    .order('closed_at', { ascending: true });

                const tdClientIds = [...new Set((todayDetailOrders || []).map(o => o.client_id).filter(Boolean))];
                const tdProIds = [...new Set((todayDetailOrders || []).map(o => o.professional_id).filter(Boolean))];
                let tdClientMap = {}, tdProMap = {};
                if (tdClientIds.length > 0) {
                    const { data: c } = await supabase.from('clients').select('id, name').in('id', tdClientIds);
                    (c || []).forEach(x => { tdClientMap[x.id] = x.name; });
                }
                if (tdProIds.length > 0) {
                    const { data: p } = await supabase.from('profiles').select('id, name').in('id', tdProIds);
                    (p || []).forEach(x => { tdProMap[x.id] = x.name; });
                }
                const detalheFaturamentoHoje = (todayDetailOrders || []).map(o => {
                    const d = new Date(o.closed_at);
                    return {
                        hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                        cliente: tdClientMap[o.client_id] || 'Sem nome',
                        barbeiro: tdProMap[o.professional_id] || 'Sem nome',
                        valor: `R$ ${parseFloat(o.total_amount || 0).toFixed(2).replace('.', ',')}`,
                    };
                });

                // --- DRILL-DOWN: Comandas Abertas (Detalhes) ---
                const { data: openOrdersDetail } = await supabase
                    .from('orders')
                    .select('id, total_amount, created_at, client_id, professional_id')
                    .eq('barbershop_id', bId)
                    .eq('status', 'open')
                    .order('created_at', { ascending: false });

                const ooClientIds = [...new Set((openOrdersDetail || []).map(o => o.client_id).filter(Boolean))];
                const ooProIds = [...new Set((openOrdersDetail || []).map(o => o.professional_id).filter(Boolean))];
                let ooClientMap = {}, ooProMap = {};
                if (ooClientIds.length > 0) {
                    const { data: c } = await supabase.from('clients').select('id, name').in('id', ooClientIds);
                    (c || []).forEach(x => { ooClientMap[x.id] = x.name; });
                }
                if (ooProIds.length > 0) {
                    const { data: p } = await supabase.from('profiles').select('id, name').in('id', ooProIds);
                    (p || []).forEach(x => { ooProMap[x.id] = x.name; });
                }
                const detalheComandasAbertas = (openOrdersDetail || []).map(o => {
                    const d = new Date(o.created_at);
                    return {
                        _id: o.id,
                        hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                        cliente: ooClientMap[o.client_id] || 'Sem nome',
                        barbeiro: ooProMap[o.professional_id] || 'Sem nome',
                        valor: `R$ ${parseFloat(o.total_amount || 0).toFixed(2).replace('.', ',')}`,
                    };
                });

                // --- NOVO: MRR (Receita Recorrente Mensal) ---
                const { data: activePlans } = await supabase
                    .from('subscriptions')
                    .select('price')
                    .eq('barbershop_id', bId)
                    .eq('status', 'active');

                const mrr = (activePlans || []).reduce(
                    (sum, s) => sum + parseFloat(s.price || 0), 0
                );
                const activeSubsCount = (activePlans || []).length;

                // --- Faturamento do Mês (UTC ISO — same approach as day query) ---
                const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
                const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
                const startOfMonthISO = startOfMonth.toISOString();
                const endOfMonthISO = endOfMonth.toISOString();

                const { data: monthOrders } = await supabase
                    .from('orders')
                    .select('total_amount')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed')
                    .gte('closed_at', startOfMonthISO)
                    .lte('closed_at', endOfMonthISO);

                const faturamentoMes = (monthOrders || []).reduce(
                    (sum, o) => sum + parseFloat(o.total_amount || 0), 0
                );

                // --- DRILL-DOWN: Conversão do Mês (todos os agendamentos do mês) ---
                const { data: allMonthOrders } = await supabase
                    .from('orders')
                    .select('total_amount, created_at, status, client_id, professional_id')
                    .eq('barbershop_id', bId)
                    .gte('created_at', startOfMonthISO)
                    .lte('created_at', endOfMonthISO)
                    .order('created_at', { ascending: false });

                const cmClientIds = [...new Set((allMonthOrders || []).map(o => o.client_id).filter(Boolean))];
                const cmProIds = [...new Set((allMonthOrders || []).map(o => o.professional_id).filter(Boolean))];
                let cmClientMap = {}, cmProMap = {};
                if (cmClientIds.length > 0) {
                    const { data: c } = await supabase.from('clients').select('id, name').in('id', cmClientIds);
                    (c || []).forEach(x => { cmClientMap[x.id] = x.name; });
                }
                if (cmProIds.length > 0) {
                    const { data: p } = await supabase.from('profiles').select('id, name').in('id', cmProIds);
                    (p || []).forEach(x => { cmProMap[x.id] = x.name; });
                }
                const statusLabels = { closed: 'Fechado', open: 'Aberto', scheduled: 'Agendado', 'no-show': 'No-show', canceled: 'Cancelado' };
                const detalheConversaoMes = (allMonthOrders || []).map(o => {
                    const d = new Date(o.created_at);
                    return {
                        data: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                        cliente: cmClientMap[o.client_id] || 'Sem nome',
                        barbeiro: cmProMap[o.professional_id] || 'Sem nome',
                        status: statusLabels[o.status] || o.status,
                        valor: `R$ ${parseFloat(o.total_amount || 0).toFixed(2).replace('.', ',')}`,
                    };
                });

                // --- DRILL-DOWN: Meta do Mês (faturamento por dia) ---
                const { data: monthClosedDetail } = await supabase
                    .from('orders')
                    .select('total_amount, closed_at')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed')
                    .gte('closed_at', startOfMonthISO)
                    .lte('closed_at', endOfMonthISO)
                    .order('closed_at', { ascending: true });

                const dailyMap = {};
                (monthClosedDetail || []).forEach(o => {
                    if (!o.closed_at) return;
                    const dayKey = o.closed_at.split('T')[0];
                    if (!dailyMap[dayKey]) dailyMap[dayKey] = 0;
                    dailyMap[dayKey] += parseFloat(o.total_amount || 0);
                });
                const detalheMetaMes = Object.entries(dailyMap).map(([dayKey, total]) => {
                    const d = new Date(dayKey + 'T12:00:00');
                    return {
                        dia: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
                        faturamento: `R$ ${total.toFixed(2).replace('.', ',')}`,
                    };
                });

                // --- NOVO: Ticket Médio ---
                const { data: allClosedForAvg } = await supabase
                    .from('orders')
                    .select('total_amount')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed');

                const closedCount = (allClosedForAvg || []).length;
                const closedSum = (allClosedForAvg || []).reduce(
                    (sum, o) => sum + parseFloat(o.total_amount || 0), 0
                );
                const ticketMedio = closedCount > 0 ? closedSum / closedCount : 0;

                // --- Faturamento últimos 7 dias (dinâmico, timezone-safe) ---
                const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                const last7DaysWindow = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    const dateKey = localDate(d);
                    last7DaysWindow.push({
                        dateKey,
                        label: i === 0 ? 'Hoje' : dayLabels[d.getDay()],
                        value: 0,
                    });
                }

                const sevenDaysAgo = last7DaysWindow[0].dateKey;
                const { data: last7Orders } = await supabase
                    .from('orders')
                    .select('total_amount, closed_at')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed')
                    .gte('closed_at', sevenDaysAgo);

                (last7Orders || []).forEach(o => {
                    if (!o.closed_at) return;
                    const oDate = o.closed_at.split('T')[0];
                    const slot = last7DaysWindow.find(s => s.dateKey === oDate);
                    if (slot) slot.value += parseFloat(o.total_amount || 0);
                });

                const faturamento7Dias = last7DaysWindow.map(s => ({
                    day: s.label,
                    value: Math.round(s.value * 100) / 100,
                }));

                // --- PASSO 3: Origem de Agendamentos ---
                const [
                    { count: ordersTotal },
                    { count: ordersApp },
                    { count: ordersReception },
                ] = await Promise.all([
                    supabase
                        .from('orders')
                        .select('*', { count: 'exact', head: true })
                        .eq('barbershop_id', bId),
                    supabase
                        .from('orders')
                        .select('*', { count: 'exact', head: true })
                        .eq('barbershop_id', bId)
                        .eq('origin', 'app'),
                    supabase
                        .from('orders')
                        .select('*', { count: 'exact', head: true })
                        .eq('barbershop_id', bId)
                        .eq('origin', 'reception'),
                ]);

                const appPercent = ordersTotal > 0 ? ((ordersApp / ordersTotal) * 100).toFixed(2) : '0.00';
                const receptionPercent = ordersTotal > 0 ? ((ordersReception / ordersTotal) * 100).toFixed(2) : '0.00';

                // --- PASSO 4: Contratos (usando next_billing_date) ---
                const [
                    { count: expiringContracts },
                    { count: pendingContracts },
                ] = await Promise.all([
                    supabase
                        .from('subscriptions')
                        .select('*', { count: 'exact', head: true })
                        .eq('barbershop_id', bId)
                        .eq('status', 'active')
                        .gte('next_billing_date', todayISO)
                        .lte('next_billing_date', in30DaysISO),
                    supabase
                        .from('subscriptions')
                        .select('*', { count: 'exact', head: true })
                        .eq('barbershop_id', bId)
                        .eq('status', 'pending'),
                ]);

                // --- RANKING DE BARBEIROS (UPGRADE: Ticket Médio + Qtd Serviços/Produtos) ---
                const { data: closedBarberOrders } = await supabase
                    .from('orders')
                    .select('id, professional_id, total_amount')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed');

                const barberOrderIds = (closedBarberOrders || []).map(o => o.id);
                let barberOrderItems = [];
                if (barberOrderIds.length > 0) {
                    const { data: bItems } = await supabase
                        .from('order_items')
                        .select('order_id, item_type, quantity')
                        .in('order_id', barberOrderIds);
                    barberOrderItems = bItems || [];
                }

                const bItemsByOrder = {};
                barberOrderItems.forEach(item => {
                    if (!bItemsByOrder[item.order_id]) bItemsByOrder[item.order_id] = [];
                    bItemsByOrder[item.order_id].push(item);
                });

                const barberMap = {};
                (closedBarberOrders || []).forEach((o) => {
                    const pId = o.professional_id;
                    if (!pId) return;
                    if (!barberMap[pId]) barberMap[pId] = { comandas: 0, faturamento: 0, servicos: 0, produtos: 0 };
                    barberMap[pId].comandas += 1;
                    barberMap[pId].faturamento += parseFloat(o.total_amount || 0);
                    (bItemsByOrder[o.id] || []).forEach(item => {
                        const qty = item.quantity || 1;
                        if (item.item_type === 'service') barberMap[pId].servicos += qty;
                        if (item.item_type === 'product') barberMap[pId].produtos += qty;
                    });
                });

                const barberIds = Object.keys(barberMap);
                let barberNameMap = {};
                if (barberIds.length > 0) {
                    const { data: barberProfiles } = await supabase
                        .from('profiles')
                        .select('id, name')
                        .in('id', barberIds);
                    (barberProfiles || []).forEach(p => { barberNameMap[p.id] = p.name; });
                }

                const rankingBarbeiros = Object.entries(barberMap)
                    .map(([pId, b]) => {
                        const ticketM = b.comandas > 0 ? b.faturamento / b.comandas : 0;
                        return {
                            barbeiro: barberNameMap[pId] || 'Sem nome',
                            ticketMedio: `R$ ${ticketM.toFixed(2).replace('.', ',')}`,
                            servicos: b.servicos,
                            produtos: b.produtos,
                            faturamento: `R$ ${b.faturamento.toFixed(2).replace('.', ',')}`,
                            _fat: b.faturamento,
                        };
                    })
                    .sort((a, b) => b._fat - a._fat);

                // --- PASSO 5: Top 5 clientes que mais compram ---
                let topClientes = [];
                try {
                    // Buscar orders com client_id
                    const { data: allOrders } = await supabase
                        .from('orders')
                        .select('id, total_amount, status, client_id')
                        .eq('barbershop_id', bId);

                    // Buscar order_items separadamente
                    const orderIds = (allOrders || []).map(o => o.id);
                    let allOrderItems = [];
                    if (orderIds.length > 0) {
                        const { data: items } = await supabase
                            .from('order_items')
                            .select('order_id, item_type, quantity, price')
                            .in('order_id', orderIds);
                        allOrderItems = items || [];
                    }

                    // Buscar nomes dos clientes
                    const uniqueClientIds = [...new Set((allOrders || []).map(o => o.client_id).filter(Boolean))];
                    let clientNameMap = {};
                    if (uniqueClientIds.length > 0) {
                        const { data: clientsData } = await supabase
                            .from('clients')
                            .select('id, name')
                            .in('id', uniqueClientIds);
                        (clientsData || []).forEach(c => { clientNameMap[c.id] = c.name; });
                    }

                    // Indexar order_items por order_id
                    const itemsByOrder = {};
                    allOrderItems.forEach(item => {
                        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
                        itemsByOrder[item.order_id].push(item);
                    });

                    // Agrupar por cliente
                    const clientMap = {};
                    (allOrders || []).forEach((order) => {
                        const cId = order.client_id;
                        if (!cId) return;
                        if (!clientMap[cId]) {
                            clientMap[cId] = {
                                nome: clientNameMap[cId] || 'Sem nome',
                                servicos: 0,
                                produtos: 0,
                                total: 0,
                            };
                        }
                        (itemsByOrder[order.id] || []).forEach((item) => {
                            const qty = item.quantity || 1;
                            if (item.item_type === 'service') clientMap[cId].servicos += qty;
                            if (item.item_type === 'product') clientMap[cId].produtos += qty;
                        });
                        if (order.status === 'closed') {
                            clientMap[cId].total += parseFloat(order.total_amount || 0);
                        }
                    });

                    // Verificar assinaturas ativas
                    const clientIds = Object.keys(clientMap);
                    let activeSubs = [];
                    if (clientIds.length > 0) {
                        const { data: subs } = await supabase
                            .from('subscriptions')
                            .select('client_id')
                            .eq('barbershop_id', bId)
                            .eq('status', 'active')
                            .in('client_id', clientIds);
                        activeSubs = (subs || []).map((s) => s.client_id);
                    }

                    topClientes = Object.entries(clientMap)
                        .map(([cId, c]) => ({
                            nome: c.nome,
                            servicos: c.servicos,
                            produtos: c.produtos,
                            assinatura: activeSubs.includes(cId) ? 'Sim' : 'Não',
                            total: `R$ ${c.total.toFixed(2).replace('.', ',')}`,
                        }))
                        .sort((a, b) => {
                            const valA = parseFloat(a.total.replace('R$ ', '').replace('.', '').replace(',', '.'));
                            const valB = parseFloat(b.total.replace('R$ ', '').replace('.', '').replace(',', '.'));
                            return valB - valA;
                        })
                        .slice(0, 5);
                } catch (_) {
                    // silently handled — topClientes stays []
                }

                // --- PASSO 6: Produtos com estoque mínimo ---
                // PostgREST não suporta comparação coluna-vs-coluna, buscar tudo e filtrar no JS
                const { data: allProducts } = await supabase
                    .from('products')
                    .select('name, min_stock, current_stock, branch_name')
                    .eq('barbershop_id', bId);

                const estoqueData = (allProducts || [])
                    .filter((p) => p.current_stock <= p.min_stock)
                    .map((p) => ({
                        produto: p.name,
                        min: p.min_stock,
                        atual: p.current_stock,
                        filial: p.branch_name,
                    }));

                // --- PASSO 7: Pagamentos incompletos (somente pending + error) ---
                const { data: incompleteSubs } = await supabase
                    .from('subscriptions')
                    .select('plan_name, status, client_id')
                    .eq('barbershop_id', bId)
                    .or('status.eq.pending,status.eq.error');

                // Buscar nomes dos clientes das assinaturas incompletas
                const incompleteClientIds = [...new Set((incompleteSubs || []).map(s => s.client_id).filter(Boolean))];
                let incompleteClientNames = {};
                if (incompleteClientIds.length > 0) {
                    const { data: cData } = await supabase
                        .from('clients')
                        .select('id, name')
                        .in('id', incompleteClientIds);
                    (cData || []).forEach(c => { incompleteClientNames[c.id] = c.name; });
                }

                const pagamentosIncompletos = (incompleteSubs || []).map((s) => ({
                    nome: incompleteClientNames[s.client_id] || 'Sem nome',
                    plano: s.plan_name || '—',
                    status: s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : '—',
                }));

                // --- PASSO 8: Aniversariantes (mês + semana) ---
                const currentMonth = today.getMonth() + 1; // 1-12
                const { data: allClients } = await supabase
                    .from('clients')
                    .select('name, birth_date, phone')
                    .eq('barbershop_id', bId)
                    .not('birth_date', 'is', null);

                // Helper: check if birthday (day/month) falls within next N days
                const isBirthdayInWindow = (birthDate, windowDays) => {
                    const bd = new Date(birthDate);
                    const bMonth = bd.getMonth();
                    const bDay = bd.getDate();
                    for (let i = 0; i <= windowDays; i++) {
                        const check = new Date(today);
                        check.setDate(check.getDate() + i);
                        if (check.getMonth() === bMonth && check.getDate() === bDay) return true;
                    }
                    return false;
                };

                // Clean phone for WhatsApp (remove non-digits)
                const cleanPhone = (phone) => (phone || '').replace(/\D/g, '');

                const aniversariantes = (allClients || [])
                    .filter((c) => {
                        if (!c.birth_date) return false;
                        const d = new Date(c.birth_date);
                        return d.getMonth() + 1 === currentMonth;
                    })
                    .map((c) => {
                        const d = new Date(c.birth_date);
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        return { nome: c.name, data: `${day}/${month}`, phone: c.phone || '' };
                    });

                // Aniversariantes da semana (próximos 7 dias)
                const aniversariantesSemana = (allClients || [])
                    .filter((c) => c.birth_date && isBirthdayInWindow(c.birth_date, 7))
                    .map((c) => {
                        const d = new Date(c.birth_date);
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const phoneClean = cleanPhone(c.phone);
                        return {
                            nome: c.name,
                            data: `${day}/${month}`,
                            whatsapp: phoneClean ? `https://wa.me/55${phoneClean}` : '',
                        };
                    });

                // --- PASSO 9: Clientes para recompra ---
                const { data: closedOrders } = await supabase
                    .from('orders')
                    .select('id, created_at, client_id')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed')
                    .order('created_at', { ascending: false });

                const recompraList = [];
                if (closedOrders && closedOrders.length > 0) {
                    const closedOrderIds = closedOrders.map(o => o.id);
                    const closedClientIds = [...new Set(closedOrders.map(o => o.client_id).filter(Boolean))];

                    // Buscar order_items do tipo product
                    const { data: productItems } = await supabase
                        .from('order_items')
                        .select('order_id, item_type, name')
                        .in('order_id', closedOrderIds)
                        .eq('item_type', 'product');

                    // Buscar nomes dos clientes
                    let recompraClientMap = {};
                    if (closedClientIds.length > 0) {
                        const { data: rcData } = await supabase
                            .from('clients')
                            .select('id, name, phone')
                            .in('id', closedClientIds);
                        (rcData || []).forEach(c => { recompraClientMap[c.id] = { name: c.name, phone: c.phone || '' }; });
                    }

                    // Map order_id -> order info
                    const orderMap = {};
                    closedOrders.forEach(o => { orderMap[o.id] = o; });

                    (productItems || []).forEach((item) => {
                        const order = orderMap[item.order_id];
                        if (!order) return;
                        const d = new Date(order.created_at);
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const year = d.getFullYear();
                        const clientInfo = recompraClientMap[order.client_id] || { name: 'Sem nome', phone: '' };
                        recompraList.push({
                            nome: clientInfo.name,
                            produto: item.name,
                            data: `${day}/${month}/${year}`,
                            phone: clientInfo.phone,
                        });
                    });
                }

                // --- Produtos Mais Vendidos (filtrado por barbershop via orders) ---
                const allShopOrderIds = (closedBarberOrders || []).map(o => o.id);
                let allSoldItems = [];
                if (allShopOrderIds.length > 0) {
                    const { data: soldItems } = await supabase
                        .from('order_items')
                        .select('name, quantity, item_type')
                        .in('order_id', allShopOrderIds);
                    allSoldItems = soldItems || [];
                }

                const productSalesMap = {};
                allSoldItems.forEach((item) => {
                    if (item.item_type === 'product') {
                        if (!productSalesMap[item.name]) productSalesMap[item.name] = 0;
                        productSalesMap[item.name] += item.quantity || 1;
                    }
                });

                const produtosMaisVendidos = Object.entries(productSalesMap)
                    .map(([nome, qty]) => ({ produto: nome, qtd: qty }))
                    .sort((a, b) => b.qtd - a.qtd);

                // --- 🔥 CRM INTELIGENTE: Clientes com Risco de Evasão ---
                const { data: crmOrders } = await supabase
                    .from('orders')
                    .select('client_id, scheduled_at')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed')
                    .order('scheduled_at', { ascending: true });

                // Buscar nomes e telefones de todos os clientes envolvidos
                const crmClientIds = [...new Set((crmOrders || []).map(o => o.client_id).filter(Boolean))];
                let crmClientMap = {};
                if (crmClientIds.length > 0) {
                    const { data: crmClients } = await supabase
                        .from('clients')
                        .select('id, name, phone')
                        .in('id', crmClientIds);
                    (crmClients || []).forEach(c => { crmClientMap[c.id] = { name: c.name, phone: c.phone || '' }; });
                }

                // Agrupar visitas por cliente
                const visitsByClient = {};
                (crmOrders || []).forEach(o => {
                    if (!o.client_id || !o.scheduled_at) return;
                    if (!visitsByClient[o.client_id]) visitsByClient[o.client_id] = [];
                    visitsByClient[o.client_id].push(new Date(o.scheduled_at));
                });

                const clientesEvasao = [];
                const nowMs = today.getTime();

                Object.entries(visitsByClient).forEach(([cId, visits]) => {
                    if (visits.length < 2) return; // precisa de 2+ visitas
                    visits.sort((a, b) => a - b);

                    // Calcular intervalos em dias
                    const intervals = [];
                    for (let i = 1; i < visits.length; i++) {
                        intervals.push((visits[i] - visits[i - 1]) / (1000 * 60 * 60 * 24));
                    }
                    const avgDays = intervals.reduce((s, v) => s + v, 0) / intervals.length;
                    const lastVisit = visits[visits.length - 1];
                    const daysSinceLast = Math.floor((nowMs - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
                    const threshold = avgDays * 1.2;

                    if (daysSinceLast > threshold) {
                        const info = crmClientMap[cId] || { name: 'Sem nome', phone: '' };
                        const atraso = Math.floor(daysSinceLast - avgDays);
                        clientesEvasao.push({
                            nome: info.name,
                            mediaRetorno: Math.round(avgDays),
                            diasUltimaVisita: daysSinceLast,
                            status: `Atrasado há ${atraso} dias`,
                            phone: info.phone,
                        });
                    }
                });

                clientesEvasao.sort((a, b) => b.diasUltimaVisita - a.diasUltimaVisita);

                // --- 🔥 FUNIL DE AGENDAMENTOS (mês atual — por scheduled_at) ---
                const { data: allFunnelOrders } = await supabase
                    .from('orders')
                    .select('status, client_id, professional_id, scheduled_at')
                    .eq('barbershop_id', bId)
                    .gte('scheduled_at', startOfMonthISO)
                    .lte('scheduled_at', endOfMonthISO);

                const funnelTotal = (allFunnelOrders || []).length;
                let funnelClosed = 0, funnelNoShow = 0, funnelCanceled = 0, funnelScheduled = 0, funnelOpen = 0;
                const noShowOrders = [], canceledOrders = [];
                (allFunnelOrders || []).forEach(o => {
                    if (o.status === 'closed') funnelClosed++;
                    else if (o.status === 'no-show') { funnelNoShow++; noShowOrders.push(o); }
                    else if (o.status === 'canceled') { funnelCanceled++; canceledOrders.push(o); }
                    else if (o.status === 'scheduled') funnelScheduled++;
                    else if (o.status === 'open') funnelOpen++;
                });

                // Resolve names for no-show/canceled detail lists
                const detailClientIds = [...new Set([...noShowOrders, ...canceledOrders].map(o => o.client_id).filter(Boolean))];
                const detailProIds = [...new Set([...noShowOrders, ...canceledOrders].map(o => o.professional_id).filter(Boolean))];
                let detailClientMap = {}, detailProMap = {};
                if (detailClientIds.length > 0) {
                    const { data: dc } = await supabase.from('clients').select('id, name').in('id', detailClientIds);
                    (dc || []).forEach(c => { detailClientMap[c.id] = c.name; });
                }
                if (detailProIds.length > 0) {
                    const { data: dp } = await supabase.from('profiles').select('id, name').in('id', detailProIds);
                    (dp || []).forEach(p => { detailProMap[p.id] = p.name; });
                }

                const enrichDetail = (arr) => arr.map(o => {
                    const d = o.scheduled_at ? new Date(o.scheduled_at) : null;
                    return {
                        cliente: detailClientMap[o.client_id] || 'Cliente Avulso',
                        profissional: detailProMap[o.professional_id] || 'Sem nome',
                        horario: d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—',
                        data: d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : '—',
                    };
                });

                const listaNaoCompareceuHoje = enrichDetail(noShowOrders);
                const listaCanceladosHoje = enrichDetail(canceledOrders);

                const funnel = {
                    total: funnelTotal,
                    conversao: funnelTotal > 0 ? ((funnelClosed / funnelTotal) * 100).toFixed(1) : '0.0',
                    noShow: funnelTotal > 0 ? ((funnelNoShow / funnelTotal) * 100).toFixed(1) : '0.0',
                    cancelamento: funnelTotal > 0 ? ((funnelCanceled / funnelTotal) * 100).toFixed(1) : '0.0',
                    scheduled: funnelScheduled,
                    closed: funnelClosed,
                    noShowCount: funnelNoShow,
                    canceledCount: funnelCanceled,
                    listaNaoCompareceuHoje,
                    listaCanceladosHoje,
                };

                // --- NOVO: Próximos Atendimentos por Profissional ---
                const nowISO = today.toISOString();
                const { data: upcomingOrders } = await supabase
                    .from('orders')
                    .select('professional_id, scheduled_at, client_id')
                    .eq('barbershop_id', bId)
                    .or('status.eq.open,status.eq.scheduled')
                    .gte('scheduled_at', nowISO)
                    .order('scheduled_at', { ascending: true });

                // Keep only the first (nearest) appointment per professional
                const seenPros = new Set();
                const uniqueUpcoming = [];
                (upcomingOrders || []).forEach(o => {
                    if (!o.professional_id || seenPros.has(o.professional_id)) return;
                    seenPros.add(o.professional_id);
                    uniqueUpcoming.push(o);
                });

                const proIds = uniqueUpcoming.map(o => o.professional_id);
                const upClientIds = [...new Set(uniqueUpcoming.map(o => o.client_id).filter(Boolean))];
                let proNameMap = {}, upClientMap = {};
                if (proIds.length > 0) {
                    const { data: proProfiles } = await supabase
                        .from('profiles')
                        .select('id, name')
                        .in('id', proIds);
                    (proProfiles || []).forEach(p => { proNameMap[p.id] = p.name; });
                }
                if (upClientIds.length > 0) {
                    const { data: upClients } = await supabase
                        .from('clients')
                        .select('id, name')
                        .in('id', upClientIds);
                    (upClients || []).forEach(c => { upClientMap[c.id] = c.name; });
                }

                const proximosAtendimentos = uniqueUpcoming
                    .slice(0, 4)
                    .map(o => {
                        const d = new Date(o.scheduled_at);
                        const barberName = proNameMap[o.professional_id] || 'Sem nome';
                        return {
                            nome: barberName,
                            initials: barberName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase(),
                            cliente: upClientMap[o.client_id] || 'Sem nome',
                            hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                        };
                    });

                // --- NOVO: Contratos a vencer (detalhe para Drawer) ---
                const { data: contratosVencendoData } = await supabase
                    .from('subscriptions')
                    .select('client_id, plan_name, next_billing_date')
                    .eq('barbershop_id', bId)
                    .eq('status', 'active')
                    .gte('next_billing_date', todayISO)
                    .lte('next_billing_date', in30DaysISO);

                const cvClientIds = [...new Set((contratosVencendoData || []).map(s => s.client_id).filter(Boolean))];
                let cvClientNames = {};
                if (cvClientIds.length > 0) {
                    const { data: cvClients } = await supabase
                        .from('clients')
                        .select('id, name')
                        .in('id', cvClientIds);
                    (cvClients || []).forEach(c => { cvClientNames[c.id] = c.name; });
                }

                const contratosVencendo = (contratosVencendoData || []).map(s => ({
                    nome: cvClientNames[s.client_id] || 'Sem nome',
                    plano: s.plan_name,
                    vence: s.next_billing_date ? new Date(s.next_billing_date).toLocaleDateString('pt-BR') : '—',
                }));

                // --- Montar resultado final ---
                setData({
                    adminName,
                    adminInitials,
                    kpis: {
                        barbers: barbersCount || 0,
                        openOrders: openOrdersCount || 0,
                        clients: clientsCount || 0,
                        errorSubs: errorSubsCount || 0,
                        faturamentoDia,
                        faturamentoMes,
                        ticketMedio,
                        activeSubsCount,
                        mrr,
                    },
                    origins: {
                        total: ordersTotal || 0,
                        app: ordersApp || 0,
                        appPercent,
                        reception: ordersReception || 0,
                        receptionPercent,
                    },
                    contracts: {
                        expiring: expiringContracts || 0,
                        pending: pendingContracts || 0,
                    },
                    funnel,
                    clientesEvasao,
                    rankingBarbeiros,
                    topClientes,
                    estoqueData,
                    pagamentosIncompletos,
                    aniversariantes,
                    aniversariantesSemana,
                    recompraList,
                    produtosMaisVendidos,
                    proximosAtendimentos,
                    contratosVencendo,
                    faturamento7Dias,
                    detalheFaturamentoHoje,
                    detalheComandasAbertas,
                    detalheConversaoMes,
                    detalheMetaMes,
                });
            } catch (err) {
                console.error('Erro ao buscar dados do dashboard:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchAll();
    }, [location.pathname, refetchKey]);

    return { loading, data };
}
