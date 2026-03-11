-- Migration: Adicionar coluna 'title' à tabela photo_diary
-- Execute no SQL Editor do Supabase caso a coluna ainda não exista

ALTER TABLE public.photo_diary
    ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';

-- Atualizar os registros existentes que ficaram com título vazio
UPDATE public.photo_diary
SET title = COALESCE(
    SUBSTRING(description FROM 1 FOR 80),
    'Registro sem título'
)
WHERE title = '' OR title IS NULL;
