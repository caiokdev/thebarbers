import os
import sys

filepath = 'src/hooks/useDashboardData.js'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if 'Faturamento do Dia' in line and 'status=closed' in line:
        start_idx = i
        break

for i, line in enumerate(lines):
    if 'NOVO: Clientes Inadimplentes' in line and 'is_subscriber' in line and 'overdue' in line:
        end_idx = i
        break

if start_idx == -1 or end_idx == -1:
    print(f"Error finding markers. Start: {start_idx}, End: {end_idx}")
    sys.exit(1)

before = lines[:start_idx]
after = lines[end_idx:]

replacement = """
                // ─── Refatoração: BUSCA PRINCIPAL (CÉREBRO DO DASHBOARD) ─────────
                // Busca TODOS os agendamentos do mês e agendamentos futuros,
                // separando a lógica de KPIs no frontend.
                const { data: rawOrders } = await supabase
                    .from('orders')
                    .select('id, created_at, scheduled_at, closed_at, status, total_amount, origin, client_id, professional_id, profiles!professional_id(name), clients!client_id(name, phone)')
                    .eq('barbershop_id', bId)
                    .or(`scheduled_at.gte.${startOfMonthISO},created_at.gte.${startOfMonthISO},status.in.(open,scheduled)`);
                
                const allOrders = rawOrders || [];
                const nowMs = today.getTime();

                let faturamentoDia = 0;
                let faturamentoMes = 0;
                let atendimentosHojeClosed = 0;
                let atendimentosHojeTotal = 0;
                
                const detalheFaturamentoHoje = [];
                const detalheComandasAbertas = [];
                const detalheConversaoMes = [];
                
                const dailyMap = {}; // para detalheMetaMes
                let openOrdersCount = 0;

                // Para Funil Geral do Mês (baseado em scheduled_at dentro do mês)
                let funnelTotal = 0, funnelClosed = 0, funnelNoShow = 0, funnelCanceled = 0, funnelScheduled = 0, funnelOpen = 0;
                const noShowOrders = [];
                const canceledOrders = [];

                // Para Origens (baseado em created_at dentro do mês)
                let ordersTotal = 0, ordersApp = 0, ordersReception = 0;

                // Para Próximos Atendimentos (agendamentos futuros filtrados para o dia de hoje)
                const uniqueFutureOrders = [];

                // Para Ticket Médio 
                let closedCountAllTime = 0;
                let closedSumAllTime = 0;

                allOrders.forEach(o => {
                    const status = o.status;
                    const val = parseFloat(o.total_amount || 0);

                    const isScheduledThisMonth = o.scheduled_at && o.scheduled_at >= startOfMonthISO && o.scheduled_at <= endOfMonthISO;
                    const isScheduledToday = o.scheduled_at && o.scheduled_at >= startOfDayISO && o.scheduled_at <= endOfDayISO;
                    
                    const isClosedThisMonth = status === 'closed' && o.closed_at && o.closed_at >= startOfMonthISO && o.closed_at <= endOfMonthISO;
                    const isClosedToday = status === 'closed' && o.closed_at && o.closed_at >= startOfDayISO && o.closed_at <= endOfDayISO;
                    
                    const isCreatedThisMonth = o.created_at && o.created_at >= startOfMonthISO && o.created_at <= endOfMonthISO;

                    // 1. Faturamento e Atendimentos Hoje
                    if (isClosedToday) {
                        faturamentoDia += val;
                        atendimentosHojeClosed++;
                        
                        const d = new Date(o.closed_at);
                        detalheFaturamentoHoje.push({
                            hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                            cliente: o.clients?.name || 'Cliente Avulso',
                            barbeiro: o.profiles?.name || 'Sem Barbeiro',
                            valor: `R$ ${val.toFixed(2).replace('.', ',')}`,
                        });
                    }

                    if (isScheduledToday && ['scheduled', 'confirmed', 'open', 'closed', 'no_show'].includes(status)) {
                        atendimentosHojeTotal++;
                    }

                    // 2. Comandas Abertas
                    if (status === 'open') {
                        openOrdersCount++;
                        const d = new Date(o.created_at);
                        detalheComandasAbertas.push({
                            _id: o.id,
                            hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                            cliente: o.clients?.name || 'Cliente Avulso',
                            barbeiro: o.profiles?.name || 'Sem Barbeiro',
                            valor: `R$ ${val.toFixed(2).replace('.', ',')}`,
                            created_at: o.created_at // for sorting
                        });
                    }

                    // 3. Faturamento do Mês
                    if (isClosedThisMonth) {
                        faturamentoMes += val;
                        
                        // Meta do mês tracking
                        const dayKey = o.closed_at.split('T')[0];
                        if (!dailyMap[dayKey]) dailyMap[dayKey] = 0;
                        dailyMap[dayKey] += val;
                    }

                    // 4. Origens (criados neste mês)
                    if (isCreatedThisMonth) {
                        ordersTotal++;
                        if (o.origin === 'app') ordersApp++;
                        if (o.origin === 'reception') ordersReception++;
                    }

                    // 5. Conversão e Funil (Agendados para este mês)
                    if (isScheduledThisMonth) {
                        funnelTotal++;
                        if (status === 'closed') funnelClosed++;
                        else if (status === 'no_show' || status === 'no-show') { 
                            funnelNoShow++; 
                            if (isScheduledToday) noShowOrders.push(o); // Modal de Faltosos APENAS DO DIA 
                        }
                        else if (status === 'canceled') { 
                            funnelCanceled++; 
                            if (isScheduledToday) canceledOrders.push(o); // Modal Cancelados APENAS DO DIA 
                        }
                        else if (status === 'scheduled') funnelScheduled++;
                        else if (status === 'open') funnelOpen++;

                        // Detalhe Conversão Mes
                        const d = new Date(o.created_at || o.scheduled_at);
                        const statusLabels = { closed: 'Fechado', open: 'Aberto', scheduled: 'Agendado', 'no_show': 'No-show', canceled: 'Cancelado' };
                        detalheConversaoMes.push({
                            data: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                            cliente: o.clients?.name || 'Cliente Avulso',
                            barbeiro: o.profiles?.name || 'Sem Barbeiro',
                            status: statusLabels[status] || status,
                            valor: `R$ ${val.toFixed(2).replace('.', ',')}`,
                            created_at: o.created_at
                        });
                    }

                    // 6. Próximos Atendimentos (hoje, no futuro)
                    if ((status === 'scheduled' || status === 'open') && isScheduledToday && o.scheduled_at) {
                        const schedTime = new Date(o.scheduled_at).getTime();
                        if (schedTime >= nowMs) {
                            uniqueFutureOrders.push(o);
                        }
                    }

                    // 7. Ticket Médio (Overall - all closed)
                    if (status === 'closed') {
                        closedCountAllTime++;
                        closedSumAllTime += val;
                    }
                });

                // Ordenar listas locais
                detalheFaturamentoHoje.sort((a, b) => a.hora.localeCompare(b.hora));
                detalheComandasAbertas.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                detalheConversaoMes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                
                // Próximos Atendimentos: Sem limite fixo, tempo ciente. Ordenar cronologicamente
                uniqueFutureOrders.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
                const proximosAtendimentos = [];
                // O usuário pediu "Filtre a lista diária... Remova qualquer limitador como .slice(0, 3)". 
                // Então mostraremos TODOS ordenados pelo horário.
                uniqueFutureOrders.forEach(o => {
                    const d = new Date(o.scheduled_at);
                    const bName = o.profiles?.name || 'Sem Nome';
                    const initials = bName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                    proximosAtendimentos.push({
                         _id: o.id,
                         orderInfo: { ...o, client_name: o.clients?.name, professional_name: o.profiles?.name }, // para o modal update
                         nome: bName,
                         initials,
                         cliente: o.clients?.name || 'Avulso',
                         hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                    });
                });

                // Helper Enriquecer
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

                const listaNaoCompareceuHoje = enrichDetail(noShowOrders);
                const listaCanceladosHoje = enrichDetail(canceledOrders);

                // Funnel Calculations
                const funnel = {
                    total: funnelTotal,
                    conversao: funnelTotal > 0 ? ((funnelClosed / funnelTotal) * 100).toFixed(1) : '0.0',
                    noShow: funnelTotal > 0 ? ((funnelNoShow / funnelTotal) * 100).toFixed(1) : '0.0',
                    cancelamento: funnelTotal > 0 ? ((funnelCanceled / funnelTotal) * 100).toFixed(1) : '0.0',
                    scheduled: funnelScheduled,
                    closed: funnelClosed,
                    noShowCount: noShowOrders.length, // Agora reflete APENAS hoje
                    canceledCount: canceledOrders.length, // Agora reflete APENAS hoje
                    listaNaoCompareceuHoje, // AGORA CONTÉM SÓ FALTAS DE HOJE
                    listaCanceladosHoje, // AGORA CONTÉM SÓ CANCELAMENTOS DE HOJE
                };

                // Meta do Mês
                const detalheMetaMes = Object.entries(dailyMap).map(([dayKey, total]) => {
                    const d = new Date(dayKey + 'T12:00:00');
                    return {
                        dia: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
                        faturamento: `R$ ${total.toFixed(2).replace('.', ',')}`,
                    };
                }).sort((a,b) => a.dia.localeCompare(b.dia));

                // Origens
                const appPercent = ordersTotal > 0 ? ((ordersApp / ordersTotal) * 100).toFixed(2) : '0.00';
                const receptionPercent = ordersTotal > 0 ? ((ordersReception / ordersTotal) * 100).toFixed(2) : '0.00';

                // Ticket Médio
                const ticketMedio = closedCountAllTime > 0 ? closedSumAllTime / closedCountAllTime : 0;

                // Faturamento últimos 7 dias
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

                allOrders.forEach(o => {
                    if (o.status !== 'closed' || !o.closed_at) return;
                    const oDate = o.closed_at.split('T')[0];
                    const slot = last7DaysWindow.find(s => s.dateKey === oDate);
                    if (slot) slot.value += parseFloat(o.total_amount || 0);
                });

                const faturamento7Dias = last7DaysWindow.map(s => ({
                    day: s.label,
                    value: Math.round(s.value * 100) / 100,
                }));

                // --- MRR ---
                const { data: activePlans } = await supabase
                    .from('subscriptions')
                    .select('price')
                    .eq('barbershop_id', bId)
                    .eq('status', 'active');

                const mrr = (activePlans || []).reduce((sum, s) => sum + parseFloat(s.price || 0), 0);
                const activeSubsCount = (activePlans || []).length;
"""

new_content = before + [replacement + "\n"] + after

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_content)

print("PYTHON_PATCH_OK")
