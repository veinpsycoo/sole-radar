import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {AppState} from 'react-native';
import {emptyCatalog, parseCatalog, mergeCatalog, type Catalog, type Offer, type Variant} from './catalog';

import {catalogEndpoint,statusEndpoint,quoteOrigin} from './radar';

type Target={id:string;sourceId:string;url:string;index:number};
const Context = createContext({verify:(_targets:Target[])=>Promise.resolve(),data: emptyCatalog, loading: false, error: '', now: Date.now(), refresh: () => {}});
export function CatalogProvider({children}: {children: ReactNode}) {
  const [data, setData] = useState<Catalog>(emptyCatalog);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  const revision = useRef<string|null>(null);
  const request = useRef<AbortController | null>(null);
  const verify=useCallback(async(targets:Target[])=>{
    await Promise.all(targets.map(async t=>{
      try{
        const r=await fetch(quoteOrigin+'/api/teklif/'+t.id+'/'+t.index,{signal:AbortSignal.timeout(9000)});
        if(!r.ok)return;
        const q=await r.json() as Offer&{id:string};
        const at=Date.parse(q.checkedAt);
        if(q.id!==t.id||q.url!==t.url||q.sourceId!==t.sourceId||!Number.isFinite(at)||at>Date.now()+300000||Date.now()-at>=86400000||!Array.isArray(q.variants)||!q.variants.every((v:Variant)=>v&&typeof v.size==='string'&&v.available===true&&Number.isSafeInteger(v.price)&&v.price>0))return;
        setData(current=>{
          const p=current.products.find(p=>p.id===t.id),o=p?.offers[t.index];if(!p||!o||o.url!==q.url||o.sourceId!==q.sourceId||at<=Date.parse(o.checkedAt))return current;
          return {...current,products:current.products.map(item=>item!==p?item:{...p,offers:p.offers.map(old=>old!==o?old:{...o,checkedAt:q.checkedAt,variants:q.variants})})};
        });
      }catch{/* The board retains the timestamped offer until expiry. */}
    }));
  },[]);
  const refresh = useCallback(async () => {
    try {
      const url = new URL(catalogEndpoint);
      if (url.protocol !== 'https:' && !(__DEV__ && url.protocol === 'http:')) throw new Error();
    } catch {setError('Sunucu adresi geçersiz.'); return;}
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setLoading(true); setError('');
    try {
      const response = await fetch(catalogEndpoint, {signal: controller.signal});
      if (!response.ok) throw new Error();
      const parsed = parseCatalog(await response.json());
      if (request.current === controller) {
        const at=Date.now();
        revision.current=parsed.generatedAt;
        setData(current=>mergeCatalog(current,parsed,at));
        setNow(at);
      }
    } catch {
      if (request.current === controller) setError('Katalog alınamadı. Bağlantını kontrol edip tekrar dene.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Mount starts external network synchronization, including its loading state.
    refresh();
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const poll=setInterval(async()=>{
      if(AppState.currentState!=='active'||request.current)return;
      try{
        const res=await fetch(statusEndpoint,{signal:AbortSignal.timeout(8000)});if(!res.ok)return;
        const state=await res.json();if(state.generatedAt&&state.generatedAt!==revision.current)refresh();
      }catch{/* Retry on the next foreground poll. */}
    },60000);
    const state = AppState.addEventListener('change', value => {if(value === 'active') refresh();});
    return () => {request.current?.abort(); request.current=null; clearInterval(timer);clearInterval(poll); state.remove();};
  }, [refresh]);
  return <Context.Provider value={{data, loading, error, now, refresh,verify}}>{children}</Context.Provider>;
}
export const useCatalog = () => useContext(Context);
