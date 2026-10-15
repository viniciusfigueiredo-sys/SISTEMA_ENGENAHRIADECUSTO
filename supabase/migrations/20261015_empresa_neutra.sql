-- Criar a função não apaga dados. A API exige a sessão do próprio Mestre mantido.
-- O proprietário também pode executá-la no SQL Editor.
BEGIN;
CREATE OR REPLACE FUNCTION public.cc_zerar_empresa(p_confirmacao text,p_email_mestre text,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_mestre public.usuarios%ROWTYPE;v_uid uuid;v_geracao text:=gen_random_uuid()::text;
 v_obras bigint;v_usuarios bigint;v_auth bigint;
BEGIN
 IF p_confirmacao IS DISTINCT FROM 'ZERAR EMPRESA' OR length(trim(coalesce(p_motivo,'')))<5 THEN
  RAISE EXCEPTION 'Confirmação e motivo da limpeza são obrigatórios.';
 END IF;
 SELECT * INTO v_mestre FROM public.usuarios WHERE lower(email)=lower(trim(p_email_mestre)) AND perfil='Mestre' AND status='Aprovado' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'O Mestre aprovado informado não existe. Nenhum dado foi apagado.'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated','service_role') AND auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Autenticação necessária.';
 END IF;
 IF auth.uid() IS NOT NULL AND (auth.uid() IS DISTINCT FROM v_mestre.auth_uid OR coalesce(v_mestre.trocar_senha,false)) THEN
  RAISE EXCEPTION 'Somente o próprio Mestre autenticado pode zerar a empresa mantendo sua conta.';
 END IF;
 SELECT id INTO v_uid FROM auth.users WHERE id=v_mestre.auth_uid AND lower(email)=lower(trim(p_email_mestre)) AND email_confirmed_at IS NOT NULL;
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Valide primeiro a conta protegida do Mestre com esse e-mail. Nenhum dado foi apagado.'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'Existem arquivos no Storage. Remova-os pelo gerenciador de arquivos antes de zerar; a limpeza foi cancelada.'; END IF;
 SELECT count(*) INTO v_obras FROM public.obras;
 SELECT count(*) INTO v_usuarios FROM public.usuarios WHERE id<>v_mestre.id;
 SELECT count(*) INTO v_auth FROM auth.users WHERE id<>v_uid;
 -- Não usar CASCADE: uma dependência não prevista deve cancelar a transação.
 DELETE FROM public.obras;
 DELETE FROM public.usuarios WHERE id<>v_mestre.id;
 IF to_regclass('public.atividade_eventos') IS NOT NULL THEN EXECUTE 'DELETE FROM public.atividade_eventos'; END IF;
 IF to_regclass('public.atividade_sessoes') IS NOT NULL THEN EXECUTE 'DELETE FROM public.atividade_sessoes'; END IF;
 DELETE FROM auth.sessions;
 DELETE FROM auth.refresh_tokens;
 DELETE FROM auth.users WHERE id<>v_uid;
 UPDATE public.usuarios SET nome='Mestre',trocar_senha=false WHERE id=v_mestre.id;
 DELETE FROM public.configuracoes WHERE id<>(SELECT min(id) FROM public.configuracoes);
 UPDATE public.configuracoes SET titulo='Central e Controle de Custo',url_realizado='',
  perfis_json=jsonb_build_object('__sistema',jsonb_build_object(
   'identidadeEmpresa',jsonb_build_object('nome','','logo',''),
   'empresaGeracao',v_geracao,'revisaoPlanilhas',v_geracao,
   'limpezaEmpresa',jsonb_build_object('em',now(),'motivo',trim(p_motivo),'mestreUid',v_uid))),
  revisao_dados=v_geracao;
 IF NOT FOUND THEN INSERT INTO public.configuracoes(id,titulo,url_realizado,perfis_json,revisao_dados)
  VALUES(1,'Central e Controle de Custo','',jsonb_build_object('__sistema',jsonb_build_object('empresaGeracao',v_geracao)),v_geracao); END IF;
 RETURN jsonb_build_object('concluido',true,'obrasRemovidas',v_obras,'usuariosRemovidos',v_usuarios,'contasAuthRemovidas',v_auth,'mestreMantido',p_email_mestre,'geracao',v_geracao);
END;
$$;
REVOKE ALL ON FUNCTION public.cc_zerar_empresa(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cc_zerar_empresa(text,text,text) TO authenticated;
COMMIT;
