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

// BANCO DE DADOS GLOBAL DE OBRAS (Inicia vazio)
let obrasBD = {};

let usuarioAutenticado = null;
let obraAtivaID = null;
let multiplicadorCenario = 1;
let chartCurvaS = null;
let chartCategorias = null;
let chartCurvaS = null;
let chartCategorias = null;

// INICIALIZAÇÃO
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

// LOGIN & LOGOUT
function executarLogin(e) {
  e.preventDefault();
  const inputUser = document.getElementById('login-usuario').value.trim();
  const inputSenha = document.getElementById('login-senha').value.trim();

  const user = usuariosBD.find(u => (u.usuario === inputUser || u.email === inputUser) && u.senha === inputSenha);

  if (user) {
    if (user.status === "Aprovado") {
      usuarioAutenticado = user;
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
  verificarSessao();
}

// CADASTRO DIRETO DE USUÁRIO (MESTRE)
function criarUsuarioDireto(e) {
  e.preventDefault();
  const nome = document.getElementById('novo-usr-nome').value.trim();
  const email = document.getElementById('novo-usr-email').value.trim();
  const usuario = document.getElementById('novo-usr-login').value.trim();
  const senha = document.getElementById('novo-usr-senha').value.trim();
  const perfil = document.getElementById('novo-usr-perfil').value;

  if (usuariosBD.some(u => u.usuario === usuario || u.email === email)) {
    alert("Erro: Este login ou e-mail já existe.");
    return;
  }

  usuariosBD.push({ nome, usuario, email, senha, perfil, status: "Aprovado" });
  renderizarPainelUsuarios();
  alert(`Usuário ${usuario} criado com sucesso!`);
}

// SOLICITAÇÃO & APROVAÇÃO
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
  solicitacoesPendentesBD.push({
    id: Date.now(),
    nome: document.getElementById('solic-nome').value,
    email: document.getElementById('solic-email').value,
    usuario: document.getElementById('solic-usuario').value,
    senha: document.getElementById('solic-senha').value,
    perfil: "Engenheiro",
    status: "Pendente"
  });
  exibirFormLogin();
  alert("Solicitação enviada!");
  atualizarBadgePendentes();
}

function aprovarSolicitacao(id, perfil) {
  const index = solicitacoesPendentesBD.findIndex(s => s.id === id);
  if (index !== -1) {
    const sol = solicitacoesPendentesBD[index];
    sol.status = "Aprovado";
    sol.perfil = perfil;
    usuariosBD.push(sol);
    solicitacoesPendentesBD.splice(index, 1);
    renderizarPainelUsuarios();
    atualizarBadgePendentes();
  }
}

function rejeitarSolicitacao(id) {
  solicitacoesPendentesBD = solicitacoesPendentesBD.filter(s => s.id !== id);
  renderizarPainelUsuarios();
  atualizarBadgePendentes();
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

// SIMULAÇÃO DE CENÁRIOS SCOREPLAN
function aplicarCenario(fator) {
  multiplicadorCenario = parseFloat(fator);
  atualizarDashboard();
}

// DASHBOARD & DRE
function popularSeletorObras() {
  const seletor = document.getElementById('seletor-obra');
  seletor.innerHTML = '';
  Object.keys(obrasBD).forEach(k => {
    seletor.innerHTML += `<option value="${k}">${obrasBD[k].nome}</option>`;
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

  const previstoAjustado = obra.previstoTotal * multiplicadorCenario;
  const desvio = previstoAjustado - obra.realizadoTotal;
  const idc = (previstoAjustado / obra.realizadoTotal).toFixed(2);

  document.getElementById('kpi-previsto').innerText = previstoAjustado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-realizado').innerText = obra.realizadoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-desvio').innerText = (desvio >= 0 ? "+ " : "") + desvio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('kpi-idc').innerText = idc;

  // DRE Scoreplan
  const tbodyDRE = document.getElementById('tabela-dre-body');
  tbodyDRE.innerHTML = '';
  obra.dre.forEach(row => {
    const prevRow = row.previsto * multiplicadorCenario;
    const varRow = prevRow - row.realizado;
    const percVar = prevRow ? ((varRow / prevRow) * 100).toFixed(1) : 0;

    tbodyDRE.innerHTML += `
      <tr class="hover:bg-gray-50">
        <td class="p-3 text-bp-blue font-bold">${row.item}</td>
        <td class="p-3 text-right">${prevRow.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-right">${row.realizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-right font-bold ${varRow >= 0 ? 'text-emerald-600' : 'text-red-600'}">${varRow.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="p-3 text-center font-bold ${varRow >= 0 ? 'text-emerald-600' : 'text-red-600'}">${percVar}%</td>
      </tr>
    `;
  });

  renderizarGraficosBI(obra);
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
        { label: 'Previsto Cenário', data: obra.curvaPrevisto.map(v => v * multiplicadorCenario), borderColor: '#003399', backgroundColor: 'rgba(0, 51, 153, 0.1)', fill: true },
        { label: 'Realizado', data: obra.curvaRealizado, borderColor: '#00CFFF', backgroundColor: 'rgba(0, 207, 255, 0.2)', fill: true }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  const ctxCat = document.getElementById('chartCategorias').getContext('2d');
  chartCategorias = new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: ['Mão de Obra', 'Materiais', 'Equipamentos', 'Outros'],
      datasets: [{ data: obra.catValores, backgroundColor: ['#003399', '#00CFFF', '#1E293B', '#94A3B8'] }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function aplicarPermissoesPerfil() {
  document.getElementById('user-display-name').innerText = usuarioAutenticado.nome;
  document.getElementById('user-display-role').innerText = usuarioAutenticado.perfil;

  if (usuarioAutenticado.perfil === "Mestre") {
    document.getElementById('btn-gestao-usuarios').classList.remove('hidden');
    document.getElementById('btn-nova-obra').classList.remove('hidden');
  } else {
    document.getElementById('btn-gestao-usuarios').classList.add('hidden');
  }
}

function abrirModalUsuarios() {
  renderizarPainelUsuarios();
  document.getElementById('modal-usuarios').classList.remove('hidden');
}

function fecharModalUsuarios() {
  document.getElementById('modal-usuarios').classList.add('hidden');
}

function renderizarPainelUsuarios() {
  const tbodyPend = document.getElementById('tabela-pendentes-body');
  document.getElementById('count-pendentes').innerText = solicitacoesPendentesBD.length;
  tbodyPend.innerHTML = '';

  if (solicitacoesPendentesBD.length === 0) {
    tbodyPend.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-gray-400">Nenhuma solicitação pendente.</td></tr>`;
  } else {
    solicitacoesPendentesBD.forEach(s => {
      tbodyPend.innerHTML += `
        <tr>
          <td class="p-2 font-bold">${s.nome}</td>
          <td class="p-2">${s.email}</td>
          <td class="p-2 text-bp-blue font-bold">${s.usuario}</td>
          <td class="p-2 text-center space-x-1">
            <button onclick="aprovarSolicitacao(${s.id}, 'Engenheiro')" class="bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold">Aprovar Eng.</button>
            <button onclick="rejeitarSolicitacao(${s.id})" class="bg-red-600 text-white px-2 py-1 rounded text-[10px] font-bold">Rejeitar</button>
          </td>
        </tr>
      `;
    });
  }

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

function abrirModalNovaObra() { document.getElementById('modal-obra').classList.remove('hidden'); }
function fecharModalNovaObra() { document.getElementById('modal-obra').classList.add('hidden'); }
function salvarNovaObra(e) { e.preventDefault(); alert("Obra criada!"); fecharModalNovaObra(); }
function sincronizarGoogleSheets() { alert("Sincronizando via Google Sheets API..."); }
