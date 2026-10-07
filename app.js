// BANCO DE DADOS DE USUÁRIOS E CONFIGURAÇÕES
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

// LINK DA PLANILHA UNIFICADA PUBLICADA
let urlPlanilhaUnificadaCSV = "https://docs.google.com/spreadsheets/d/1S41dXyTC2Y_SJjD3iw86WaUqi0OWNxyf/export?format=csv";

// ESTRUTURA DE GRÁFICOS DINÂMICOS
let graficosConfig = [
  { id: "chart_curva_s", titulo: "Acompanhamento do Desempenho Orçamentário (Curva S)", tipo: "line", metrica: "curvaS" },
  { id: "chart_categoria", titulo: "Custos por Categoria (Filtrado)", tipo: "doughnut", metrica: "categoria" }
];

let graficosInstancias = {};

// BANCO DE DADOS DAS OBRAS E LANÇAMENTOS DO REALIZADO
let obrasBD = {
  "OBRA-MOC": {
    id: "OBRA-MOC",
    nome: "Escritório Montes Claros",
    cc: "CD 22 ESCRITORIO MOC",
    responsavel: "Eng. Vinícius Souza",
    previstoTotal: 50000,
    realizadoTotal: 0,
    lancamentos: [],
    dre: [],
    categoriasMap: {}
  },
  "OBRA-ORLANDIA": {
    id: "OBRA-ORLANDIA",
    nome: "Obra Orlândia - KM 350",
    cc: "CD 40 - ORLÂNDIA - km 350+601 KM",
    responsavel: "Eng. Responsável",
    previstoTotal: 1200000,
    realizadoTotal: 0,
    lancamentos: [],
    dre: [],
    categoriasMap: {}
  }
};

let usuarioAutenticado = null;
let obraAtivaID = "OBRA-MOC";
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
    popularSeletorObras();
    sincronizarPlanilhaUnificada();
    aplicarPermissoesPerfil();
  }
}

// LOGIN & LOGOUT
function executarLogin() {
  const inputUser = document.getElementById('login-usuario').value.trim();
  const inputSenha = document.getElementById('login-senha').value.trim();

  if (!inputUser || !inputSenha) {
    alert("Por favor, preencha o usuário e a senha.");
    return;
  }

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

// LEITURA E FILTRAGEM DA PLANILHA UNIFICADA REALIZADO
function sincronizarPlanilhaUnificada() {
  Papa.parse(urlPlanilhaUnificadaCSV, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      processarDadosPlanilhaUnificada(results.data);
    },
    error: function(err) {
      console.warn("Sincronização via download direto. Processando estrutura local.", err);
      atualizarDashboard();
    }
  });
}

function processarDadosPlanilhaUnificada(dados) {
  // Limpar acumulados anteriores das obras
  Object.keys(obrasBD).forEach(k => {
    obrasBD[k].realizadoTotal = 0;
    obrasBD[k].lancamentos = [];
    obrasBD[k].categoriasMap = {};
  });

  dados.forEach(linha => {
    const departamento = linha["Departamento"] || linha["Centro de Custo"] || "";
    let valorStr = linha["Soma de Valor Líquido "] || linha["Soma de Valor Líquido"] || linha["Valor da Conta"] || "0";
    
    // Converter valor BRL para float
    valorStr = valorStr.replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
    const valor = Math.abs(parseFloat(valorStr) || 0);

    const categoria = linha["Categoria"] || "Outros";

    // Cruzar e filtrar automaticamente por obra
    Object.keys(obrasBD).forEach(key => {
      const obra = obrasBD[key];
      if (departamento.toLowerCase().includes(obra.cc.toLowerCase()) || obra.cc.toLowerCase().includes(departamento.toLowerCase())) {
        obra.realizadoTotal += valor;
        obra.lancamentos.push(linha);
        obra.categoriasMap[categoria] = (obra.categoriasMap[categoria] || 0) + valor;
      }
    });
  });

  atualizarDashboard();
}

