const LIMITE_INATIVIDADE_BP=60*60*1000;
let autenticandoSessaoBP=false,ultimaAtividadeBP=0,ultimoRegistroBP=0;
function sessaoInativaBP(agora,ultima){return ultima>0&&agora-ultima>=LIMITE_INATIVIDADE_BP;}
function chaveAtividadeBP(){return 'bp_ultima_atividade_'+usuarioAutenticado?.id;}
function atividadeMaisRecenteBP(){const salva=Number(localStorage.getItem(chaveAtividadeBP()))||0;return Math.max(ultimaAtividadeBP,salva);}
function bloquearSessaoInativaBP(){ultimaAtividadeBP=0;document.querySelectorAll('#modal-configuracoes,#modal-meus-graficos,#modal-usuarios,#tela-troca-senha').forEach(el=>el.classList.add('hidden'));executarLogout();document.getElementById('login-senha').value='';let aviso=document.getElementById('aviso-inatividade');if(!aviso){aviso=document.createElement('p');aviso.id='aviso-inatividade';aviso.className='text-sm text-amber-700 my-3';aviso.setAttribute('role','status');document.getElementById('btn-entrar').before(aviso);}aviso.textContent='Sua sessão foi bloqueada após uma hora sem interação. Informe sua senha para entrar novamente.';}
function conferirInatividadeBP(){if(!usuarioAutenticado)return false;const agora=Date.now(),ultima=atividadeMaisRecenteBP();if(sessaoInativaBP(agora,ultima)){bloquearSessaoInativaBP();return true;}return false;}
function registrarInteracaoBP(){if(!usuarioAutenticado||document.hidden)return;if(conferirInatividadeBP())return;ultimaAtividadeBP=Date.now();if(ultimaAtividadeBP-ultimoRegistroBP>=15000){localStorage.setItem(chaveAtividadeBP(),String(ultimaAtividadeBP));ultimoRegistroBP=ultimaAtividadeBP;}}
const loginAntesInatividadeBP=executarLogin;
executarLogin=async function(event){autenticandoSessaoBP=true;try{await loginAntesInatividadeBP(event);if(usuarioAutenticado){ultimaAtividadeBP=Date.now();localStorage.setItem(chaveAtividadeBP(),String(ultimaAtividadeBP));document.getElementById('aviso-inatividade')?.remove();}}finally{autenticandoSessaoBP=false;}};
const sessaoAntesInatividadeBP=verificarSessao;
verificarSessao=function(){if(usuarioAutenticado){if(autenticandoSessaoBP||!atividadeMaisRecenteBP()){ultimaAtividadeBP=Date.now();localStorage.setItem(chaveAtividadeBP(),String(ultimaAtividadeBP));}else if(conferirInatividadeBP())return;}sessaoAntesInatividadeBP();};
['pointerdown','pointermove','keydown','scroll','touchstart'].forEach(event=>document.addEventListener(event,registrarInteracaoBP,{passive:true}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)conferirInatividadeBP();});
window.addEventListener('focus',conferirInatividadeBP);
window.addEventListener('storage',event=>{if(event.key===chaveAtividadeBP())conferirInatividadeBP();});
setInterval(conferirInatividadeBP,15000);
