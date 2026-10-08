// ==========================================
// CONFIGURAÇÃO DO SUPABASE (BANCO DE DADOS)
// ==========================================
// Credenciais exatas fornecidas para ligação do frontend
const SUPABASE_URL = 'https://dgolbcuhjruncildelth.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_xAc46P9gmgmzMyKIyl9OJA__9MoyMFK';

// Inicializar cliente do Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// VARIÁVEIS DE ESTADO E MEMÓRIA DO SISTEMA
// ==========================================
let usuariosBD = [];
let solicitacoesPendentesBD = [];
let configGlobal = { titulo: "Brasil Pontes", urlRealizado: "" };
let obrasBD = {};

let graficosConfig = [
  { id: "chart_categoria_comp", titulo: "Comparativo Previsto x Realizado por Categoria BP", tipo: "bar", metrica: "categoria" },
  { id: "chart_curva_s", titulo: "Evolução do Desempenho Orçamentário", tipo: "line", metrica: "curvaS" }
];
let graficosInstancias = {};
let usuarioAutenticado = null;
let obraAtivaID = null;
let multiplicadorCenario = 1;

// ==========================================
// FUNÇÕES UTILITÁRIAS (LEITURA CSV DO GOOGLE SHEETS)
// ==========================================
function obterLinkCSV(url) {
  if (!url) return "";
  if (url.includes("/pub?output=csv")) return url;
  if (url.includes("/edit") || url.includes("usp=")) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
    }
  }
  return url;
}

const buscarCSV = (url) => new Promise((resolve, reject) => {
  Papa.parse(obterLinkCSV(url), {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      if (results.data.length > 0 && Object.keys(results.data[0]).some(key => key && key.toLowerCase().includes("<!doctype html>"))) {
        reject("Bloqueado: Planilha não está Pública como CSV.");
      } else {
        resolve(results.data);
      }
    },
    error: (err) => reject(err)
  });
});

// ==========================================
// INICIALIZAÇÃO, CARREGAMENTO E SESSÃO
// ==========================================
window.onload = async function() {
  await carregarDadosIniciaisBanco();
  
  const sessaoSalva = localStorage.getItem('usuario_bp_id');
  if (sessaoSalva) {
    usuarioAutenticado = usuariosBD.find(u => u.id === sessaoSalva);
  }
  verificarSessao();
};

async function carregarDadosIniciaisBanco() {
  try {
    // 1. Carregar Configurações Globais
    const { data: config, error: errCfg } = await supabase.from('configuracoes').select('*').limit(1).single();
    if (config) {
      configGlobal.titulo = config.titulo || "Brasil Pontes";
      configGlobal.urlRealizado = config.url_realizado || "";
    } else if (errCfg && errCfg.code === 'PGRST116') {
      // Se não existir na base de dados, criar por defeito
      await supabase.from('configuracoes').insert([{ titulo: 'Brasil Pontes', url_realizado: '' }]);
    }
    document.getElementById('header-app-title').innerText = configGlobal.titulo;
    document.getElementById('login-app-title').innerText = configGlobal.titulo;

    // 2. Carregar Utilizadores
    const { data: users } = await supabase.from('usuarios').select('*');
    if (users) {
      usuariosBD = users.filter(u => u.status === 'Aprovado');
      solicitacoesPendentesBD = users.filter(u => u.status === 'Pendente');
    }

    // 3. Carregar Obras
    const { data: obras } = await supabase.from('obras').select('*');
    if (obras) {
      obras.forEach(o => {
        obrasBD[o.id] = {
          id: o.id, nome: o.nome, cc: o.cc, responsavel: o.responsavel, status: o.status, urlPrevistoCSV: o.url_previsto,
          previstoTotal: o.dados_json?.previstoTotal || 0,
          realizadoTotal: o.dados_json?.realizadoTotal || 0,
          categoriasPrevisto: o.dados_json?.categoriasPrevisto || {},
          categoriasRealizado: o.dados_json?.categoriasRealizado || {}
        };
      });
    }
  } catch (error) {
    console.error("Erro na leitura do banco:", error);
  }
}

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

