function assinaturaConfiguracaoEstavel(value){if(Array.isArray(value))return '['+value.map(assinaturaConfiguracaoEstavel).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+assinaturaConfiguracaoEstavel(value[k])).join(',')+'}';return JSON.stringify(value);}
function atualizarPaginaUmaVez(chave,versao){
 const editando=document.querySelector('#modal-configuracoes:not(.hidden),#modal-meus-graficos:not(.hidden),#modal-usuarios:not(.hidden),#dialogo-custo-fluxo')||document.querySelector('#fixos-form input[name="nome"]')?.value;
 const ultima=sessionStorage.getItem('bp-atualizacao-tentada'),agora=Date.now(),tempo=Number(sessionStorage.getItem('bp-atualizacao-instante')||0);
 const recarregar=()=>{sessionStorage.setItem('bp-atualizacao-tentada',chave);sessionStorage.setItem('bp-atualizacao-instante',String(Date.now()));if(versao){const url=new URL(location.href);url.searchParams.set('v',versao);location.replace(url.href);}else location.reload();};
 if(!editando&&ultima!==chave&&agora-tempo>=60000){recarregar();return;}
 if(ultima===chave)return;
 let aviso=document.getElementById('aviso-versao');if(!aviso){aviso=document.createElement('button');aviso.id='aviso-versao';aviso.type='button';aviso.className='fixed bottom-4 right-4 z-[90] bg-blue-800 text-white p-3 rounded shadow';document.body.append(aviso);}aviso.textContent='Alterações disponíveis · atualizar';aviso.onclick=recarregar;
}
