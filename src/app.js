import {maximumDrawdown,stages,rebounds,since2015,summary,presetWindow,loadCatalog,loadManifest,loadHistory,daysBetween} from './data.js?v=3e22ec44bac0';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d)=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:d??(Math.abs(v)<10?4:2),maximumFractionDigits:d??(Math.abs(v)<10?4:2)}):'—';
const pct=v=>Number.isFinite(v)?(v*100).toFixed(2)+'%':'—';
const sourceName={csindex:'中证指数官网',sina_hk:'新浪港股指数',sina_archive:'新浪历史归档',csv:'CSV补录',eastmoney:'东方财富',tencent:'腾讯财经',yahoo:'Yahoo Finance',stooq:'Stooq',sina_global:'新浪国际行情',sina_futures:'新浪期货',sina_forex:'新浪外汇',sge:'上金所'};
const statusName={available:'已入库',stale:'保留旧数据',blocked:'访问受限',unavailable:'待补齐',pending:'待导入'};
const state={catalog:[],manifest:{assets:{}},tableRange:'all',tableBasis:'intraday',chartBasis:'intraday',page:1,pageSize:15,asset:'csi300',preset:'all',points:[],visible:[],loadToken:0,rows:[]};
const meta=id=>state.manifest.assets[id]??{status:'pending',count:0};
const assetById=id=>state.catalog.find(a=>a.id===id);
const hasHistory=id=>(meta(id).count??0)>0;
const hasGap=id=>hasHistory(id)&&assetById(id)?.reference_start&&meta(id).first>assetById(id).reference_start;
const getSummary=(id,range=state.tableRange,basis=state.tableBasis)=>meta(id).summaries_by_basis?.[basis]?.[range]??(basis==='close'?meta(id).summaries?.[range]:null);
const basisName=basis=>basis==='intraday'?'日内高低（跨日）':'日收盘';
const alertNames={reached:'已达到',near:'临近目标',far:'未临近',unavailable:'不可计算'};
function alertMarkup(target,depth){const status=target?.status??'unavailable';return `<div class="level-line"><span class="level-label">${depth}%</span><span class="target-alert ${status}">${alertNames[status]}</span></div>`;}
function remainingMarkup(target,depth){return `<div class="level-line"><span class="level-label">${depth}%</span><span>${target?.status==='reached'?'已达 · 0.00%':pct(target?.remainingDrop)}</span></div>`;}
function levelsMarkup(s){return [70,80].map(depth=>`<div class="level-line"><span class="level-label">${depth}%</span>${fmt(s?.targets?.[String(depth)]?.level)}</div>`).join('');}

