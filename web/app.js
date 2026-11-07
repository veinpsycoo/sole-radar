'use strict';
const $ = id => document.getElementById(id);
const currency = new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY', maximumFractionDigits:2});
const count = n => new Intl.NumberFormat('tr-TR').format(n);
const date = value => new Date(value).toLocaleString('tr-TR', {timeZone:'Europe/Istanbul', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safe = value => {try {const u = new URL(value); return u.protocol === 'https:' ? u.href : '';} catch {return '';}};
let data = {products:[], sources:[]}, shown = 36, matches = [], polling = false, expiryTimer;
const ids = ['size','size2','brand'];
const selectedSizes = () => [...new Set([$('size').value, $('size2').value].filter(Boolean))];
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
function loadFilters() {
  options('brand', [...new Set(data.products.map(p => p.brand))].sort(), 'Tüm markalar');
  const sizes = [...new Set(data.products.flatMap(p => p.offers.filter(fresh).flatMap(o => o.variants.map(v => v.size))).filter(Boolean))].sort((a,b) => a.localeCompare(b,'tr',{numeric:true})).map(value => ({value, label:value.replace('.', ',')}));
  options('size', sizes, 'Numaranı seç');
  options('size2', sizes, 'İkinci numara (isteğe bağlı)');
}
function sources() {
  $('source-list').innerHTML = data.sources.map(s => `<span class="source-chip ${s.status === 'error' ? 'failed' : ''}"><strong>${esc(s.name)}</strong><span>${s.status === 'error' ? 'Veri yok' : count(s.count)}</span></span>`).join('');
  $('source-details').innerHTML = data.sources.map(s => `<div class="source-status"><strong>${esc(s.name)}</strong><span>${esc(s.coverage)} · ${count(s.count)} stoklu varyant · ${date(s.checkedAt)}${s.errorCount ? ` · ${s.errorCount} sayfa/veri hatası` : ''}${s.id === 'spx' || s.id === 'converse' ? ' · Beden bilgisi doğrulanmadı' : ''}</span></div>`).join('');
}
function selectProducts() {
  const brand = $('brand').value, sizes = selectedSizes();
  if (!sizes.length) return [];
  return data.products.flatMap(p => {
    if (brand && p.brand !== brand) return [];
    const offers = p.offers.filter(o => fresh(o) && safe(o.url)).flatMap(o => {
      const variants = o.variants.filter(v => v.available === true && Number.isInteger(v.price) && v.price > 0 && sizes.includes(v.size));
      return variants.length ? [{...o,variants,price:Math.min(...variants.map(v=>v.price))}] : [];
    }).sort((a,b)=>a.price-b.price);
    return offers.length ? [{...p,offers,price:offers[0].price}] : [];
  }).sort((a,b) => a.price-b.price || a.name.localeCompare(b.name,'tr'));
}
function card(p) {
  const best = p.offers[0], stores = new Set(p.offers.map(o=>o.sourceId)).size;
  const sizes = [...new Set(p.offers.flatMap(o=>o.variants.map(v=>v.size)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr',{numeric:true}));
  const img = safe(p.image);
  return `<article class="card"><a class="product-image" href="${esc(safe(best.url))}" target="_blank" rel="noopener noreferrer" aria-label="${stores} mağaza · ${esc(p.brand)} ${esc(p.name)} — ${esc(sourceName(best.sourceId))} mağazasında aç"><img ${img ? `src="${esc(img)}"` : 'hidden'} alt="${esc(p.name)}" loading="lazy" decoding="async" width="320" height="280"><span class="image-fallback">${esc(p.brand)}</span><span class="count-badge">${stores} mağaza</span></a><div class="card-body"><div class="brand-row"><strong>${esc(p.brand)}</strong><span>${esc(p.color)}</span></div><h3><a href="/urun/${encodeURIComponent(p.id)}/${selectedSizes().length ? '?'+new URLSearchParams(selectedSizes().map(size=>['beden',size])).toString() : ''}">${esc(p.name)}</a></h3><p class="code">${p.code ? esc(p.code) : 'Mağazaya özel ürün kaydı'}</p><p class="sizes">${sizes.length ? `Beden: ${esc(sizes.slice(0,8).join(' · ').replaceAll('.', ','))}${sizes.length>8 ? ` +${sizes.length-8}`:''}` : 'Beden bilgisi mağazada'}</p><div class="price-row"><div><strong>${currency.format(p.price/100)}</strong><small>${esc(sourceName(best.sourceId))}${p.offers.some(o=>o.variants.some(v=>v.price!==p.price)) ? ' · başlayan fiyat' : ''}</small></div><a class="go" href="${esc(safe(best.url))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.name)} mağazada gör">↗</a></div><details class="offers"><summary>Teklifler ve bedenler (${p.offers.length})</summary>${p.offers.map(o=>`<div class="offer"><div><a href="${esc(safe(o.url))}" target="_blank" rel="noopener noreferrer">${esc(sourceName(o.sourceId))} ↗</a><small>${o.variants.map(v=>`${esc(v.size.replace('.', ',') || 'Beden doğrulanmadı')}: ${currency.format(v.price/100)}`).join(' · ')}</small><small>${date(o.checkedAt)} TSİ</small></div></div>`).join('')}</details></div></article>`;
}
function draw() {
  $('grid').innerHTML = matches.slice(0,shown).map(card).join('') || (selectedSizes().length ? '<div class="empty"><strong>Bu seçimde stoklu ayakkabı bulunamadı.</strong><p>Başka bir numara veya marka seçebilirsin.</p></div>' : '<div class="empty"><strong>Önce ayak numaranı seç.</strong><p>İstersen ikinci numaranı da ekle. En uygun stoklu teklifler burada görünecek.</p></div>');
  $('grid').querySelectorAll('img').forEach(img => {img.addEventListener('error',()=>{img.hidden=true;}); if(img.complete && !img.naturalWidth) img.hidden=true;});
  $('grid').setAttribute('aria-busy','false');
  $('result-count').textContent = selectedSizes().length ? `${count(matches.length)} model · En düşük fiyattan · ${count(Math.min(shown,matches.length))} gösteriliyor` : 'Sonuçlar için numaranı seç' ;
  $('more').hidden = shown >= matches.length;
}
function filter(updateURL=true) {
  shown=36; matches=selectProducts(); sources(); draw();
  if (updateURL) {
    const params = new URLSearchParams();
    ids.forEach(id=>{if($(id).value) params.set(id,$(id).value);});
    history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
  }
}
async function load() {
  try {
    const response = await fetch('/api/catalog');
    if (!response.ok) throw new Error('Katalog okunamadı');
    data = await response.json(); loadFilters();
    const params=new URLSearchParams(location.search);
    ids.forEach(id=>{if(params.has(id)) $(id).value=id.startsWith('size') ? params.get(id).replace(',', '.') : params.get(id);});
    const active=data.products.filter(p=>p.offers.some(fresh));
    window.dispatchEvent(new Event('catalog-ready'));
    $('product-count').textContent=count(active.length);
    const sourceIds=new Set(active.flatMap(p=>p.offers.filter(fresh).map(o=>o.sourceId)));
    $('source-count').textContent=count(sourceIds.size); $('nav-count').textContent=sourceIds.size;
    $('updated').textContent=data.generatedAt ? `Son tarama: ${date(data.generatedAt)} TSİ` : 'Henüz tarama yapılmadı.';
    const stale=data.products.length-active.length;
    $('notice').hidden=Boolean(active.length && !stale);
    $('notice').textContent=stale ? `${count(stale)} modelin verisi eskidi veya kaynağı doğrulanamadı. Güncel teklifler için verileri yenile.` : !active.length ? 'Henüz güncel ürün yok. İlk kataloğu oluşturmak için Verileri yenile düğmesini kullan.' : '';
    filter(false);
    clearTimeout(expiryTimer);
    const expiries = active.flatMap(p => p.offers.filter(fresh).map(o => new Date(o.checkedAt).getTime() + 86400000 - Date.now()));
    if (expiries.length) expiryTimer = setTimeout(load, Math.max(1000, Math.min(...expiries) + 100));
  } catch {
    $('notice').hidden=false; $('notice').textContent='Katalog yüklenemedi. Uygulamanın çalıştığını kontrol edip sayfayı yenile.';
    $('grid').setAttribute('aria-busy','false'); $('grid').innerHTML='<p class="empty">Canlı arama yüklenemedi. <a href="/modeller/">Model sayfalarından devam et ↗</a></p>'; $('result-count').textContent='Veriye ulaşılamadı';
  }
}
async function checkStatus() {
  try {
    const response=await fetch('/api/status'); if(!response.ok) throw new Error();
    const state=await response.json(); $('refresh').disabled=state.running;
    if(state.readOnly){$('refresh').hidden=true;$('refresh-status').textContent=state.preview?'Önizleme: son katalog taramasını gösteriyor.':'Veriler düzenli aralıklarla kontrol edilir.';return;}
    $('refresh').textContent=state.running ? 'Tarama sürüyor…' : '↻ Verileri yenile';
    const progress = Object.values(state.progress).reduce((a,b)=>a+b,0);
    $('refresh-status').textContent=state.error ? `Tarama tamamlanamadı: ${state.error}` : state.running ? `Mağazalar taranıyor.${progress ? ` ${count(progress)} stoklu kayıt okundu.` : ' Geniş kataloglarda bu işlem uzun sürebilir.'}` : polling ? 'Tarama tamamlandı. Kaynak sonuçları aşağıda.' : '';
    if(state.running) {polling=true;setTimeout(checkStatus,4000);} else if(polling) {polling=false;await load();}
  } catch {polling=false; $('refresh').disabled=false; $('refresh-status').textContent='Tarama durumu alınamadı. Sayfayı yenile.';}
}
$('filters').addEventListener('submit',e=>e.preventDefault());
$('filters').addEventListener('input',()=>filter());
$('filters').addEventListener('reset',()=>setTimeout(()=>filter(),0));
$('more').addEventListener('click',()=>{const previous=shown;shown+=36;draw();const next=$('grid').children[previous]?.querySelector('a');next?.focus();});
$('refresh').addEventListener('click',async()=>{
  $('refresh').disabled=true;
  try {const r=await fetch('/api/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok && r.status!==409) throw new Error();polling=true;checkStatus();}
  catch {$('refresh').disabled=false;$('refresh-status').textContent='Tarama başlatılamadı. Tekrar deneyebilirsin.';}
});
load();checkStatus();
