// ==========================================
// CONFIGURAÇÃO SEGURA DO SUPABASE E VARIÁVEIS
// ==========================================
let supabaseClient = null;

try {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient('https://dgolbcuhjruncildelth.supabase.co', 'sb_publishable_xAc46P9gmgmzMyKIyl9OJA__9MoyMFK');
  }
} catch (e) { console.warn("Supabase indisponível.", e); }

const MASTER_USER = { id: "local_master", nome: "Vinícius Souza (Mestre)", usuario: "vinicius_souzaf", email: "mestre@brasilpontes.com.br", senha: "741852963", perfil: "Mestre", status: "Aprovado" };
const PERMISSOES_PADRAO = {
  Mestre: { dashboard:true, pesquisa:true, dadosBase:true, sincronizar:true, configuracoes:true, usuarios:true, permissoes:true, graficos:true, relatorios:true },
  Engenheiro: { dashboard:true, pesquisa:true, dadosBase:true, sincronizar:false, configuracoes:false, usuarios:false, permissoes:false, graficos:true, relatorios:true },
  Orçamentista: { dashboard:true, pesquisa:true, dadosBase:true, sincronizar:true, configuracoes:false, usuarios:false, permissoes:false, graficos:true, relatorios:true },
  Dono: { dashboard:true, pesquisa:true, dadosBase:true, sincronizar:false, configuracoes:false, usuarios:false, permissoes:false, graficos:true, relatorios:true }
};
let permissoesPerfis = Object.fromEntries(Object.entries(PERMISSOES_PADRAO).map(([perfil, regras]) => [perfil, { ...regras }]));
try {
  const salvas=JSON.parse(localStorage.getItem('permissoes_bp') || 'null');
    if (salvas && typeof salvas === 'object') Object.keys(salvas).filter(p=>!['__proto__','constructor','prototype','__sistema'].includes(p)).forEach(perfil => {
    if (salvas[perfil] && typeof salvas[perfil] === 'object') permissoesPerfis[perfil] = { ...PERMISSOES_PADRAO[perfil], ...salvas[perfil] };
  });
} catch(e) { console.warn('Permissões locais inválidas; usando os padrões.', e); }
permissoesPerfis.Mestre = { ...PERMISSOES_PADRAO.Mestre };

let usuariosBD = [MASTER_USER];
let solicitacoesPendentesBD = [];
const GRAFICOS_PADRAO = [
  { id: "chart_cat", titulo: "Previsto x Realizado", tipo: "bar", xField: "categoria", yField: "comparativo" },
  { id: "chart_curv", titulo: "Evolução do Desempenho", tipo: "line", xField: "categoria", yField: "percentual" }
];
let graficosConfig = GRAFICOS_PADRAO.map(g => ({ ...g }));
let graficosInstancias = {};
let usuarioAutenticado = null;
let obraAtivaID = null;
let multiplicadorCenario = 1;
let filtrosDashboard = { categoria: '', farol: '', base: null };
let campoBaseFiltroSelecionado = '';
let linhasDashboardVisiveis = [];
let filtrosDadosBase = { busca: '', obra: '', categoria: '' };
let filtroObraDadosBaseManual = false;
let filtrosPesquisaCustos = '';
let graficoPesquisaCustos = null;
let graficoPrevistoCustos = null;
let graficoRealizadoCustos = null;
let previstoPaginaAtual = 0;
function normalizarTextoUI(valor) { return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

let indiceVisibilidade=null,perfilIndiceVisibilidade=null,obrasIndiceVisibilidade=null;
function atualizarIndiceVisibilidade(){indiceVisibilidade=new Map();perfilIndiceVisibilidade=usuarioAutenticado?.perfil;obrasIndiceVisibilidade=obrasBD;Object.values(obrasBD || {}).forEach(obra=>{const visible=!obra.oculta && (obra.status!=='Arquivada'||perfilIndiceVisibilidade==='Mestre');[obra.id,obra.nome,obra.cc].filter(Boolean).forEach(v=>indiceVisibilidade.set(normalizarTextoUI(v),visible));});}
function obraVisivelNosDados(valor) {if(!indiceVisibilidade||perfilIndiceVisibilidade!==usuarioAutenticado?.perfil||obrasIndiceVisibilidade!==obrasBD)atualizarIndiceVisibilidade();return indiceVisibilidade.get(normalizarTextoUI(valor)) ?? true;}

function campoBaseId(planilhaId, header) { return `base:${encodeURIComponent(planilhaId)}:${encodeURIComponent(header)}`; }
function campoBaseContagemId(planilhaId) { return `contagem:${encodeURIComponent(planilhaId)}`; }
function lerCampoBaseId(campo) {
  if (typeof campo !== 'string') return null;
  const partes = campo.split(':');
  if (partes[0] === 'base' && partes.length === 3) return { tipo:'coluna', planilhaId:decodeURIComponent(partes[1]), header:decodeURIComponent(partes[2]) };
  if (partes[0] === 'contagem' && partes.length === 2) return { tipo:'contagem', planilhaId:decodeURIComponent(partes[1]) };
  return null;
}

function colunaBaseNumerica(planilha, header) {
  let cache=cacheNumericoBase.get(planilha);if(!cache){cache=new Map();cacheNumericoBase.set(planilha,cache);}if(cache.has(header))return cache.get(header);
  if (/cnpj|cpf|documento|telefone|celular|cep|matricula|c[oó]digo|data|vencimento|previsao|(^|\s)id($|\s)/i.test(normalizarTexto(tituloColunaBase(planilha,header)))) return false;
  const valores=[];for(const row of (planilha?.rows || []).slice(0,300)){const v=String(row[header]??'').trim();if(v)valores.push(v);if(valores.length===100)break;}
  if (!valores.length) return false;
  const numericos = valores.filter(v => /^\(?\s*-?\s*R?\$?\s*\d[\d.,\s]*\)?\s*%?\s*$/.test(v));
  const resultado=numericos.length / valores.length >= 0.7;cache.set(header,resultado);return resultado;
}
const cacheNumericoBase=new WeakMap();
const cacheIndiceObra=new WeakMap();
function tituloColunaBase(planilha,header){return planilha?.titulosColunas?.[header] || header;}
function rotuloFonteBase(p){return p.nome===p.tipo?p.tipo:`${p.tipo || 'Dados'} • ${p.nome}`;}
function linhasDaObra(planilha,obra){
  const header=encontrarColuna(planilha.headers || [],'obra');
  if(!header || !obra)return planilha.rows || [];
  let indice=cacheIndiceObra.get(planilha);
  if(!indice){indice=new Map();for(const row of planilha.rows || []){const key=chaveComparacaoObra(row[header]);if(!indice.has(key))indice.set(key,[]);indice.get(key).push(row);}cacheIndiceObra.set(planilha,indice);}
  const result=[],seen=new Set();for(const key of [obra.id,obra.cc,obra.nome].filter(Boolean).map(chaveComparacaoObra)){if(seen.has(key))continue;seen.add(key);result.push(...(indice.get(key)||[]));}return result;
}

function opcoesCamposGraficos(eixo, xField = '') {
 const defaults=eixo==='x'?[['categoria','Categoria'],['obra','Obra']]:[['comparativo','Previsto x Realizado'],['previsto','Previsto'],['realizado','Realizado'],['saldo','Saldo'],['percentual','% de uso'],['idc','IDC']];
 const opcoes=[...defaults];dadosBasePlanilhas.forEach(p=>{if(eixo==='y')opcoes.push([campoBaseContagemId(p.id),rotuloFonteBase(p)+' • Contagem de registros']);(p.headers||[]).forEach(h=>opcoes.push([campoBaseId(p.id,h),rotuloFonteBase(p)+' • '+(eixo==='y'?(colunaBaseNumerica(p,h)?'Soma de ':'Valores distintos de '):'')+tituloColunaBase(p,h)]));});return opcoes;
}

function atualizarSeletoresNovoGrafico() {
  const x = document.getElementById('novo-chart-x'), y = document.getElementById('novo-chart-y');
  if (!x || !y) return;
  const oldX=x.value, oldY=y.value;
  x.replaceChildren(...opcoesCamposGraficos('x').map(([v,t])=>new Option(t,v)));
  if (opcoesCamposGraficos('x').some(([v])=>v===oldX)) x.value=oldX;
  const yOpts=opcoesCamposGraficos('y',x.value);
  y.replaceChildren(...yOpts.map(([v,t])=>new Option(t,v)));
  y.value=yOpts.some(([v])=>v===oldY)?oldY:(yOpts[0]?.[0] || 'previsto');
  x.onchange=()=>{ atualizarSeletoresNovoGrafico(); };
  renderizarColunasNovoGrafico();renderizarOpcoesNovoVelocimetro();
}

let configGlobal = { titulo: "Brasil Pontes", urlRealizado: "", planilhasRealizado: [] };
try { const cfg = localStorage.getItem('config_bp'); if (cfg && cfg !== "undefined") configGlobal = JSON.parse(cfg); } catch(e){}
if (!Array.isArray(configGlobal.planilhasRealizado)) configGlobal.planilhasRealizado = [];

let dadosBasePlanilhas = [];
let consultaBaseEmAndamento = null;
let erroConsultaBase = '';

async function garantirBaseConsulta() {
  const permissoes=obterPermissoesUsuario();
  if (!usuarioAutenticado || (!permissoes.dadosBase && !permissoes.pesquisa)) return;
  if (dadosBasePlanilhas.some(p => p.tipo === 'Realizado' && p.rows?.length)) return;
  if (consultaBaseEmAndamento) return consultaBaseEmAndamento;
  const botaoSync=document.getElementById('btn-sync');
  const textoSync=botaoSync?.innerHTML;
  if(botaoSync)botaoSync.disabled=true;
  consultaBaseEmAndamento = (async () => {
    const fontes = configGlobal.planilhasRealizado?.filter(f => f.url?.trim()) || [];
    if (!fontes.length && configGlobal.urlRealizado) fontes.push({id:'realizado-principal',nome:'Realizado',url:configGlobal.urlRealizado});
    if (!fontes.length) throw new Error('Não há fonte compartilhada de Realizado cadastrada.');
    const bases = [];
    for (const fonte of fontes) {
      const dados = await buscarCSV(fonte.url);
      bases.push({...dados,id:fonte.id || 'realizado-principal',nome:fonte.nome || 'Realizado',tipo:'Realizado',url:fonte.url,origem:'url',atualizadoEm:new Date().toISOString()});
    }
    dadosBasePlanilhas = [...dadosBasePlanilhas.filter(p => p.tipo !== 'Realizado'), ...bases];
    try { await salvarDadosBaseArmazenados(dadosBasePlanilhas); } catch(e) { console.warn('Consulta carregada em memória; cache indisponível.',e); }
    assinaturaBaseAnaliseRealizado = '';
    erroConsultaBase = '';
    atualizarDashboard();
    renderizarDadosBase();
  })().catch(erro => { erroConsultaBase = erro.message || String(erro); throw erro; }).finally(() => { consultaBaseEmAndamento = null;if(botaoSync){botaoSync.disabled=false;botaoSync.innerHTML=textoSync;} });
  return consultaBaseEmAndamento;
}

function estadoVelocimetro(previsto, realizado) {
  const uso = previsto > 0 ? realizado / previsto * 100 : null;
  return {uso,cor:uso === null ? (realizado > 0 ? '#dc2626' : '#64748b') : uso > parametrosSistema.farolVermelho ? '#dc2626' : uso >= parametrosSistema.farolAmarelo ? '#d97706' : '#059669',texto:uso === null ? (realizado > 0 ? 'N/P — Não previsto' : 'Sem orçamento previsto') : uso > parametrosSistema.farolVermelho ? 'Acima do previsto' : uso >= parametrosSistema.farolAmarelo ? 'Atenção' : 'Dentro do previsto'};
}

function renderizarVelocimetros(id, total, detalhes = []) {
  const host = document.getElementById(id); if (!host) return;
  const antiga = host.querySelector('select')?.value;
  host.replaceChildren();
  host.className = 'bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3';
  const titulo = document.createElement('h3'); titulo.className='font-bold text-[#003399]'; titulo.textContent='Velocímetro de consumo do previsto'; host.appendChild(titulo);
  const grid=document.createElement('div');grid.className='grid grid-cols-1 sm:grid-cols-2 gap-4';host.appendChild(grid);
  const criar = (parent, dado) => {
    const box=document.createElement('div'); box.className='text-center border rounded-lg p-3';
    const label=document.createElement('p');label.className='font-bold text-sm text-gray-700';label.textContent=dado.label;box.appendChild(label);
    const estado=estadoVelocimetro(Number(dado.previsto)||0,Number(dado.realizado)||0);
  const ponteiro=estado.uso===null?(Number(dado.realizado)>0?(parametrosSistema.farolVermelho+parametrosSistema.velocimetroMax)/2:0):estado.uso;
  const angle=Math.PI - Math.min(parametrosSistema.velocimetroMax,Math.max(0,ponteiro))/parametrosSistema.velocimetroMax*Math.PI;
    const nx=120+75*Math.cos(angle), ny=108-75*Math.sin(angle);
    const arco=(start,end)=>{const p=n=>[120+90*Math.cos(Math.PI-n/parametrosSistema.velocimetroMax*Math.PI),108-90*Math.sin(Math.PI-n/parametrosSistema.velocimetroMax*Math.PI)];const a=p(start),b=p(end);return `M ${a[0]} ${a[1]} A 90 90 0 0 1 ${b[0]} ${b[1]}`;};
    const graphic=document.createElement('div');
    graphic.innerHTML=`<svg viewBox="0 0 240 135" style="width:100%;max-width:300px;display:block;margin:auto" role="img"><title>Consumo do previsto</title><path d="${arco(0,parametrosSistema.farolAmarelo)}" fill="none" stroke="#10b981" stroke-width="17"/><path d="${arco(parametrosSistema.farolAmarelo,parametrosSistema.farolVermelho)}" fill="none" stroke="#f59e0b" stroke-width="17"/><path d="${arco(parametrosSistema.farolVermelho,parametrosSistema.velocimetroMax)}" fill="none" stroke="#ef4444" stroke-width="17"/><text x="24" y="132" font-size="10">0%</text><text x="188" y="132" font-size="10">${parametrosSistema.velocimetroMax}%+</text><line x1="120" y1="108" x2="${nx}" y2="${ny}" stroke="#0f172a" stroke-width="5"/><circle cx="120" cy="108" r="7" fill="#0f172a"/></svg>`;
    box.appendChild(graphic);
    const valor=document.createElement('p');valor.style.color=estado.cor;valor.className='text-xl font-black';valor.textContent=estado.uso===null?'N/P':estado.uso.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';box.appendChild(valor);
    const texto=document.createElement('p');texto.className='text-xs font-bold';texto.textContent=estado.texto;box.appendChild(texto);
    const moeda=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const base=document.createElement('p');base.className='text-xs text-gray-500 mt-2';base.textContent=`Previsto: ${moeda(dado.previsto)} · Realizado: ${moeda(dado.realizado)}`;box.appendChild(base);
    if (dado.nota) {const nota=document.createElement('p');nota.className='text-xs text-gray-500 mt-1';nota.textContent=dado.nota;box.appendChild(nota);}
    parent.replaceChildren(box);
  };
  const global=document.createElement('div');grid.appendChild(global);criar(global,{...total,label:total.label || 'Total nos filtros atuais'});
  const individual=document.createElement('div');grid.appendChild(individual);
  if(detalhes.length){const select=document.createElement('select');select.className='border rounded p-2 text-sm w-full mb-2';select.setAttribute('aria-label','Selecionar categoria ou item do velocímetro');detalhes.forEach((d,i)=>select.appendChild(new Option(d.label,String(i))));if(detalhes[Number(antiga)])select.value=antiga;const card=document.createElement('div');individual.append(select,card);const draw=()=>criar(card,detalhes[Number(select.value)]);select.onchange=draw;draw();}
  else criar(individual,{label:'Categoria ou item',previsto:0,realizado:0,nota:'Selecione uma obra ou pesquise itens com dados disponíveis.'});
  const legenda=document.createElement('p');legenda.className='text-xs text-gray-600';legenda.textContent=legendaFarol()+' Ponteiro limitado a '+parametrosSistema.velocimetroMax+'%; percentual integral exibido.';host.appendChild(legenda);
}
let dadosBaseAtivo = null;
let dadosBasePaginaAtual = 0;
let assinaturaBaseAnaliseRealizado = '';
let diagnosticoBaseAnaliseRealizado = '';
let DADOS_BASE_PAGINA_TAMANHO = 100;
const BASE_DB_NAME = 'sistema_bp_dados';
const BASE_STORE_NAME = 'planilhas';

function abrirBancoDadosBase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('Este navegador não oferece suporte ao IndexedDB.'));
    const request = indexedDB.open(BASE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BASE_STORE_NAME)) db.createObjectStore(BASE_STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível abrir o banco local de dados.'));
  });
}

async function carregarDadosBaseArmazenados() {
  const db = await abrirBancoDadosBase();
  const dados = await new Promise((resolve, reject) => {
    const tx = db.transaction(BASE_STORE_NAME, 'readonly');
    const request = tx.objectStore(BASE_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Não foi possível ler os dados importados.'));
  });
  db.close();
  if (dados.length) {
    dadosBasePlanilhas = dados;
    localStorage.removeItem('dados_base_bp');
    return;
  }

  // Migra uma eventual base salva por uma versão anterior em localStorage.
  const legado = localStorage.getItem('dados_base_bp');
  if (legado) {
    try {
      const importadas = JSON.parse(legado);
      if (Array.isArray(importadas) && importadas.length) {
        await salvarDadosBaseArmazenados(importadas);
        dadosBasePlanilhas = importadas;
      }
      localStorage.removeItem('dados_base_bp');
    } catch (erro) {
      console.warn('Não foi possível migrar a base antiga do navegador.', erro);
    }
  }
}

async function salvarDadosBaseArmazenados(planilhas) {
  const db = await abrirBancoDadosBase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(BASE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(BASE_STORE_NAME);
    store.clear();
    planilhas.forEach(planilha => store.put(planilha));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Não foi possível salvar a base de dados no navegador.'));
    tx.onabort = () => reject(tx.error || new Error('O navegador cancelou o salvamento da base de dados.'));
  });
  db.close();
}

let obrasBD = {};
try { const obs = localStorage.getItem('obras_bp'); if (obs && obs !== "undefined") obrasBD = JSON.parse(obs); } catch(e){}
if (!obrasBD || typeof obrasBD !== 'object') obrasBD = {};

