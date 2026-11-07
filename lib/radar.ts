import {money,shoeSize,type Result} from './catalog';
export const site='https://veinpsycoo.github.io/sole-radar';
export type Shipping={sourceId:string;threshold:number;fee:number|null;checkedAt:string};
export function board(products:Result[],shipping:Shipping[],total:boolean,now:number){
  const cost=(sourceId:string,price:number)=>{
    if(!total)return price;
    const rule=shipping.find(r=>r.sourceId===sourceId&&now-Date.parse(r.checkedAt)<86400000&&Date.parse(r.checkedAt)<=now+300000);
    if(!rule)return null;
    return price>=rule.threshold?price:rule.fee===null?null:price+rule.fee;
  };
  return products.flatMap(p=>p.offers.flatMap(o=>{
    const prices=o.variants.flatMap(v=>{const price=cost(o.sourceId,v.price);return price===null?[]:[{size:shoeSize(v.size),price}];});
    if(!prices.length)return [];
    const best=Math.min(...prices.map(v=>v.price)),sizes=[...new Set(prices.filter(v=>v.price===best).map(v=>v.size))];
    let saving='';
    for(const size of sizes){
      const alternatives=p.offers.filter(other=>other.sourceId!==o.sourceId).flatMap(other=>other.variants.filter(v=>shoeSize(v.size)===size).map(v=>cost(other.sourceId,v.price))).filter((v):v is number=>v!==null);
      const difference=Math.min(...alternatives)-best;
      if(Number.isFinite(difference)&&difference>0){saving='EU '+size.replace('.',',')+' · ikinci mağazadan '+money(difference)+' ucuz';break;}
    }
    return [{p,o,price:best,sizes,saving,key:p.id+'|'+o.url}];
  })).sort((a,b)=>a.price-b.price||a.p.name.localeCompare(b.p.name,'tr')||a.key.localeCompare(b.key));
}