// LOGIN E SOLICITAÇÕES
async function executarLogin() {
  const inputUser = document.getElementById('login-usuario').value.trim();
  const inputSenha = document.getElementById('login-senha').value.trim();

  if (!inputUser || !inputSenha) return alert("Preencha utilizador e palavra-passe.");
  
  // Validação assíncrona na base de dados
  const { data: user, error } = await supabase.from('usuarios')
    .select('*')
    .or(`usuario.eq.${inputUser},email.eq.${inputUser}`)
    .eq('senha', inputSenha)
    .single();

  if (user) {
    if (user.status === "Aprovado") {
      usuarioAutenticado = user;
      localStorage.setItem('usuario_bp_id', user.id);
      verificarSessao();
    } else {
      alert("Acesso pendente de aprovação pelo Mestre.");
    }
  } else {
    alert("Utilizador ou palavra-passe incorretos.");
  }
}

function executarLogout() {
  usuarioAutenticado = null;
  localStorage.removeItem('usuario_bp_id');
  verificarSessao();
}

function exibirFormSolicitacao() {
  document.getElementById('box-login').classList.add('hidden');
  document.getElementById('box-solicitacao').classList.remove('hidden');
}

function exibirFormLogin() {
  document.getElementById('box-solicitacao').classList.add('hidden');
  document.getElementById('box-login').classList.remove('hidden');
}

