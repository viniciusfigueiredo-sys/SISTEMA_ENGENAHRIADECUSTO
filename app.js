// BANCO DE DADOS DE USUÁRIOS
let usuariosBD = [
  { 
    nome: "Vinícius Souza (Mestre)", 
    usuario: "vinicius_souzaf", 
    email: "mestre@brasilpontes.com.br", 
    senha: "741852963", 
    perfil: "Mestre", 
    status: "Aprovado" 
  }
];

let solicitacoesPendentesBD = [];

// LINKS DAS PLANILHAS PUBLICADAS NO GOOGLE SHEETS
let urlRealizadoUnificadoCSV = "https://docs.google.com/spreadsheets/d/1S41dXyTC2Y_SJjD3iw86WaUqi0OWNxyf/export?format=csv";
let urlPrevistoModeloCSV = "https://docs.google.com/spreadsheets/d/1v_sB3klYQRBuJ0SA-kpa2tYA3IVJsFi7ehWzgcPgDsM/export?format=csv";

// BANCO DE DADOS GLOBAL DAS OBRAS
let obrasBD = {};

// CONFIGURAÇÃO DOS GRÁFICOS DINÂMICOS
let graficosConfig = [
  { id: "chart_categoria_comp", titulo: "Comparativo Previsto x Realizado por Categoria BP", tipo: "bar", metrica: "categoria" },
  { id: "chart_curva_s", titulo: "Evolução do Desempenho Orçamentário (Curva S)", tipo: "line", metrica: "curvaS" }
];

let graficosInstancias = {};
let usuarioAutenticado = null;
let obraAtivaID = null;
let multiplicadorCenario = 1;

// INICIALIZAÇÃO
window.onload = function() {
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
    sincronizarTodasPlanilhas();
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

// SINCRONIZAÇÃO COMPLETA (PUXA OBRAS DO REALIZADO + DADOS DO PREVISTO)
function sincronizarTodasPlanilhas() {
  // 1. Ler Planilha de Realizado Unificado
  Papa.parse(urlRealizadoUnificadoCSV, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      extrairEObrasEGastosRealizados(results.data);
      // 2. Ler Planilha Modelo do Previsto
      sincronizarPlanilhaPrevisto();
    },
    error: function(err) {
      console.warn("Erro ao ler Realizado. Usando estrutura salva localmente.", err);
      atualizarDashboard();
    }
  });
}

function extrairEObrasEGastosRealizados(linhasRealizado) {
  // Puxar automaticamente todas as obras/departamentos da planilha de realizado
  linhasRealizado.forEach(linha => {
    const depto = (linha["Departamento"] || linha["Centro de Custo"] || "").trim();
    if (!depto || depto === "N/D" || depto === "0.0") return;

    // Criar obra se não existir
    if (!obrasBD[depto]) {
      obrasBD[depto] = {
        id: depto,
        nome: depto,
        cc: depto,
        responsavel: "Engenheiro Responsável",
        status: "Ativa",
        urlPrevistoCSV: urlPrevistoModeloCSV,
        previstoTotal: 0,
        realizadoTotal: 0,
        categoriasPrevisto: {},
        categoriasRealizado: {},
        lancamentos: []
      };
    }

    let valorStr = linha["Soma de Valor Líquido "] || linha["Soma de Valor Líquido"] || linha["Valor da Conta"] || "0";
    valorStr = valorStr.replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
    const valor = Math.abs(parseFloat(valorStr) || 0);

    const categoria = (linha["Categoria"] || "Outros").trim();

    if (obrasBD[depto].status !== "Arquivada") {
      obrasBD[depto].realizadoTotal += valor;
      obrasBD[depto].categoriasRealizado[categoria] = (obrasBD[depto].categoriasRealizado[categoria] || 0) + valor;
      obrasBD[depto].lancamentos.push(linha);
    }
  });

  popularSeletorObras();
}

function sincronizarPlanilhaPrevisto() {
  Papa.parse(urlPrevistoModeloCSV, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      processarDadosPrevisto(results.data);
    },
    error: function(err) {
      atualizarDashboard();
    }
  });
}

function processarDadosPrevisto(linhasPrevisto) {
  linhasPrevisto.forEach(linha => {
    const catBP = (linha["Categoria BP"] || linha["Natureza/Grupo"] || "Outros").trim();
    let custoTotalStr = linha["Custo Total (R$)"] || "0";
    custoTotalStr = custoTotalStr.replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
    const custoTotal = parseFloat(custoTotalStr) || 0;

    // Atribuir orçado para as obras
    Object.keys(obrasBD).forEach(key => {
      const obra = obrasBD[key];
      if (obra.previstoTotal === 0) {
        obra.categoriasPrevisto[catBP] = (obra.categoriasPrevisto[catBP] || 0) + custoTotal;
      }
    });
  });

  // Somar previstos totais
  Object.keys(obrasBD).forEach(key => {
    const obra = obrasBD[key];
    if (obra.previstoTotal === 0) {
      obra.previstoTotal = Object.values(obra.categoriasPrevisto).reduce((a, b) => a + b, 0);
    }
  });

  atualizarDashboard();
}

