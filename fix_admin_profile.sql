-- ============================================================
-- FIX: Admin profile barbershop_id is set to null UUID
-- Run this in Supabase SQL Editor to permanently fix the issue
-- ============================================================

-- 1. Verificar o estado atual do perfil admin
-- (copie o resultado para confirmar antes de aplicar o UPDATE)
SELECT 
    p.id AS profile_id,
    p.name,
    p.barbershop_id,
    p.role,
    au.email
FROM profiles p
JOIN auth.users au ON au.id = p.id
WHERE p.barbershop_id = '00000000-0000-0000-0000-000000000000'
   OR p.barbershop_id IS NULL;

-- 2. Ver o barbershop_id real (baseado nos pedidos existentes)
SELECT DISTINCT barbershop_id FROM orders LIMIT 5;
SELECT DISTINCT barbershop_id FROM clients LIMIT 5;

-- 3. Atualizar o perfil do admin com o ID correto da barbearia
-- SUBSTITUA '2eb21641-a4e8-4669-b7ed-724a68918a79' pelo ID correto se diferente
UPDATE profiles
SET barbershop_id = '2eb21641-a4e8-4669-b7ed-724a68918a79'
WHERE barbershop_id = '00000000-0000-0000-0000-000000000000'
   OR barbershop_id IS NULL;

-- 4. Verificar o resultado
SELECT id, name, barbershop_id, role FROM profiles;