// ==========================================
// UTILITÁRIOS INTELIGENTES DE LEITURA (CSV)
// ==========================================
function obterLinkCSV(url) {
  if (!url) return "";
  if (/drive\.google\.com\/drive\/folders\//i.test(url)) {
    throw new Error("O link informado é de uma pasta do Google Drive. Cadastre o link de uma planilha específica (Google Sheets), não o link da pasta.");
  }
  if (url.includes("/pub?output=csv")) return url;
  if (url.includes("/edit") || url.includes("usp=")) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      const gid = url.match(/[?&#]gid=(\d+)/);
      const sheet = url.match(/[?&#]sheet=([^&#]+)/);
      const params = new URLSearchParams({ format: "csv" });
      if (gid) params.set("gid", gid[1]);
      if (sheet) params.set("sheet", decodeURIComponent(sheet[1]));
      return `https://docs.google.com/spreadsheets/d/${match[1]}/export?${params.toString()}`;
    }
  }
  return url;
}

function normalizarTexto(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function chaveComparacaoObra(valor) {
  return normalizarTexto(valor).replace(/[^A-Z0-9]/g, "");
}

function encontrarColuna(chaves, tipo) {
  const normalizadas = chaves.map(chave => ({ chave, nome: normalizarTexto(chave) }));
  const regras = {
    // Em exportações financeiras que trazem Projeto e Departamento, o segundo
    // é o identificador da obra usado pelo sistema; priorize-o para não agrupar
    // os custos pelo nome do projeto ou deixar as obras com R$ 0,00.
    obra: [n => n.includes("DEPARTAMENTO"), n => n.includes("CENTRO DE CUSTO"), n => /(^|\b)OBRA(\b|$)/.test(n), n => n.includes("CODIGO DO CENTRO"), n => /(^|\b)PROJETO(\b|$)/.test(n)],
    categoria: [n => n.includes("CATEGORIA"), n => n.includes("NATUREZA"), n => n.includes("CLASSIFICACAO"), n => n.includes("RUBRICA"), n => n === "CONTA" || n.includes("GRUPO DE CUSTO")],
    valor: [n => n === "PAGO OU RECEBIDO", n => n.includes("VALOR PAGO"), n => n.includes("PAGO OU RECEBIDO"), n => n.includes("VALOR REALIZADO"), n => n.includes("TOTAL PAGO"), n => n.includes("VALOR LIQUIDO"), n => n.includes("VALOR DA CONTA"), n => n.includes("CUSTO TOTAL"), n => n.includes("VALOR TOTAL"), n => n.includes("VALOR DO DOCUMENTO"), n => n.includes("VALOR DA NOTA"), n => n === "VALOR", n => n.startsWith("VALOR ") || n.startsWith("CUSTO ")]
  };
  for (const regra of regras[tipo] || []) {
    const encontrado = normalizadas.find(item => regra(item.nome));
    if (encontrado) return encontrado.chave;
  }
  return null;
}

function inferirColunaMonetaria(headers, rows) {
  const bloqueios = /cnpj|cpf|documento|nota fiscal|boleto|parcela|numero|conta corrente|telefone|cep|codigo|(^|\b)id(\b|$)|data|pedido|ordem de servico/i;
  const amostras = (rows || []).slice(0, 300);
  const candidatos = headers.filter(header => !bloqueios.test(normalizarTexto(header))).map(header => {
    const valores = amostras.map(row => String(row[header] ?? '').trim()).filter(Boolean);
    // O export do Google retorna negativos como "-R$ 99,90"; retire a moeda
    // antes de validar para não confundir essas colunas com campos vazios/zero.
    const numericos = valores.filter(value => {
      const normalizado = value.replace(/R\$\s*/gi, '').replace(/[−–]/g, '-').trim();
      return /^\(?-?\s*\d[\d.,\s]*\)?$/.test(normalizado);
    });
    const monetarios = numericos.filter(value => /R\$|,\d{1,2}$|\.\d{1,2}$/.test(value));
    const total = numericos.reduce((sum, value) => sum + parseMonetario(value), 0);
    const taxa = valores.length ? numericos.length / valores.length : 0;
    const taxaMonetaria = numericos.length ? monetarios.length / numericos.length : 0;
    const headerValor = /valor|custo|total|pago|liquid|montante|debito|credito/i.test(normalizarTexto(header));
    const generico = /^coluna\s*\d+$/i.test(header);
    const score = (headerValor ? 100 : 0) + taxa * 20 + taxaMonetaria * 35 + (generico ? 5 : 0) + (total > 0 ? Math.min(Math.log10(total + 1), 10) : 0);
    return { header, score, count: numericos.length, taxa, taxaMonetaria, amostra: numericos.slice(0, 3) };
  }).filter(candidate => candidate.count > 0 && candidate.taxa >= 0.5).sort((a, b) => b.score - a.score);
  const first = candidatos[0];
  if (!first) return { header: null, candidatos: [] };
  const unique = candidatos.length === 1 || first.score - candidatos[1].score >= 8;
  return { header: (first.taxaMonetaria >= 0.35 || unique) ? first.header : null, candidatos: candidatos.slice(0, 8) };
}

function obterCamposRealizado(headers, rows = [], fonteId = '') {
  const colunas = Array.isArray(headers) ? headers : [];
  const configuracaoFonte = (configGlobal.planilhasRealizado || []).find(fonte => fonte.id === fonteId);
  const inferencia = inferirColunaMonetaria(colunas, rows);
  const nomes = colunas.map(header => normalizarTexto(header));
  // Nesta exportação específica, o Google omite alguns títulos de colunas.
  // Conferimos na planilha que a coluna AH (Valor Pago) chega como "Coluna 34";
  // a presença de Origem/Departamento e da sequência financeira genérica evita
  // aplicar esse mapeamento a planilhas de outros formatos.
  const valorPagoGenerico = nomes.includes('DEPARTAMENTO') && nomes.includes('ORIGEM') && nomes.includes('COLUNA 34') && nomes.includes('COLUNA 23')
    ? colunas[nomes.indexOf('COLUNA 34')]
    : null;
  return {
    obra: encontrarColuna(colunas, 'obra'),
    categoria: encontrarColuna(colunas, 'categoria'),
    valor: colunas.includes(configuracaoFonte?.colunaValor) ? configuracaoFonte.colunaValor : (encontrarColuna(colunas, 'valor') || valorPagoGenerico || inferencia.header),
    inferencia
  };
}

function migrarLinkPlanilhaRealizado() {
  const idAtual = "1hl9Q4UgickyOa4kCEJixEY9XNruivmbSBqWxZIz16oA";
  const idsAntigos = ["1S41dXyTC2Y_SJjD3iw86WaUqi0OWNxyf", "1v3FrPW55ofd8j3-rOqyyZlw1HHMJuf6", "1wZQhhLXwcpToKGy26gW1rHooGwUuRQMJ"];
  const linkAtual = `https://docs.google.com/spreadsheets/d/${idAtual}/edit?gid=1037311119`;
  let alterou = false;
  if (idsAntigos.some(id => String(configGlobal.urlRealizado || "").includes(id))) { configGlobal.urlRealizado = linkAtual; alterou = true; }
  (configGlobal.planilhasRealizado || []).forEach(fonte => {
    if (idsAntigos.some(id => String(fonte.url || "").includes(id))) { fonte.url = linkAtual; alterou = true; }
  });
  if (alterou) localStorage.setItem("config_bp", JSON.stringify(configGlobal));
  return alterou;
}

// FORMATADOR UNIVERSAL DE DINHEIRO (Aceita US e BR)
function parseMonetario(valorStr) {
  if (!valorStr) return 0;
  let str = String(valorStr).replace(/[R$\s]/g, '').trim();
  str = str.replace(/[()]/g, '').replace(/[^\d,.-]/g, '');
  let lastComma = str.lastIndexOf(',');
  let lastDot = str.lastIndexOf('.');
  
  if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.'); // Formato BR: 1.000,00 -> 1000.00
  } else {
      str = str.replace(/,/g, ''); // Formato US: 1,000.00 -> 1000.00
  }
  return Math.abs(parseFloat(str) || 0);
}

function formatarMatrizPlanilha(matriz) {
  const dados = (matriz || []).map(linha => Array.isArray(linha) ? linha.map(celula => celula == null ? "" : celula instanceof Date ? `${celula.getFullYear()}-${String(celula.getMonth()+1).padStart(2,'0')}-${String(celula.getDate()).padStart(2,'0')}` : String(celula).trim()) : []);
  if (!dados.length) return { headers: [], rows: [] };
  let headerIndex = -1;
  let melhorPontuacao = 0;
  for (let i = 0; i < Math.min(30, dados.length); i++) {
    const campos = dados[i].map(normalizarTexto);
    const temValor = campos.some(n => n === "VALOR" || n.startsWith("VALOR ") || n.startsWith("CUSTO ") || n.includes("TOTAL PAGO"));
    const temDimensao = campos.some(n => n.includes("DEPARTAMENTO") || n.includes("CENTRO DE CUSTO") || n === "OBRA" || n === "PROJETO" || n.includes("CATEGORIA") || n.includes("NATUREZA") || n.includes("RUBRICA"));
    const naoVazia = campos.filter(Boolean).length;
    const pontuacao = (temValor ? 3 : 0) + (temDimensao ? 3 : 0) + Math.min(naoVazia, 6) / 6;
    if (temValor && temDimensao) { headerIndex = i; break; }
    if (naoVazia >= 2 && pontuacao > melhorPontuacao) { headerIndex = i; melhorPontuacao = pontuacao; }
  }
  if (headerIndex < 0) throw new Error("Não encontrei uma linha de cabeçalhos reconhecível nos primeiros 30 registros.");
  const headers = dados[headerIndex].map((h, i) => h || `Coluna ${i + 1}`);
  const rows = dados.slice(headerIndex + 1).filter(linha => linha.some(c => c !== "")).map(linha => {
    const obj = {};
    headers.forEach((header, idx) => { obj[header] = linha[idx] ?? ""; });
    return obj;
  });
  return { headers, rows, linhaCabecalho:headerIndex+1 };
}

function extrairIdPlanilhaGoogle(url) {
  const match = String(url || "").match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || null;
}

const GOOGLE_SHEETS_PAGE_SIZE = 5000;

function buscarPaginaPlanilhaGoogle(id, gid, offset, limite = GOOGLE_SHEETS_PAGE_SIZE, intervalo = '') {
  return new Promise((resolve, reject) => {
    const callbackName = `bpSheetsCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    // Defina explicitamente o formato JSON/JSONP; sem out:json, algumas respostas
    // do Google não chamam o callback e a tela acaba esperando até o timeout.
    const parametros = new URLSearchParams({ tqx: `out:json;responseHandler:${callbackName}`, headers: "0" });
    if (gid) parametros.set("gid", gid);
    if(intervalo)parametros.set('range',intervalo);
    parametros.set("tq", `select * limit ${limite} offset ${offset}`);
    const timer = setTimeout(() => finalizar(new Error(`Tempo esgotado ao ler a página de dados ${Math.floor(offset / limite) + 1} da planilha Google. Confira o compartilhamento 'Qualquer pessoa com o link — Leitor'.`)), 30000);
    function finalizar(erro, resultado) {
      clearTimeout(timer);
      script.remove();
      delete window[callbackName];
      if (erro) reject(erro); else resolve(resultado);
    }
    window[callbackName] = resposta => {
      if (!resposta || resposta.status === "error") {
        const detalhe = resposta?.errors?.map(e => e.detailed_message || e.message).join("; ");
        return finalizar(new Error(detalhe || "O Google não liberou os dados. Verifique o acesso de leitura do link."));
      }
      try {
        const tabela = resposta.table;
        const matriz = (tabela?.rows || []).map(linha => (linha.c || []).map(celula => {if(!celula)return '';const match=String(celula.v??'').match(/^Date\((\d+),(\d+),(\d+)/);return match?`${match[1]}-${String(Number(match[2])+1).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`:(celula.f??celula.v??'');}));
        finalizar(null, { matriz, totalLinhas: tabela?.rows?.length || 0 });
      } catch (erro) { finalizar(erro); }
    };
    script.onerror = () => finalizar(new Error("Não foi possível consultar o Google Planilhas. Confirme que a fonte é nativa do Google e está compartilhada para leitura por link."));
    script.onload = () => setTimeout(() => {
      if (typeof window[callbackName] === 'function') {
        finalizar(new Error("O Google respondeu, mas não enviou os dados da planilha. Confirme o compartilhamento 'Qualquer pessoa com o link — Leitor', se o link aponta para uma planilha nativa (não pasta/arquivo Excel no Drive) e se a aba/ID do link ainda existe."));
      }
    }, 0);
    script.src = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq?${parametros.toString()}`;
    document.head.appendChild(script);
  });
}

async function buscarPlanilhaGoogle(url) {
  const id = extrairIdPlanilhaGoogle(url);
  if (!id) throw new Error("O link Google Planilhas não contém um ID válido.");
  const gid = String(url).match(/[?&#]gid=(\d+)/)?.[1];
  const matrizCompleta = [];
  let offset = 0;
  while (true) {
    const pagina = await buscarPaginaPlanilhaGoogle(id, gid, offset);
    if (!pagina.totalLinhas) break;
    matrizCompleta.push(...pagina.matriz);
    offset += pagina.totalLinhas;
    const botao = document.getElementById('btn-sync');
    if (botao) botao.textContent = `⏳ Lidas ${offset.toLocaleString('pt-BR')} linhas...`;
    if (pagina.totalLinhas < GOOGLE_SHEETS_PAGE_SIZE) break;
  }
  if (!matrizCompleta.length) throw new Error('A planilha Google não retornou linhas. Confirme o ID, a aba e o compartilhamento de leitura.');
  const resultado = formatarMatrizPlanilha(matrizCompleta);
  await preencherTitulosGoogle({...resultado,url},resultado);
  resultado.totalLinhasOrigem = matrizCompleta.length;
  if (matrizCompleta.length >= GOOGLE_SHEETS_PAGE_SIZE && offset === matrizCompleta.length) {
    resultado.avisoLeitura = `A leitura paginada recuperou ${matrizCompleta.length.toLocaleString('pt-BR')} linhas da fonte.`;
  }
  return resultado;
}

async function preencherTitulosGoogle(base,destino=base){
  if(!(base.headers || []).some(h=>/^Coluna \d+$/i.test(h)))return;
  const id=extrairIdPlanilhaGoogle(base.url);if(!id)return;
  const gid=String(base.url).match(/[?&#]gid=(\d+)/)?.[1];
  const row=base.linhaCabecalho || 2;
  try{
    const pagina=await buscarPaginaPlanilhaGoogle(id,gid,0,1,`A${row}:ZZ${row}`);
    const titulos=pagina.matriz.find(r=>r.filter(Boolean).length>=2);if(!titulos)return;
    const conhecidos=base.headers.map((h,i)=>({h,i})).filter(x=>!/^Coluna \d+$/i.test(x.h));
    const matches=conhecidos.filter(x=>normalizarTexto(titulos[x.i])===normalizarTexto(x.h)).length;
    if(matches<Math.min(2,conhecidos.length))return;
    const aliases={...(base.titulosColunas||{})};base.headers.forEach((h,i)=>{const text=String(titulos[i]||'').trim();if(/^Coluna \d+$/i.test(h)&&text)aliases[h]=text;});destino.titulosColunas=aliases;
    cacheNumericoBase.delete(destino);
  }catch(e){console.warn('Não foi possível recuperar os títulos da planilha.',e.message);}
}
async function atualizarTitulosBasesSalvas(){
  const bases=dadosBasePlanilhas.filter(p=>p.url && p.headers?.some(h=>/^Coluna \d+$/i.test(h)&&!p.titulosColunas?.[h]));
  if(!bases.length)return;
  for(const base of bases)await preencherTitulosGoogle(base);
  atualizarSeletoresNovoGrafico();renderizarListaGraficosConfig();renderizarFiltrosBaseDashboard();renderizarDadosBase();
  try{await salvarDadosBaseArmazenados(dadosBasePlanilhas);}catch(e){console.warn('Cabeçalhos atualizados em memória.',e);}
}

async function lerArquivoPlanilhaLocal(file) {
  const extensao = file.name.split(".").pop().toLowerCase();
  if (["csv", "tsv", "txt"].includes(extensao)) {
    if (typeof Papa === "undefined") throw new Error("Biblioteca CSV não carregada.");
    const resultado = Papa.parse(await file.text(), { header: false, skipEmptyLines: true, delimiter: "" });
    if (resultado.errors?.length) throw new Error(resultado.errors.map(e => e.message).join("; "));
    return [{ nomeAba: file.name.replace(/\.[^.]+$/, ""), ...formatarMatrizPlanilha(resultado.data) }];
  }
  if (!window.XLSX) throw new Error("Leitor Excel indisponível. Recarregue a página com acesso à biblioteca SheetJS.");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  return workbook.SheetNames.map(nomeAba => {
    const matriz = XLSX.utils.sheet_to_json(workbook.Sheets[nomeAba], { header: 1, defval: "", raw: false, dateNF:"yyyy-mm-dd", blankrows: false });
    return { nomeAba, ...formatarMatrizPlanilha(matriz) };
  }).filter(aba => aba.headers.length && aba.rows.length);
}

async function importarArquivoRealizado(file, fonte) {
  if (!file) return;
  try {
    const abas = await lerArquivoPlanilhaLocal(file);
    if (!abas.length) throw new Error("O arquivo não contém abas com dados reconhecíveis.");
    const novasFontes = abas.map((aba, indice) => {
      const id = indice === 0 ? fonte.id : `realizado-${Date.now()}-${indice}`;
      const nome = abas.length === 1 ? file.name.replace(/\.[^.]+$/, "") : `${file.name.replace(/\.[^.]+$/, "")} — ${aba.nomeAba}`;
      return { id, nome, url: "", arquivoLocal: true, nomeAba: aba.nomeAba, headers: aba.headers, rows: aba.rows, atualizadoEm: new Date().toISOString() };
    });
    const outros = (dadosBasePlanilhas || []).filter(base => !novasFontes.some(f => f.id === base.id));
    const basesSalvas = [...outros, ...novasFontes.map(f => ({ id: f.id, nome: f.nome, tipo: "Realizado", origem: "arquivo-local", url: "", headers: f.headers, rows: f.rows, atualizadoEm: f.atualizadoEm }))];
    await salvarDadosBaseArmazenados(basesSalvas);
    dadosBasePlanilhas = basesSalvas;
    const indiceFonte = configGlobal.planilhasRealizado.findIndex(f => f.id === fonte.id);
    if (indiceFonte >= 0) configGlobal.planilhasRealizado.splice(indiceFonte, 1, ...novasFontes.map(({ id, nome, url, arquivoLocal, nomeAba }) => ({ ...fonte, id, nome, url, arquivoLocal, nomeAba })));
    localStorage.setItem("config_bp", JSON.stringify(configGlobal));
    renderizarFontesRealizado();
    renderizarDadosBase();
    alert(`${novasFontes.length} aba(s) importada(s) de ${file.name}. Clique em A Extrair Dados para atualizar os indicadores.`);
  } catch (erro) { alert(`Não consegui importar ${file.name}: ${erro.message || erro}`); }
}

async function importarArquivoPrevisto(file, chaveObra) {
  if (!file) return;
  const obra = obrasBD[chaveObra];
  if (!obra) return alert('Não encontrei a obra selecionada para importar o Previsto.');
  try {
    const abas = await lerArquivoPlanilhaLocal(file);
    const aba = abas.find(item => item.rows.length) || abas[0];
    if (!aba?.headers?.length || !aba.rows.length) throw new Error('O arquivo não contém dados reconhecíveis.');
    const base = {
      id: `previsto-${chaveObra}`, nome: `Previsto — ${obra.nome || chaveObra} (${file.name})`, tipo: 'Previsto',
      origem: 'arquivo-local', url: '', headers: aba.headers, rows: aba.rows, atualizadoEm: new Date().toISOString()
    };
    const bases = (dadosBasePlanilhas || []).filter(item => item.id !== base.id);
    bases.push(base);
    await salvarDadosBaseArmazenados(bases);
    dadosBasePlanilhas = bases;
    obra.previstoArquivoLocal = true;
    obra.urlPrevistoCSV = '';
    localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
    renderizarTabelaGestaoObras();
    alert(`Previsto importado para ${obra.nome}. Clique em Sincronizar Base de Dados para recalcular os indicadores.`);
  } catch (erro) {
    alert(`Não consegui importar o Previsto de ${file.name}: ${erro.message || erro}`);
  }
}

// Google Sheets usa a consulta oficial gviz (script injection, sem XHR/CORS); outros links CSV dependem de CORS.
const buscarCSV = async url => {
  if (extrairIdPlanilhaGoogle(url)) return buscarPlanilhaGoogle(url);
  if (typeof Papa === "undefined") throw new Error("Biblioteca PapaParse não carregada.");
  return new Promise((resolve, reject) => Papa.parse(obterLinkCSV(url), {
    download: true, worker: true, header: false, skipEmptyLines: true,
    complete: resultado => {
      try {
        if (resultado.errors?.length) throw new Error(resultado.errors.map(e => e.message).join("; "));
        resolve(formatarMatrizPlanilha(resultado.data));
      } catch (erro) { reject(erro); }
    },
    error: erro => reject(new Error(`O servidor deste link bloqueou a leitura direta do navegador (CORS). Baixe o arquivo e use Importar arquivo. Detalhe: ${erro.message || "falha de rede"}`))
  }));
};

// ==========================================
// INICIALIZAÇÃO
// ==========================================
window.onload = async function() {
  try { await carregarDadosBaseArmazenados(); }
  catch (e) { console.warn('Falha ao abrir Dados Base no IndexedDB.', e); }
  try {
    document.getElementById('header-app-title').innerText = configGlobal.titulo || "Brasil Pontes";
    document.getElementById('login-app-title').innerText = configGlobal.titulo || "Brasil Pontes";
    // Corrige também a fonte antiga guardada somente no navegador, mesmo se o Supabase estiver indisponível.
    migrarLinkPlanilhaRealizado();

    if (supabaseClient) {
      const { data: config } = await supabaseClient.from('configuracoes').select('*').limit(1).single();
      if (config) { configGlobal.titulo = config.titulo || "Brasil Pontes"; configGlobal.urlRealizado = config.url_realizado || "";configGlobal.idConfigSupabase=config.id;configGlobal.revisaoDados=config.revisao_dados;configGlobal.manutencao=!!config.perfis_json?.__sistema?.manutencao;configGlobal.assinaturaPerfis=JSON.stringify(config.perfis_json||{});carregarParametrosSistema(config.perfis_json?.__sistema);const revisaoPlanilhas=config.perfis_json?.__sistema?.revisaoPlanilhas;if(revisaoPlanilhas&&localStorage.getItem('revisao_planilhas_bp')!==revisaoPlanilhas){dadosBasePlanilhas=dadosBasePlanilhas.filter(p=>p.tipo==='Previsto'||p.origem==='arquivo-local');await salvarDadosBaseArmazenados(dadosBasePlanilhas);localStorage.setItem('revisao_planilhas_bp',revisaoPlanilhas);}if(config.perfis_json && typeof config.perfis_json==='object'){Object.entries(config.perfis_json).filter(([p])=>!['__proto__','constructor','prototype','Mestre','__sistema'].includes(p)).forEach(([p,regras])=>{permissoesPerfis[p]={...(PERMISSOES_PADRAO[p]||PERMISSOES_PADRAO.Engenheiro),...regras};});localStorage.setItem('permissoes_bp',JSON.stringify(permissoesPerfis));} }
      const linkRealizadoDesatualizado = ["1S41dXyTC2Y_SJjD3iw86WaUqi0OWNxyf", "1v3FrPW55ofd8j3-rOqyyZlw1HHMJuf6", "1wZQhhLXwcpToKGy26gW1rHooGwUuRQMJ"].some(id => String(config?.url_realizado || "").includes(id));
      if (migrarLinkPlanilhaRealizado() && linkRealizadoDesatualizado) {
        const { error } = await supabaseClient.from('configuracoes').update({ url_realizado: configGlobal.urlRealizado }).eq('id', config.id);
        if (error) console.warn('Não foi possível salvar a nova fonte Realizado no Supabase:', error.message);
      }

      const { data: users } = await supabaseClient.from('usuarios').select('*');
      if (users && Array.isArray(users)) {
        usuariosBD = [MASTER_USER, ...users.filter(u => u.status === 'Aprovado' && u.usuario !== MASTER_USER.usuario)];
        solicitacoesPendentesBD = users.filter(u => u.status === 'Pendente');
      }

      const { data: obras } = await supabaseClient.from('obras').select('*');
      if (obras && Array.isArray(obras)) {
        obras.forEach(o => {
          obrasBD[o.id] = {
            id: o.id, nome: o.nome, cc: o.cc, responsavel: o.responsavel, status: o.status, urlPrevistoCSV: o.url_previsto,
            previstoArquivoLocal: !!(obrasBD[o.id]?.previstoArquivoLocal),
            custosFixos: o.dados_json?.custosFixos || obrasBD[o.id]?.custosFixos || [],
            solicitacoesCustosFixos: o.dados_json?.solicitacoesCustosFixos || [],
            oculta: !!(o.dados_json?.oculta ?? obrasBD[o.id]?.oculta),
            previstoTotal: o.dados_json?.previstoTotal || 0, realizadoTotal: o.dados_json?.realizadoTotal || 0,
            categoriasPrevisto: o.dados_json?.categoriasPrevisto || {}, categoriasRealizado: o.dados_json?.categoriasRealizado || {}
          };
        });
      }
    }
  } catch (e) { console.warn("Modo offline."); }
  
  const sessao = localStorage.getItem('usuario_bp_id');
  if (sessao) {
    if (sessao === "local_master") usuarioAutenticado = MASTER_USER;
    else usuarioAutenticado = usuariosBD.find(u => u.id === sessao || u.usuario === sessao);
  }
  verificarSessao();
  renderizarDadosBase();
  if(usuarioAutenticado)atualizarTitulosBasesSalvas().catch(e=>console.warn(e));
};

function verificarSessao() {
  atualizarSeletoresPerfis();
  aplicarEstadoManutencao();
  if(usuarioAutenticado&&!acessoLiberadoManutencao())return;
  if (!usuarioAutenticado) {
    document.getElementById('screen-login').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
  } else {
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    carregarGraficosUsuario();
    popularSeletorObras();
    atualizarDashboard();
    aplicarPermissoesPerfil();
  }
}

// ==========================================
// LOGIN BLINDADO
// ==========================================
async function executarLogin(e) {
  if (e) e.preventDefault(); 
  const inputUser = document.getElementById('login-usuario').value.trim();
  const inputSenha = document.getElementById('login-senha').value.trim();

  if (!inputUser || !inputSenha) return alert("Preencha tudo.");
  const btn = document.getElementById('btn-entrar');
  const txtOriginal = btn.innerText;
  btn.innerText = "A autenticar...";

  if ((inputUser === MASTER_USER.usuario || inputUser === MASTER_USER.email) && inputSenha === MASTER_USER.senha) {
    usuarioAutenticado = MASTER_USER; localStorage.setItem('usuario_bp_id', MASTER_USER.id);
    verificarSessao(); btn.innerText = txtOriginal; return;
  }

  try {
    if (supabaseClient) {
      const { data: user } = await supabaseClient.from('usuarios').select('*').or(`usuario.eq.${inputUser},email.eq.${inputUser}`).eq('senha', inputSenha).single();
      if (user) {
        if (user.status === "Aprovado") {
          usuarioAutenticado = user; localStorage.setItem('usuario_bp_id', user.id); verificarSessao();
        } else alert("Acesso pendente de aprovação.");
        btn.innerText = txtOriginal; return;
      }
    }
  } catch (err) {}

  const userLocal = usuariosBD.find(u => (u.usuario === inputUser || u.email === inputUser) && u.senha === inputSenha);
  if (userLocal) {
    if (userLocal.status === "Aprovado") { usuarioAutenticado = userLocal; localStorage.setItem('usuario_bp_id', userLocal.id); verificarSessao(); }
    else alert("Acesso pendente.");
  } else alert("Usuário ou senha incorretos.");
  
  btn.innerText = txtOriginal;
}

function executarLogout() { usuarioAutenticado = null; localStorage.removeItem('usuario_bp_id'); verificarSessao(); }
function exibirFormSolicitacao() { document.getElementById('box-login').classList.add('hidden'); document.getElementById('box-solicitacao').classList.remove('hidden'); }
function exibirFormLogin() { document.getElementById('box-solicitacao').classList.add('hidden'); document.getElementById('box-login').classList.remove('hidden'); }

window.abrirAbaSistema = abrirAbaSistema;

function abrirAbaSistema(aba) {
  if(!acessoLiberadoManutencao())return;
  const chave = aba === 'dados-base' ? 'realizado' : aba;
  const dashboard = chave === 'dashboard';
  const permissoes=obterPermissoesUsuario();
  if (dashboard && !permissoes.dashboard) return alert('Seu perfil não tem acesso às Análises.');
  if (chave === 'pesquisa' && !permissoes.pesquisa) return alert('Seu perfil não tem acesso à Pesquisa.');
  if (!dashboard && chave !== 'pesquisa' && !permissoes.dadosBase) return alert('Seu perfil não tem acesso aos dados.');
  const views={dashboard:'view-dashboard',pesquisa:'view-pesquisa',realizado:'view-dados-base',previsto:'view-previsto',fixos:'view-custos-fixos',recorrentes:'view-recorrentes'};
  Object.entries(views).forEach(([nome,id])=>document.getElementById(id)?.classList.toggle('hidden',nome!==chave));
  const navs={dashboard:'nav-dashboard',pesquisa:'nav-pesquisa',realizado:'nav-dados-base',previsto:'nav-previsto',fixos:'nav-custos-fixos',recorrentes:'nav-recorrentes'};
  Object.entries(navs).forEach(([nome,id])=>{const el=document.getElementById(id);if(el)el.className=nome===chave?'px-4 py-3 border-b-2 border-[#003399] text-[#003399] font-bold text-sm whitespace-nowrap':'px-4 py-3 text-gray-500 font-bold text-sm hover:text-[#003399] whitespace-nowrap';});
  if(chave==='dashboard') atualizarDashboard();
  if(chave==='realizado') renderizarDadosBase();
  if(chave==='pesquisa') pesquisarCustos(filtrosPesquisaCustos);
  if(chave==='previsto') renderizarPrevisto();
  if(chave==='recorrentes'){renderizarPagamentosRecorrentes();if(!dadosBasePlanilhas.some(p=>p.tipo==='Realizado'&&p.rows?.length))garantirBaseConsulta().then(renderizarPagamentosRecorrentes).catch(e=>{document.getElementById('recorrentes-status').textContent=e.message;});}
  if(chave==='fixos'){renderizarCustosFixos();if(!dadosBasePlanilhas.some(p=>p.tipo==='Realizado'&&p.rows?.length))garantirBaseConsulta().then(renderizarCustosFixos).catch(e=>{document.getElementById('fixos-status').textContent=e.message;});}
  renderizarControlesAvancados();
  if ((chave === 'pesquisa' || chave === 'realizado') && !dadosBasePlanilhas.some(p => p.tipo === 'Realizado' && p.rows?.length)) {
    const status=document.getElementById(chave==='pesquisa'?'pesquisa-custos-aviso':'dados-base-status');
    if(status) status.textContent='Carregando a planilha compartilhada para consulta. Você pode pesquisar enquanto os dados são lidos…';
    garantirBaseConsulta().then(()=>{if(chave==='pesquisa')pesquisarCustos(filtrosPesquisaCustos);else renderizarDadosBase();}).catch(()=>{
      if(chave==='pesquisa')pesquisarCustos(filtrosPesquisaCustos);
      if(status)status.textContent=`Não consegui carregar o detalhamento: ${erroConsultaBase}. Os resumos por categoria permanecem disponíveis; reabra a aba para tentar novamente.`;
    });
  }
}

function renderizarPrevisto() {
  const obra=obrasBD[obraAtivaID];
  const status=document.getElementById('previsto-status');
  const host=document.getElementById('previsto-tabela');
  const kpis=document.getElementById('previsto-kpis');
  const paginacao=document.getElementById('previsto-paginacao');
  if(!host||!kpis)return;
  if(graficoPrevistoCustos){graficoPrevistoCustos.destroy();graficoPrevistoCustos=null;}
  document.getElementById('previsto-chart-vazio')?.classList.add('hidden');
  host.replaceChildren();kpis.replaceChildren();paginacao?.replaceChildren();
  if(!obra){if(status)status.textContent='Selecione uma obra para consultar o previsto.';return;}
  const planilha=(dadosBasePlanilhas||[]).find(p=>p.tipo==='Previsto'&&p.id===`previsto-${obraAtivaID}`);
  const moeda=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const categorias=Object.keys(obra.categoriasPrevisto||{}).filter(c=>categoriaEstaSelecionada(c));
  const previsto=Number(categorias.reduce((s,c)=>s+(obra.categoriasPrevisto?.[c]||0),0))*multiplicadorCenario;
  if(status)status.textContent='Obra: '+(obra.nome||obra.cc||'—')+' • Fonte: '+(planilha?.nome||'Planilha Previsto')+' • '+(planilha?.atualizadoEm?'Atualizada em '+new Date(planilha.atualizadoEm).toLocaleString('pt-BR'):'');
  [['Total previsto no cenário',moeda(previsto)],['Categorias previstas',String(categorias.length)],['Linhas da planilha',String(planilha?.rows?.length||0)]].forEach(([label,value])=>{const card=document.createElement('div');card.className='bg-white p-4 rounded-xl shadow-sm border border-gray-200';const l=document.createElement('p');l.className='text-xs font-bold text-gray-500 uppercase';l.textContent=label;const v=document.createElement('p');v.className='text-lg font-black text-[#003399] mt-1';v.textContent=value;card.append(l,v);kpis.appendChild(card);});
  const headers=planilha?.headers||[];const rows=(planilha?.rows||[]).filter(row=>linhaPassaFiltroInterativo(planilha,row,headers.find(h=>/categoria|natureza/.test(normalizarTextoUI(tituloColunaBase(planilha,h))))));
  const categoriaHeader=headers.find(h=>/categoria|natureza/.test(normalizarTextoUI(tituloColunaBase(planilha,h))));
  const descricaoHeader=headers.find(h=>/descricao|servico|item/.test(normalizarTextoUI(h)));
  const valorHeader=headers.find(h=>/custo total|valor total/.test(normalizarTextoUI(h))||normalizarTextoUI(h)==='valor')||headers.find(h=>/custo|valor/.test(normalizarTextoUI(h)));
  ordenarLinhasTela(rows,'previsto',categoriaHeader||descricaoHeader,valorHeader);
  const resumo=new Map();
  if(rows.length&&valorHeader){rows.forEach(row=>{const nome=String(row[categoriaHeader]||row[descricaoHeader]||'Item previsto').trim();resumo.set(nome,(resumo.get(nome)||0)+parseMonetario(row[valorHeader])*multiplicadorCenario);});}
  else categorias.forEach(c=>resumo.set(c,(obra.categoriasPrevisto?.[c]||0)*multiplicadorCenario));
  const totalFiltrado=[...resumo.values()].reduce((sum,value)=>sum+value,0);
  if(kpis.children[0]?.children[1])kpis.children[0].children[1].textContent=moeda(totalFiltrado);
  if(kpis.children[1]?.children[1])kpis.children[1].children[1].textContent=String(resumo.size);
  if(kpis.children[2]?.children[1])kpis.children[2].children[1].textContent=String(rows.length);
  const chartData=[...resumo.entries()].sort((a,b)=>b[1]-a[1]).slice(0,parametrosSistema.maxCategoriasGrafico);const canvas=document.getElementById('previsto-chart');
  if(chartData.length&&canvas&&typeof Chart!=='undefined'){graficoPrevistoCustos=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels:chartData.map(x=>x[0]),datasets:[{label:'Previsto',data:chartData.map(x=>x[1]),backgroundColor:'#00CFFF',borderColor:'#009fc4',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,onClick:(event,elements,chart)=>{const pontos=elements?.length?elements:chart.getElementsAtEventForMode(event,'nearest',{intersect:false},true);const label=chartData[pontos?.[0]?.index]?.[0];if(label===undefined)return;if(categoriaHeader||!planilha)selecionarCategoriaGrafico(label);else{const header=descricaoHeader;const atual=filtrosDashboard.base;filtrosDashboard.base=atual?.planilhaId===planilha.id&&atual.header===header&&atual.value===label?null:{planilhaId:planilha.id,planilhaNome:planilha.nome,header,value:label};atualizarDashboard();}},interaction:{mode:'nearest',intersect:false},indexAxis:chartData.length>7?'y':'x',plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:ctx=>'Previsto: '+moeda(ctx.raw)}}},scales:{x:{beginAtZero:true},y:{beginAtZero:true}}}});}
  else {const vazio=document.getElementById('previsto-chart-vazio');if(vazio){vazio.textContent=chartData.length?'Gráfico indisponível: biblioteca de gráficos não carregada.':'Não há categorias previstas para desenhar o gráfico.';vazio.classList.remove('hidden');}}
  if(!planilha){const vazio=document.createElement('div');vazio.className='p-8 text-center text-gray-500';vazio.textContent='Não há planilha de Previsto importada para esta obra. Cadastre a planilha nas configurações da obra e sincronize os dados.';host.appendChild(vazio);return;}
  if(!headers.length){const vazio=document.createElement('div');vazio.className='p-8 text-center text-gray-500';vazio.textContent='A planilha de Previsto não possui dados para exibir.';host.appendChild(vazio);return;}
  const totalPaginas=Math.max(1,Math.ceil(rows.length/DADOS_BASE_PAGINA_TAMANHO));previstoPaginaAtual=Math.min(previstoPaginaAtual,totalPaginas-1);const inicio=previstoPaginaAtual*DADOS_BASE_PAGINA_TAMANHO;const fatia=rows.slice(inicio,inicio+DADOS_BASE_PAGINA_TAMANHO);
  const wrap=document.createElement('div');wrap.className='overflow-auto max-h-[70vh]';const table=document.createElement('table');table.className='min-w-full text-xs text-left';const thead=document.createElement('thead');thead.className='sticky top-0 bg-[#003399] text-white uppercase';const trh=document.createElement('tr');headers.forEach(h=>{const th=document.createElement('th');th.className='p-3 whitespace-nowrap';th.textContent=tituloColunaBase(planilha,h);trh.appendChild(th);});thead.appendChild(trh);const tbody=document.createElement('tbody');tbody.className='divide-y divide-gray-200';
  fatia.forEach(row=>{const tr=document.createElement('tr');headers.forEach(h=>{const td=document.createElement('td');td.className='p-3 whitespace-nowrap';td.textContent=row[h]??'';tr.appendChild(td);});tbody.appendChild(tr);});table.append(thead,tbody);wrap.appendChild(table);host.appendChild(wrap);
  if(paginacao){const anterior=document.createElement('button');anterior.type='button';anterior.textContent='← Anterior';anterior.disabled=previstoPaginaAtual===0;anterior.className='px-3 py-2 border rounded-lg text-sm font-bold disabled:opacity-40';anterior.onclick=()=>{previstoPaginaAtual--;renderizarPrevisto();};const texto=document.createElement('span');texto.className='text-sm text-gray-600';texto.textContent=`Página ${previstoPaginaAtual+1} de ${totalPaginas} • ${rows.length} linhas`;const proxima=document.createElement('button');proxima.type='button';proxima.textContent='Próxima →';proxima.disabled=previstoPaginaAtual>=totalPaginas-1;proxima.className='px-3 py-2 border rounded-lg text-sm font-bold disabled:opacity-40';proxima.onclick=()=>{previstoPaginaAtual++;renderizarPrevisto();};paginacao.append(anterior,texto,proxima);}
}

window.pesquisarCustos = pesquisarCustos;
window.imprimirRelatorioPesquisa = imprimirRelatorioPesquisa;

function pesquisarCustos(termo) {
  filtrosPesquisaCustos=String(termo||'');
  const query=normalizarTextoUI(filtrosPesquisaCustos.trim());
  const resumo=document.getElementById('pesquisa-custos-resumo'), leitura=document.getElementById('pesquisa-custos-leitura'), aviso=document.getElementById('pesquisa-custos-aviso'), host=document.getElementById('pesquisa-custos-resultados');
  const graficoCard=document.getElementById('pesquisa-custos-grafico-card'), canvas=document.getElementById('pesquisa-custos-chart'), graficoVazio=document.getElementById('pesquisa-custos-grafico-vazio');
  if(!resumo||!aviso||!host)return;
  if(graficoPesquisaCustos){graficoPesquisaCustos.destroy();graficoPesquisaCustos=null;}
  resumo.replaceChildren();host.replaceChildren();if(leitura){leitura.replaceChildren();leitura.classList.add('hidden');}graficoCard?.classList.add('hidden');graficoVazio?.classList.add('hidden');
  document.getElementById('pesquisa-velocimetros')?.replaceChildren();
  document.getElementById('pesquisa-velocimetros')?.classList.add('hidden');
  const btnImprimir=document.getElementById('btn-imprimir-relatorio-pesquisa');btnImprimir?.classList.toggle('hidden',!query);
  if(!query){aviso.textContent='Digite uma categoria, item ou descrição para gerar o relatório da pesquisa.';return;}
  const obra=obrasBD[obraAtivaID];if(!obra){aviso.textContent='Selecione uma obra no cabeçalho antes de pesquisar.';return;}
  const dados=[];const norm=normalizarTextoUI;const col=(headers,pred)=>headers.find(h=>pred(norm(h)));let possuiFonteObra=false;
  (dadosBasePlanilhas||[]).filter(p=>p.tipo==='Realizado'||!p.tipo).forEach(planilha=>{
    const headers=planilha.headers||[];const campos=obterCamposRealizado(headers,planilha.rows||[],planilha.id);const obraHeader=campos.obra;if(!obraHeader)return;
    const categoriaHeader=campos.categoria;
    const valorHeader=campos.valor;
    const itemHeader=col(headers,h=>h==='item'||h.includes('item ')||h.includes('codigo item')||h.includes('codigo'));
    const descricaoHeader=col(headers,h=>h.includes('descricao')||h.includes('servico')||h.includes('historico')||h.includes('especificacao'));
    const camposBusca=headers.filter(header=>/categoria|natureza|item|descricao|servico|historico|fornecedor|produto|conta|codigo/.test(norm(header)));
    linhasDaObra(planilha,obra).forEach(row=>{
      const obraLinha=norm(row[obraHeader]);const obraOk=obraLinha===norm(obra.nome)||obraLinha===norm(obra.cc)||obraLinha===norm(obra.id)||((obra.cc||'').trim()&&obraLinha.includes(norm(obra.cc)));
      if(!obraOk)return;possuiFonteObra=true;if(!linhaPassaFiltroInterativo(planilha,row,categoriaHeader))return;if(!(camposBusca.length?camposBusca:headers).some(header=>norm(row[header]).includes(query)))return;
      const categoria=String((categoriaHeader&&row[categoriaHeader])||'Outros').trim()||'Outros';
      dados.push({planilha:planilha.nome,categoria,item:itemHeader?row[itemHeader]:'',descricao:descricaoHeader?row[descricaoHeader]:'',valor:valorHeader?parseMonetario(row[valorHeader]):0,row});
    });
  });
  const usandoResumo = !(dadosBasePlanilhas || []).some(p => (p.tipo === 'Realizado' || !p.tipo) && p.rows?.length);
  if (usandoResumo && !periodoPagamento.inicio && !periodoPagamento.fim) {
    possuiFonteObra = true;
    Object.entries(obra.categoriasRealizado || {}).filter(([categoria])=>norm(categoria).includes(query)&&categoriaEstaSelecionada(categoria)).forEach(([categoria,valor])=>dados.push({planilha:'Resumo sincronizado',categoria,item:'',descricao:'Total da categoria',valor:Number(valor)||0,agregado:true}));
  }
  const planilhaPrevisto=(dadosBasePlanilhas||[]).find(p=>p.tipo==='Previsto'&&p.id===`previsto-${obraAtivaID}`);const previstosDiretos=[];
  if(planilhaPrevisto){
    const headers=planilhaPrevisto.headers||[];const valorHeader=headers.find(h=>/custo total|valor total/.test(norm(h))||norm(h)==='valor')||col(headers,h=>h.includes('custo')||h.includes('valor'));
    const categoriaHeader=col(headers,h=>h.includes('categoria')||h.includes('natureza'));
    const itemHeader=col(headers,h=>h==='item'||h.includes('item ')||h.includes('codigo item')||h.includes('codigo'));
    const descricaoHeader=col(headers,h=>h.includes('descricao')||h.includes('servico')||h.includes('historico')||h.includes('especificacao'));
    const campos=headers.filter(h=>/categoria|natureza|item|descricao|servico|historico|fornecedor|produto|conta|codigo/.test(norm(h)));
    (planilhaPrevisto.rows||[]).forEach(row=>{if(!linhaPassaFiltroInterativo(planilhaPrevisto,row,categoriaHeader))return;if((campos.length?campos:headers).some(header=>norm(row[header]).includes(query)))previstosDiretos.push({categoria:String((categoriaHeader&&row[categoriaHeader])||'Item encontrado').trim(),item:itemHeader?row[itemHeader]:'',descricao:descricaoHeader?row[descricaoHeader]:'',valor:(valorHeader?parseMonetario(row[valorHeader]):0)*multiplicadorCenario});});
  }
  ordenarObjetosTela(dados,'pesquisa',x=>x.valor,x=>x.categoria||x.item);ordenarObjetosTela(previstosDiretos,'pesquisa',x=>x.valor,x=>x.categoria||x.item);
  const cats=[...new Set(dados.map(x=>x.categoria))];const prevCats=Object.keys(obra.categoriasPrevisto||{}).filter(c=>cats.some(x=>norm(x)===norm(c)));
  const previstoCategorias=prevCats.reduce((sum,c)=>sum+(obra.categoriasPrevisto[c]||0)*multiplicadorCenario,0);
  const previstoDireto=previstosDiretos.reduce((sum,x)=>sum+x.valor,0);const temPrevistoDireto=previstosDiretos.length>0;const previsto=temPrevistoDireto?previstoDireto:previstoCategorias;const temPrevisto=temPrevistoDireto||prevCats.length>0;
  const realizado=dados.reduce((sum,x)=>sum+x.valor,0);const saldo=temPrevisto?previsto-realizado:null;const uso=temPrevisto&&previsto>0?realizado/previsto*100:null;
  const moeda=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const cards=[['Previsto da pesquisa',temPrevisto?moeda(previsto):'Sem correspondência'],['Realizado encontrado',moeda(realizado)],['Saldo previsto − realizado',saldo===null?'Sem previsto':moeda(saldo)],['Uso do previsto',uso===null?(temPrevisto?'N/P':'Sem previsto'):uso.toFixed(1)+'%'],[usandoResumo?'Categorias consolidadas':'Registros realizados',String(dados.length)]];
  cards.forEach(([label,value])=>{const card=document.createElement('article');card.className='bg-white p-4 rounded-xl border border-gray-200 shadow-sm';const l=document.createElement('p');l.className='text-xs font-bold text-gray-500';l.textContent=label;const v=document.createElement('p');v.className='text-lg font-black text-[#003399] mt-1';v.textContent=value;card.append(l,v);resumo.appendChild(card);});
  const grupos=new Map();const grupo=categoria=>{const key=norm(categoria)||'item';if(!grupos.has(key))grupos.set(key,{categoria:categoria||'Item encontrado',previsto:0,realizado:0});return grupos.get(key);};
  if(temPrevistoDireto)previstosDiretos.forEach(x=>grupo(x.categoria).previsto+=x.valor);else prevCats.forEach(c=>grupo(c).previsto+=(obra.categoriasPrevisto[c]||0)*multiplicadorCenario);
  dados.forEach(x=>grupo(x.categoria).realizado+=x.valor);
  const linhasGrafico=[...grupos.values()].sort((a,b)=>(b.previsto+b.realizado)-(a.previsto+a.realizado)).slice(0,parametrosSistema.maxCategoriasGrafico);
  const detalhesVelocimetro=[...grupos.values()].map(g=>({label:'Categoria: '+g.categoria,previsto:g.previsto,realizado:g.realizado}));
  const itens=new Map();
  const itemChave=x=>{const value=normalizarTexto(x.item || x.descricao || '');return ['N/D','N/A','0',''].includes(value)?'':value;};
  [...previstosDiretos,...dados].forEach(x=>{const key=itemChave(x);if(key && !x.agregado && !itens.has(key))itens.set(key,{label:'Item: '+String(x.item || x.descricao).trim(),previsto:0,realizado:0});});
  previstosDiretos.forEach(x=>{const item=itens.get(itemChave(x));if(item)item.previsto+=x.valor;});
  dados.forEach(x=>{const item=itens.get(itemChave(x));if(item)item.realizado+=x.valor;});
  renderizarVelocimetros('pesquisa-velocimetros',{label:'Total da pesquisa',previsto,realizado},[...detalhesVelocimetro,...itens.values()]);
  if(linhasGrafico.length&&canvas&&typeof Chart!=='undefined'){
    graficoCard?.classList.remove('hidden');graficoPesquisaCustos=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels:linhasGrafico.map(x=>x.categoria),datasets:[{label:'Previsto',data:linhasGrafico.map(x=>x.previsto),backgroundColor:'#00CFFF',borderColor:'#009fc4',borderWidth:1},{label:'Realizado',data:linhasGrafico.map(x=>x.realizado),backgroundColor:'#003399',borderColor:'#002266',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,onClick:cliqueCategoriaGrafico(linhasGrafico.map(x=>x.categoria)),interaction:{mode:'nearest',intersect:false},indexAxis:linhasGrafico.length>7?'y':'x',plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+moeda(ctx.raw)}}},scales:{y:{beginAtZero:true,ticks:{callback:value=>Number(value).toLocaleString('pt-BR')}},x:{beginAtZero:true}}}});
  } else if(linhasGrafico.length&&graficoVazio){graficoCard?.classList.remove('hidden');graficoVazio.classList.remove('hidden');graficoVazio.textContent='Gráfico indisponível: biblioteca de gráficos não carregada.';}
  if(leitura){leitura.classList.remove('hidden');leitura.className='bg-white p-4 rounded-xl border border-gray-200 text-sm text-gray-700';const title=document.createElement('h3');title.className='font-bold text-[#003399] mb-1';title.textContent='Leitura da pesquisa';const p=document.createElement('p');p.textContent=temPrevistoDireto?'O previsto foi calculado a partir dos itens correspondentes encontrados na planilha da obra.':temPrevisto?'Não houve correspondência direta de item no Previsto; foi usado o total previsto das categorias presentes nos registros realizados.':'Não foi localizada previsão compatível com o termo pesquisado.';leitura.append(title,p);}
  if(!possuiFonteObra)aviso.textContent='Não encontrei uma coluna que identifique a obra nas planilhas importadas; não somei dados de outras obras.';
  else if(!dados.length&&previstosDiretos.length)aviso.textContent='Há itens previstos correspondentes a “'+filtrosPesquisaCustos+'”, mas nenhum registro realizado correspondente nesta obra.';
  else if(!dados.length)aviso.textContent='Nenhum registro corresponde a “'+filtrosPesquisaCustos+'” na obra '+(obra.nome||obra.cc)+'.';
  else aviso.textContent='Relatório para “'+filtrosPesquisaCustos+'” na obra '+(obra.nome||obra.cc)+'. O gráfico mostra até 12 categorias/itens de maior valor.';
  if(usandoResumo && (periodoPagamento.inicio||periodoPagamento.fim))aviso.textContent='Carregue o detalhamento do Realizado para filtrar pagamentos por data. Os resumos por categoria não contêm datas.';
  else if(usandoResumo)aviso.textContent=consultaBaseEmAndamento?'Carregando o detalhamento da planilha. Por enquanto, a pesquisa usa os totais por categoria sincronizados.':'A pesquisa usa os totais por categoria sincronizados. Abra novamente esta aba para carregar o detalhamento por item e fornecedor.';
  if(previstosDiretos.length){const sec=document.createElement('section');sec.className='mb-4';const t=document.createElement('h3');t.className='font-bold text-[#003399] p-3';t.textContent='Itens previstos encontrados ('+previstosDiretos.length+')';sec.appendChild(t);sec.appendChild(criarTabelaPesquisa(['Categoria','Item','Descrição','Previsto'],previstosDiretos.map(x=>[x.categoria,x.item,x.descricao,moeda(x.valor)])));host.appendChild(sec);}
  if(dados.length){const sec=document.createElement('section');const t=document.createElement('h3');t.className='font-bold text-[#003399] p-3';t.textContent='Registros realizados encontrados ('+dados.length+')';sec.appendChild(t);sec.appendChild(criarTabelaPesquisa(['Planilha','Categoria','Item','Descrição','Realizado'],dados.slice(0,parametrosSistema.maxRegistrosPesquisa).map(x=>[x.planilha,x.categoria,x.item,x.descricao,moeda(x.valor)])));host.appendChild(sec);if(dados.length>parametrosSistema.maxRegistrosPesquisa){const n=document.createElement('p');n.className='text-xs text-gray-500 p-3';n.textContent='Exibindo os primeiros '+parametrosSistema.maxRegistrosPesquisa+' de '+dados.length+' registros realizados.';host.appendChild(n);}}
}
async function imprimirRelatorioPesquisa(){
  if(!obterPermissoesUsuario().relatorios)return alert('Seu perfil não pode imprimir relatórios.');
  if(!filtrosPesquisaCustos.trim())return alert('Digite um termo antes de imprimir o relatório da pesquisa.');
  const root=document.getElementById('relatorio-impressao');if(!root)return;
  root.replaceChildren();
  const sec=title=>{const box=el('div','report-section-heading');box.appendChild(el('h2','',title));return box;};
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
  const logo=el('img','report-logo');logo.src='assets/logo-brasil-pontes.png';logo.alt='Logo Brasil Pontes';
  const brand=el('div','report-brand');brand.append(el('strong','',configGlobal.titulo||'Brasil Pontes'),el('span','','Controladoria & Engenharia de Custos'));
  const wave=document.createElementNS('http://www.w3.org/2000/svg','svg');wave.setAttribute('viewBox','0 0 1200 150');wave.setAttribute('preserveAspectRatio','none');wave.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M0 0 H1200 V92 C900 125 640 40 340 70 C190 85 80 115 0 138 Z');path.setAttribute('fill','#4472c4');wave.appendChild(path);const header=el('header','report-letterhead');header.append(wave,logo,brand);root.appendChild(header);
  const capa=el('section','report-cover');capa.append(el('p','report-kicker','PESQUISA · ENGENHARIA DE CUSTOS'),el('h1','report-title','Relatório da pesquisa'),el('p','report-subtitle','Termo: “'+filtrosPesquisaCustos+'” · Obra: '+(obrasBD[obraAtivaID]?.nome||obrasBD[obraAtivaID]?.cc||'—')));capa.appendChild(el('p','report-generated','Emitido em '+new Date().toLocaleString('pt-BR')+' · Cenário: '+(document.getElementById('seletor-cenario')?.selectedOptions[0]?.textContent||'Base')));root.appendChild(capa);
  const resumo=document.getElementById('pesquisa-custos-resumo');if(resumo){root.appendChild(sec('Indicadores da pesquisa'));const kpis=resumo.cloneNode(true);kpis.className='report-kpi-grid';Array.from(kpis.children).forEach((card,i)=>{card.className='report-kpi report-kpi-'+i;const textos=card.querySelectorAll('p');if(textos[0])textos[0].className='';if(textos[1])textos[1].className='';});root.appendChild(kpis);}
  const leitura=document.getElementById('pesquisa-custos-leitura');if(leitura&&!leitura.classList.contains('hidden')){root.appendChild(sec('Leitura gerencial'));root.appendChild(el('p','report-methodology',leitura.innerText));}
  const canvas=document.getElementById('pesquisa-custos-chart');if(canvas&&!document.getElementById('pesquisa-custos-grafico-card')?.classList.contains('hidden')){try{root.appendChild(sec('Previsto x realizado'));const figure=el('figure','report-chart-card');const img=el('img','',null);img.src=canvas.toDataURL('image/png');img.alt='Gráfico de previsto e realizado da pesquisa';figure.appendChild(img);root.appendChild(figure);}catch(e){console.warn('Não foi possível anexar o gráfico ao relatório.',e);}}
  const resultados=document.getElementById('pesquisa-custos-resultados');if(resultados?.children.length){root.appendChild(sec('Detalhamento dos resultados'));root.appendChild(resultados.cloneNode(true));}
  const footer=el('footer','report-letterhead-footer');const waveFooter=document.createElementNS('http://www.w3.org/2000/svg','svg');waveFooter.setAttribute('viewBox','0 0 1200 100');waveFooter.setAttribute('preserveAspectRatio','none');waveFooter.setAttribute('aria-hidden','true');const pathFooter=document.createElementNS('http://www.w3.org/2000/svg','path');pathFooter.setAttribute('d','M0 30 C300 0 680 72 930 42 C1050 28 1130 15 1200 0 V100 H0 Z');pathFooter.setAttribute('fill','#003399');waveFooter.appendChild(pathFooter);footer.append(waveFooter,el('div','report-footer-text','Brasil Pontes · Controladoria & Engenharia de Custos'));root.appendChild(footer);
  await Promise.allSettled(Array.from(root.querySelectorAll('img')).map(img=>img.decode?img.decode():Promise.resolve()));window.print();
}

