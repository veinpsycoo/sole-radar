const catalog = 'https://veinpsycoo.github.io/sole-radar/radar/';
const HOUR = 3600000;
const validSize = size => typeof size==='string' && /^(?:(?:3[5-9]|4\d)(?:\.5| [⅓⅔])?|50)$/.test(size);
export function validWatch(w) {
  return w && /^[0-9a-f]{20}$/.test(w.id) && Array.isArray(w.sizes) && w.sizes.length>0 && w.sizes.length<=3 &&
    w.sizes.every(validSize) && (w.target===null || Number.isSafeInteger(w.target)&&w.target>0&&w.target<=100000000);
}
export function observe(row, watch, now) {
  const completeAge=now-Date.parse(row?.completeAt);
  const complete=completeAge>=-300000&&completeAge<24*HOUR;
  if (!row?.current) return complete?false:null;
  const fresh=pair=>Array.isArray(pair)&&Number.isSafeInteger(pair[0])&&pair[0]>0&&now-Date.parse(pair[1])>=-300000&&now-Date.parse(pair[1])<24*HOUR;
  if(!Object.values(row.current).some(pairs=>pairs.some(fresh)))return null;
  const matches=watch.sizes.flatMap(size=>(row.current[size]||[]).filter(fresh).map(([price])=>({size,price}))).sort((a,b)=>a.price-b.price);
  if (!matches.length)return complete?false:null;
  if (watch.target!==null && matches[0].price>watch.target)return complete?false:null;
  return matches[0];
}
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export default {async fetch(request,env) {
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return json({service:'sole-radar-alerts'});
  if(url.pathname!=='/watch'||!['PUT','DELETE'].includes(request.method))return json({},404);
  if(!(await env.LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)return json({},429);
  if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')||0)>2500)return json({},400);
  const text=await request.text();if(text.length>2500)return json({},400);
  let body;try{body=JSON.parse(text);}catch{return json({},400);}
  if(!body||!/^Expo(?:nent)?PushToken\[[a-zA-Z0-9_-]{12,160}\]$/.test(body.token)||!/^Bearer [a-f0-9-]{36}$/.test(request.headers.get('Authorization')||'')||!validWatch(body))return json({},400);
  const device=env.DEVICES.get(env.DEVICES.idFromName(body.token));
  return device.fetch(new Request('https://internal/watch',{method:request.method,body:text,headers:{authorization:request.headers.get('Authorization')}}));
}};
export class Device {
  constructor(ctx){this.ctx=ctx;this.db=ctx.storage;}
  async fetch(req){
    return this.ctx.blockConcurrencyWhile(async()=>{
      const input=await req.json(), auth=req.headers.get('authorization');
      const state=await this.db.get('state')||{auth,token:input.token,watches:{}};
      if(state.auth!==auth)return json({},403);
      const key=input.id+'|'+[...new Set(input.sizes)].sort().join(',');
      if(req.method==='DELETE')delete state.watches[key];
      else {
        if(!state.watches[key]&&Object.keys(state.watches).length>=12)return json({},409);
        const prior=state.watches[key];
        if(!prior||prior.target!==input.target){
          const result=await this.lookup(input);
          if(result===undefined)return json({error:'Model doğrulanamadı'},503);
          // Unknown availability can be watched. Only a later fresh positive quote triggers delivery.
          state.watches[key]={id:input.id,sizes:input.sizes,target:input.target,active:!!result};
        }
        state.watches[key].daily=input.daily===true;
        state.watches[key].expires=Date.now()+90*24*HOUR;
      }
      if(!Object.keys(state.watches).length){await this.db.deleteAlarm();await this.db.deleteAll();return json({ok:true});}
      state.expires=Date.now()+90*24*HOUR;
      await this.db.put('state',state);
      if(await this.db.getAlarm()===null)await this.db.setAlarm(Date.now()+HOUR);
      return json({ok:true});
    });
  }
  async lookup(w, cache=new Map()){
    const prefix=w.id[0];
    if(!cache.has(prefix)){
      const res=await fetch(catalog+prefix+'.json',{cf:{cacheTtl:120},signal:AbortSignal.timeout(10000)});
      if(!res.ok)return undefined;
      cache.set(prefix,await res.json());
    }
    const row=cache.get(prefix)[w.id];
    return row?observe(row,w,Date.now()):undefined;
  }
  async alarm(){
    await this.ctx.blockConcurrencyWhile(async()=>{
      const state=await this.db.get('state');
      if(!state||state.expires<Date.now()){await this.db.deleteAll();return;}
      await this.db.setAlarm(Date.now()+HOUR);
      const cache=new Map();
      for(const [key,watch] of Object.entries(state.watches)){
        if(watch.expires<Date.now()){delete state.watches[key];await this.db.put('state',state);continue;}
        if(watch.receipt){
          const res=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[watch.receipt]})});
          const receipt=res.ok?(await res.json()).data?.[watch.receipt]:null;
          if(receipt?.details?.error==='DeviceNotRegistered'){await this.db.deleteAll();await this.db.deleteAlarm();return;}
          if(receipt||Date.now()-watch.sentAt>24*HOUR)delete watch.receipt;
        }
        const found=await this.lookup(watch,cache);
        if(found==null)continue;
        if(found&&!watch.active){
          if(watch.daily && Date.now()-(watch.sentAt||0)<24*HOUR)continue;
          // Persist the qualifying edge before external delivery. A timeout must not replay a push.
          watch.active=true;watch.sentAt=Date.now();
          await this.db.put('state',state);
          const res=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:state.token,title:'SOLE RADAR · Takibindeki ayakkabı',body:'EU '+found.size.replace('.',',')+' stokta · '+new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(found.price/100),data:{id:watch.id,size:found.size},channelId:'radar'})});
          if(!res.ok){if(res.status===429){watch.active=false;await this.db.put('state',state);}continue;}
          const ticket=(await res.json()).data;
          if(ticket?.details?.error==='DeviceNotRegistered'){await this.db.deleteAll();await this.db.deleteAlarm();return;}
          if(ticket?.status!=='ok')continue;
          watch.receipt=ticket.id;watch.sentAt=Date.now();
        }
        watch.active=!!found;
        await this.db.put('state',state);
      }
    });
  }
}
