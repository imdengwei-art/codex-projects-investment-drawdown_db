// All calculations use full, un-interpolated source observations.
const DAY=86400000;
export const PRICE_BASES=['close','intraday','weekly','monthly'];
export const isPeriodic=basis=>basis==='weekly'||basis==='monthly';
export function periodCloses(points,basis){
 if(!isPeriodic(basis))throw Error('Expected weekly or monthly price basis');
 const periods=new Map();
 for(const p of points){
  let key=p.date.slice(0,7);
  if(basis==='weekly'){const day=new Date(p.date+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);key=day.toISOString().slice(0,10);}
  periods.set(key,p);
 }
 return [...periods.values()];
}
const annualBasis=basis=>({intraday:'日内',close:'收盘',weekly:'周收盘',monthly:'月收盘'})[basis];
export const daysBetween=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/DAY);
export function eligible(points,basis='close'){
 if(!PRICE_BASES.includes(basis))throw Error('Unknown price basis '+basis);
 return isPeriodic(basis)?periodCloses(points,basis):basis==='close'?points:points.filter(p=>['high','low','value'].every(k=>Number.isFinite(p[k]))&&p.low<=p.value+1e-7&&p.high>=p.value-1e-7&&p.low<=p.high);
}
const at=(p,basis='close',side='high')=>({date:p.date,value:basis==='intraday'?p[side]:p.value});
export function maximumDrawdown(points,basis='close'){
 const bars=eligible(points,basis);let peak=null,best=null;
 if(basis==='intraday'&&bars.length<2)return null;
 for(const p of bars){
  const high=at(p,basis,'high'),low=at(p,basis,'low');
  if(basis!=='intraday'&&high.value>0&&(!peak||high.value>peak.value))peak=high;
  if(peak){const drawdown=low.value/peak.value-1;if(drawdown<=0&&(!best||drawdown<best.drawdown))best={peak,trough:low,drawdown,days:daysBetween(peak.date,low.date)};}
  if(basis==='intraday'&&high.value>0&&(!peak||high.value>peak.value))peak=high;
 }
 return best??(peak?{peak,trough:peak,drawdown:0,days:0}:null);
}
export function stages(points,threshold=.15,recovery=.2,basis='close'){
 const bars=eligible(points,basis),result=[];let peak=null,trough=null,falling=false;
 for(const p of bars){
  const high=at(p,basis,'high'),low=at(p,basis,'low');
  if(!peak){if(high.value>0){peak=high;trough=low;}continue;}
  if(!falling){
   if(basis!=='intraday'&&high.value>=peak.value){peak=high;trough=low;}
   else if(low.value<=peak.value*(1-threshold)){falling=true;trough=low;}
   else if(high.value>peak.value){peak=high;trough=low;}
  }else{
   const newTrough=low.value<trough.value;
   if(newTrough)trough=low;
   const recovered=trough.value>0?high.value>=trough.value*(1+recovery):high.value>0;
   if(recovered&&!(basis==='intraday'&&newTrough)){
    result.push({peak,trough,drawdown:trough.value/peak.value-1,days:daysBetween(peak.date,trough.date),ongoing:false,nonpositiveBase:trough.value<=0});peak=high;trough=low;falling=false;
   }
  }
 }
 if(falling)result.push({peak,trough,drawdown:trough.value/peak.value-1,days:daysBetween(peak.date,trough.date),ongoing:true,nonpositiveBase:trough.value<=0});
 return result;
}
export function rebounds(points,threshold=.15,recovery=.2,basis='close'){
 const bars=eligible(points,basis),declines=stages(points,threshold,recovery,basis);
 return declines.flatMap((stage,i)=>{
  const end=declines[i+1]?.peak.date??points.at(-1).date;
  const candidates=bars.filter(p=>(basis==='intraday'?p.date>stage.trough.date:p.date>=stage.trough.date)&&p.date<=end).map(p=>at(p,basis,'high'));
  const peak=candidates.reduce((best,p)=>p.value>best.value?p:best,stage.trough),gain=stage.trough.value>0?peak.value/stage.trough.value-1:null;
  return (gain!==null&&gain>=recovery)||(gain===null&&peak.value>0)?[{trough:stage.trough,peak,gain,days:daysBetween(stage.trough.date,peak.date),nonpositiveBase:gain===null}]:[];
 });
}
export function since2015(points,basis='close'){
 const year=eligible(points,basis).filter(p=>p.date>='2015-01-01'&&p.date<='2015-12-31');
 if(year.length){const peak=year.reduce((a,b)=>at(b,basis).value>at(a,basis).value?b:a);return {points:points.filter(p=>p.date>=peak.date),note:'自2015年'+annualBasis(basis)+'高点起',start:peak.date};}
 if(basis==='intraday'&&points.some(p=>p.date>='2015-01-01'&&p.date<='2015-12-31'))return {points:[],note:'2015年高低价缺失，无法确定2015高点；可切换收盘口径',start:null};
 const later=points.filter(p=>p.date>'2015-12-31');
 return {points:later,note:'2015年无可用'+(basis==='intraday'?'高低价':'')+'记录，使用后续可用历史起点',start:later[0]?.date??null};
}
export function targetLevel(peak,current,depth,warningDistance=.2){
 if(!Number.isFinite(peak)||peak<=0||!Number.isFinite(current))return {level:null,remainingDrop:null,status:'unavailable'};
 const level=peak*(1-depth);
 if(current<=level+Math.max(Math.abs(level),1)*1e-12)return {level,remainingDrop:0,status:'reached'};
 const remainingDrop=1-level/current;
 return {level,remainingDrop,status:remainingDrop<=warningDistance+1e-12?'near':'far'};
}
export function summary(points,mode='all',basis='close'){
 const window=mode==='2015'?since2015(points,basis):{points,note:'数据源可用历史',start:points[0]?.date};
 const data=window.points;if(!data.length)return null;
 const bars=eligible(data,basis),closes=isPeriodic(basis)?bars:data,peak=bars.map(p=>at(p,basis)).reduce((a,b)=>!a||b.value>a.value?b:a,null),latest=at(closes.at(-1)),previous=closes.at(-2);
 const targets=Object.fromEntries([70,80].map(depth=>[String(depth),targetLevel(peak?.value,latest.value,depth/100)]));
 const states=Object.values(targets).map(t=>t.status),alert=states.includes('reached')?'reached':states.includes('near')?'near':states.includes('far')?'far':'unavailable';
 return {mdd:maximumDrawdown(data,basis),peak,latest,start:data[0].date,end:latest.date,count:data.length,note:window.note,basis,basisCount:bars.length,excludedOhlcCount:basis==='intraday'?data.length-bars.length:0,calculationStart:bars[0]?.date??null,targets,alert,currentDrawdown:peak?.value>0?latest.value/peak.value-1:null,latestChange:previous?.value>0?latest.value/previous.value-1:null};
}
export function dateWindow(points,start,end){
 const valid=date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 if(!valid(start)||!valid(end))throw new RangeError('请选择有效的开始和结束日期。');
 if(start>end)throw new RangeError('开始日期不能晚于结束日期。');
 return {points:points.filter(p=>p.date>=start&&p.date<=end),start,end,note:'自选日期范围，仅使用区间内已有交易日'};
}
export function presetWindow(points,preset,basis='close'){
 if(!points.length)return {points:[],start:null,end:null,note:''};
 if(preset==='2015')return {...since2015(points,basis),end:points.at(-1).date};
 const end=points.at(-1).date;
 if(preset==='all')return {points,start:points[0].date,end,note:''};
 const date=new Date(end+'T00:00:00Z');date.setUTCFullYear(date.getUTCFullYear()-Number(preset));const start=date.toISOString().slice(0,10);
 return {points:points.filter(p=>p.date>=start),start,end,note:'近年范围以该标的最新数据日为准'};
}
async function readJSON(path){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error(`读取数据失败（${response.status}）：${path}`);return response.json();}
export async function loadCatalog(){return window.__GUANLAN__?.catalog??readJSON('data/catalog.json');}
export async function loadManifest(){return window.__GUANLAN__?.manifest??readJSON('data/manifest.json');}
const cache=new Map();
export async function loadHistory(id){
  if(!cache.has(id))cache.set(id,(async()=>{
    const payload=window.__GUANLAN__?window.__GUANLAN__.histories[id]:await readJSON(`data/history/${encodeURIComponent(id)}.json`);
    if(!payload?.points?.length)throw new Error('该标的尚未导入历史数据');
    return payload.points;
  })().catch(error=>{cache.delete(id);throw error;}));
  return cache.get(id);
}
