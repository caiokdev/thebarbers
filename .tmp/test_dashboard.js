import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'c:/Users/CAIO/Desktop/Antigravityy/thebarbers/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDashboard() {
  const bId = '9b6d80ff-d51d-400d-95f0-6bd3fc93bc92'; // Will query for arbitrary bId if needed

  // Try to find a barbershop id
  const { data: bs } = await supabase.from('barber_shops').select('id').limit(1);
  if (!bs || bs.length === 0) {
    console.log('No barbershop found');
    return;
  }
  const realBId = bs[0].id;
  console.log('Barbershop ID:', realBId);

  // Time boundaries like in the front-end
  const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
  const getLocalDateISO = (date = new Date(), timeZone = DEFAULT_TIMEZONE) => {
      const d = new Date(date);
      const parts = d.toLocaleDateString('en-CA', { timeZone }).split('-'); 
      return parts.join('-');
  };

  const today = new Date();
  const todayStr = getLocalDateISO(today);

  const startOfDayISO = new Date(`${todayStr}T00:00:00`).toISOString();
  const endOfDayISO = new Date(`${todayStr}T23:59:59.999`).toISOString();
  
  const startOfMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const endOfMonthStr = getLocalDateISO(endOfMonth);
  
  const startOfMonthISO = new Date(`${startOfMonthStr}T00:00:00`).toISOString();
  const endOfMonthISO = new Date(`${endOfMonthStr}T23:59:59.999`).toISOString();

  console.log('--- Boundaries ---');
  console.log('todayStr:', todayStr);
  console.log('startOfDayISO:', startOfDayISO);
  console.log('endOfDayISO:', endOfDayISO);

  const { data: summaryData, error: summaryErr } = await supabase.rpc('get_dashboard_summary', {
      p_b_id: realBId,
      p_start_month: startOfMonthISO,
      p_end_month: endOfMonthISO,
      p_start_today: startOfDayISO,
      p_end_today: endOfDayISO,
      p_date_today: todayStr
  });

  if (summaryErr) {
      console.error('RPC Error:', summaryErr);
  } else {
      console.log('RPC Faturamento Dia:', summaryData?.financial?.faturamentoDia);
  }

  // orders raw
  const { data: rawOrdersData, error: ordersErr } = await supabase
      .from('orders')
      .select('id, status, total_amount, scheduled_at, created_at, closed_at, origin')
      .eq('barbershop_id', realBId)
      .or(
          `scheduled_at.gte.${startOfMonthISO},` +
          `created_at.gte.${startOfMonthISO},` +
          `closed_at.gte.${startOfDayISO}`
      );

  console.log('Raw Orders Count:', rawOrdersData?.length);
  
  let faturamentoDia = 0;
  const hojeOrders = rawOrdersData.filter(o => o.status === 'closed' && o.closed_at && getLocalDateISO(new Date(o.closed_at)) === todayStr);
  
  console.log('Orders closed today (by string parsing):', hojeOrders.length);
  hojeOrders.forEach(o => {
    console.log(`- ID: ${o.id}, Amount: ${o.total_amount}, closed_at: ${o.closed_at}`);
    faturamentoDia += parseFloat(o.total_amount || 0);
  });
  console.log('Calculated Faturamento Hoje:', faturamentoDia);
}

testDashboard();
