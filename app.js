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

let usuariosBD = [MASTER_USER];
let solicitacoesPendentesBD = [];
let graficosConfig = [
  { id: "chart_cat", titulo: "Previsto x Realizado", tipo: "bar", metrica: "categoria" },
  { id: "chart_curv", titulo: "Evolução do Desempenho", tipo: "line", metrica: "curvaS" }
];
let graficosInstancias = {};
let usuarioAutenticado = null;
let obraAtivaID = null;
let multiplicadorCenario = 1;

let configGlobal = { titulo: "Brasil Pontes", urlRealizado: "", planilhasRealizado: [] };
try { const cfg = localStorage.getItem('config_bp'); if (cfg && cfg !== "undefined") configGlobal = JSON.parse(cfg); } catch(e){}
if (!Array.isArray(configGlobal.planilhasRealizado)) configGlobal.planilhasRealizado = [];

let dadosBasePlanilhas = [];
let dadosBaseAtivo = null;
let dadosBasePaginaAtual = 0;
const DADOS_BASE_PAGINA_TAMANHO = 100;
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

// BUSCA CSV COM "RADAR" DE CABEÇALHOS
const buscarCSV = (url) => new Promise((resolve, reject) => {
  if (typeof Papa === 'undefined') return reject("Biblioteca PapaParse não carregada.");
  Papa.parse(obterLinkCSV(url), {
    download: true, 
    worker: true,
    header: false, // Lemos em matriz para varrer o lixo do topo
    skipEmptyLines: true,
    complete: (res) => {
      const data = res.data;
      if (res.errors?.length) return reject(res.errors.map(err => err.message).join("; "));
      if (data.length === 0) return resolve({ headers: [], rows: [] });
      if (data[0] && typeof data[0][0] === 'string' && /<!doctype html|<html/i.test(data[0][0])) {
        return reject("O link não está público. Publique na Web como CSV.");
      }

      // Procura a linha que tem o cabeçalho real (ignora as linhas de título do ERP)
      let headerIndex = 0;
      for (let i = 0; i < Math.min(15, data.length); i++) {
        const rowStr = normalizarTexto(data[i].join(" "));
        if (rowStr.includes("DEPARTAMENTO") || rowStr.includes("CENTRO DE CUSTO") || rowStr.includes("CATEGORIA") || rowStr.includes("VALOR")) {
          headerIndex = i;
          break;
        }
      }

      const headers = data[headerIndex].map(h => (h || "").trim());
      if (!headers.some(Boolean)) return reject("Não encontrei a linha de cabeçalhos na planilha.");
      const formatado = [];

      for (let i = headerIndex + 1; i < data.length; i++) {
        let obj = {};
        data[i].forEach((cell, idx) => { if (headers[idx]) obj[headers[idx]] = cell; });
        formatado.push(obj);
      }
      resolve({ headers, rows: formatado });
    },
    error: (err) => reject(err.message || "Erro ao baixar arquivo.")
  });
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
window.onload = async function() {
  try { await carregarDadosBaseArmazenados(); }
  catch (e) { console.warn('Falha ao abrir Dados Base no IndexedDB.', e); }
  try {
    document.getElementById('header-app-title').innerText = configGlobal.titulo || "Brasil Pontes";
    document.getElementById('login-app-title').innerText = configGlobal.titulo || "Brasil Pontes";

    if (supabaseClient) {
      const { data: config } = await supabaseClient.from('configuracoes').select('*').limit(1).single();
      if (config) { configGlobal.titulo = config.titulo || "Brasil Pontes"; configGlobal.urlRealizado = config.url_realizado || ""; }
      
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
};

function verificarSessao() {
  if (!usuarioAutenticado) {
    document.getElementById('screen-login').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
  } else {
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
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

function abrirAbaSistema(aba) {
  const dashboard = aba === 'dashboard';
  document.getElementById('view-dashboard').classList.toggle('hidden', !dashboard);
  document.getElementById('view-dados-base').classList.toggle('hidden', dashboard);
  document.getElementById('nav-dashboard').className = dashboard ? 'px-4 py-3 border-b-2 border-[#003399] text-[#003399] font-bold text-sm' : 'px-4 py-3 text-gray-500 font-bold text-sm hover:text-[#003399]';
  document.getElementById('nav-dados-base').className = dashboard ? 'px-4 py-3 text-gray-500 font-bold text-sm hover:text-[#003399]' : 'px-4 py-3 border-b-2 border-[#003399] text-[#003399] font-bold text-sm';
  if (!dashboard) renderizarDadosBase();
}

function renderizarDadosBase() {
  const view = document.getElementById('view-dados-base');
  if (view?.classList.contains('hidden')) return;
  const tabs = document.getElementById('dados-base-tabs');
  const conteudo = document.getElementById('dados-base-conteudo');
  const status = document.getElementById('dados-base-status');
  if (!tabs || !conteudo || !status) return;
  tabs.innerHTML = '';
  if (!dadosBasePlanilhas.length) {
    status.innerText = 'Nenhuma planilha importada ainda.';
    conteudo.innerHTML = '<div class="p-8 text-center text-gray-500">Nenhuma planilha importada. Use “Sincronizar Base de Dados” para começar.</div>';
    document.getElementById('dados-base-paginacao').replaceChildren();
    return;
  }
  if (!dadosBasePlanilhas.some(p => p.id === dadosBaseAtivo)) dadosBaseAtivo = dadosBasePlanilhas[0].id;
  dadosBasePlanilhas.forEach(planilha => {
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
  const totalLinhas = ativa?.rows?.length || 0;
  const totalPaginas = Math.max(1, Math.ceil(totalLinhas / DADOS_BASE_PAGINA_TAMANHO));
  dadosBasePaginaAtual = Math.min(dadosBasePaginaAtual, totalPaginas - 1);
  const inicio = dadosBasePaginaAtual * DADOS_BASE_PAGINA_TAMANHO;
  const fim = Math.min(inicio + DADOS_BASE_PAGINA_TAMANHO, totalLinhas);
  status.innerText = `${dadosBasePlanilhas.length} planilha(s) • Última importação: ${ativa?.atualizadoEm ? new Date(ativa.atualizadoEm).toLocaleString('pt-BR') : '—'} • Mostrando ${totalLinhas ? inicio + 1 : 0}–${fim} de ${totalLinhas} linha(s).`;
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
  ativa.headers.forEach(header => { const th = document.createElement('th'); th.className = 'p-3 whitespace-nowrap'; th.textContent = header; trHead.appendChild(th); });
  thead.appendChild(trHead);
  const tbody = document.createElement('tbody');
  tbody.className = 'divide-y divide-gray-200';
  ativa.rows.slice(inicio, fim).forEach(row => {
    const tr = document.createElement('tr');
    ativa.headers.forEach(header => { const td = document.createElement('td'); td.className = 'p-3 whitespace-nowrap'; td.textContent = row[header] ?? ''; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
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

function renderizarFontesRealizado() {
  const container = document.getElementById('fontes-realizado-config');
  if (!container) return;
  container.replaceChildren();
  configGlobal.planilhasRealizado.forEach((fonte, indice) => {
    const linha = document.createElement('div');
    linha.className = 'grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 items-center bg-white p-2 border rounded-lg';
    const nome = document.createElement('input');
    nome.type = 'text'; nome.value = fonte.nome || ''; nome.placeholder = 'Nome para a aba Dados Base';
    nome.className = 'border p-2 rounded-lg'; nome.setAttribute('aria-label', `Nome da planilha ${indice + 1}`);
    nome.oninput = () => { fonte.nome = nome.value; };
    const url = document.createElement('input');
    url.type = 'url'; url.value = fonte.url || ''; url.placeholder = 'Link de compartilhamento do Google Sheets';
    url.className = 'border p-2 rounded-lg'; url.setAttribute('aria-label', `Link da planilha ${indice + 1}`);
    url.oninput = () => { fonte.url = url.value; };
    const remover = document.createElement('button');
    remover.type = 'button'; remover.textContent = 'Remover'; remover.className = 'text-red-600 font-bold px-2 py-1';
    remover.onclick = () => { configGlobal.planilhasRealizado.splice(indice, 1); renderizarFontesRealizado(); };
    linha.append(nome, url, remover); container.appendChild(linha);
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
  const fontesRealizado = (configGlobal.planilhasRealizado || []).filter(f => f.url && f.url.trim());
  if (!fontesRealizado.length && configGlobal.urlRealizado) {
    fontesRealizado.push({ id: "realizado-principal", nome: "Realizado", url: configGlobal.urlRealizado });
  }
  if (!fontesRealizado.length) return alert("Configurações: adicione ao menos uma planilha de Realizado.");
  const btn = document.getElementById('btn-sync');
  if (btn) btn.innerText = "⏳ A Extrair Dados...";

  try {
    const novasBases = [];
    const linhasRealizado = [];
    for (const fonte of fontesRealizado) {
      const extraido = await buscarCSV(fonte.url);
      if (!extraido.rows.length) throw new Error(`A planilha "${fonte.nome}" não contém linhas de dados.`);
      const base = { id: fonte.id || `realizado-${Date.now()}`, nome: fonte.nome || "Realizado", tipo: "Realizado", url: fonte.url, headers: extraido.headers, rows: extraido.rows, atualizadoEm: new Date().toISOString() };
      novasBases.push(base);
      linhasRealizado.push({ fonte: base, rows: extraido.rows });
    }
    
    Object.keys(obrasBD).forEach(k => {
      obrasBD[k].realizadoTotal = 0; obrasBD[k].categoriasRealizado = {};
      obrasBD[k].previstoTotal = 0; obrasBD[k].categoriasPrevisto = {};
    });

    const chaveObraPorDepartamento = new Map();
    Object.entries(obrasBD).forEach(([key, obra]) => {
      if (obra.cc) chaveObraPorDepartamento.set(normalizarTexto(obra.cc), key);
      if (obra.nome) chaveObraPorDepartamento.set(normalizarTexto(obra.nome), key);
    });
    linhasRealizado.forEach(({ fonte, rows }) => rows.forEach(linha => {
      const chaves = Object.keys(linha);
      const chvDepto = chaves.find(k => { const n = normalizarTexto(k); return n.includes("DEPARTAMENTO") || n.includes("CENTRO DE CUSTO") || n === "OBRA"; });
      const deptoOriginal = chvDepto ? (linha[chvDepto] || "").trim() : "";
      
      if (!deptoOriginal || deptoOriginal === "N/D" || deptoOriginal === "0.0") return;
      const deptoID = normalizarTexto(deptoOriginal);

      let chaveObra = chaveObraPorDepartamento.get(deptoID);
      if (!chaveObra) {
        chaveObra = deptoID;
        obrasBD[chaveObra] = { id: deptoID, nome: deptoOriginal, cc: deptoOriginal, responsavel: "Não Atribuído", status: "Ativa", urlPrevistoCSV: "", previstoTotal: 0, realizadoTotal: 0, categoriasPrevisto: {}, categoriasRealizado: {} };
        chaveObraPorDepartamento.set(deptoID, chaveObra);
      }

      const chvVal = chaves.find(k => { const n = normalizarTexto(k); return n.includes("VALOR LIQUIDO") || n.includes("VALOR DA CONTA") || n.includes("VALOR TOTAL") || n.includes("VALOR PAGO") || n.includes("CUSTO TOTAL") || n === "VALOR"; })
        || chaves.find(k => normalizarTexto(k).includes("VALOR"));
      if (!chvVal) throw new Error(`Não encontrei uma coluna de valor na planilha "${fonte.nome}".`);
      const valor = parseMonetario(linha[chvVal]);

      const chvCat = chaves.find(k => normalizarTexto(k).includes("CATEGORIA"));
      const categoria = chvCat ? (linha[chvCat] || "Outros").trim() : "Outros";

      if (obrasBD[chaveObra].status !== "Arquivada") {
        obrasBD[chaveObra].realizadoTotal += valor;
        obrasBD[chaveObra].categoriasRealizado[categoria] = (obrasBD[chaveObra].categoriasRealizado[categoria] || 0) + valor;
      }
    }));

    const promessasPrevisto = Object.keys(obrasBD).map(async (key) => {
      const obra = obrasBD[key];
      if (obra.urlPrevistoCSV && obra.urlPrevistoCSV.trim() !== "") {
        try {
          const basePrevisto = await buscarCSV(obra.urlPrevistoCSV);
          const idBase = `previsto-${key}`;
          novasBases.push({ id: idBase, nome: obra.nome || `Previsto - ${key}`, tipo: "Previsto", url: obra.urlPrevistoCSV, headers: basePrevisto.headers, rows: basePrevisto.rows, atualizadoEm: new Date().toISOString() });
          basePrevisto.rows.forEach(linha => {
            const chvCat = Object.keys(linha).find(k => normalizarTexto(k).includes("CATEGORIA"));
            const catBP = chvCat ? (linha[chvCat] || "Outros").trim() : "Outros";
            
            const chvCst = Object.keys(linha).find(k => { const n = normalizarTexto(k); return n.includes("CUSTO TOTAL") || n.includes("VALOR TOTAL") || n === "VALOR"; }) || Object.keys(linha).find(k => normalizarTexto(k).includes("CUSTO") || normalizarTexto(k).includes("VALOR"));
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
    dadosBasePaginaAtual = 0;
    let errosSupabase = [];
    if (supabaseClient) {
      for (const key in obrasBD) {
        const o = obrasBD[key];
        const dadosJson = { previstoTotal: o.previstoTotal, realizadoTotal: o.realizadoTotal, categoriasPrevisto: o.categoriasPrevisto, categoriasRealizado: o.categoriasRealizado };
        try {
          const { error } = await supabaseClient.from('obras').upsert({ id: o.id, nome: o.nome, cc: o.cc, responsavel: o.responsavel, status: o.status, url_previsto: o.urlPrevistoCSV, dados_json: dadosJson });
          if (error) errosSupabase.push(`${o.nome}: ${error.message}`);
        } catch (error) { errosSupabase.push(`${o.nome}: ${error.message || error}`); }
      }
    }

    popularSeletorObras();
    atualizarDashboard();
    renderizarDadosBase();
    if (errosSupabase.length) alert(`Dados importados e análises atualizadas neste navegador, mas o Supabase recusou parte das gravações:\n${errosSupabase.slice(0, 5).join('\n')}`);
    else if (supabaseClient) alert(`Importação concluída: ${dadosBasePlanilhas.length} planilha(s) e ${linhasRealizado.reduce((n, item) => n + item.rows.length, 0)} linha(s) de Realizado. Resumos sincronizados com o Supabase.`);
    else alert(`Importação concluída: ${dadosBasePlanilhas.length} planilha(s). Os dados e análises foram salvos neste navegador; Supabase indisponível.`);
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
  const chaves = Object.keys(obrasBD).filter(k => obrasBD[k].status !== "Arquivada");
  if (chaves.length === 0) return seletor.innerHTML = `<option value="">Sem dados validados...</option>`;
  chaves.forEach(k => seletor.innerHTML += `<option value="${k}">${obrasBD[k].nome}</option>`);
  if (!obraAtivaID || !obrasBD[obraAtivaID] || obrasBD[obraAtivaID].status === "Arquivada") obraAtivaID = chaves[0];
  seletor.value = obraAtivaID;
}

function alterarObraAtiva(id) { obraAtivaID = id; atualizarDashboard(); }
function aplicarCenario(fator) { multiplicadorCenario = parseFloat(fator); atualizarDashboard(); }

function atualizarDashboard() {
  if (!obraAtivaID || !obrasBD[obraAtivaID]) return;
  const obra = obrasBD[obraAtivaID];

  document.getElementById('obra-titulo').innerText = obra.nome;
  document.getElementById('obra-cc').innerText = obra.cc;
  document.getElementById('obra-resp').innerText = obra.responsavel || "N/A";
  
  const badge = document.getElementById('obra-badge-status');
  badge.innerText = obra.status;
  badge.className = obra.status === "Ativa" ? "bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full" : "bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full";

  const pAj = obra.previstoTotal * multiplicadorCenario;
  const dsv = pAj - obra.realizadoTotal;
  const idc = obra.realizadoTotal > 0 ? (pAj / obra.realizadoTotal).toFixed(2) : "0.00";

  document.getElementById('kpi-previsto').innerText = pAj.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-realizado').innerText = obra.realizadoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-desvio').innerText = (dsv >= 0 ? "+ " : "") + dsv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-idc').innerText = idc;

  const tbody = document.getElementById('tabela-dre-body');
  tbody.innerHTML = '';
  const cats = Array.from(new Set([...Object.keys(obra.categoriasPrevisto || {}), ...Object.keys(obra.categoriasRealizado || {})]));
  let cV = 0, cA = 0, cR = 0;

  cats.forEach(cat => {
    const prev = ((obra.categoriasPrevisto && obra.categoriasPrevisto[cat]) || 0) * multiplicadorCenario;
    const real = (obra.categoriasRealizado && obra.categoriasRealizado[cat]) || 0;
    const saldo = prev - real;
    const percUso = prev > 0 ? (real / prev) * 100 : (real > 0 ? 999 : 0);

    let cls = ''; let txt = ''; let icn = ''; let cor = '';
    if (percUso > 100 || (prev === 0 && real > 0)) { cls = 'bg-red-100 text-red-800 border border-red-200'; txt = prev === 0 ? 'N/P' : 'ESTOURADO'; icn = '🔴'; cor = 'text-red-600'; cR++; }
    else if (percUso >= 85) { cls = 'bg-amber-100 text-amber-800 border border-amber-200'; txt = 'ATENÇÃO'; icn = '🟡'; cor = 'text-amber-600'; cA++; }
    else { cls = 'bg-emerald-100 text-emerald-800 border border-emerald-200'; txt = 'SEGURO'; icn = '🟢'; cor = 'text-emerald-600'; cV++; }

    tbody.innerHTML += `
      <tr class="hover:bg-gray-50 border-b">
        <td class="p-3 font-bold">${cat}</td>
        <td class="p-3 text-right">${prev.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-right">${real.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-center font-bold ${cor}">${percUso === 999 ? "∞" : percUso.toFixed(1) + "%"}</td>
        <td class="p-3 text-right font-black ${cor}">${saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-center"><span class="px-2 py-1 rounded text-[10px] font-black uppercase ${cls}">${icn} ${txt}</span></td>
      </tr>
    `;
  });

  document.getElementById('farol-verde-count').innerText = cV;
  document.getElementById('farol-amarelo-count').innerText = cA;
  document.getElementById('farol-vermelho-count').innerText = cR;
  renderizarGridGraficosDinamicos(obra);
}

function renderizarGridGraficosDinamicos(obra) {
  const container = document.getElementById('grid-graficos-dinamicos');
  container.innerHTML = '';
  Object.keys(graficosInstancias).forEach(id => { if (graficosInstancias[id]) graficosInstancias[id].destroy(); });
  graficosInstancias = {};

  if (typeof Chart === 'undefined') return;

  graficosConfig.forEach(cfg => {
    container.innerHTML += `<div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200"><h3 class="font-bold text-[#003399] mb-4">${cfg.titulo}</h3><div class="relative h-72"><canvas id="${cfg.id}"></canvas></div></div>`;
  });

  setTimeout(() => {
    graficosConfig.forEach(cfg => {
      const ctx = document.getElementById(cfg.id)?.getContext('2d');
      if (!ctx) return;
      const cats = Array.from(new Set([...Object.keys(obra.categoriasPrevisto || {}), ...Object.keys(obra.categoriasRealizado || {})]));
      const prevVals = cats.map(c => ((obra.categoriasPrevisto && obra.categoriasPrevisto[c]) || 0) * multiplicadorCenario);
      const realVals = cats.map(c => (obra.categoriasRealizado && obra.categoriasRealizado[c]) || 0);

      graficosInstancias[cfg.id] = new Chart(ctx, {
        type: cfg.tipo,
        data: { labels: cats.length ? cats : ['-'], datasets: [{ label: 'Previsto', data: prevVals.length ? prevVals : [0], backgroundColor: '#003399' }, { label: 'Realizado', data: realVals.length ? realVals : [0], backgroundColor: '#00CFFF' }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    });
  }, 100);
}

// ==========================================
// MODAIS E CONFIGURAÇÕES
// ==========================================
function abrirModalConfiguracoes() {
  document.getElementById('config-app-title').value = configGlobal.titulo || "";
  if (!configGlobal.planilhasRealizado.length && configGlobal.urlRealizado) {
    configGlobal.planilhasRealizado = [{ id: 'realizado-principal', nome: 'Realizado', url: configGlobal.urlRealizado }];
  }
  renderizarFontesRealizado();
  renderizarTabelaGestaoObras();
  document.getElementById('modal-configuracoes').classList.remove('hidden');
}

function fecharModalConfiguracoes() { document.getElementById('modal-configuracoes').classList.add('hidden'); }

function trocarAbaConfig(aba) {
  ['geral', 'obras', 'graficos'].forEach(a => {
    document.getElementById(`cfg-aba-${a}`).classList.add('hidden');
    document.getElementById(`tab-btn-${a}`).className = "pb-2 text-gray-500 hover:text-[#003399]";
  });
  document.getElementById(`cfg-aba-${aba}`).classList.remove('hidden');
  document.getElementById(`tab-btn-${aba}`).className = "pb-2 border-b-2 border-[#003399] text-[#003399] font-bold";
  if (aba === 'obras') renderizarTabelaGestaoObras();
}

function renderizarTabelaGestaoObras() {
  const tbody = document.getElementById('tabela-gestao-obras-body');
  tbody.innerHTML = '';
  Object.keys(obrasBD).forEach(id => {
    const o = obrasBD[id];
    tbody.innerHTML += `
      <tr>
        <td class="p-2 font-bold text-[10px]">${o.cc}</td>
        <td class="p-2"><input type="text" value="${o.nome}" onchange="atualizarCampoObra('${id}', 'nome', this.value)" class="border p-1 w-full text-xs"></td>
        <td class="p-2"><input type="url" value="${o.urlPrevistoCSV}" onchange="atualizarCampoObra('${id}', 'urlPrevistoCSV', this.value)" class="border p-1 w-full text-[10px]" placeholder="URL Previsto CSV"></td>
        <td class="p-2 text-center">
          <button onclick="alternarStatusArquivado('${id}')" class="bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-bold">${o.status === 'Ativa' ? 'Arquivar' : 'Reativar'}</button>
        </td>
      </tr>
    `;
  });
}

async function atualizarCampoObra(id, campo, valor) {
  if (obrasBD[id]) {
    obrasBD[id][campo] = valor;
    localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
    if (supabaseClient) { try { await supabaseClient.from('obras').update({ [campo === 'urlPrevistoCSV' ? 'url_previsto' : campo]: valor }).eq('id', id); } catch(e){} }
  }
}

async function alternarStatusArquivado(id) {
  if (obrasBD[id]) {
    obrasBD[id].status = obrasBD[id].status === 'Ativa' ? 'Arquivada' : 'Ativa';
    localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
    if(supabaseClient) { try { await supabaseClient.from('obras').update({ status: obrasBD[id].status }).eq('id', id); } catch(e){} }
    popularSeletorObras(); renderizarTabelaGestaoObras(); atualizarDashboard();
  }
}

function adicionarNovoGrafico() {
  const titulo = document.getElementById('novo-chart-titulo').value.trim();
  const tipo = document.getElementById('novo-chart-tipo').value;
  const metrica = document.getElementById('novo-chart-metrica').value;
  if (!titulo) return alert("Digite o título.");
  graficosConfig.push({ id: `chart_custom_${Date.now()}`, titulo, tipo, metrica });
  document.getElementById('novo-chart-titulo').value = '';
  renderizarListaGraficosConfig();
}
function removerGrafico(id) { graficosConfig = graficosConfig.filter(g => g.id !== id); renderizarListaGraficosConfig(); }
function renderizarListaGraficosConfig() {
  const div = document.getElementById('lista-graficos-config'); div.innerHTML = '';
  graficosConfig.forEach(g => { div.innerHTML += `<div class="flex justify-between items-center bg-white p-2 border rounded text-xs"><div><strong>${g.titulo}</strong></div><button type="button" onclick="removerGrafico('${g.id}')" class="text-red-600 font-bold">Remover</button></div>`; });
}

async function salvarConfiguracoesGerais() {
  configGlobal.titulo = document.getElementById('config-app-title').value.trim();
  configGlobal.planilhasRealizado = configGlobal.planilhasRealizado.filter(f => f.nome?.trim() && f.url?.trim()).map(f => ({ ...f, nome: f.nome.trim(), url: f.url.trim() }));
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
  document.getElementById('user-display-name').innerText = usuarioAutenticado.nome;
  document.getElementById('user-display-role').innerText = usuarioAutenticado.perfil;
  document.getElementById('btn-gestao-usuarios').style.display = usuarioAutenticado.perfil === "Mestre" ? "block" : "none";
  document.getElementById('btn-configuracoes').style.display = usuarioAutenticado.perfil === "Mestre" ? "block" : "none";
}

function abrirModalUsuarios() { renderizarPainelUsuarios(); document.getElementById('modal-usuarios').classList.remove('hidden'); }
function fecharModalUsuarios() { document.getElementById('modal-usuarios').classList.add('hidden'); }

async function criarUsuarioDireto() {
  const nome = document.getElementById('novo-usr-nome').value.trim();
  const email = document.getElementById('novo-usr-email').value.trim();
  const usuario = document.getElementById('novo-usr-login').value.trim();
  const senha = document.getElementById('novo-usr-senha').value.trim();
  const perfil = document.getElementById('novo-usr-perfil').value;

  if (!nome || !email || !usuario || !senha) return alert("Preencha todos os campos.");
  
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('usuarios').insert([{ nome, email, usuario, senha, perfil, status: 'Aprovado' }]).select();
      if (!error && data) usuariosBD.push(data[0]);
    } catch(e) {}
  } else {
    usuariosBD.push({ id: Date.now().toString(), nome, email, usuario, senha, perfil, status: "Aprovado" });
  }
  renderizarPainelUsuarios(); alert("Usuário registado!");
}

async function solicitarCadastro(e) {
  if (e) e.preventDefault();
  const nome = document.getElementById('solic-nome').value.trim();
  const email = document.getElementById('solic-email').value.trim();
  const usuario = document.getElementById('solic-usuario').value.trim();
  const senha = document.getElementById('solic-senha').value.trim();
  if (!nome || !email || !usuario || !senha) return alert("Preencha os campos.");
  
  if (supabaseClient) { try { await supabaseClient.from('usuarios').insert([{ nome, email, usuario, senha, perfil: "Engenheiro", status: "Pendente" }]); } catch(e){} }
  else { solicitacoesPendentesBD.push({ id: Date.now().toString(), nome, email, usuario, senha, perfil: "Engenheiro", status: "Pendente" }); }
  
  exibirFormLogin(); alert("Solicitação registada!");
}

async function aprovarSolicitacao(id) {
  if (supabaseClient) { try { await supabaseClient.from('usuarios').update({ status: 'Aprovado' }).eq('id', id); await carregarDadosIniciaisBanco(); } catch(e) {} }
  else {
    const i = solicitacoesPendentesBD.findIndex(s=>s.id === id);
    if(i>-1) { solicitacoesPendentesBD[i].status = "Aprovado"; usuariosBD.push(solicitacoesPendentesBD[i]); solicitacoesPendentesBD.splice(i,1); }
  }
  renderizarPainelUsuarios();
}

function renderizarPainelUsuarios() {
  const tbodyPend = document.getElementById('tabela-pendentes-body');
  document.getElementById('count-pendentes').innerText = solicitacoesPendentesBD.length;
  tbodyPend.innerHTML = solicitacoesPendentesBD.length === 0 ? `<tr><td colspan="4" class="p-3 text-center text-gray-400">Nenhuma solicitação pendente.</td></tr>` : '';
  solicitacoesPendentesBD.forEach(s => {
    tbodyPend.innerHTML += `<tr><td class="p-2 font-bold">${s.nome}</td><td class="p-2">${s.usuario}</td><td class="p-2"><button onclick="aprovarSolicitacao('${s.id}')" class="bg-emerald-600 text-white px-2 py-1 rounded text-[10px]">Aprovar</button></td></tr>`;
  });

  const tbodyAtivos = document.getElementById('tabela-usuarios-body');
  tbodyAtivos.innerHTML = '';
  usuariosBD.forEach(u => {
    tbodyAtivos.innerHTML += `<tr><td class="p-2 font-bold">${u.nome}</td><td class="p-2 text-gray-500">${u.usuario}</td><td class="p-2 text-[10px] font-bold">${u.perfil}</td><td class="p-2 text-emerald-600 font-bold">● Ativo</td></tr>`;
  });
}
