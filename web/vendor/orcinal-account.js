import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, updateProfile, deleteUser, reauthenticateWithPopup } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, arrayUnion, arrayRemove, deleteDoc } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore-lite.js';

const el = id => document.getElementById(id);
const base = new URL('../', location.href);
const query = new URLSearchParams(location.search);
const candidate = query.get('favori');
const validId = id => typeof id === 'string' && /^[a-f0-9]{20}$/.test(id);
const status = message => { el('acct-state').textContent = message; };
const buttons = el('acct-sizes');
const sizes = [];
for (let n = 35; n <= 50; n++) {
  for (const suffix of n === 50 ? [''] : ['', ' ⅓', '.5', ' ⅔']) {
    const value = n + suffix;
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.value = value; sizes.push(input);
    label.append(input, value.replace('.', ',')); buttons.append(label);
  }
}
const selected = () => sizes.filter(i => i.checked).map(i => i.value);
function selection() {
  const params = new URLSearchParams();
  for (const size of selected()) params.append('size', size);
  for (const input of sizes) input.disabled = selected().length >= 3 && !input.checked;
  el('search-sizes').href = new URL('?' + params, base).href;
}
buttons.onchange = selection;
el('delete-help').open = query.get('islem') === 'sil';
let names;
async function catalog() {
  if (!names) {
    const path = location.hostname === 'veinpsycoo.github.io' ? 'api/catalog.json' : 'api/catalog';
    names = fetch(new URL(path, base)).then(r => { if (!r.ok) throw Error(); return r.json(); })
      .then(d => new Map(d.products.map(p => [p.id, p.name]))).catch(() => { names = null; return new Map(); });
  }
  return names;
}
async function start() {
  const reply = await fetch(new URL('orcinal-firebase.json', import.meta.url));
  if (!reply.ok) throw Error();
  const app = initializeApp(await reply.json()), auth = getAuth(app), db = getFirestore(app);
  auth.languageCode = 'tr';
  const google = new GoogleAuthProvider();
  const ref = uid => doc(db, 'profiles', uid);
  let busy = false;
  function action(fn) {
    return async event => {
      event?.preventDefault(); if (busy) return; busy = true;
      try { await fn(); } catch (e) {
        status(({ 'auth/popup-closed-by-user':'Giriş iptal edildi.', 'auth/popup-blocked':'Giriş penceresi engellendi. Bu site için açılır pencerelere izin ver.', 'auth/user-mismatch':'Silmek istediğin hesabı seç.', 'auth/requires-recent-login':'Güvenlik için yeniden giriş yap.' })[e.code] || 'İşlem tamamlanamadı. Bağlantını kontrol edip tekrar dene.');
      } finally { busy = false; }
    };
  }
  async function renderFavorites(uid, ids) {
    const list = el('favorite-list'); list.replaceChildren();
    const items = Array.isArray(ids) ? ids.filter(validId).slice(0,80) : [];
    const pending = validId(candidate);
    if (!items.length) list.textContent = 'Henüz favori ayakkabın yok.';
    el('add-favorite').hidden = !pending || items.includes(candidate);
    if (!items.length && !pending) return;
    const products = await catalog();
    if (auth.currentUser?.uid !== uid) return;
    if (pending) el('add-favorite').textContent = (products.get(candidate) || 'Bu model') + ' · Favorilere ekle';
    for (const id of items) {
      const li = document.createElement('li'), a = document.createElement('a'), b = document.createElement('button');
      a.href = new URL('urun/' + id + '/', base); a.textContent = products.get(id) || 'Model ' + id;
      b.type = 'button'; b.className = 'secondary'; b.textContent = 'Kaldır'; b.setAttribute('aria-label',a.textContent+' modelini kaldır');
      b.onclick = action(async () => { await setDoc(ref(uid),{favorites:arrayRemove(id)},{merge:true}); await load(auth.currentUser); });
      li.append(a,b); list.append(li);
    }
  }
  async function load(user) {
    el('member').hidden = true; el('guest').hidden = Boolean(user); el('delete-account').hidden = !user;
    el('display-name').value = ''; el('email').textContent = ''; el('favorite-list').replaceChildren();
    sizes.forEach(i => { i.checked = false; }); selection();
    if (!user) { status(''); return; }
    status('Profil yükleniyor…');
    const profile = (await getDoc(ref(user.uid))).data() || {};
    if (auth.currentUser?.uid !== user.uid) return;
    el('display-name').value = user.displayName || ''; el('email').textContent = user.email || '';
    sizes.forEach(i => { i.checked = Array.isArray(profile.sizes) && profile.sizes.includes(i.value); }); selection();
    el('member').hidden = false; status(''); await renderFavorites(user.uid,profile.favorites);
  }
  el('login').onclick = action(() => signInWithPopup(auth,google));
  el('logout').onclick = action(() => signOut(auth));
  el('profile-form').onsubmit = action(async () => {
    const user = auth.currentUser; if (!user) return;
    await updateProfile(user,{displayName:el('display-name').value.trim()});
    await setDoc(ref(user.uid),{sizes:selected()},{merge:true}); status('Profilin kaydedildi.');
  });
  el('add-favorite').onclick = action(async () => {
    const user = auth.currentUser; if (!user || !validId(candidate)) return;
    await setDoc(ref(user.uid),{favorites:arrayUnion(candidate)},{merge:true}); await load(user); status('Favorilere eklendi.');
  });
  el('delete-account').onclick = action(async () => {
    const user = auth.currentUser;
    if (!user || !confirm('Orcinal hesabını ve tüm kayıtlı favorilerini kalıcı olarak silmek istiyor musun?')) return;
    if (!user.providerData.some(p => p.providerId === 'google.com')) {status('Hesabını iPhone uygulamasındaki Apple girişiyle silebilir veya destekten silme talep edebilirsin.'); return;}
    await reauthenticateWithPopup(user,google); await deleteDoc(ref(user.uid)); await deleteUser(user); status('Hesabın silindi.');
  });
  onAuthStateChanged(auth, user => {load(user).catch(() => {status('Profil alınamadı. Sayfayı yenileyebilirsin.');el('member').hidden = !user;el('profile-form').hidden=true;}); el('profile-form').hidden=false;});
}
start().catch(() => status('Hesap servisine ulaşılamadı. Sayfayı yenileyip tekrar dene.'));
