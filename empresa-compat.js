// Compatibilidade dos componentes visuais antigos. A autenticação é instalada
// por empresa-acesso.js; não carrega identidades ou rotinas de migração antigas.
let authProtegidaAtiva=false;
async function operacaoUsuariosSeguros(acao,dados={}){return servicoUsuariosCC(acao,dados);}