function statusHTML(id){const m=meta(id),gap=hasGap(id);return `<span class="data-status ${m.status==='available'&&!gap?'':m.status==='stale'||gap?'warning':'error'}">${gap?'早期未齐':statusName[m.status]??'待核验'}</span>`;}
function downloadCSV(filename,rows){
 const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function filteredRows(){
 const group=$('#table-group').value,query=$('#table-search').value.trim().toLowerCase(),filter=$('#table-alert').value;
 let rows=state.catalog.filter(a=>{
  if((group!=='all'&&a.group!==group)||(query&&!(a.name+' '+a.code).toLowerCase().includes(query)))return false;
  const s=getSummary(a.id),states=Object.values(s?.targets??{}).map(t=>t.status);
  return filter==='all'||(filter==='near'?states.includes('near'):filter==='reached'?states.includes('reached'):(s?.alert??'unavailable')===filter);
 });
 if($('#table-sort').value==='drawdown')rows.sort((a,b)=>(getSummary(a.id)?.mdd?.drawdown??Infinity)-(getSummary(b.id)?.mdd?.drawdown??Infinity));
 return rows;
}
function renderTable(){
 state.rows=filteredRows();const total=state.rows.length,pages=Math.max(1,Math.ceil(total/state.pageSize));state.page=Math.min(state.page,pages);
 $('#table-count').textContent=`${total} 个标的 · ${state.rows.filter(a=>hasHistory(a.id)).length} 个有数据`;
 $('#table-period').textContent=(state.tableRange==='all'?'历史至今：数据源可用范围':'2015高点至今：从各标的当年所选口径高点起算')+' · '+basisName(state.tableBasis);
 $('#table-basis-label').textContent=basisName(state.tableBasis);
 $('#peak-heading').textContent='最大回撤峰点 / '+(state.tableBasis==='intraday'?'最高价':'收盘');$('#trough-heading').textContent='最大回撤谷点 / '+(state.tableBasis==='intraday'?'最低价':'收盘');
 $('#page-label').textContent=`${state.page} / ${pages}`;$('#previous-page').disabled=state.page<=1;$('#next-page').disabled=state.page>=pages;
 const ready=state.rows.filter(a=>hasHistory(a.id)),records=ready.reduce((n,a)=>n+meta(a.id).count,0),dates=ready.map(a=>meta(a.id).first).sort();
 $('#metrics').innerHTML=[['已入库标的',`${ready.length} <small>/ ${total}</small>`,'当前表格筛选范围'],['历史日线总数',records.toLocaleString(),'原始日线 · 无模拟补点'],['最早源历史起点',dates[0]??'—','具体计算起点依价格口径显示'],['历史待补齐',String(state.rows.filter(a=>!hasHistory(a.id)||hasGap(a.id)).length),'含未入库与早期回溯缺口']].map(([a,b,c])=>`<div class="metric"><div>${a}</div><strong>${b}</strong><p>${c}</p></div>`).join('');
 const rows=state.rows.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
 $('#table-body').innerHTML=rows.map(asset=>{
  const m=meta(asset.id),s=getSummary(asset.id),d=s?.mdd,latest=s?.latest??getSummary(asset.id,'all','close')?.latest;
  const reason=state.tableBasis==='intraday'?(state.tableRange==='2015'?'无法确定2015高点，可切换收盘':'缺少有效日内高低价，可切换收盘'):'此范围无可用记录';
  return `<tr class="${hasHistory(asset.id)?'':'unavailable-row'}" ${hasHistory(asset.id)?`data-asset="${asset.id}" data-alert-state="${s?.alert??'unavailable'}" tabindex="0" role="button" aria-label="查看${esc(asset.name)}走势"`:''}><td><b>${esc(asset.name)}</b><small>${esc(asset.code)} · ${esc(asset.group)}</small></td><td class="strong decline-value">${pct(d?.drawdown)}${!d?`<small class="calculation-note">${reason}</small>`:''}</td><td>${d?.peak.date??'—'}<small class="peak">${fmt(d?.peak.value)}</small></td><td>${d?.trough.date??'—'}<small class="teal">${fmt(d?.trough.value)}</small></td><td>${d?.days.toLocaleString()??'—'} <small class="inline">天</small><small>峰值 → 谷值</small></td><td class="target-baseline">${fmt(s?.peak?.value)}<small>${s?.peak?.date??'—'}</small><small>所选范围可用最高点</small></td><td class="target-levels">${levelsMarkup(s)}</td><td class="target-remaining">${[70,80].map(depth=>remainingMarkup(s?.targets?.[String(depth)],depth)).join('')}</td><td class="strong">${fmt(latest?.value)}<small>${latest?.date??'—'} · ${esc(asset.unit)}</small><small>行情快照</small></td><td class="target-alerts">${[70,80].map(depth=>alertMarkup(s?.targets?.[String(depth)],depth)).join('')}</td><td class="source-info">${m.first??'—'} — ${m.last??'—'}<small>${esc(sourceName[m.source?.provider]??'—')} · ${(m.count??0).toLocaleString()}日</small>${s?`<small class="coverage-note">计算起点 ${s.calculationStart??'无有效高低价'}${s.excludedOhlcCount?` · 排除 ${s.excludedOhlcCount} 日缺失/异常高低价`:''}</small>`:''}${state.tableRange==='2015'&&s?`<small class="coverage-note">${esc(s.note)}</small>`:''}</td><td>${statusHTML(asset.id)}</td></tr>`;
 }).join('')||'<tr><td colspan="12" class="empty">没有匹配的标的，请调整筛选。</td></tr>';
}
function renderAudit(){
 const m=meta('shanghai'),close=m.summaries_by_basis?.close?.all,day=m.summaries_by_basis?.intraday?.all,v=state.manifest.validation;
 $('#data-audit-body').innerHTML=`<p>上证指数收盘口径：${close?.mdd?.peak.date} 的 ${fmt(close?.mdd?.peak.value)} → ${close?.mdd?.trough.date} 的 ${fmt(close?.mdd?.trough.value)}；日内高低口径：${day?.mdd?.peak.date} 的 ${fmt(day?.mdd?.peak.value)} → ${day?.mdd?.trough.date} 的 ${fmt(day?.mdd?.trough.value)}。两组日期与点位不可混用。</p><p>最新入库点位 ${fmt(close?.latest.value)}，日期 ${close?.latest.date??'—'}。${v?.summary?esc(v.summary):'页面显示的是已入库行情快照，不是实时逐笔价。'}</p><p>70%目标 = 所选范围最高点 × 30%；80%目标 = 所选范围最高点 × 20%。仍需下跌 = max(0，1 − 目标点位 ÷ 当前点位)；仍需下跌 ≤20% 为临近，当前≤目标为已达到。“目标基准最高点”与“最大回撤峰点”可能属于不同年份，已分别列出。</p><p>“所用时间”专指最大回撤峰值到谷值的自然日数。日内口径只比较跨交易日的先峰后谷；无效或缺失高低价不参与计算，也不以收盘价补造。</p>`;
}
function clearPlot(message,title='暂未取得历史数据'){
 $('#plot').innerHTML='';$('#plot').style.display='none';$('#tooltip').style.display='none';
 let empty=$('.plot-wrap .chart-empty');if(!empty){empty=document.createElement('div');empty.className='chart-empty';$('.plot-wrap').append(empty);}
 empty.innerHTML=`<strong>${esc(title)}</strong><p>${esc(message)}</p><small>不会使用模拟行情替代缺失数据。</small>`;
 $('#stage-list').innerHTML='';$('#stage-count').textContent='0 段';$('#visible-period').textContent='';$('#chart-source').textContent='';state.visible=[];
}
async function selectAsset(id,preset=state.preset,basis=state.chartBasis){
 state.asset=id;state.preset=preset;state.chartBasis=basis;$('#chart-basis').value=basis;const token=++state.loadToken,asset=assetById(id),m=meta(id);state.points=[];state.visible=[];
 $('#chart-asset').value=id;$('#chart-title').innerHTML=`${esc(asset.name)} <span>${esc(asset.code)}</span>`;$('#chart-subtitle').textContent=`${asset.group} · ${asset.unit} · 走势为收盘 · 回撤按${basisName(state.chartBasis)}`;
 $('#chart-summary').textContent='';$('#chart-quality').textContent='';$('#range-error').textContent='';$('#date-start').value='';$('#date-end').value='';$('#export-chart').disabled=true;
 if(!hasHistory(id)){clearPlot((m.errors??[]).map(e=>`${sourceName[e.provider]??e.provider}：${e.blocked?'网络访问受限':'未返回可用历史'}`).join('；')||'该标的尚未执行成功的历史导入。');$('#chart-quality').textContent=asset.note;return;}
 clearPlot('正在加载已入库的完整日线…','加载中');
 try{
  const points=await loadHistory(id);if(token!==state.loadToken)return;state.points=points;
  if(!m.summaries){m.summaries={all:summary(points),'2015':summary(points,'2015')};renderTable();}
  for(const input of ['#date-start','#date-end']){$(input).min=points[0].date;$(input).max=points.at(-1).date;}
  setRange(preset);
 }catch(error){if(token===state.loadToken){clearPlot(error.message,'读取历史文件失败');$('#range-error').textContent='请重新导入该标的后刷新页面。';}}
}
function setRange(preset){
 state.preset=preset;document.querySelectorAll('#chart-range button').forEach(b=>b.classList.toggle('selected',b.dataset.range===preset));
 if(!state.points.length)return;
 const window=presetWindow(state.points,preset,state.chartBasis);$('#date-start').value=window.start??'';$('#date-end').value=window.end??'';if(window.points.length<2){$('#range-error').textContent=window.note;$('#chart-quality').textContent=window.note;$('#chart-summary').textContent='';clearPlot(window.note,'所选口径数据不足');$('#export-chart').disabled=true;return;}renderChart();
}
// Sampling affects only the drawing. Calculations and CSV retain every daily close.
function drawingPoints(points){
 if(points.length<=2400)return points;
 const result=[points[0]],size=Math.ceil(points.length/1100);
 for(let i=1;i<points.length-1;i+=size){const bucket=points.slice(i,Math.min(i+size,points.length-1));const min=bucket.reduce((a,b)=>a.value<b.value?a:b),max=bucket.reduce((a,b)=>a.value>b.value?a:b);result.push(...[min,max].sort((a,b)=>a.date.localeCompare(b.date)));}
 result.push(points.at(-1));return result;
}
function renderChart(){
 if(!state.points.length)return;
 const start=$('#date-start').value,end=$('#date-end').value,points=state.points.filter(p=>p.date>=start&&p.date<=end);
 $('#tooltip').style.display='none';
 if(!start||!end||start>end||points.length<2){$('#range-error').textContent='请选择包含至少两个交易日的有效日期范围。';$('#chart-summary').textContent='';clearPlot('该时间窗口没有足够的交易日数据。','无法计算所选区间');$('#export-chart').disabled=true;return;}
 state.visible=points;$('#range-error').textContent='';$('.plot-wrap .chart-empty')?.remove();$('#plot').style.display='block';$('#export-chart').disabled=false;
 const asset=assetById(state.asset),m=meta(state.asset),dd=maximumDrawdown(points,state.chartBasis),threshold=Number($('#decline-threshold').value),recovery=Number($('#recovery-threshold').value),ss=stages(points,threshold,recovery,state.chartBasis),rs=rebounds(points,threshold,recovery,state.chartBasis),showDecline=$('#decline-toggle').checked,showRebound=$('#rebound-toggle').checked,showMax=showDecline&&$('#max-toggle').checked&&dd,showStages=$('#stage-toggle').checked;
 $('#chart-subtitle').textContent=`${asset.group} · ${asset.unit} · 走势为收盘 · 回撤按${basisName(state.chartBasis)}`;
 $('#chart-summary').className=showDecline?'':showRebound?'chart-summary-rebound':'chart-summary-neutral';
 $('#chart-summary').innerHTML=showDecline&&dd?`<span class="summary-label">所选区间最大回撤</span><strong>${pct(dd.drawdown)}</strong><span>${dd.peak.date} <i>→</i> ${dd.trough.date}</span><span class="summary-days">所用 ${dd.days.toLocaleString()} 天</span>`:showRebound?'<span class="rebound-color">反弹区间</span><span>以所选口径的阶段谷底为基准，标记至后续阶段高点。</span>':showDecline&&!dd?'<span>该口径缺少有效高低价，暂不计算回撤；可切换日收盘。</span>':'<span>当前仅展示价格走势。</span>';
 const W=1120,H=430,L=68,R=35,T=55,B=48,minValue=points.reduce((n,p)=>Math.min(n,p.value),Math.min(dd?.trough.value??Infinity,...ss.map(s=>s.trough.value))),maxValue=points.reduce((n,p)=>Math.max(n,p.value),Math.max(dd?.peak.value??-Infinity,...rs.map(r=>r.peak.value))),span=maxValue-minValue||Math.max(Math.abs(maxValue)*.1,1),min=minValue-span*.13,max=maxValue+span*.15,first=Date.parse(points[0].date),last=Date.parse(points.at(-1).date),x=p=>L+(Date.parse(p.date)-first)/(last-first)*(W-L-R),y=p=>T+(max-p.value)/(max-min)*(H-T-B);
 const path=drawingPoints(points).map((p,i)=>`${i?'L':'M'}${x(p).toFixed(2)},${y(p).toFixed(2)}`).join(' ');
 let svg='<defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#a6b5ad" stop-opacity=".045"/><stop offset="1" stop-color="#a6b5ad" stop-opacity="0"/></linearGradient></defs>';
 for(let i=0;i<=4;i++){const value=min+(max-min)*i/4,Y=y({value});svg+=`<line x1="${L}" x2="${W-R}" y1="${Y}" y2="${Y}" stroke="#edf0ee"/><text x="${L-12}" y="${Y+4}" text-anchor="end" fill="#929b98" font-size="11">${fmt(value,Math.abs(value)<10?2:0)}</text>`;}
 for(let i=0;i<=6;i++){const stamp=first+(last-first)*i/6,X=L+(W-L-R)*i/6,label=new Date(stamp).toISOString().slice(0,last-first<370*86400000?10:7);svg+=`<text x="${X}" y="${H-14}" text-anchor="middle" fill="#929b98" font-size="11">${label}</text>`;}
 if(showMax)svg+=`<rect x="${x(dd.peak)}" width="${Math.max(0,x(dd.trough)-x(dd.peak))}" y="${T}" height="${H-T-B}" fill="var(--chart-decline)" opacity=".035"/>`;
 svg+=`<path class="price-area" d="${path} L${x(points.at(-1))},${H-B} L${L},${H-B} Z" fill="url(#fill)"/><path class="price-line" d="${path}"/>`;
 const labels=[];if(showMax)for(const p of [dd.peak,dd.trough])labels.push({x:Math.max(L+115,Math.min(W-R-115,x(p))),y:y(p)-19,width:230});
 function changeLabel(point,text,type,below){
  const width=Array.from(text).reduce((sum,c)=>sum+(/[\u3400-\u9fff]/.test(c)?12:7),12),cx=Math.max(L+width/2,Math.min(W-R-width/2,x(point))),preferred=y(point)+(below?24:-24);let cy=Math.max(20,Math.min(H-B+20,preferred));
  for(let attempt=0;attempt<18;attempt++){const candidate=Math.max(20,Math.min(H-B+20,preferred+(attempt%2?1:-1)*Math.ceil(attempt/2)*24));if(!labels.some(b=>Math.abs(b.x-cx)<(b.width+width)/2+7&&Math.abs(b.y-candidate)<23)){cy=candidate;break;}}
  labels.push({x:cx,y:cy,width});return `<g class="change-label ${type}-label"><text x="${cx}" y="${cy+4}" text-anchor="middle">${esc(text)}</text></g>`;
 }
 function interval(start,end,type,extra=''){return `<g class="${type}-mark ${extra}"><line class="interval-line" x1="${x(start)}" y1="${y(start)}" x2="${x(end)}" y2="${y(end)}"/><circle class="interval-point" cx="${x(start)}" cy="${y(start)}" r="3"/><circle class="interval-point" cx="${x(end)}" cy="${y(end)}" r="4"/></g>`;}
 let annotations='';
 if(showDecline&&showStages)for(const s of ss){svg+=interval(s.peak,s.trough,'decline');annotations+=changeLabel(s.trough,`下跌 ${pct(s.drawdown)}`,'decline',true);}
 if(showMax){svg+=interval(dd.peak,dd.trough,'decline','max-drawdown-mark');for(const [p,label] of [[dd.peak,'峰值'],[dd.trough,'谷值']])svg+=`<text class="turning-label decline-label" x="${Math.max(L+115,Math.min(W-R-115,x(p)))}" y="${y(p)-15}" text-anchor="middle">${label} ${fmt(p.value)} · ${p.date}</text>`;if(!showStages)annotations+=changeLabel(dd.trough,`最大回撤 ${pct(dd.drawdown)}`,'decline',true);}
 if(showRebound&&showStages)for(const r of rs){svg+=interval(r.trough,r.peak,'rebound');annotations+=changeLabel(r.peak,r.nonpositiveBase?'转正 · 不计百分比':`反弹 +${pct(r.gain)}`,'rebound',false);}
 svg+=annotations+`<line id="crosshair" y1="${T}" y2="${H-B}" stroke="#97a6a1" stroke-dasharray="3 4" visibility="hidden"/>`;
 $('#plot').innerHTML=svg;
 const records=[...(showDecline?ss.map(s=>({...s,type:'decline',start:s.peak,end:s.trough,change:pct(s.drawdown),status:s.ongoing?'区间末尚未确认反弹':s.nonpositiveBase?'负价后转正':'已反弹分段'})):[]),...(showRebound?rs.map(r=>({...r,type:'rebound',start:r.trough,end:r.peak,change:r.nonpositiveBase?'不计%':'+'+pct(r.gain),status:r.nonpositiveBase?'谷底≤0，百分比不定义':'谷底至后续高点'})):[])].sort((a,b)=>a.start.date.localeCompare(b.start.date));
 $('#stage-count').textContent=`${records.length} 段`;$('#stage-list').innerHTML=records.length?records.map((s,i)=>`<div class="stage ${s.type}"><span class="stage-number">${String(i+1).padStart(2,'0')}</span><div><b>${s.type==='decline'?'↘ 下跌':'↗ 反弹'} · ${s.start.date.slice(0,4)} — ${s.end.date.slice(0,4)}</b><small>${s.start.date} → ${s.end.date}</small></div><strong>${s.change}</strong><span>${s.days.toLocaleString()} 天</span><em>${s.status}</em></div>`).join(''):'<p class="empty">当前展示项和阈值下，没有符合条件的阶段区间。</p>';
 $('#visible-period').textContent=`${points[0].date} — ${points.at(-1).date} · ${points.length.toLocaleString()} 个交易日`;
 $('#chart-source').textContent=`${sourceName[m.source?.provider]??'—'} · ${m.source?.symbol??asset.code} · ${asset.unit}（手机可横向滑动图表）`;
 const scope=summary(points,'all',state.chartBasis);const notes=[asset.note,scope?.excludedOhlcCount?`${basisName(state.chartBasis)}计算排除 ${scope.excludedOhlcCount} 日缺失/异常高低价，有效计算起点 ${scope.calculationStart??'暂无'}。`:'',hasGap(asset.id)?`早期缺口：参考范围从 ${asset.reference_start} 起，当前来源仅从 ${m.first} 起；此处最大回撤仅代表已覆盖区间。`:'',m.source?.archive_sources?.length?'早期区间补充自新浪历史归档；重叠日期优先保留主来源。':'',`可用历史 ${m.first} — ${m.last}；不保证覆盖指数基日起全部回溯。`,state.preset==='2015'?since2015(state.points,state.chartBasis).note:'',m.ohlc_warning_count?`${m.ohlc_warning_count} 条源记录高低价关系异常；日内模式已排除，收盘模式保留原始close字段。`:'',m.status==='stale'?'数据尚未更新至近期，当前展示保留的已验证历史。':'',points.some(p=>p.value<=0)?'包含零价或负价：跌幅可能超过100%，非正谷底不计算反弹百分比。':''];
 $('#chart-quality').textContent=notes.filter(Boolean).join(' ');
 $('#plot').onpointermove=e=>{
  const rect=$('#plot').getBoundingClientRect(),sx=(e.clientX-rect.left)/rect.width*W,point=points.reduce((a,b)=>Math.abs(x(a)-sx)<Math.abs(x(b)-sx)?a:b),line=$('#crosshair');
  line.setAttribute('x1',x(point));line.setAttribute('x2',x(point));line.setAttribute('visibility','visible');const tip=$('#tooltip'),wrap=$('.plot-wrap'),wrapRect=wrap.getBoundingClientRect();tip.style.display='block';tip.style.left=Math.min(wrap.scrollLeft+wrap.clientWidth-200,Math.max(wrap.scrollLeft,e.clientX-wrapRect.left+wrap.scrollLeft+12))+'px';tip.style.top='45px';tip.innerHTML=`${point.date}<br><b>${esc(asset.name)} ${fmt(point.value)}</b><br><small>日线值 · ${esc(asset.unit)}</small>`;
 };
 $('#plot').onpointerleave=()=>{$('#tooltip').style.display='none';$('#crosshair')?.setAttribute('visibility','hidden');};
}
function bind(){
 $('#table-range').onclick=e=>{if(!e.target.dataset.range)return;state.tableRange=e.target.dataset.range;state.page=1;document.querySelectorAll('#table-range button').forEach(b=>b.classList.toggle('selected',b===e.target));renderTable();};
 for(const id of ['#table-group','#table-sort','#table-alert'])$(id).onchange=()=>{state.page=1;renderTable();};$('#table-search').oninput=()=>{state.page=1;renderTable();};
 $('#previous-page').onclick=()=>{state.page--;renderTable();};$('#next-page').onclick=()=>{state.page++;renderTable();};
 const drill=target=>{const row=target.closest('tr[data-asset]');if(row){selectAsset(row.dataset.asset,state.tableRange,state.tableBasis);$('#chart-section').scrollIntoView({behavior:'smooth'});}};
 $('#table-body').onclick=e=>drill(e.target);$('#table-body').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();drill(e.target);}};
 $('#table-basis').onchange=e=>{state.tableBasis=e.target.value;state.page=1;renderTable();};$('#chart-basis').onchange=e=>{state.chartBasis=e.target.value;if(state.preset==='custom')renderChart();else setRange(state.preset);};
 $('#chart-asset').onchange=e=>selectAsset(e.target.value);$('#chart-range').onclick=e=>{if(e.target.dataset.range)setRange(e.target.dataset.range);};
 $('#apply-dates').onclick=()=>{state.preset='custom';document.querySelectorAll('#chart-range button').forEach(b=>b.classList.remove('selected'));renderChart();};
 for(const id of ['#decline-toggle','#rebound-toggle','#max-toggle','#stage-toggle','#decline-threshold','#recovery-threshold'])$(id).onchange=renderChart;
 $('#export-table').onclick=()=>downloadCSV('观澜-回撤监控.csv',[['标的','代码','市场','时间维度','价格口径','最大回撤','最大回撤峰值日期','最大回撤峰值','最大回撤谷值日期','最大回撤谷值','所用自然日','目标基准最高点','目标基准日期','跌70%目标点位','距70%仍需下跌','70%预警','跌80%目标点位','距80%仍需下跌','80%预警','最新快照日期','最新点位','单位','源历史起点','源历史末日','计算起点','来源','数据状态'],...state.rows.map(a=>{const m=meta(a.id),s=getSummary(a.id),latest=s?.latest??getSummary(a.id,'all','close')?.latest,d=s?.mdd,t70=s?.targets?.['70'],t80=s?.targets?.['80'];return [a.name,a.code,a.group,state.tableRange==='all'?'历史至今':'2015高点至今',basisName(state.tableBasis),pct(d?.drawdown),d?.peak.date,d?.peak.value,d?.trough.date,d?.trough.value,d?.days,s?.peak?.value,s?.peak?.date,t70?.level,pct(t70?.remainingDrop),alertNames[t70?.status??'unavailable'],t80?.level,pct(t80?.remainingDrop),alertNames[t80?.status??'unavailable'],latest?.date,latest?.value,a.unit,m.first,m.last,s?.calculationStart,sourceName[m.source?.provider],statusName[m.status]];})]);
 $('#export-chart').onclick=()=>{const a=assetById(state.asset);if(state.visible.length)downloadCSV(`${a.name}-历史日线.csv`,[['日期','收盘','开盘','最高','最低','单位','来源','源代码'],...state.visible.map(p=>[p.date,p.value,p.open,p.high,p.low,a.unit,sourceName[meta(a.id).source?.provider],meta(a.id).source?.symbol])]);};
}
async function boot(){
 try{
  [state.catalog,state.manifest]=await Promise.all([loadCatalog(),loadManifest()]);
  const groups=[...new Set(state.catalog.map(a=>a.group))];$('#table-group').innerHTML='<option value="all">全部市场</option>'+groups.map(g=>`<option>${esc(g)}</option>`).join('');
  $('#chart-asset').innerHTML=groups.map(g=>`<optgroup label="${esc(g)}">${state.catalog.filter(a=>a.group===g).map(a=>`<option value="${a.id}">${esc(a.name)} · ${a.code}${hasHistory(a.id)?hasGap(a.id)?'（早期未齐）':'':'（待补齐）'}</option>`).join('')}</optgroup>`).join('');
  const available=state.catalog.filter(a=>hasHistory(a.id)).length,gaps=state.catalog.filter(a=>hasGap(a.id)).length;
  $('#coverage-notice').innerHTML=`<b>真实历史日线 · ${available} / ${state.catalog.length} 个标的已入库</b><span>${available<state.catalog.length?'部分标的尚待补齐。':'已导入数据源可用历史。'} ${gaps?`${gaps} 个标的未覆盖参考图的早期年份，已标注“早期未齐”。`:''} 实际覆盖起点、截止日与来源逐项列明；未使用模拟补点。</span>`;
  $('#updated-at').textContent='数据批次 '+new Date(state.manifest.generated_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
  bind();renderTable();renderAudit();await selectAsset(state.asset);
 }catch(error){$('#coverage-notice').textContent='无法读取数据目录：'+error.message;clearPlot('请先运行历史数据同步脚本，确认 data/manifest.json 存在。','数据尚未就绪');}
}
boot();
