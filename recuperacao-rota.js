// Executado antes do SDK para preservar o retorno de recuperação no endereço do próprio sistema.
const retornoSenha=new URLSearchParams(location.hash.slice(1));
if(retornoSenha.get('type')==='recovery'||retornoSenha.has('error_code')){
 location.replace('recuperar-senha.html'+location.hash);
}
