// BANCO DE DADOS DE USUÁRIOS (MESTRE E APROVADOS)
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

// SOLICITAÇÕES DE CADASTRO PENDENTES
let solicitacoesPendentesBD = [];

// BANCO DE DADOS GLOBAL DE OBRAS
let obrasBD = {
  "OBRA-01": {
    id: "OBRA-01",
    nome: "Ponte Rio Verde - Trecho 01",
    cc: "CC-2026-01",
    responsavel: "Eng. Vinícius Souza",
    previstoTotal: 1250000,
    realizadoTotal: 980000,
    urlPrevisto: "",
    urlRealizado: "",
    eap: [
      { cod: "1.0", desc: "Serviços Preliminares e Canteiro", cat: "Mão de Obra", previsto: 100000, realizado: 95000 },
      { cod: "2.0", desc: "Infraestrutura e Fundações", cat: "Materiais", previsto: 450000, realizado: 480000 },
      { cod: "3.0", desc: "Mesorregião e Pilares", cat: "Equipamentos", previsto: 350000, realizado: 280000 },
      { cod: "4.0", desc: "Superestrutura e Vigas", cat: "Outros", previsto: 350000, realizado: 125000 }
    ],
    meses: ['Mês 1', 'Mês 2', 'Mês 3', 'Mês 4', 'Mês 5', 'Mês 6'],
    curvaPrevisto: [150000, 350000, 600000, 850000, 1050000, 1250000],
    curvaRealizado: [140000, 370000, 580000, 980000, null, null],
    catValores: [400000, 480000, 280000, 125000]
  }
};

let usuarioAutenticado = null;
let obraAtivaID = "OBRA-01";
let chartCurvaS = null;
let chartCategorias = null;

