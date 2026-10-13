// Filtros de período, seleções cumulativas e custos recorrentes por obra.
let categoriasSelecionadas = [];
let selecaoMultipla = false;
let periodoPagamento = { inicio:'', fim:'' };
const cachePagamentosObra = new WeakMap();
const brl = valor => Number(valor || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function dataPagamentoISO(valor,ordem='br') {
  if(valor instanceof Date && !Number.isNaN(valor.valueOf()))return `${valor.getFullYear()}-${String(valor.getMonth()+1).padStart(2,'0')}-${String(valor.getDate()).padStart(2,'0')}`;
  const s=String(valor??'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m){const br=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(br){const us=ordem==='us'||Number(br[2])>12&&Number(br[1])<=12;m=[br[0],br[3],(us?br[1]:br[2]).padStart(2,'0'),(us?br[2]:br[1]).padStart(2,'0')];}}
  if(!m && /[A-Za-z]{3}/.test(s)){const date=new Date(s);if(!Number.isNaN(date.valueOf()))return dataPagamentoISO(date);}
  if(!m && /^\d{5}(\.\d+)?$/.test(s)){const d=new Date(Date.UTC(1899,11,30)+Math.floor(Number(s))*86400000);return d.toISOString().slice(0,10);}
  if(!m)return '';const date=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  if(date.getFullYear()!==Number(m[1])||date.getMonth()+1!==Number(m[2])||date.getDate()!==Number(m[3]))return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}
function colunaPagamento(planilha){return planilha?.headers?.find(h=>/data.*(pagamento|credito|debito)|pagamento.*data|data.*baixa/.test(normalizarTextoUI(tituloColunaBase(planilha,h))));}
const cacheOrdemData = new WeakMap();
function ordemDataPlanilha(planilha,header){let mapa=cacheOrdemData.get(planilha);if(!mapa){mapa=new Map();cacheOrdemData.set(planilha,mapa);}if(mapa.has(header))return mapa.get(header);let br=0,us=0;for(const row of (planilha.rows||[]).slice(0,1000)){const m=String(row[header]||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m){if(Number(m[1])>12)br++;if(Number(m[2])>12)us++;}}const ordem=us>br?'us':'br';mapa.set(header,ordem);return ordem;}
function dataPagamentoLinha(planilha,row){const header=colunaPagamento(planilha);return header?dataPagamentoISO(row[header],ordemDataPlanilha(planilha,header)):'';}
function categoriaEstaSelecionada(cat){const valores=categoriasSelecionadas.length?categoriasSelecionadas:filtrosDashboard.categoria?[filtrosDashboard.categoria]:[];return !valores.length||valores.some(c=>normalizarTextoUI(c)===normalizarTextoUI(cat));}
function selecionarCampoGrafico(planilha,header,valor,forcarMultipla=false){
  if(!planilha)return;const filtro=filtrosDashboard.base;let values=[];
  if(selecaoMultipla||forcarMultipla){values=filtro?.planilhaId===planilha.id&&filtro.header===header?[...(filtro.values||[filtro.value])]:[];const i=values.findIndex(v=>normalizarTextoUI(v)===normalizarTextoUI(valor));if(i<0)values.push(valor);else values.splice(i,1);}
  else if(!(filtro?.planilhaId===planilha.id&&filtro.header===header&&filtro.value===valor))values=[valor];
  filtrosDashboard.base=values.length?{planilhaId:planilha.id,planilhaNome:planilha.nome,header,value:values.join(' + '),values}:null;dadosBasePaginaAtual=0;atualizarDashboard();
}
function alternarCategoriaAcumulada(cat,forcarMultipla=false){
  if(selecaoMultipla||forcarMultipla){const atual=categoriasSelecionadas.length?[...categoriasSelecionadas]:filtrosDashboard.categoria?[filtrosDashboard.categoria]:[];const idx=atual.findIndex(c=>normalizarTextoUI(c)===normalizarTextoUI(cat));if(idx<0)atual.push(cat);else atual.splice(idx,1);categoriasSelecionadas=atual;filtrosDashboard.categoria='';}
  else{categoriasSelecionadas=[];filtrosDashboard.categoria=normalizarTextoUI(filtrosDashboard.categoria)===normalizarTextoUI(cat)?'':cat;}
  dadosBasePaginaAtual=0;previstoPaginaAtual=0;atualizarDashboard();
}
function passaPeriodoPagamento(planilha,row){
  if(!periodoPagamento.inicio&&!periodoPagamento.fim || planilha?.tipo==='Previsto')return true;
  const data=dataPagamentoLinha(planilha,row);
  return !!data&&(!periodoPagamento.inicio||data>=periodoPagamento.inicio)&&(!periodoPagamento.fim||data<=periodoPagamento.fim);
}
function aplicarPeriodoPagamento(inicio,fim){if(inicio&&fim&&inicio>fim)return alert('A data inicial deve ser anterior à final.');periodoPagamento={inicio,fim};dadosBasePaginaAtual=0;atualizarDashboard();}
function renderizarControlesAvancados(){
  ['view-dashboard','view-pesquisa','view-dados-base','view-previsto','view-custos-fixos','view-recorrentes'].forEach(id=>{
    const view=document.getElementById(id);if(!view||view.classList.contains('hidden'))return;let host=document.getElementById(id+'-periodo');
    const estado={aberto:host?.querySelector('details')?.open,campo:host?.querySelector('select')?.value,busca:host?.querySelector('input[placeholder]')?.value};
    if(!host){host=document.createElement('div');host.id=id+'-periodo';host.className='bg-white border rounded-xl p-4 flex flex-wrap items-end gap-3';view.prepend(host);}
    host.replaceChildren();const label=(texto,tipo,value)=>{const l=document.createElement('label');l.className='text-xs font-bold text-gray-600';l.textContent=texto;const input=document.createElement('input');input.type=tipo;input.value=value;input.className='block border rounded-lg p-2 mt-1';l.append(input);host.append(l);return input;};
    const inicio=label('Pagamento de','date',periodoPagamento.inicio),fim=label('Até','date',periodoPagamento.fim),mes=label('Mês / ano','month',periodoPagamento.inicio?.slice(0,7)||'');
    const botao=(texto,fn)=>{const b=document.createElement('button');b.type='button';b.className='border rounded-lg px-3 py-2 text-sm font-bold text-blue-800';b.textContent=texto;b.onclick=fn;host.append(b);};
    botao('📅 Abrir calendário',()=>{try{mes.showPicker();}catch(e){mes.focus();}});
    mes.onchange=()=>{if(!mes.value)return;const [y,m]=mes.value.split('-').map(Number),end=new Date(y,m,0).getDate();aplicarPeriodoPagamento(mes.value+'-01',mes.value+'-'+String(end).padStart(2,'0'));};
    botao('Aplicar datas',()=>aplicarPeriodoPagamento(inicio.value,fim.value));botao('Todos os períodos',()=>aplicarPeriodoPagamento('',''));
    const multi=document.createElement('label');multi.className='flex gap-2 items-center text-sm';const check=document.createElement('input');check.type='checkbox';check.checked=selecaoMultipla;check.onchange=()=>{selecaoMultipla=check.checked;};multi.append(check,document.createTextNode('Somar várias seleções'));host.append(multi);
    const p=document.createElement('p');p.className='w-full text-xs text-gray-600';const selecao=categoriasSelecionadas.length?categoriasSelecionadas.join(' + '):filtrosDashboard.categoria;
    const semData=dadosBasePlanilhas.filter(p=>p.tipo==='Realizado'&&!colunaPagamento(p)).map(p=>p.nome);
    p.textContent=(selecao?'Soma selecionada: '+selecao+'. ':'')+'O período filtra pagamentos realizados; o orçamento mantém o previsto das categorias selecionadas.'+((periodoPagamento.inicio||periodoPagamento.fim)&&semData.length?' Fontes sem data de pagamento são excluídas do período: '+semData.join(', ')+'.':'');host.append(p);
    const details=document.createElement('details');details.open=!!estado.aberto;details.className='w-full';const summary=document.createElement('summary');summary.className='cursor-pointer font-bold text-blue-800';summary.textContent='Selecionar Vários';details.append(summary);
    const categorias=[...new Set([...Object.keys(obrasBD[obraAtivaID]?.categoriasRealizado||{}),...Object.keys(obrasBD[obraAtivaID]?.categoriasPrevisto||{})])].sort();
    const lista=document.createElement('div');lista.className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-auto py-3';
    categorias.forEach(cat=>{const l=document.createElement('label');l.className='flex gap-2 text-xs';const c=document.createElement('input');c.type='checkbox';c.checked=(categoriasSelecionadas.length>0||!!filtrosDashboard.categoria)&&categoriaEstaSelecionada(cat);c.onchange=()=>alternarCategoriaAcumulada(cat,true);l.append(c,document.createTextNode(cat));lista.append(l);});details.append(lista);
    const campos=document.createElement('select');campos.className='border rounded p-2 max-w-full text-xs';campos.setAttribute('aria-label','Campo para seleção de itens');campos.add(new Option('Selecione um campo de itens / fornecedor / categoria',''));
    dadosBasePlanilhas.forEach(planilha=>(planilha.headers||[]).forEach(h=>campos.add(new Option(rotuloFonteBase(planilha)+' • '+tituloColunaBase(planilha,h),campoBaseId(planilha.id,h)))));
    const busca=document.createElement('input');busca.placeholder='Buscar valor para selecionar';busca.value=estado.busca||'';busca.className='border rounded p-2 m-2 text-xs';if(estado.campo)campos.value=estado.campo;
    const valoresHost=document.createElement('div');valoresHost.className='max-h-48 overflow-auto grid sm:grid-cols-2 gap-2';
    const preencherValores=()=>{valoresHost.replaceChildren();const campo=lerCampoBaseId(campos.value),planilha=dadosBasePlanilhas.find(p=>p.id===campo?.planilhaId);if(!planilha)return;if(planilha.tipo==='Previsto'&&planilha.id!==`previsto-${obraAtivaID}`)return;
      const valores=[...new Set(linhasDaObra(planilha,obrasBD[obraAtivaID]).map(row=>String(row[campo.header]??'').trim()).filter(v=>v&&normalizarTextoUI(v).includes(normalizarTextoUI(busca.value))))].sort();
      valores.slice(0,100).forEach(valor=>{const l=document.createElement('label');l.className='flex gap-2 text-xs';const c=document.createElement('input');c.type='checkbox';c.checked=filtrosDashboard.base?.planilhaId===planilha.id&&filtrosDashboard.base.header===campo.header&&(filtrosDashboard.base.values||[filtrosDashboard.base.value]).includes(valor);c.onchange=()=>selecionarCampoGrafico(planilha,campo.header,valor,true);l.append(c,document.createTextNode(valor));valoresHost.append(l);});
      if(valores.length>100){const nota=document.createElement('p');nota.textContent='Mostrando 100 valores. Use a busca para encontrar os demais.';valoresHost.append(nota);}
    };campos.onchange=preencherValores;busca.oninput=preencherValores;details.append(campos,busca,valoresHost);host.append(details);if(campos.value)preencherValores();
  });
}
function pagamentosDaObra(obra){
  const registros=[];dadosBasePlanilhas.filter(p=>p.tipo==='Realizado').forEach(p=>{
    let cache=cachePagamentosObra.get(p);if(!cache){cache=new Map();cachePagamentosObra.set(p,cache);}const key=obra.id||obra.cc||obra.nome;
    if(!cache.has(key)){const campos=obterCamposRealizado(p.headers,p.rows,p.id),data=colunaPagamento(p),fornecedor=p.headers.find(h=>/^(fornecedor|razao social)$/.test(normalizarTextoUI(tituloColunaBase(p,h))));
      cache.set(key,linhasDaObra(p,obra).map(row=>({planilha:p,row,data:data?dataPagamentoLinha(p,row):'',categoria:String(row[campos.categoria]||'Outros').trim(),fornecedor:String(row[fornecedor]||'Não informado').trim(),valor:campos.valor?parseMonetario(row[campos.valor]):0})));}
    registros.push(...cache.get(key));
  });return registros;
}
function detectarCustosRecorrentes(registros){
  const grupos=new Map();registros.filter(r=>r.data&&r.valor>0&&r.fornecedor!=='Não informado').forEach(r=>{const key=normalizarTextoUI(r.fornecedor)+'\u001f'+normalizarTextoUI(r.categoria);if(!grupos.has(key))grupos.set(key,{fornecedor:r.fornecedor,categoria:r.categoria,meses:new Map()});const g=grupos.get(key),mes=r.data.slice(0,7);g.meses.set(mes,(g.meses.get(mes)||0)+r.valor);});
  return [...grupos.values()].filter(g=>g.meses.size>=parametrosSistema.minMesesRecorrencia).map(g=>({...g,valor:[...g.meses.values()].reduce((s,v)=>s+v,0)/g.meses.size})).sort((a,b)=>b.valor-a.valor);
}
function ocorrenciasCusto(custo,inicio,fim){
  const base=dataPagamentoISO(custo.inicio);if(!base||!inicio||!fim||inicio>fim)return 0;
  const [y,m,d]=base.split('-').map(Number),passo=Math.max(1,Number(custo.intervalo)||1);let quantidade=0;
  for(let i=0;i<100000;i++){let data;if(custo.unidade==='dias'){const dt=new Date(Date.UTC(y,m-1,d+i*passo));data=dt.toISOString().slice(0,10);}else{const meses=i*passo*(custo.unidade==='anos'?12:1),ano=y+Math.floor((m-1+meses)/12),mes=(m-1+meses)%12,dia=Math.min(d,new Date(ano,mes+1,0).getDate());data=`${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;}
    if(data>fim||custo.fim&&data>custo.fim)break;if(data>=inicio)quantidade++;
  }return quantidade;
}
function criarCelulaCusto(tag,texto){const td=document.createElement(tag);td.className='p-3 whitespace-nowrap';td.textContent=texto;return td;}
async function persistirCustosFixos(obraId,custos){
  const obra=obrasBD[obraId];if(!obra)throw new Error('Obra não encontrada.');
  if(!obterPermissoesUsuario().dadosBase)throw new Error('Seu perfil não pode editar custos fixos.');
  if(supabaseClient){const {data,error}=await supabaseClient.from('obras').select('dados_json').eq('id',obraId).single();if(error)throw error;
    const {data:salvo,error:erro}=await supabaseClient.from('obras').update({dados_json:{...data.dados_json,custosFixos:custos}}).eq('id',obraId).select('id').single();if(erro||!salvo)throw erro||new Error('O servidor não confirmou o cadastro.');}
  obra.custosFixos=custos;localStorage.setItem('obras_bp',JSON.stringify(obrasBD));await sinalizarAlteracaoCompartilhada();
}
async function salvarCustoFixo(event){
  event.preventDefault();const form=event.target,status=document.getElementById('fixos-status'),obraId=obraAtivaID;const campos=new FormData(form);
  const custo={id:campos.get('id')||crypto.randomUUID(),nome:String(campos.get('nome')||'').trim(),fornecedor:String(campos.get('fornecedor')||'').trim(),categoria:String(campos.get('categoria')||'').trim(),valor:parseMonetario(campos.get('valor')),quantidade:Number(campos.get('quantidade')),intervalo:Number(campos.get('intervalo')),unidade:campos.get('unidade'),inicio:campos.get('inicio'),fim:campos.get('fim'),ativo:true};
  if(!custo.nome||!custo.fornecedor||!custo.categoria||!(custo.valor>0)||!(custo.quantidade>0)||!Number.isInteger(custo.intervalo)||custo.intervalo<1||!custo.inicio||custo.fim&&custo.fim<custo.inicio){status.textContent='Preencha os campos com valores positivos e datas válidas.';return;}
  const atuais=obrasBD[obraId]?.custosFixos||[];
  if(atuais.some(c=>c.id!==custo.id&&c.ativo&&normalizarTextoUI(c.fornecedor)===normalizarTextoUI(custo.fornecedor)&&normalizarTextoUI(c.categoria)===normalizarTextoUI(custo.categoria))){status.textContent='Já existe um custo ativo para este fornecedor e categoria. Edite o cadastro existente para evitar contar o pagamento duas vezes.';return;}
  const btn=form.querySelector('[type=submit]');btn.disabled=true;status.textContent='Salvando…';try{await persistirCustosFixos(obraId,[...atuais.filter(c=>c.id!==custo.id),custo]);form.reset();form.elements.id.value='';form.elements.quantidade.value=1;form.elements.intervalo.value=1;form.elements.inicio.value=new Date().toLocaleDateString('sv-SE');renderizarCustosFixos();status.textContent='Custo salvo na obra.';}catch(e){status.textContent='Não foi possível salvar: '+e.message;}finally{btn.disabled=false;}
}
function preencherCustoFixo(custo){const f=document.getElementById('fixos-form');if(custo.categoria&&!Array.from(f.elements.categoria.options).some(o=>o.value===custo.categoria))f.elements.categoria.add(new Option(custo.categoria+' (categoria do cadastro)',custo.categoria));for(const nome of ['id','nome','fornecedor','categoria','valor','quantidade','intervalo','unidade','inicio','fim'])f.elements[nome].value=custo[nome]??'';f.scrollIntoView({behavior:'smooth',block:'start'});}
async function alternarCustoFixo(id){const obraId=obraAtivaID,atuais=obrasBD[obraId]?.custosFixos||[],alvo=atuais.find(c=>c.id===id);if(alvo&&!alvo.ativo&&atuais.some(c=>c.id!==id&&c.ativo&&normalizarTextoUI(c.fornecedor)===normalizarTextoUI(alvo.fornecedor)&&normalizarTextoUI(c.categoria)===normalizarTextoUI(alvo.categoria))){document.getElementById('fixos-status').textContent='Já existe outro custo ativo para este fornecedor e categoria.';return;}const custos=atuais.map(c=>c.id===id?{...c,ativo:!c.ativo}:c);try{await persistirCustosFixos(obraId,custos);renderizarCustosFixos();}catch(e){document.getElementById('fixos-status').textContent=e.message;}}
function resumoParametrosFixos(obra,inicio,fim){const custos=(obra.custosFixos||[]).filter(c=>c.ativo&&categoriaEstaSelecionada(c.categoria));const cats=[...new Set(custos.map(c=>c.categoria))];const parametro=custos.reduce((s,c)=>s+ocorrenciasCusto(c,inicio,fim)*c.valor*c.quantidade,0);const previsto=cats.reduce((s,c)=>s+Number(obra.categoriasPrevisto?.[c]||0)*multiplicadorCenario,0);return {custos,cats,parametro,previsto};}
function renderizarCardsCustos(host,cards){host.replaceChildren();cards.forEach(([label,valor])=>{const c=document.createElement('div');c.className='bg-white border rounded-xl p-4';const l=document.createElement('p');l.className='text-xs text-gray-600';l.textContent=label;const v=document.createElement('strong');v.className='block text-xl text-blue-800 mt-2';v.textContent=valor;c.append(l,v);host.append(c);});}
function periodoCustosAtual(){const hoje=new Date(),inicio=periodoPagamento.inicio||hoje.toLocaleDateString('sv-SE').slice(0,7)+'-01',fim=periodoPagamento.fim||new Date(hoje.getFullYear(),hoje.getMonth()+1,0).toLocaleDateString('sv-SE');return {inicio,fim};}
function renderizarCustosFixos(){
 const obra=obrasBD[obraAtivaID],host=document.getElementById('fixos-cadastrados');if(!host||!obra)return;document.getElementById('fixos-obra').textContent=obra.nome;const form=document.getElementById('fixos-form');if(form.dataset.obra!==obraAtivaID){form.reset();form.elements.id.value='';form.dataset.obra=obraAtivaID;}popularCategoriasCustoFixo(obra,form.elements.categoria);form.classList.toggle('hidden',!obterPermissoesUsuario().dadosBase);if(!form.elements.inicio.value)form.elements.inicio.value=new Date().toLocaleDateString('sv-SE');
 const {inicio,fim}=periodoCustosAtual(),resumo=resumoParametrosFixos(obra,inicio,fim);renderizarCardsCustos(document.getElementById('fixos-kpis'),[['Parâmetros ativos',String(resumo.custos.length)],['Custo fixo parametrizado no período',brl(resumo.parametro)],['Previsto das categorias vinculadas',brl(resumo.previsto)],['Saldo previsto − parâmetro',brl(resumo.previsto-resumo.parametro)],['Parâmetro / previsto',resumo.previsto?(resumo.parametro/resumo.previsto*100).toFixed(1)+'%':'N/P']]);
 document.getElementById('fixos-periodo').textContent='Parâmetros editáveis de análise de '+inicio+' a '+fim+'. Comparação com o orçamento integral das categorias, sem rateio por período. Não são pagamentos nem alteram o Previsto ou o Realizado.';
 host.replaceChildren();const table=document.createElement('table');table.className='min-w-full text-sm';const head=document.createElement('tr');['Custo','Fornecedor','Categoria','Valor unitário','Quantidade','Recorrência','Parâmetro no período','Ações'].forEach(t=>head.append(criarCelulaCusto('th',t)));table.append(head);
 ordenarObjetosTela([...(obra.custosFixos||[])],'fixos',c=>c.valor*c.quantidade,c=>c.nome).filter(c=>categoriaEstaSelecionada(c.categoria)).forEach(c=>{const tr=document.createElement('tr');[c.nome+(c.ativo?'':' (inativo)'),c.fornecedor,c.categoria,brl(c.valor),c.quantidade,'A cada '+c.intervalo+' '+c.unidade,brl(c.ativo?ocorrenciasCusto(c,inicio,fim)*c.valor*c.quantidade:0)].forEach(v=>tr.append(criarCelulaCusto('td',v)));const td=document.createElement('td');if(obterPermissoesUsuario().dadosBase)[['Editar',()=>preencherCustoFixo(c)],[c.ativo?'Desativar':'Reativar',()=>alternarCustoFixo(c.id)]].forEach(([t,fn])=>{const btn=document.createElement('button');btn.className='border rounded px-2 py-1 m-1';btn.textContent=t;btn.onclick=fn;td.append(btn);});tr.append(td);table.append(tr);});host.append(table);document.getElementById('fixos-historico')?.remove();if(graficoCustosFixos){graficoCustosFixos.destroy();graficoCustosFixos=null;}renderizarControlesAvancados();
}

let graficoCustosFixos = null;
function linhasGraficoPorCampos(cfg,obra){
  const x=lerCampoBaseId(cfg.xField),y=lerCampoBaseId(cfg.yField),p=dadosBasePlanilhas.find(p=>p.id===(y?.planilhaId||x?.planilhaId));if(!p)return [];
  if(p.tipo==='Previsto'&&p.id!==`previsto-${obraAtivaID}`)return [];
  const campos=p.tipo==='Previsto'?{categoria:p.headers.find(h=>/categoria|natureza/.test(normalizarTextoUI(tituloColunaBase(p,h))))}:obterCamposRealizado(p.headers,p.rows,p.id);
  let xHeader=x?.planilhaId===p.id?x.header:x?p.headers.find(h=>normalizarTextoUI(tituloColunaBase(p,h))===normalizarTextoUI(tituloColunaBase(dadosBasePlanilhas.find(b=>b.id===x.planilhaId),x.header))):campos.categoria;
  if(cfg.xField!=='obra'&&!xHeader)return [];
  const fontes=cfg.xField==='obra'?Object.entries(obrasBD).filter(([,o])=>!o.oculta&&(o.status!=='Arquivada'||usuarioAutenticado?.perfil==='Mestre')):[[obraAtivaID,obra]];
  const grupos=new Map(),numeric=y?.tipo==='coluna'&&colunaBaseNumerica(p,y.header);
  fontes.forEach(([id,o])=>{if(p.tipo==='Previsto'&&p.id!==`previsto-${id}`)return;linhasDaObra(p,o).forEach(row=>{
    if(!linhaPassaFiltroInterativo(p,row,campos.categoria))return;const key=cfg.xField==='obra'?id:String(row[xHeader]??'').trim()||'(vazio)',label=cfg.xField==='obra'?o.nome:key;
    if(!grupos.has(key))grupos.set(key,{key,label,valor:0,contagem:0,valores:new Set()});const g=grupos.get(key);g.contagem++;
    if(y?.tipo==='coluna'){if(numeric)g.valor+=parseMonetario(row[y.header]);else{const value=String(row[y.header]??'').trim();if(value)g.valores.add(value);}}
    else if(y?.tipo==='contagem')g.valor++;
    else{const header=campos.valor||encontrarColuna(p.headers,'valor');g.valor+=header?parseMonetario(row[header]):0;}
  });});
  return [...grupos.values()].map(g=>({...g,valor:y?.tipo==='coluna'&&!numeric?g.valores.size:g.valor,texto:[...g.valores].join(', '),numerico:numeric||y?.tipo!=='coluna'})).sort((a,b)=>b.valor-a.valor).slice(0,cfg.tipo==='gauge'?Infinity:parametrosSistema.maxGruposGrafico);
}
function renderizarGraficoTabela(cfg,rows,canvas){
  if(!canvas)return;if(cfg.colunas?.length){renderizarTabelaColunas(cfg,canvas);return;}const box=canvas.parentElement;box.className='relative max-h-80 overflow-auto';canvas.remove();
  const table=document.createElement('table');table.className='min-w-full text-sm text-left';const tr=document.createElement('tr');const x=lerCampoBaseId(cfg.xField),y=lerCampoBaseId(cfg.yField),source=dadosBasePlanilhas.find(p=>p.id===y?.planilhaId);
  const comparativo=!x&&!y;['Selecionar',x?tituloColunaBase(dadosBasePlanilhas.find(p=>p.id===x.planilhaId),x.header):cfg.xField==='obra'?'Obra':'Categoria',...(comparativo?['Previsto','Realizado','Saldo']:['Valor / lista','Registros'])].forEach(t=>tr.append(criarCelulaCusto('th',t)));table.append(tr);
  rows.forEach(r=>{const row=document.createElement('tr');row.className='border-t hover:bg-blue-50 cursor-pointer';const selecionar=()=>{if(x)selecionarCampoGrafico(dadosBasePlanilhas.find(p=>p.id===x.planilhaId),x.header,r.key,true);else if(cfg.xField==='obra')alterarObraAtiva(r.key);else alternarCategoriaAcumulada(r.key,true);};
    const td=document.createElement('td'),c=document.createElement('input');c.type='checkbox';c.setAttribute('aria-label','Selecionar '+r.label);c.checked=x?filtrosDashboard.base?.planilhaId===x.planilhaId&&filtrosDashboard.base.header===x.header&&(filtrosDashboard.base.values||[filtrosDashboard.base.value]).includes(r.key):(categoriasSelecionadas.length>0||!!filtrosDashboard.categoria)&&categoriaEstaSelecionada(r.key);c.onclick=e=>{e.stopPropagation();selecionar();};td.append(c);row.append(td,criarCelulaCusto('td',r.label));
    const values=comparativo?[brl(r.previsto),brl(r.realizado),brl(r.saldo)]:[r.texto||((y?.tipo==='contagem'||y?.tipo==='coluna'&&!colunaBaseNumerica(source,y.header))?String(r.valor):brl(r.valor)),r.contagem];values.forEach(v=>row.append(criarCelulaCusto('td',v)));row.onclick=selecionar;if(cfg.tipo==='list'){row.className+=' block my-2 rounded-lg bg-blue-50 p-2';row.setAttribute('aria-label',r.label+' · '+values.join(' · '));}table.append(row);
  });if(cfg.tipo==='list')tr.classList.add('hidden');if(!rows.length){const empty=document.createElement('p');empty.className='p-4 text-gray-500';empty.textContent='Sem dados compatíveis com os eixos e filtros selecionados.';box.append(empty);}box.append(table);
}

// Preserva os tipos de gráfico existentes e agrega todos os títulos, inclusive campos textuais no eixo Y.
const obterLinhasGraficoOriginal = obterLinhasGrafico;
obterLinhasGrafico = function(cfg,obra,cats){const rows=lerCampoBaseId(cfg.yField)||lerCampoBaseId(cfg.xField)?linhasGraficoPorCampos(cfg,obra):obterLinhasGraficoOriginal(cfg,obra,cats);return ordenarObjetosTela(rows,'dashboard',r=>Number(r.valor??r[cfg.yField==='comparativo'?'realizado':cfg.yField]??r.realizado)||0,r=>r.label);};

function resumoRecorrentes(obra){
 const registros=pagamentosDaObra(obra),padroes=detectarCustosRecorrentes(registros).filter(g=>categoriaEstaSelecionada(g.categoria));
 const linhas=padroes.map(g=>{const pagamentos=registros.filter(r=>r.data&&normalizarTextoUI(r.fornecedor)===normalizarTextoUI(g.fornecedor)&&normalizarTextoUI(r.categoria)===normalizarTextoUI(g.categoria)&&linhaPassaFiltroInterativo(r.planilha,r.row,r.planilha.headers.find(h=>/categoria|natureza/.test(normalizarTextoUI(tituloColunaBase(r.planilha,h))))));return {...g,pago:pagamentos.reduce((s,r)=>s+r.valor,0),registros:pagamentos.length,pagamentos};}).filter(g=>g.registros);
 const cats=[...new Set(linhas.map(g=>g.categoria))],previsto=cats.reduce((s,c)=>s+Number(obra.categoriasPrevisto?.[c]||0)*multiplicadorCenario,0),pago=linhas.reduce((s,g)=>s+g.pago,0);return {linhas,cats,previsto,pago,registros:linhas.reduce((s,g)=>s+g.registros,0)};
}
let graficoRecorrentes = null;
function renderizarPagamentosRecorrentes(){
 const obra=obrasBD[obraAtivaID],host=document.getElementById('recorrentes-tabela');if(!obra||!host)return;const resumo=resumoRecorrentes(obra);ordenarObjetosTela(resumo.linhas,'recorrentes',g=>g.pago,g=>g.fornecedor);document.getElementById('recorrentes-obra').textContent=obra.nome;
 renderizarCardsCustos(document.getElementById('recorrentes-kpis'),[['Padrões recorrentes',String(resumo.linhas.length)],['Pago recorrente nos filtros',brl(resumo.pago)],['Registros de pagamento',String(resumo.registros)],['Previsto das categorias vinculadas',brl(resumo.previsto)],['Saldo previsto − recorrente',brl(resumo.previsto-resumo.pago)],['Uso do previsto',resumo.previsto?(resumo.pago/resumo.previsto*100).toFixed(1)+'%':'N/P']]);
 document.getElementById('recorrentes-status').textContent='A recorrência é identificada no histórico completo. O total pago respeita os filtros de data e seleção. O orçamento integral de cada categoria é contado uma única vez; ele também cobre pagamentos não recorrentes. Registros sem data válida não entram.';
 host.replaceChildren();const table=document.createElement('table');table.className='min-w-full text-sm';const head=document.createElement('tr');['Fornecedor','Categoria','Meses no histórico','Média mensal histórica','Pago nos filtros','Pagamentos'].forEach(t=>head.append(criarCelulaCusto('th',t)));table.append(head);
 resumo.linhas.forEach(g=>{const tr=document.createElement('tr');tr.className='border-t cursor-pointer hover:bg-blue-50';[g.fornecedor,g.categoria,g.meses.size,brl(g.valor),brl(g.pago),g.registros].forEach(v=>tr.append(criarCelulaCusto('td',v)));tr.onclick=()=>selecionarCategoriaGrafico(g.categoria);table.append(tr);});host.append(table);if(!resumo.linhas.length){const empty=document.createElement('p');empty.className='p-5 text-gray-500';empty.textContent='Nenhum pagamento recorrente nos filtros atuais. É necessário ter fornecedor, categoria e datas em pelo menos '+parametrosSistema.minMesesRecorrencia+' meses.';host.append(empty);}
 const chartHost=document.getElementById('recorrentes-grafico');chartHost.replaceChildren();if(graficoRecorrentes){graficoRecorrentes.destroy();graficoRecorrentes=null;}const canvas=document.createElement('canvas'),box=document.createElement('div');box.className='relative h-72';box.append(canvas);chartHost.append(box);const cats=resumo.cats;
 if(typeof Chart!=='undefined'&&cats.length)graficoRecorrentes=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels:cats,datasets:[{label:'Previsto integral da categoria',data:cats.map(c=>(obra.categoriasPrevisto?.[c]||0)*multiplicadorCenario),backgroundColor:'#00cfff'},{label:'Pago recorrente',data:cats.map(c=>resumo.linhas.filter(g=>g.categoria===c).reduce((s,g)=>s+g.pago,0)),backgroundColor:'#003399'}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'nearest',intersect:false},onClick:cliqueCategoriaGrafico(cats)}});renderizarControlesAvancados();
}

function contaPrincipalMestre(){return usuarioAutenticado?.id===MASTER_USER.id||usuarioAutenticado?.usuario===MASTER_USER.usuario;}
function acessoLiberadoManutencao(){return contaPrincipalMestre()||configGlobal.manutencao===false;}
function aplicarEstadoManutencao(){
 let overlay=document.getElementById('tela-manutencao');if(!overlay){overlay=document.createElement('section');overlay.id='tela-manutencao';overlay.className='hidden fixed inset-0 z-[100] bg-[#F4F6F9] flex items-center justify-center p-5';const card=document.createElement('div');card.className='max-w-lg text-center bg-white p-8 rounded-xl border shadow';const title=document.createElement('h2');title.className='text-2xl font-bold text-blue-800';title.textContent='Sistema em manutenção';const text=document.createElement('p');text.id='texto-manutencao';text.className='my-4 text-gray-600';const sair=document.createElement('button');sair.textContent='Voltar ao login';sair.className='bg-blue-800 text-white rounded px-4 py-2';sair.onclick=executarLogout;card.append(title,text,sair);overlay.append(card);document.body.append(overlay);}
 const bloquear=!!usuarioAutenticado&&!acessoLiberadoManutencao();overlay.classList.toggle('hidden',!bloquear);if(bloquear)document.getElementById('app-container')?.classList.add('hidden');document.getElementById('texto-manutencao').textContent=configGlobal.manutencao===true?'O Mestre está atualizando o sistema. Aguarde a conclusão da manutenção.':'Verificando a disponibilidade do sistema. Aguarde ou tente entrar novamente.';
 const controle=document.getElementById('controle-manutencao');controle?.classList.toggle('hidden',!contaPrincipalMestre());const btn=document.getElementById('btn-manutencao');if(btn)btn.textContent=configGlobal.manutencao?'Finalizar manutenção e liberar acesso':'Ativar manutenção';
}
let consultandoManutencao=false;
async function consultarManutencao(){
 if(consultandoManutencao||!supabaseClient)return;consultandoManutencao=true;try{const {data,error}=await supabaseClient.from('configuracoes').select('perfis_json').eq('id',configGlobal.idConfigSupabase||1).single();if(error)throw error;const anterior=configGlobal.manutencao,assinatura=JSON.stringify(data.perfis_json||{}),mudouConfiguracao=configGlobal.assinaturaPerfis!==undefined&&configGlobal.assinaturaPerfis!==assinatura;configGlobal.assinaturaPerfis=assinatura;configGlobal.manutencao=!!data.perfis_json?.__sistema?.manutencao;aplicarEstadoManutencao();if((anterior!==configGlobal.manutencao||mudouConfiguracao)&&usuarioAutenticado&&!contaPrincipalMestre()){window.location.reload();return;}}catch(e){aplicarEstadoManutencao();}finally{consultandoManutencao=false;}
}
async function alternarManutencao(){
 if(!contaPrincipalMestre())return alert('Somente a conta principal do Mestre controla a manutenção.');const btn=document.getElementById('btn-manutencao'),status=document.getElementById('manutencao-status');btn.disabled=true;try{if(!supabaseClient)throw new Error('Conecte ao Supabase.');const {data,error}=await supabaseClient.from('configuracoes').select('perfis_json').eq('id',configGlobal.idConfigSupabase||1).single();if(error)throw error;const ativo=!data.perfis_json?.__sistema?.manutencao;const {data:salvo,error:erro}=await supabaseClient.from('configuracoes').update({perfis_json:{...data.perfis_json,__sistema:{...data.perfis_json?.__sistema,manutencao:ativo,atualizadoEm:new Date().toISOString()}}}).eq('id',configGlobal.idConfigSupabase||1).select('id').single();if(erro||!salvo)throw erro||new Error('O banco não confirmou a alteração.');configGlobal.manutencao=ativo;aplicarEstadoManutencao();status.textContent=ativo?'Manutenção ativada. As demais sessões serão bloqueadas em até 15 segundos.':'Manutenção finalizada. Acesso liberado.';}catch(e){status.textContent='Não foi possível alterar: '+e.message;}finally{btn.disabled=false;}
}
setInterval(consultarManutencao,15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)consultarManutencao();});

const pesquisaAntesTelas=pesquisarCustos;pesquisarCustos=function(termo){pesquisaAntesTelas(termo);graficoPesquisaCustos=aplicarGraficoFixo(graficoPesquisaCustos,'pesquisa');aplicarConfiguracoesTelas();};window.pesquisarCustos=pesquisarCustos;
const previstoAntesTelas=renderizarPrevisto;renderizarPrevisto=function(){previstoAntesTelas();graficoPrevistoCustos=aplicarGraficoFixo(graficoPrevistoCustos,'previsto');aplicarConfiguracoesTelas();};
const realizadoAntesTelas=renderizarDadosBase;renderizarDadosBase=function(){realizadoAntesTelas();graficoRealizadoCustos=aplicarGraficoFixo(graficoRealizadoCustos,'realizado');aplicarConfiguracoesTelas();};
const fixosAntesTelas=renderizarCustosFixos;renderizarCustosFixos=function(){fixosAntesTelas();aplicarConfiguracoesTelas();};
const recorrentesAntesTelas=renderizarPagamentosRecorrentes;renderizarPagamentosRecorrentes=function(){recorrentesAntesTelas();graficoRecorrentes=aplicarGraficoFixo(graficoRecorrentes,'recorrentes');aplicarConfiguracoesTelas();};

for(const nome of ['sincronizarTodasPlanilhas','atualizarCampoObra','alternarStatusArquivado','alternarObraOculta','salvarConfiguracoesGerais','alterarPerfilUsuario','criarUsuarioDireto','aprovarSolicitacao','salvarDadosUsuario']){const original=window[nome];if(typeof original==='function')window[nome]=async function(...args){const resultado=await original(...args);await sinalizarAlteracaoCompartilhada(nome==='sincronizarTodasPlanilhas'?'planilhas':'parametros');return resultado;};}
