// Edição e organização dos painéis compartilhados por tela.
function ordemPainel(a,b){return (a.ordem||0)-(b.ordem||0);}
function camposNumericosPainel(p){return (p?.headers||[]).filter(h=>colunaBaseNumerica(p,h));}
const editorPainelOriginal=criarEditorCompartilhado;
criarEditorCompartilhado=function(tela,cfg,classe,onRemover){
 const details=elementoFixo('details',undefined,'editor-painel border rounded-xl bg-white');
 const summary=elementoFixo('summary',(cfg.titulo||'Sem título')+' · '+(classe==='kpi'?'KPI':'Gráfico'),'p-3 font-bold text-blue-800 cursor-pointer');details.append(summary);
 const box=editorPainelOriginal(tela,cfg,classe,onRemover);details.append(box);
 const layout=elementoFixo('div',undefined,'grid sm:grid-cols-2 gap-3 p-3 border-t');box.before(layout);
 criarCampoPainel(layout,'Exibição',cfg.ativo===false?'nao':'sim','text',v=>cfg.ativo=v==='sim',[['sim','Exibir'],['nao','Ocultar']]);
 criarCampoPainel(layout,'Posição na tela',cfg.posicao||'final','text',v=>cfg.posicao=v,[['inicio','Antes dos indicadores existentes'],['final','Depois das análises existentes']]);
 criarCampoPainel(layout,'Ordem de exibição',cfg.ordem||0,'number',v=>cfg.ordem=v);
 criarCampoPainel(layout,'Largura no computador',cfg.largura||'metade','text',v=>cfg.largura=v,[['metade','Metade da linha'],['total','Linha inteira']]);
 if(classe!=='kpi')criarCampoPainel(layout,'Altura do gráfico (px)',cfg.alturaGrafico||300,'number',v=>cfg.alturaGrafico=v);
 const aviso=elementoFixo('p','Escolha uma coluna numérica no eixo Y para somar. Para textos, use Contagem ou Valores distintos. No celular os painéis ocupam a largura disponível.','p-3 text-xs text-gray-600');box.before(aviso);
 details.addEventListener('input',()=>summary.textContent=(cfg.titulo||'Sem título')+' · '+(classe==='kpi'?'KPI':'Gráfico'));
 // Uma fonte recém-selecionada usa um campo numérico como medida inicial.
 const corrigirMedida=()=>{const p=fontePainel(tela,cfg.fonte),nums=camposNumericosPainel(p),key=classe==='kpi'?'campo':'y';const seletor=box.querySelector('[aria-label="'+(classe==='kpi'?'Coluna do KPI':'Eixo Y')+'"]');if(!cfg[key]||(!['contagem','distintos'].includes(cfg.agregacao)&&!nums.includes(cfg[key]))){const pago=nums.find(h=>/valor pago|valor total|previsto/.test(normalizarTextoUI(tituloColunaBase(p,h))))||nums[0];if(pago){cfg[key]=pago;if(seletor)seletor.value=pago;}else cfg.agregacao='contagem';}const agg=box.querySelector('[aria-label="Agregação"]');if(agg)agg.value=cfg.agregacao||'soma';};
 corrigirMedida();box.querySelector('[aria-label="Fonte de dados"]')?.addEventListener('change',corrigirMedida);
 return details;
};
const coletarPaineisEditorOriginal=coletarConfiguracoesTelas;
coletarConfiguracoesTelas=function(anteriores){
 const result=coletarPaineisEditorOriginal(anteriores);
 Object.entries(TELAS_CONFIG).forEach(([tela,info])=>{if(!podeConfigurar(info.grupo))return;const cfg=result[tela]||{};
 for(const item of [...(cfg.kpisFixos||[]),...(cfg.graficosFixos||[])]){
  if(item.alturaGrafico!==undefined&&(!Number.isFinite(item.alturaGrafico)||item.alturaGrafico<180||item.alturaGrafico>900))throw new Error(info.nome+': altura do gráfico deve ser de 180 a 900 px.');
  if(!Number.isFinite(item.ordem||0))throw new Error(info.nome+': informe uma ordem válida.');
  const p=fontePainel(tela,item.fonte);if(!p)continue;
  const medida=item.campo||item.y;if(!['table','list'].includes(item.tipo)&&!['contagem','distintos'].includes(item.agregacao)&&!camposNumericosPainel(p).includes(medida))throw new Error(info.nome+' · '+item.titulo+': escolha uma coluna numérica para a medida ou use Contagem / Valores distintos.');
 }
 });
 Object.entries(TELAS_CONFIG).forEach(([tela,info])=>{if(podeConfigurar(info.grupo)&&rascunhoPaineis[tela])result[tela]={...result[tela],layoutExistente:copiarConfig(rascunhoPaineis[tela].layoutExistente)};});return result;
};
function aplicarLayoutPaineis(tela){
 const cfg=configuracaoTela(tela),host=document.getElementById('painel-fixo-'+tela);if(!host)return;
 const grids=[host.children[0],host.children[1]],topId='painel-fixo-inicio-'+tela;let top=document.getElementById(topId);
 if(!top){top=elementoFixo('section',undefined,'grid gap-4 grid-cols-1 md:grid-cols-2 mb-6');top.id=topId;host.parentElement.prepend(top);}top.replaceChildren();
 for(const [i,key]of ['kpisFixos','graficosFixos'].entries()){
  const grid=grids[i];if(!grid)continue;grid.className='grid grid-cols-1 md:grid-cols-2 gap-4';
  (cfg[key]||[]).forEach((item,n)=>{const card=grid.children[n];if(!card)return;card.dataset.painelId=item.id;card.style.order=String(item.ordem||0);card.classList.toggle('painel-linha-inteira',item.largura==='total');card.hidden=item.ativo===false;
   if(i===1){const box=card.children[1];if(box&&!['table','list','gauge'].includes(item.tipo))box.style.height=(item.alturaGrafico||300)+'px';}
   if(podeConfigurar(TELAS_CONFIG[tela].grupo)){const tools=elementoFixo('div',undefined,'flex flex-wrap gap-2 mb-3 text-xs painel-acoes');for(const [label,action]of [['Editar',()=>abrirEditorTela(tela,item.id)],['Remover',()=>removerPainelCompartilhado(tela,key,item.id)]]){const b=elementoFixo('button',label,'border rounded px-3 py-1 text-blue-800');b.type='button';b.onclick=action;tools.append(b);}card.prepend(tools);}
  });
  // Move somente após mapear os índices originais.
  const cards=[...grid.children];cards.sort((a,b)=>Number(a.style.order)-Number(b.style.order)).forEach(card=>{const item=(cfg[key]||[]).find(x=>x.id===card.dataset.painelId);(item?.posicao==='inicio'?top:grid).append(card);});
 }
 if(podeConfigurar(TELAS_CONFIG[tela].grupo)){const b=elementoFixo('button','+ Adicionar gráfico ou KPI fixo','border rounded px-3 py-2 text-blue-800 text-sm painel-acoes');b.type='button';b.onclick=()=>abrirEditorTela(tela);host.prepend(b);}
 top.hidden=!top.children.length;
 Object.values(chartsCompartilhados).forEach(c=>c.resize());
}
function abrirEditorTela(tela,id){abrirModalConfiguracoes();trocarAbaConfig('telas');const details=[...document.querySelectorAll('#config-telas > details')].find(d=>d.querySelector('summary')?.textContent===TELAS_CONFIG[tela].nome);if(!details)return;details.open=true;if(id){const item=[...(rascunhoPaineis[tela]?.kpisFixos||[]),...(rascunhoPaineis[tela]?.graficosFixos||[])].find(i=>i.id===id);const editor=[...details.querySelectorAll('.editor-painel')].find(d=>d.querySelector('summary')?.textContent.startsWith(item?.titulo+' ·'));if(editor){editor.open=true;editor.scrollIntoView({block:'center'});return;}}details.scrollIntoView({block:'start'});}
async function removerPainelCompartilhado(tela,key,id){
 if(!podeConfigurar(TELAS_CONFIG[tela].grupo))return;if(!confirm('Remover este painel fixo para todos os usuários?'))return;
 try{const {data,error}=await supabaseClient.from('configuracoes').select('perfis_json').eq('id',configGlobal.idConfigSupabase||1).single();if(error)throw error;
 const perfis=copiarConfig(data.perfis_json),meta=perfis.__sistema||={},params=meta.parametros||={},cfg=params.telas?.[tela];if(!cfg)return;cfg[key]=(cfg[key]||[]).filter(i=>i.id!==id);
 const {error:err}=await supabaseClient.from('configuracoes').update({perfis_json:perfis}).eq('id',configGlobal.idConfigSupabase||1);if(err)throw err;carregarParametrosSistema(meta);await sinalizarAlteracaoCompartilhada();renderizarPaineisTela(tela);
 }catch(e){alert('Não foi possível remover: '+e.message);}
}
const renderPaineisEditorOriginal=renderizarPaineisTela;
renderizarPaineisTela=function(tela){renderPaineisEditorOriginal(tela);const view=document.getElementById('view-'+VIEWS_FIXOS[tela]);if(view&&!view.classList.contains('hidden'))aplicarLayoutPaineis(tela);};
const organizarEditorOriginal=organizarConfiguracoesPorTela;
organizarConfiguracoesPorTela=function(){organizarEditorOriginal();
 const panel=document.getElementById('config-telas');if(!panel)return;const help=elementoFixo('p','1. Escolha a tela. 2. Abra o gráfico ou KPI para editar. 3. Salve as configurações. Painéis fixos são compartilhados; Meus gráficos são pessoais.','text-sm text-gray-600 mb-3');panel.prepend(help);
 const buscar=elementoFixo('input',undefined,'border rounded p-2 w-full mb-3');buscar.placeholder='Buscar tela ou configuração';buscar.setAttribute('aria-label','Buscar configurações');buscar.oninput=()=>{const term=normalizarTextoUI(buscar.value);panel.querySelectorAll(':scope > details').forEach(d=>{d.hidden=!normalizarTextoUI(d.textContent).includes(term);});};panel.prepend(buscar);
 const status=document.getElementById('param-status'),save=elementoFixo('button','Salvar configurações das telas','bg-blue-800 text-white rounded px-4 py-2 font-bold');save.type='button';save.onclick=salvarParametrosSistema;save.className+=' salvar-telas';status?.before(save);
 Object.entries(TELAS_CONFIG).forEach(([tela,info])=>{const details=[...panel.querySelectorAll(':scope > details')].find(d=>d.querySelector('summary')?.textContent===info.nome);if(!details)return;const cfg=rascunhoPaineis[tela];cfg.layoutExistente||={};const layout=elementoFixo('details',undefined,'border rounded p-3 mt-3');layout.append(elementoFixo('summary','Tamanho e ordem dos elementos existentes','font-bold cursor-pointer'));layout.append(elementoFixo('p','A ordem e a largura se aplicam dentro do grupo original de cada elemento. A altura se aplica aos gráficos.','text-xs text-gray-600 my-2'));
 Object.entries(info.itens).forEach(([id,nome])=>{const item=cfg.layoutExistente[id]||={};const row=elementoFixo('fieldset',undefined,'grid sm:grid-cols-3 gap-3 border-t py-3');row.append(elementoFixo('legend',nome,'text-xs font-bold'));criarCampoPainel(row,'Ordem no grupo',item.ordem||0,'number',v=>item.ordem=v);criarCampoPainel(row,'Largura no grupo',item.largura||'original','text',v=>item.largura=v,[['original','Original'],['total','Linha inteira']]);if(/grafico|chart/.test(id))criarCampoPainel(row,'Altura (px)',item.altura||300,'number',v=>item.altura=v);layout.append(row);});if(!podeConfigurar(info.grupo))layout.querySelectorAll('input,select').forEach(el=>el.disabled=true);details.append(layout);});
};
const aplicarLayoutEditorOriginal=aplicarConfiguracoesTelas;
aplicarConfiguracoesTelas=function(){aplicarLayoutEditorOriginal();Object.keys(TELAS_CONFIG).forEach(tela=>{Object.entries(configuracaoTela(tela).layoutExistente||{}).forEach(([id,cfg])=>{const el=document.getElementById(id);if(!el)return;const card=el.tagName==='CANVAS'?el.parentElement?.closest('.bg-white')||el.parentElement:id.startsWith('kpi-')?el.closest('.bg-white')||el:el;
 card.style.order=String(cfg.ordem||0);card.style.gridColumn=cfg.largura==='total'?'1 / -1':'';
 if(cfg.altura&&el.tagName==='CANVAS')el.parentElement.style.height=Math.min(900,Math.max(180,cfg.altura))+'px';
 });});};