// DASHBOARD
function popularSeletorObras() {
  const seletor = document.getElementById('seletor-obra');
  seletor.innerHTML = '';
  
  const chaves = Object.keys(obrasBD).filter(k => obrasBD[k].status !== "Arquivada");

  if (chaves.length === 0) {
    seletor.innerHTML = `<option value="">Nenhuma obra ativa</option>`;
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

  // Renderizar Tabela Comparativa Previsto x Realizado por Categoria
  const tbody = document.getElementById('tabela-dre-body');
  tbody.innerHTML = '';

  const todasCategorias = Array.from(new Set([
    ...Object.keys(obra.categoriasPrevisto),
    ...Object.keys(obra.categoriasRealizado)
  ]));

  if (todasCategorias.length > 0) {
    todasCategorias.forEach(cat => {
      const prev = (obra.categoriasPrevisto[cat] || 0) * multiplicadorCenario;
      const real = obra.categoriasRealizado[cat] || 0;
      const saldo = prev - real;
      const ok = saldo >= 0;

      tbody.innerHTML += `
        <tr class="hover:bg-gray-50">
          <td class="p-3 text-bp-blue font-bold">${cat}</td>
          <td class="p-3 text-right">${prev.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
          <td class="p-3 text-right">${real.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
          <td class="p-3 text-right font-bold ${ok ? 'text-emerald-600' : 'text-red-600'}">${(saldo >= 0 ? "+ " : "") + saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">
              ${ok ? 'DENTRO DO ORÇAMENTO' : 'ACIMA DO PREVISTO'}
            </span>
          </td>
        </tr>
      `;
    });
  } else {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-400">Aguardando carregamento dos dados da planilha.</td></tr>`;
  }

  renderizarGridGraficosDinamicos(obra);
}

// RENDERIZAÇÃO DE GRÁFICOS
function renderizarGridGraficosDinamicos(obra) {
  const container = document.getElementById('grid-graficos-dinamicos');
  container.innerHTML = '';

  Object.keys(graficosInstancias).forEach(id => {
    if (graficosInstancias[id]) graficosInstancias[id].destroy();
  });
  graficosInstancias = {};

  graficosConfig.forEach(cfg => {
    container.innerHTML += `
      <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 class="font-bold text-bp-blue text-base mb-4">${cfg.titulo}</h3>
        <div class="relative h-72">
          <canvas id="${cfg.id}"></canvas>
        </div>
      </div>
    `;
  });

  setTimeout(() => {
    graficosConfig.forEach(cfg => {
      const canvasElem = document.getElementById(cfg.id);
      if (!canvasElem) return;

      const ctx = canvasElem.getContext('2d');
      const cats = Array.from(new Set([...Object.keys(obra.categoriasPrevisto), ...Object.keys(obra.categoriasRealizado)]));
      
      const prevVals = cats.map(c => (obra.categoriasPrevisto[c] || 0) * multiplicadorCenario);
      const realVals = cats.map(c => obra.categoriasRealizado[c] || 0);

      const chartData = {
        labels: cats.length ? cats : ['Sem dados'],
        datasets: [
          { label: 'Previsto (R$)', data: prevVals.length ? prevVals : [0], backgroundColor: '#003399', borderColor: '#003399' },
          { label: 'Realizado (R$)', data: realVals.length ? realVals : [0], backgroundColor: '#00CFFF', borderColor: '#00CFFF' }
        ]
      };

      graficosInstancias[cfg.id] = new Chart(ctx, {
        type: cfg.tipo,
        data: chartData,
        options: { responsive: true, maintainAspectRatio: false }
      });
    });
  }, 100);
}

// GERENCIAMENTO DE OBRAS EM CONFIGURAÇÕES (EDITAR / ARQUIVAR / EXCLUIR)
function abrirModalConfiguracoes() {
  document.getElementById('config-app-title').value = document.getElementById('header-app-title').innerText;
  document.getElementById('config-url-unificada').value = urlRealizadoUnificadoCSV;
  renderizarTabelaGestaoObras();
  renderizarListaGraficosConfig();
  document.getElementById('modal-configuracoes').classList.remove('hidden');
}

function fecharModalConfiguracoes() {
  document.getElementById('modal-configuracoes').classList.add('hidden');
}

function trocarAbaConfig(aba) {
  document.getElementById('cfg-aba-geral').classList.add('hidden');
  document.getElementById('cfg-aba-obras').classList.add('hidden');
  document.getElementById('cfg-aba-graficos').classList.add('hidden');

  document.getElementById('tab-btn-geral').className = "pb-2 text-gray-500 hover:text-bp-blue";
  document.getElementById('tab-btn-obras').className = "pb-2 text-gray-500 hover:text-bp-blue";
  document.getElementById('tab-btn-graficos').className = "pb-2 text-gray-500 hover:text-bp-blue";

  if (aba === 'geral') {
    document.getElementById('cfg-aba-geral').classList.remove('hidden');
    document.getElementById('tab-btn-geral').className = "pb-2 border-b-2 border-bp-blue text-bp-blue font-bold";
  } else if (aba === 'obras') {
    document.getElementById('cfg-aba-obras').classList.remove('hidden');
    document.getElementById('tab-btn-obras').className = "pb-2 border-b-2 border-bp-blue text-bp-blue font-bold";
    renderizarTabelaGestaoObras();
  } else if (aba === 'graficos') {
    document.getElementById('cfg-aba-graficos').classList.remove('hidden');
    document.getElementById('tab-btn-graficos').className = "pb-2 border-b-2 border-bp-blue text-bp-blue font-bold";
  }
}

function renderizarTabelaGestaoObras() {
  const tbody = document.getElementById('tabela-gestao-obras-body');
  tbody.innerHTML = '';

  Object.keys(obrasBD).forEach(id => {
    const o = obrasBD[id];
    tbody.innerHTML += `
      <tr>
        <td class="p-2 font-bold"><input type="text" value="${o.nome}" onchange="atualizarCampoObra('${id}', 'nome', this.value)" class="border p-1 rounded w-full"></td>
        <td class="p-2"><input type="text" value="${o.cc}" onchange="atualizarCampoObra('${id}', 'cc', this.value)" class="border p-1 rounded w-full"></td>
        <td class="p-2"><input type="url" value="${o.urlPrevistoCSV}" onchange="atualizarCampoObra('${id}', 'urlPrevistoCSV', this.value)" class="border p-1 rounded w-full text-[10px]"></td>
        <td class="p-2 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${o.status === 'Ativa' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${o.status}</span></td>
        <td class="p-2 text-center space-x-1">
          <button onclick="alternarStatusArquivado('${id}')" class="bg-amber-500 text-white px-2 py-1 rounded text-[10px] font-bold">${o.status === 'Ativa' ? 'Arquivar' : 'Reativar'}</button>
          <button onclick="excluirObra('${id}')" class="bg-red-600 text-white px-2 py-1 rounded text-[10px] font-bold">Excluir</button>
        </td>
      </tr>
    `;
  });
}

function atualizarCampoObra(id, campo, valor) {
  if (obrasBD[id]) obrasBD[id][campo] = valor;
}

function alternarStatusArquivado(id) {
  if (obrasBD[id]) {
    obrasBD[id].status = obrasBD[id].status === 'Ativa' ? 'Arquivada' : 'Ativa';
    popularSeletorObras();
    renderizarTabelaGestaoObras();
    atualizarDashboard();
  }
}

function excluirObra(id) {
  if (confirm(`Tem certeza que deseja excluir a obra ${obrasBD[id].nome}?`)) {
    delete obrasBD[id];
    popularSeletorObras();
    renderizarTabelaGestaoObras();
    atualizarDashboard();
  }
}

// ADICIONAR / REMOVER GRÁFICOS
function adicionarNovoGrafico() {
  const titulo = document.getElementById('novo-chart-titulo').value.trim();
  const tipo = document.getElementById('novo-chart-tipo').value;
  const metrica = document.getElementById('novo-chart-metrica').value;

  if (!titulo) return alert("Digite o título do gráfico.");

  const novoID = `chart_custom_${Date.now()}`;
  graficosConfig.push({ id: novoID, titulo, tipo, metrica });
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
  if (novoTitulo) {
    document.getElementById('header-app-title').innerText = novoTitulo;
    document.getElementById('login-app-title').innerText = novoTitulo;
  }

  urlRealizadoUnificadoCSV = document.getElementById('config-url-unificada').value.trim() || urlRealizadoUnificadoCSV;
  sincronizarTodasPlanilhas();
  fecharModalConfiguracoes();
  alert("Configurações aplicadas com sucesso!");
}

// USUÁRIOS
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
        <td class="p-2 text-center">
          <button onclick="aprovarSolicitacao(${s.id})" class="bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold">Aprovar</button>
        </td>
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
