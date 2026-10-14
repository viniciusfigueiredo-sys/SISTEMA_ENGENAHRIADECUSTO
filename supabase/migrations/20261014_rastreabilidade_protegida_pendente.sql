-- Preparada para a migração do login. Aplicar somente após vincular a conta Auth do Mestre.
BEGIN;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS auth_uid uuid UNIQUE REFERENCES auth.users(id);
CREATE TABLE IF NOT EXISTS public.atividade_sessoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 auth_uid uuid NOT NULL REFERENCES auth.users(id),
 sessao_auth text NOT NULL,
 inicio timestamptz NOT NULL DEFAULT now(),
 ultima_interacao timestamptz NOT NULL DEFAULT now(),
 segundos_ativos bigint NOT NULL DEFAULT 0,
 UNIQUE(auth_uid,sessao_auth)
);
CREATE TABLE IF NOT EXISTS public.atividade_eventos (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 auth_uid uuid NOT NULL REFERENCES auth.users(id),
 sessao_auth text NOT NULL,
 ocorrido_em timestamptz NOT NULL DEFAULT now(),
 acao text NOT NULL,
 tela text,
 obra text
);
CREATE INDEX IF NOT EXISTS atividade_eventos_usuario_data ON public.atividade_eventos(auth_uid,ocorrido_em DESC);
ALTER TABLE public.atividade_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividade_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atividade_sessoes,public.atividade_eventos FROM anon,authenticated;
GRANT SELECT ON public.atividade_sessoes,public.atividade_eventos TO authenticated;
CREATE OR REPLACE FUNCTION public.bp_auth_e_mestre()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.usuarios WHERE auth_uid=auth.uid() AND perfil='Mestre' AND status='Aprovado');
$$;
REVOKE ALL ON FUNCTION public.bp_auth_e_mestre() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bp_auth_e_mestre() TO authenticated;
CREATE POLICY atividade_sessoes_mestre ON public.atividade_sessoes FOR SELECT TO authenticated USING(public.bp_auth_e_mestre());
CREATE POLICY atividade_eventos_mestre ON public.atividade_eventos FOR SELECT TO authenticated USING(public.bp_auth_e_mestre());
CREATE OR REPLACE FUNCTION public.bp_registrar_atividade(p_acao text,p_tela text DEFAULT NULL,p_obra text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_sessao text:=auth.jwt()->>'session_id'; v_ultima timestamptz; v_segundos bigint;
BEGIN
 IF v_uid IS NULL OR v_sessao IS NULL OR NOT EXISTS(SELECT 1 FROM public.usuarios WHERE auth_uid=v_uid AND status='Aprovado') THEN
  RAISE EXCEPTION 'Autenticação aprovada necessária.';
 END IF;
 IF p_acao NOT IN ('entrada','interacao','saida','bloqueio_inatividade','tela','pesquisa','sincronizacao','relatorio','alteracao_configuracao','alteracao_obra','gestao_usuario') THEN
  RAISE EXCEPTION 'Evento não permitido.';
 END IF;
 SELECT ultima_interacao INTO v_ultima FROM public.atividade_sessoes WHERE auth_uid=v_uid AND sessao_auth=v_sessao FOR UPDATE;
 v_segundos:=CASE WHEN v_ultima IS NOT NULL AND now()-v_ultima<=interval '60 seconds' THEN LEAST(60,GREATEST(0,extract(epoch FROM now()-v_ultima)::bigint)) ELSE 0 END;
 INSERT INTO public.atividade_sessoes(auth_uid,sessao_auth,segundos_ativos) VALUES(v_uid,v_sessao,v_segundos)
 ON CONFLICT(auth_uid,sessao_auth) DO UPDATE SET ultima_interacao=now(),segundos_ativos=atividade_sessoes.segundos_ativos+EXCLUDED.segundos_ativos;
 IF p_acao<>'interacao' THEN
  INSERT INTO public.atividade_eventos(auth_uid,sessao_auth,acao,tela,obra) VALUES(v_uid,v_sessao,p_acao,left(p_tela,80),left(p_obra,160));
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.bp_registrar_atividade(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bp_registrar_atividade(text,text,text) TO authenticated;
COMMIT;
