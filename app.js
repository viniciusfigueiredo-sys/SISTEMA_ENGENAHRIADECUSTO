// BANCO DE DADOS GLOBAL DE OBRAS E USUÁRIOS
let obrasBD = {
  "OBRA-01": {
    id: "OBRA-01",
    nome: "Ponte Rio Verde - Trecho 01",
    cc: "CC-2026-01",
    responsavel: "Eng. Vinícius Figueiredo",
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

let usuariosBD = [
  { nome: "Administrador Mestre", email: "mestre@brasilpontes.com.br", perfil: "Mestre" },
  { nome: "Engenheiro de Campo", email: "engenheiro@brasilpontes.com.br", perfil: "Engenheiro" },
  { nome: "Diretoria", email: "diretoria@brasilpontes.com.br", perfil: "Dono" }
];

let usuarioLogado = usuariosBD[0]; // Padrão: Mestre
let obraAtivaID = "OBRA-01";
let chartCurvaS = null;
let chartCategorias = null;

// INICIALIZAÇÃO DA APLICAÇÃO
window.onload = function() {
  popularSeletorObras();
  renderizarUsuarios();
  atualizarDashboard();
  aplicarPermissoesPerfil();
};

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

  // 1. Atualizar Informações da Obra
  document.getElementById('obra-titulo').innerText = obra.nome;
  document.getElementById('obra-cc').innerText = obra.cc;
  document.getElementById('obra-resp').innerText = obra.responsavel;

  // 2. Cálculo dos KPIs
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

  // 3. Renderizar Tabela EAP e Gráficos BI
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

// GRÁFICOS POWER BI INTERATIVOS COM DRILL-DOWN E FILTROS
function renderizarGraficosBI(obra) {
  if (chartCurvaS) chartCurvaS.destroy();
  if (chartCategorias) chartCategorias.destroy();

  // 1. Gráfico Curva S
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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          alert(`Filtrando dados para o mês: ${obra.meses[index]}`);
        }
      }
    }
  });

  // 2. Gráfico por Categoria (Interativo)
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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const catSelecionada = ['Mão de Obra', 'Materiais', 'Equipamentos', 'Outros'][index];
          const eapFiltrada = obra.eap.filter(item => item.cat === catSelecionada);
          renderizarTabelaEAP(eapFiltrada);
        }
      }
    }
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

// GESTÃO DE OBRAS (CRIAR E VINCULAR PLANILHAS)
function abrirModalNovaObra() {
  document.getElementById('modal-obra').classList.remove('hidden');
}

function fecharModalNovaObra() {
  document.getElementById('modal-obra').classList.add('hidden');
}

function salvarNovaObra(e) {
  e.preventDefault();
  const id = `OBRA-0${Object.keys(obrasBD).length + 1}`;
  
  const novaObra = {
    id: id,
    nome: document.getElementById('cad-nome').value,
    cc: document.getElementById('cad-cc').value,
    responsavel: document.getElementById('cad-resp').value,
    previstoTotal: 0,
    realizadoTotal: 0,
    urlPrevisto: document.getElementById('cad-url-previsto').value,
    urlRealizado: document.getElementById('cad-url-realizado').value,
    eap: [],
    meses: ['Mês 1', 'Mês 2', 'Mês 3'],
    curvaPrevisto: [0, 0, 0],
    curvaRealizado: [0, 0, 0],
    catValores: [0, 0, 0, 0]
  };

  obrasBD[id] = novaObra;
  popularSeletorObras();
  alterarObraAtiva(id);
  fecharModalNovaObra();
  alert("Obra cadastrada com sucesso! Sincronize com o Google Sheets para puxar os dados.");
}

// PERMISSÕES E USUÁRIOS
function abrirModalUsuarios() {
  document.getElementById('modal-usuarios').classList.remove('hidden');
}

function fecharModalUsuarios() {
  document.getElementById('modal-usuarios').classList.add('hidden');
}

function cadastrarNovoUsuario(e) {
  e.preventDefault();
  const novo = {
    nome: document.getElementById('usr-nome').value,
    email: document.getElementById('usr-email').value,
    perfil: document.getElementById('usr-perfil').value
  };

  usuariosBD.push(novo);
  renderizarUsuarios();
  alert(`Usuário ${novo.nome} cadastrado como ${novo.perfil}!`);
}

function renderizarUsuarios() {
  const tbody = document.getElementById('tabela-usuarios-body');
  tbody.innerHTML = '';
  usuariosBD.forEach(u => {
    tbody.innerHTML += `
      <tr>
        <td class="p-2 font-bold">${u.nome}</td>
        <td class="p-2 text-gray-500">${u.email}</td>
        <td class="p-2"><span class="bg-bp-blue text-white px-2 py-0.5 rounded text-[10px] font-bold">${u.perfil}</span></td>
        <td class="p-2 text-center"><button class="text-red-600 font-bold">Excluir</button></td>
      </tr>
    `;
  });
}

function aplicarPermissoesPerfil() {
  document.getElementById('user-display-name').innerText = usuarioLogado.nome;
  document.getElementById('user-display-role').innerText = usuarioLogado.perfil;

  if (usuarioLogado.perfil === "Dono") {
    document.getElementById('btn-nova-obra').classList.add('hidden');
    document.getElementById('btn-gestao-usuarios').classList.add('hidden');
  }
}

function sincronizarGoogleSheets() {
  alert("Sincronizando BI com as URLs publicadas do Google Sheets...");
}
