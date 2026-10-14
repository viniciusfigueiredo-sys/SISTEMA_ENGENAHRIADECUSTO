// Ajuda local: não lê valores dos campos nem envia informações.
const AJUDA_ITENS={
 'a cada':'Intervalo entre as ocorrências. Combine com Recorrência: 1 mês = mensal; 3 meses = trimestral; 15 dias = a cada 15 dias.',
 'recorrencia':'Unidade do intervalo: dias, meses ou anos. Em Custos Fixos, define a projeção do parâmetro; não registra pagamentos na planilha de Realizado.',
 'primeiro vencimento':'Data da primeira ocorrência do custo. As próximas datas são calculadas a partir dela, usando o intervalo e a unidade escolhidos.',
 'fim opcional':'Última data considerada para este custo. Sem uma data final, o parâmetro continua sendo projetado nos períodos consultados.',
 'nome do custo':'Nome que identifica este parâmetro da obra, por exemplo: equipe administrativa ou aluguel do escritório.',
 'fornecedor':'Empresa ou pessoa relacionada ao custo. Use o mesmo nome da base para facilitar a identificação e a comparação.',
 'categoria':'Classificação do custo. Nos custos fixos, a lista vem das categorias das planilhas da obra selecionada.',
 'valor unitario r$':'Valor de uma unidade do custo em cada ocorrência. O total por ocorrência é valor unitário × quantidade.',
 'valor unitario':'Valor de uma unidade. Multiplicado pela quantidade, forma o custo de cada ocorrência.',
 'quantidade':'Número de unidades do custo. Exemplo: R$ 1.500 × 2 pessoas = R$ 3.000 por ocorrência.',
 'custos fixos':'Parâmetros cadastrados para projetar custos da obra. Podem ser alterados e comparados ao orçamento; não comprovam pagamentos realizados.',
 'pagamentos recorrentes':'Identifica repetições nos pagamentos da planilha de Realizado, agrupados por fornecedor e categoria, conforme o mínimo de meses configurado.',
 'analises':'Resumo da obra selecionada. KPIs, demonstrativo e gráficos acompanham os filtros ativos.',
 'pesquisa':'Pesquise categorias, itens ou descrições para consultar os valores e indicadores daquele conjunto de registros da obra.',
 'realizado':'Pagamentos importados das fontes de Realizado. Os valores reconhecidos alimentam as análises da obra.',
 'previsto':'Orçamento da obra. Serve de referência para comparar os pagamentos realizados e calcular consumo e saldo.',
 'obra em analise':'Escolha a obra que deseja consultar. As abas, indicadores e gráficos usam os dados dessa obra.',
 'custo previsto':'Soma do orçamento previsto correspondente às categorias e à obra em análise. Sem orçamento importado, o valor pode ser zero.',
 'custo realizado':'Soma dos pagamentos reconhecidos para a obra e os filtros ativos, a partir da coluna de valor da base de Realizado.',
 'saldo orcamentario':'Previsto menos Realizado. Saldo negativo indica pagamentos superiores ao orçamento disponível nos filtros atuais.',
 'indice idc':'Índice de desempenho de custos: Previsto ÷ Realizado. Sem uma base válida para a comparação, o índice não permite avaliar o desempenho.',
 'demonstrativo e farol por categoria':'Compara Previsto e Realizado por categoria. Clique em uma categoria ou farol para filtrar os indicadores e gráficos.',
 'velocimetro de consumo do previsto':'Mostra Realizado ÷ Previsto × 100. O ponteiro indica o consumo e as cores usam os limites configurados. N/P significa que não há previsto para comparar.',
 'n/p':'Não previsto: há realizado sem orçamento previsto correspondente. Não é possível calcular um percentual de consumo com base zero.',
 'previsto x realizado':'Compara o orçamento e os pagamentos dos grupos exibidos. A seleção de um grupo aplica o filtro às análises relacionadas.',
 'evolucao do desempenho':'Exibe o indicador de uso do orçamento por categoria nos filtros atuais. Sem Previsto, o percentual não pode ser calculado.',
 'nome da empresa / aplicacao':'Nome exibido no sistema. A alteração é compartilhada após o salvamento.',
 'titulo':'Nome que aparece no painel. Use um título que informe o dado e o agrupamento, como Valor Pago por Categoria.',
 'fonte de dados':'Planilha ou conjunto de dados que fornece os registros do painel. Previsto é associado à obra selecionada.',
 'eixo x':'Campo usado para agrupar os registros, como Categoria ou Fornecedor. Cada valor diferente forma um grupo.',
 'eixo y':'Medida calculada para cada grupo. Para Soma ou Média, escolha uma coluna numérica, como Valor Pago.',
 'coluna do kpi':'Campo usado no cálculo do indicador. Para Soma, Média, Menor ou Maior valor, escolha uma coluna numérica.',
 'agregacao':'Soma adiciona os valores; Média calcula a média; Contagem conta registros; Valores distintos conta valores diferentes; Menor e Maior retornam os extremos.',
 'tipo do grafico':'Forma de apresentar os dados: barras para comparar, linha para acompanhar uma sequência, pizza/rosca para participação, tabela/lista para detalhes e velocímetro para um indicador.',
 'tipo do grafico fixo':'Muda a apresentação do gráfico padrão dessa tela, preservando seus dados e filtros.',
 'maximo de grupos':'Limita quantos grupos aparecem no gráfico. A ordem da tela determina quais grupos são mostrados primeiro.',
 'barras horizontais':'Coloca os grupos no eixo vertical. É útil para nomes longos e comparações entre muitas categorias.',
 'formato':'Forma de exibir o KPI: moeda em reais, número ou percentual. O formato não muda o cálculo.',
 'casas decimais':'Quantidade de dígitos depois da vírgula no indicador. Altera apenas a apresentação, não os valores da base.',
 'filtrar por coluna opcional':'Filtro adicional deste painel. Escolha o campo e informe o valor exato que deve ser incluído.',
 'valor exato do filtro opcional':'Valor que deve coincidir com o campo do filtro adicional. Deixe vazio para não aplicar esse filtro.',
 'exibicao':'Exibe ou oculta este painel compartilhado. Ocultar preserva sua definição para reexibição posterior.',
 'posicao na tela':'Escolha se o painel compartilhado aparece antes dos indicadores existentes ou depois das análises.',
 'ordem de exibicao':'Números menores aparecem primeiro dentro do grupo de painéis. Use 1, 2, 3 para definir a sequência.',
 'ordem no grupo':'Ordem do elemento dentro de seu grupo original. Números menores aparecem primeiro quando o grupo usa uma disposição compatível.',
 'largura no computador':'Metade da linha permite dois painéis lado a lado; linha inteira usa toda a largura. No celular os painéis usam a largura disponível.',
 'largura no grupo':'Original mantém a disposição atual. Linha inteira ocupa toda a linha do grupo em layouts com grade.',
 'altura do grafico px':'Altura do gráfico em pixels. Um valor maior dá mais espaço à visualização sem alterar os dados.',
 'altura px':'Altura do gráfico em pixels. Ajuste para melhorar a leitura no espaço disponível.',
 'ordenacao':'Maior → menor prioriza valores altos; Menor → maior prioriza baixos; A–Z e Z–A ordenam os nomes.',
 'valor para ordenar o demonstrativo':'Escolhe a medida que ordena as categorias quando a tela usa Maior → menor ou Menor → maior.',
 'inicio da faixa amarela %':'Percentual de consumo a partir do qual o farol passa de verde para amarelo.',
 'limite da faixa amarela / inicio vermelho %':'Percentual de consumo que separa atenção (amarelo) de estouro (vermelho). Deve ser maior que o início do amarelo.',
 'escala maxima do velocimetro %':'Fim da escala do ponteiro. Valores acima desse limite continuam sendo apresentados no texto do indicador.',
 'medicao':'Percentual divide o indicador pela referência e multiplica por 100. Valor do indicador mostra a medida diretamente.',
 'referencia':'Base de comparação do velocímetro: orçamento previsto, uma medida da base ou um valor informado.',
 'valor de referencia':'Valor positivo usado como referência quando você escolhe uma referência constante para o velocímetro.',
 'sentido das cores':'Menor é melhor usa verde para valores baixos. Maior é melhor usa verde para valores altos.',
 'inicio da escala':'Menor valor da escala do velocímetro. Deve ficar abaixo dos limites das cores.',
 'fim da escala':'Maior valor da escala do velocímetro. Deve ficar acima dos limites das cores.',
 'limite da faixa verde':'Ponto onde termina o verde e começa a segunda faixa do velocímetro.',
 'limite da faixa amarela':'Ponto onde termina a segunda faixa e começa a última faixa do velocímetro.',
 'categorias nos graficos resumidos':'Máximo de categorias nos gráficos resumidos. Limitar a quantidade melhora a legibilidade.',
 'grupos nos graficos personalizados':'Limite de grupos dos gráficos pessoais. Muitos grupos podem deixar a leitura mais difícil.',
 'registros detalhados na pesquisa':'Máximo de registros apresentados no detalhamento da Pesquisa. Os totais podem considerar mais registros que a lista exibida.',
 'linhas por pagina nas bases e tabelas':'Quantidade padrão de registros exibidos por página. Use a paginação para consultar os demais.',
 'meses distintos para identificar recorrencia':'Mínimo de meses diferentes com pagamentos para classificar um grupo como recorrente.',
 'tela a configurar':'Escolha uma tela para editar apenas suas opções de conteúdo, painéis, tabela e aparência.',
 'titulo da tabela':'Nome exibido acima da tabela de dados.',
 'exibir tabela fixa':'Mostra ou oculta a tabela compartilhada desta tela, preservando sua configuração.',
 'linhas por pagina':'Número de registros por página da tabela. Os demais registros ficam nas próximas páginas.',
 'altura da tabela px':'Altura máxima da área de dados; a tabela usa rolagem quando os registros excedem esse espaço.',
 'origem da tabela':'Fonte que fornece os registros da tabela. Automática usa a fonte padrão da tela e da obra selecionada.',
 'coluna de ordenacao da tabela':'Campo usado para ordenar os registros. Automática usa a medida reconhecida pelo sistema.',
 'ordenacao da tabela':'Escolhe a direção da ordenação dos registros ou segue a ordem definida para a tela.',
 'pagamento de':'Primeira data de pagamento incluída no período. O filtro afeta os pagamentos realizados.',
 'ate':'Última data de pagamento incluída no período.',
 'mes / ano':'Seleciona um mês completo para filtrar os pagamentos realizados.',
 'selecionar varios':'Permite selecionar vários valores ou categorias para analisar a soma do conjunto escolhido.',
 'somar varias selecoes':'Quando ativado, mantém várias seleções no filtro em vez de substituir a seleção anterior.',
 'manutencao do sistema':'Restringe o acesso durante alterações. Somente a conta principal do Mestre permanece liberada enquanto a manutenção está ativa.',
 'quem pode editar as configuracoes':'O Mestre autoriza os usuários por assunto. Marcar uma autorização e salvar permite editar aquele grupo de configurações.',
 'senha de acesso':'Senha da sua conta. Não compartilhe sua senha. Após o limite de inatividade, o sistema exige novo acesso.',
 'exigir troca de senha':'Exige que o usuário defina uma nova senha após entrar com a senha provisória, sem informar a senha anterior.',
 'perfil':'Conjunto de permissões do usuário. O Mestre configura os acessos de cada perfil.',
 'gestor responsavel':'Pessoa responsável pela obra. A informação identifica o gestor nos dados e relatórios.',
 'cenario':'Aplica o cenário de comparação selecionado aos indicadores. Não altera os pagamentos importados.',
 'tabela de dados':'Lista os registros da obra e dos filtros atuais. A configuração define fonte, colunas, altura e paginação.',
 'resumo gerencial e pequenos relatorios':'Leituras calculadas dos dados filtrados: resumo, atenção, maiores custos, categorias e qualidade da base.',
 'pontos de atencao':'Destaca categorias que precisam de conferência pelo consumo do orçamento ou pela ausência de Previsto.',
 'cobertura e qualidade da base':'Indica lacunas entre Previsto e Realizado e a disponibilidade das fontes. Ajuda a identificar comparações incompletas.'
};
function chaveAjuda(texto){return String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^[^a-z0-9]+/,'').replace(/[():?]/g,'').replace(/\s+/g,' ').trim();}
function textoRotuloAjuda(el){if(el.matches('input,select,textarea'))return el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.getAttribute('name')||'';return [...el.childNodes].filter(n=>n.nodeType===3||n.nodeType===1&&!n.matches('input,select,textarea,.bp-ajuda')).map(n=>n.textContent).join(' ').trim();}
function explicacaoAjuda(el){const name=textoRotuloAjuda(el)||el.getAttribute('aria-label')||el.getAttribute('placeholder')||'',key=chaveAjuda(name);if(AJUDA_ITENS[key])return AJUDA_ITENS[key];
 if(el.matches('button')){
 const a=chaveAjuda((el.getAttribute('onclick')||'')+' '+name);
 if(/sincronizar/.test(a))return 'Importa novamente os dados das fontes configuradas. Ao concluir, atualiza as bases e as análises da obra.';
 if(/relatorio|imprimir/.test(a))return 'Gera o relatório da obra e dos filtros atuais. Na impressão do navegador você pode imprimir ou salvar em PDF.';
 if(/arquivar/.test(a))return 'Arquiva a obra. Obras arquivadas ficam disponíveis somente para o Mestre.';
 if(/ocultar/.test(a))return 'Oculta a obra dos seletores e das pesquisas, preservando seus dados para reexibição.';
 if(/reexibir/.test(a))return 'Volta a disponibilizar a obra nos seletores e nas pesquisas, conforme as permissões de acesso.';
 if(/aprovar/.test(a))return 'Aprova a solicitação de acesso do usuário com o perfil e as permissões definidos pelo Mestre.';
 if(/remover/.test(a))return 'Remove a definição deste item. Para painéis fixos, a remoção afeta todos os usuários que visualizam o painel.';
 if(/editar/.test(a)&&!/cancelar/.test(a))return 'Abre os campos do item para alterar sua configuração. Salve para confirmar as alterações.';
 if(/salvar/.test(a))return 'Confirma e salva as alterações do grupo indicado. Confira a mensagem de resultado após o salvamento.';
 if(/limpar|todos os periodos/.test(a))return 'Remove a seleção ou o filtro indicado e volta a mostrar o conjunto disponível para a obra.';
 if(/adicionar|novo cadastro/.test(a))return 'Cria um novo item. Preencha os campos necessários e salve para concluir o cadastro.';
 if(/configuracoes/.test(a))return 'Abre as opções do sistema organizadas em Geral, Fontes de dados, Telas, Obras e Usuários, conforme seu acesso.';
 if(/meus graficos/.test(a))return 'Crie e edite gráficos pessoais, salvos para sua conta. Os painéis fixos compartilhados são configurados em Telas.';
 if(/sair/.test(a))return 'Encerra o acesso desta conta ao sistema.';
 if(/calendario/.test(a))return 'Abre a seleção de datas ou mês/ano para definir o período de pagamento.';
 if(/aplicar datas/.test(a))return 'Aplica o período de pagamento escolhido aos registros, indicadores e gráficos relacionados.';
 if(/anterior|proxima/.test(a))return 'Troca a página de registros da tabela, mantendo a obra e os filtros selecionados.';
 if(/reativar/.test(a))return 'Reativa o item arquivado ou inativo, respeitando suas permissões de acesso.';
 if(/desativar/.test(a))return 'Interrompe a utilização deste parâmetro sem apagar seu cadastro.';
 }
 if(el.matches('th'))return 'Coluna '+name+'. Apresenta este campo dos registros ou do resumo da obra. Nas tabelas de base, o nome corresponde ao cabeçalho da fonte importada.';
 if(/senha/.test(key))return 'Senha da conta indicada. Digite diretamente no campo; nunca envie sua senha a outras pessoas.';
 if(/cnpj|cpf/.test(key))return 'Identificação fiscal registrada na planilha. Serve para identificar e filtrar pessoas ou empresas.';
 if(/e-mail/.test(key))return 'Endereço de e-mail associado ao cadastro e ao acesso da conta.';
 if(/usuario/.test(key))return 'Identificação do usuário usada no cadastro e na gestão de acesso.';
 if(/coluna|campo|eixo/.test(key))return 'Escolha um cabeçalho da fonte de dados. A seleção determina o campo usado no filtro, agrupamento ou cálculo indicado.';
 if(/verde|seguras/.test(key))return 'Categorias abaixo do limite de atenção configurado. Clique para filtrar a análise por este farol.';
 if(/amarelo|atencao/.test(key))return 'Categorias na faixa de atenção configurada. Clique para filtrar a análise por este farol.';
 if(/vermelho|estouradas/.test(key))return 'Categorias acima do limite configurado ou sem Previsto. Consulte a legenda e clique para filtrar.';
 if(el.matches('label')&&el.querySelector('input[type=checkbox]'))return 'Marque para incluir ou exibir '+name+' no grupo indicado. Desmarque para deixar de incluir esse item.';
 if(el.matches('summary'))return 'Abra esta seção para consultar e editar as opções de '+name+'. As alterações só são confirmadas quando você salva.';
 if(el.matches('h2,h3,h4'))return 'Seção '+name+'. Os dados e opções apresentados abaixo correspondem à obra, aos filtros e às permissões atuais.';
 return 'Opção '+name+'. '+(el.matches('button')?'Executa a ação indicada neste grupo.':'Preencha ou selecione o valor utilizado por este cadastro, filtro ou configuração.');
}
// Lista restrita: ajuda somente para conceitos e cálculos que exigem contexto.
const ITENS_COM_AJUDA=new Set([
 'a cada','recorrencia','primeiro vencimento','indice idc','n/p',
 'agregacao','medicao','referencia','sentido das cores',
 'inicio da faixa amarela %','limite da faixa amarela / inicio vermelho %',
 'escala maxima do velocimetro %','limite da faixa verde','limite da faixa amarela',
 'meses distintos para identificar recorrencia'
]);
const ajudaAssociada=new WeakMap();let caixaAjuda,alvoAjuda,timerAjuda;
function esconderAjuda(){if(caixaAjuda)caixaAjuda.hidden=true;alvoAjuda?.setAttribute('aria-expanded','false');alvoAjuda=null;}
function mostrarAjuda(icon){if(!caixaAjuda){caixaAjuda=document.createElement('div');caixaAjuda.id='bp-tooltip-ajuda';caixaAjuda.className='bp-tooltip-ajuda';caixaAjuda.setAttribute('role','tooltip');document.body.append(caixaAjuda);}alvoAjuda?.setAttribute('aria-expanded','false');alvoAjuda=icon;icon.setAttribute('aria-expanded','true');caixaAjuda.textContent=icon.dataset.explicacao;caixaAjuda.hidden=false;const r=icon.getBoundingClientRect(),w=caixaAjuda.offsetWidth,h=caixaAjuda.offsetHeight;caixaAjuda.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';caixaAjuda.style.top=Math.max(8,r.bottom+h+12<innerHeight?r.bottom+8:r.top-h-8)+'px';}
function adicionarAjuda(el){if(el.closest('#relatorio-impressao,.bp-tooltip-ajuda,.bp-ajuda')||el.matches('.sr-only,button,summary,th,h2,h3,h4'))return;
 const key=chaveAjuda(textoRotuloAjuda(el)||el.getAttribute('aria-label'));const anterior=ajudaAssociada.get(el);
 if(!ITENS_COM_AJUDA.has(key)){anterior?.remove();return;}
 if(anterior?.isConnected){anterior.dataset.explicacao=explicacaoAjuda(el);return;}
 const icon=document.createElement('button');icon.type='button';icon.className='bp-ajuda';icon.setAttribute('aria-label','Ajuda: '+(textoRotuloAjuda(el)||el.getAttribute('aria-label')));icon.setAttribute('aria-expanded','false');icon.setAttribute('aria-describedby','bp-tooltip-ajuda');icon.dataset.explicacao=explicacaoAjuda(el);
 icon.addEventListener('mouseenter',()=>mostrarAjuda(icon));icon.addEventListener('mouseleave',esconderAjuda);icon.addEventListener('focus',()=>mostrarAjuda(icon));icon.addEventListener('blur',esconderAjuda);icon.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();mostrarAjuda(icon);});
 // Não altera o texto dos rótulos usado pelos editores e não cria botões dentro de botões.
 if(el.matches('button')&&el.closest('#fixos-form')&&el.parentElement.classList.contains('grid')){const wrap=document.createElement('div');wrap.className='flex items-center gap-1 min-w-0';el.before(wrap);wrap.append(el,icon);}
 else if(el.matches('button,input,select,textarea'))el.after(icon);else el.append(icon);ajudaAssociada.set(el,icon);
}
function instalarAjuda(root=document){if(root.nodeType!==1&&root!==document)return;if(root.matches?.('label,button,h2,h3,h4,summary,th'))adicionarAjuda(root);root.querySelectorAll('label,button:not(.bp-ajuda),h2,h3,h4,summary,th').forEach(adicionarAjuda);
 const controles=[...(root.matches?.('input,select,textarea')?[root]:[]),...root.querySelectorAll('input:not([type=hidden]),select,textarea')];controles.forEach(el=>{const labels=[...(el.labels||[])];if(labels.some(l=>!l.classList.contains('sr-only'))||el.closest('label')||el.previousElementSibling?.matches('label:not(.sr-only)'))return;adicionarAjuda(el);});
 // Indicadores padrão têm rótulos em parágrafos.
 root.querySelectorAll('[id^="kpi-"]').forEach(el=>{const label=el.parentElement?.querySelector('p');if(label)adicionarAjuda(label);});}
document.addEventListener('keydown',e=>{if(e.key==='Escape')esconderAjuda();});document.addEventListener('pointerdown',e=>{if(!e.target.closest('.bp-ajuda,.bp-tooltip-ajuda'))esconderAjuda();});addEventListener('scroll',esconderAjuda,true);
let raizesAjuda=new Set();new MutationObserver(changes=>{for(const c of changes){if(c.target.closest?.('.bp-ajuda,.bp-tooltip-ajuda'))continue;const added=[...c.addedNodes].filter(n=>n.nodeType===1&&!n.matches('.bp-ajuda,.bp-tooltip-ajuda'));added.forEach(n=>raizesAjuda.add(n));if(c.type==='characterData'&&c.target.parentElement)raizesAjuda.add(c.target.parentElement);}if(!raizesAjuda.size)return;clearTimeout(timerAjuda);timerAjuda=setTimeout(()=>{const roots=[...raizesAjuda];raizesAjuda.clear();roots.filter(n=>n.isConnected).forEach(instalarAjuda);},180);}).observe(document.body,{childList:true,subtree:true,characterData:true});
instalarAjuda();
