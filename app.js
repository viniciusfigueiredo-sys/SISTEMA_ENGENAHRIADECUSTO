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

let configGlobal = { titulo: "Brasil Pontes", urlRealizado: "" };
try { const cfg = localStorage.getItem('config_bp'); if (cfg && cfg !== "undefined") configGlobal = JSON.parse(cfg); } catch(e){}

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
    if (match && match[1]) return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
  }
  return url;
}

// FORMATADOR UNIVERSAL DE DINHEIRO (Aceita US e BR)
function parseMonetario(valorStr) {
  if (!valorStr) return 0;
  let str = String(valorStr).replace(/[R$\s]/g, '').trim(); // Remove R$ e espaços
  let lastComma = str.lastIndexOf(',');
  let lastDot = str.lastIndexOf('.');
  
  if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.'); // Formato BR: 1.000,00 -> 1000.00
  } else {
      str = str.replace(/,/g, ''); // Formato US: 1,000.00 -> 1000.00
  }
  return Math.abs(parseFloat(str) || 0); // Puxa valor absoluto para abater gastos
}

// BUSCA CSV COM "RADAR" DE CABEÇALHOS
const buscarCSV = (url) => new Promise((resolve, reject) => {
  if (typeof Papa === 'undefined') return reject("Biblioteca PapaParse não carregada.");
  Papa.parse(obterLinkCSV(url), {
    download: true, 
    header: false, // Lemos em matriz para varrer o lixo do topo
    skipEmptyLines: true,
    complete: (res) => {
      const data = res.data;
      if (data.length === 0) return resolve([]);
      if (data[0] && typeof data[0][0] === 'string' && data[0][0].toLowerCase().includes("<!doctype html>")) {
        return reject("O link não está público. Publique na Web como CSV.");
      }

      // Procura a linha que tem o cabeçalho real (ignora as linhas de título do ERP)
      let headerIndex = 0;
      for (let i = 0; i < Math.min(15, data.length); i++) {
        const rowStr = data[i].join("").toUpperCase();
        if (rowStr.includes("DEPARTAMENTO") || rowStr.includes("CATEGORIA") || rowStr.includes("VALOR")) {
          headerIndex = i;
          break;
        }
      }

      const headers = data[headerIndex].map(h => (h || "").trim());
      const formatado = [];

      for (let i = headerIndex + 1; i < data.length; i++) {
        let obj = {};
        data[i].forEach((cell, idx) => { if (headers[idx]) obj[headers[idx]] = cell; });
        formatado.push(obj);
      }
      resolve(formatado);
    },
    error: (err) => reject(err.message || "Erro ao baixar arquivo.")
  });
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
window.onload = async function() {
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
function exibirFormSolicitacao() { document.getElementById('form-login').classList.add('hidden'); document.getElementById('form-solicitacao').classList.remove('hidden'); }
function exibirFormLogin() { document.getElementById('form-solicitacao').classList.add('hidden'); document.getElementById('form-login').classList.remove('hidden'); }

// ==========================================
// MOTOR DE SINCRONIZAÇÃO MATEMÁTICA
// ==========================================
async function sincronizarTodasPlanilhas() {
  if (!configGlobal.urlRealizado) return alert("Menu Configurações: Adicione o Link do Realizado.");
  const btn = document.getElementById('btn-sync');
  if (btn) btn.innerText = "⏳ A Extrair Dados...";

  try {
    const dadosRealizado = await buscarCSV(configGlobal.urlRealizado);
    
    Object.keys(obrasBD).forEach(k => {
      obrasBD[k].realizadoTotal = 0; obrasBD[k].categoriasRealizado = {};
      obrasBD[k].previstoTotal = 0; obrasBD[k].categoriasPrevisto = {};
    });

    dadosRealizado.forEach(linha => {
      const chvDepto = Object.keys(linha).find(k => k.toUpperCase().includes("DEPARTAMENTO") || k.toUpperCase().includes("CENTRO DE CUSTO"));
      const deptoOriginal = chvDepto ? (linha[chvDepto] || "").trim() : "";
      
      if (!deptoOriginal || deptoOriginal === "N/D" || deptoOriginal === "0.0") return;
      const deptoID = deptoOriginal.toUpperCase();

      if (!obrasBD[deptoID]) {
        obrasBD[deptoID] = { id: deptoID, nome: deptoOriginal, cc: deptoOriginal, responsavel: "Não Atribuído", status: "Ativa", urlPrevistoCSV: "", previstoTotal: 0, realizadoTotal: 0, categoriasPrevisto: {}, categoriasRealizado: {} };
      }

      // Procura a coluna de Valor e aplica o Parse Monetário Inteligente
      const chvVal = Object.keys(linha).find(k => k.toUpperCase().includes("VALOR LÍQUIDO") || k.toUpperCase().includes("VALOR DA CONTA"));
      let valor = parseMonetario(linha[chvVal]);

      const chvCat = Object.keys(linha).find(k => k.toUpperCase() === "CATEGORIA");
      const categoria = chvCat ? (linha[chvCat] || "Outros").trim() : "Outros";

      if (obrasBD[deptoID].status !== "Arquivada") {
        obrasBD[deptoID].realizadoTotal += valor;
        obrasBD[deptoID].categoriasRealizado[categoria] = (obrasBD[deptoID].categoriasRealizado[categoria] || 0) + valor;
      }
    });

    const promessasPrevisto = Object.keys(obrasBD).map(async (key) => {
      const obra = obrasBD[key];
      if (obra.urlPrevistoCSV && obra.urlPrevistoCSV.trim() !== "") {
        try {
          const dP = await buscarCSV(obra.urlPrevistoCSV);
          dP.forEach(linha => {
            const chvCat = Object.keys(linha).find(k => k.toUpperCase().includes("CATEGORIA"));
            const catBP = chvCat ? (linha[chvCat] || "Outros").trim() : "Outros";
            
            const chvCst = Object.keys(linha).find(k => k.toUpperCase().includes("CUSTO TOTAL") || k.toUpperCase().includes("VALOR"));
            let custo = parseMonetario(linha[chvCst]);
            
            obra.categoriasPrevisto[catBP] = (obra.categoriasPrevisto[catBP] || 0) + custo;
          });
          obra.previstoTotal = Object.values(obra.categoriasPrevisto).reduce((a, b) => a + b, 0);
        } catch(err) { console.warn(`Aviso Previsto - ${obra.nome}`); }
      }
    });

    await Promise.all(promessasPrevisto);

    if (supabaseClient) {
      for (const key in obrasBD) {
        const o = obrasBD[key];
        const dadosJson = { previstoTotal: o.previstoTotal, realizadoTotal: o.realizadoTotal, categoriasPrevisto: o.categoriasPrevisto, categoriasRealizado: o.categoriasRealizado };
        try { await supabaseClient.from('obras').upsert({ id: o.id, nome: o.nome, cc: o.cc, responsavel: o.responsavel, status: o.status, url_previsto: o.urlPrevistoCSV, dados_json: dadosJson }); } catch(e){}
      }
    }

    localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
    popularSeletorObras();
    atualizarDashboard();
  } catch (error) {
    alert("Falha na sincronização dos dados.\nMotivo: " + error);
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
  document.getElementById('config-url-unificada').value = configGlobal.urlRealizado || "";
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
  configGlobal.urlRealizado = document.getElementById('config-url-unificada').value.trim();
  localStorage.setItem('config_bp', JSON.stringify(configGlobal));
  if(supabaseClient) { try { await supabaseClient.from('configuracoes').upsert({ id: 1, titulo: configGlobal.titulo, url_realizado: configGlobal.urlRealizado }); } catch(e) {} }
  document.getElementById('header-app-title').innerText = configGlobal.titulo;
  fecharModalConfiguracoes();
  if (confirm("Salvo. Sincronizar dados agora?")) sincronizarTodasPlanilhas();
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
