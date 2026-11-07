import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
// Metro resolves TypeScript extensions; reproduce that single import for Node's built-in runner.
const hook=registerHooks({resolve(specifier,context,next){return next(specifier==='./catalog'?'./catalog.ts':specifier,context);}});
const {board}=await import('./radar.ts');
hook.deregister();
const now=Date.now(),make=(sourceId,url,entries)=>({sourceId,url,checkedAt:new Date(now).toISOString(),price:Math.min(...entries.map(r=>r[1])),variants:entries.map(([size,price])=>({size,price,available:true}))});
const product={id:'shoe',name:'Test shoe',offers:[
  make('one','https://one.example/a',[['44.5',399900],['45',400000]]),
  make('two','https://two.example/a',[['45',420000]])]};
const rules=[{sourceId:'one',threshold:400000,fee:7900,checkedAt:new Date(now).toISOString()},{sourceId:'two',threshold:410000,fee:null,checkedAt:new Date(now).toISOString()}];
assert.equal(board([product],rules,false,now)[0].saving,'');
const rows=board([product],rules,true,now);
assert.deepEqual(rows.map(r=>[r.price,r.sizes]),[[400000,['45']],[420000,['45']]]);
assert.match(rows[0].saving,/ikinci mağazadan/);
assert.deepEqual(board([product],rules,true,now+86400000),[]);
console.log('Mobile totals, shipping thresholds, exact size savings and expiry passed.');
