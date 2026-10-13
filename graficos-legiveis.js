// Mantém os rótulos completos nos dados e nos filtros; abrevia apenas a apresentação.
function abreviarRotuloGrafico(valor,limite=22){const texto=String(valor??'');return texto.length>limite?texto.slice(0,limite-3).trimEnd()+'...':texto;}
if(typeof Chart!=='undefined')Chart.register({
 id:'rotulosLegiveisBP',
 beforeInit(chart){
  const options=chart.config.options, tipo=chart.config.type;
  if(['bar','line'].includes(tipo)){
   const eixo=options.indexAxis==='y'?'y':'x';options.scales||={};options.scales[eixo]||={};
   options.scales[eixo].ticks={...options.scales[eixo].ticks,autoSkip:true,maxTicksLimit:eixo==='y'?14:9,minRotation:0,maxRotation:0,callback:function(valor){return abreviarRotuloGrafico(this.getLabelForValue(valor),eixo==='y'?30:18);}};
  }
  if(['radar','polarArea'].includes(tipo)){options.scales||={};options.scales.r||={};options.scales.r.pointLabels={...options.scales.r.pointLabels,callback:label=>abreviarRotuloGrafico(label,20)};}
  options.plugins||={};options.plugins.legend||={};options.plugins.legend.labels||={};
  const gerar=options.plugins.legend.labels.generateLabels||Chart.defaults.plugins.legend.labels.generateLabels;
  options.plugins.legend.labels.generateLabels=c=>gerar(c).map(item=>({...item,textoCompleto:item.text,text:abreviarRotuloGrafico(item.text,28)}));
  options.plugins.legend.onHover=(event,item)=>{chart.canvas.title=item.textoCompleto||item.text;};
  options.plugins.legend.onLeave=()=>{chart.canvas.title='';};
 },
 afterEvent(chart,args){
  const event=args.event;let texto='';
  if(event.type!=='mouseout')for(const scale of Object.values(chart.scales)){
   if(scale.type!=='category')continue;
   const dentro=scale.axis==='x'?event.x>=scale.left&&event.x<=scale.right&&event.y>=scale.top&&event.y<=scale.bottom:event.x>=scale.left&&event.x<=scale.right&&event.y>=scale.top&&event.y<=scale.bottom;
   if(dentro){texto=String(scale.getLabelForValue(scale.getValueForPixel(scale.axis==='x'?event.x:event.y))??'');break;}
  }
  let dica=chart.$dicaRotulo;
  if(!texto){if(dica)dica.hidden=true;return;}
  if(!dica){dica=document.createElement('div');dica.className='dica-rotulo-grafico';dica.setAttribute('role','tooltip');chart.canvas.parentElement.append(dica);chart.$dicaRotulo=dica;}
  dica.textContent=texto;dica.hidden=false;dica.style.left=Math.max(0,Math.min(event.x,chart.width-220))+'px';dica.style.top=Math.max(0,event.y-65)+'px';
 },
 afterDestroy(chart){chart.$dicaRotulo?.remove();}
});
