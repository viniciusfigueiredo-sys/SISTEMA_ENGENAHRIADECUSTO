BEGIN;
CREATE OR REPLACE FUNCTION public.bp_sinalizar_revisao_dados()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.configuracoes SET revisao_dados = gen_random_uuid()::text
  WHERE id = (SELECT id FROM public.configuracoes ORDER BY id LIMIT 1);
  RETURN NULL;
END;
$$;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS trocar_senha boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
COMMIT;
