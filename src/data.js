// Daily close analytics. Production data is fetched, never interpolated.
const DAY = 86400000;
export const daysBetween=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/DAY);
export function maximumDrawdown(points){
  let peak=null,best=null;
  for(const point of points){
    if(point.value>0&&(!peak||point.value>peak.value))peak=point;
    if(!peak)continue;
    const drawdown=point.value/peak.value-1;
    if(!best||drawdown<best.drawdown)best={peak,trough:point,drawdown,days:daysBetween(peak.date,point.date)};
  }
  return best;
}
export function stages(points,threshold=.15,recovery=.2){
  const result=[];let peak=null,trough=null,falling=false;
  for(const point of points){
    if(!peak){if(point.value>0)peak=trough=point;continue;}
    if(!falling){
      if(point.value>=peak.value)peak=trough=point;
      else if(point.value<=peak.value*(1-threshold)){falling=true;trough=point;}
    }else{
      if(point.value<trough.value)trough=point;
      const recovered=trough.value>0?point.value>=trough.value*(1+recovery):point.value>0;
      if(recovered){result.push({...maximumDrawdown([peak,trough]),ongoing:false,nonpositiveBase:trough.value<=0});peak=trough=point;falling=false;}
    }
  }
  if(falling)result.push({...maximumDrawdown([peak,trough]),ongoing:true,nonpositiveBase:trough.value<=0});
  return result;
}
export function rebounds(points,threshold=.15,recovery=.2){
  const declines=stages(points,threshold,recovery);
  return declines.flatMap((stage,i)=>{
    const end=declines[i+1]?.peak.date??points.at(-1).date;
    const candidates=points.filter(p=>p.date>=stage.trough.date&&p.date<=end);
    const peak=candidates.reduce((best,p)=>p.value>best.value?p:best,stage.trough);
    const gain=stage.trough.value>0?peak.value/stage.trough.value-1:null;
    return (gain!==null&&gain>=recovery)||(gain===null&&peak.value>0)?[{trough:stage.trough,peak,gain,days:daysBetween(stage.trough.date,peak.date),nonpositiveBase:gain===null}]:[];
  });
}
export function since2015(points){
  const year=points.filter(p=>p.date>='2015-01-01'&&p.date<='2015-12-31');
  if(year.length){const peak=year.reduce((a,b)=>b.value>a.value?b:a);return {points:points.filter(p=>p.date>=peak.date),note:'自2015年收盘高点起',start:peak.date};}
  const later=points.filter(p=>p.date>'2015-12-31');
  return {points:later,note:later.length?'2015年无记录，使用可用历史起点':'2015年后无可用记录',start:later[0]?.date??null};
}
export function summary(points,mode='all'){
  const window=mode==='2015'?since2015(points):{points,note:'数据源可用历史',start:points[0]?.date};
  const data=window.points;if(!data.length)return null;
  const peak=data.reduce((a,b)=>a.value>=b.value?a:b),latest=data.at(-1),previous=data.at(-2);
  return {mdd:maximumDrawdown(data),peak,latest,start:data[0].date,end:latest.date,count:data.length,note:window.note,currentDrawdown:peak.value>0?latest.value/peak.value-1:null,latestChange:previous?.value>0?latest.value/previous.value-1:null};
}
export function presetWindow(points,preset){
  if(!points.length)return {points:[],start:null,end:null,note:''};
  if(preset==='2015')return {...since2015(points),end:points.at(-1).date};
  const end=points.at(-1).date;
  if(preset==='all')return {points,start:points[0].date,end,note:''};
  const startDate=new Date(end+'T00:00:00Z');startDate.setUTCFullYear(startDate.getUTCFullYear()-Number(preset));
  const start=startDate.toISOString().slice(0,10);
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
