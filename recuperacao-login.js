// Recuperação pelo Supabase Auth: nenhuma senha é gravada nas tabelas de cadastro.
let contaRecuperadaAuth=false,envioRecuperacaoEmAndamento=false,ultimoEnvioRecuperacao=0;
function abrirRecuperacaoLogin(){document.getElementById('box-login').classList.add('hidden');document.getElementById('box-solicitacao').classList.add('hidden');document.getElementById('box-recuperacao-login').classList.remove('hidden');const email=document.getElementById('recuperacao-email');const login=document.getElementById('login-usuario').value.trim();if(login.includes('@'))email.value=login;email.focus();}
function voltarLoginRecuperacao(){document.getElementById('box-recuperacao-login').classList.add('hidden');exibirFormLogin();}
async function enviarLinkRecuperacao(event){event.preventDefault();const form=event.currentTarget,status=document.getElementById('recuperacao-login-status'),button=document.getElementById('btn-enviar-recuperacao');if(!form.reportValidity()||envioRecuperacaoEmAndamento)return;if(Date.now()-ultimoEnvioRecuperacao<60000){status.textContent='Aguarde um minuto antes de solicitar outro link.';return;}envioRecuperacaoEmAndamento=true;button.disabled=true;status.textContent='Solicitando link de recuperação…';try{if(!supabaseClient)throw new Error('Conexão de autenticação indisponível.');const email=document.getElementById('recuperacao-email').value.trim();const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:new URL('recuperar-senha.html',location.href).href});ultimoEnvioRecuperacao=Date.now();if(error)throw error;status.textContent='Se o e-mail estiver vinculado a uma conta de acesso, você receberá um link para criar uma nova senha. Confira também o spam. Depois entre no sistema usando seu e-mail e a nova senha.';}catch(e){status.textContent=/rate|limit|seconds/i.test(e.message)?'Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.':'Não foi possível solicitar a recuperação. Tente novamente mais tarde ou peça ajuda ao Mestre.';}finally{envioRecuperacaoEmAndamento=false;button.disabled=false;}}
const loginAntesRecuperacao=executarLogin;
executarLogin=async function(event){
 if(authProtegidaAtiva)return loginAntesRecuperacao(event);
 const email=document.getElementById('login-usuario').value.trim(),password=document.getElementById('login-senha').value;
 if(!email.includes('@')||!password)return loginAntesRecuperacao(event);if(event)event.preventDefault();const button=document.getElementById('btn-entrar');button.disabled=true;
 try{const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)return await loginAntesRecuperacao(event);
  // A sessão validada no servidor deve estar vinculada a um cadastro aprovado.
  const {data:perfil,error:erro}=await supabaseClient.from('usuarios').select('id,auth_uid,nome,email,usuario,perfil,status,trocar_senha').eq('auth_uid',data.user.id).single();
  if(erro||!perfil||perfil.status!=='Aprovado'){await supabaseClient.auth.signOut({scope:'local'});document.getElementById('solic-status').textContent='A conta ainda não possui acesso aprovado ao sistema.';return;}
  if(perfil.trocar_senha){await supabaseClient.auth.signOut({scope:'local'});document.getElementById('solic-status').textContent='Sua conta exige troca de senha. Solicite ao Mestre a conclusão da configuração do acesso protegido.';return;}
  contaRecuperadaAuth=true;usuarioAutenticado=perfil;ultimaAtividadeBP=Date.now();localStorage.setItem(chaveAtividadeBP(),String(ultimaAtividadeBP));localStorage.setItem('usuario_bp_id',perfil.id);document.getElementById('login-senha').value='';verificarSessao();
 }catch(e){document.getElementById('solic-status').textContent='Não foi possível validar o acesso. Tente novamente.';}finally{button.disabled=false;}
};
const logoutAntesRecuperacao=executarLogout;
executarLogout=function(){if(contaRecuperadaAuth){contaRecuperadaAuth=false;supabaseClient.auth.signOut({scope:'local'}).catch(()=>{});}return logoutAntesRecuperacao();};
