import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatDate, formatTime, formatDateTime, getLocalDateISO } from '../utils/dateUtils';
import { getStatusLabel, formatCurrency } from '../utils/orderUtils';

export default function useDashboardData() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [refetchKey, setRefetchKey] = useState(0);
    const location = useLocation();

    // Bug 2 fix: expose refresh so Dashboard.jsx can trigger re-fetch
    const refresh = useCallback(() => setRefetchKey(k => k + 1), []);

    // Re-fetch when window regains focus
    useEffect(() => {
        function handleFocus() { setRefetchKey(k => k + 1); }
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    useEffect(() => {
        async function fetchAll() {
            try {
                // --- Passo 0: Obter sessão e perfil do usuário ---
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    console.error('Nenhuma sessão ativa encontrada.');
                    setLoading(false);
                    return;
                }

                const { data: profile, error: profileErr } = await supabase
                    .from('profiles')
                    .select('name, barbershop_id')
                    .eq('id', session.user.id)
                    .single();

                if (profileErr || !profile) {
                    console.error('Erro ao buscar perfil do usuário:', profileErr?.message);
                    setLoading(false);
                    return;
                }

                let bId = profile.barbershop_id;
                const adminName = profile.name || 'Admin';

                // Fallback: se barbershop_id é o null UUID ou está faltando
                const NULL_UUID = '00000000-0000-0000-0000-000000000000';
                if (!bId || bId === NULL_UUID) {
                    console.warn('[Dashboard] barbershop_id inválido no perfil, buscando via outras fontes...');
                    // Tenta 1: buscar via tabela barber_shops (caso exista)
                    const { data: bsRow } = await supabase
                        .from('barber_shops')
                        .select('id')
                        .eq('owner_id', session.user.id)
                        .maybeSingle();
                    if (bsRow?.id) {
                        bId = bsRow.id;
                    } else {
                        // Tenta 2: buscar via tabela clients (qualquer cliente pertencente ao user)
                        const { data: anyClient } = await supabase
                            .from('clients')
                            .select('barbershop_id')
                            .not('barbershop_id', 'is', null)
                            .limit(1)
                            .single();
                        if (anyClient?.barbershop_id && anyClient.barbershop_id !== NULL_UUID) {
                            bId = anyClient.barbershop_id;
                        } else {
                            // Tenta 3: buscar via tabela orders mais recente (as an admin they own the shop)
                            const { data: anyOrder } = await supabase
                                .from('orders')
                                .select('barbershop_id')
                                .not('barbershop_id', 'is', null)
                                .limit(1)
                                .single();
                            if (anyOrder?.barbershop_id && anyOrder.barbershop_id !== NULL_UUID) {
                                bId = anyOrder.barbershop_id;
                            } else {
                                console.error('[Dashboard] Não foi possível determinar o barbershop_id do admin.');
                                setLoading(false);
                                return;
                            }
                        }
                    }
                    console.log('[Dashboard] barbershop_id resolvido via fallback:', bId);
                }

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
                const todayStr = getLocalDateISO(today);

                // Boundaries for today
                const startOfDayISO = new Date(`${todayStr}T00:00:00`).toISOString();
                const endOfDayISO = new Date(`${todayStr}T23:59:59.999`).toISOString();

                // Month boundaries
                const startOfMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
                const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                const endOfMonthStr = getLocalDateISO(endOfMonth);
                
                const startOfMonthISO = new Date(`${startOfMonthStr}T00:00:00`).toISOString();
                const endOfMonthISO = new Date(`${endOfMonthStr}T23:59:59.999`).toISOString();

                const in30Days = new Date(today);
                in30Days.setDate(in30Days.getDate() + 30);
                const in30DaysStr = getLocalDateISO(in30Days);

                const in7Days = new Date(today);
                in7Days.setDate(in7Days.getDate() + 7);
                const in7DaysStr = getLocalDateISO(in7Days);

                // Variáveis que faltavam
                const todayISO = today.toISOString();
                const in30DaysISO = in30Days.toISOString();
                const in7DaysISO = new Date(`${in7DaysStr}T23:59:59.999`).toISOString();


                // Busca TODOS os agendamentos relevantes: este mês OU fechados hoje
                // NOTA: dois .or() encadeados criam um AND incorreto — usar um único .or() com todas as condições
                const { data: rawOrdersData, error: ordersErr } = await supabase
                    .from('orders')
                    .select('id, status, total_amount, scheduled_at, created_at, closed_at, origin, professionals(name), clients(name, phone)')
                    .eq('barbershop_id', bId)
                    .or(
                        `scheduled_at.gte.${startOfMonthISO},` +
                        `created_at.gte.${startOfMonthISO},` +
                        `closed_at.gte.${startOfDayISO}`
                    );

                if (ordersErr) {
                    console.error("Erro ao buscar agendamentos:", ordersErr.message, ordersErr.details, ordersErr.hint);
                }

                // Agendamentos futuros — incluí os de hoje ainda não iniciados e os dos próximos 30 dias
                // NOTA: usar startOfDayISO (não todayISO) para capturar todos os agendamentos de hoje,
                // mesmo aqueles que já começaram (ex: 09:00 quando são 10:30)
                const { data: futureOrdersData } = await supabase
                    .from('orders')
                    .select('id, status, total_amount, scheduled_at, created_at, closed_at, origin, professionals(name), clients(name, phone)')
                    .eq('barbershop_id', bId)
                    .in('status', ['scheduled', 'open'])
                    .gte('scheduled_at', startOfDayISO)
                    .lte('scheduled_at', in30DaysISO)
                    .order('scheduled_at', { ascending: true });


                // NOVO: Chama o RPC para pegar as métricas agregadas
                const { data: summaryData, error: summaryErr } = await supabase.rpc('get_dashboard_summary', {
                    p_b_id: bId,
                    p_start_month: startOfMonthISO,
                    p_end_month: endOfMonthISO,
                    p_start_today: startOfDayISO,
                    p_end_today: endOfDayISO,
                    p_date_today: todayStr
                });
                if (summaryErr) {
                    console.error("Erro no RPC dashboard:", summaryErr.message, summaryErr.details, summaryErr.hint);
                }

                const allOrdersRaw = rawOrdersData || [];

                // Usando os dados agregados do RPC para performance
                let openOrdersCount = summaryData?.funnel?.open || 0;
                // Bug 4 fix: usar RPC se > 0, senão fazer fallback após construir detalheFaturamentoHoje
                const faturamentoDiaRPC = summaryData?.financial?.faturamentoDia || 0;
                let faturamentoDia = faturamentoDiaRPC; // será ajustado abaixo se necessário
                let faturamentoMes = summaryData?.financial?.faturamentoMes || 0;
                let atendimentosHojeClosed = summaryData?.today?.closedHoje || 0;
                let atendimentosHojeTotal = summaryData?.today?.totalHoje || 0;

                let ordersTotal = summaryData?.origins?.total || 0;
                let ordersApp = summaryData?.origins?.app || 0;
                let ordersReception = summaryData?.origins?.reception || 0;
                let ordersWhatsapp = summaryData?.origins?.whatsapp || 0;

                let funnelTotal = summaryData?.funnel?.total || 0;
                let funnelClosed = summaryData?.funnel?.closed || 0;
                let funnelNoShow = summaryData?.funnel?.no_show || 0;
                let funnelCanceled = summaryData?.funnel?.canceled || 0;
                let funnelScheduled = summaryData?.funnel?.scheduled || 0;
                let funnelOpen = summaryData?.funnel?.open || 0;

                const detalheFaturamentoHoje = [];
                const detalheAtendimentosHoje = [];
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

                    // REGRA DE HOJE: comparar scheduled_at com data de hoje logica simplificada
                    const isHoje = o.scheduled_at && getLocalDateISO(o.scheduled_at) === todayStr;
                    const isScheduledToday = isHoje;
                    const isClosedToday = o.closed_at && getLocalDateISO(o.closed_at) === todayStr;
                    const isClosedThisMonth = status === 'closed';

                    // 2. Comandas Abertas (globais, independentes do mês)
                    if (status === 'open') {
                        // contagem no RPC
                        detalheComandasAbertas.push({
                            _id: o.id,
                            hora: formatTime(o.scheduled_at || o.created_at),
                            cliente: o.clients?.name || 'Cliente Avulso',
                            barbeiro: o.professionals?.name || 'Sem Barbeiro',
                            valor: formatCurrency(amount),
                            created_at: formatDateTime(o.created_at) // Data amigável
                        });
                    }

                    // 3. Faturamento Mês e Meta (O faturamento total vem do RPC, aqui é só pro gráfico da meta)
                    if (isClosedThisMonth) {
                        const dateForMeta = o.closed_at || o.scheduled_at || o.created_at;
                        const dayKey = getLocalDateISO(dateForMeta);
                        if (!dailyMetaMap[dayKey]) dailyMetaMap[dayKey] = 0;
                        dailyMetaMap[dayKey] += amount;
                    }

                    // Faturamento 7 dias
                    if (status === 'closed') {
                        const dateFor7Days = o.closed_at || o.scheduled_at || o.created_at;
                        const closedDateKey = getLocalDateISO(dateFor7Days);
                        if (!last7DaysData[closedDateKey]) last7DaysData[closedDateKey] = 0;
                        last7DaysData[closedDateKey] += amount;
                    }

                    // 5. Funil (Agendados neste mês) (listas visuais)
                    if (true) {
                        detalheConversaoMes.push({
                            data: formatDateTime(o.scheduled_at || o.created_at),
                            cliente: o.clients?.name || 'Cliente Avulso',
                            barbeiro: o.professionals?.name || 'Sem Barbeiro',
                            status: getStatusLabel(status),
                            valor: formatCurrency(amount),
                            _created_at: o.created_at
                        });
                    }

                    const isCreatedToday = o.created_at && getLocalDateISO(o.created_at) === todayStr;

                    // Modal "Não Compareceu" / Cancelados DE HOJE ESTITAMENTE
                    if (isScheduledToday || isCreatedToday) {
                        if (status === 'no_show' || status === 'no-show') noShowOrdersToday.push(o);
                        if (status === 'canceled') canceledOrdersToday.push(o);
                    }

                    // (Próximos Atendimentos é construído abaixo com futureOrdersData)

                    // MODALS DE ATENDIMENTOS E FATURAMENTO (Baseado no Fechamento Real)
                    if (status === 'closed' && (isClosedToday || isScheduledToday)) {
                        const d = o.closed_at ? new Date(o.closed_at) : new Date(o.scheduled_at);
                        const pushObj = {
                            _id: o.id,
                            hora: formatTime(o.closed_at || o.scheduled_at),
                            cliente: o.clients?.name || 'Cliente Avulso',
                            barbeiro: o.professionals?.name || 'Sem Barbeiro',
                            valor: formatCurrency(amount),
                        };
                        
                        // Push into detailed views
                        if (isClosedToday && !detalheFaturamentoHoje.find(x => x._id === o.id)) {
                            detalheFaturamentoHoje.push(pushObj);
                            detalheAtendimentosHoje.push(pushObj);
                        }
                    }
                });

                // Ordenações
                detalheFaturamentoHoje.sort((a, b) => a.hora.localeCompare(b.hora));
                detalheAtendimentosHoje.sort((a, b) => a.hora.localeCompare(b.hora));
                detalheComandasAbertas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                detalheConversaoMes.sort((a, b) => new Date(b._created_at) - new Date(a._created_at));

                // Próximos Atendimentos — construído com a query dedicada (futureOrdersData)
                (futureOrdersData || []).forEach(o => {
                    const bName = o.professionals?.name || 'Sem Nome';
                    const initials = bName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                    proximosAtendimentos.push({
                        _id: o.id,
                        orderInfo: { ...o, client_name: o.clients?.name, professional_name: bName },
                        nome: bName,
                        initials,
                        cliente: o.clients?.name || 'Avulso',
                        hora: formatTime(o.scheduled_at),
                        data: formatDate(o.scheduled_at).substring(0, 5),
                        scheduled_at: o.scheduled_at
                    });
                });
                proximosAtendimentos.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

                // Bug 4 fix: fallback para faturamentoDia se RPC retornou 0
                // Soma diretamente do raw (total_amount), sem parsing de string formatada
                if (faturamentoDiaRPC === 0) {
                    faturamentoDia = allOrdersRaw
                        .filter(o => o.status === 'closed' && o.closed_at && getLocalDateISO(new Date(o.closed_at)) === todayStr)
                        .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
                    // Se ainda 0, tenta usando scheduled_at (para orders sem closed_at)
                    if (faturamentoDia === 0) {
                        faturamentoDia = allOrdersRaw
                            .filter(o => o.status === 'closed' && getLocalDateISO(new Date(o.scheduled_at || o.created_at)) === todayStr)
                            .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
                    }
                }

                // Meta Mensal Map
                const detalheMetaMes = Object.entries(dailyMetaMap).map(([dayKey, total]) => {
                    return {
                        dia: formatDate(dayKey).substring(0, 5), // 'DD/MM'
                        faturamento: formatCurrency(total),
                    };
                }).sort((a, b) => a.dia.localeCompare(b.dia));

                // Helper Funnel Detail
                const enrichDetail = (arr) => arr.map(o => {
                    const d = o.scheduled_at ? new Date(o.scheduled_at) : null;
                    const timeStr = new Date(o.scheduled_at || o.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
                    const dateStr = new Date(o.scheduled_at || o.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
                    return {
                        id: o.id,
                        orderInfo: { ...o, client_name: o.clients?.name, professional_name: o.professionals?.name },
                        cliente: o.clients?.name || 'Cliente Avulso',
                        profissional: o.professionals?.name || 'Sem nome', // CORRIGIDO: profiles -> professionals
                        horario: timeStr,
                        data: dateStr,
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
                const whatsappPercent = ordersTotal > 0 ? ((ordersWhatsapp / ordersTotal) * 100).toFixed(2) : '0.00';

                // Faturamento últimos 7 dias (limpo)
                const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                const faturamento7Dias = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    const dateKey = getLocalDateISO(d);
                    const val = last7DaysData[dateKey] || 0;
                    faturamento7Dias.push({
                        dateKey,
                        day: i === 0 ? 'Hoje' : dayLabels[d.getDay()],
                        value: Math.round(val * 100) / 100,
                    });
                }

                // --- OUTRAS QUERIES (Mantidas iguais p não quebrar) ---

                // Ticket Médio vem do RPC
                const ticketMedio = summaryData?.financial?.ticketMedio || 0;

                // MRR
                const { data: activePlans } = await supabase.from('subscriptions').select('price').eq('barbershop_id', bId).eq('status', 'active');
                const mrr = (activePlans || []).reduce((sum, s) => sum + parseFloat(s.price || 0), 0);
                const activeSubsCount = (activePlans || []).length;

                // Contratos (Bug fix: usar client_subscriptions [singular] e field valid_until)
                const [{ data: expiringContractsData }, { count: pendingContracts }] = await Promise.all([
                    supabase.from('client_subscriptions').select('*, clients!inner(barbershop_id)').eq('clients.barbershop_id', bId).eq('status', 'active').gte('valid_until', startOfDayISO).lte('valid_until', in7DaysISO),
                    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('barbershop_id', bId).eq('status', 'pending'),
                ]);
                const expiringContractsCount = (expiringContractsData || []).length;
                

                // RANKING DE BARBEIROS (APENAS ESTE MÊS PARA PERFORMANCE)
                const { data: closedBarberOrders } = await supabase.from('orders').select('id, professional_id, total_amount').eq('barbershop_id', bId).eq('status', 'closed').gte('scheduled_at', startOfMonthISO).lte('scheduled_at', endOfMonthISO);
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

                // Top 5 clientes (APENAS NESTE MÊS)
                let topClientes = [];
                try {
                    const { data: allOrdersForClients } = await supabase.from('orders').select('id, total_amount, status, client_id').eq('barbershop_id', bId).eq('status', 'closed').gte('scheduled_at', startOfMonthISO).lte('scheduled_at', endOfMonthISO);
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
                    const d = new Date(c.birth_date + 'T12:00:00');
                    return { nome: c.name, data: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), phone: c.phone || '' };
                });
                const aniversariantesSemana = (allClients || []).filter((c) => c.birth_date && isBirthdayInWindow(c.birth_date, 7)).map((c) => {
                    const d = new Date(c.birth_date + 'T12:00:00');
                    const phoneClean = cleanPhone(c.phone);
                    return { nome: c.name, data: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), whatsapp: phoneClean ? `https://wa.me/55${phoneClean}` : '' };
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
                        recompraList.push({ 
                            nome: clientInfo.name, 
                            produto: item.name, 
                            data: d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }), 
                            phone: clientInfo.phone 
                        });
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
                // Bug 3 fix: chaves alinhadas com o que o Drawer em Dashboard.jsx espera (name, phone)
                const { data: inadimplentesData } = await supabase.from('clients').select('*').eq('barbershop_id', bId).eq('is_subscriber', true).eq('subscription_status', 'overdue');
                const clientesInadimplentes = (inadimplentesData || []).map(c => ({ name: c.name || 'Sem nome', phone: c.phone || '—', status: 'Atrasado' }));

                // Contratos a vencer (lista detalhada) - Bug fix: usar client_subscriptions e join
                // Usando startOfDayISO e in7DaysISO para bater com a contagem do KPI
                const { data: cvData } = await supabase.from('client_subscriptions')
                    .select('valid_until, plans(name), clients!inner(name, barbershop_id)')
                    .eq('clients.barbershop_id', bId)
                    .eq('status', 'active')
                    .gte('valid_until', startOfDayISO)
                    .lte('valid_until', in7DaysISO);

                const contratosVencendo = (cvData || []).map(s => ({
                    nome: s.clients?.name || 'Cliente',
                    plano: s.plans?.name || 'Assinatura',
                    vence: s.valid_until ? new Date(s.valid_until).toLocaleDateString('pt-BR') : '—'
                }));

                // --- 6. Próximo Horário Livre ---
                const takenSlots = allOrdersRaw
                    .filter(o => o.scheduled_at && getLocalDateISO(o.scheduled_at) === todayStr && o.status !== 'canceled' && o.status !== 'no_show')
                    .map(o => formatTime(o.scheduled_at));

                let proximoHorarioLivre = '—';
                const now = new Date();
                // Define slots: 08:00 to 20:00 every 30 mins
                for (let h = 8; h <= 20; h++) {
                    for (let m of [0, 30]) {
                        if (h === 20 && m === 30) break;
                        const slotDate = new Date(today);
                        slotDate.setHours(h, m, 0, 0);
                        const timeStr = formatTime(slotDate);
                        
                        if (slotDate > now && !takenSlots.includes(timeStr)) {
                            proximoHorarioLivre = timeStr;
                            h = 21; // break outer
                            break;
                        }
                    }
                }

                // Faturamento Mensal breakdown
                const faturamentoMensal = Object.entries(dailyMetaMap).map(([dayKey, total]) => ({
                    day: formatDate(dayKey).substring(0, 5), // DD/MM
                    value: Math.round(total * 100) / 100
                })).sort((a, b) => {
                    const [da, ma] = a.day.split('/').map(Number);
                    const [db, mb] = b.day.split('/').map(Number);
                    return ma !== mb ? ma - mb : da - db;
                });

                setData({
                    adminName,
                    adminInitials,
                    kpis: { 
                        barbers: barbersCount || 0, 
                        openOrders: detalheComandasAbertas.length, 
                        clients: clientsCount || 0, 
                        errorSubs: errorSubsCount || 0, 
                        faturamentoDia, 
                        faturamentoMes, 
                        ticketMedio, 
                        activeSubsCount, 
                        mrr, 
                        atendimentosHojeClosed: detalheAtendimentosHoje.length,
                        // Bug 5 fix: unificar fonte — usar getLocalDateISO (timezone-correct) em vez de toLocaleDateString
                        atendimentosHojeTotal: allOrdersRaw.filter(o => o.scheduled_at && getLocalDateISO(new Date(o.scheduled_at)) === todayStr).length
                    },
                    // Bug 1 fix: expor com as chaves que Dashboard.jsx espera
                    ordersToday: detalheAtendimentosHoje,
                    ordersTodayClosed: detalheFaturamentoHoje,
                    ordersOpen: detalheComandasAbertas,
                    origins: { total: ordersTotal || 0, app: ordersApp || 0, appPercent, reception: ordersReception || 0, receptionPercent, whatsapp: ordersWhatsapp || 0, whatsappPercent },
                    contracts: { expiring: expiringContractsCount || 0, pending: pendingContracts || 0 },
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
                    faturamentoMensal,
                    proximoHorarioLivre,
                    detalheFaturamentoHoje,
                    detalheAtendimentosHoje,
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

    // Bug 2 fix: export refresh so Dashboard.jsx can trigger manual re-fetch
    return { loading, data, refresh };
}
