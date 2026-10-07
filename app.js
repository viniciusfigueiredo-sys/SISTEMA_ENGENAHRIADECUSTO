// ==========================================
// ESTADOS E BANCO DE DADOS LOCAL (MEMÓRIA)
// ==========================================
let usuariosBD = [
  { nome: "Vinícius Souza (Mestre)", usuario: "vinicius_souzaf", email: "mestre@brasilpontes.com.br", senha: "741852963", perfil: "Mestre", status: "Aprovado" }
];
let solicitacoesPendentesBD = [];

// Obter configurações globais e obras do LocalStorage
let configGlobal = JSON.parse(localStorage.getItem('config_bp')) || {
  titulo: "Brasil Pontes",
  urlRealizado: "https://docs.google.com/spreadsheets/d/1S41dXyTC2Y_SJjD3iw86WaUqi0OWNxyf/export?format=csv"
};

// Obras mantidas em cache (mantém as URLs do Previsto configuradas pelo utilizador)
let obrasBD = JSON.parse(localStorage.getItem('obras_bp')) || {};

let graficosConfig = [
  { id: "chart_categoria_comp", titulo: "Comparativo Previsto x Realizado por Categoria BP", tipo: "bar", metrica: "categoria" },
  { id: "chart_curva_s", titulo: "Evolução do Desempenho Orçamentário", tipo: "line", metrica: "curvaS" }
];

let graficosInstancias = {};
let usuarioAutenticado = null;
let obraAtivaID = null;
let multiplicadorCenario = 1;

// ==========================================
// FUNÇÕES UTILITÁRIAS (CONVERSÃO DE LINKS)
// ==========================================
function obterLinkCSV(url) {
  if (!url) return "";
  if (url.includes("/edit") || url.includes("usp=")) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
    }
  }
  return url;
}

const buscarCSV = (url) => new Promise((resolve, reject) => {
  Papa.parse(obterLinkCSV(url), {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => resolve(results.data),
    error: (err) => reject(err)
  });
});