function criarTabelaPesquisa(titulos,linhas){const wrap=document.createElement('div');wrap.className='overflow-auto max-h-[55vh]';const table=document.createElement('table');table.className='min-w-full text-xs text-left search-report-table';const thead=document.createElement('thead');thead.className='sticky top-0 bg-[#003399] text-white';const trh=document.createElement('tr');titulos.forEach(t=>{const th=document.createElement('th');th.className='p-3 whitespace-nowrap';th.textContent=t;trh.appendChild(th);});thead.appendChild(trh);const tbody=document.createElement('tbody');tbody.className='divide-y divide-gray-200';linhas.forEach(valores=>{const tr=document.createElement('tr');valores.forEach(v=>{const td=document.createElement('td');td.className='p-3 whitespace-nowrap';td.textContent=String(v??'');tr.appendChild(td);});tbody.appendChild(tr);});table.append(thead,tbody);wrap.appendChild(table);return wrap;}

function limparPesquisaCustos(){const input=document.getElementById('pesquisa-custos-input');if(input)input.value='';pesquisarCustos('');}

function sincronizarFiltroDadosBaseComObra(){
  const obra=obrasBD[obraAtivaID];if(!obra){filtrosDadosBase.obra='';return;}
  const candidatos=[obra.nome,obra.cc,obra.id].filter(Boolean).map(normalizarTextoUI);
  for(const planilha of (dadosBasePlanilhas||[]).filter(p=>p.tipo==='Realizado'||!p.tipo)){
    const header=(planilha.headers||[]).find(h=>{const n=normalizarTextoUI(h);return n.includes('obra')||n.includes('departamento')||n.includes('centro de custo');});
    if(!header){filtrosDadosBase.obra='';return;}
    const valor=String(linhasDaObra(planilha,obra)[0]?.[header]||'').trim();
    if(valor){filtrosDadosBase.obra=valor;return;}
  }
  filtrosDadosBase.obra='__OBRA_SEM_CORRESPONDENCIA__';
}

