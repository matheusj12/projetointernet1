-- Execute este script no SQL Editor do Supabase para adicionar a coluna unit_price aos produtos
-- (a coluna total_price NÃO é necessária no banco - é calculada no frontend como unit_price × quantity_purchased)

ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS unit_price numeric(12,2) DEFAULT 0;
