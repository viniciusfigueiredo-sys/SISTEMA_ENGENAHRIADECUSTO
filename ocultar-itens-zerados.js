// Remove grupos sem valores, mantendo categorias N/P com pagamentos.
function grupoTemValores(row){if('previsto' in row||'realizado' in row)return Number(row.previsto||0)!==0||Number(row.realizado||0)!==0;if(typeof row.valor==='number')return row.valor!==0;if(typeof row.contagem==='number')return row.contagem>0;return true;}
const linhasGraficoAntesRelevantes=obterLinhasGrafico;
obterLinhasGrafico=function(cfg,obra,cats){return linhasGraficoAntesRelevantes(cfg,obra,cats).filter(grupoTemValores);};
const gruposPainelAntesRelevantes=gruposPainel;
gruposPainel=function(rows,x,y,agregacao){return gruposPainelAntesRelevantes(rows,x,y,agregacao).filter(grupoTemValores);};
