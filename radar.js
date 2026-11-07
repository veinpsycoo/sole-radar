'use strict';
(() => {
  const base = new URL('.', document.currentScript.src);
  const history = document.querySelector('#price-history');
  if (history) {
    const status = history.querySelector('[role=status]');
    const requested = new URLSearchParams(location.search).getAll('beden').map(shoeSize).filter(Boolean);
    async function render() {
      const id = history.dataset.product;
      const response = await fetch(new URL('radar/'+id[0]+'.json', base));
      if (!response.ok) throw Error();
      const row = (await response.json())[id] || {};
      const days = row.days || {};
      const available = [...new Set(Object.values(days).flatMap(Object.keys))].sort((a,b)=>a.localeCompare(b,'tr',{numeric:true}));
      if (!available.length) {status.textContent='Bu model için henüz fiyat gözlemi yok.'; return;}
      const select = document.createElement('select');
      select.setAttribute('aria-label','Fiyat geçmişi için numara');
      for (const size of [...new Set([...requested,...available])]) select.add(new Option('EU '+size.replace('.',','),size));
      const list = document.createElement('ul');
      function show() {
        list.replaceChildren();
        for (const day of Object.keys(days).sort().reverse()) {
          const price=days[day][select.value];
          if(!Number.isSafeInteger(price)||price<=0)continue;
          const li=document.createElement('li');
          li.textContent=day.split('-').reverse().join('.')+' · '+new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(price/100);
          list.append(li);
        }
        if (!list.children.length) list.textContent='Bu numarada gözlem yok.';
      }
      select.onchange=show; status.replaceChildren('Son 30 günde gözlenen günlük en düşük ürün fiyatı. '+(row.lastSeen?'Son fiyat gözlemi '+new Date(row.lastSeen).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})+' TSİ. ':''),select,list);show();
    }
    render().catch(()=>{status.textContent='Fiyat geçmişi şu anda alınamadı.';});
  }
  const family=document.querySelector('#family');
  if(family){
    const [color,size]=family.querySelectorAll('select');
    async function loadFamily(){
      const endpoint=base.pathname==='/sole-radar/'?'api/catalog.json':'api/catalog';
      const res=await fetch(new URL(endpoint,base));if(!res.ok)throw Error();
      const d=await res.json(), products=d.products.filter(p=>p.brand===family.dataset.brand&&(family.dataset.model==='9060'?/(?<!\d)9060(?!\d)/i:/\bXT[ -]?6\b/i).test(p.name));
      const good=new Set(d.sources.filter(s=>s.status!=='error').map(s=>s.id));
      const usable=o=>good.has(o.sourceId)&&Date.now()-Date.parse(o.checkedAt)<86400000&&Date.parse(o.checkedAt)<=Date.now()+300000;
      color.replaceChildren(new Option('Tüm renkler',''));
      for(const v of [...new Set(products.map(p=>p.color).filter(Boolean))].sort())color.add(new Option(v,v));
      function drawFamily(){
        const rows=products.filter(p=>!color.value||p.color===color.value).flatMap(p=>p.offers.filter(usable).flatMap(o=>o.variants.filter(v=>v.available&&shoeSize(v.size)&&Number.isSafeInteger(v.price)&&v.price>0).map(v=>({p,o,size:shoeSize(v.size),price:v.price}))));
        const before=size.value;size.replaceChildren(new Option('Tüm numaralar',''));
        for(const value of [...new Set(rows.map(r=>r.size))].sort())size.add(new Option(value.replace('.',','),value));
        if([...size.options].some(opt=>opt.value===before))size.value=before;
        const filtered=rows.filter(r=>!size.value||r.size===size.value).sort((a,b)=>a.price-b.price);
        const list=family.querySelector('ol');list.replaceChildren();const seen=new Set();
        for(const r of filtered){
          if(seen.has(r.p.id))continue;seen.add(r.p.id);
          const a=document.createElement('a');a.href=new URL('urun/'+r.p.id+'/?beden='+encodeURIComponent(r.size),base);a.textContent=r.p.name+' · EU '+r.size.replace('.',',')+' · '+new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(r.price/100);
          const li=document.createElement('li');li.append(a);list.append(li);
        }
        family.querySelector('[role=status]').textContent=seen.size+' renk/model · en düşük fiyattan';
      }
      color.onchange=drawFamily;size.onchange=drawFamily;drawFamily();
      const fallback=family.parentElement.querySelector('.reading-grid');if(fallback)fallback.hidden=true;
    }
    loadFamily().catch(()=>{family.querySelector('[role=status]').textContent='Güncel teklifler alınamadı.';});
  }
  const empty=document.querySelector('#calendar-empty');
  if (empty) {
    for(const li of document.querySelectorAll('[data-release]'))if(Date.parse(li.dataset.release)<=Date.now()||Date.now()-Date.parse(li.parentElement.dataset.calendarChecked)>=172800000)li.remove();
    empty.hidden=Boolean(document.querySelector('[data-release]'));
  }
})();
