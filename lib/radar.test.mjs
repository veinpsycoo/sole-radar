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
const rows=board([product]);
assert.deepEqual(rows.map(r=>[r.price,r.sizes]),[[399900,['44.5']],[420000,['45']]]);
assert.equal(rows[0].saving,'');
product.offers[1].variants[0].size='44.5';
assert.match(board([product])[0].saving,/ikinci mağazadan/);
console.log('Mobile product price order and matching-size savings passed.');
