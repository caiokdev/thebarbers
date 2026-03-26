-- This script updates the verify_master_password RPC to remove the insecure fallback.
-- Now, if a barbershop has no master password configured, it will return false
-- forcing the user to create one in their Profile before accessing sensitive areas.

CREATE OR REPLACE FUNCTION verify_master_password(p_barbershop_id uuid, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hash text;
BEGIN
    SELECT master_password_hash INTO v_hash
    FROM barbershops
    WHERE id = p_barbershop_id;

    -- Security Fix: Never fallback to a known password. 
    -- If no hash is set, deny access so the user is forced to create one.
    IF v_hash IS NULL THEN
        RETURN false;
    END IF;

    -- Compare provided password with stored hash
    RETURN v_hash = crypt(p_password, v_hash);
END;
$$;
