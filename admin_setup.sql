-- ==========================================
-- SQL PARA CONFIGURAÇÃO INICIAL DE ADMIN (REVISADO)
-- Execute este bloco inteiro de uma vez no SQL Editor
-- ==========================================

-- 1. Criar tabela de barbearias se não existir
CREATE TABLE IF NOT EXISTS public.barbershops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Garantir que a barbearia padrão existe ANTES do perfil
INSERT INTO public.barbershops (id, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'The Barbers Matriz')
ON CONFLICT (id) DO NOTHING;

-- 3. Criar tabela de perfis se não existir
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    barbershop_id UUID REFERENCES public.barbershops(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Perfis visíveis para todos" ON public.profiles;
CREATE POLICY "Perfis visíveis para todos" 
ON public.profiles FOR SELECT 
USING (true);

-- ==========================================
-- COMANDO PARA VINCULAR SEU USUÁRIO:
-- Substitua 'UUID_DO_USUARIO' pelo ID que você copiou do Authentication
-- ==========================================

-- INSERT INTO public.profiles (id, name, role, barbershop_id)
-- VALUES ('UUID_DO_USUARIO', 'Administrador Principal', 'admin', '00000000-0000-0000-0000-000000000000')
-- ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, barbershop_id = EXCLUDED.barbershop_id;

