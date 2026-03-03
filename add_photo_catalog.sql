-- Execute este script no SQL Editor do Supabase para adicionar a coluna de imagem aos produtos

ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS image_url text;
