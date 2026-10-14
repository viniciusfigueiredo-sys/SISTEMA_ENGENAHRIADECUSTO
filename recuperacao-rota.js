// Executado antes do SDK para preservar o retorno de recuperação no endereço do próprio sistema.
if(new URLSearchParams(location.hash.slice(1)).get('type')==='recovery'){
 location.replace('recuperar-senha.html'+location.hash);
}
