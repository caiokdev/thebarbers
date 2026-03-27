-- SQL Migration: Add RPC to fetch professionals bypassing RLS for Financeiro/Dashboard
create or replace function get_barbershop_professionals(p_barbershop_id uuid)
returns table (
  id uuid,
  name text,
  commission_rate numeric
)
language sql security definer
as $$
  select id, name, commission_rate
  from professionals
  where professionals.barbershop_id = p_barbershop_id
     -- Optional: include those whose ID is in profiles but missing in professionals if needed
     -- But we trust professionals table as truth based on previous investigation
$$;
