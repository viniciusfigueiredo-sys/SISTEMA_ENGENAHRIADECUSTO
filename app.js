// BANCO DE DADOS DE USUÁRIOS (MESTRE PREDETERMINADO)
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
let obrasBD = {};

let usuarioAutenticado = null;
let obraAtivaID = null;
let multiplicadorCenario = 1;
let chartCurvaS = null;
let chartCategorias = null;

// INICIALIZAÇÃO E PERSISTÊNCIA DA SESSÃO
window.onload = function() {
  const sessaoSalva = localStorage.getItem('usuario_bp');
  if (sessaoSalva) {
    try {
      usuarioAutenticado = JSON.parse(sessaoSalva);
    } catch(e) {
      usuarioAutenticado = null;
    }
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

// CADASTRO DIRETO DE USUÁRIO (MESTRE)
function criarUsuarioDireto() {
  const nome = document.getElementById('novo-usr-nome').value.trim();
  const email = document.getElementById('novo-usr-email').value.trim();
  const usuario = document.getElementById('novo-usr-login').value.trim();
  const senha = document.getElementById('novo-usr-senha').value.trim();
  const perfil = document.getElementById('novo-usr-perfil').value;

  if (!nome || !email || !usuario || !senha) {
    alert("Preencha todos os campos do usuário.");
    return;
  }

  if (usuariosBD.some(u => u.usuario === usuario || u.email === email)) {
    alert("Erro: Este login ou e-mail já existe.");
    return;
  }

  usuariosBD.push({ nome, usuario, email, senha, perfil, status: "Aprovado" });
  renderizarPainelUsuarios();
  
  document.getElementById('novo-usr-nome').value = '';
  document.getElementById('novo-usr-email').value = '';
  document.getElementById('novo-usr-login').value = '';
  document.getElementById('novo-usr-senha').value = '';
  
  alert(`Usuário ${usuario} criado com sucesso!`);
}

// SOLICITAÇÃO & APROVAÇÃO
function exibirFormSolicitacao() {
  document.getElementById('box-login').classList.add('hidden');
  document.getElementById('box-solicitacao').classList.remove('hidden');
}

function exibirFormLogin() {
  document.getElementById('box-solicitacao').classList.add('hidden');
  document.getElementById('box-login').classList.remove('hidden');
}

function solicitarCadastro() {
  const nome = document.getElementById('solic-nome').value.trim();
  const email = document.getElementById('solic-email').value.trim();
  const usuario = document.getElementById('solic-usuario').value.trim();
  const senha = document.getElementById('solic-senha').value.trim();

  if (!nome || !email || !usuario || !senha) {
    alert("Preencha todos os campos para solicitar o cadastro.");
    return;
  }

  solicitacoesPendentesBD.push({
    id: Date.now(),
    nome, email, usuario, senha,
    perfil: "Engenheiro",
    status: "Pendente"
  });
  
  exibirFormLogin();
  alert("Solicitação enviada ao Mestre!");
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

// SIMULAÇÃO DE CENÁRIOS
function aplicarCenario(fator) {
  multiplicadorCenario = parseFloat(fator);
  atualizarDashboard();
}

// DASHBOARD
function popularSeletorObras() {
  const seletor = document.getElementById('seletor-obra');
  seletor.innerHTML = '';
  
  const chavesObras = Object.keys(obrasBD);

  if (chavesObras.length === 0) {
    seletor.innerHTML = `<option value="">Nenhuma obra cadastrada</option>`;
    obraAtivaID = null;
    return;
  }

  chavesObras.forEach(k => {
    seletor.innerHTML += `<option value="${k}">${obrasBD[k].nome}</option>`;
  });

  if (!obraAtivaID || !obrasBD[obraAtivaID]) {
    obraAtivaID = chavesObras[0];
  }
  seletor.value = obraAtivaID;
}

function alterarObraAtiva(id) {
  obraAtivaID = id;
  atualizarDashboard();
}

function atualizarDashboard() {
  if (!obraAtivaID || !obrasBD[obraAtivaID]) {
    document.getElementById('obra-titulo').innerText = "Nenhuma Obra Cadastrada";
    document.getElementById('obra-cc').innerText = "---";
    document.getElementById('obra-resp').innerText = "---";

    document.getElementById('kpi-previsto').innerText = "R$ 0,00";
    document.getElementById('kpi-realizado').innerText = "R$ 0,00";
    document.getElementById('kpi-desvio').innerText = "R$ 0,00";
    document.getElementById('kpi-idc').innerText = "0.00";

    document.getElementById('tabela-dre-body').innerHTML = `
      <tr>
        <td colspan="5" class="p-6 text-center text-gray-400 font-medium">
          Nenhuma obra cadastrada até o momento. Clique no botão <strong>"➕ Cadastrar Obra"</strong> acima para começar.
        </td>
      </tr>
    `;

    if (chartCurvaS) chartCurvaS.destroy();
    if (chartCategorias) chartCategorias.destroy();
    return;
  }

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

  const tbodyDRE = document.getElementById('tabela-dre-body');
  tbodyDRE.innerHTML = '';
  if (obra.dre && obra.dre.length > 0) {
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
  } else {
    tbodyDRE.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-gray-400">Aguardando sincronização com as planilhas do Google Sheets.</td></tr>`;
  }

  renderizarGraficosBI(obra);
}

function renderizarGraficosBI(obra) {
  if (chartCurvaS) chartCurvaS.destroy();
  if (chartCategorias) chartCategorias.destroy();

  const ctxCurvaS = document.getElementById('chartCurvaS').getContext('2d');
  chartCurvaS = new Chart(ctxCurvaS, {
    type: 'line',
    data: {
      labels: obra.meses || ['Mês 1'],
      datasets: [
        { label: 'Previsto Cenário', data: (obra.curvaPrevisto || [0]).map(v => v * multiplicadorCenario), borderColor: '#003399', backgroundColor: 'rgba(0, 51, 153, 0.1)', fill: true },
        { label: 'Realizado', data: obra.curvaRealizado || [0], borderColor: '#00CFFF', backgroundColor: 'rgba(0, 207, 255, 0.2)', fill: true }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  const ctxCat = document.getElementById('chartCategorias').getContext('2d');
  chartCategorias = new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: ['Mão de Obra', 'Materiais', 'Equipamentos', 'Outros'],
      datasets: [{ data: obra.catValores || [0, 0, 0, 0], backgroundColor: ['#003399', '#00CFFF', '#1E293B', '#94A3B8'] }]
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

function salvarNovaObra() { 
  const nome = document.getElementById('cad-nome').value.trim();
  const cc = document.getElementById('cad-cc').value.trim();
  const resp = document.getElementById('cad-resp').value.trim();

  if (!nome || !cc || !resp) {
    alert("Preencha o Nome, Centro de Custo e Responsável.");
    return;
  }

  const id = `OBRA-0${Object.keys(obrasBD).length + 1}`;
  
  obrasBD[id] = {
    id: id,
    nome: nome,
    cc: cc,
    responsavel: resp,
    previstoTotal: 0,
    realizadoTotal: 0,
    urlPrevisto: document.getElementById('cad-url-previsto').value,
    urlRealizado: document.getElementById('cad-url-realizado').value,
    dre: [],
    meses: ['Mês 1'],
    curvaPrevisto: [0],
    curvaRealizado: [0],
    catValores: [0, 0, 0, 0]
  };

  obraAtivaID = id;
  popularSeletorObras();
  atualizarDashboard();
  fecharModalNovaObra();
  
  document.getElementById('cad-nome').value = '';
  document.getElementById('cad-cc').value = '';
  document.getElementById('cad-resp').value = '';
  document.getElementById('cad-url-previsto').value = '';
  document.getElementById('cad-url-realizado').value = '';

  alert("Obra cadastrada com sucesso!"); 
}

function sincronizarGoogleSheets() { 
  alert("Sincronizando dados com as URLs do Google Sheets..."); 
}
