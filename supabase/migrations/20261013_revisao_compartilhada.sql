BEGIN;
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS revisao_dados text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.bp_sinalizar_revisao_dados()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.configuracoes SET revisao_dados = gen_random_uuid()::text WHERE id = (SELECT id FROM public.configuracoes ORDER BY id LIMIT 1);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bp_revisao_configuracoes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.perfis_json IS DISTINCT FROM OLD.perfis_json OR NEW.titulo IS DISTINCT FROM OLD.titulo OR NEW.url_realizado IS DISTINCT FROM OLD.url_realizado THEN
    NEW.revisao_dados := gen_random_uuid()::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bp_revisao_obras ON public.obras;
CREATE TRIGGER bp_revisao_obras AFTER INSERT OR UPDATE OR DELETE ON public.obras FOR EACH STATEMENT EXECUTE FUNCTION public.bp_sinalizar_revisao_dados();
DROP TRIGGER IF EXISTS bp_revisao_usuarios ON public.usuarios;
CREATE TRIGGER bp_revisao_usuarios AFTER INSERT OR UPDATE OR DELETE ON public.usuarios FOR EACH STATEMENT EXECUTE FUNCTION public.bp_sinalizar_revisao_dados();
DROP TRIGGER IF EXISTS bp_revisao_config ON public.configuracoes;
CREATE TRIGGER bp_revisao_config BEFORE UPDATE ON public.configuracoes FOR EACH ROW EXECUTE FUNCTION public.bp_revisao_configuracoes();

UPDATE public.configuracoes SET revisao_dados = gen_random_uuid()::text WHERE id = (SELECT id FROM public.configuracoes ORDER BY id LIMIT 1);
NOTIFY pgrst, 'reload schema';
COMMIT;