function renderizarDadosBase() {
  const view = document.getElementById('view-dados-base');
  if (view?.classList.contains('hidden')) return;
  atualizarIndiceVisibilidade();
  const tabs = document.getElementById('dados-base-tabs');
  const conteudo = document.getElementById('dados-base-conteudo');
  const status = document.getElementById('dados-base-status');
  if (!tabs || !conteudo || !status) return;
  tabs.innerHTML = '';
  const planilhasRealizado = dadosBasePlanilhas.filter(p => p.tipo === 'Realizado' || !p.tipo);
  if (!planilhasRealizado.length) {
    renderizarIndicadoresRealizado(null, []);
    status.innerText = 'Nenhuma planilha importada ainda.';
    conteudo.innerHTML = '<div class="p-8 text-center text-gray-500">Nenhuma planilha importada. Use “Sincronizar Base de Dados” para começar.</div>';
    document.getElementById('dados-base-paginacao').replaceChildren();
    return;
  }
  if (!filtroObraDadosBaseManual) sincronizarFiltroDadosBaseComObra();
  if (!planilhasRealizado.some(p => p.id === dadosBaseAtivo)) dadosBaseAtivo = planilhasRealizado[0].id;
  planilhasRealizado.forEach(planilha => {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.role = 'tab';
    botao.setAttribute('aria-selected', String(planilha.id === dadosBaseAtivo));
    botao.className = planilha.id === dadosBaseAtivo ? 'px-4 py-2 rounded-lg bg-[#003399] text-white font-bold text-sm' : 'px-4 py-2 rounded-lg bg-white border text-gray-700 font-bold text-sm hover:border-[#003399]';
    botao.textContent = planilha.nome;
    botao.onclick = () => { dadosBaseAtivo = planilha.id; dadosBasePaginaAtual = 0; renderizarDadosBase(); };
    tabs.appendChild(botao);
  });
  const ativa = dadosBasePlanilhas.find(p => p.id === dadosBaseAtivo);
  const rowsOriginais = ativa && filtrosDadosBase.obra && filtrosDadosBase.obra!=='__OBRA_SEM_CORRESPONDENCIA__' ? linhasDaObra(ativa,{cc:filtrosDadosBase.obra}) : (ativa?.rows || []);
  const norm = normalizarTextoUI;
  const headersNorm = (ativa?.headers || []).map(h => [h, norm(h)]);
  const obraHeader = headersNorm.find(([, h]) => /obra|departamento|centro de custo/.test(h))?.[0];
  const categoriaHeader = headersNorm.find(([, h]) => /categoria|natureza|descricao|servico|item/.test(h))?.[0];
  const busca = norm(filtrosDadosBase.busca);
  const rowsFiltradas = rowsOriginais.filter(row => {
    const texto = !busca || ativa.headers.some(h => norm(row[h]).includes(busca));
    const obraValor = obraHeader ? String(row[obraHeader] ?? '').trim() : '';
    const obraOk = !obraHeader || (obraVisivelNosDados(obraValor) && (!filtrosDadosBase.obra || norm(obraValor) === norm(filtrosDadosBase.obra)));
    const catOk = !filtrosDadosBase.categoria || !categoriaHeader || norm(row[categoriaHeader]) === norm(filtrosDadosBase.categoria);
    const filtroBase=filtrosDashboard.base;
    const baseOk=!filtroBase || filtroBase.planilhaId!==ativa?.id || (filtroBase.values||[filtroBase.value]).some(v=>norm(row[filtroBase.header])===norm(v));
    return texto && obraOk && catOk && baseOk && linhaPassaFiltroInterativo(ativa,row,categoriaHeader);
  });
  ordenarLinhasTela(rowsFiltradas,'realizado',categoriaHeader,obterCamposRealizado(ativa?.headers||[],rowsFiltradas,ativa?.id).valor);
  renderizarControlesFiltroDadosBase(ativa, obraHeader, categoriaHeader);
  renderizarIndicadoresRealizado(ativa, rowsFiltradas);
  const totalLinhas = rowsFiltradas.length;
  const totalPaginas = Math.max(1, Math.ceil(totalLinhas / DADOS_BASE_PAGINA_TAMANHO));
  dadosBasePaginaAtual = Math.min(dadosBasePaginaAtual, totalPaginas - 1);
  const inicio = dadosBasePaginaAtual * DADOS_BASE_PAGINA_TAMANHO;
  const fim = Math.min(inicio + DADOS_BASE_PAGINA_TAMANHO, totalLinhas);
  status.innerText = `${planilhasRealizado.length} planilha(s) de Realizado${!obraHeader ? ' • Esta planilha não identifica a obra; os registros não podem ser separados com segurança' : filtrosDadosBase.obra==='__OBRA_SEM_CORRESPONDENCIA__' ? ' • Sem registros vinculados à obra selecionada' : ''} • Última importação: ${ativa?.atualizadoEm ? new Date(ativa.atualizadoEm).toLocaleString('pt-BR') : '—'} • Mostrando ${totalLinhas ? inicio + 1 : 0}–${fim} de ${totalLinhas} linha(s).`;
  if (!ativa || !ativa.headers?.length) {
    conteudo.innerHTML = '<div class="p-8 text-center text-gray-500">Esta fonte não possui linhas para exibir.</div>';
    return;
  }
  const tabela = document.createElement('div');
  tabela.className = 'overflow-auto max-h-[70vh]';
  const table = document.createElement('table');
  table.className = 'min-w-full text-xs text-left';
  const thead = document.createElement('thead');
  thead.className = 'sticky top-0 bg-[#003399] text-white uppercase';
  const trHead = document.createElement('tr');
  ativa.headers.forEach(header => { const th = document.createElement('th'); th.className = 'p-3 whitespace-nowrap'; th.textContent = tituloColunaBase(ativa,header); trHead.appendChild(th); });
  thead.appendChild(trHead);
  const tbody = document.createElement('tbody');
  tbody.className = 'divide-y divide-gray-200';
  rowsFiltradas.slice(inicio, fim).forEach(row => {
    const tr = document.createElement('tr');
    ativa.headers.forEach(header => { const td = document.createElement('td'); td.className = 'p-3 whitespace-nowrap'; td.textContent = row[header] ?? ''; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  if(!rowsFiltradas.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=ativa.headers.length;td.className='p-8 text-center text-gray-500';td.textContent=filtrosDadosBase.obra==='__OBRA_SEM_CORRESPONDENCIA__'?'Não encontrei linhas desta planilha vinculadas à obra selecionada.':'Nenhum registro corresponde aos filtros atuais.';tr.appendChild(td);tbody.appendChild(tr);}
  table.append(thead, tbody);
  tabela.appendChild(table);
  conteudo.replaceChildren(tabela);
  const controles = document.getElementById('dados-base-paginacao');
  controles.replaceChildren();
  const anterior = document.createElement('button');
  anterior.type = 'button'; anterior.textContent = '← Anterior'; anterior.disabled = dadosBasePaginaAtual === 0;
  anterior.className = 'px-3 py-2 border rounded-lg text-sm font-bold disabled:opacity-40';
  anterior.onclick = () => { dadosBasePaginaAtual--; renderizarDadosBase(); };
  const pagina = document.createElement('span');
  pagina.className = 'text-sm text-gray-600'; pagina.textContent = `Página ${dadosBasePaginaAtual + 1} de ${totalPaginas}`;
  const proxima = document.createElement('button');
  proxima.type = 'button'; proxima.textContent = 'Próxima →'; proxima.disabled = dadosBasePaginaAtual >= totalPaginas - 1;
  proxima.className = 'px-3 py-2 border rounded-lg text-sm font-bold disabled:opacity-40';
  proxima.onclick = () => { dadosBasePaginaAtual++; renderizarDadosBase(); };
  controles.append(anterior, pagina, proxima);
}

function renderizarIndicadoresRealizado(planilha, linhas=[]) {
  const host=document.getElementById('realizado-kpis');if(!host)return;
  if(graficoRealizadoCustos){graficoRealizadoCustos.destroy();graficoRealizadoCustos=null;}
  document.getElementById('realizado-chart-vazio')?.classList.add('hidden');host.replaceChildren();
  const obra=obrasBD[obraAtivaID];const moeda=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const headers=planilha?.headers||[];
  const campos=obterCamposRealizado(headers,linhas,planilha?.id);
  const valorHeader=campos.valor;
  const categoriaHeader=campos.categoria||headers.find(h=>/descricao|servico|item/.test(normalizarTextoUI(h)));
  let total=0;const grupos=new Map();
  if(planilha){linhas.forEach(row=>{const valor=valorHeader?parseMonetario(row[valorHeader]):0;const categoria=String((categoriaHeader&&row[categoriaHeader])||'Outros').trim()||'Outros';total+=valor;grupos.set(categoria,(grupos.get(categoria)||0)+valor);});}
  else if(obra){Object.entries(obra.categoriasRealizado||{}).forEach(([categoria,valor])=>{grupos.set(categoria,valor);total+=valor;});}
  const fallback=!planilha;
  const cards=[[fallback?'Realizado consolidado da obra':'Realizado nos filtros atuais',moeda(total)],['Registros exibidos',fallback?'Resumo da obra':String(linhas.length)],['Categorias encontradas',String(grupos.size)],['Média por registro',!fallback&&linhas.length?moeda(total/linhas.length):'—']];
  const detalhes=[...grupos.entries()].map(([label,realizado])=>({label,realizado,previsto:Number(obra?.categoriasPrevisto?.[label]||0)*multiplicadorCenario}));
  const itemHeader=headers.find(h=>/^(item|codigo item)$|descri[cç][aã]o|hist[oó]rico/i.test(h));
  if(itemHeader){
    const basePrevista=dadosBasePlanilhas.find(p=>p.tipo==='Previsto' && p.id===`previsto-${obraAtivaID}`);
    const previstoItemHeader=basePrevista?.headers?.find(h=>/^(item|codigo item)$|descri[cç][aã]o|hist[oó]rico/i.test(h));
    const previstoValorHeader=encontrarColuna(basePrevista?.headers || [],'valor');
    const orcamentoItens=new Map();
    if(previstoItemHeader && previstoValorHeader)(basePrevista.rows || []).forEach(row=>{const key=normalizarTexto(row[previstoItemHeader]);if(key && key!=='N/D')orcamentoItens.set(key,(orcamentoItens.get(key)||0)+parseMonetario(row[previstoValorHeader])*multiplicadorCenario);});
    const itens=new Map();linhas.forEach(row=>{const label=String(row[itemHeader]||'').trim(),key=normalizarTexto(label);if(!key || ['N/D','N/A','0'].includes(key))return;if(!itens.has(key))itens.set(key,{label:'Item: '+label,realizado:0,previsto:orcamentoItens.get(key)||0,nota:orcamentoItens.has(key)?'Previsto vinculado pelo código ou descrição do item.':'Sem previsto específico vinculado a este item; consulte também a categoria.'});itens.get(key).realizado+=valorHeader?parseMonetario(row[valorHeader]):0;});detalhes.push(...itens.values());
  }
  renderizarVelocimetros('realizado-velocimetros',{previsto:detalhes.filter(d=>!d.label.startsWith('Item: ')).reduce((s,d)=>s+d.previsto,0),realizado:total,nota:'Previsto das categorias presentes nos filtros. Filtros de registros não fracionam o orçamento da categoria.'},detalhes);
  cards.forEach(([label,value])=>{const card=document.createElement('article');card.className='bg-white p-4 rounded-xl shadow-sm border border-gray-200';const l=document.createElement('p');l.className='text-xs font-bold text-gray-500 uppercase';l.textContent=label;const v=document.createElement('p');v.className='text-lg font-black text-[#003399] mt-1';v.textContent=value;card.append(l,v);host.appendChild(card);});
  const chartData=[...grupos.entries()].sort((a,b)=>b[1]-a[1]).slice(0,parametrosSistema.maxCategoriasGrafico);const canvas=document.getElementById('realizado-chart');
  if(chartData.length&&canvas&&typeof Chart!=='undefined'){graficoRealizadoCustos=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels:chartData.map(x=>x[0]),datasets:[{label:'Realizado',data:chartData.map(x=>x[1]),backgroundColor:'#003399',borderColor:'#002266',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,onClick:cliqueCategoriaGrafico(chartData.map(x=>x[0])),interaction:{mode:'nearest',intersect:false},indexAxis:chartData.length>7?'y':'x',plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:ctx=>'Realizado: '+moeda(ctx.raw)}}},scales:{x:{beginAtZero:true},y:{beginAtZero:true}}}});}
  else {const vazio=document.getElementById('realizado-chart-vazio');if(vazio){vazio.textContent=chartData.length?'Gráfico indisponível: biblioteca de gráficos não carregada.':'Não há dados realizados desta obra para desenhar o gráfico.';vazio.classList.remove('hidden');}}
}

function renderizarControlesFiltroDadosBase(planilha, obraHeader, categoriaHeader) {
  const norm = normalizarTextoUI;
  const host = document.getElementById('dados-base-filtros');
  if (!host) return;
  host.replaceChildren();
  const input = document.createElement('input');
  input.type = 'search'; input.placeholder = 'Buscar em todas as colunas…'; input.value = filtrosDadosBase.busca;
  input.className = 'border p-2 rounded-lg text-sm min-w-56'; input.setAttribute('aria-label', 'Buscar nos dados base');
  input.oninput = () => {
    filtrosDadosBase.busca = input.value; dadosBasePaginaAtual = 0;
    const cursor = input.selectionStart;
    renderizarDadosBase();
    const replacement = host.querySelector('input[type="search"]');
    replacement?.focus();
    if (cursor !== null) replacement?.setSelectionRange(cursor, cursor);
  };
  host.appendChild(input);
  [[obraHeader, 'obra', 'Filtrar por obra/departamento'], [categoriaHeader, 'categoria', 'Filtrar por categoria']].forEach(([header, key, label]) => {
    if (!header) return;
    const select = document.createElement('select'); select.className = 'border p-2 rounded-lg text-sm'; select.setAttribute('aria-label', label);
    const first = document.createElement('option'); first.value = ''; first.textContent = label; select.appendChild(first);
    [...new Set((planilha?.rows || []).map(r => String(r[header] ?? '').trim()).filter(value => value && (key !== 'obra' || obraVisivelNosDados(value))))].sort((a,b) => a.localeCompare(b, 'pt-BR')).forEach(value => {
      const option = document.createElement('option'); option.value = value; option.textContent = value; select.appendChild(option);
    });
    if(key==='obra'&&filtrosDadosBase.obra==='__OBRA_SEM_CORRESPONDENCIA__'){const option=document.createElement('option');option.value='__OBRA_SEM_CORRESPONDENCIA__';option.textContent='Obra selecionada sem correspondência';select.appendChild(option);}
    select.value = filtrosDadosBase[key]; select.onchange = () => {
      filtrosDadosBase[key] = select.value; dadosBasePaginaAtual = 0;
      if(key==='obra')filtroObraDadosBaseManual=!!select.value;
      if (key === 'categoria') { categoriasSelecionadas=[]; filtrosDashboard.categoria = select.value; atualizarDashboard(); }
      if (key === 'obra') {
        const match = Object.entries(obrasBD || {}).find(([id, o]) => [id, o.nome, o.cc].some(v => norm(v) === norm(select.value)));
        if (match) { obraAtivaID = match[0]; filtroObraDadosBaseManual=true; const picker = document.getElementById('seletor-obra'); if (picker) picker.value = obraAtivaID; atualizarDashboard(); }
      }
      renderizarDadosBase();
    };
    host.appendChild(select);
  });
}

