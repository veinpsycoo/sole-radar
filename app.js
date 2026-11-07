'use strict';
const $ = id => document.getElementById(id);
const currency = new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY', maximumFractionDigits:2});
const count = n => new Intl.NumberFormat('tr-TR').format(n);
const date = value => new Date(value).toLocaleString('tr-TR', {timeZone:'Europe/Istanbul', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safe = value => {try {const u = new URL(value); return u.protocol === 'https:' ? u.href : '';} catch {return '';}};
let data = {products:[], sources:[]}, shown = 36, matches = [], polling = false, expiryTimer, board=[], updating=false, checking=false;
const attempts=new Map(), verified=new Set(), candidates=new Map();
const norm=value=>String(value??'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,' ').trim();
const rowKey=(p,o)=>p.id+'|'+o.url;
const modelMatches=(p,term)=>norm([p.name,p.code].join(' ')).includes(norm(term));
const selectedSizes = () => sizePicker.values($('size-picker'));
const sourceName = id => data.sources.find(s => s.id === id)?.name || id;

function fresh(offer) {
  const age = Date.now() - new Date(offer.checkedAt).getTime();
  return Number.isFinite(age) && age >= -300000 && age < 86400000 && data.sources.some(s => s.id === offer.sourceId && s.status !== 'error');
}
function options(id, values, label) {
  const old = $(id).value;
  $(id).innerHTML = `<option value="">${label}</option>` + values.map(v => `<option value="${esc(v.value ?? v)}">${esc(v.label ?? v)}</option>`).join('');
  if ([...$(id).options].some(o => o.value === old)) $(id).value = old;
}
function availableBrands(sizes) {
  return [...new Set(data.products.filter(p=>p.offers.some(o=>fresh(o)&&o.variants.some(v=>v.available===true && shoeSize(v.size) && (!sizes.length || sizes.includes(shoeSize(v.size)))))).map(p=>p.brand))].sort();
}
function brandMenu(){
  const before=$('brand').value;
  options('brand',availableBrands(selectedSizes()),'Tüm markalar');
  if(before && before!==$('brand').value)$('model').value='';
}
function loadFilters() {
  const sizes = [...new Set(data.products.flatMap(p => p.offers.filter(fresh).flatMap(o => o.variants.filter(v=>v.available===true).map(v => shoeSize(v.size)))).filter(Boolean))].sort((a,b) => Number(a.replace(' ⅓','.333').replace(' ⅔','.667'))-Number(b.replace(' ⅓','.333').replace(' ⅔','.667'))).map(value => ({value, label:value.replace('.', ',')}));
  const selected=selectedSizes();
  $('size-options').innerHTML=sizes.map(({value,label})=>`<label><input type="checkbox" name="size" value="${esc(value)}"><span>${esc(label)}</span></label>`).join('');
  sizePicker.set($('size-picker'),selected);
}
function sources() {
  $('source-list').innerHTML = data.sources.map(s => `<span class="source-chip ${s.status === 'error' ? 'failed' : ''}"><strong>${esc(s.name)}</strong><span>${s.status === 'error' ? 'Veri yok' : count(s.count)}</span></span>`).join('');
  $('source-details').innerHTML = data.sources.map(s => `<div class="source-status"><strong>${esc(s.name)}</strong><span>${esc(s.coverage)} · ${count(s.count)} stoklu varyant · ${date(s.checkedAt)}${s.errorCount ? ` · ${s.errorCount} sayfa/veri hatası` : ''}${s.id === 'spx' || s.id === 'converse' ? ' · Beden bilgisi doğrulanmadı' : ''}</span></div>`).join('');
}
function selectProducts(useModel=true) {
  const brand = $('brand').value, sizes = selectedSizes();
  if (!sizes.length) return [];
  return data.products.flatMap(p => {
    if ((brand && p.brand !== brand) || (useModel && !modelMatches(p,$('model').value))) return [];
    const offers = p.offers.filter(o => fresh(o) && safe(o.url)).flatMap(o => {
      const variants = o.variants.filter(v => v.available === true && Number.isInteger(v.price) && v.price > 0 && sizes.includes(shoeSize(v.size)));
      return variants.length ? [{...o,quoteIndex:p.offers.indexOf(o),variants,price:Math.min(...variants.map(v=>v.price))}] : [];
    }).sort((a,b)=>a.price-b.price);
    return offers.length ? [{...p,offers,price:offers[0].price}] : [];
  }).sort((a,b) => a.price-b.price || a.name.localeCompare(b.name,'tr'));
}
function suggestions() {
  const sizes=selectedSizes(), brand=$('brand').value, term=$('model').value;
  const names=new Set();
  for(const p of data.products){
    if((brand && p.brand!==brand)||!modelMatches(p,term)||names.has(p.name))continue;
    if(p.offers.some(o=>fresh(o)&&o.variants.some(v=>v.available && (!sizes.length||sizes.includes(shoeSize(v.size))))))names.add(p.name);
    if(names.size===70)break;
  }
  $('model-options').innerHTML=[...names].sort((a,b)=>a.localeCompare(b,'tr')).map(n=>`<option value="${esc(n)}"></option>`).join('');
}
let shippingRules=[];
function totalPrice(o) {
  const rule=shippingRules.find(r=>r.sourceId===o.sourceId && Date.now()-Date.parse(r.checkedAt)<86400000 && Date.parse(r.checkedAt)<=Date.now()+300000);
  if(!rule)return null;
  if(o.price>=rule.threshold)return o.price;
  return Number.isSafeInteger(rule.fee)?o.price+rule.fee:null;
}
function standings(products) {
  const total=$('with-shipping').checked;
  return products.flatMap(p=>p.offers.flatMap(o=>{
    const variants=o.variants.map(v=>({size:shoeSize(v.size),price:total?totalPrice({...o,price:v.price}):v.price})).filter(v=>Number.isSafeInteger(v.price));
    if(!variants.length)return [];
    const price=Math.min(...variants.map(v=>v.price));
    return [{p,o,key:rowKey(p,o),price,sizes:[...new Set(variants.filter(v=>v.price===price).map(v=>v.size))]}];
  })).sort((a,b)=>a.price-b.price||a.p.name.localeCompare(b.p.name,'tr')||a.key.localeCompare(b.key));
}
function rankRow(r,i,previous) {
  const {p,o,key,price}=r, prior=previous?.get(key), delta=prior?prior.i-i:0;
  const sizes=r.sizes.map(v=>v.replace('.',',')).join(' · ');
  const change=delta?`<small class="movement">${delta>0?'▲':'▼'} ${Math.abs(delta)} sıra</small>`:'';
  const eligible=r.sizes;
  const productMode=!$('with-shipping').checked;
  const comparisons=eligible.map(size=>{
    const prices=p.offers.filter(other=>other.sourceId!==o.sourceId).flatMap(other=>other.variants.filter(v=>shoeSize(v.size)===size).map(v=>productMode?v.price:totalPrice({...other,price:v.price}))).filter(Number.isSafeInteger);
    return {size,diff:prices.length?Math.min(...prices)-price:0};
  }).filter(c=>c.diff>0).sort((a,b)=>b.diff-a.diff);
  const saving=comparisons[0];
  const gap=saving?`<span class="radar-gap">EU ${esc(saving.size.replace('.',','))} · ikinci mağazadan ${currency.format(saving.diff/100)} ucuz</span>`:'';
  const cut=prior&&prior.price>price&&eligible.some(size=>prior.sizes?.includes(size))?`<small class="price-cut">↓ ${currency.format((prior.price-price)/100)}</small>`:'';
  const brand=p.brand || '', name=p.name.toLocaleUpperCase('tr').startsWith(brand.toLocaleUpperCase('tr')+' ')?p.name.slice(brand.length).trim():p.name;
  const current=verified.has(key), stamp=date(o.checkedAt);
  return `<a class="timing-row pos-${Math.min(i+1,4)}" data-key="${esc(key)}" href="${esc(safe(o.url))}" target="_blank" rel="noopener noreferrer" aria-label="${i+1}. sıra · ${esc(p.name)} · ${currency.format(price/100)} · ${esc(sourceName(o.sourceId))} mağazasında aç"><span class="timing-thumb">${safe(p.image)?`<img src="${esc(safe(p.image))}" alt="" loading="lazy" width="92" height="82">`:''}<span class="position"><b>${String(i+1).padStart(2,'0')}</b></span></span><span class="timing-product"><small>${esc(brand)}${i===0?' <em>LİDER</em>':''}</small><strong>${esc(name)}</strong><span class="row-size">EU ${esc(sizes)}</span>${gap}</span><span class="timing-price"><b>${currency.format(price/100)}</b>${cut}${change}${$('with-shipping').checked?'<small>Kargo dahil</small>':''}</span><span class="row-foot"><span class="store-name">${esc(sourceName(o.sourceId))} <span aria-hidden="true">↗</span></span><time class="${current?'checked':'snapshot'}" datetime="${esc(o.checkedAt)}" title="${esc(stamp)} TSİ">${current?'Kontrol':'Tarama'} · ${esc(stamp)}</time></span></a>`;
}
function draw(previous) {
  const grid=$('grid'), focusKey=document.activeElement?.closest?.('.timing-row')?.dataset.key;
  const old=previous?new Map([...grid.querySelectorAll('.timing-row')].map(el=>[el.dataset.key,el.getBoundingClientRect().top])):null;
  grid.innerHTML=board.slice(0,shown).map((r,i)=>`<div class="radar-offer">${rankRow(r,i,previous)}<a class="history-link" href="/sole-radar/urun/${esc(r.p.id)}/?${selectedSizes().map(s=>'beden='+encodeURIComponent(s)).join('&amp;')}">Fiyat geçmişi ↗</a></div>`).join('') || `<div class="empty"><strong>${selectedSizes().length?'Bu seçimde stoklu teklif bulunamadı.':'Sıralamayı görmek için numaranı seç.'}</strong></div>`;
  for(const row of grid.querySelectorAll('.timing-row')){
    if(row.dataset.key===focusKey)row.focus({preventScroll:true});
    if(old?.has(row.dataset.key)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      const dy=old.get(row.dataset.key)-row.getBoundingClientRect().top;
      if(dy&&Math.abs(dy)<innerHeight)row.animate?.([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:420});
    }
  }
  grid.setAttribute('aria-busy','false');
  $('result-count').textContent=selectedSizes().length?`${count(board.length)} teklif · ${$('with-shipping').checked?'Kargosu doğrulanan mağazalar':'En ucuzdan pahalıya'} · ${count(Math.min(shown,board.length))} gösteriliyor`:'Sonuçlar için numaranı seç';
  $('more').hidden=shown>=board.length;
}
function filter(updateURL=true, keep=false) {
  const previous=keep?new Map(board.map((r,i)=>[r.key,{i,price:r.price,sizes:r.sizes}])):null;
  if(!keep)shown=36;
  matches=selectProducts();board=standings(matches);
  if(!keep)candidates.clear();
  for(const r of board)candidates.set(r.key,r);
  draw(previous);
  if(updateURL){
    const params=new URLSearchParams();
    selectedSizes().forEach(size=>params.append('size',size));
    for(const id of ['brand','model'])if($(id).value)params.set(id,$(id).value);
    if($('with-shipping').checked)params.set('kargo','1');
    history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
    $('save-status').textContent='';
  }
  savedMovement();
}
function applyQuote(product,offer,q) {
  const at=Date.parse(q.checkedAt);
  if(q.id!==product.id || q.url!==offer.url || q.sourceId!==offer.sourceId || !Number.isFinite(at)||at<=Date.parse(offer.checkedAt)||at>Date.now()+300000||!Array.isArray(q.variants)||!q.variants.every(v=>v&&typeof v.size==='string'&&v.available===true&&Number.isSafeInteger(v.price)&&v.price>0))return false;
  Object.assign(offer,{variants:q.variants,checkedAt:q.checkedAt});verified.add(rowKey(product,offer));return true;
}
async function recheck(){
  if(document.hidden||checking||updating||!candidates.size)return;
  checking=true;
  try{
    const now=Date.now(), due=r=>(attempts.get(r.key)||0)<now-45000;
    const oldest=list=>list.filter(due).sort((a,b)=>(attempts.get(a.key)||0)-(attempts.get(b.key)||0));
    const visible=oldest(board.slice(0,shown)), all=oldest([...candidates.values()]);
    const targets=[...new Set([board.slice(0,3).find(due),visible[0],all.find(r=>!visible.includes(r)),...visible.slice(0,3),...all.slice(0,3)].filter(Boolean))].slice(0,3);
    let changed=false;
    await Promise.all(targets.map(async r=>{
      attempts.set(r.key,now);
      const product=data.products.find(p=>p.id===r.p.id),offer=product?.offers[r.o.quoteIndex];
      if(!offer||offer.url!==r.o.url)return;
      try{
        const origin=location.hostname==='veinpsycoo.github.io'?'https://sole-radar-preview.vercel.app':'';
        const res=await fetch(origin+'/api/teklif/'+product.id+'/'+r.o.quoteIndex,{signal:AbortSignal.timeout(10000)});
        if(res.ok && applyQuote(product,offer,await res.json()))changed=true;
      }catch{/* Keep the dated catalog offer when its retailer cannot be reached. */}
    }));
    if(changed){
      const former=board[0];filter(false,true);
      const sourceOffer=former&&data.products.find(p=>p.id===former.p.id)?.offers.find(o=>o.url===former.o.url);
      const gone=sourceOffer && verified.has(former.key) && Date.parse(sourceOffer.checkedAt)>Date.parse(former.o.checkedAt) && !sourceOffer.variants.some(v=>v.available&&selectedSizes().includes(shoeSize(v.size)));
      $('timing-status').textContent=(gone?'Önceki liderin seçili numaralarda stoğu tükendi. ':'')+'Son mağaza doğrulaması '+date(new Date())+' TSİ';
    }
    else if(targets.length)$('timing-status').textContent='Yeni mağaza verisi doğrulanamadı · Satırlarda son kontrol saati gösteriliyor.';
  }finally{checking=false;}
}
async function load() {
  if(updating)return;updating=true;
  try {
    const response = await fetch('/sole-radar/api/catalog.json',{cache:'no-cache'});
    if (!response.ok) throw new Error('Katalog okunamadı');
    const next=await response.json();
    if(!Array.isArray(next.products)||!Array.isArray(next.sources))throw Error();
    const oldOffers=new Map(data.products.flatMap(p=>p.offers.filter(o=>verified.has(rowKey(p,o))).map(o=>[rowKey(p,o),o])));
    for(const p of next.products)for(const o of p.offers){const newer=oldOffers.get(rowKey(p,o));if(newer && Date.parse(newer.checkedAt)>Date.parse(o.checkedAt))Object.assign(o,{variants:newer.variants,checkedAt:newer.checkedAt});else verified.delete(rowKey(p,o));}
    data=next;loadFilters();
    const params=new URLSearchParams(location.search);
    $('with-shipping').checked=params.get('kargo')==='1';
    sizePicker.set($('size-picker'),[...params.getAll('size'),...params.getAll('size2')]);
    brandMenu();
    if(params.has('brand')) $('brand').value=params.get('brand');
    $('model').value=(params.get('model')||'').slice(0,100);suggestions();sources();
    $('timing-status').textContent='Tarama fiyatları · Seçimine uyan teklifler sırayla mağazadan kontrol edilir.';
    const active=data.products.filter(p=>p.offers.some(fresh));
    window.dispatchEvent(new Event('catalog-ready'));
    $('product-count').textContent=count(active.length);
    const sourceIds=new Set(active.flatMap(p=>p.offers.filter(fresh).map(o=>o.sourceId)));
    $('source-count').textContent=count(sourceIds.size); $('nav-count').textContent=sourceIds.size;
    $('updated').textContent=data.generatedAt ? `Son tarama: ${date(data.generatedAt)} TSİ` : 'Henüz tarama yapılmadı.';
    const stale=data.products.length-active.length;
    $('notice').hidden=Boolean(active.length && !stale);
    $('notice').textContent=stale ? `${count(stale)} modelin verisi eskidi veya kaynağı doğrulanamadı. Güncel teklifler için verileri yenile.` : !active.length ? 'Henüz güncel ürün yok. İlk kataloğu oluşturmak için Verileri yenile düğmesini kullan.' : '';
    filter(false,true);
    clearTimeout(expiryTimer);
    const expiries = active.flatMap(p => p.offers.filter(fresh).map(o => new Date(o.checkedAt).getTime() + 86400000 - Date.now()));
    if (expiries.length) expiryTimer = setTimeout(load, Math.max(1000, Math.min(...expiries) + 100));
  } catch {
    if(data.products.length){filter(false,true);$('timing-status').textContent='Bağlantı kurulamadı · Son doğrulanmış fiyatlar gösteriliyor.';return;}
    $('notice').hidden=false; $('notice').textContent='Katalog yüklenemedi. Uygulamanın çalıştığını kontrol edip sayfayı yenile.';
    $('grid').setAttribute('aria-busy','false'); $('grid').innerHTML='<p class="empty">Canlı arama yüklenemedi. <a href="/sole-radar/modeller/">Model sayfalarından devam et ↗</a></p>'; $('result-count').textContent='Veriye ulaşılamadı';
  } finally {updating=false;}
}
async function checkStatus() {
  try {
    const response=await fetch('/sole-radar/api/status.json'+'?v='+Math.floor(Date.now()/60000),{cache:'no-cache'}); if(!response.ok) throw new Error();
    const state=await response.json(); $('refresh').disabled=state.running;
    if(state.readOnly){if(state.generatedAt && data.generatedAt && state.generatedAt!==data.generatedAt)await load();$('refresh').hidden=true;$('refresh-status').textContent=state.preview?'Önizleme: son katalog taramasını gösteriyor.':'Veriler düzenli aralıklarla kontrol edilir.';return;}
    $('refresh').textContent=state.running ? 'Tarama sürüyor…' : '↻ Verileri yenile';
    const progress = Object.values(state.progress).reduce((a,b)=>a+b,0);
    $('refresh-status').textContent=state.error ? `Tarama tamamlanamadı: ${state.error}` : state.running ? `Mağazalar taranıyor.${progress ? ` ${count(progress)} stoklu kayıt okundu.` : ' Geniş kataloglarda bu işlem uzun sürebilir.'}` : polling ? 'Tarama tamamlandı. Kaynak sonuçları aşağıda.' : '';
    if(state.running) {polling=true;setTimeout(checkStatus,4000);} else if(polling) {polling=false;await load();}
  } catch {polling=false; $('refresh').disabled=false; $('refresh-status').textContent='Tarama durumu alınamadı. Sayfayı yenile.';}
}
$('filters').addEventListener('submit',e=>e.preventDefault());
let typing;
$('filters').addEventListener('input',e=>{clearTimeout(typing);if(e.target.id==='brand')$('model').value='';const update=()=>{if(e.target.name==='size')brandMenu();suggestions();filter();recheck();};if(e.target.id==='model')typing=setTimeout(update,160);else update();});
$('filters').addEventListener('reset',()=>setTimeout(()=>{brandMenu();suggestions();filter();},0));
$('more').addEventListener('click',()=>{const previous=shown;shown+=36;draw();const next=$('grid').children[previous];next?.querySelector('a')?.focus();});
$('refresh').addEventListener('click',async()=>{
  $('refresh').disabled=true;
  try {const r=await fetch('/api/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok && r.status!==409) throw new Error();polling=true;checkStatus();}
  catch {$('refresh').disabled=false;$('refresh-status').textContent='Tarama başlatılamadı. Tekrar deneyebilirsin.';}
});
function snapshot(r){return r && {key:r.key,price:r.price,sizes:r.sizes,at:r.o.checkedAt};}
function savedMovement(){
  try{
    if(!savedRankings().includes(location.search))return;
    const prev=JSON.parse(localStorage.getItem('radar-leaders')||'{}')[location.search],leader=board[0];
    if(!prev||!leader||Date.parse(prev.at)>=Date.parse(leader.o.checkedAt))return;
    if(prev.key===leader.key&&leader.price<prev.price&&leader.sizes.some(s=>prev.sizes.includes(s)))$('save-status').textContent='Kaydından beri aynı numarada liderin fiyatı düştü.';
    else if(prev.key!==leader.key)$('save-status').textContent='Kaydından beri bu sıralamanın lideri değişti.';
  }catch{/* Device storage is optional. */}
}
function savedRankings(){
  try {const items=JSON.parse(localStorage.getItem('sole-rankings')||'[]');return Array.isArray(items)?items.filter(x=>typeof x==='string'&&x.startsWith('?')&&x.length<600).slice(0,12):[];} catch{return [];}
}
function drawSaved(){
  const list=$('saved-rankings');list.replaceChildren();
  for(const query of savedRankings()){
    const q=new URLSearchParams(query), title=[q.get('brand'),q.get('model'),q.getAll('size').join(' / '),q.has('kargo')?'Kargo dahil':''].filter(Boolean).join(' · ');
    const link=document.createElement('a');link.href=location.pathname+query;link.textContent=title;
    const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',title+' kaydını kaldır');
    remove.onclick=()=>writeSaved(savedRankings().filter(x=>x!==query));list.append(link,remove);
  }
}
function writeSaved(items){try{localStorage.setItem('sole-rankings',JSON.stringify(items));drawSaved();return true;}catch{$('save-status').textContent='Bu cihazda kayıt yapılamadı.';return false;}}
$('save-ranking').onclick=()=>{if(!selectedSizes().length){$('save-status').textContent='Önce numaranı seç.';return;}filter();const q=location.search;try{const baselines=JSON.parse(localStorage.getItem('radar-leaders')||'{}');baselines[q]=snapshot(board[0]);localStorage.setItem('radar-leaders',JSON.stringify(Object.fromEntries(Object.entries(baselines).filter(([k])=>k===q||savedRankings().includes(k)))));}catch{}if(writeSaved([q,...savedRankings().filter(x=>x!==q)].slice(0,12)))$('save-status').textContent='Bu cihazda kaydedildi.';};
$('with-shipping').onchange=()=>filter();
async function startRadar(){
  drawSaved();
  try{const res=await fetch(new URL('radar/shipping.json',document.baseURI),{signal:AbortSignal.timeout(4500)});if(res.ok)shippingRules=await res.json();}catch{/* No confirmed shipping terms. */}
  await load();checkStatus();
}
startRadar();
setInterval(recheck,15000);setInterval(()=>{if(!document.hidden)checkStatus();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkStatus();recheck();}});
