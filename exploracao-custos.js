// Resumo visual; os cadastros e os filtros da base permanecem independentes.
function resumirGruposExploracaoBP(rows,limite=10){
 const ordenados=rows.slice().sort((a,b)=>b.valor-a.valor||a.label.localeCompare(b.label,'pt-BR'));
 if(!limite||ordenados.length<=limite)return ordenados;
 return [...ordenados.slice(0,limite),{label:'Outros',valor:ordenados.slice(limite).reduce((s,r)=>s+r.valor,0),membros:ordenados.slice(limite)}];
}
function registrosExploracaoBP(tela){
 const obra=obrasBD[obraAtivaID];if(!obra)return [];
 if(tela==='fixos'){const {inicio,fim}=periodoCustosAtual();return (obra.custosFixos||[]).filter(c=>c.ativo&&!c.excluido&&categoriaEstaSelecionada(c.categoria)&&custoPassaFiltroTabela(c)).map(c=>({categoria:c.categoria,fornecedor:c.fornecedor,item:c.nome,valor:ocorrenciasCusto(c,inicio,fim)*c.valor*c.quantidade}));}
 if(tela==='recorrentes')return resumoRecorrentes(obra).linhas.map(g=>({categoria:g.categoria,fornecedor:g.fornecedor,item:g.categoria,valor:g.pago}));
 const rows=[];dadosBasePlanilhas.filter(p=>tela==='previsto'?p.id===`previsto-${obraAtivaID}`:p.tipo==='Realizado').forEach(p=>{
 const achar=re=>p.headers.find(h=>re.test(normalizarTextoUI(tituloColunaBase(p,h))));
 const campos=tela==='previsto'?{categoria:achar(/categoria|natureza/),valor:achar(/custo total|valor total/)||achar(/^valor$/)||achar(/valor|custo/)}:obterCamposRealizado(p.headers,p.rows,p.id);
 const fornecedor=achar(/^fornecedor$/),item=achar(/descricao|historico|^item$/);
 linhasDaObra(p,obra).forEach(row=>{if(campos.valor&&linhaPassaFiltroInterativo(p,row,campos.categoria))rows.push({categoria:row[campos.categoria]||'Sem categoria',fornecedor:row[fornecedor]||'Não informado',item:row[item]||row[fornecedor]||'Não informado',valor:parseMonetario(row[campos.valor])*(tela==='previsto'?multiplicadorCenario:1)});});
 });return rows;
}
function abrirExploracaoCustosBP(tela,categoriaInicial='',opcoes={}){
 const registros=registrosExploracaoBP(tela),dialog=document.createElement('dialog');dialog.className='bp-explorar-custos';
 const titulo=document.createElement('h2');titulo.textContent='Explorar custos · '+TELAS_CONFIG[tela].nome;
 const nota=document.createElement('p');nota.textContent=obrasBD[obraAtivaID].nome+' · '+(tela==='fixos'?'Parâmetros fixos no período':tela==='previsto'?'Orçamento previsto':tela==='recorrentes'?'Pagamentos recorrentes':'Pagamentos realizados')+' · filtros atuais. Esta exploração não altera os filtros da tela.';
 const controles=document.createElement('div');controles.className='bp-explorar-controles';
 function select(nome,options,value){const label=document.createElement('label');label.textContent=nome;const s=document.createElement('select');s.setAttribute('aria-label',nome);options.forEach(([v,t])=>s.add(new Option(t,v)));s.value=value;label.append(s);controles.append(label);return s;}
 const categoria=select('Categoria da exploração',[['','Todas as categorias'],...[...new Set(registros.map(r=>r.categoria))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(c=>[c,c])],categoriaInicial);
 const agrupar=select('Mostrar por',[['categoria','Categoria'],['fornecedor','Fornecedor'],['item','Item / descrição']],opcoes.agrupar||(categoriaInicial?'fornecedor':'categoria'));
 const limite=select('Quantidade de grupos',[['5','Top 5'],['10','Top 10'],['20','Top 20'],['0','Todos']],String(configuracaoTela(tela).exploracaoLimite??10));
 const busca=document.createElement('input');busca.type='search';busca.placeholder='Pesquisar fornecedor, categoria ou item (% = ou)';busca.setAttribute('aria-label','Pesquisar na exploração');controles.append(busca);
 const total=document.createElement('p'),voltar=document.createElement('button'),box=document.createElement('div'),canvas=document.createElement('canvas'),tabela=document.createElement('div'),fechar=document.createElement('button');
 box.style.height='350px';box.append(canvas);tabela.className='bp-explorar-tabela';voltar.textContent='Voltar a todos os grupos';voltar.type=fechar.type='button';fechar.textContent='Fechar';
 dialog.append(titulo,nota,controles,total,voltar,box,tabela,fechar);document.body.append(dialog);let chart=null,outros=opcoes.membros?new Set(opcoes.membros):null,selecionados=new Set();
 function desenhar(){chart?.destroy();const termos=normalizarTextoUI(busca.value).split('%').map(s=>s.trim()).filter(Boolean),base=registros.filter(r=>(!categoria.value||r.categoria===categoria.value)&&(!termos.length||termos.some(t=>normalizarTextoUI([r.categoria,r.fornecedor,r.item].join(' ')).includes(t))));
 const grupos=new Map();base.forEach(r=>{const label=String(r[agrupar.value]||'Não informado');grupos.set(label,(grupos.get(label)||0)+r.valor);});
 let todos=[...grupos].map(([label,valor])=>({label,valor}));if(outros)todos=todos.filter(r=>outros.has(r.label));const soma=todos.reduce((s,r)=>s+r.valor,0),selecionadosRows=todos.filter(r=>selecionados.has(r.label));
 const shown=resumirGruposExploracaoBP(todos,Number(limite.value));voltar.hidden=!outros;
 total.textContent='Total: '+brl(soma)+' · '+todos.length+' grupos'+(selecionadosRows.length?' · '+selecionadosRows.length+' selecionados: '+brl(selecionadosRows.reduce((s,r)=>s+r.valor,0)):'')+' · Todos os grupos entram no total, inclusive Outros.';
 const filtrar=r=>{if(r.membros){outros=new Set(r.membros.map(m=>m.label));selecionados.clear();}else if(agrupar.value==='categoria'){categoria.value=r.label;agrupar.value='fornecedor';outros=null;selecionados.clear();}else{selecionados.has(r.label)?selecionados.delete(r.label):selecionados.add(r.label);}desenhar();};
 const visiveis=selecionadosRows.length?resumirGruposExploracaoBP(selecionadosRows,Number(limite.value)):shown;
 chart=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels:visiveis.map(r=>r.label),datasets:[{label:'Valor',data:visiveis.map(r=>r.valor),backgroundColor:visiveis.map(r=>r.membros?'#94a3b8':'#003399')}]},options:{bpSemExploracao:true,responsive:true,maintainAspectRatio:false,indexAxis:'y',onClick:(e,els)=>{if(els.length)filtrar(visiveis[els[0].index]);},plugins:{tooltip:{callbacks:{label:i=>brl(i.raw)+' · '+(soma?Number(i.raw)/soma*100:0).toFixed(2)+'%'}}}}});
 tabela.replaceChildren();const table=document.createElement('table'),head=document.createElement('tr');['Selecionar','Grupo','Valor','% do total'].forEach(t=>{const th=document.createElement('th');th.textContent=t;head.append(th);});table.append(head);
 shown.forEach(r=>{const tr=document.createElement('tr'),td=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.checked=r.membros?r.membros.every(m=>selecionados.has(m.label)):selecionados.has(r.label);check.setAttribute('aria-label','Selecionar '+r.label);check.onchange=()=>{(r.membros||[r]).forEach(m=>check.checked?selecionados.add(m.label):selecionados.delete(m.label));desenhar();};td.append(check);tr.append(td);const nome=document.createElement('td'),button=document.createElement('button');button.type='button';button.textContent=r.label;button.title=r.label;button.onclick=()=>filtrar(r);nome.append(button);tr.append(nome);[brl(r.valor),(soma?r.valor/soma*100:0).toFixed(2)+'%'].forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.append(td);});table.append(tr);});tabela.append(table);
 }
 [categoria,agrupar,limite].forEach(s=>s.onchange=()=>{outros=null;selecionados.clear();desenhar();});let timer;busca.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{outros=null;selecionados.clear();desenhar();},200);};voltar.onclick=()=>{outros=null;selecionados.clear();desenhar();};fechar.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{clearTimeout(timer);chart?.destroy();dialog.remove();},{once:true});dialog.showModal();desenhar();
}
Chart.register({id:'explorarCustosBP',afterInit(chart){queueMicrotask(()=>{if(!chart.ctx||chart.config.options.bpSemExploracao)return;const view=chart.canvas.closest('[id^="view-"]'),tela=Object.keys(VIEWS_FIXOS).find(t=>'view-'+VIEWS_FIXOS[t]===view?.id);if(!tela)return;const botao=document.createElement('button');botao.type='button';botao.className='bp-explorar-abrir';botao.textContent='Explorar custos';botao.title='Resumo por categoria; abra fornecedores e itens, Top 5/10/20 e Outros.';botao.onclick=()=>abrirExploracaoCustosBP(tela);chart.canvas.parentElement.before(botao);chart.$explorarBP=botao;});},afterDestroy(chart){chart.$explorarBP?.remove();}});
// O limite padrão é compartilhado pela configuração existente de cada tela.
const organizarAntesExploracaoBP=organizarConfiguracoesPorTela;
organizarConfiguracoesPorTela=function(){organizarAntesExploracaoBP();Object.entries(TELAS_CONFIG).forEach(([tela,info])=>{const ordem=document.getElementById('tela-'+tela+'-ordem');if(!ordem||document.getElementById('tela-'+tela+'-exploracao'))return;const label=document.createElement('label');label.className='block my-3 text-sm';label.textContent='Detalhamento de custos · grupos iniciais ';const select=document.createElement('select');select.id='tela-'+tela+'-exploracao';select.className='border rounded p-2';[['5','Top 5 e Outros'],['10','Top 10 e Outros'],['20','Top 20 e Outros'],['0','Todos']].forEach(([v,t])=>select.add(new Option(t,v)));select.value=String(configuracaoTela(tela).exploracaoLimite??10);select.disabled=!podeConfigurar(info.grupo);label.append(select);ordem.parentElement.after(label);});};
const coletarAntesExploracaoBP=coletarConfiguracoesTelas;
coletarConfiguracoesTelas=function(anteriores){const result=coletarAntesExploracaoBP(anteriores);Object.entries(TELAS_CONFIG).forEach(([tela,info])=>{const el=document.getElementById('tela-'+tela+'-exploracao');if(el&&podeConfigurar(info.grupo))result[tela]={...result[tela],exploracaoLimite:Number(el.value)};});return result;};