function renderizarFontesRealizado() {
  const container = document.getElementById('fontes-realizado-config');
  if (!container) return;
  if (!configGlobal.planilhasRealizado.length && configGlobal.urlRealizado) {
    configGlobal.planilhasRealizado.push({ id: 'realizado-principal', nome: 'Realizado', url: configGlobal.urlRealizado, colunaValor: configGlobal.colunaValorRealizado || '' });
  }
  container.replaceChildren();
  configGlobal.planilhasRealizado.forEach((fonte, indice) => {
    const linha = document.createElement('div');
    linha.className = 'grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr_1fr_auto] gap-2 items-center bg-white p-2 border rounded-lg';
    const nome = document.createElement('input');
    nome.type = 'text'; nome.value = fonte.nome || ''; nome.placeholder = 'Nome para a aba Dados Base';
    nome.className = 'border p-2 rounded-lg'; nome.setAttribute('aria-label', `Nome da planilha ${indice + 1}`);
    nome.oninput = () => { fonte.nome = nome.value; };
    const url = document.createElement('input');
    url.type = 'url'; url.value = fonte.url || ''; url.placeholder = 'Link de compartilhamento do Google Sheets';
    url.className = 'border p-2 rounded-lg'; url.setAttribute('aria-label', `Link da planilha ${indice + 1}`);
    url.oninput = () => { fonte.url = url.value; if (url.value.trim()) fonte.arquivoLocal = false; };
    const arquivo = document.createElement('input');
    arquivo.type = 'file'; arquivo.accept = '.csv,.tsv,.txt,.xls,.xlsx,.xlsm,.ods';
    arquivo.className = 'border p-2 rounded-lg text-xs w-full'; arquivo.setAttribute('aria-label', `Importar arquivo da planilha ${indice + 1}`);
    arquivo.onchange = () => importarArquivoRealizado(arquivo.files?.[0], fonte);
    const colunaValor = document.createElement('input');
    colunaValor.type = 'text'; colunaValor.value = fonte.colunaValor || ''; colunaValor.placeholder = 'Coluna de valor (opcional)';
    colunaValor.className = 'border p-2 rounded-lg text-xs'; colunaValor.setAttribute('aria-label', `Coluna monetária da planilha ${indice + 1}`);
    colunaValor.title = 'Deixe vazio para detecção automática. Se a planilha tiver cabeçalho genérico, informe aqui o nome exato da coluna que contém o valor realizado.';
    colunaValor.oninput = () => { fonte.colunaValor = colunaValor.value.trim(); };
    const remover = document.createElement('button');
    remover.type = 'button'; remover.textContent = 'Remover'; remover.className = 'text-red-600 font-bold px-2 py-1';
    remover.onclick = () => { configGlobal.planilhasRealizado.splice(indice, 1); renderizarFontesRealizado(); };
    linha.append(nome, url, arquivo, colunaValor, remover); container.appendChild(linha);
  });
  if (!configGlobal.planilhasRealizado.length) {
    const vazio = document.createElement('p'); vazio.className = 'text-gray-500'; vazio.textContent = 'Nenhuma planilha cadastrada.'; container.appendChild(vazio);
  }
}

function adicionarFonteRealizado() {
  configGlobal.planilhasRealizado.push({ id: `realizado-${Date.now()}`, nome: `Realizado ${configGlobal.planilhasRealizado.length + 1}`, url: '' });
  renderizarFontesRealizado();
}

// ==========================================
// MOTOR DE SINCRONIZAÇÃO MATEMÁTICA
// ==========================================
async function sincronizarTodasPlanilhas() {
  if (!obterPermissoesUsuario().sincronizar) return alert('Seu perfil não tem permissão para sincronizar planilhas.');
  const fontesRealizado = (configGlobal.planilhasRealizado || []).filter(f => (f.url && f.url.trim()) || f.arquivoLocal);
  if (!fontesRealizado.length && configGlobal.urlRealizado) {
    fontesRealizado.push({ id: "realizado-principal", nome: "Realizado", url: configGlobal.urlRealizado });
  }
  if (!fontesRealizado.length) return alert("Configurações: adicione ao menos uma planilha de Realizado.");
  const btn = document.getElementById('btn-sync');
  if (btn) btn.innerText = "⏳ A Extrair Dados...";

  try {
    const novasBases = [];
    const linhasRealizado = [];
    const fontesEmCache=[];
    for (const fonte of fontesRealizado) {
      let extraido, baseCache=null, reutilizouCache=false;
      const basesCache=(dadosBasePlanilhas||[]).filter(base=>base.tipo==='Realizado'&&Array.isArray(base.rows)&&base.rows.length);
      baseCache=basesCache.find(base=>base.id===fonte.id)||(fontesRealizado.length===1&&basesCache.length===1?basesCache[0]:null);
      if (fonte.arquivoLocal) {
        const salvo = (dadosBasePlanilhas || []).find(base => base.id === fonte.id && base.origem === 'arquivo-local');
        if (!salvo) throw new Error(`O arquivo local de "${fonte.nome}" não está carregado. Selecione-o novamente nas Configurações.`);
        extraido = { headers: salvo.headers, rows: salvo.rows };
      } else {
        try { extraido = await buscarCSV(fonte.url); }
        catch (erroFonte) {
          if (!baseCache) throw erroFonte;
          extraido = { headers: baseCache.headers, rows: baseCache.rows }; reutilizouCache=true;
          fontesEmCache.push(`${baseCache.nome || fonte.nome} (${baseCache.atualizadoEm ? new Date(baseCache.atualizadoEm).toLocaleString('pt-BR') : 'data da importação indisponível'})`);
        }
      }
      if (!extraido.rows.length) throw new Error(`A planilha "${fonte.nome}" não contém linhas de dados.`);
      let colunas = extraido.headers;
      let campos=obterCamposRealizado(colunas,extraido.rows,reutilizouCache?baseCache?.id:fonte.id);
      const colunaObra = campos.obra;
      const deteccaoValor = campos.inferencia;
      const colunaValor = campos.valor;
      const base = reutilizouCache ? baseCache : { id: fonte.id || `realizado-${Date.now()}`, nome: fonte.nome || "Realizado", tipo: "Realizado", origem: fonte.arquivoLocal ? "arquivo-local" : "url", url: fonte.url || "", headers: extraido.headers, rows: extraido.rows, titulosColunas:extraido.titulosColunas,linhaCabecalho:extraido.linhaCabecalho, atualizadoEm: new Date().toISOString() };
      novasBases.push(base);
      if (colunaObra && colunaValor) linhasRealizado.push({ fonte: base, rows: extraido.rows, colunaObra, colunaValor, colunaCategoria: encontrarColuna(colunas, "categoria") });
    }

    if (linhasRealizado.length) Object.keys(obrasBD).forEach(k => {
      obrasBD[k].realizadoTotal = 0; obrasBD[k].categoriasRealizado = {};
    });
    const temFontePrevisto = Object.values(obrasBD).some(obra => obra.urlPrevistoCSV?.trim() || obra.previstoArquivoLocal);
    if (temFontePrevisto) Object.keys(obrasBD).forEach(k => {
      obrasBD[k].previstoTotal = 0; obrasBD[k].categoriasPrevisto = {};
    });

    const chaveObraPorDepartamento = new Map();
    Object.entries(obrasBD).forEach(([key, obra]) => {
      if (obra.cc) {
        chaveObraPorDepartamento.set(normalizarTexto(obra.cc), key);
        chaveObraPorDepartamento.set(chaveComparacaoObra(obra.cc), key);
      }
      if (obra.nome) {
        chaveObraPorDepartamento.set(normalizarTexto(obra.nome), key);
        chaveObraPorDepartamento.set(chaveComparacaoObra(obra.nome), key);
      }
    });
    let linhasRealizadoAssociadas = 0;
    const obrasCriadasNaImportacao = new Set();
    linhasRealizado.forEach(({ fonte, rows, colunaObra, colunaValor, colunaCategoria }) => rows.forEach(linha => {
      const chaves = Object.keys(linha);
      const chvDepto = colunaObra || encontrarColuna(chaves, "obra");
      const deptoOriginal = chvDepto ? (linha[chvDepto] || "").trim() : "";

      if (!deptoOriginal || deptoOriginal === "N/D" || deptoOriginal === "0.0") return;
      const deptoID = normalizarTexto(deptoOriginal);

      let chaveObra = chaveObraPorDepartamento.get(deptoID) || chaveObraPorDepartamento.get(chaveComparacaoObra(deptoOriginal));
      if (!chaveObra) {
        chaveObra = deptoID;
        obrasBD[chaveObra] = { id: deptoID, nome: deptoOriginal, cc: deptoOriginal, responsavel: "Não Atribuído", status: "Ativa", urlPrevistoCSV: "", previstoTotal: 0, realizadoTotal: 0, categoriasPrevisto: {}, categoriasRealizado: {} };
        chaveObraPorDepartamento.set(deptoID, chaveObra);
        chaveObraPorDepartamento.set(chaveComparacaoObra(deptoOriginal), chaveObra);
        obrasCriadasNaImportacao.add(chaveObra);
      }

      const chvVal = colunaValor || encontrarColuna(chaves, "valor");
      if (!chvVal) throw new Error(`Não encontrei uma coluna de valor na planilha "${fonte.nome}".`);
      const valor = parseMonetario(linha[chvVal]);

      const chvCat = colunaCategoria || encontrarColuna(chaves, "categoria");
      const categoria = chvCat ? (linha[chvCat] || "Outros").trim() : "Outros";

      obrasBD[chaveObra].realizadoTotal += valor;
      obrasBD[chaveObra].categoriasRealizado[categoria] = (obrasBD[chaveObra].categoriasRealizado[categoria] || 0) + valor;
      linhasRealizadoAssociadas++;
    }));

    const promessasPrevisto = Object.keys(obrasBD).map(async (key) => {
      const obra = obrasBD[key];
      const basePrevistoLocal = (dadosBasePlanilhas || []).find(base => base.id === `previsto-${key}` && base.origem === 'arquivo-local');
      if (obra.previstoArquivoLocal && basePrevistoLocal) {
        try {
          novasBases.push(basePrevistoLocal);
          basePrevistoLocal.rows.forEach(linha => {
            const chvCat = encontrarColuna(Object.keys(linha), "categoria");
            const catBP = chvCat ? (linha[chvCat] || "Outros").trim() : "Outros";
            const chvCst = encontrarColuna(Object.keys(linha), "valor");
            if (!chvCst) throw new Error("Não encontrei a coluna de custo/valor.");
            obra.categoriasPrevisto[catBP] = (obra.categoriasPrevisto[catBP] || 0) + parseMonetario(linha[chvCst]);
          });
          obra.previstoTotal = Object.values(obra.categoriasPrevisto).reduce((a, b) => a + b, 0);
        } catch(err) { throw new Error(`Falha no arquivo Previsto de ${obra.nome}: ${err.message || err}`); }
      }
      if (obra.urlPrevistoCSV && obra.urlPrevistoCSV.trim() !== "") {
        try {
          const basePrevisto = await buscarCSV(obra.urlPrevistoCSV);
          const idBase = `previsto-${key}`;
          novasBases.push({ id: idBase, nome: obra.nome || `Previsto - ${key}`, tipo: "Previsto", url: obra.urlPrevistoCSV, headers: basePrevisto.headers, rows: basePrevisto.rows,titulosColunas:basePrevisto.titulosColunas,linhaCabecalho:basePrevisto.linhaCabecalho, atualizadoEm: new Date().toISOString() });
          basePrevisto.rows.forEach(linha => {
            const chvCat = encontrarColuna(Object.keys(linha), "categoria");
            const catBP = chvCat ? (linha[chvCat] || "Outros").trim() : "Outros";

            const chvCst = encontrarColuna(Object.keys(linha), "valor");
            if (!chvCst) throw new Error("Não encontrei a coluna de custo/valor.");
            let custo = parseMonetario(linha[chvCst]);

            obra.categoriasPrevisto[catBP] = (obra.categoriasPrevisto[catBP] || 0) + custo;
          });
          obra.previstoTotal = Object.values(obra.categoriasPrevisto).reduce((a, b) => a + b, 0);
        } catch(err) { throw new Error(`Falha na planilha Previsto de ${obra.nome}: ${err.message || err}`); }
      }
    });

    await Promise.all(promessasPrevisto);

    await salvarDadosBaseArmazenados(novasBases);
    localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
    dadosBasePlanilhas = novasBases;
    filtroObraDadosBaseManual=false; sincronizarFiltroDadosBaseComObra();
    atualizarSeletoresNovoGrafico();
    renderizarListaGraficosConfig();
    dadosBasePaginaAtual = 0;
    let errosSupabase = [];
    if (supabaseClient) {
      for (const key in obrasBD) {
        const o = obrasBD[key];
        const dadosJson = { previstoTotal: o.previstoTotal, realizadoTotal: o.realizadoTotal, categoriasPrevisto: o.categoriasPrevisto, categoriasRealizado: o.categoriasRealizado, oculta: !!o.oculta, custosFixos:o.custosFixos || [] };
        try {
          const { data: atualObra, error: erroAtualObra } = await supabaseClient.from('obras').select('dados_json').eq('id', o.id).maybeSingle();
          if (erroAtualObra) throw erroAtualObra;
          Object.assign(dadosJson, { custosFixos: atualObra?.dados_json?.custosFixos || o.custosFixos || [], solicitacoesCustosFixos: atualObra?.dados_json?.solicitacoesCustosFixos || o.solicitacoesCustosFixos || [] });
          const { error } = await supabaseClient.from('obras').upsert({ id: o.id, nome: o.nome, cc: o.cc, responsavel: o.responsavel, status: o.status, url_previsto: o.urlPrevistoCSV, dados_json: dadosJson });
          if (error) errosSupabase.push(`${o.nome}: ${error.message}`);
        } catch (error) { errosSupabase.push(`${o.nome}: ${error.message || error}`); }
      }
    }

    popularSeletorObras();
    atualizarDashboard();
    renderizarDadosBase();
    const totalRealizadoImportado = Object.values(obrasBD).reduce((soma, obra) => soma + Number(obra.realizadoTotal || 0), 0);
    const fontesSemCampos = novasBases.filter(base => base.tipo === 'Realizado' && !linhasRealizado.some(item => item.fonte.id === base.id));
    const detalheCampos = fontesSemCampos.length ? ` Atenção: ${fontesSemCampos.map(base => {
      const campos = obterCamposRealizado(base.headers || [], base.rows || [], base.id);
      const ausentes = [!campos.obra && 'obra/departamento', !campos.valor && 'valor pago/realizado'].filter(Boolean);
      return `${base.nome}: ${base.rows.length.toLocaleString('pt-BR')} linhas lidas e guardadas em Dados Base, mas faltam ${ausentes.join(' e ')}. Os resumos financeiros existentes foram preservados.`;
    }).join(' ')}.` : '';
    const detalheAssociacao = `${linhasRealizado.reduce((total, item) => total + item.rows.length, 0).toLocaleString('pt-BR')} linha(s) lidas de fontes com campos financeiros; ${linhasRealizadoAssociadas} associada(s) às obras; ${obrasCriadasNaImportacao.size} obra(s) nova(s) criada(s) por não encontrar correspondência pelo nome/CC.`;
    const avisoCache=fontesEmCache.length?`\nA fonte remota não atualizou; foram mantidos os dados Realizado já salvos: ${fontesEmCache.join('; ')}.`:'';
    if (errosSupabase.length) alert(`Dados importados e análises atualizadas neste navegador. ${detalheAssociacao} Total realizado: ${totalRealizadoImportado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.${detalheCampos} O Supabase recusou parte das gravações:\n${errosSupabase.slice(0, 5).join('\n')}${avisoCache}`);
    else if (supabaseClient) alert(`Importação concluída: ${dadosBasePlanilhas.length} planilha(s). ${detalheAssociacao} Total realizado: ${totalRealizadoImportado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Resumos sincronizados com o Supabase.${detalheCampos}${avisoCache}`);
    else alert(`Importação concluída: ${dadosBasePlanilhas.length} planilha(s). ${detalheAssociacao} Total realizado: ${totalRealizadoImportado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Dados salvos neste navegador; Supabase indisponível.${detalheCampos}${avisoCache}`);
  } catch (error) {
    alert("Falha na sincronização dos dados.\nMotivo: " + (error.message || error));
  } finally {
    if (btn) btn.innerHTML = "🔄 Sincronizar Base de Dados";
  }
}

// ==========================================
// DASHBOARD E FARÓIS
// ==========================================
function popularSeletorObras() {
  const seletor = document.getElementById('seletor-obra');
  seletor.innerHTML = '';
  const podeVerArquivadas = usuarioAutenticado?.perfil === 'Mestre';
  const chaves = Object.keys(obrasBD).filter(k => !obrasBD[k].oculta && (podeVerArquivadas || obrasBD[k].status !== "Arquivada"));
  if (chaves.length === 0) { obraAtivaID = null; seletor.innerHTML = '<option value="">Nenhuma obra ativa disponível</option>'; return; }
  chaves.forEach(k => { const opt=document.createElement('option'); opt.value=k; opt.textContent=obrasBD[k].nome+(obrasBD[k].status==='Arquivada'?' (Arquivada)':''); seletor.appendChild(opt); });
  if (!obraAtivaID || !obrasBD[obraAtivaID] || obrasBD[obraAtivaID].oculta || (!podeVerArquivadas && obrasBD[obraAtivaID].status === "Arquivada")) obraAtivaID = chaves[0];
  seletor.value = obraAtivaID;
}
function alterarObraAtiva(id) {
  if (!obrasBD[id] || obrasBD[id].oculta || (obrasBD[id].status === 'Arquivada' && usuarioAutenticado?.perfil !== 'Mestre')) return popularSeletorObras();
  obraAtivaID = id;
  filtrosDashboard = {categoria:"",farol:"",base:null};categoriasSelecionadas=[];
  filtroObraDadosBaseManual=false; sincronizarFiltroDadosBaseComObra();
  atualizarDashboard();
  if(!document.getElementById('view-dados-base')?.classList.contains('hidden'))renderizarDadosBase();
  if(!document.getElementById('view-previsto')?.classList.contains('hidden'))renderizarPrevisto();
  if(!document.getElementById('view-pesquisa')?.classList.contains('hidden'))pesquisarCustos(filtrosPesquisaCustos);
}
function aplicarCenario(fator) { multiplicadorCenario = parseFloat(fator); atualizarDashboard(); }

function selecionarCategoriaGrafico(valor) { alternarCategoriaAcumulada(String(valor||'')); }
function linhaPassaFiltroInterativo(planilha,row,categoriaHeader){
 const norm=normalizarTextoUI;
 if(categoriaHeader && !categoriaEstaSelecionada(row[categoriaHeader]))return false;
 if(!passaPeriodoPagamento(planilha,row))return false;
 const filtro=filtrosDashboard.base;
 if(filtro){const origem=dadosBasePlanilhas.find(p=>p.id===filtro.planilhaId);const header=filtro.planilhaId===planilha?.id?filtro.header:planilha?.headers?.find(h=>norm(tituloColunaBase(planilha,h))===norm(tituloColunaBase(origem,filtro.header)));if(header && !(filtro.values||[filtro.value]).some(v=>norm(row[header])===norm(v)))return false;}
 if(filtrosDashboard.farol && categoriaHeader){const obra=obrasBD[obraAtivaID],cat=String(row[categoriaHeader]||'Outros').trim();if(classificarFarol((obra?.categoriasPrevisto?.[cat]||0)*multiplicadorCenario,obra?.categoriasRealizado?.[cat]||0)!==filtrosDashboard.farol)return false;}
 return true;
}
function cliqueCategoriaGrafico(labels){return(event,elements,chart)=>{const pontos=elements?.length?elements:chart?.getElementsAtEventForMode(event,'nearest',{intersect:false},true);if(pontos?.length && labels[pontos[0].index]!==undefined)selecionarCategoriaGrafico(labels[pontos[0].index]);};}
function renderizarSelecaoInterativa(){
 ['view-dashboard','view-pesquisa','view-dados-base','view-previsto'].forEach(id=>{
 const view=document.getElementById(id);if(!view)return;let host=document.getElementById(id+'-selecao');
 if(!host){host=document.createElement('div');host.id=id+'-selecao';host.className='mb-4 p-3 bg-blue-50 border rounded-lg text-sm flex flex-wrap items-center gap-3';view.prepend(host);}
 host.replaceChildren();const texto=document.createElement('span');texto.textContent=categoriasSelecionadas.length?'Categorias selecionadas: '+categoriasSelecionadas.join(' + '):filtrosDashboard.categoria?'Categoria selecionada: '+filtrosDashboard.categoria:filtrosDashboard.base?'Seleção: '+filtrosDashboard.base.value:filtrosDashboard.farol?'Filtro de farol ativo':'Clique no demonstrativo ou no gráfico para filtrar. Clique novamente para desfazer.';
 const btn=document.createElement('button');btn.type='button';btn.className='font-bold text-blue-800 underline';btn.textContent='Limpar seleção';btn.onclick=limparFiltrosDashboard;host.append(texto,btn);
 });
}

function filtrarCategoriaDashboard(valor) { categoriasSelecionadas=[]; filtrosDashboard.categoria = valor || ''; atualizarDashboard(); }
function alternarFiltroFarol(valor) { filtrosDashboard.farol = filtrosDashboard.farol === valor ? '' : valor; atualizarDashboard(); }
function limparFiltroBaseDashboard() { filtrosDashboard.base = null; atualizarDashboard(); if (!document.getElementById('view-dados-base')?.classList.contains('hidden')) renderizarDadosBase(); }
function limparFiltrosDashboard() { categoriasSelecionadas=[];periodoPagamento={inicio:'',fim:''}; filtrosDashboard = { categoria: '', farol: '', base: null }; atualizarDashboard(); if (!document.getElementById('view-dados-base')?.classList.contains('hidden')) renderizarDadosBase(); }

function aplicarFiltroCampoBaseDashboard(campo, valor) {
  const texto = String(valor || '').trim();
  const plano = dadosBasePlanilhas.find(item => item.tipo === 'Realizado' && (item.headers || []).includes(campo));
  filtrosDashboard.base = texto && plano ? { planilhaId: plano.id, planilhaNome: plano.nome || 'Realizado', header: campo, value: texto } : null;
  atualizarDashboard();
  if (!document.getElementById('view-dados-base')?.classList.contains('hidden')) renderizarDadosBase();
}

function renderizarFiltrosBaseDashboard() {
  const host = document.getElementById('dashboard-filtros-base');
  const seletor = document.getElementById('dashboard-base-campo');
  const valorInput = document.getElementById('dashboard-base-valor');
  const lista = document.getElementById('dashboard-base-valores');
  const aviso = document.getElementById('dashboard-base-filtro-aviso');
  if (!host || !seletor || !valorInput || !lista) return;
  const fontes = (dadosBasePlanilhas || []).filter(item => item.tipo === 'Realizado' && item.headers?.length && item.rows?.length);
  if (!fontes.length) { host.classList.add('hidden'); return; }
  const filtro = filtrosDashboard.base;
  let fonte = fontes.find(item => item.id === filtro?.planilhaId) || fontes[0];
  host.classList.remove('hidden');
  const opcoes = fontes.flatMap(item => (item.headers || []).map(header => ({ value: `${item.id}\u001f${header}`, label: `${item.nome || 'Realizado'} • ${tituloColunaBase(item,header)}`, item, header })));
  seletor.replaceChildren(...opcoes.map(op => new Option(op.label, op.value)));
  const campoSalvo = filtro ? `${filtro.planilhaId}\u001f${filtro.header}` : campoBaseFiltroSelecionado;
  const selecionada = opcoes.find(op => `${op.item.id}\u001f${op.header}` === campoSalvo) || opcoes[0];
  seletor.value = selecionada?.value || '';
  fonte = selecionada?.item || fonte;
  const campo = selecionada?.header || '';
  const distintos = [...new Set((fonte.rows || []).map(row => String(row[campo] ?? '').trim()).filter(Boolean))];
  lista.replaceChildren(...distintos.slice(0, 300).map(item => { const option = document.createElement('option'); option.value = item; return option; }));
  valorInput.value = filtro?.planilhaId === fonte.id && filtro?.header === campo ? filtro.value : '';
  valorInput.onchange = () => aplicarFiltroCampoBaseDashboard(campo, valorInput.value);
  valorInput.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); aplicarFiltroCampoBaseDashboard(campo, valorInput.value); } };
  seletor.onchange = () => {
    const [idFonte, ...partesCampo] = seletor.value.split('\u001f');
    const headerSelecionado = partesCampo.join('\u001f');
    const origem = fontes.find(item => item.id === idFonte);
    if (!origem || !headerSelecionado) return;
    campoBaseFiltroSelecionado = seletor.value;
    filtrosDashboard.base = null;
    renderizarFiltrosBaseDashboard();
    document.getElementById('dashboard-base-campo').value = campoBaseFiltroSelecionado;
    const input = document.getElementById('dashboard-base-valor');
    const field = headerSelecionado;
    input.onchange = () => aplicarFiltroCampoBaseDashboard(field, input.value);
    input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); aplicarFiltroCampoBaseDashboard(field, input.value); } };
  };
  const mapeamento = obterCamposRealizado(fonte.headers || [], fonte.rows || [], fonte.id);
  if (!mapeamento.obra || !mapeamento.valor) aviso.textContent = `A fonte “${fonte.nome || 'Realizado'}” tem ${fonte.rows.length.toLocaleString('pt-BR')} registros, mas precisa de uma coluna de obra/departamento e uma coluna monetária para afetar os KPIs. Os campos ainda podem ser usados nos filtros e gráficos da base.`;
  else aviso.textContent = `${fonte.rows.length.toLocaleString('pt-BR')} registros disponíveis. O filtro selecionado afeta os KPIs, o demonstrativo e os gráficos.`;
}

