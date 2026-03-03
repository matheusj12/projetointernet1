-- Execute APENAS este script no SQL Editor do Supabase

-- Adiciona a coluna de Valor Unitário (se ela ainda não existir)
ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS unit_price numeric(10,2) DEFAULT 0.00;
