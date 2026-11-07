import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const elements = new Map();
const boxes=['42','44.5','45','46','50'].map(value=>({value,checked:false,disabled:false}));
const labels={};
elements.set('size-picker',{querySelectorAll:selector=>selector==='input:checked'?boxes.filter(b=>b.checked):boxes,querySelector:selector=>labels[selector]??={textContent:''}});
const context = vm.createContext({URL, URLSearchParams, Intl, Date, setTimeout, clearTimeout,
  document: {querySelectorAll(){return [];},addEventListener(){},getElementById(id) {
    if (!elements.has(id)) elements.set(id, {value:'', addEventListener(){}});
    return elements.get(id);
  }}});
vm.runInContext(readFileSync('web/size-picker.js','utf8'),context);
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
const choose = (size='',size2='',brand='',size3='') => {
  context.requested=[size,size2,size3];
  vm.runInContext("sizePicker.set($('size-picker'),requested)",context);
  elements.get('brand').value=brand;
  return JSON.parse(JSON.stringify(vm.runInContext('selectProducts()',context)));
};
// Create the controls before assigning their values.
vm.runInContext("$('brand');",context);
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

context.fixture.products.push({id:'third-size',name:'Third',brand:'SALOMON',offers:[offer('b',[variant('46',55000)])]});
assert.deepEqual(choose('44.5','45','SALOMON','46').map(p=>p.price),[55000,60000,70000]);
assert(boxes.filter(b=>b.checked).every(b=>!b.disabled));
assert(boxes.filter(b=>!b.checked).every(b=>b.disabled));
assert.equal(labels['[data-size-label]'].textContent,'44,5 · 45 · 46');
context.requested=['44,5','45','46','42'];
vm.runInContext("sizePicker.set($('size-picker'),requested)",context);
assert.deepEqual(boxes.filter(b=>b.checked).map(b=>b.value),['44.5','45','46']);
choose('44.5');
assert(boxes.every(b=>!b.disabled));
assert.equal(labels['[data-size-label]'].textContent,'44,5');
console.log('Three checked sizes, third-size prices, limit and deselection passed.');