// ==========================================
// MOTOR DE SINCRONIZAÇÃO (SHEETS -> SUPABASE)
// ==========================================
async function sincronizarTodasPlanilhas() {
  if (!configGlobal.urlRealizado) return alert("Configure o Link do Realizado no Menu de Configurações.");
  
  const btn = document.getElementById('btn-sync');
  if (btn) btn.innerText = "⏳ A Processar e Sincronizar BD...";

  try {
    const dadosRealizado = await buscarCSV(configGlobal.urlRealizado);
    
    // Resetar somatórios em memória para recálculo
    Object.keys(obrasBD).forEach(k => {
      obrasBD[k].realizadoTotal = 0; obrasBD[k].categoriasRealizado = {};
      obrasBD[k].previstoTotal = 0; obrasBD[k].categoriasPrevisto = {};
    });

    dadosRealizado.forEach(linha => {
      const chaveDepto = Object.keys(linha).find(k => k.trim().toUpperCase().includes("DEPARTAMENTO") || k.trim().toUpperCase().includes("CENTRO DE CUSTO"));
      const deptoOriginal = chaveDepto ? (linha[chaveDepto] || "").trim() : "";
      
      if (!deptoOriginal || deptoOriginal === "N/D" || deptoOriginal === "0.0") return;
      const deptoID = deptoOriginal.toUpperCase();

      if (!obrasBD[deptoID]) {
        obrasBD[deptoID] = { id: deptoID, nome: deptoOriginal, cc: deptoOriginal, responsavel: "Não Atribuído", status: "Ativa", urlPrevistoCSV: "", previstoTotal: 0, realizadoTotal: 0, categoriasPrevisto: {}, categoriasRealizado: {} };
      }

      const chaveValor = Object.keys(linha).find(k => k.trim().toUpperCase().includes("VALOR LÍQUIDO") || k.trim().toUpperCase().includes("VALOR DA CONTA"));
      let valor = Math.abs(parseFloat(String(linha[chaveValor] || "0").replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0);

      const chaveCategoria = Object.keys(linha).find(k => k.trim().toUpperCase() === "CATEGORIA");
      const categoria = chaveCategoria ? (linha[chaveCategoria] || "Outros").trim() : "Outros";

      if (obrasBD[deptoID].status !== "Arquivada") {
        obrasBD[deptoID].realizadoTotal += valor;
        obrasBD[deptoID].categoriasRealizado[categoria] = (obrasBD[deptoID].categoriasRealizado[categoria] || 0) + valor;
      }
    });

    // Puxar links de orçamentos previstos das Obras
    const promessasPrevisto = Object.keys(obrasBD).map(async (key) => {
      const obra = obrasBD[key];
      if (obra.urlPrevistoCSV && obra.urlPrevistoCSV.trim() !== "") {
        try {
          const dadosPrevisto = await buscarCSV(obra.urlPrevistoCSV);
          dadosPrevisto.forEach(linha => {
            const chaveCat = Object.keys(linha).find(k => k.trim().toUpperCase() === "CATEGORIA BP" || k.trim().toUpperCase() === "NATUREZA/GRUPO");
            const catBP = chaveCat ? (linha[chaveCat] || "Outros").trim() : "Outros";
            
            const chaveCusto = Object.keys(linha).find(k => k.trim().toUpperCase().includes("CUSTO TOTAL"));
            let custoTotal = parseFloat(String(linha[chaveCusto] || "0").replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0;
            
            obra.categoriasPrevisto[catBP] = (obra.categoriasPrevisto[catBP] || 0) + custoTotal;
          });
          obra.previstoTotal = Object.values(obra.categoriasPrevisto).reduce((a, b) => a + b, 0);
        } catch(err) { console.warn(`Aviso: Erro a ler Previsto da obra ${obra.nome}.`, err); }
      }
    });

    await Promise.all(promessasPrevisto);

    // Guardar tudo permanentemente no Supabase
    for (const key in obrasBD) {
      const o = obrasBD[key];
      const dadosJson = { previstoTotal: o.previstoTotal, realizadoTotal: o.realizadoTotal, categoriasPrevisto: o.categoriasPrevisto, categoriasRealizado: o.categoriasRealizado };
      await supabase.from('obras').upsert({ id: o.id, nome: o.nome, cc: o.cc, responsavel: o.responsavel, status: o.status, url_previsto: o.urlPrevistoCSV, dados_json: dadosJson });
    }

    popularSeletorObras();
    atualizarDashboard();

  } catch (error) {
    alert("Erro na leitura de ficheiros. Verifique os links de partilha e o formato da planilha (CSV/Pub). Detalhes: " + error);
  } finally {
    if (btn) btn.innerHTML = "🔄 Sincronizar Base de Dados";
  }
}

// ==========================================
// DASHBOARD E FAROL DE DESEMPENHO
// ==========================================
function popularSeletorObras() {
  const seletor = document.getElementById('seletor-obra');
  seletor.innerHTML = '';
  const chaves = Object.keys(obrasBD).filter(k => obrasBD[k].status !== "Arquivada");
  if (chaves.length === 0) return seletor.innerHTML = `<option value="">A aguardar sincronização...</option>`;
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
  document.getElementById('obra-resp').innerText = obra.responsavel;
  
  const badge = document.getElementById('obra-badge-status');
  badge.innerText = obra.status;
  badge.className = obra.status === "Ativa" ? "bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full" : "bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full";

  const prevAjustado = obra.previstoTotal * multiplicadorCenario;
  const desvio = prevAjustado - obra.realizadoTotal;
  const idc = obra.realizadoTotal > 0 ? (prevAjustado / obra.realizadoTotal).toFixed(2) : "0.00";

  document.getElementById('kpi-previsto').innerText = prevAjustado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-realizado').innerText = obra.realizadoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-desvio').innerText = (desvio >= 0 ? "+ " : "") + desvio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-idc').innerText = idc;

  // Renderizar Tabela e Farol
  const tbody = document.getElementById('tabela-dre-body');
  tbody.innerHTML = '';
  const cats = Array.from(new Set([...Object.keys(obra.categoriasPrevisto || {}), ...Object.keys(obra.categoriasRealizado || {})]));
  let countVerde = 0; let countAmarelo = 0; let countVermelho = 0;

  cats.forEach(cat => {
    const prev = ((obra.categoriasPrevisto && obra.categoriasPrevisto[cat]) || 0) * multiplicadorCenario;
    const real = (obra.categoriasRealizado && obra.categoriasRealizado[cat]) || 0;
    const saldo = prev - real;
    const percUso = prev > 0 ? (real / prev) * 100 : (real > 0 ? 999 : 0);

    let cls = ''; let txt = ''; let icn = ''; let cor = '';
    if (percUso > 100 || (prev === 0 && real > 0)) { cls = 'bg-red-100 text-red-800 border border-red-200'; txt = prev === 0 ? 'NÃO PREVISTO' : 'ESTOURADO'; icn = '🔴'; cor = 'text-red-600'; countVermelho++; }
    else if (percUso >= 85) { cls = 'bg-amber-100 text-amber-800 border border-amber-200'; txt = 'ATENÇÃO'; icn = '🟡'; cor = 'text-amber-600'; countAmarelo++; }
    else { cls = 'bg-emerald-100 text-emerald-800 border border-emerald-200'; txt = 'SEGURO'; icn = '🟢'; cor = 'text-emerald-600'; countVerde++; }

    tbody.innerHTML += `
      <tr class="hover:bg-gray-50">
        <td class="p-3 text-bp-blue font-bold">${cat}</td>
        <td class="p-3 text-right">${prev.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-right">${real.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-center font-bold ${cor}">${percUso === 999 ? "∞" : percUso.toFixed(1) + "%"}</td>
        <td class="p-3 text-right font-black ${cor}">${(saldo >= 0 ? "+ " : "") + saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-center"><span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 ${cls}">${icn} ${txt}</span></td>
      </tr>
    `;
  });

  document.getElementById('farol-verde-count').innerText = countVerde;
  document.getElementById('farol-amarelo-count').innerText = countAmarelo;
  document.getElementById('farol-vermelho-count').innerText = countVermelho;

  renderizarGridGraficosDinamicos(obra);
}

// ==========================================
// RENDERIZAÇÃO DE GRÁFICOS
// ==========================================
function renderizarGridGraficosDinamicos(obra) {
  const container = document.getElementById('grid-graficos-dinamicos');
  container.innerHTML = '';
  Object.keys(graficosInstancias).forEach(id => { if (graficosInstancias[id]) graficosInstancias[id].destroy(); });
  graficosInstancias = {};

  graficosConfig.forEach(cfg => {
    container.innerHTML += `<div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200"><h3 class="font-bold text-bp-blue text-base mb-4">${cfg.titulo}</h3><div class="relative h-72"><canvas id="${cfg.id}"></canvas></div></div>`;
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
        data: { labels: cats.length ? cats : ['Sem dados'], datasets: [{ label: 'Previsto (R$)', data: prevVals.length ? prevVals : [0], backgroundColor: '#003399' }, { label: 'Realizado (R$)', data: realVals.length ? realVals : [0], backgroundColor: '#00CFFF' }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    });
  }, 100);
}

// ==========================================
// CONFIGURAÇÕES GERAIS E OBRAS
// ==========================================
function abrirModalConfiguracoes() {
  document.getElementById('config-app-title').value = configGlobal.titulo;
  document.getElementById('config-url-unificada').value = configGlobal.urlRealizado || "";
  renderizarTabelaGestaoObras();
  renderizarListaGraficosConfig();
  document.getElementById('modal-configuracoes').classList.remove('hidden');
}

function fecharModalConfiguracoes() { document.getElementById('modal-configuracoes').classList.add('hidden'); }

function trocarAbaConfig(aba) {
  ['geral', 'obras', 'graficos'].forEach(a => {
    document.getElementById(`cfg-aba-${a}`).classList.add('hidden');
    document.getElementById(`tab-btn-${a}`).className = "pb-2 text-gray-500 hover:text-bp-blue";
  });
  document.getElementById(`cfg-aba-${aba}`).classList.remove('hidden');
  document.getElementById(`tab-btn-${aba}`).className = "pb-2 border-b-2 border-bp-blue text-bp-blue font-bold";
  if (aba === 'obras') renderizarTabelaGestaoObras();
}

function renderizarTabelaGestaoObras() {
  const tbody = document.getElementById('tabela-gestao-obras-body');
  tbody.innerHTML = '';
  if(Object.keys(obrasBD).length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-gray-400">Nenhuma obra na base. Execute a Sincronização de Dados.</td></tr>`; }

  Object.keys(obrasBD).forEach(id => {
    const o = obrasBD[id];
    tbody.innerHTML += `
      <tr>
        <td class="p-2 font-bold text-gray-600">${o.cc}</td>
        <td class="p-2"><input type="text" value="${o.nome}" onchange="atualizarCampoObra('${id}', 'nome', this.value)" class="border p-1 w-full"></td>
        <td class="p-2"><input type="url" value="${o.urlPrevistoCSV}" onchange="atualizarCampoObra('${id}', 'urlPrevistoCSV', this.value)" class="border p-1 w-full text-[10px]"></td>
        <td class="p-2 text-center space-x-1">
          <button onclick="alternarStatusArquivado('${id}')" class="bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-bold">${o.status === 'Ativa' ? 'Arquivar' : 'Reativar'}</button>
        </td>
      </tr>
    `;
  });
}

async function atualizarCampoObra(id, campo, valor) {
  if (obrasBD[id]) {
    obrasBD[id][campo] = valor;
    await supabase.from('obras').update({ [campo === 'urlPrevistoCSV' ? 'url_previsto' : campo]: valor }).eq('id', id);
  }
}

async function alternarStatusArquivado(id) {
  if (obrasBD[id]) {
    obrasBD[id].status = obrasBD[id].status === 'Ativa' ? 'Arquivada' : 'Ativa';
    await supabase.from('obras').update({ status: obrasBD[id].status }).eq('id', id);
    popularSeletorObras(); renderizarTabelaGestaoObras(); atualizarDashboard();
  }
}

// GRÁFICOS PERSONALIZADOS
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
  graficosConfig.forEach(g => {
    div.innerHTML += `<div class="flex justify-between items-center bg-white p-2 border rounded text-xs"><div><strong class="text-bp-blue">${g.titulo}</strong> (${g.tipo.toUpperCase()})</div><button type="button" onclick="removerGrafico('${g.id}')" class="text-red-600 font-bold hover:underline">Remover</button></div>`;
  });
}

async function salvarConfiguracoesGerais() {
  configGlobal.titulo = document.getElementById('config-app-title').value.trim();
  configGlobal.urlRealizado = document.getElementById('config-url-unificada').value.trim();
  
  // Guardar no Supabase
  const { error } = await supabase.from('configuracoes').update({ titulo: configGlobal.titulo, url_realizado: configGlobal.urlRealizado }).eq('id', 1);
  
  if (error) console.error("Erro a guardar configurações", error);
  document.getElementById('header-app-title').innerText = configGlobal.titulo;
  
  fecharModalConfiguracoes();
  if (confirm("Configurações salvas. Sincronizar dados agora para aplicar o link?")) sincronizarTodasPlanilhas();
}

// ==========================================
// GESTÃO DE USUÁRIOS E PERMISSÕES (SUPABASE)
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
  
  const { data, error } = await supabase.from('usuarios').insert([{ nome, email, usuario, senha, perfil, status: 'Aprovado' }]).select();
  if (error) return alert("Erro: O utilizador ou email já existe.");
  
  usuariosBD.push(data[0]);
  renderizarPainelUsuarios();
  alert(`Usuário ${usuario} registado na base de dados!`);
}

