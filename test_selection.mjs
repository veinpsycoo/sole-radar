import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const elements = new Map();
const boxes=['42','44.5','45','46','50'].map(value=>({value,checked:false,disabled:false}));
const labels={};
elements.set('size-picker',{querySelectorAll:selector=>selector==='input:checked'?boxes.filter(b=>b.checked):boxes,querySelector:selector=>labels[selector]??={textContent:''}});
const context = vm.createContext({URL, URLSearchParams, Intl, Date, setTimeout, clearTimeout,setInterval:()=>{},
  document: {querySelectorAll(){return [];},addEventListener(){},getElementById(id) {
    if (!elements.has(id)) elements.set(id, {value:'', addEventListener(){}});
    return elements.get(id);
  }}});
vm.runInContext(readFileSync('web/size-picker.js','utf8'),context);
for (const [input,expected] of [['44,5','44.5'],['36⅔','36 ⅔'],['35','35'],['50','50'],['50.5',''],['34',''],['S',''],['M',''],['One Size',''],['12 Ay',''],['US 8',''],['','']]) {
  context.sizeInput=input;
  assert.equal(vm.runInContext('shoeSize(sizeInput)',context),expected,input);
}
vm.runInContext(readFileSync('web/app.js','utf8').replace('startRadar();',''), context);
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
const card=vm.runInContext('rankRow(standings(selectProducts())[0],0)',context);
assert(card.includes('href="https://store.example/product"') && card.includes('LİDER'));
elements.get('model').value='Salomon A';
assert.deepEqual(choose('44.5','45','SALOMON').map(p=>p.id),['salomon']);
elements.get('model').value='';
const ranks=()=>JSON.parse(JSON.stringify(vm.runInContext('standings(selectProducts()).map(r=>r.price)',context)));
assert.deepEqual(ranks(),[60000,70000,90000]);
const p0=context.fixture.products[0], o0=p0.offers[0];
context.quote={id:p0.id,url:o0.url,sourceId:o0.sourceId,checkedAt:new Date(Date.now()+50).toISOString(),variants:[{size:'44.5',price:40000,available:true}]};
assert(vm.runInContext('applyQuote(fixture.products[0],fixture.products[0].offers[0],quote)',context));
assert.deepEqual(ranks(),[40000,60000,70000]);
assert(!vm.runInContext('applyQuote(fixture.products[0],fixture.products[0].offers[0],{...quote,url:"https://other.test"})',context));
o0.variants=[variant('42',100),variant('44.5',90000),variant('45',80000,false)];
context.radarOffer={sourceId:'b',variants:[variant('44.5',399900),variant('45',400000)],url:'https://store.example/product',price:399900};
vm.runInContext("shippingRules=[{sourceId:'b',threshold:400000,fee:7900,checkedAt:new Date().toISOString()}];$('with-shipping').checked=true;",context);
assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(standings([{id:'shoe',name:'shoe',offers:[radarOffer]}]).map(r=>[r.price,r.sizes]))",context)),[[400000,['45']]]);
vm.runInContext("$('with-shipping').checked=false",context);
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

assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext("availableBrands(['44.5'])",context))),['SALOMON']);
assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext("availableBrands(['50'])",context))),[]);
