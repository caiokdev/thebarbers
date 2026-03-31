-- 1. Adicionar a coluna se ainda não existir
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allowed_days int[] DEFAULT '{0,1,2,3,4,5,6}'::int[];

-- 2. Atualizar os planos existentes para abranger todos os dias
UPDATE plans SET allowed_days = '{0,1,2,3,4,5,6}';

-- 3. Inserir as novas variantes Seg-Qua
DO $$
DECLARE
    rec RECORD;
    new_name TEXT;
    is_corte BOOLEAN;
    is_barba BOOLEAN;
    is_gold BOOLEAN;
BEGIN
    FOR rec IN SELECT * FROM plans WHERE allowed_days = '{0,1,2,3,4,5,6}' LOOP
        
        is_corte := rec.name ILIKE '%corte%';
        is_gold := rec.name ILIKE '%gold%';
        is_barba := rec.name ILIKE '%barba%' AND NOT is_corte AND NOT is_gold;

        -- Variantes Seg-Qua
        IF is_gold THEN
            new_name := 'Plano Gold Seg-Qua';
        ELSIF is_barba THEN
            new_name := 'Plano Barba Seg-Qua';
        ELSIF is_corte THEN
            new_name := 'Plano Corte Seg-Qua';
        ELSE
            new_name := rec.name || ' Seg-Qua';
        END IF;

        IF NOT EXISTS(SELECT 1 FROM plans WHERE name = new_name AND barbershop_id = rec.barbershop_id) THEN
            INSERT INTO plans (barbershop_id, name, price, haircut_limit, shave_limit, allowed_days)
            VALUES (rec.barbershop_id, new_name, rec.price, rec.haircut_limit, rec.shave_limit, '{1,2,3}');
        END IF;

        -- Renomear os antigos para Ilimitado
        IF is_gold THEN
            UPDATE plans SET name = 'Plano Gold Ilimitado' WHERE id = rec.id;
        ELSIF is_barba THEN
            UPDATE plans SET name = 'Plano Barba Ilimitado' WHERE id = rec.id;
        ELSIF is_corte THEN
            UPDATE plans SET name = 'Plano Corte Ilimitado' WHERE id = rec.id;
        ELSE
            UPDATE plans SET name = rec.name || ' Ilimitado' WHERE id = rec.id;
        END IF;
    END LOOP;
END $$;
