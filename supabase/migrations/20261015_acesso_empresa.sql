-- Aplicar na publicação da versão empresa-acesso.js, após confirmar o Mestre.
BEGIN;
CREATE OR REPLACE FUNCTION public.cc_aprovado()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios WHERE auth_uid=auth.uid() AND status='Aprovado' AND coalesce(trocar_senha,false)=false);
$$;
CREATE OR REPLACE FUNCTION public.cc_mestre()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios WHERE auth_uid=auth.uid() AND perfil='Mestre' AND status='Aprovado' AND coalesce(trocar_senha,false)=false);
$$;
CREATE OR REPLACE FUNCTION public.cc_config_publica()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('identidadeEmpresa',coalesce(c.perfis_json->'__sistema'->'identidadeEmpresa','{}'::jsonb),'empresaGeracao',c.perfis_json->'__sistema'->>'empresaGeracao',
  'perfisCadastro',coalesce(c.perfis_json->'__sistema'->'perfisCadastro',(SELECT jsonb_agg(DISTINCT p) FROM unnest(ARRAY['Engenheiro','Orçamentista','Dono']||ARRAY(SELECT jsonb_object_keys(coalesce(c.perfis_json,'{}'::jsonb)-'__sistema'-'Mestre'))) p)))
 FROM public.configuracoes c ORDER BY id LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.cc_editor_config()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.cc_mestre() OR EXISTS(
  SELECT 1 FROM public.usuarios u CROSS JOIN public.configuracoes c
  WHERE u.auth_uid=auth.uid() AND u.status='Aprovado' AND coalesce(u.trocar_senha,false)=false
  AND coalesce((c.perfis_json->u.perfil->>'configuracoesBloqueadas')::boolean,false)=false
  AND (coalesce((c.perfis_json->u.perfil->>'configuracoes')::boolean,false)
   OR EXISTS(SELECT 1 FROM jsonb_each(coalesce(c.perfis_json->'__sistema'->'acessosConfiguracao','{}'::jsonb)) g WHERE g.value ? u.id::text))
 );
$$;
CREATE OR REPLACE FUNCTION public.cc_concluir_troca_senha()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária.'; END IF;
 UPDATE public.usuarios SET trocar_senha=false WHERE auth_uid=auth.uid() AND status='Aprovado';
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta não aprovada.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.cc_aprovado(),public.cc_mestre(),public.cc_editor_config(),public.cc_config_publica(),public.cc_concluir_troca_senha() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_aprovado(),public.cc_mestre(),public.cc_editor_config(),public.cc_concluir_troca_senha() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cc_config_publica() TO anon,authenticated;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
-- Políticas restritivas também limitam políticas permissivas anteriores.
DROP POLICY IF EXISTS cc_usuarios_limite ON public.usuarios;
CREATE POLICY cc_usuarios_limite ON public.usuarios AS RESTRICTIVE FOR ALL TO anon,authenticated USING(auth.uid() IS NOT NULL AND (public.cc_mestre() OR auth_uid=auth.uid())) WITH CHECK(public.cc_mestre());
DROP POLICY IF EXISTS cc_usuarios_leitura ON public.usuarios;
CREATE POLICY cc_usuarios_leitura ON public.usuarios FOR SELECT TO authenticated USING(public.cc_mestre() OR auth_uid=auth.uid());
DROP POLICY IF EXISTS cc_usuarios_gestao ON public.usuarios;
CREATE POLICY cc_usuarios_gestao ON public.usuarios FOR ALL TO authenticated USING(public.cc_mestre()) WITH CHECK(public.cc_mestre());
DROP POLICY IF EXISTS cc_obras_limite ON public.obras;
CREATE POLICY cc_obras_limite ON public.obras AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.cc_aprovado()) WITH CHECK(public.cc_aprovado());
DROP POLICY IF EXISTS cc_obras_acesso ON public.obras;
CREATE POLICY cc_obras_acesso ON public.obras FOR ALL TO authenticated USING(public.cc_aprovado()) WITH CHECK(public.cc_aprovado());
DROP POLICY IF EXISTS cc_config_limite ON public.configuracoes;
CREATE POLICY cc_config_limite ON public.configuracoes AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.cc_aprovado()) WITH CHECK(public.cc_editor_config());
DROP POLICY IF EXISTS cc_config_leitura ON public.configuracoes;
CREATE POLICY cc_config_leitura ON public.configuracoes FOR SELECT TO authenticated USING(public.cc_aprovado());
DROP POLICY IF EXISTS cc_config_gestao ON public.configuracoes;
CREATE POLICY cc_config_gestao ON public.configuracoes FOR ALL TO authenticated USING(public.cc_editor_config()) WITH CHECK(public.cc_editor_config());
COMMIT;
