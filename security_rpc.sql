-- ==========================================
-- SCRIPT DE SEGURANÇA: HASH DE SENHA MASTER
-- Cole e execute no SQL Editor do Supabase
-- ==========================================

-- 1. Habilitar a extensão pgcrypto para funções de hash confiáveis
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Adicionar a coluna para o Hash da Senha na barbearia
ALTER TABLE public.barbershops 
ADD COLUMN IF NOT EXISTS master_password_hash TEXT;

-- 3. Função para Definir nova senha de Admin (Server-side hash)
CREATE OR REPLACE FUNCTION set_master_password(p_barbershop_id UUID, p_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.barbershops
    SET master_password_hash = crypt(p_password, gen_salt('bf', 10))
    WHERE id = p_barbershop_id;
END;
$$;

-- 4. Função para Verificar se a senha confere
CREATE OR REPLACE FUNCTION verify_master_password(p_barbershop_id UUID, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT master_password_hash INTO stored_hash
    FROM public.barbershops
    WHERE id = p_barbershop_id;

    -- Se a pessoa nunca configurou a senha, bloqueamos o acesso.
    -- Ela obrigatoriamente terá que cadastrar sua própria senha para gerar o hash inicial.
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Verifica a senha enviada contra o Hash sem expor o Hash ao front-end!
    RETURN stored_hash = crypt(p_password, stored_hash);
END;
$$;