function obterRealizadoFiltradoDashboard(obra) {
 if(!filtrosDashboard.base && !periodoPagamento.inicio && !periodoPagamento.fim)return null;
 const fontes=dadosBasePlanilhas.filter(p=>p.tipo==='Realizado');if(!fontes.length)return (periodoPagamento.inicio||periodoPagamento.fim)?{}:null;
 const grupos={};for(const fonte of fontes){const campos=obterCamposRealizado(fonte.headers,fonte.rows,fonte.id);if(!campos.obra||!campos.valor)continue;for(const row of linhasDaObra(fonte,obra)){if(!linhaPassaFiltroInterativo(fonte,row,campos.categoria))continue;const cat=String(row[campos.categoria]||'Outros').trim();grupos[cat]=(grupos[cat]||0)+parseMonetario(row[campos.valor]);}}return grupos;
}

function classificarFarol(prev, real) {
  const uso = prev > 0 ? (real / prev) * 100 : (real > 0 ? 999 : 0);
  return uso > parametrosSistema.farolVermelho || (prev === 0 && real > 0) ? 'red' : uso >= parametrosSistema.farolAmarelo ? 'amber' : 'green';
}

function renderizarInsightsDashboard(linhas, totalPrevisto, totalRealizado, saldo, idc) {
  const root=document.getElementById('dashboard-insights-content'); if(!root) return; root.replaceChildren();
  const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const uso=l=>l.previsto>0?l.realizado/l.previsto*100:(l.realizado>0?Infinity:0);
  const pct=v=>Number.isFinite(v)?v.toFixed(1)+'%':'N/P';
  const criarCard=(titulo)=>{const card=document.createElement('article');card.className='mini-report-card bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2';const h=document.createElement('h3');h.className='font-bold text-[#003399] text-sm';h.textContent=titulo;card.appendChild(h);root.appendChild(card);return card;};
  const lista=(card,items,renderItem)=>{if(!items.length){const p=document.createElement('p');p.className='text-xs text-gray-500';p.textContent='Nenhum item para os filtros atuais.';card.appendChild(p);return;}const ul=document.createElement('ul');ul.className='space-y-1 text-xs text-gray-700 list-disc pl-4';items.forEach(item=>{const li=document.createElement('li');li.textContent=renderItem(item);ul.appendChild(li);});card.appendChild(ul);};
  const resumo=criarCard('1. Resumo executivo');
  const use=totalPrevisto>0?totalRealizado/totalPrevisto*100:null;
  const texto=totalPrevisto>0?'Foram realizados '+moeda(totalRealizado)+' de '+moeda(totalPrevisto)+' ('+pct(use)+'). Saldo: '+moeda(saldo)+'; IDC: '+(totalRealizado>0?idc:'—')+'.':'O previsto total é '+moeda(totalPrevisto)+' e o realizado é '+moeda(totalRealizado)+'. Sem orçamento previsto, não é possível calcular o percentual de uso.';
  const pResumo=document.createElement('p');pResumo.className='text-xs text-gray-700 leading-relaxed';pResumo.textContent=texto;resumo.appendChild(pResumo);

  const alertas=linhas.filter(l=>l.farol==='red'||l.farol==='amber').sort((a,b)=>uso(b)-uso(a));
  const pontos=criarCard('2. Pontos de atenção');
  lista(pontos,alertas.slice(0,5),l=>{const status=l.farol==='amber'?'Atenção':(l.previsto===0&&l.realizado>0?'N/P — Não previsto':'Estourado');const excesso=l.previsto>0?' · excedente '+moeda(Math.max(0,l.realizado-l.previsto)):'';return l.cat+': '+status+' · uso '+pct(uso(l))+' · realizado '+moeda(l.realizado)+excesso;});

  const custos=linhas.filter(l=>l.realizado>0).sort((a,b)=>b.realizado-a.realizado);
  const maiores=criarCard('3. Maiores custos realizados');
  lista(maiores,custos.slice(0,5),l=>l.cat+': '+moeda(l.realizado)+' ('+(totalRealizado>0?pct(l.realizado/totalRealizado*100):'—')+' do realizado total)');

  const pressionadas=linhas.filter(l=>l.previsto>0).sort((a,b)=>uso(b)-uso(a));
  const pressao=criarCard('4. Categorias mais pressionadas');
  const alta=pressionadas.filter(l=>uso(l)>=parametrosSistema.farolAmarelo).slice(0,5);
  if(alta.length) lista(pressao,alta,l=>l.cat+': '+pct(uso(l))+' do previsto usado · saldo '+moeda(l.previsto-l.realizado));
  else {const pmsg=document.createElement('p');pmsg.className='text-xs text-emerald-800';pmsg.textContent=pressionadas.length?'Nenhuma categoria atingiu '+parametrosSistema.farolAmarelo+'% do previsto. Mais próxima do limite: '+pressionadas[0].cat+' ('+pct(uso(pressionadas[0]))+').':'Não há valores previstos para calcular o comprometimento.';pressao.appendChild(pmsg);}

  const cobertura=criarCard('5. Cobertura e qualidade da base');
  const semPrevisto=linhas.filter(l=>l.previsto===0&&l.realizado>0), semRealizado=linhas.filter(l=>l.previsto>0&&l.realizado===0);
  const fontes=(dadosBasePlanilhas||[]).map(x=>x.nome).filter(Boolean);
  const coberturaTxt=semPrevisto.length+' categoria(s) com realizado sem previsto (N/P); '+semRealizado.length+' categoria(s) prevista(s) sem realizado importado nos filtros atuais. '+fontes.length+' planilha(s) em Dados Base.';
  const pCob=document.createElement('p');pCob.className='text-xs text-gray-700 leading-relaxed';pCob.textContent=coberturaTxt;cobertura.appendChild(pCob);

  const observacoes=[];
  if(alertas.length)observacoes.push(alertas.length+' categoria(s) precisam de conferência por atenção ou estouro.');
  else observacoes.push('Nenhuma categoria atingiu '+parametrosSistema.farolAmarelo+'% do previsto nos filtros atuais.');
  if(custos.length&&totalRealizado>0){const top3=custos.slice(0,3).reduce((acc,l)=>acc+l.realizado,0);observacoes.push('As três maiores categorias concentram '+pct(top3/totalRealizado*100)+' do realizado.');}
  if(semPrevisto.length)observacoes.push('Confira as categorias N/P e complete o orçamento previsto, se aplicável.');
  const leitura=document.createElement('div'); leitura.className='mt-2 border-t border-slate-200 pt-2';
  const leituraTitulo=document.createElement('h4'); leituraTitulo.className='font-semibold text-[#003399] text-xs'; leituraTitulo.textContent='Leitura gerencial'; leitura.appendChild(leituraTitulo);
  lista(leitura,observacoes,x=>x); resumo.appendChild(leitura);
}

function recalcularRealizadoDaBaseLocal() {
  const bases = (dadosBasePlanilhas || []).filter(base => base.tipo === 'Realizado' && Array.isArray(base.rows));
  const assinatura = bases.map(base => {
    const fonte = (configGlobal.planilhasRealizado || []).find(item => item.id === base.id);
    return `${base.id}:${base.rows.length}:${base.atualizadoEm || ''}:${fonte?.colunaValor || ''}`;
  }).join('|');
  if (!bases.length || assinatura === assinaturaBaseAnaliseRealizado) return;

  const mapaObras = new Map();
  Object.entries(obrasBD || {}).forEach(([id, obra]) => {
    [id, obra.cc, obra.nome].filter(Boolean).forEach(valor => {
      mapaObras.set(normalizarTexto(valor), id);
      mapaObras.set(chaveComparacaoObra(valor), id);
    });
  });

  const acumulados = new Map();
  let fontesLidas = 0;
  let linhasSomadas = 0;
  const problemas = [];
  bases.forEach(base => {
    const headers = base.headers || Object.keys(base.rows[0] || {});
    const campos=obterCamposRealizado(headers,base.rows,base.id);
    const colunaObra = campos.obra;
    const colunaValor = campos.valor;
    const colunaCategoria = campos.categoria;
    if (!colunaObra || !colunaValor) {
      const faltantes = [!colunaObra && 'coluna de obra/departamento', !colunaValor && 'coluna de valor pago/realizado'].filter(Boolean);
      problemas.push(`${base.nome || 'Realizado'}: ${base.rows.length.toLocaleString('pt-BR')} registros guardados em Dados Base; falta identificar ${faltantes.join(' e ')}`);
      return;
    }
    fontesLidas++;
    base.rows.forEach(linha => {
      const obraTexto = String(linha[colunaObra] ?? '').trim();
      if (!obraTexto || ['N/D', '0.0'].includes(obraTexto.toUpperCase())) return;
      const chave = mapaObras.get(normalizarTexto(obraTexto)) || mapaObras.get(chaveComparacaoObra(obraTexto));
      if (!chave) return;
      const valor = parseMonetario(linha[colunaValor]);
      const categoria = String((colunaCategoria && linha[colunaCategoria]) || 'Outros').trim() || 'Outros';
      if (!acumulados.has(chave)) acumulados.set(chave, { total: 0, categorias: {} });
      const soma = acumulados.get(chave);
      soma.total += valor;
      soma.categorias[categoria] = (soma.categorias[categoria] || 0) + valor;
      linhasSomadas++;
    });
  });

  if (fontesLidas) {
    Object.values(obrasBD).forEach(obra => { obra.realizadoTotal = 0; obra.categoriasRealizado = {}; });
    acumulados.forEach((soma, chave) => {
      obrasBD[chave].realizadoTotal = soma.total;
      obrasBD[chave].categoriasRealizado = soma.categorias;
    });
    try { localStorage.setItem('obras_bp', JSON.stringify(obrasBD)); } catch (erro) { console.warn('Não foi possível guardar o resumo calculado da base local.', erro); }
    diagnosticoBaseAnaliseRealizado = `${fontesLidas} fonte(s) de Realizado lida(s) diretamente de Dados Base; ${linhasSomadas} linha(s) associadas às obras.`;
  } else {
    diagnosticoBaseAnaliseRealizado = problemas.length ? `Não foi possível montar o Realizado para Análises: ${problemas.join('; ')}.` : '';
  }
  assinaturaBaseAnaliseRealizado = assinatura;
}

function atualizarDashboard() {
  recalcularRealizadoDaBaseLocal();
  if (obraAtivaID && obrasBD[obraAtivaID]?.oculta) popularSeletorObras();
  if (obraAtivaID && obrasBD[obraAtivaID]?.status === 'Arquivada' && usuarioAutenticado?.perfil !== 'Mestre') popularSeletorObras();
  if (!obraAtivaID || !obrasBD[obraAtivaID]) {
    document.getElementById('analise-velocimetros')?.replaceChildren();
    ['obra-titulo','obra-cc','obra-resp'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='—'; });
    ['kpi-previsto','kpi-realizado','kpi-desvio'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='R$ 0,00'; });
    linhasDashboardVisiveis=[];
    renderizarInsightsDashboard([],0,0,0,'—');
    const tbody=document.getElementById('tabela-dre-body'); if(tbody) tbody.replaceChildren();
    Object.values(graficosInstancias).forEach(chart=>chart?.destroy()); graficosInstancias={};
    const charts=document.getElementById('grid-graficos-dinamicos'); if(charts) charts.replaceChildren();
    return;
  }
  const obra = obrasBD[obraAtivaID];

  document.getElementById('obra-titulo').innerText = obra.nome;
  document.getElementById('obra-cc').innerText = obra.cc;
  document.getElementById('obra-resp').innerText = obra.responsavel || "N/A";
  
  const badge = document.getElementById('obra-badge-status');
  badge.innerText = obra.status;
  badge.className = obra.status === "Ativa" ? "bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full" : "bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full";

  const realizadoBaseFiltrado = obterRealizadoFiltradoDashboard(obra);
  const realizadoPorCategoria = realizadoBaseFiltrado || obra.categoriasRealizado || {};
  const cats = Array.from(new Set([...Object.keys(obra.categoriasPrevisto || {}), ...Object.keys(realizadoPorCategoria),...Object.keys(obra.categoriasRealizado || {})]));
  const linhas = cats.map(cat => {
    const previsto = ((obra.categoriasPrevisto && obra.categoriasPrevisto[cat]) || 0) * multiplicadorCenario;
    const realizado = realizadoPorCategoria[cat] || 0;
    return { cat, previsto, realizado, farol: classificarFarol(previsto, realizado) };
  });
  const linhasVisiveis = linhas.filter(l => categoriaEstaSelecionada(l.cat) && (!filtrosDashboard.farol || l.farol === filtrosDashboard.farol));
  ordenarDemonstrativo(linhasVisiveis);
  linhasDashboardVisiveis = linhasVisiveis;
  renderizarSelecaoInterativa();renderizarControlesAvancados();
  const pAj = linhasVisiveis.reduce((s, l) => s + l.previsto, 0);
  const realVisivel = linhasVisiveis.reduce((s, l) => s + l.realizado, 0);
  const dsv = pAj - realVisivel;
  const idc = realVisivel > 0 ? (pAj / realVisivel).toFixed(2) : "0.00";

  document.getElementById('kpi-previsto').innerText = pAj.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-realizado').innerText = realVisivel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-desvio').innerText = (dsv >= 0 ? "+ " : "") + dsv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-idc').innerText = idc;
  renderizarInsightsDashboard(linhasVisiveis,pAj,realVisivel,dsv,idc);
  renderizarVelocimetros('analise-velocimetros',{previsto:pAj,realizado:realVisivel},linhasVisiveis.map(l=>({label:l.cat,previsto:l.previsto,realizado:l.realizado})));

  const tbody = document.getElementById('tabela-dre-body');
  tbody.innerHTML = '';
  const cV = linhas.filter(l => l.farol === 'green').length;
  const cA = linhas.filter(l => l.farol === 'amber').length;
  const cR = linhas.filter(l => l.farol === 'red').length;
  linhasVisiveis.forEach(({ cat, previsto: prev, realizado: real }) => {
    const saldo = prev - real;
    const percUso = prev > 0 ? (real / prev) * 100 : (real > 0 ? 999 : 0);

    let cls = ''; let txt = ''; let icn = ''; let cor = '';
    if (percUso > parametrosSistema.farolVermelho || (prev === 0 && real > 0)) { cls = 'bg-red-100 text-red-800 border border-red-200'; txt = prev === 0 ? 'N/P' : 'ESTOURADO'; icn = '🔴'; cor = 'text-red-600'; }
    else if (percUso >= parametrosSistema.farolAmarelo) { cls = 'bg-amber-100 text-amber-800 border border-amber-200'; txt = 'ATENÇÃO'; icn = '🟡'; cor = 'text-amber-600'; }
    else { cls = 'bg-emerald-100 text-emerald-800 border border-emerald-200'; txt = 'SEGURO'; icn = '🟢'; cor = 'text-emerald-600'; }

    const row = document.createElement('tr'); row.className = 'hover:bg-blue-50 border-b cursor-pointer'; row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label','Filtrar categoria '+cat);row.onclick=()=>selecionarCategoriaGrafico(cat);row.setAttribute('aria-pressed',String(categoriaEstaSelecionada(cat)&&(categoriasSelecionadas.length>0||!!filtrosDashboard.categoria)));const sel=document.createElement('input');sel.type='checkbox';sel.checked=(categoriasSelecionadas.length>0||!!filtrosDashboard.categoria)&&categoriaEstaSelecionada(cat);sel.setAttribute('aria-label','Somar '+cat);sel.onclick=e=>{e.stopPropagation();alternarCategoriaAcumulada(cat,true);};row.appendChild(Object.assign(document.createElement('td'),{className:'p-2'})).appendChild(sel);row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selecionarCategoriaGrafico(cat);}};
    const cells = [cat, prev.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }), real.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }), percUso === 999 ? '∞' : `${percUso.toFixed(1)}%`, saldo.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })];
    cells.forEach((value,index)=>{ const td=document.createElement('td'); td.className=['p-3 font-bold','p-3 text-right','p-3 text-right',`p-3 text-center font-bold ${cor}`,`p-3 text-right font-black ${cor}`][index]; td.textContent=value; row.appendChild(td); });
    const statusCell=document.createElement('td'); statusCell.className='p-3 text-center';
    const statusBadge=document.createElement('span'); statusBadge.className=`px-2 py-1 rounded text-[10px] font-black uppercase ${cls}`; statusBadge.textContent=`${icn} ${txt}`;
    statusBadge.title=prev===0 && real>0 ? 'N/P = Não previsto. Existe valor realizado, mas o previsto é R$ 0,00; não é possível calcular o percentual de uso.' : `${txt}: ${percUso===999?'sem valor previsto':`${percUso.toFixed(1)}% do previsto utilizado`}`;
    statusCell.appendChild(statusBadge); row.appendChild(statusCell);
    tbody.appendChild(row);
  });

  document.getElementById('farol-verde-count').innerText = cV;
  document.getElementById('farol-amarelo-count').innerText = cA;
  document.getElementById('farol-vermelho-count').innerText = cR;
  ['green','amber','red'].forEach((key, i) => {
    const btn = document.getElementById(`farol-${key}-btn`);
    if (btn) btn.setAttribute('aria-pressed', String(filtrosDashboard.farol === key));
  });
  const seletorCategoria = document.getElementById('filtro-categoria-dashboard');
  if (seletorCategoria) {
    const atual = filtrosDashboard.categoria;
    seletorCategoria.replaceChildren(new Option('Todas as categorias', ''));
    cats.forEach(c => seletorCategoria.add(new Option(c, c)));
    seletorCategoria.value = atual;
    if (atual && !cats.includes(atual)) { filtrosDashboard.categoria = ''; seletorCategoria.value = ''; }
  }
  const resumo = document.getElementById('dashboard-filtro-resumo');
  if (resumo) resumo.textContent = filtrosDashboard.base ? `Filtro da base ativo: ${filtrosDashboard.base.planilhaNome} • ${filtrosDashboard.base.header} = ${filtrosDashboard.base.value}. Gráficos da planilha e Dados Base estão conectados.` : (filtrosDashboard.categoria || filtrosDashboard.farol ? 'Filtros ativos — KPIs, demonstrativo e gráficos estão sincronizados.' : 'Selecione uma categoria, um farol ou um ponto de gráfico para filtrar a análise.');
  const statusBase = document.getElementById('dashboard-base-status');
  if (statusBase) statusBase.textContent = diagnosticoBaseAnaliseRealizado;
  renderizarFiltrosBaseDashboard();
  aplicarParametrosDemonstrativo();
  renderizarGridGraficosDinamicos(obra, cats);aplicarConfiguracoesTelas();
  if(!document.getElementById('view-custos-fixos')?.classList.contains('hidden'))renderizarCustosFixos();
  if(!document.getElementById('view-recorrentes')?.classList.contains('hidden'))renderizarPagamentosRecorrentes();
  if (!document.getElementById('view-dados-base')?.classList.contains('hidden')) renderizarDadosBase();
  if (!document.getElementById('view-previsto')?.classList.contains('hidden')) renderizarPrevisto();
  if (!document.getElementById('view-pesquisa')?.classList.contains('hidden')) pesquisarCustos(filtrosPesquisaCustos);
}

function obterLinhasGrafico(cfg, obra, cats) {
  const campoX=lerCampoBaseId(cfg.xField);
  if (campoX?.tipo === 'coluna') {
    const planilha=dadosBasePlanilhas.find(p=>p.id===campoX.planilhaId);
    if (!planilha) return [];
    const catHeader=planilha.tipo==='Previsto'?planilha.headers.find(h=>/categoria|natureza/.test(normalizarTextoUI(tituloColunaBase(planilha,h)))):obterCamposRealizado(planilha.headers,planilha.rows,planilha.id).categoria;
    let rows=linhasDaObra(planilha,obra).filter(row=>linhaPassaFiltroInterativo(planilha,row,catHeader));
    if(planilha.tipo==='Previsto' && planilha.id.startsWith('previsto-') && planilha.id!==`previsto-${obraAtivaID}`)return [];
    const filtro=filtrosDashboard.base;

    const grupos=new Map();
    const campoY=lerCampoBaseId(cfg.yField);
    rows.forEach(r=>{
      const bruto=String(r[campoX.header] ?? '').trim(); const label=bruto || '(vazio)';
      if (!grupos.has(label)) grupos.set(label,{key:label,label,valor:0,contagem:0});
      const grupo=grupos.get(label); grupo.contagem++;
      if (campoY?.tipo==='coluna' && campoY.planilhaId===planilha.id) grupo.valor+=parseMonetario(r[campoY.header]);
    });
    return [...grupos.values()].map(g=>({...g,valor:campoY?.tipo==='contagem'?g.contagem:g.valor})).sort((a,b)=>b.valor-a.valor).slice(0,parametrosSistema.maxGruposGrafico);
  }
  if (cfg.xField === 'obra') {
    return Object.entries(obrasBD || {}).filter(([, o]) => !o.oculta && (o.status === 'Ativa' || usuarioAutenticado?.perfil === 'Mestre')).map(([id, o]) => {
      const categorias = [...new Set([...Object.keys(o.categoriasPrevisto || {}), ...Object.keys(o.categoriasRealizado || {})])];
      const selecionadas = categorias.filter(c => categoriaEstaSelecionada(c) && (!filtrosDashboard.farol || classificarFarol(((o.categoriasPrevisto || {})[c] || 0) * multiplicadorCenario, (o.categoriasRealizado || {})[c] || 0) === filtrosDashboard.farol));
      const p = selecionadas.reduce((s,c) => s + ((o.categoriasPrevisto || {})[c] || 0) * multiplicadorCenario, 0);
      const r = selecionadas.reduce((s,c) => s + ((o.categoriasRealizado || {})[c] || 0), 0);
      return { key:id, label:(o.nome || id)+(o.status === 'Arquivada' ? ' (Arquivada)' : ''), previsto:p, realizado:r, saldo:p-r, percentual:p ? r/p*100 : 0, idc:r ? p/r : 0 };
    });
  }
  const baseFiltrada = obterRealizadoFiltradoDashboard(obra);
  const realizadoPorCategoria = baseFiltrada || obra.categoriasRealizado || {};
  return cats.filter(c => categoriaEstaSelecionada(c)).map(c => {
    const previsto = ((obra.categoriasPrevisto || {})[c] || 0) * multiplicadorCenario;
    const realizado = realizadoPorCategoria[c] || 0;
    return { key:c, label:c, previsto, realizado, saldo:previsto-realizado, percentual:previsto ? realizado/previsto*100 : 0, idc:realizado ? previsto/realizado : 0, farol:classificarFarol(previsto,realizado) };
  }).filter(r => !filtrosDashboard.farol || r.farol === filtrosDashboard.farol);
}

