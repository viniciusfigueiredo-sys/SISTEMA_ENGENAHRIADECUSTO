-- Aplicada ao projeto dgolbcuhjruncildelth em 13/10/2026.
-- Armazena os perfis configuráveis junto às configurações existentes.
ALTER TABLE public.configuracoes
  ADD COLUMN IF NOT EXISTS perfis_json jsonb NOT NULL DEFAULT '{}'::jsonb;
