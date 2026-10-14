let filtroAutomaticoTabela=null,timerSelecaoAutomatica;
const identidadeLinhasTabela=new WeakMap();let contadorLinhaTabela=0;
function chaveRegistroTabela(row){if(row?.__custoId)return row.__custoId;if(!identidadeLinhasTabela.has(row))identidadeLinhasTabela.set(row,String(++contadorLinhaTabela));return identidadeLinhasTabela.get(row);}
function atualizarPaineisPorFiltro(){const tela=Object.keys(VIEWS_FIXOS).find(t=>!document.getElementById('view-'+VIEWS_FIXOS[t])?.classList.contains('hidden'));dadosBasePaginaAtual=0;previstoPaginaAtual=0;atualizarDashboard();if(tela&&tela!=='dashboard')abrirAbaSistema(tela);}
function propagarFiltroTabela(key,state,ctx,headers){
 if(filtroAutomaticoTabela&&filtroAutomaticoTabela.key!==key){filtroAutomaticoTabela.state.filtros={};filtroAutomaticoTabela.state.selecionadas.clear();filtroAutomaticoTabela.state.registros?.clear();}
 const temFiltros=Object.values(state.filtros).some(v=>String(v).trim()),temSelecao=state.selecionadas.size>0;
 if(!temFiltros&&!temSelecao){if(filtroAutomaticoTabela?.key===key)filtroAutomaticoTabela=null;atualizarPaineisPorFiltro();return;}
 const novo={key,state,ctx,headers,obraId:obraAtivaID,categorias:new Set(),registros:new Set(),custos:new Set()};
 if(ctx.fonte){const p=ctx.fonte,cols=ctx.headers||p.headers;let rows=linhasDaObraParaFiltro(p);rows=rows.filter(row=>passaFiltrosTabela(row,cols,state));
  if(temSelecao){const escolhidas=new Set([...(state.registros?.entries()||[])].filter(([k])=>state.selecionadas.has(k)).map(([,r])=>r));if(p.id.startsWith('@')){const ids=new Set([...escolhidas].map(row=>row.__custoId||JSON.stringify(row)));rows=rows.filter(row=>ids.has(row.__custoId||JSON.stringify(row)));}else rows=rows.filter(row=>escolhidas.has(row));}
  novo.registros=new Set(rows);const cat=p.headers.find(h=>/categoria|natureza/.test(normalizarTextoUI(tituloColunaBase(p,h))));rows.forEach(row=>{if(cat)novo.categorias.add(normalizarTextoUI(row[cat]));if(row.__custoId)novo.custos.add(row.__custoId);});
 }else if(ctx.tipo==='custos'){const cs=obrasBD[obraAtivaID]?.custosFixos||[];cs.filter(c=>!c.excluido).forEach(c=>{const vals=valoresResumoCustoTabela(c);if(passaValoresTabela(vals,state)&&(!temSelecao||state.selecionadas.has(c.id))){novo.custos.add(c.id);novo.categorias.add(normalizarTextoUI(c.categoria));}});}
 filtroAutomaticoTabela=novo;atualizarPaineisPorFiltro();
}
function linhasDaObraParaFiltro(p){return p.id.startsWith('@')?p.rows:linhasDaObra(p,obrasBD[obraAtivaID]);}
function passaValoresTabela(values,state){return Object.entries(state.filtros).every(([i,v])=>correspondePesquisa([values[Number(i)]??''],v));}
function valoresResumoCustoTabela(c){const {inicio,fim}=periodoCustosAtual();return [c.nome+(c.ativo?'':' (arquivado)'),c.fornecedor,c.categoria,brl(c.valor),String(c.quantidade),'A cada '+c.intervalo+' '+c.unidade,brl(c.ativo?ocorrenciasCusto(c,inicio,fim)*c.valor*c.quantidade:0),''];}
function agendarSelecaoTabela(key,state,ctx,headers,checks){if(key.startsWith('demonstrativo:'))return;state.registros||=new Map();checks.forEach((item,i)=>{if(item.checkbox.checked&&ctx.raw?.[i])state.registros.set(item.tr.dataset.chaveLinha,ctx.raw[i]);else if(!item.checkbox.checked)state.registros.delete(item.tr.dataset.chaveLinha);});clearTimeout(timerSelecaoAutomatica);timerSelecaoAutomatica=setTimeout(()=>propagarFiltroTabela(key,state,ctx,headers),80);}
const linhaPassaAntesTabelaAutomatica=linhaPassaFiltroInterativo;
linhaPassaFiltroInterativo=function(p,row,cat){if(!linhaPassaAntesTabelaAutomatica(p,row,cat))return false;const f=filtroAutomaticoTabela;if(!f||f.obraId!==obraAtivaID||f.key.startsWith('demonstrativo:')||contextoTabela?.key===f.key)return true;
 if(f.ctx.fonte?.id===p.id){if(p.id.startsWith('@'))return f.custos.size?f.custos.has(row.__custoId):[...f.registros].some(r=>JSON.stringify(r)===JSON.stringify(row));return f.registros.has(row);}
 return cat?f.categorias.has(normalizarTextoUI(row[cat])):true;
};
function custoPassaFiltroTabela(c){const f=filtroAutomaticoTabela;if(!f||f.obraId!==obraAtivaID||contextoTabela?.key===f.key)return true;if(f.ctx.tipo==='custos'||f.ctx.fonte?.id==='@fixos')return f.custos.has(c.id);if(f.key.startsWith('demonstrativo:'))return resumoPassaFiltroTabela({cat:c.categoria,previsto:obrasBD[obraAtivaID]?.categoriasPrevisto?.[c.categoria]||0,realizado:obrasBD[obraAtivaID]?.categoriasRealizado?.[c.categoria]||0});return f.categorias.has(normalizarTextoUI(c.categoria));}
function resumoPassaFiltroTabela(l){const f=filtroAutomaticoTabela;if(!f||f.obraId!==obraAtivaID)return true;if(!f.key.startsWith('demonstrativo:'))return f.categorias.has(normalizarTextoUI(l.cat));const uso=l.previsto?l.realizado/l.previsto*100:null,farol=classificarFarol(l.previsto,l.realizado);return passaValoresTabela(['',l.cat,brl(l.previsto),brl(l.realizado),uso===null?(l.realizado?'∞':'0.0%'):uso.toFixed(1)+'%',brl(l.previsto-l.realizado),l.previsto===0&&l.realizado>0?'🔴 N/P':farol==='red'?'🔴 ESTOURADO':farol==='amber'?'🟡 ATENÇÃO':'🟢 SEGURO'],f.state);}
// A tabela continua oferecendo as demais categorias para ampliar a seleção.
const obterRealizadoAntesSelecao=obterRealizadoFiltradoDashboard;
obterRealizadoFiltradoDashboard=function(obra){const cats=categoriasSelecionadas,cat=filtrosDashboard.categoria;categoriasSelecionadas=[];filtrosDashboard.categoria='';try{return obterRealizadoAntesSelecao(obra);}finally{categoriasSelecionadas=cats;filtrosDashboard.categoria=cat;}};
const limparFiltrosAntesAutomatico=limparFiltrosDashboard;
limparFiltrosDashboard=function(){filtroAutomaticoTabela=null;estadosTabelas.forEach(s=>{s.filtros={};s.selecionadas.clear();s.registros?.clear();});limparFiltrosAntesAutomatico();};
const alterarObraAntesAutomatico=alterarObraAtiva;
alterarObraAtiva=function(id){filtroAutomaticoTabela=null;return alterarObraAntesAutomatico(id);};
const renderSelecaoAntesTabelaAuto=renderizarSelecaoInterativa;
renderizarSelecaoInterativa=function(){renderSelecaoAntesTabelaAuto();if(!filtroAutomaticoTabela)return;document.querySelectorAll('[id$="-selecao"]').forEach(host=>{const aviso=document.createElement('span');aviso.className='text-xs font-bold text-blue-800';aviso.textContent='Filtro da tabela ativo · cálculos e gráficos atualizados automaticamente';host.append(aviso);});};
