-- Preserva o cadastro e o usuário do Mestre, usando sua conta Auth Gmail existente.
-- Não muda a senha Auth e não apaga obras, cadastros ou contas.
BEGIN;
DO $$
DECLARE v_uid uuid;v_mestre uuid;
BEGIN
 SELECT id INTO v_uid FROM auth.users WHERE lower(email)='viniciusfigueiredo54@gmail.com' AND email_confirmed_at IS NOT NULL;
 IF v_uid IS DISTINCT FROM '26bbcaf4-0e56-46cd-b6e2-557baa61804e'::uuid THEN RAISE EXCEPTION 'A conta Gmail validada não corresponde à preparação.'; END IF;
 SELECT id INTO v_mestre FROM public.usuarios WHERE id='cc4ae282-4c95-44bb-8248-01f9c73a8983'::uuid AND perfil='Mestre' AND status='Aprovado' FOR UPDATE;
 IF v_mestre IS NULL THEN RAISE EXCEPTION 'O cadastro Mestre não corresponde à preparação.'; END IF;
 -- O Gmail também tinha um cadastro de teste Dono. Desvincula esse cadastro
 -- sem excluí-lo, evitando dois perfis para a mesma conta e conflito de e-mail.
 UPDATE public.usuarios SET auth_uid=NULL,email='desativado+'||id::text||'@invalid.local',status='Pendente',senha='AUTH_GERENCIADO_'||gen_random_uuid()::text
 WHERE id<>v_mestre AND (auth_uid=v_uid OR lower(email)='viniciusfigueiredo54@gmail.com');
 UPDATE public.usuarios SET auth_uid=v_uid,email='viniciusfigueiredo54@gmail.com',nome='Mestre',senha='AUTH_GERENCIADO_'||gen_random_uuid()::text,trocar_senha=false WHERE id=v_mestre;
 UPDATE public.configuracoes SET titulo='Central e Controle de Custo',perfis_json=coalesce(perfis_json,'{}'::jsonb)||jsonb_build_object('__sistema',coalesce(perfis_json->'__sistema','{}'::jsonb)||jsonb_build_object('identidadeEmpresa',jsonb_build_object('nome','','logo','')));
END;
$$;
COMMIT;