// DASHBOARD E DRE
function popularSeletorObras() {
  const seletor = document.getElementById('seletor-obra');
  seletor.innerHTML = '';
  const chaves = Object.keys(obrasBD);

  if (chaves.length === 0) {
    seletor.innerHTML = `<option value="">Nenhuma obra cadastrada</option>`;
    obraAtivaID = null;
    return;
  }

  chaves.forEach(k => {
    seletor.innerHTML += `<option value="${k}">${obrasBD[k].nome}</option>`;
  });

  if (!obraAtivaID || !obrasBD[obraAtivaID]) obraAtivaID = chaves[0];
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

  const previstoAjustado = obra.previstoTotal * multiplicadorCenario;
  const desvio = previstoAjustado - obra.realizadoTotal;
  const idc = obra.realizadoTotal > 0 ? (previstoAjustado / obra.realizadoTotal).toFixed(2) : "0.00";

  document.getElementById('kpi-previsto').innerText = previstoAjustado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-realizado').innerText = obra.realizadoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-desvio').innerText = (desvio >= 0 ? "+ " : "") + desvio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-idc').innerText = idc;

  // Renderizar DRE por Categorias da Obra
  const tbodyDRE = document.getElementById('tabela-dre-body');
  tbodyDRE.innerHTML = '';

  const categorias = Object.keys(obra.categoriasMap);
  if (categorias.length > 0) {
    categorias.forEach(cat => {
      const valRealizado = obra.categoriasMap[cat];
      tbodyDRE.innerHTML += `
        <tr class="hover:bg-gray-50">
          <td class="p-3 text-bp-blue font-bold">${cat}</td>
          <td class="p-3 text-right">R$ 0,00</td>
          <td class="p-3 text-right">${valRealizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
          <td class="p-3 text-right text-red-600 font-bold">- ${valRealizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
          <td class="p-3 text-center text-red-600 font-bold">100% Realizado</td>
        </tr>
      `;
    });
  } else {
    tbodyDRE.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-400">Nenhum lançamento filtrado para este Centro de Custo na planilha unificada.</td></tr>`;
  }

  renderizarGridGraficosDinamicos(obra);
}

// MOTOR DE GRÁFICOS DINÂMICOS CUSTOMIZÁVEIS
function renderizarGridGraficosDinamicos(obra) {
  const container = document.getElementById('grid-graficos-dinamicos');
  container.innerHTML = '';

  // Destruir instâncias anteriores
  Object.keys(graficosInstancias).forEach(id => {
    if (graficosInstancias[id]) graficosInstancias[id].destroy();
  });
  graficosInstancias = {};

  graficosConfig.forEach(cfg => {
    const cardHTML = `
      <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 class="font-bold text-bp-blue text-base mb-4">${cfg.titulo}</h3>
        <div class="relative h-72">
          <canvas id="${cfg.id}"></canvas>
        </div>
      </div>
    `;
    container.innerHTML += cardHTML;
  });

  // Renderizar os elementos após inserção no DOM
  setTimeout(() => {
    graficosConfig.forEach(cfg => {
      const canvasElem = document.getElementById(cfg.id);
      if (!canvasElem) return;

      const ctx = canvasElem.getContext('2d');
      let chartData = { labels: [], datasets: [] };

      if (cfg.metrica === "categoria") {
        const labels = Object.keys(obra.categoriasMap);
        const dataVals = Object.values(obra.categoriasMap);
        chartData = {
          labels: labels.length ? labels : ['Sem dados'],
          datasets: [{ data: dataVals.length ? dataVals : [1], backgroundColor: ['#003399', '#00CFFF', '#1E293B', '#94A3B8', '#F59E0B'] }]
        };
      } else {
        chartData = {
          labels: ['Mês 1', 'Mês 2', 'Mês 3'],
          datasets: [
            { label: 'Previsto', data: [obra.previstoTotal * 0.3, obra.previstoTotal * 0.7, obra.previstoTotal], borderColor: '#003399', backgroundColor: 'rgba(0,51,153,0.1)', fill: true },
            { label: 'Realizado Acumulado', data: [obra.realizadoTotal * 0.4, obra.realizadoTotal, obra.realizadoTotal], borderColor: '#00CFFF', backgroundColor: 'rgba(0,207,255,0.2)', fill: true }
          ]
        };
      }

      graficosInstancias[cfg.id] = new Chart(ctx, {
        type: cfg.tipo,
        data: chartData,
        options: { responsive: true, maintainAspectRatio: false }
      });
    });
  }, 100);
}

