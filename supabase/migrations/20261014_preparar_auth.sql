BEGIN;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS auth_uid uuid UNIQUE REFERENCES auth.users(id);
UPDATE public.usuarios SET auth_uid='26be1047-9c96-4aff-8cd7-52215ece6d31',email='vinicius.figueiredo@brasilpontes.com.br'
WHERE usuario='vinicius_souzaf' AND perfil='Mestre' AND status='Aprovado';
INSERT INTO public.usuarios(auth_uid,nome,email,usuario,senha,perfil,status)
SELECT '26be1047-9c96-4aff-8cd7-52215ece6d31','Vinícius Souza (Mestre)','vinicius.figueiredo@brasilpontes.com.br','vinicius_souzaf','AUTH_GERENCIADO_'||gen_random_uuid()::text,'Mestre','Aprovado'
WHERE NOT EXISTS(SELECT 1 FROM public.usuarios WHERE auth_uid='26be1047-9c96-4aff-8cd7-52215ece6d31');
CREATE OR REPLACE FUNCTION public.bp_login_protegido_ativo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT (perfis_json->'__sistema'->>'authProtegida')::boolean FROM public.configuracoes ORDER BY id LIMIT 1),false);
$$;
GRANT EXECUTE ON FUNCTION public.bp_login_protegido_ativo() TO anon,authenticated;
COMMIT;