let geracaoGraficosDashboard=0;
function renderizarGridGraficosDinamicos(obra, cats) {
  const geracao=++geracaoGraficosDashboard;
  const container = document.getElementById('grid-graficos-dinamicos');
  container.innerHTML = '';
  Object.keys(graficosInstancias).forEach(id => { if (graficosInstancias[id]) graficosInstancias[id].destroy(); });
  graficosInstancias = {};

  if (typeof Chart === 'undefined') return;

  graficosConfig.forEach((cfg, i) => {
    const card=document.createElement('div'); card.className='bg-white p-6 rounded-xl shadow-sm border border-gray-200';
    const title=document.createElement('h3'); title.className='font-bold text-[#003399] mb-4'; title.textContent=cfg.titulo || `Gráfico ${i+1}`;
    const canvas=document.createElement('canvas'); canvas.id=cfg.id;
    const box=document.createElement('div'); box.className='relative h-72'; box.appendChild(canvas); card.append(title,box); container.appendChild(card);
  });

  setTimeout(() => {
    if(geracao!==geracaoGraficosDashboard)return;
    graficosConfig.forEach(cfg => {
      const ctx = document.getElementById(cfg.id)?.getContext('2d');
      if (!ctx) return;
      const rows = obterLinhasGrafico(cfg, obra, cats);
      if(cfg.tipo==='gauge'){renderizarVelocimetroPersonalizado(cfg,rows,document.getElementById(cfg.id));return;}
      if(cfg.tipo==='table'||cfg.tipo==='list'){renderizarGraficoTabela(cfg,rows,document.getElementById(cfg.id));return;}
      const labels = rows.length ? rows.map(r=>r.label) : ['Sem dados'];
      const yMap = { previsto:'previsto', realizado:'realizado', saldo:'saldo', percentual:'percentual', idc:'idc' };
      const colors = ['#003399','#00CFFF'];
      const xBase=lerCampoBaseId(cfg.xField), yBase=lerCampoBaseId(cfg.yField);
      const nomeBase=dadosBasePlanilhas.find(p=>p.id===xBase?.planilhaId)?.nome || 'Dados Base';
      const datasets = xBase?.tipo==='coluna' || yBase
        ? [{label:yBase?.tipo==='contagem'?'Contagem de registros':`${yBase?.tipo==='coluna'&&!colunaBaseNumerica(dadosBasePlanilhas.find(p=>p.id===yBase.planilhaId),yBase.header)?'Valores distintos de':'Soma de'} ${tituloColunaBase(dadosBasePlanilhas.find(p=>p.id===yBase?.planilhaId),yBase?.header || 'valor')} (${nomeBase})`,data:rows.map(r=>r.valor),backgroundColor:colors[0],borderColor:colors[0],borderWidth:2}]
        : cfg.yField === 'comparativo'
        ? ['previsto','realizado'].map((field,i)=>({label:field==='previsto'?'Previsto':'Realizado',data:rows.map(r=>r[field]),backgroundColor:colors[i],borderColor:colors[i],borderWidth:2}))
        : [{label:({previsto:'Previsto',realizado:'Realizado',saldo:'Saldo',percentual:'% Uso',idc:'IDC'})[cfg.yField] || 'Valor',data:rows.map(r=>r[yMap[cfg.yField] || 'previsto']),backgroundColor:colors[0],borderColor:colors[0],borderWidth:2}];
      graficosInstancias[cfg.id] = new Chart(ctx, {
        type: cfg.tipo,
        data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: cfg.tipo === 'bar' && cfg.horizontal ? 'y' : 'x', interaction:{mode:'nearest',intersect:false}, onClick: (event, elements, chart) => {
          if(!elements?.length)elements=chart.getElementsAtEventForMode(event,'nearest',{intersect:false},true);
          if (!elements?.length || !rows.length) return;
          const index=elements[0].index, selected=rows[index]; if (!selected) return;
          const campoX=lerCampoBaseId(cfg.xField);
          if (campoX?.tipo==='coluna') {
            const planilha=dadosBasePlanilhas.find(p=>p.id===campoX.planilhaId);
            selecionarCampoGrafico(planilha,campoX.header,selected.key);
          } else if (cfg.xField === 'obra') { alterarObraAtiva(selected.key); const picker=document.getElementById('seletor-obra'); if(picker) picker.value=obraAtivaID; return; }
          else {alternarCategoriaAcumulada(selected.key);return;}
          atualizarDashboard();
        } }
      });
    });
  }, 100);
}

// ==========================================
// MODAIS E CONFIGURAÇÕES
// ==========================================
function abrirModalMeusGraficos() {
  if (!obterPermissoesUsuario().graficos) return alert('Seu perfil não pode criar gráficos.');
  atualizarSeletoresNovoGrafico(); renderizarListaGraficosConfig();
  document.getElementById('modal-meus-graficos').classList.remove('hidden');
}
function fecharModalMeusGraficos() { document.getElementById('modal-meus-graficos').classList.add('hidden'); }
function abrirModalConfiguracoes() {
  if (!podeAbrirConfiguracoes()) return alert('Seu perfil não tem permissão para alterar as configurações.');
  document.getElementById('config-app-title').value = configGlobal.titulo || "";
  if (!configGlobal.planilhasRealizado.length && configGlobal.urlRealizado) {
    configGlobal.planilhasRealizado = [{ id: 'realizado-principal', nome: 'Realizado', url: configGlobal.urlRealizado }];
  }
  renderizarFontesRealizado();
  renderizarTabelaGestaoObras();
  renderizarConfiguracoesParametros();organizarConfiguracoesPorTela();aplicarAcessoConfiguracoes();document.getElementById('modal-configuracoes').classList.remove('hidden');
}

function fecharModalConfiguracoes() { document.getElementById('modal-configuracoes').classList.add('hidden'); }

function trocarAbaConfig(aba) {
  ['geral', 'obras'].forEach(a => {
    document.getElementById(`cfg-aba-${a}`).classList.add('hidden');
    document.getElementById(`tab-btn-${a}`).className = "pb-2 text-gray-500 hover:text-[#003399]";
  });
  document.getElementById(`cfg-aba-${aba}`).classList.remove('hidden');
  document.getElementById(`tab-btn-${aba}`).className = "pb-2 border-b-2 border-[#003399] text-[#003399] font-bold";
  if (aba === 'obras') renderizarTabelaGestaoObras();aplicarAcessoConfiguracoes();
}

function renderizarTabelaGestaoObras() {
  const tbody = document.getElementById('tabela-gestao-obras-body');
  tbody.innerHTML = '';
  Object.keys(obrasBD).sort((a, b) =>
    String(obrasBD[a].nome || obrasBD[a].cc || '').localeCompare(
      String(obrasBD[b].nome || obrasBD[b].cc || ''), 'pt-BR', { sensitivity: 'base', numeric: true }
    ) || a.localeCompare(b)
  ).forEach(id => {
    const o = obrasBD[id];
    tbody.innerHTML += `
      <tr>
        <td class="p-2 font-bold text-[10px]">${o.cc}</td>
        <td class="p-2"><input type="text" value="${o.nome}" onchange="atualizarCampoObra('${id}', 'nome', this.value)" class="border p-1 w-full text-xs"></td>
        <td class="p-2"><input type="text" value="${o.responsavel || ''}" onchange="atualizarCampoObra('${id}', 'responsavel', this.value)" class="border p-1 w-full text-xs" placeholder="Nome do gestor"></td>
        <td class="p-2 min-w-52"><input type="url" value="${o.urlPrevistoCSV || ''}" onchange="atualizarCampoObra('${id}', 'urlPrevistoCSV', this.value)" class="border p-1 w-full text-[10px]" placeholder="Link Google Planilhas / CSV"><label class="block mt-1 text-[10px] text-gray-500">ou arquivo local (CSV, XLSX, XLS, ODS)<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods" onchange="importarArquivoPrevisto(this.files?.[0], '${id}')" class="block w-full text-[10px]"></label><small class="text-[9px] text-gray-500">${o.previstoArquivoLocal ? 'Arquivo local carregado neste navegador' : ''}</small></td>
        <td class="p-2 text-center">
          <button onclick="alternarStatusArquivado('${id}')" class="bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-bold">${o.status === 'Ativa' ? 'Arquivar' : 'Reativar'}</button>
          <button onclick="alternarObraOculta('${id}')" class="${o.oculta ? 'bg-emerald-700' : 'bg-slate-600'} text-white px-2 py-1 rounded text-[10px] font-bold ml-1">${o.oculta ? 'Reexibir nas pesquisas' : 'Ocultar das pesquisas'}</button>
          ${o.oculta ? '<span class="block mt-1 text-[9px] text-amber-700 font-bold">Oculta dos usuários e seletores</span>' : ''}
        </td>
      </tr>
    `;
  });
}

async function atualizarCampoObra(id, campo, valor) {
  if(!podeConfigurar('obras'))return alert('Sem permissão para gerir obras.');
  const obra=obrasBD[id]; if (!obra) return;
  const anterior=obra[campo]; obra[campo]=String(valor ?? '').trim();
  if (campo==='urlPrevistoCSV' && obra[campo]) obra.previstoArquivoLocal=false;
  localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
  if (supabaseClient) {
    try {
      const coluna=campo==='urlPrevistoCSV'?'url_previsto':campo;
      const {error}=await supabaseClient.from('obras').update({[coluna]:obra[campo]}).eq('id',id);
      if (error) throw error;
    } catch(e) {
      obra[campo]=anterior; localStorage.setItem('obras_bp',JSON.stringify(obrasBD));
      alert('Não foi possível salvar a alteração da obra no Supabase: '+(e.message||'erro de conexão'));
      renderizarTabelaGestaoObras(); atualizarDashboard();
    }
  }
  if (campo==='responsavel' && id===obraAtivaID) atualizarDashboard();
}

async function alternarStatusArquivado(id) {
 if(!podeConfigurar('obras'))return alert('Sem permissão para gerir obras.');
  if (obrasBD[id]) {
    obrasBD[id].status = obrasBD[id].status === 'Ativa' ? 'Arquivada' : 'Ativa';
    localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
    if(supabaseClient) { try { await supabaseClient.from('obras').update({ status: obrasBD[id].status }).eq('id', id); } catch(e){} }
    popularSeletorObras(); renderizarTabelaGestaoObras(); atualizarDashboard();
  }
}

async function alternarObraOculta(id) {
  if (!podeConfigurar('obras')) return alert('Sem permissão para gerir obras.');
  const obra = obrasBD[id];
  if (!obra) return;
  const anterior = !!obra.oculta;
  obra.oculta = !anterior;
  localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
  if (supabaseClient) {
    try {
      const { data, error: leituraErro } = await supabaseClient.from('obras').select('dados_json').eq('id', id).maybeSingle();
      if (leituraErro) throw leituraErro;
      const dadosJson = { ...(data?.dados_json || {}), oculta: obra.oculta };
      const { error } = await supabaseClient.from('obras').update({ dados_json: dadosJson }).eq('id', id);
      if (error) throw error;
    } catch (erro) {
      obra.oculta = anterior;
      localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
      alert('Não foi possível salvar a visibilidade da obra no Supabase: ' + (erro.message || erro));
    }
  }
  popularSeletorObras();
  renderizarTabelaGestaoObras();
  atualizarDashboard();
}

function chaveGraficosUsuario() {
  const identidade=usuarioAutenticado?.id || usuarioAutenticado?.usuario || usuarioAutenticado?.email || 'anonimo';
  return 'graficos_bp_usuario_'+encodeURIComponent(String(identidade));
}
function normalizarGraficos(lista) {
  if (!Array.isArray(lista)) return GRAFICOS_PADRAO.map(g=>({...g}));
  return lista.map((g,i)=>({ id:String(g.id||'grafico_'+i), titulo:String(g.titulo||'Gráfico '+(i+1)), tipo:['bar','line','doughnut','pie','polarArea','radar','table','list','gauge'].includes(g.tipo)?g.tipo:'bar', velocimetro:g.velocimetro||{},colunas:Array.isArray(g.colunas)?g.colunas:[],tabelaFonte:g.tabelaFonte||'', xField:g.xField||'categoria', yField:g.yField||'comparativo', horizontal:!!g.horizontal }));
}
function carregarGraficosUsuario() {
  const chave=chaveGraficosUsuario();
  try {
    let salvos=JSON.parse(localStorage.getItem(chave)||'null');
    if (!salvos && usuarioAutenticado?.perfil==='Mestre') {
      const legado=JSON.parse(localStorage.getItem('graficos_bp')||'null');
      if (Array.isArray(legado) && legado.length) { salvos=legado; localStorage.setItem(chave,JSON.stringify(legado)); }
    }
    graficosConfig=salvos?.length?normalizarGraficos(salvos):GRAFICOS_PADRAO.map(g=>({...g}));
  } catch(e) { console.warn('Gráficos do usuário inválidos; usando padrões.',e); graficosConfig=GRAFICOS_PADRAO.map(g=>({...g})); }
}
function adicionarNovoGrafico() {
  if (!obterPermissoesUsuario().graficos) return alert('Seu perfil não pode criar gráficos.');
  const titulo = document.getElementById('novo-chart-titulo').value.trim();
  const tipo = document.getElementById('novo-chart-tipo').value;
  const xField = document.getElementById('novo-chart-x').value;
  const yField = document.getElementById('novo-chart-y').value;
  if (!titulo) return alert("Digite o título.");
  graficosConfig.push({ velocimetro:{...velocimetroNovoGrafico},colunas:[...colunasNovoGrafico],tabelaFonte:fonteTabelaNovoGrafico,id: `chart_custom_${Date.now()}`, titulo, tipo, xField, yField, horizontal: tipo === 'bar' && document.getElementById('novo-chart-horizontal').checked });
  document.getElementById('novo-chart-titulo').value = '';
  persistirGraficosConfig(); renderizarListaGraficosConfig(); atualizarDashboard();
}
function persistirGraficosConfig() { try { localStorage.setItem(chaveGraficosUsuario(), JSON.stringify(graficosConfig)); } catch(e) { alert('Não foi possível salvar os gráficos deste usuário neste navegador.'); } }
function removerGrafico(id) { if (!obterPermissoesUsuario().graficos) return alert('Seu perfil não pode editar gráficos.'); graficosConfig = graficosConfig.filter(g => g.id !== id); persistirGraficosConfig(); renderizarListaGraficosConfig(); atualizarDashboard(); }
function renderizarListaGraficosConfig() {
  const div = document.getElementById('lista-graficos-config'); if (!div) return; div.replaceChildren();
  const select = (label, value, options, onChange) => {
    const wrap=document.createElement('label'); wrap.className='text-xs font-bold text-gray-600'; wrap.textContent=label;
    const el=document.createElement('select'); el.className='w-full border p-2 rounded mt-1';
    options.forEach(([v,t])=>el.add(new Option(t,v))); el.value=value; el.onchange=onChange; wrap.appendChild(el); return wrap;
  };
  graficosConfig.forEach(g => {
    const row=document.createElement('div'); row.className='grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-white p-3 border rounded-lg';
    const title=document.createElement('label'); title.className='text-xs font-bold text-gray-600'; title.textContent='Título';
    const input=document.createElement('input'); input.className='w-full border p-2 rounded mt-1'; input.value=g.titulo; input.maxLength=80; input.onchange=()=>{g.titulo=input.value.trim()||'Gráfico'; persistirGraficosConfig(); atualizarDashboard();}; title.appendChild(input);
    const onEdit=()=>{persistirGraficosConfig(); atualizarDashboard();};
    const type=select('Tipo',g.tipo,[['bar','Barras'],['line','Linha'],['doughnut','Rosca'],['pie','Pizza'],['polarArea','Área polar'],['radar','Radar'],['table','Tabela'],['list','Lista'],['gauge','Velocímetro']],e=>{g.tipo=e.target.value;onEdit();renderizarListaGraficosConfig();});
    const x=select('Eixo X',g.xField||'categoria',opcoesCamposGraficos('x'),e=>{
      g.xField=e.target.value;
      const yOpts=opcoesCamposGraficos('y',g.xField);
      if(!yOpts.some(([v])=>v===g.yField)) g.yField=yOpts[0]?.[0] || 'previsto';
      persistirGraficosConfig(); renderizarListaGraficosConfig(); atualizarDashboard();
    });
    const y=select('Eixo Y',g.yField||'comparativo',opcoesCamposGraficos('y',g.xField),e=>{g.yField=e.target.value;onEdit();});
    const action=document.createElement('div'); action.className='flex items-center gap-2';
    const horizontal=document.createElement('label'); horizontal.className='flex items-center gap-1 text-xs';
    const check=document.createElement('input'); check.type='checkbox'; check.checked=!!g.horizontal; check.disabled=g.tipo!=='bar'; check.onchange=()=>{g.horizontal=check.checked;onEdit();}; horizontal.append(check,document.createTextNode('Horizontal'));
    const remove=document.createElement('button'); remove.type='button'; remove.textContent='Remover'; remove.className='text-red-700 font-bold'; remove.onclick=()=>removerGrafico(g.id);
    action.append(horizontal,remove); row.append(title,type,x,y,action); div.appendChild(row);if(g.tipo==='gauge')div.appendChild(criarOpcoesVelocimetro(g,()=>{persistirGraficosConfig();atualizarDashboard();}));if(g.tipo==='table'||g.tipo==='list')div.appendChild(criarSeletorColunasTabela(g,()=>{persistirGraficosConfig();atualizarDashboard();}));
  });
}

async function salvarConfiguracoesGerais() {
  if (!podeConfigurar('geral')) return alert('Seu perfil não pode alterar as configurações do sistema.');
  configGlobal.titulo = document.getElementById('config-app-title').value.trim();
  configGlobal.planilhasRealizado = configGlobal.planilhasRealizado.filter(f => f.nome?.trim() && (f.url?.trim() || f.arquivoLocal)).map(f => ({ ...f, nome: f.nome.trim(), url: (f.url || '').trim() }));
  configGlobal.urlRealizado = configGlobal.planilhasRealizado[0]?.url || '';
  localStorage.setItem('config_bp', JSON.stringify(configGlobal));
  let erroSupabase = null;
  if(supabaseClient) {
    try {
      const { error } = await supabaseClient.from('configuracoes').upsert({ id: 1, titulo: configGlobal.titulo, url_realizado: configGlobal.urlRealizado });
      erroSupabase = error;
    } catch (error) { erroSupabase = error; }
  }
  document.getElementById('header-app-title').innerText = configGlobal.titulo;
  fecharModalConfiguracoes();
  if (erroSupabase) alert(`Configurações salvas neste navegador, mas o Supabase retornou: ${erroSupabase.message}`);
  if (confirm("Configurações salvas. Sincronizar dados agora?")) sincronizarTodasPlanilhas();
}

// ==========================================
// USUÁRIOS E PERMISSÕES
// ==========================================
function aplicarPermissoesPerfil() {
  if (!usuarioAutenticado) return;
  const permissoes=obterPermissoesUsuario();
  document.getElementById('user-display-name').innerText = usuarioAutenticado.nome;
  document.getElementById('user-display-role').innerText = usuarioAutenticado.perfil;
  document.getElementById('btn-gestao-usuarios').style.display = permissoes.usuarios ? 'inline-flex' : 'none';
  document.getElementById('btn-configuracoes').style.display = podeAbrirConfiguracoes() ? 'inline-flex' : 'none';
  document.getElementById('btn-sync').style.display = permissoes.sincronizar ? 'inline-flex' : 'none';
  document.getElementById('btn-meus-graficos').style.display = permissoes.graficos ? 'inline-flex' : 'none';
  document.getElementById('btn-relatorio').style.display = permissoes.relatorios ? 'inline-flex' : 'none';
  document.getElementById('btn-relatorio-dashboard').style.display = permissoes.relatorios ? 'inline-flex' : 'none';
  const opcaoMestre=document.querySelector('#novo-usr-perfil option[value="Mestre"]');
  if (opcaoMestre) opcaoMestre.disabled=!permissoes.permissoes;
  document.getElementById('nav-dashboard').classList.toggle('hidden', !permissoes.dashboard);
  document.getElementById('nav-pesquisa')?.classList.toggle('hidden',!permissoes.pesquisa);
  ['nav-dados-base','nav-previsto','nav-custos-fixos','nav-recorrentes'].forEach(id=>document.getElementById(id)?.classList.toggle('hidden',!permissoes.dadosBase));
  if (!permissoes.dashboard && permissoes.dadosBase) abrirAbaSistema('realizado');
  else if (!permissoes.dashboard && permissoes.pesquisa) abrirAbaSistema('pesquisa');
  else if (!permissoes.dashboard && !permissoes.dadosBase && !permissoes.pesquisa) executarLogout();
}

