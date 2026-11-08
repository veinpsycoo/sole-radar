import {money,shoeSize,type Result} from './catalog';
const configuredSite=process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/+$/, '');
if (configuredSite && !/^https:\/\/[a-z0-9.-]+$/i.test(configuredSite)) {
  throw new Error('EXPO_PUBLIC_SITE_URL must be an HTTPS origin');
}
export const site=configuredSite || 'https://veinpsycoo.github.io/sole-radar';
export const quoteOrigin=configuredSite || 'https://sole-radar-preview.vercel.app';
const api=process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export const catalogEndpoint=configuredSite ? site+'/api/catalog' :
  process.env.EXPO_PUBLIC_CATALOG_URL || (api ? api+'/api/catalog' : site+'/api/catalog.json');
export const statusEndpoint=catalogEndpoint.endsWith('/api/catalog.json')
  ? catalogEndpoint.replace(/catalog\.json$/,'status.json') : catalogEndpoint.replace(/\/catalog$/,'/status');
const names = new Intl.Collator('tr');
export function board(products:Result[]){
  return products.flatMap(p=>p.offers.flatMap(o=>{
    const prices=o.variants.map(v=>({size:shoeSize(v.size),price:v.price}));
    if(!prices.length)return [];
    const best=Math.min(...prices.map(v=>v.price)),sizes=[...new Set(prices.filter(v=>v.price===best).map(v=>v.size))];
    let saving='';
    for(const size of sizes){
      const alternatives=p.offers.filter(other=>other.sourceId!==o.sourceId).flatMap(other=>other.variants.filter(v=>shoeSize(v.size)===size).map(v=>v.price));
      const difference=Math.min(...alternatives)-best;
      if(Number.isFinite(difference)&&difference>0){saving='EU '+size.replace('.',',')+' · ikinci mağazadan '+money(difference)+' ucuz';break;}
    }
    return [{p,o,price:best,sizes,saving,key:p.id+'|'+o.url}];
  })).sort((a,b)=>a.price-b.price||names.compare(a.p.name,b.p.name)||a.key.localeCompare(b.key));
}