// CONFIGURAÇÕES
function abrirModalConfiguracoes() {
  document.getElementById('config-app-title').value = document.getElementById('header-app-title').innerText;
  document.getElementById('config-url-unificada').value = urlPlanilhaUnificadaCSV;
  renderizarListaGraficosConfig();
  document.getElementById('modal-configuracoes').classList.remove('hidden');
}

function fecharModalConfiguracoes() {
  document.getElementById('modal-configuracoes').classList.add('hidden');
}

function adicionarNovoGrafico() {
  const titulo = document.getElementById('novo-chart-titulo').value.trim();
  const tipo = document.getElementById('novo-chart-tipo').value;
  const metrica = document.getElementById('novo-chart-metrica').value;

  if (!titulo) {
    alert("Digite o título do novo gráfico.");
    return;
  }

  const novoID = `chart_custom_${Date.now()}`;
  graficosConfig.push({ id: novoID, titulo, tipo, metrica });
  
  document.getElementById('novo-chart-titulo').value = '';
  renderizarListaGraficosConfig();
  alert("Gráfico adicionado! Clique em 'Salvar e Aplicar Alterações'.");
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
      <div class="flex justify-between items-center bg-white p-2 border rounded">
        <div><strong class="text-bp-blue">${g.titulo}</strong> (${g.tipo.toUpperCase()} - ${g.metrica})</div>
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

  urlPlanilhaUnificadaCSV = document.getElementById('config-url-unificada').value.trim() || urlPlanilhaUnificadaCSV;
  sincronizarPlanilhaUnificada();
  fecharModalConfiguracoes();
  alert("Configurações salvas e aplicadas!");
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
  if (usuariosBD.some(u => u.usuario === usuario || u.email === email)) return alert("Login/e-mail já existe.");

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
        <td class="p-2 text-center space-x-1">
          <button onclick="aprovarSolicitacao(${s.id}, 'Engenheiro')" class="bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold">Aprovar</button>
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

function aplicarPermissoesPerfil() {
  document.getElementById('user-display-name').innerText = usuarioAutenticado.nome;
  document.getElementById('user-display-role').innerText = usuarioAutenticado.perfil;

  if (usuarioAutenticado.perfil === "Mestre") {
    document.getElementById('btn-gestao-usuarios').classList.remove('hidden');
    document.getElementById('btn-configuracoes').classList.remove('hidden');
    document.getElementById('btn-nova-obra').classList.remove('hidden');
  } else {
    document.getElementById('btn-gestao-usuarios').classList.add('hidden');
    document.getElementById('btn-configuracoes').classList.add('hidden');
  }
}

function abrirModalNovaObra() { document.getElementById('modal-obra').classList.remove('hidden'); }
function fecharModalNovaObra() { document.getElementById('modal-obra').classList.add('hidden'); }

function salvarNovaObra() {
  const nome = document.getElementById('cad-nome').value.trim();
  const cc = document.getElementById('cad-cc').value.trim();
  const resp = document.getElementById('cad-resp').value.trim();
  const prevTotal = parseFloat(document.getElementById('cad-previsto-total').value) || 0;

  if (!nome || !cc) return alert("Preencha o Nome e o Centro de Custo exato.");

  const id = `OBRA-${Date.now()}`;
  obrasBD[id] = { id, nome, cc, responsavel: resp, previstoTotal: prevTotal, realizadoTotal: 0, lancamentos: [], dre: [], categoriasMap: {} };

  obraAtivaID = id;
  popularSeletorObras();
  sincronizarPlanilhaUnificada();
  fecharModalNovaObra();
  alert("Obra cadastrada com sucesso!");
}