async function gerarRelatorioImprimir() {
  if (!obterPermissoesUsuario().relatorios) return alert('Seu perfil não pode gerar relatórios.');
  if (!obraAtivaID || !obrasBD[obraAtivaID]) return alert('Selecione uma obra para gerar o relatório.');
  const root=document.getElementById('relatorio-impressao'); root.replaceChildren();
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=String(text);return n;};
  const obra=obrasBD[obraAtivaID], moeda=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const percentual=(real,prev)=>prev>0?((real/prev)*100).toFixed(1)+'%':(real>0?'N/P':'0,0%');
  const barra=el('header','report-letterhead');
  const wave=document.createElementNS('http://www.w3.org/2000/svg','svg');wave.setAttribute('viewBox','0 0 1200 150');wave.setAttribute('preserveAspectRatio','none');wave.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M0 0 H1200 V92 C900 125 640 40 340 70 C190 85 80 115 0 138 Z');path.setAttribute('fill','#4472c4');wave.appendChild(path);
  const logo=el('img','report-logo');logo.src='assets/logo-brasil-pontes.png';logo.alt='Logo Brasil Pontes';
  const brand=el('div','report-brand');brand.append(el('strong','',configGlobal.titulo||'Brasil Pontes'),el('span','','Controladoria & Engenharia de Custos'));
  barra.append(wave,logo,brand);root.appendChild(barra);

  const capa=el('section','report-cover');
  capa.append(el('p','report-kicker','CONTROLADORIA · ENGENHARIA DE CUSTOS'),el('h1','report-title','Relatório Gerencial de Custos'),el('p','report-subtitle','Acompanhamento do custo previsto em relação ao realizado'));
  const gerado=el('p','report-generated','Emitido em '+new Date().toLocaleString('pt-BR')+' · Responsável: '+(usuarioAutenticado?.nome||usuarioAutenticado?.usuario||'Usuário'));capa.appendChild(gerado);
  root.appendChild(capa);

  const heading=(title,sub)=>{const box=el('div','report-section-heading');box.append(el('h2','',title));if(sub)box.appendChild(el('p','',sub));return box;};
  root.appendChild(heading('Identificação da obra','Dados da obra selecionada para esta análise.'));
  const info=el('div','report-info-grid');
  [['Obra',obra.nome||'—'],['Centro de custo / departamento',obra.cc||'—'],['Gestor responsável',obra.responsavel||'Não informado'],['Status',obra.status||'—'],['Cenário aplicado',document.getElementById('seletor-cenario')?.selectedOptions[0]?.textContent||'Base'],['Registros analisados',linhasDashboardVisiveis.length]]
  .forEach(([k,v])=>{const item=el('div','report-info-item');item.append(el('span','report-label',k),el('strong','',v));info.appendChild(item);});root.appendChild(info);

  const filtros=[];
  if(categoriasSelecionadas.length)filtros.push('Categorias: '+categoriasSelecionadas.join(' + '));
  if(periodoPagamento.inicio||periodoPagamento.fim)filtros.push('Pagamento: '+(periodoPagamento.inicio||'início')+' a '+(periodoPagamento.fim||'hoje'));
  if(filtrosDashboard.categoria)filtros.push('Categoria: '+filtrosDashboard.categoria);
  if(filtrosDashboard.farol)filtros.push('Farol: '+({green:'Seguro',amber:'Atenção',red:'Estourado'}[filtrosDashboard.farol]||filtrosDashboard.farol));
  if(filtrosDashboard.base)filtros.push('Dados Base — '+filtrosDashboard.base.planilhaNome+' / '+filtrosDashboard.base.header+': '+filtrosDashboard.base.value);
  root.appendChild(heading('Escopo e filtros','Os valores e a tabela refletem os filtros selecionados no painel.'));
  root.appendChild(el('p','report-filter-summary',filtros.length?filtros.join(' · '):'Nenhum filtro adicional aplicado; todas as categorias da obra estão incluídas.'));

  const previsto=linhasDashboardVisiveis.reduce((a,l)=>a+l.previsto,0),realizado=linhasDashboardVisiveis.reduce((a,l)=>a+l.realizado,0),saldo=previsto-realizado;
  const counts={green:0,amber:0,red:0};linhasDashboardVisiveis.forEach(l=>counts[l.farol]=(counts[l.farol]||0)+1);
  root.appendChild(heading('Resumo executivo','Indicadores calculados para as categorias visíveis após a aplicação dos filtros.'));
  const kpis=el('div','report-kpi-grid');
  [['Custo previsto',moeda(previsto)],['Custo realizado',moeda(realizado)],['Saldo orçamentário',moeda(saldo)],['Percentual de uso',percentual(realizado,previsto)],['IDC',previsto>0&&realizado>0?(previsto/realizado).toFixed(2):'—']]
    .forEach(([label,value],i)=>{const card=el('div','report-kpi report-kpi-'+i);card.append(el('span','',label),el('strong','',value));kpis.appendChild(card);});root.appendChild(kpis);
  const legend=el('div','report-farol-summary');[['green','🟢 Seguro'],['amber','🟡 Atenção'],['red','🔴 Estourado']].forEach(([key,label])=>legend.appendChild(el('span','',label+': '+(counts[key]||0))));root.appendChild(legend);

  const conteudoInsights=document.getElementById('dashboard-insights-content');
  if(conteudoInsights?.children.length){root.appendChild(heading('Análise gerencial','Pontos de atenção, opiniões gerenciais e pequenos relatórios calculados com os filtros ativos.'));root.appendChild(conteudoInsights.cloneNode(true));}
  const alertas=linhasDashboardVisiveis.filter(l=>l.farol==='red'||l.farol==='amber');

  root.appendChild(heading('Demonstrativo por categoria','Valores em reais. O saldo corresponde ao previsto menos o realizado.'));
  const tabela=el('table','report-table');const thead=el('thead'),trh=el('tr');['Categoria / Natureza','Previsto','Realizado','Uso do previsto','Saldo','Farol'].forEach(t=>trh.appendChild(el('th','',t)));thead.appendChild(trh);tabela.appendChild(thead);
  const tbody=el('tbody');linhasDashboardVisiveis.forEach(l=>{const row=el('tr');const values=[l.cat,moeda(l.previsto),moeda(l.realizado),percentual(l.realizado,l.previsto),moeda(l.previsto-l.realizado),l.farol==='red'?(l.previsto===0&&l.realizado>0?'N/P — Não previsto':'Estourado'):l.farol==='amber'?'Atenção':'Seguro'];values.forEach((v,i)=>row.appendChild(el(i===0?'th':'td',i===5?'report-status-'+l.farol:'',v)));tbody.appendChild(row);});
  const total=el('tr','report-total-row');['TOTAL',moeda(previsto),moeda(realizado),percentual(realizado,previsto),moeda(saldo),alertas.length+' alertas'].forEach(v=>total.appendChild(el('td','',v)));tbody.appendChild(total);tabela.appendChild(tbody);root.appendChild(tabela);
  const nota=el('p','report-methodology',legendaFarol());root.appendChild(nota);

  const fontes=(dadosBasePlanilhas||[]).map(p=>p.nome).filter(Boolean);
  root.appendChild(heading('Fontes de dados','Planilhas carregadas na base utilizada pelo sistema.'));
  root.appendChild(el('p','report-sources',fontes.length?fontes.join(' · '):'Nenhuma planilha de Dados Base importada.'));

  const chartCards=Array.from(document.querySelectorAll('#grid-graficos-dinamicos > div')).map(card=>({title:card.querySelector('h3')?.textContent||'Gráfico',canvas:card.querySelector('canvas')})).filter(x=>x.canvas);
  if(chartCards.length){root.appendChild(heading('Gráficos da análise','Visualizações configuradas para o usuário atual.'));const grid=el('div','report-chart-grid');chartCards.forEach(item=>{try{const card=el('figure','report-chart-card');card.appendChild(el('figcaption','',item.title));const img=el('img','',null);img.src=item.canvas.toDataURL('image/png');img.alt=item.title;card.appendChild(img);grid.appendChild(card);}catch(e){console.warn('Não foi possível incluir um gráfico no relatório.',e);}});root.appendChild(grid);}

  const rodape=el('footer','report-letterhead-footer');
  const ondaFooter=document.createElementNS('http://www.w3.org/2000/svg','svg');ondaFooter.setAttribute('viewBox','0 0 1200 100');ondaFooter.setAttribute('preserveAspectRatio','none');ondaFooter.setAttribute('aria-hidden','true');
  const pathFooter=document.createElementNS('http://www.w3.org/2000/svg','path');pathFooter.setAttribute('d','M0 30 C300 0 680 72 930 42 C1050 28 1130 15 1200 0 V100 H0 Z');pathFooter.setAttribute('fill','#003399');ondaFooter.appendChild(pathFooter);
  rodape.append(ondaFooter,el('div','report-footer-text','Rua Grécia, 59, Ibituruna – Montes Claros/MG · CEP: 39408-087 · Telefone: (31) 3658-9664'));root.appendChild(rodape);

  await Promise.allSettled(Array.from(root.querySelectorAll("img")).map(img=>img.decode?img.decode():Promise.resolve()));
  window.print();
}
function opcoesPerfisUsuario(){return Object.keys(permissoesPerfis).filter(p=>p!=='__sistema').map(p=>[p,p==='Dono'?'Dono / Diretoria':p]);}
function atualizarSeletoresPerfis(){['novo-usr-perfil','permissoes-perfil-select'].forEach(id=>{const select=document.getElementById(id);if(!select)return;const valor=select.value;select.replaceChildren(...opcoesPerfisUsuario().map(([v,t])=>new Option(t,v)));select.value=Object.hasOwn(permissoesPerfis,valor)?valor:'Engenheiro';});}
async function persistirPerfisCompartilhados(perfis){
  if(!supabaseClient)throw new Error('Conecte ao Supabase para salvar perfis compartilhados.');
  const {data:atual,error:leituraErro}=await supabaseClient.from('configuracoes').select('perfis_json').eq('id',configGlobal.idConfigSupabase||1).single();if(leituraErro)throw leituraErro;
  const {data,error}=await supabaseClient.from('configuracoes').update({perfis_json:{...perfis,__sistema:atual?.perfis_json?.__sistema||{manutencao:false}}}).eq('id',configGlobal.idConfigSupabase||1).select('id').single();
  if(error)throw error;if(!data)throw new Error('O banco não confirmou o salvamento.');
  localStorage.setItem('permissoes_bp',JSON.stringify(perfis));
}
async function criarPerfilPersonalizado(){
  if(usuarioAutenticado?.perfil!=='Mestre')return alert('Somente o Mestre pode criar perfis.');
  const input=document.getElementById('novo-perfil-nome'),status=document.getElementById('novo-perfil-status');const nome=input.value.trim();
  if(!/^[\p{L}\p{N} _-]{2,40}$/u.test(nome)||['__proto__','constructor','prototype','__sistema'].includes(nome.toLowerCase())){status.textContent='Use um nome de 2 a 40 letras, números ou espaços.';return;}
  if(Object.keys(permissoesPerfis).some(p=>normalizarTexto(p)===normalizarTexto(nome))){status.textContent='Este perfil já existe.';return;}
  const novos={...permissoesPerfis,[nome]:{...PERMISSOES_PADRAO.Engenheiro}};
  const btn=document.getElementById('btn-criar-perfil');btn.disabled=true;status.textContent='Salvando…';
  try{await persistirPerfisCompartilhados(novos);permissoesPerfis=novos;atualizarSeletoresPerfis();document.getElementById('permissoes-perfil-select').value=nome;renderizarEditorPermissoesPerfil();renderizarPainelUsuarios();input.value='';status.textContent=`Perfil ${nome} criado. Ajuste as permissões abaixo e salve.`;}
  catch(e){status.textContent='Não foi possível criar: '+(e.message||e);}finally{btn.disabled=false;}
}

function obterPermissoesUsuario(usuario = usuarioAutenticado) {
  if (usuario?.perfil === 'Mestre') return { ...PERMISSOES_PADRAO.Mestre };
  if (!usuario) return { ...PERMISSOES_PADRAO.Engenheiro, configuracoes:false, graficos:false, relatorios:false };
  return { ...Object.fromEntries(Object.keys(PERMISSOES_PADRAO.Mestre).map(k=>[k,false])),...PERMISSOES_PADRAO[usuario.perfil], ...permissoesPerfis[usuario.perfil] };
}

async function abrirModalUsuarios() {
  if (!obterPermissoesUsuario().usuarios) return alert('Seu perfil não tem permissão para gerenciar usuários.');
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('usuarios').select('*');
      if (!error && Array.isArray(data)) {
        usuariosBD=[MASTER_USER,...data.filter(u=>u.status==='Aprovado' && u.usuario!==MASTER_USER.usuario)];
        solicitacoesPendentesBD=data.filter(u=>u.status==='Pendente');
      }
    } catch(e) { console.warn('Não foi possível atualizar a lista de usuários.',e); }
  }
  renderizarPainelUsuarios();
  const editor=document.getElementById('editor-permissoes-perfis');
  if (editor) editor.classList.toggle('hidden', usuarioAutenticado?.perfil !== 'Mestre');
  document.getElementById('modal-usuarios').classList.remove('hidden');
}
function fecharModalUsuarios() { document.getElementById('modal-usuarios').classList.add('hidden'); }

function renderizarEditorPermissoesPerfil() {
  const perfil=document.getElementById('permissoes-perfil-select')?.value || 'Engenheiro';
  const regras=perfil==='Mestre'?PERMISSOES_PADRAO.Mestre:(permissoesPerfis[perfil] || PERMISSOES_PADRAO.Engenheiro);
  const nomes={dashboard:'perm-dashboard',pesquisa:'perm-pesquisa',dadosBase:'perm-dados-base',sincronizar:'perm-sincronizar',usuarios:'perm-usuarios',permissoes:'perm-permissoes',graficos:'perm-graficos',relatorios:'perm-relatorios'};
  const configCampo=document.getElementById('perm-configuracoes'); if(configCampo){configCampo.checked=perfil==='Mestre'||!!regras.configuracoes;configCampo.disabled=perfil==='Mestre';}
  const bloqueado=perfil==='Mestre';
  Object.entries(nomes).forEach(([chave,id])=>{const campo=document.getElementById(id); if(campo){campo.checked=!!regras[chave];campo.disabled=bloqueado;}});
  document.getElementById('btn-salvar-permissoes').disabled=bloqueado;
  document.getElementById('btn-salvar-permissoes').classList.toggle('opacity-50',bloqueado);
  document.getElementById('permissoes-mestre-info').classList.toggle('hidden',!bloqueado);
  document.getElementById('permissoes-status').textContent='';
}

async function salvarPermissoesPerfil() {
  if (usuarioAutenticado?.perfil!=='Mestre') return alert('Somente o Mestre pode configurar perfis.');
  const perfil=document.getElementById('permissoes-perfil-select').value;
  if (perfil==='Mestre') return;
  const anteriores=permissoesPerfis[perfil];
  permissoesPerfis[perfil]={
    pesquisa:document.getElementById('perm-pesquisa').checked,
    dashboard:document.getElementById('perm-dashboard').checked,
    dadosBase:document.getElementById('perm-dados-base').checked,
    sincronizar:document.getElementById('perm-sincronizar').checked,
    configuracoes:document.getElementById('perm-configuracoes').checked,
    usuarios:document.getElementById('perm-usuarios').checked,
    permissoes:document.getElementById('perm-permissoes').checked,
    graficos:document.getElementById('perm-graficos').checked,
    relatorios:document.getElementById('perm-relatorios').checked
  };
  try { await persistirPerfisCompartilhados(permissoesPerfis); }
  catch(e) {permissoesPerfis[perfil]=anteriores;document.getElementById('permissoes-status').textContent='Não foi possível salvar: '+(e.message||e);return;}
  document.getElementById('permissoes-status').textContent=`Permissões de ${perfil} salvas no Supabase.`;
  if (usuarioAutenticado?.perfil===perfil) aplicarPermissoesPerfil();
}

async function alterarPerfilUsuario(id, novoPerfil) {
  if (!obterPermissoesUsuario().usuarios) return alert('Seu perfil não pode alterar usuários.');
  if (novoPerfil==='Mestre' && !obterPermissoesUsuario().permissoes) return alert('Somente um perfil autorizado a configurar permissões pode promover alguém a Mestre.');
  const usuario=usuariosBD.find(u=>String(u.id)===String(id));
  if (!usuario || String(usuario.id)==='local_master') return;
  const anterior=usuario.perfil; usuario.perfil=novoPerfil;
  if (supabaseClient) {
    try {
      const { error }=await supabaseClient.from('usuarios').update({perfil:novoPerfil}).eq('id',id);
      if (error) { usuario.perfil=anterior; alert(`Não foi possível salvar o perfil no Supabase: ${error.message}`); }
    } catch(error) { usuario.perfil=anterior; alert(`Erro ao salvar o perfil: ${error.message || error}`); }
  }
  renderizarPainelUsuarios();
  if (String(usuarioAutenticado?.id)===String(id)) aplicarPermissoesPerfil();
}

async function criarUsuarioDireto() {
  if (!obterPermissoesUsuario().usuarios) return alert('Seu perfil não pode cadastrar usuários.');
  const nome = document.getElementById('novo-usr-nome').value.trim();
  const email = document.getElementById('novo-usr-email').value.trim();
  const usuario = document.getElementById('novo-usr-login').value.trim();
  const senha = document.getElementById('novo-usr-senha').value.trim();
  const perfil = document.getElementById('novo-usr-perfil').value;
  const trocar_senha=!!document.getElementById('novo-usr-trocar-senha')?.checked;
  if (perfil==='Mestre' && !obterPermissoesUsuario().permissoes) return alert('Seu perfil não pode criar usuários Mestre.');

  if (!nome || !email || !usuario || !senha) return alert("Preencha todos os campos.");
  
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('usuarios').insert([{ nome, email, usuario, senha, perfil, trocar_senha, status: 'Aprovado' }]).select();
      if (error) return alert(`Não foi possível cadastrar o usuário: ${error.message}`);
      if (data?.[0]) usuariosBD.push(data[0]);
    } catch(e) { return alert(`Erro ao cadastrar o usuário: ${e.message || e}`); }
  } else {
    usuariosBD.push({ id: Date.now().toString(), nome, email, usuario, senha, perfil, trocar_senha, status: "Aprovado" });
  }
  renderizarPainelUsuarios(); alert("Usuário registado!");
}

async function solicitarCadastro(e) {
 if(e)e.preventDefault();const nome=document.getElementById('solic-nome').value.trim(),email=document.getElementById('solic-email').value.trim(),usuario=document.getElementById('solic-usuario').value.trim(),senha=document.getElementById('solic-senha').value;
 const status=document.getElementById('solic-status'),btn=document.getElementById('btn-solicitar-cadastro');const informar=texto=>{if(status)status.textContent=texto;else alert(texto);};
 if(!nome||!email||!usuario||!senha.trim())return informar('Preencha todos os campos.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return informar('Informe um e-mail válido.');if(btn?.disabled)return;if(btn)btn.disabled=true;informar('Enviando solicitação…');
 try{if(!supabaseClient)throw new Error('Sem conexão com o banco. Aguarde e tente novamente.');const {data,error}=await supabaseClient.from('usuarios').insert([{nome,email,usuario,senha,perfil:typeof perfilSolicitacaoAtual==='function'?perfilSolicitacaoAtual():'Engenheiro',status:'Pendente'}]).select('id,status').single();if(error)throw error;if(!data?.id||data.status!=='Pendente')throw new Error('O banco não confirmou a solicitação.');informar('Solicitação registrada no banco. Aguarde a aprovação do Mestre.');document.getElementById('solic-senha').value='';exibirFormLogin();alert('Solicitação registrada no banco. Aguarde a aprovação do Mestre.');}
 catch(error){informar(error.code==='23505'?'Este login ou e-mail já possui cadastro. Solicite ao Mestre que confira a lista.':'Não foi possível registrar a solicitação: '+(error.message||'Falha de conexão. Tente novamente.'));}finally{if(btn)btn.disabled=false;}
}

async function aprovarSolicitacao(id) {
  if (!obterPermissoesUsuario().usuarios) return alert('Seu perfil não pode aprovar solicitações.');
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('usuarios').update({ status: 'Aprovado' }).eq('id', id).select('*');
      if (error) return alert(`Não foi possível aprovar: ${error.message}`);if(!data?.length)return alert('O banco não confirmou a aprovação. Atualize a lista e tente novamente.');
      solicitacoesPendentesBD=solicitacoesPendentesBD.filter(s=>String(s.id)!==String(id));
      (data || []).forEach(u=>{ if(!usuariosBD.some(atual=>String(atual.id)===String(u.id))) usuariosBD.push(u); });
    } catch(e) { return alert(`Erro ao aprovar usuário: ${e.message || e}`); }
  } else {
    const i = solicitacoesPendentesBD.findIndex(s=>s.id === id);
    if(i>-1) { solicitacoesPendentesBD[i].status = "Aprovado"; usuariosBD.push(solicitacoesPendentesBD[i]); solicitacoesPendentesBD.splice(i,1); }
  }
  renderizarPainelUsuarios();
}

async function salvarDadosUsuario(id, campos, botao, aviso) {
  if (usuarioAutenticado?.perfil !== 'Mestre') return alert('Somente o Mestre pode editar os dados dos usuários.');
  const usuario=usuariosBD.find(u=>String(u.id)===String(id));
  if(!usuario || String(id)==='local_master')return;
  const dados={nome:campos.nome.value.trim(),email:campos.email.value.trim(),usuario:campos.usuario.value.trim(),perfil:campos.perfil.value};
  if(!dados.nome || !dados.usuario) {aviso.textContent='Preencha nome e login.';return;}
  if(dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)){aviso.textContent='Informe um e-mail válido.';return;}
  if(usuariosBD.some(u=>String(u.id)!==String(id) && (normalizarTexto(u.usuario)===normalizarTexto(dados.usuario) || (dados.email && normalizarTexto(u.email)===normalizarTexto(dados.email))))){aviso.textContent='Login ou e-mail já utilizado.';return;}
  if(!Object.hasOwn(permissoesPerfis,dados.perfil)){aviso.textContent='Perfil inválido.';return;}
  if(campos.senha.value) dados.senha=campos.senha.value;
  if(campos.trocar_senha)dados.trocar_senha=campos.trocar_senha.checked;
  botao.disabled=true;aviso.textContent='Salvando…';
  try {
    if(!supabaseClient)throw new Error('Conecte ao Supabase para salvar os dados do usuário.');
    const {data,error}=await supabaseClient.from('usuarios').update(dados).eq('id',id).select('id,nome,email,usuario,perfil,status').single();
    if(error)throw error;
    if(!data)throw new Error('O banco não confirmou a alteração.');
    Object.assign(usuario,dados,data);
    if(String(usuarioAutenticado?.id)===String(id)){Object.assign(usuarioAutenticado,usuario);aplicarPermissoesPerfil();}
    campos.senha.value='';aviso.textContent='Dados salvos no Supabase.';
  }catch(e){aviso.textContent='Não foi possível salvar: '+(e.message||e);}
  finally{botao.disabled=false;}
}

function renderizarPainelUsuarios() {
  const tbodyPend = document.getElementById('tabela-pendentes-body');
  document.getElementById('count-pendentes').innerText = solicitacoesPendentesBD.length;
  tbodyPend.replaceChildren();
  if (!solicitacoesPendentesBD.length) { const tr=document.createElement('tr'),td=document.createElement('td'); td.colSpan=4;td.className='p-3 text-center text-gray-400';td.textContent='Nenhuma solicitação pendente.';tr.appendChild(td);tbodyPend.appendChild(tr); }
  solicitacoesPendentesBD.forEach(s => {
    const tr=document.createElement('tr');
    [s.nome,s.usuario,s.perfil || 'Engenheiro'].forEach((v,i)=>{const td=document.createElement('td');td.className=`p-2 ${i===0?'font-bold':''}`;td.textContent=v;tr.appendChild(td);});
    const acao=document.createElement('td');acao.className='p-2 text-center';
    const botao=document.createElement('button');botao.type='button';botao.textContent='Aprovar';botao.className='bg-emerald-600 text-white px-2 py-1 rounded text-[10px]';botao.onclick=()=>aprovarSolicitacao(s.id);acao.appendChild(botao);tr.appendChild(acao);tbodyPend.appendChild(tr);
  });

  const tbodyAtivos = document.getElementById('tabela-usuarios-body');
  tbodyAtivos.replaceChildren();
  usuariosBD.forEach(u => {
    const tr=document.createElement('tr');
    const editavel=usuarioAutenticado?.perfil==='Mestre' && String(u.id)!=='local_master';
    const campos={};
    [['nome','Nome','text'],['email','E-mail','email'],['usuario','Login','text']].forEach(([key,label,type])=>{const td=document.createElement('td');td.className='p-2';const input=document.createElement('input');input.type=type;input.value=u[key]||'';input.disabled=!editavel;input.className='border rounded p-2 text-xs w-44';input.setAttribute('aria-label',`${label} de ${u.nome||u.usuario}`);td.appendChild(input);tr.appendChild(td);campos[key]=input;});
    const perfilTd=document.createElement('td');perfilTd.className='p-2';
    const perfil=document.createElement('select');perfil.className='border rounded p-1 text-xs';
    opcoesPerfisUsuario().forEach(([v,t])=>{const option=new Option(t,v);if(v==='Mestre'&&!obterPermissoesUsuario().permissoes)option.disabled=true;perfil.add(option);});
    perfil.value=u.perfil || 'Engenheiro';perfil.disabled=!editavel;perfil.setAttribute('aria-label',`Perfil de ${u.nome || u.usuario}`);perfilTd.appendChild(perfil);tr.appendChild(perfilTd);campos.perfil=perfil;
    const senhaTd=document.createElement('td');senhaTd.className='p-2';const senha=document.createElement('input');senha.type='password';senha.autocomplete='new-password';senha.placeholder='Nova senha (opcional)';senha.disabled=!editavel;senha.className='border rounded p-2 text-xs w-44';senha.setAttribute('aria-label',`Nova senha de ${u.nome||u.usuario}`);senhaTd.appendChild(senha);tr.appendChild(senhaTd);campos.senha=senha;const exigir=document.createElement('input');exigir.type='checkbox';exigir.checked=u.trocar_senha===true;exigir.disabled=!editavel;const exigirLabel=document.createElement('label');exigirLabel.className='flex items-center gap-2 text-xs mt-2';exigirLabel.append(exigir,document.createTextNode('Exigir troca da senha no próximo acesso'));senhaTd.append(exigirLabel);campos.trocar_senha=exigir;
    const status=document.createElement('td');status.className='p-2 min-w-44';const aviso=document.createElement('p');aviso.className='text-xs mt-1';aviso.setAttribute('aria-live','polite');if(editavel){const salvar=document.createElement('button');salvar.type='button';salvar.textContent='Salvar dados';salvar.className='bg-[#003399] text-white rounded px-3 py-2 text-xs font-bold';salvar.onclick=()=>salvarDadosUsuario(u.id,campos,salvar,aviso);status.appendChild(salvar);}else aviso.textContent=String(u.id)==='local_master'?'Conta principal':'Somente o Mestre pode editar.';status.appendChild(aviso);tr.appendChild(status);
    tbodyAtivos.appendChild(tr);
  });
  renderizarEditorPermissoesPerfil();
}
