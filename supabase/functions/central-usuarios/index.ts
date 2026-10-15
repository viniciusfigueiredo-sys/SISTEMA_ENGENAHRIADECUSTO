import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SITE='https://viniciussouzaf.github.io';
const headers={'Access-Control-Allow-Origin':SITE,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST'||req.headers.get('origin')!==SITE)return reply({erro:'Origem ou método inválido.'},403);
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await req.json(),acao=body.acao;
  if(!['identificar','solicitar','criar','editar','aprovar'].includes(acao))return reply({erro:'Operação inválida.'},400);
  if(acao==='identificar'){
   const usuario=String(body.usuario||'').trim();if(!/^[\p{L}\p{N}_.-]{1,100}$/u.test(usuario))return reply({email:null});
   const {data,error}=await admin.from('usuarios').select('email').eq('usuario',usuario).eq('status','Aprovado').maybeSingle();if(error)throw error;return reply({email:data?.email||null});
  }
  if(acao!=='solicitar'){
   const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return reply({erro:'Entre novamente.'},401);
   const {data,error}=await admin.auth.getUser(token);if(error||!data.user)return reply({erro:'Sessão inválida.'},401);
   const {data:perfil,error:pErro}=await admin.from('usuarios').select('perfil,status,trocar_senha').eq('auth_uid',data.user.id).single();
   if(pErro||perfil?.perfil!=='Mestre'||perfil.status!=='Aprovado'||perfil.trocar_senha)return reply({erro:'Somente o Mestre autenticado.'},403);
  }
  if(acao==='solicitar'){
   const {count,error}=await admin.from('usuarios').select('id',{count:'exact',head:true}).eq('status','Pendente').gte('created_at',new Date(Date.now()-600000).toISOString());if(error)throw error;if((count||0)>=10)return reply({erro:'Muitas solicitações recentes. Tente mais tarde.'},429);
  }
  const {data:cfg,error:cfgErro}=await admin.from('configuracoes').select('perfis_json').limit(1).single();if(cfgErro)throw cfgErro;
  const perfis=['Mestre','Engenheiro','Orçamentista','Dono',...Object.keys(cfg?.perfis_json||{}).filter(p=>p!=='__sistema')];
  if(acao==='solicitar'||acao==='criar'){
   const nome=String(body.nome||'').trim(),email=String(body.email||'').trim().toLowerCase(),usuario=String(body.usuario||'').trim(),senha=body.senha;
   if(!nome||nome.length>160||!/^\S+@\S+\.\S+$/.test(email)||!/^\S{1,100}$/.test(usuario)||/[(),]/.test(usuario)||typeof senha!=='string'||senha.length<8)return reply({erro:'Informe nome, e-mail, usuário e senha com pelo menos 8 caracteres.'},400);
   const aprovado=acao==='criar',perfil=String(body.perfil||'Engenheiro').trim();if(aprovado&&!perfis.includes(perfil))return reply({erro:'Perfil inválido.'},400);
   const publicados=cfg?.perfis_json?.__sistema?.perfisCadastro,liberados=(Array.isArray(publicados)?publicados:perfis).filter((p:string)=>p!=='Mestre'&&perfis.includes(p));
   if(!aprovado&&!liberados.includes(perfil)&&!/^Solicitado: .{1,80}$/.test(perfil))return reply({erro:'Escolha um perfil disponível ou informe um novo perfil para avaliação.'},400);
   const {data:existentes,error:eErro}=await admin.from('usuarios').select('id').or(`usuario.eq.${usuario},email.eq.${email}`).limit(1);if(eErro)throw eErro;if(existentes?.length)return reply({erro:'Usuário ou e-mail já cadastrado.'},409);
   const {data,error}=await admin.auth.admin.createUser({email,password:senha,email_confirm:aprovado,user_metadata:{nome}});if(error)throw error;
   const {error:salvar}=await admin.from('usuarios').insert({auth_uid:data.user.id,nome,email,usuario,senha:'AUTH_GERENCIADO_'+crypto.randomUUID(),perfil:perfil.slice(0,120),status:aprovado?'Aprovado':'Pendente',trocar_senha:aprovado&&!!body.trocar_senha});
   if(salvar){await admin.auth.admin.deleteUser(data.user.id);throw salvar;}return reply({ok:true});
  }
  const {data:u,error:uErro}=await admin.from('usuarios').select('id,auth_uid,perfil').eq('id',body.id).single();if(uErro)throw uErro;if(!u.auth_uid)return reply({erro:'Conta sem vínculo com autenticação protegida.'},409);
  if(acao==='aprovar'){
   const {data:pedido}=await admin.from('usuarios').select('perfil').eq('id',u.id).single();if(!perfis.includes(pedido?.perfil))return reply({erro:'Crie ou escolha um perfil disponível antes de aprovar.'},400);
   const {error}=await admin.auth.admin.updateUserById(u.auth_uid,{email_confirm:true});if(error)throw error;const {error:salvar}=await admin.from('usuarios').update({status:'Aprovado'}).eq('id',u.id);if(salvar)throw salvar;return reply({ok:true});
  }
  const perfil=String(body.perfil||'');if(!perfis.includes(perfil))return reply({erro:'Perfil inválido.'},400);
  const nome=String(body.nome||'').trim(),email=String(body.email||'').trim(),usuario=String(body.usuario||'').trim();if(!nome||!/^\S+@\S+\.\S+$/.test(email)||!usuario)return reply({erro:'Preencha nome, e-mail e usuário.'},400);
  const changes:Record<string,unknown>={email};if(body.senha){if(typeof body.senha!=='string'||body.senha.length<8)return reply({erro:'Use pelo menos 8 caracteres.'},400);changes.password=body.senha;}
  if(u.perfil==='Mestre'&&perfil!=='Mestre'){const {count}=await admin.from('usuarios').select('id',{count:'exact',head:true}).eq('perfil','Mestre').eq('status','Aprovado');if((count||0)<=1)return reply({erro:'Mantenha pelo menos um Mestre aprovado.'},400);}
  const {error}=await admin.auth.admin.updateUserById(u.auth_uid,changes);if(error)throw error;
  const {error:salvar}=await admin.from('usuarios').update({nome,email,usuario,perfil,trocar_senha:!!body.trocar_senha}).eq('id',u.id);if(salvar)throw salvar;return reply({ok:true});
 }catch(_e){return reply({erro:'Não foi possível concluir. Confira os dados e a disponibilidade do serviço.'},400);}
});
