-- SQL para executar no SQL Editor do Supabase

CREATE OR REPLACE FUNCTION finalize_checkout(
  p_order_id UUID,
  p_total_amount NUMERIC,
  p_payment_method TEXT,
  p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_product_name TEXT;
  v_qty INT;
  v_current_stock INT;
BEGIN
  -- 1. Iterar sobre todos os itens que são 'product' para checar estoque e realizar a baixa
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'item_type' = 'product' THEN
      -- Se h catalogId, usamos. Se não, ignoramos (fall-back para erro ou null)
      v_product_id := (v_item->>'catalogId')::UUID;
      v_product_name := v_item->>'name';
      v_qty := (v_item->>'quantity')::INT;

      IF v_product_id IS NOT NULL THEN
        -- Locking a linha do produto
        SELECT current_stock INTO v_current_stock
        FROM products
        WHERE id = v_product_id
        FOR UPDATE;

        IF v_current_stock IS NULL THEN
          RAISE EXCEPTION 'Produto % não existe.', v_product_name;
        END IF;

        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Estoque insuficiente para o produto "%". Em estoque: %. Solicitado: %.', v_product_name, v_current_stock, v_qty;
        END IF;

        -- Efetuar a baixa do estoque
        UPDATE products
        SET current_stock = current_stock - v_qty
        WHERE id = v_product_id;
      END IF;
    END IF;
  END LOOP;

  -- 2. Atualizar o pedido para 'closed' e definir o total e o meio de pagamento
  UPDATE orders
  SET
    status = 'closed',
    total_amount = p_total_amount,
    payment_method = p_payment_method,
    closed_at = NOW()
  WHERE id = p_order_id;

  -- 3. Excluir itens existentes e recriá-los
  DELETE FROM order_items WHERE order_id = p_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id,
      name,
      price,
      quantity,
      item_type
    ) VALUES (
      p_order_id,
      v_item->>'name',
      (v_item->>'price')::NUMERIC,
      (v_item->>'quantity')::INT,
      v_item->>'item_type'
    );
  END LOOP;

END;
$$;
