import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function useDashboardData() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [refetchKey, setRefetchKey] = useState(0);
    const location = useLocation();

    // Re-fetch when window regains focus
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
                    .limit(1)
                    .single();

                if (!shop) {
                    console.error('Nenhuma barbearia encontrada.');
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
                const adminInitials = nameParts.length >= 2
                    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
                    : adminName.substring(0, 2).toUpperCase();

                // --- PASSO 2: KPI Cards (counts) ---
                const [
                    { count: barbersCount },
                    { count: clientsCount },
                    { count: errorSubsCount },
                ] = await Promise.all([
                    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('barbershop_id', bId).eq('role', 'barber'),
                    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('barbershop_id', bId),
                    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('barbershop_id', bId).eq('status', 'error'),
                ]);

                // --- Variáveis de data ---
                const today = new Date();
                const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                const startOfDayISO = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString();
                const endOfDayISO = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

                const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
                const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
                const startOfMonthISO = startOfMonth.toISOString();
                const endOfMonthISO = endOfMonth.toISOString();

                const todayISO = localDate(today);
                const in30Days = new Date(today);
                in30Days.setDate(in30Days.getDate() + 30);
                const in30DaysISO = localDate(in30Days);

                // --- REFATORAÇÃO: O CÉREBRO DO DASHBOARD ---
                // Busca TODOS os agendamentos agendados para este mês
                const { data: rawOrdersData } = await supabase
                    .from('orders')
                    .select('*, professionals(name), clients(name, phone)')
                    .eq('barbershop_id', bId)
                    .gte('scheduled_at', startOfMonthISO)
                    .lte('scheduled_at', endOfMonthISO);

                // Busca TODOS os agendamentos FECHADOS hoje (para faturamento bater com Financeiro)
                const { data: fechadosHojeData } = await supabase
                    .from('orders')
                    .select('id, total_amount, closed_at, professionals(name), clients(name)')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed')
                    .gte('closed_at', startOfDayISO)
                    .lte('closed_at', endOfDayISO);

                const allOrdersRaw = rawOrdersData || [];

                let openOrdersCount = 0;
                let faturamentoDia = 0;
                let faturamentoMes = 0;
                let atendimentosHojeClosed = 0;
                let atendimentosHojeTotal = 0;

                let ordersTotal = 0;
                let ordersApp = 0;
                let ordersReception = 0;

                let funnelTotal = 0;
                let funnelClosed = 0;
                let funnelNoShow = 0;
                let funnelCanceled = 0;
                let funnelScheduled = 0;
                let funnelOpen = 0;

                const detalheFaturamentoHoje = [];
                const detalheComandasAbertas = [];
                const detalheConversaoMes = [];
                const dailyMetaMap = {};

                const noShowOrdersToday = [];
                const canceledOrdersToday = [];
                const proximosAtendimentos = [];
                const last7DaysData = {}; // Para faturamento 7 dias
                const nowMs = today.getTime();

                allOrdersRaw.forEach(o => {
                    const status = o.status;
                    const amount = parseFloat(o.total_amount || 0);

                    // REGRA DE HOJE: comparar scheduled_at com data de hoje usando toLocaleDateString
                    const isHoje = o.scheduled_at && new Date(o.scheduled_at).toLocaleDateString('pt-BR') === today.toLocaleDateString('pt-BR');

                    const isScheduledThisMonth = true; // A query já filtrou pelo mês em scheduled_at
                    const isScheduledToday = isHoje;

                    const isClosedThisMonth = status === 'closed';
                    const isClosedToday = status === 'closed' && isHoje;

                    const isCreatedThisMonth = o.created_at && o.created_at >= startOfMonthISO && o.created_at <= endOfMonthISO;

                    // 1. Atendimentos Hoje (Progresso)
                    if (isClosedToday) {
                        atendimentosHojeClosed++;
                    }

                    if (isScheduledToday && ['scheduled', 'confirmed', 'open', 'closed'].includes(status)) {
                        atendimentosHojeTotal++;
                    }

                    // 2. Comandas Abertas (globais, independentes do mês)
                    if (status === 'open') {
                        openOrdersCount++;
                        const d = o.scheduled_at ? new Date(o.scheduled_at) : new Date(o.created_at);
                        detalheComandasAbertas.push({
                            _id: o.id,
                            hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                            cliente: o.clients?.name || 'Cliente Avulso',
                            barbeiro: o.professionals?.name || 'Sem Barbeiro',
                            valor: `R$ ${amount.toFixed(2).replace('.', ',')}`,
                            created_at: o.created_at
                        });
                    }

                    // 3. Faturamento Mês e Meta
                    if (isClosedThisMonth) {
                        faturamentoMes += amount;
                        if (o.scheduled_at) {
                            const dayKey = o.scheduled_at.split('T')[0];
                            if (!dailyMetaMap[dayKey]) dailyMetaMap[dayKey] = 0;
                            dailyMetaMap[dayKey] += amount;
                        }
                    }

                    // Faturamento 7 dias
                    if (status === 'closed' && o.scheduled_at) {
                        const closedDateKey = o.scheduled_at.split('T')[0];
                        if (!last7DaysData[closedDateKey]) last7DaysData[closedDateKey] = 0;
                        last7DaysData[closedDateKey] += amount;
                    }

                    // 4. Origens (criados neste mês)
                    if (isCreatedThisMonth) {
                        ordersTotal++;
                        if (o.origin === 'app') ordersApp++;
                        if (o.origin === 'reception') ordersReception++;
                    }

                    // 5. Funil (Agendados neste mês)
                    if (isScheduledThisMonth) {
                        funnelTotal++;
                        if (status === 'closed') funnelClosed++;
                        else if (status === 'no_show' || status === 'no-show') funnelNoShow++;
                        else if (status === 'canceled') funnelCanceled++;
                        else if (status === 'scheduled') funnelScheduled++;
                        else if (status === 'open') funnelOpen++;

                        const d = new Date(o.created_at || o.scheduled_at);
                        const statusLabels = { closed: 'Fechado', open: 'Aberto', scheduled: 'Agendado', 'no_show': 'No-show', canceled: 'Cancelado' };
                        detalheConversaoMes.push({
                            data: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                            cliente: o.clients?.name || 'Cliente Avulso',
                            barbeiro: o.professionals?.name || 'Sem Barbeiro',
                            status: statusLabels[status] || status,
                            valor: `R$ ${amount.toFixed(2).replace('.', ',')}`,
                            created_at: o.created_at
                        });
                    }

                    // Modal "Não Compareceu" / Cancelados DE HOJE ESTITAMENTE
                    if (isScheduledToday) {
                        if (status === 'no_show' || status === 'no-show') noShowOrdersToday.push(o);
                        if (status === 'canceled') canceledOrdersToday.push(o);

                        // 6. Próximos Atendimentos (hoje, no futuro - TIME AWARE)
                        // A fila de próximos: status 'scheduled', agendamento de hoje, horário maior que agora.
                        if (status === 'scheduled' && o.scheduled_at) {
                            const schedTime = new Date(o.scheduled_at).getTime();
                            if (schedTime > nowMs) {
                                const d2 = new Date(o.scheduled_at);
                                const bName = o.professionals?.name || 'Sem Nome';
                                const initials = bName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                                proximosAtendimentos.push({
                                    _id: o.id,
                                    orderInfo: { ...o, client_name: o.clients?.name, professional_name: bName },
                                    nome: bName,
                                    initials,
                                    cliente: o.clients?.name || 'Avulso',
                                    hora: `${String(d2.getHours()).padStart(2, '0')}:${String(d2.getMinutes()).padStart(2, '0')}`,
                                    scheduled_at: o.scheduled_at // sort key
                                });
                            }
                        }
                    }
                });

                // Atualizar Faturamento Real de Hoje
                (fechadosHojeData || []).forEach(o => {
                    const amount = parseFloat(o.total_amount || 0);
                    faturamentoDia += amount;
                    const d = new Date(o.closed_at);
                    detalheFaturamentoHoje.push({
                        hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                        cliente: o.clients?.name || 'Cliente Avulso',
                        barbeiro: o.professionals?.name || 'Sem Barbeiro',
                        valor: `R$ ${amount.toFixed(2).replace('.', ',')}`,
                    });
                });

                // Ordenações
                detalheFaturamentoHoje.sort((a, b) => a.hora.localeCompare(b.hora));
                detalheComandasAbertas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                detalheConversaoMes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                proximosAtendimentos.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

                // Meta Mensal Map
                const detalheMetaMes = Object.entries(dailyMetaMap).map(([dayKey, total]) => {
                    const d = new Date(dayKey + 'T12:00:00');
                    return {
                        dia: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
                        faturamento: `R$ ${total.toFixed(2).replace('.', ',')}`,
                    };
                }).sort((a, b) => a.dia.localeCompare(b.dia));

                // Helper Funnel Detail
                const enrichDetail = (arr) => arr.map(o => {
                    const d = o.scheduled_at ? new Date(o.scheduled_at) : null;
                    return {
                        id: o.id,
                        orderInfo: { ...o, client_name: o.clients?.name, professional_name: o.profiles?.name },
                        cliente: o.clients?.name || 'Cliente Avulso',
                        profissional: o.profiles?.name || 'Sem nome',
                        horario: d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—',
                        data: d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : '—',
                    };
                });

                const listaNaoCompareceuHoje = enrichDetail(noShowOrdersToday);
                const listaCanceladosHoje = enrichDetail(canceledOrdersToday);

                const funnel = {
                    total: funnelTotal,
                    conversao: funnelTotal > 0 ? ((funnelClosed / funnelTotal) * 100).toFixed(1) : '0.0',
                    noShow: funnelTotal > 0 ? ((funnelNoShow / funnelTotal) * 100).toFixed(1) : '0.0',
                    cancelamento: funnelTotal > 0 ? ((funnelCanceled / funnelTotal) * 100).toFixed(1) : '0.0',
                    scheduled: funnelScheduled,
                    closed: funnelClosed,
                    noShowCount: noShowOrdersToday.length, // Estritamente Hoje!
                    canceledCount: canceledOrdersToday.length, // Estritamente Hoje!
                    listaNaoCompareceuHoje,
                    listaCanceladosHoje,
                };

                const appPercent = ordersTotal > 0 ? ((ordersApp / ordersTotal) * 100).toFixed(2) : '0.00';
                const receptionPercent = ordersTotal > 0 ? ((ordersReception / ordersTotal) * 100).toFixed(2) : '0.00';

                // Faturamento últimos 7 dias (limpo)
                const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                const faturamento7Dias = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    const dateKey = localDate(d);
                    const val = last7DaysData[dateKey] || 0;
                    faturamento7Dias.push({
                        dateKey,
                        day: i === 0 ? 'Hoje' : dayLabels[d.getDay()],
                        value: Math.round(val * 100) / 100,
                    });
                }

                // --- OUTRAS QUERIES (Mantidas iguais p não quebrar) ---

                // NOVO: Ticket Médio (All Time Close)
                const { data: allClosedForAvg } = await supabase
                    .from('orders')
                    .select('total_amount')
                    .eq('barbershop_id', bId)
                    .eq('status', 'closed');

                const closedCount = (allClosedForAvg || []).length;
                const closedSum = (allClosedForAvg || []).reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
                const ticketMedio = closedCount > 0 ? closedSum / closedCount : 0;

                // MRR
                const { data: activePlans } = await supabase.from('subscriptions').select('price').eq('barbershop_id', bId).eq('status', 'active');
                const mrr = (activePlans || []).reduce((sum, s) => sum + parseFloat(s.price || 0), 0);
                const activeSubsCount = (activePlans || []).length;

                // Contratos
                const [{ count: expiringContracts }, { count: pendingContracts }] = await Promise.all([
                    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('barbershop_id', bId).eq('status', 'active').gte('next_billing_date', todayISO).lte('next_billing_date', in30DaysISO),
                    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('barbershop_id', bId).eq('status', 'pending'),
                ]);

                // RANKING DE BARBEIROS
                const { data: closedBarberOrders } = await supabase.from('orders').select('id, professional_id, total_amount').eq('barbershop_id', bId).eq('status', 'closed');
                const barberOrderIds = (closedBarberOrders || []).map(o => o.id);
                let barberOrderItems = [];
                if (barberOrderIds.length > 0) {
                    const { data: bItems } = await supabase.from('order_items').select('order_id, item_type, quantity').in('order_id', barberOrderIds);
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
                    const { data: barberProfiles } = await supabase.from('profiles').select('id, name').in('id', barberIds);
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
                    }).sort((a, b) => b._fat - a._fat);

                // Top 5 clientes
                let topClientes = [];
                try {
                    const { data: allOrdersForClients } = await supabase.from('orders').select('id, total_amount, status, client_id').eq('barbershop_id', bId);
                    const orderIds = (allOrdersForClients || []).map(o => o.id);
                    let allOrderItems = [];
                    if (orderIds.length > 0) {
                        const { data: items } = await supabase.from('order_items').select('order_id, item_type, quantity, price').in('order_id', orderIds);
                        allOrderItems = items || [];
                    }
                    const uniqueClientIds = [...new Set((allOrdersForClients || []).map(o => o.client_id).filter(Boolean))];
                    let clientNameMap = {};
                    if (uniqueClientIds.length > 0) {
                        const { data: clientsData } = await supabase.from('clients').select('id, name').in('id', uniqueClientIds);
                        (clientsData || []).forEach(c => { clientNameMap[c.id] = c.name; });
                    }
                    const itemsByOrder = {};
                    allOrderItems.forEach(item => {
                        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
                        itemsByOrder[item.order_id].push(item);
                    });
                    const clientMap = {};
                    (allOrdersForClients || []).forEach((order) => {
                        const cId = order.client_id;
                        if (!cId) return;
                        if (!clientMap[cId]) clientMap[cId] = { nome: clientNameMap[cId] || 'Sem nome', servicos: 0, produtos: 0, total: 0 };
                        (itemsByOrder[order.id] || []).forEach((item) => {
                            const qty = item.quantity || 1;
                            if (item.item_type === 'service') clientMap[cId].servicos += qty;
                            if (item.item_type === 'product') clientMap[cId].produtos += qty;
                        });
                        if (order.status === 'closed') clientMap[cId].total += parseFloat(order.total_amount || 0);
                    });

                    const clientIds = Object.keys(clientMap);
                    let activeSubs = [];
                    if (clientIds.length > 0) {
                        const { data: subs } = await supabase.from('subscriptions').select('client_id').eq('barbershop_id', bId).eq('status', 'active').in('client_id', clientIds);
                        activeSubs = (subs || []).map((s) => s.client_id);
                    }
                    topClientes = Object.entries(clientMap).map(([cId, c]) => ({
                        nome: c.nome, servicos: c.servicos, produtos: c.produtos, assinatura: activeSubs.includes(cId) ? 'Sim' : 'Não', total: `R$ ${c.total.toFixed(2).replace('.', ',')}`
                    })).sort((a, b) => {
                        const valA = parseFloat(a.total.replace('R$ ', '').replace('.', '').replace(',', '.'));
                        const valB = parseFloat(b.total.replace('R$ ', '').replace('.', '').replace(',', '.'));
                        return valB - valA;
                    }).slice(0, 5);
                } catch (_) { }

                // Produtos com estoque mínimo
                const { data: allProducts } = await supabase.from('products').select('name, min_stock, current_stock, branch_name').eq('barbershop_id', bId);
                const estoqueData = (allProducts || []).filter((p) => p.current_stock <= p.min_stock).map((p) => ({ produto: p.name, min: p.min_stock, atual: p.current_stock, filial: p.branch_name }));

                // Pagamentos incompletos
                const { data: incompleteSubs } = await supabase.from('subscriptions').select('plan_name, status, client_id').eq('barbershop_id', bId).or('status.eq.pending,status.eq.error');
                const incompleteClientIds = [...new Set((incompleteSubs || []).map(s => s.client_id).filter(Boolean))];
                let incompleteClientNames = {};
                if (incompleteClientIds.length > 0) {
                    const { data: cData } = await supabase.from('clients').select('id, name').in('id', incompleteClientIds);
                    (cData || []).forEach(c => { incompleteClientNames[c.id] = c.name; });
                }
                const pagamentosIncompletos = (incompleteSubs || []).map((s) => ({ nome: incompleteClientNames[s.client_id] || 'Sem nome', plano: s.plan_name || '—', status: s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : '—' }));

                // Aniversariantes
                const currentMonth = today.getMonth() + 1;
                const { data: allClients } = await supabase.from('clients').select('name, birth_date, phone').eq('barbershop_id', bId).not('birth_date', 'is', null);
                const isBirthdayInWindow = (birthDate, windowDays) => {
                    const bd = new Date(birthDate);
                    const bMonth = bd.getMonth(), bDay = bd.getDate();
                    for (let i = 0; i <= windowDays; i++) {
                        const check = new Date(today);
                        check.setDate(check.getDate() + i);
                        if (check.getMonth() === bMonth && check.getDate() === bDay) return true;
                    }
                    return false;
                };
                const cleanPhone = (phone) => (phone || '').replace(/\D/g, '');
                const aniversariantes = (allClients || []).filter((c) => {
                    if (!c.birth_date) return false;
                    const d = new Date(c.birth_date);
                    return d.getMonth() + 1 === currentMonth;
                }).map((c) => {
                    const d = new Date(c.birth_date);
                    return { nome: c.name, data: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, phone: c.phone || '' };
                });
                const aniversariantesSemana = (allClients || []).filter((c) => c.birth_date && isBirthdayInWindow(c.birth_date, 7)).map((c) => {
                    const d = new Date(c.birth_date);
                    const phoneClean = cleanPhone(c.phone);
                    return { nome: c.name, data: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, whatsapp: phoneClean ? `https://wa.me/55${phoneClean}` : '' };
                });

                // Clientes para recompra
                const { data: closedOrders } = await supabase.from('orders').select('id, created_at, client_id').eq('barbershop_id', bId).eq('status', 'closed').order('created_at', { ascending: false });
                const recompraList = [];
                if (closedOrders && closedOrders.length > 0) {
                    const closedOrderIds = closedOrders.map(o => o.id);
                    const closedClientIds = [...new Set(closedOrders.map(o => o.client_id).filter(Boolean))];
                    const { data: productItems } = await supabase.from('order_items').select('order_id, item_type, name').in('order_id', closedOrderIds).eq('item_type', 'product');
                    let recompraClientMap = {};
                    if (closedClientIds.length > 0) {
                        const { data: rcData } = await supabase.from('clients').select('id, name, phone').in('id', closedClientIds);
                        (rcData || []).forEach(c => { recompraClientMap[c.id] = { name: c.name, phone: c.phone || '' }; });
                    }
                    const orderMap = {};
                    closedOrders.forEach(o => { orderMap[o.id] = o; });
                    (productItems || []).forEach((item) => {
                        const order = orderMap[item.order_id];
                        if (!order) return;
                        const d = new Date(order.created_at);
                        const clientInfo = recompraClientMap[order.client_id] || { name: 'Sem nome', phone: '' };
                        recompraList.push({ nome: clientInfo.name, produto: item.name, data: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, phone: clientInfo.phone });
                    });
                }

                // Produtos Mais Vendidos
                const allShopOrderIds = (closedBarberOrders || []).map(o => o.id);
                let allSoldItems = [];
                if (allShopOrderIds.length > 0) {
                    const { data: soldItems } = await supabase.from('order_items').select('name, quantity, item_type').in('order_id', allShopOrderIds);
                    allSoldItems = soldItems || [];
                }
                const productSalesMap = {};
                allSoldItems.forEach((item) => {
                    if (item.item_type === 'product') {
                        if (!productSalesMap[item.name]) productSalesMap[item.name] = 0;
                        productSalesMap[item.name] += item.quantity || 1;
                    }
                });
                const produtosMaisVendidos = Object.entries(productSalesMap).map(([nome, qty]) => ({ produto: nome, qtd: qty })).sort((a, b) => b.qtd - a.qtd);

                // CRM INTELIGENTE: Clientes com Risco de Evasão
                const { data: crmOrders } = await supabase.from('orders').select('client_id, scheduled_at').eq('barbershop_id', bId).eq('status', 'closed').order('scheduled_at', { ascending: true });
                const crmClientIds = [...new Set((crmOrders || []).map(o => o.client_id).filter(Boolean))];
                let crmClientMap = {};
                if (crmClientIds.length > 0) {
                    const { data: crmClients } = await supabase.from('clients').select('id, name, phone').in('id', crmClientIds);
                    (crmClients || []).forEach(c => { crmClientMap[c.id] = { name: c.name, phone: c.phone || '' }; });
                }
                const visitsByClient = {};
                (crmOrders || []).forEach(o => {
                    if (!o.client_id || !o.scheduled_at) return;
                    if (!visitsByClient[o.client_id]) visitsByClient[o.client_id] = [];
                    visitsByClient[o.client_id].push(new Date(o.scheduled_at));
                });
                const clientesEvasao = [];
                Object.entries(visitsByClient).forEach(([cId, visits]) => {
                    if (visits.length < 2) return;
                    visits.sort((a, b) => a - b);
                    const intervals = [];
                    for (let i = 1; i < visits.length; i++) intervals.push((visits[i] - visits[i - 1]) / 86400000);
                    const avgDays = intervals.reduce((s, v) => s + v, 0) / intervals.length;
                    const lastVisit = visits[visits.length - 1];
                    const daysSinceLast = Math.floor((nowMs - lastVisit.getTime()) / 86400000);
                    const threshold = avgDays * 1.2;
                    if (daysSinceLast > threshold) {
                        const info = crmClientMap[cId] || { name: 'Sem nome', phone: '' };
                        clientesEvasao.push({ nome: info.name, mediaRetorno: Math.round(avgDays), diasUltimaVisita: daysSinceLast, status: `Atrasado há ${Math.floor(daysSinceLast - avgDays)} dias`, phone: info.phone });
                    }
                });
                clientesEvasao.sort((a, b) => b.diasUltimaVisita - a.diasUltimaVisita);

                // Clientes Inadimplentes
                const { data: inadimplentesData } = await supabase.from('clients').select('*').eq('barbershop_id', bId).eq('is_subscriber', true).eq('subscription_status', 'overdue');
                const clientesInadimplentes = (inadimplentesData || []).map(c => ({ nome: c.name || 'Sem nome', telefone: c.phone || '—', status: 'Atrasado' }));

                // Contratos a vencer
                const { data: contratosVencendoData } = await supabase.from('subscriptions').select('client_id, plan_name, next_billing_date').eq('barbershop_id', bId).eq('status', 'active').gte('next_billing_date', todayISO).lte('next_billing_date', in30DaysISO);
                const cvClientIds = [...new Set((contratosVencendoData || []).map(s => s.client_id).filter(Boolean))];
                let cvClientNames = {};
                if (cvClientIds.length > 0) {
                    const { data: cvClients } = await supabase.from('clients').select('id, name').in('id', cvClientIds);
                    (cvClients || []).forEach(c => { cvClientNames[c.id] = c.name; });
                }
                const contratosVencendo = (contratosVencendoData || []).map(s => ({ nome: cvClientNames[s.client_id] || 'Sem nome', plano: s.plan_name, vence: s.next_billing_date ? new Date(s.next_billing_date).toLocaleDateString('pt-BR') : '—' }));

                setData({
                    adminName,
                    adminInitials,
                    kpis: { barbers: barbersCount || 0, openOrders: openOrdersCount || 0, clients: clientsCount || 0, errorSubs: errorSubsCount || 0, faturamentoDia, faturamentoMes, ticketMedio, activeSubsCount, mrr, atendimentosHojeClosed: atendimentosHojeClosed || 0, atendimentosHojeTotal: atendimentosHojeTotal || 0 },
                    origins: { total: ordersTotal || 0, app: ordersApp || 0, appPercent, reception: ordersReception || 0, receptionPercent },
                    contracts: { expiring: expiringContracts || 0, pending: pendingContracts || 0 },
                    funnel,
                    clientesEvasao,
                    rankingBarbeiros,
                    topClientes,
                    estoqueData,
                    pagamentosIncompletos,
                    clientesInadimplentes,
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