// VERIFICAÇÃO DE SEGURANÇA E INICIALIZAÇÃO
window.onload = function() {
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

// LÓGICA DE LOGIN E AUTENTICAÇÃO
function executarLogin(e) {
  e.preventDefault();
  const inputUser = document.getElementById('login-usuario').value.trim();
  const inputSenha = document.getElementById('login-senha').value.trim();

  const usuarioEncontrado = usuariosBD.find(u => 
    (u.usuario === inputUser || u.email === inputUser) && u.senha === inputSenha
  );

  if (usuarioEncontrado) {
    if (usuarioEncontrado.status === "Aprovado") {
      usuarioAutenticado = usuarioEncontrado;
      document.getElementById('login-usuario').value = '';
      document.getElementById('login-senha').value = '';
      verificarSessao();
    } else {
      alert("Sua conta ainda está pendente de aprovação pelo usuário Mestre.");
    }
  } else {
    alert("Erro de Autenticação: Usuário ou senha incorretos.");
  }
}

function executarLogout() {
  usuarioAutenticado = null;
  verificarSessao();
}

// LÓGICA DE SOLICITAÇÃO DE CADASTRO
function exibirFormSolicitacao() {
  document.getElementById('form-login').classList.add('hidden');
  document.getElementById('form-solicitacao').classList.remove('hidden');
}

function exibirFormLogin() {
  document.getElementById('form-solicitacao').classList.add('hidden');
  document.getElementById('form-login').classList.remove('hidden');
}

function solicitarCadastro(e) {
  e.preventDefault();
  const nome = document.getElementById('solic-nome').value.trim();
  const email = document.getElementById('solic-email').value.trim();
  const usuario = document.getElementById('solic-usuario').value.trim();
  const senha = document.getElementById('solic-senha').value.trim();

  // Verificar duplicidade
  if (usuariosBD.some(u => u.usuario === usuario || u.email === email)) {
    alert("Este usuário ou e-mail já possui cadastro no sistema.");
    return;
  }

  solicitacoesPendentesBD.push({
    id: Date.now(),
    nome,
    email,
    usuario,
    senha,
    perfil: "Engenheiro",
    status: "Pendente"
  });

  document.getElementById('form-solicitacao').reset();
  exibirFormLogin();
  alert("Solicitação enviada com sucesso! Aguarde a aprovação do usuário Mestre.");
  atualizarBadgePendentes();
}

// APROVAÇÃO DE CADASTROS PELO MESTRE
function aprovarSolicitacao(id, perfilDefinido) {
  const index = solicitacoesPendentesBD.findIndex(s => s.id === id);
  if (index !== -1) {
    const sol = solicitacoesPendentesBD[index];
    sol.status = "Aprovado";
    sol.perfil = perfilDefinido;
    
    usuariosBD.push(sol);
    solicitacoesPendentesBD.splice(index, 1);
    
    renderizarPainelUsuarios();
    atualizarBadgePendentes();
    alert(`Usuário ${sol.usuario} APROVADO com perfil ${perfilDefinido}!`);
  }
}

function rejeitarSolicitacao(id) {
  solicitacoesPendentesBD = solicitacoesPendentesBD.filter(s => s.id !== id);
  renderizarPainelUsuarios();
  atualizarBadgePendentes();
  alert("Solicitação rejeitada.");
}

function atualizarBadgePendentes() {
  const badge = document.getElementById('badge-pendentes');
  if (solicitacoesPendentesBD.length > 0) {
    badge.innerText = solicitacoesPendentesBD.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// REGRAS DE PERMISSÃO DE ACESSO
function aplicarPermissoesPerfil() {
  document.getElementById('user-display-name').innerText = usuarioAutenticado.nome;
  document.getElementById('user-display-role').innerText = usuarioAutenticado.perfil;

  if (usuarioAutenticado.perfil === "Mestre") {
    document.getElementById('btn-gestao-usuarios').classList.remove('hidden');
    document.getElementById('btn-nova-obra').classList.remove('hidden');
  } else {
    document.getElementById('btn-gestao-usuarios').classList.add('hidden');
    if (usuarioAutenticado.perfil === "Dono") {
      document.getElementById('btn-nova-obra').classList.add('hidden');
    }
  }
}

// PAINEL DE USUÁRIOS
function abrirModalUsuarios() {
  renderizarPainelUsuarios();
  document.getElementById('modal-usuarios').classList.remove('hidden');
}

function fecharModalUsuarios() {
  document.getElementById('modal-usuarios').classList.add('hidden');
}

function renderizarPainelUsuarios() {
  // 1. Tabela de Pendentes
  const tbodyPend = document.getElementById('tabela-pendentes-body');
  document.getElementById('count-pendentes').innerText = solicitacoesPendentesBD.length;
  tbodyPend.innerHTML = '';

  if (solicitacoesPendentesBD.length === 0) {
    tbodyPend.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-gray-400">Nenhuma solicitação pendente no momento.</td></tr>`;
  } else {
    solicitacoesPendentesBD.forEach(s => {
      tbodyPend.innerHTML += `
        <tr>
          <td class="p-2 font-bold">${s.nome}</td>
          <td class="p-2">${s.email}</td>
          <td class="p-2 text-bp-blue font-bold">${s.usuario}</td>
          <td class="p-2 text-center space-x-1">
            <button onclick="aprovarSolicitacao(${s.id}, 'Engenheiro')" class="bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold">Aprovar Eng.</button>
            <button onclick="aprovarSolicitacao(${s.id}, 'Dono')" class="bg-bp-blue text-white px-2 py-1 rounded text-[10px] font-bold">Aprovar Diretoria</button>
            <button onclick="rejeitarSolicitacao(${s.id})" class="bg-red-600 text-white px-2 py-1 rounded text-[10px] font-bold">Rejeitar</button>
          </td>
        </tr>
      `;
    });
  }

  // 2. Tabela de Ativos
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

// LÓGICA DO DASHBOARD BI
function popularSeletorObras() {
  const seletor = document.getElementById('seletor-obra');
  seletor.innerHTML = '';
  Object.keys(obrasBD).forEach(key => {
    seletor.innerHTML += `<option value="${key}">${obrasBD[key].nome}</option>`;
  });
  seletor.value = obraAtivaID;
}

function alterarObraAtiva(id) {
  obraAtivaID = id;
  atualizarDashboard();
}

function atualizarDashboard() {
  const obra = obrasBD[obraAtivaID];

  document.getElementById('obra-titulo').innerText = obra.nome;
  document.getElementById('obra-cc').innerText = obra.cc;
  document.getElementById('obra-resp').innerText = obra.responsavel;

  const desvio = obra.previstoTotal - obra.realizadoTotal;
  const percentualDesvio = ((desvio / obra.previstoTotal) * 100).toFixed(1);
  const idc = (obra.previstoTotal / obra.realizadoTotal).toFixed(2);

  document.getElementById('kpi-previsto').innerText = obra.previstoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-realizado').innerText = obra.realizadoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  const kpiDesvio = document.getElementById('kpi-desvio');
  const kpiDesvioPercent = document.getElementById('kpi-desvio-percent');
  const cardDesvio = document.getElementById('card-desvio');

  kpiDesvio.innerText = (desvio >= 0 ? "+ " : "") + desvio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  if (desvio >= 0) {
    kpiDesvio.className = "text-2xl font-black text-emerald-600 mt-1";
    kpiDesvioPercent.className = "text-[11px] font-bold text-emerald-600 mt-1";
    kpiDesvioPercent.innerText = `${percentualDesvio}% dentro do orçamento`;
    cardDesvio.className = "bg-white p-5 rounded-xl shadow-sm border-l-4 border-emerald-500 hover:shadow-md transition-shadow";
  } else {
    kpiDesvio.className = "text-2xl font-black text-red-600 mt-1";
    kpiDesvioPercent.className = "text-[11px] font-bold text-red-600 mt-1";
    kpiDesvioPercent.innerText = `${Math.abs(percentualDesvio)}% estourado`;
    cardDesvio.className = "bg-white p-5 rounded-xl shadow-sm border-l-4 border-red-500 hover:shadow-md transition-shadow";
  }

  document.getElementById('kpi-idc').innerText = idc;
  document.getElementById('kpi-idc-status').innerText = idc >= 1.0 ? "Eficiente (No Custo)" : "Atenção (Acima do Custo)";

  renderizarTabelaEAP(obra.eap);
  renderizarGraficosBI(obra);
}

function renderizarTabelaEAP(listaEAP) {
  const tbody = document.getElementById('tabela-eap-body');
  tbody.innerHTML = '';

  listaEAP.forEach(item => {
    const desvioItem = item.previsto - item.realizado;
    const estourou = desvioItem < 0;

    tbody.innerHTML += `
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="p-3 font-bold text-bp-blue">${item.cod}</td>
        <td class="p-3">${item.desc}</td>
        <td class="p-3"><span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold">${item.cat}</span></td>
        <td class="p-3 text-right">${item.previsto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-right">${item.realizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-right font-bold ${estourou ? 'text-red-600' : 'text-emerald-600'}">
          ${desvioItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </td>
        <td class="p-3 text-center">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${estourou ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}">
            ${estourou ? 'ESTOURADO' : 'OK'}
          </span>
        </td>
      </tr>
    `;
  });
}

function renderizarGraficosBI(obra) {
  if (chartCurvaS) chartCurvaS.destroy();
  if (chartCategorias) chartCategorias.destroy();

  const ctxCurvaS = document.getElementById('chartCurvaS').getContext('2d');
  chartCurvaS = new Chart(ctxCurvaS, {
    type: 'line',
    data: {
      labels: obra.meses,
      datasets: [
        { label: 'Previsto Acumulado', data: obra.curvaPrevisto, borderColor: '#003399', backgroundColor: 'rgba(0, 51, 153, 0.1)', fill: true, tension: 0.3 },
        { label: 'Realizado Acumulado', data: obra.curvaRealizado, borderColor: '#00CFFF', backgroundColor: 'rgba(0, 207, 255, 0.2)', fill: true, tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  const ctxCat = document.getElementById('chartCategorias').getContext('2d');
  chartCategorias = new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: ['Mão de Obra', 'Materiais', 'Equipamentos', 'Outros'],
      datasets: [{
        data: obra.catValores,
        backgroundColor: ['#003399', '#00CFFF', '#1E293B', '#94A3B8']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function resetarFiltrosGrafico() {
  renderizarTabelaEAP(obrasBD[obraAtivaID].eap);
}

function filtrarTabelaEAP() {
  const busca = document.getElementById('input-busca-eap').value.toLowerCase();
  const eapFiltrada = obrasBD[obraAtivaID].eap.filter(item => 
    item.desc.toLowerCase().includes(busca) || item.cod.toLowerCase().includes(busca)
  );
  renderizarTabelaEAP(eapFiltrada);
}

function abrirModalNovaObra() {
  document.getElementById('modal-obra').classList.remove('hidden');
}

function fecharModalNovaObra() {
  document.getElementById('modal-obra').classList.add('hidden');
}

function salvarNovaObra(e) {
  e.preventDefault();
  const id = `OBRA-0${Object.keys(obrasBD).length + 1}`;
  
  obrasBD[id] = {
    id: id,
    nome: document.getElementById('cad-nome').value,
    cc: document.getElementById('cad-cc').value,
    responsavel: document.getElementById('cad-resp').value,
    previstoTotal: 0,
    realizadoTotal: 0,
    urlPrevisto: document.getElementById('cad-url-previsto').value,
    urlRealizado: document.getElementById('cad-url-realizado').value,
    eap: [],
    meses: ['Mês 1', 'Mês 2'],
    curvaPrevisto: [0, 0],
    curvaRealizado: [0, 0],
    catValores: [0, 0, 0, 0]
  };

  popularSeletorObras();
  alterarObraAtiva(id);
  fecharModalNovaObra();
  alert("Obra registrada!");
}

function sincronizarGoogleSheets() {
  alert("Sincronizando dados com o Google Sheets...");
}