async function solicitarCadastro() {
  const nome = document.getElementById('solic-nome').value.trim();
  const email = document.getElementById('solic-email').value.trim();
  const usuario = document.getElementById('solic-usuario').value.trim();
  const senha = document.getElementById('solic-senha').value.trim();

  if (!nome || !email || !usuario || !senha) return alert("Preencha os campos.");
  const { error } = await supabase.from('usuarios').insert([{ nome, email, usuario, senha, perfil: "Engenheiro", status: "Pendente" }]);
  if (error) return alert("Erro no registo, tente outro login/email.");
  
  exibirFormLogin(); alert("Solicitação registada e enviada para o banco Supabase!");
}

async function aprovarSolicitacao(id) {
  await supabase.from('usuarios').update({ status: 'Aprovado' }).eq('id', id);
  await carregarDadosIniciaisBanco();
  renderizarPainelUsuarios();
}

function renderizarPainelUsuarios() {
  const tbodyPend = document.getElementById('tabela-pendentes-body');
  document.getElementById('count-pendentes').innerText = solicitacoesPendentesBD.length;
  tbodyPend.innerHTML = solicitacoesPendentesBD.length === 0 ? `<tr><td colspan="4" class="p-3 text-center text-gray-400">Nenhuma solicitação.</td></tr>` : '';
  solicitacoesPendentesBD.forEach(s => {
    tbodyPend.innerHTML += `<tr><td class="p-2 font-bold">${s.nome}</td><td class="p-2">${s.usuario}</td><td class="p-2 text-center"><button onclick="aprovarSolicitacao('${s.id}')" class="bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold">Aprovar</button></td></tr>`;
  });

  const tbodyAtivos = document.getElementById('tabela-usuarios-body');
  tbodyAtivos.innerHTML = '';
  usuariosBD.forEach(u => {
    tbodyAtivos.innerHTML += `<tr><td class="p-2 font-bold">${u.nome}</td><td class="p-2 text-gray-500">${u.usuario} (${u.email})</td><td class="p-2"><span class="bg-bp-blue text-white px-2 py-0.5 rounded text-[10px] font-bold">${u.perfil}</span></td><td class="p-2 text-center"><span class="text-emerald-600 font-bold">● Ativo</span></td></tr>`;
  });
}