// ==========================================
// INICIALIZAÇÃO E SESSÃO
// ==========================================
window.onload = function() {
  document.getElementById('header-app-title').innerText = configGlobal.titulo;
  document.getElementById('login-app-title').innerText = configGlobal.titulo;

  const sessaoSalva = localStorage.getItem('usuario_bp');
  if (sessaoSalva) {
    try { usuarioAutenticado = JSON.parse(sessaoSalva); } catch(e) { usuarioAutenticado = null; }
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

// LOGIN & LOGOUT
function executarLogin() {
  const inputUser = document.getElementById('login-usuario').value.trim();
  const inputSenha = document.getElementById('login-senha').value.trim();

  if (!inputUser || !inputSenha) return alert("Preencha usuário e senha.");
  const user = usuariosBD.find(u => (u.usuario === inputUser || u.email === inputUser) && u.senha === inputSenha);

  if (user) {
    if (user.status === "Aprovado") {
      usuarioAutenticado = user;
      localStorage.setItem('usuario_bp', JSON.stringify(user));
      verificarSessao();
    } else {
      alert("Acesso pendente de aprovação pelo Mestre.");
    }
  } else {
    alert("Usuário ou senha incorretos.");
  }
}

function executarLogout() {
  usuarioAutenticado = null;
  localStorage.removeItem('usuario_bp');
  verificarSessao();
}

// ==========================================
// SINCRONIZAÇÃO COMPLETA DE DADOS (ASSÍNCRONO)
// ==========================================
async function sincronizarTodasPlanilhas() {
  const btn = document.getElementById('btn-sync');
  if (btn) btn.innerText = "⏳ A Sincronizar Dados...";

  try {
    // 1. Limpar acumulados atuais de todas as obras (mantendo os links guardados)
    Object.keys(obrasBD).forEach(k => {
      obrasBD[k].realizadoTotal = 0;
      obrasBD[k].categoriasRealizado = {};
      obrasBD[k].previstoTotal = 0;
      obrasBD[k].categoriasPrevisto = {};
    });

    // 2. Extrair dados da Planilha de Realizado (Unificada)
    const dadosRealizado = await buscarCSV(configGlobal.urlRealizado).catch(() => []);
    
    dadosRealizado.forEach(linha => {
      // Procura a coluna do departamento/obra de forma flexível
      const chaveDepto = Object.keys(linha).find(k => k.trim().toUpperCase().includes("DEPARTAMENTO") || k.trim().toUpperCase().includes("CENTRO DE CUSTO"));
      const deptoOriginal = chaveDepto ? (linha[chaveDepto] || "").trim() : "";
      
      if (!deptoOriginal || deptoOriginal === "N/D" || deptoOriginal === "0.0") return;
      const deptoID = deptoOriginal.toUpperCase();

      if (!obrasBD[deptoID]) {
        obrasBD[deptoID] = {
          id: deptoID, nome: deptoOriginal, cc: deptoOriginal, responsavel: "Não Atribuído", status: "Ativa",
          urlPrevistoCSV: "", previstoTotal: 0, realizadoTotal: 0, categoriasPrevisto: {}, categoriasRealizado: {}
        };
      }

      // Procura a coluna do Valor
      const chaveValor = Object.keys(linha).find(k => k.trim().toUpperCase().includes("VALOR LÍQUIDO") || k.trim().toUpperCase().includes("VALOR DA CONTA"));
      let valorStr = chaveValor ? String(linha[chaveValor] || "0") : "0";
      let valor = Math.abs(parseFloat(valorStr.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0);

      const chaveCategoria = Object.keys(linha).find(k => k.trim().toUpperCase() === "CATEGORIA");
      const categoria = chaveCategoria ? (linha[chaveCategoria] || "Outros").trim() : "Outros";

      if (obrasBD[deptoID].status !== "Arquivada") {
        obrasBD[deptoID].realizadoTotal += valor;
        obrasBD[deptoID].categoriasRealizado[categoria] = (obrasBD[deptoID].categoriasRealizado[categoria] || 0) + valor;
      }
    });

    // 3. Processar Planilhas de Previsto (Apenas para obras que tenham um link configurado)
    const promessasPrevisto = Object.keys(obrasBD).map(async (key) => {
      const obra = obrasBD[key];
      if (obra.urlPrevistoCSV && obra.urlPrevistoCSV.trim() !== "") {
        const dadosPrevisto = await buscarCSV(obra.urlPrevistoCSV).catch(() => []);
        
        dadosPrevisto.forEach(linha => {
          const chaveCat = Object.keys(linha).find(k => k.trim().toUpperCase() === "CATEGORIA BP" || k.trim().toUpperCase() === "NATUREZA/GRUPO");
          const catBP = chaveCat ? (linha[chaveCat] || "Outros").trim() : "Outros";
          
          const chaveCusto = Object.keys(linha).find(k => k.trim().toUpperCase() === "CUSTO TOTAL (R$)");
          let custoStr = chaveCusto ? String(linha[chaveCusto] || "0") : "0";
          let custoTotal = parseFloat(custoStr.replace("R$", "").replace(/\./g, "").replace(",", ".").trim()) || 0;
          
          obra.categoriasPrevisto[catBP] = (obra.categoriasPrevisto[catBP] || 0) + custoTotal;
        });

        obra.previstoTotal = Object.values(obra.categoriasPrevisto).reduce((a, b) => a + b, 0);
      }
    });

    await Promise.all(promessasPrevisto);

    // Guardar estado final no disco
    localStorage.setItem('obras_bp', JSON.stringify(obrasBD));

    popularSeletorObras();
    atualizarDashboard();

  } catch (error) {
    alert("Ocorreu um erro ao sincronizar os dados. Verifique as permissões de acesso da planilha (Publicar na Web).");
    console.error(error);
  } finally {
    if (btn) btn.innerHTML = "🔄 Sincronizar Google Sheets";
  }
}

// ==========================================
// DASHBOARD & FAROL
// ==========================================
function popularSeletorObras() {
  const seletor = document.getElementById('seletor-obra');
  seletor.innerHTML = '';
  
  const chaves = Object.keys(obrasBD).filter(k => obrasBD[k].status !== "Arquivada");

  if (chaves.length === 0) {
    seletor.innerHTML = `<option value="">A aguardar sincronização...</option>`;
    obraAtivaID = null;
    return;
  }

  chaves.forEach(k => {
    seletor.innerHTML += `<option value="${k}">${obrasBD[k].nome}</option>`;
  });

  if (!obraAtivaID || !obrasBD[obraAtivaID] || obrasBD[obraAtivaID].status === "Arquivada") {
    obraAtivaID = chaves[0];
  }
  seletor.value = obraAtivaID;
}

function alterarObraAtiva(id) {
  obraAtivaID = id;
  atualizarDashboard();
}

function aplicarCenario(fator) {
  multiplicadorCenario = parseFloat(fator);
  atualizarDashboard();
}

function atualizarDashboard() {
  if (!obraAtivaID || !obrasBD[obraAtivaID]) return;

  const obra = obrasBD[obraAtivaID];

  document.getElementById('obra-titulo').innerText = obra.nome;
  document.getElementById('obra-cc').innerText = obra.cc;
  document.getElementById('obra-resp').innerText = obra.responsavel;
  
  const badge = document.getElementById('obra-badge-status');
  badge.innerText = obra.status;
  badge.className = obra.status === "Ativa" ? "bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full" : "bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full";

  const previstoAjustado = obra.previstoTotal * multiplicadorCenario;
  const desvio = previstoAjustado - obra.realizadoTotal;
  const idc = obra.realizadoTotal > 0 ? (previstoAjustado / obra.realizadoTotal).toFixed(2) : "0.00";

  document.getElementById('kpi-previsto').innerText = previstoAjustado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-realizado').innerText = obra.realizadoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-desvio').innerText = (desvio >= 0 ? "+ " : "") + desvio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-idc').innerText = idc;

  // Lógica do Farol (Tabela)
  const tbody = document.getElementById('tabela-dre-body');
  tbody.innerHTML = '';

  const todasCategorias = Array.from(new Set([...Object.keys(obra.categoriasPrevisto || {}), ...Object.keys(obra.categoriasRealizado || {})]));

  let countVerde = 0; let countAmarelo = 0; let countVermelho = 0;

  if (todasCategorias.length > 0) {
    todasCategorias.forEach(cat => {
      const prev = ((obra.categoriasPrevisto && obra.categoriasPrevisto[cat]) || 0) * multiplicadorCenario;
      const real = (obra.categoriasRealizado && obra.categoriasRealizado[cat]) || 0;
      const saldo = prev - real;
      
      let percUso = 0;
      if (prev > 0) percUso = (real / prev) * 100;
      else if (real > 0) percUso = 999;

      let farolClass = ''; let farolTexto = ''; let farolIcone = ''; let corSaldo = '';

      if (percUso > 100 || (prev === 0 && real > 0)) {
        farolClass = 'bg-red-100 text-red-800 border border-red-200';
        farolTexto = prev === 0 ? 'NÃO PREVISTO' : 'ESTOURADO';
        farolIcone = '🔴'; corSaldo = 'text-red-600'; countVermelho++;
      } else if (percUso >= 85) {
        farolClass = 'bg-amber-100 text-amber-800 border border-amber-200';
        farolTexto = 'ATENÇÃO'; farolIcone = '🟡'; corSaldo = 'text-amber-600'; countAmarelo++;
      } else {
        farolClass = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
        farolTexto = 'SEGURO'; farolIcone = '🟢'; corSaldo = 'text-emerald-600'; countVerde++;
      }

      const percExibicao = percUso === 999 ? "∞" : percUso.toFixed(1) + "%";

      tbody.innerHTML += `
        <tr class="hover:bg-gray-50 transition-colors">
          <td class="p-3 text-bp-blue font-bold">${cat}</td>
          <td class="p-3 text-right">${prev.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
          <td class="p-3 text-right">${real.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
          <td class="p-3 text-center font-bold ${corSaldo}">${percExibicao}</td>
          <td class="p-3 text-right font-black ${corSaldo}">${(saldo >= 0 ? "+ " : "") + saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
          <td class="p-3 text-center">
            <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 ${farolClass}">${farolIcone} ${farolTexto}</span>
          </td>
        </tr>
      `;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-400">Nenhum dado financeiro para demonstrar.</td></tr>`;
  }

  document.getElementById('farol-verde-count').innerText = countVerde;
  document.getElementById('farol-amarelo-count').innerText = countAmarelo;
  document.getElementById('farol-vermelho-count').innerText = countVermelho;

  renderizarGridGraficosDinamicos(obra);
}

// ==========================================
// RENDERIZAÇÃO DE GRÁFICOS DINÂMICOS
// ==========================================
function renderizarGridGraficosDinamicos(obra) {
  const container = document.getElementById('grid-graficos-dinamicos');
  container.innerHTML = '';

  Object.keys(graficosInstancias).forEach(id => { if (graficosInstancias[id]) graficosInstancias[id].destroy(); });
  graficosInstancias = {};

  graficosConfig.forEach(cfg => {
    container.innerHTML += `
      <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 class="font-bold text-bp-blue text-base mb-4">${cfg.titulo}</h3>
        <div class="relative h-72"><canvas id="${cfg.id}"></canvas></div>
      </div>
    `;
  });

  setTimeout(() => {
    graficosConfig.forEach(cfg => {
      const canvasElem = document.getElementById(cfg.id);
      if (!canvasElem) return;

      const ctx = canvasElem.getContext('2d');
      const cats = Array.from(new Set([...Object.keys(obra.categoriasPrevisto || {}), ...Object.keys(obra.categoriasRealizado || {})]));
      
      const prevVals = cats.map(c => ((obra.categoriasPrevisto && obra.categoriasPrevisto[c]) || 0) * multiplicadorCenario);
      const realVals = cats.map(c => (obra.categoriasRealizado && obra.categoriasRealizado[c]) || 0);

      const chartData = {
        labels: cats.length ? cats : ['Sem dados'],
        datasets: [
          { label: 'Previsto (R$)', data: prevVals.length ? prevVals : [0], backgroundColor: '#003399', borderColor: '#003399' },
          { label: 'Realizado (R$)', data: realVals.length ? realVals : [0], backgroundColor: '#00CFFF', borderColor: '#00CFFF' }
        ]
      };

      graficosInstancias[cfg.id] = new Chart(ctx, { type: cfg.tipo, data: chartData, options: { responsive: true, maintainAspectRatio: false } });
    });
  }, 100);
}

// ==========================================
// CONFIGURAÇÕES E GESTÃO DE OBRAS (C/ VÍNCULO DE PREVISTO)
// ==========================================
function abrirModalConfiguracoes() {
  document.getElementById('config-app-title').value = configGlobal.titulo;
  document.getElementById('config-url-unificada').value = configGlobal.urlRealizado;
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
  
  if(Object.keys(obrasBD).length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-gray-400">Clique em 'Sincronizar Google Sheets' no dashboard para descobrir obras.</td></tr>`;
  }

  Object.keys(obrasBD).forEach(id => {
    const o = obrasBD[id];
    tbody.innerHTML += `
      <tr>
        <td class="p-2 font-bold text-gray-600">${o.cc}</td>
        <td class="p-2"><input type="text" value="${o.nome}" onchange="atualizarCampoObra('${id}', 'nome', this.value)" class="border p-1 rounded w-full"></td>
        <td class="p-2"><input type="url" placeholder="Cole o link CSV da Planilha Previsto..." value="${o.urlPrevistoCSV}" onchange="atualizarCampoObra('${id}', 'urlPrevistoCSV', this.value)" class="border p-1 rounded w-full text-[10px]"></td>
        <td class="p-2 text-center space-x-1">
          <button onclick="alternarStatusArquivado('${id}')" class="bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-bold">${o.status === 'Ativa' ? 'Arquivar' : 'Reativar'}</button>
          <button onclick="excluirObra('${id}')" class="bg-red-600 text-white px-2 py-1 rounded text-[10px] font-bold">Excluir</button>
        </td>
      </tr>
    `;
  });
}

function atualizarCampoObra(id, campo, valor) {
  if (obrasBD[id]) {
    obrasBD[id][campo] = valor;
    localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
  }
}

function alternarStatusArquivado(id) {
  if (obrasBD[id]) {
    obrasBD[id].status = obrasBD[id].status === 'Ativa' ? 'Arquivada' : 'Ativa';
    localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
    popularSeletorObras();
    renderizarTabelaGestaoObras();
    atualizarDashboard();
  }
}

function excluirObra(id) {
  if (confirm(`Tem a certeza que deseja excluir os registos da obra ${obrasBD[id].nome}?`)) {
    delete obrasBD[id];
    localStorage.setItem('obras_bp', JSON.stringify(obrasBD));
    popularSeletorObras();
    renderizarTabelaGestaoObras();
    atualizarDashboard();
  }
}

function adicionarNovoGrafico() {
  const titulo = document.getElementById('novo-chart-titulo').value.trim();
  const tipo = document.getElementById('novo-chart-tipo').value;
  const metrica = document.getElementById('novo-chart-metrica').value;
  if (!titulo) return alert("Digite o título do gráfico.");
  graficosConfig.push({ id: `chart_custom_${Date.now()}`, titulo, tipo, metrica });
  document.getElementById('novo-chart-titulo').value = '';
  renderizarListaGraficosConfig();
}

function removerGrafico(id) {
  graficosConfig = graficosConfig.filter(g => g.id !== id);
  renderizarListaGraficosConfig();
}

function renderizarListaGraficosConfig() {
  const div = document.getElementById('lista-graficos-config');
  div.innerHTML = '';
  graficosConfig.forEach(g => {
    div.innerHTML += `
      <div class="flex justify-between items-center bg-white p-2 border rounded text-xs">
        <div><strong class="text-bp-blue">${g.titulo}</strong> (${g.tipo.toUpperCase()})</div>
        <button type="button" onclick="removerGrafico('${g.id}')" class="text-red-600 font-bold hover:underline">Remover</button>
      </div>
    `;
  });
}

function salvarConfiguracoesGerais() {
  const novoTitulo = document.getElementById('config-app-title').value.trim();
  const novaURLRealizado = document.getElementById('config-url-unificada').value.trim();
  
  if (novoTitulo) {
    configGlobal.titulo = novoTitulo;
    document.getElementById('header-app-title').innerText = novoTitulo;
    document.getElementById('login-app-title').innerText = novoTitulo;
  }
  
  if (novaURLRealizado) configGlobal.urlRealizado = novaURLRealizado;
  
  localStorage.setItem('config_bp', JSON.stringify(configGlobal));
  fecharModalConfiguracoes();
  
  if (confirm("Configurações salvas! Deseja executar uma nova Sincronização de Dados agora?")) {
    sincronizarTodasPlanilhas();
  }
}

// ==========================================
// GESTÃO DE USUÁRIOS E PERMISSÕES
// ==========================================
function abrirModalUsuarios() { renderizarPainelUsuarios(); document.getElementById('modal-usuarios').classList.remove('hidden'); }
function fecharModalUsuarios() { document.getElementById('modal-usuarios').classList.add('hidden'); }

function criarUsuarioDireto() {
  const nome = document.getElementById('novo-usr-nome').value.trim();
  const email = document.getElementById('novo-usr-email').value.trim();
  const usuario = document.getElementById('novo-usr-login').value.trim();
  const senha = document.getElementById('novo-usr-senha').value.trim();
  const perfil = document.getElementById('novo-usr-perfil').value;

  if (!nome || !email || !usuario || !senha) return alert("Preencha todos os campos.");
  if (usuariosBD.some(u => u.usuario === usuario || u.email === email)) return alert("Login/e-mail já cadastrado.");

  usuariosBD.push({ nome, usuario, email, senha, perfil, status: "Aprovado" });
  renderizarPainelUsuarios();
  alert(`Usuário ${usuario} cadastrado!`);
}

function solicitarCadastro() {
  const nome = document.getElementById('solic-nome').value.trim();
  const email = document.getElementById('solic-email').value.trim();
  const usuario = document.getElementById('solic-usuario').value.trim();
  const senha = document.getElementById('solic-senha').value.trim();

  if (!nome || !email || !usuario || !senha) return alert("Preencha os campos.");

  solicitacoesPendentesBD.push({ id: Date.now(), nome, email, usuario, senha, perfil: "Engenheiro", status: "Pendente" });
  exibirFormLogin();
  alert("Solicitação enviada!");
}

function renderizarPainelUsuarios() {
  const tbodyPend = document.getElementById('tabela-pendentes-body');
  document.getElementById('count-pendentes').innerText = solicitacoesPendentesBD.length;
  tbodyPend.innerHTML = solicitacoesPendentesBD.length === 0 ? `<tr><td colspan="4" class="p-3 text-center text-gray-400">Nenhuma solicitação pendente.</td></tr>` : '';

  solicitacoesPendentesBD.forEach(s => {
    tbodyPend.innerHTML += `
      <tr>
        <td class="p-2 font-bold">${s.nome}</td>
        <td class="p-2">${s.email}</td>
        <td class="p-2 text-bp-blue font-bold">${s.usuario}</td>
        <td class="p-2 text-center"><button onclick="aprovarSolicitacao(${s.id})" class="bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold">Aprovar</button></td>
      </tr>
    `;
  });

  const tbodyAtivos = document.getElementById('tabela-usuarios-body');
  tbodyAtivos.innerHTML = '';
  usuariosBD.forEach(u => {
    tbodyAtivos.innerHTML += `
      <tr>
        <td class="p-2 font-bold">${u.nome}</td>
        <td class="p-2 text-gray-500">${u.usuario} (${u.email})</td>
        <td class="p-2"><span class="bg-bp-blue text-white px-2 py-0.5 rounded text-[10px] font-bold">${u.perfil}</span></td>
        <td class="p-2 text-center"><span class="text-emerald-600 font-bold">● Ativo</span></td>
      </tr>
    `;
  });
}

function aprovarSolicitacao(id) {
  const index = solicitacoesPendentesBD.findIndex(s => s.id === id);
  if (index !== -1) {
    const sol = solicitacoesPendentesBD[index];
    sol.status = "Aprovado";
    usuariosBD.push(sol);
    solicitacoesPendentesBD.splice(index, 1);
    renderizarPainelUsuarios();
  }
}

function aplicarPermissoesPerfil() {
  document.getElementById('user-display-name').innerText = usuarioAutenticado.nome;
  document.getElementById('user-display-role').innerText = usuarioAutenticado.perfil;

  if (usuarioAutenticado.perfil === "Mestre") {
    document.getElementById('btn-gestao-usuarios').classList.remove('hidden');
    document.getElementById('btn-configuracoes').classList.remove('hidden');
  } else {
    document.getElementById('btn-gestao-usuarios').classList.add('hidden');
    document.getElementById('btn-configuracoes').classList.add('hidden');
  }
}
