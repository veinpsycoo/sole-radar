// GitHub Pages applies the same two-size selection to the exported offer rows.
'use strict';
const form = document.querySelector('.detail-size');
const selections = [...new Set(new URLSearchParams(location.search).getAll('beden').filter(Boolean).map(s=>s.slice(0,40).replace(',', '.')))].slice(0,2);
form.querySelectorAll('select').forEach((select,i)=>{
  const value=selections[i] || '';
  if(value && ![...select.options].some(o=>o.value===value)) select.add(new Option(value+' — güncel stok yok',value));
  select.value=value;
});
const prices=[];
const formatter=new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'});
for(const offer of document.querySelectorAll('.offer-detail')) {
  const offerPrices=[];
  const age=Date.now()-new Date(offer.querySelector('time').dateTime).getTime();
  const rows=[...offer.querySelectorAll('li')];
  rows.forEach(row=>{
    const size=row.firstChild.textContent.trim();
    row.hidden=!(age>=-300000&&age<86400000) || (selections.length>0&&!selections.includes(size));
    if(!row.hidden) {
      const price=Number(row.querySelector('strong').textContent.replaceAll('.','').replace(',','.').replace(/[^\d.]/g,''));
      if(Number.isFinite(price)&&price>0) {prices.push(price);offerPrices.push(price);}else row.hidden=true;
    }
  });
  offer.hidden=rows.every(row=>row.hidden);
  offer.dataset.price=offerPrices.length ? Math.min(...offerPrices) : Infinity;
}
[...document.querySelectorAll('.offer-detail')].sort((a,b)=>Number(b.dataset.price)-Number(a.dataset.price)).forEach(offer=>form.insertAdjacentElement('afterend',offer));
const lead=document.querySelector('.product-detail .lead');
lead.textContent=prices.length ? formatter.format(Math.min(...prices))+'’den başlayan' : 'Seçtiğin bedenlerde güncel teklif bulunmuyor.';
lead.hidden=false;
document.querySelector('#static-status').textContent=selections.length ? selections.join(' / ').replaceAll('.',',')+' beden için güncel teklifler.' : 'Tüm stoklu bedenler gösteriliyor.';
