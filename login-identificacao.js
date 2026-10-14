// Usa o vínculo já cadastrado para aceitar usuário ou e-mail no login Auth.
async function emailDoUsuarioLogin(identificacao){
 if(identificacao.includes('@'))return identificacao;
 const {data,error}=await supabaseClient.from('usuarios').select('email,auth_uid').eq('usuario',identificacao).maybeSingle();
 if(error||!data?.auth_uid||!data.email)return null;
 return data.email;
}
const funcoesLoginIdentificacao=new WeakSet();
function permitirLoginPorUsuarioOuEmail(){
 const anterior=executarLogin;if(funcoesLoginIdentificacao.has(anterior))return;
 executarLogin=async function(event){
  const campo=document.getElementById('login-usuario'),identificacao=campo.value.trim();
  if(!identificacao||identificacao.includes('@'))return anterior(event);
  if(event)event.preventDefault();const button=document.getElementById('btn-entrar');if(button.disabled)return;button.disabled=true;
  let email=null;try{email=await emailDoUsuarioLogin(identificacao);}catch(e){}finally{button.disabled=false;}
  if(!email){if(authProtegidaAtiva){document.getElementById('solic-status').textContent='Usuário ou senha incorretos.';return;}return anterior(event);}
  campo.value=email;try{return await anterior(event);}finally{campo.value=identificacao;}
 };
 funcoesLoginIdentificacao.add(executarLogin);
 const campo=document.getElementById('login-usuario');campo.placeholder='Digite seu usuário ou e-mail';campo.autocomplete='username';
}
permitirLoginPorUsuarioOuEmail();
const carregarAntesIdentificacao=window.onload;
window.onload=async function(event){try{await carregarAntesIdentificacao.call(this,event);}finally{permitirLoginPorUsuarioOuEmail();}};
