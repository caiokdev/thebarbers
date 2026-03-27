-- SQL para executar no SQL Editor do Supabase

CREATE OR REPLACE FUNCTION get_dashboard_summary(
    p_b_id UUID,
    p_start_month TIMESTAMP,
    p_end_month TIMESTAMP,
    p_start_today TIMESTAMP,
    p_end_today TIMESTAMP,
    p_date_today DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_origins JSONB;
    v_funnel JSONB;
    v_financial JSONB;
    v_today JSONB;
    
    v_app INT;
    v_rec INT;
    v_wpp INT;
    v_tot_org INT;

    v_tot_fun INT;
    v_closed INT;
    v_noshow INT;
    v_canc INT;
    v_sched INT;
    v_open INT;

    v_fat_mes NUMERIC;
    v_fat_dia NUMERIC;
    v_ticket_medio NUMERIC;

    v_tot_hoje INT;
    v_closed_hoje INT;
BEGIN

    -- 1. Origins (Criados neste mês)
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE origin = 'app'),
        COUNT(*) FILTER (WHERE origin = 'reception'),
        COUNT(*) FILTER (WHERE origin = 'whatsapp')
    INTO v_tot_org, v_app, v_rec, v_wpp
    FROM orders
    WHERE barbershop_id = p_b_id
      AND created_at >= p_start_month AND created_at <= p_end_month;

    v_origins := jsonb_build_object(
        'total', v_tot_org,
        'app', v_app,
        'reception', v_rec,
        'whatsapp', v_wpp
    );

    -- 2. Funnel (Agendados neste mês)
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'closed'),
        COUNT(*) FILTER (WHERE status IN ('no_show', 'no-show')),
        COUNT(*) FILTER (WHERE status = 'canceled'),
        COUNT(*) FILTER (WHERE status = 'scheduled'),
        COUNT(*) FILTER (WHERE status = 'open')
    INTO v_tot_fun, v_closed, v_noshow, v_canc, v_sched, v_open
    FROM orders
    WHERE barbershop_id = p_b_id
      AND scheduled_at >= p_start_month AND scheduled_at <= p_end_month;

    v_funnel := jsonb_build_object(
        'total', v_tot_fun,
        'closed', v_closed,
        'no_show', v_noshow,
        'canceled', v_canc,
        'scheduled', v_sched,
        'open', v_open
    );

    -- 3. Faturamento Mês (Baseado no fechamento real)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_fat_mes
    FROM orders
    WHERE barbershop_id = p_b_id 
      AND status = 'closed'
      AND closed_at >= p_start_month AND closed_at <= p_end_month;

    -- Faturamento Dia (fechados hoje)
    SELECT COALESCE(SUM(total_amount), 0) INTO v_fat_dia
    FROM orders
    WHERE barbershop_id = p_b_id 
      AND status = 'closed'
      AND closed_at >= p_start_today AND closed_at <= p_end_today;

    -- Ticket Médio do Mês (Baseado no fechamento real)
    SELECT COALESCE(AVG(total_amount), 0) INTO v_ticket_medio
    FROM orders
    WHERE barbershop_id = p_b_id 
      AND status = 'closed'
      AND closed_at >= p_start_month AND closed_at <= p_end_month;

    v_financial := jsonb_build_object(
        'faturamentoMes', v_fat_mes,
        'faturamentoDia', v_fat_dia,
        'ticketMedio', v_ticket_medio
    );

    -- 4. Atendimentos de Hoje
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'closed' AND closed_at >= p_start_today AND closed_at <= p_end_today)
    INTO v_tot_hoje, v_closed_hoje
    FROM orders
    WHERE barbershop_id = p_b_id
      AND DATE(scheduled_at) = p_date_today;

    v_today := jsonb_build_object(
        'totalHoje', v_tot_hoje,
        'closedHoje', v_closed_hoje
    );

    -- 5. Retorna o Objeto
    RETURN jsonb_build_object(
        'origins', v_origins,
        'funnel', v_funnel,
        'financial', v_financial,
        'today', v_today
    );
END;
$$;
