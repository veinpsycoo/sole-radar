import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const elements = new Map();
const context = vm.createContext({URL, URLSearchParams, Intl, Date, setTimeout, clearTimeout,
  document: {getElementById(id) {
    if (!elements.has(id)) elements.set(id, {value:'', addEventListener(){}});
    return elements.get(id);
  }}});
vm.runInContext(readFileSync('web/app.js','utf8').replace('load();checkStatus();',''), context);
const offer = (sourceId, variants, age=0) => ({sourceId, variants, url:'https://store.example/product', checkedAt:new Date(Date.now()-age).toISOString()});
const variant = (size, price, available=true) => ({size,price,available});
context.fixture = {sources:[{id:'a',status:'ok'},{id:'b',status:'ok'},{id:'failed',status:'error'}],products:[
  {id:'salomon',name:'Salomon A',brand:'SALOMON',offers:[offer('a',[variant('42',100),variant('44.5',90000),variant('45',80000,false)]),offer('b',[variant('45',70000)])]},
  {id:'cheaper',name:'Salomon B',brand:'SALOMON',offers:[offer('a',[variant('45',60000)])]},
  {id:'other-brand',name:'Other',brand:'ASICS',offers:[offer('a',[variant('45',50000)])]},
  {id:'invalid',name:'Invalid',brand:'SALOMON',offers:[offer('failed',[variant('45',1)]),offer('a',[variant('45',2)],86400001),offer('a',[variant('45',0),variant('45',3.5),variant('',4),variant('44.5',5,false)])]}
]};
vm.runInContext('data=fixture;',context);
const choose = (size='',size2='',brand='') => {
  for (const [id,value] of Object.entries({size,size2,brand})) elements.get(id).value=value;
  return JSON.parse(JSON.stringify(vm.runInContext('selectProducts()',context)));
};
// Create the controls before assigning their values.
vm.runInContext('ids.forEach(id=>$(id));',context);
assert.deepEqual(choose(),[]);
assert.deepEqual(choose('44.5').map(p=>[p.id,p.price]),[['salomon',90000]]);
let results=choose('44.5','45','SALOMON');
assert.deepEqual(results.map(p=>[p.id,p.price]),[['cheaper',60000],['salomon',70000]]);
assert(results.every(p=>p.offers.every(o=>o.variants.every(v=>['44.5','45'].includes(v.size)&&v.available))));
assert.deepEqual(choose('','45').map(p=>p.id),['other-brand','cheaper','salomon']);
assert.deepEqual(choose('44.5','44.5','SALOMON').map(p=>p.price),[90000]);
assert.deepEqual(choose('50','','SALOMON'),[]);
assert.equal(context.fixture.products[0].offers[0].variants.length,3);
choose('44.5','45','SALOMON');
const card=vm.runInContext('card(selectProducts()[0])',context);
assert(card.includes('?beden=44.5&beden=45'));
assert(!card.includes('42:'));
console.log('Size-first filtering: two sizes, brand, cheapest eligible store, stock/freshness, empty state and detail link passed.');
