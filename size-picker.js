'use strict';
const sizePicker = {
  values(root) { return [...root.querySelectorAll('input:checked')].map(input=>input.value); },
  sync(root) {
    const inputs=[...root.querySelectorAll('input')];
    inputs.filter(input=>input.checked).slice(3).forEach(input=>{input.checked=false;});
    const values=this.values(root);
    inputs.forEach(input=>{input.disabled=values.length===3&&!input.checked;});
    root.querySelector('[data-size-label]').textContent=values.length ? values.map(value=>value.replace('.',',')).join(' · ') : 'Numaranı seç';
    root.querySelector('[data-size-count]').textContent=`${values.length} / 3 seçili · Seçimi kaldırmak için tike dokun.`;
  },
  set(root, values) {
    const selected=[...new Set(values.map(value=>value.replace(',','.')).filter(Boolean))].slice(0,3);
    root.querySelectorAll('input').forEach(input=>{input.checked=selected.includes(input.value);});
    this.sync(root);
  }
};
document.querySelectorAll('[data-size-picker]').forEach(root=>{
  root.addEventListener('input',()=>sizePicker.sync(root));
  root.addEventListener('keydown',event=>{if(event.key==='Escape'){root.open=false;root.querySelector('summary').focus();}});
  root.closest('form')?.addEventListener('reset',()=>setTimeout(()=>sizePicker.sync(root),0));
  sizePicker.sync(root);
});
document.addEventListener('click',event=>{
  document.querySelectorAll('[data-size-picker][open]').forEach(root=>{if(!root.contains(event.target))root.open=false;});
});
