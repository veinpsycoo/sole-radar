import {isRunningInExpoGo} from 'expo';
import {Link, useLocalSearchParams, router} from 'expo-router';
import {useEffect, useRef, useState} from 'react';
import {Alert, Linking, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import * as Apple from 'expo-apple-authentication';
import {onAuthStateChanged,signOut,type User} from 'firebase/auth';
import {auth,appleLogin,googleLogin,profile,saveProfile,favorite,validId,removeAccount} from '@/lib/account';
import {useCatalog} from '@/lib/catalog-context';
import {styles as s} from '@/lib/styles';

const portal='https://veinpsycoo.github.io/sole-radar/hesabim/';
const sizes=Array.from({length:16},(_,i)=>i+35).flatMap(n=>(n===50?['']:['',' ⅓','.5',' ⅔']).map(suffix=>n+suffix));
function Button({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{disabled}} onPress={onPress} style={[s.button,disabled&&{opacity:.5}]}><Text style={s.selectedText}>{label}</Text></Pressable>;
}
export default function AccountScreen() {
  const {favori}=useLocalSearchParams<{favori?:string}>(), {data}=useCatalog();
  const [user,setUser]=useState<User|null>(null),[name,setName]=useState(''),[chosen,setChosen]=useState<string[]>([]),[ids,setIds]=useState<string[]>([]);
  const [ready,setReady]=useState(false),[loaded,setLoaded]=useState(false),[working,setWorking]=useState(false),[msg,setMsg]=useState(''),[showSizes,setShowSizes]=useState(false);
  const busy=useRef(false);
  const preview=Platform.OS!=='web' && isRunningInExpoGo();
  useEffect(()=>{let active=true;
    const unsub=onAuthStateChanged(auth,async next=>{
      if(!active)return;
      setUser(next);setMsg('');setName(next?.displayName||'');setIds([]);setChosen([]);setReady(true);setLoaded(false);
      if (!next) return;
      try {const fields=await profile(next);if(active && auth.currentUser?.uid===next.uid){setChosen(fields.sizes);setIds(fields.favorites);setLoaded(true);}}
      catch {if(active && auth.currentUser?.uid===next.uid)setMsg('Profil yüklenemedi. Bağlantını kontrol edip tekrar dene.');}
    });return ()=>{active=false;unsub();};
  },[]);
  async function act(fn:()=>Promise<unknown>, success='') {
    if(busy.current)return;busy.current=true;setWorking(true);setMsg('');
    try { await fn();if(success)setMsg(success); }
    catch(e) { const code=(e as {code?:string}).code;setMsg(code==='ERR_REQUEST_CANCELED'||code==='auth/popup-closed-by-user'?'Giriş iptal edildi.':'İşlem tamamlanamadı. Bağlantını ve seçtiğin hesabı kontrol et.'); }
    finally {busy.current=false;setWorking(false);}
  }
  function toggleFavorite(id:string,add:boolean) {
    if(!user)return;
    void act(async()=>{await favorite(user,id,add);const next=await profile(user);if(auth.currentUser?.uid===user.uid)setIds(next.favorites);},add?'Favorilere eklendi.':'Favorilerden kaldırıldı.');
  }
  function confirmDelete() {
    if(!user)return;
    const message='Hesabın, kayıtlı numaraların ve favorilerin kalıcı olarak silinecek. Devam etmek için kimliğini doğrula.';
    const remove=()=>void act(()=>removeAccount(user),'Hesabın silindi.');
    if(Platform.OS==='web'){if(window.confirm(message))remove();return;}
    Alert.alert('Hesabımı sil',message,[{text:'Vazgeç',style:'cancel'},{text:'Sil ve doğrula',style:'destructive',onPress:remove}]);
  }
  const pending=validId(favori)?favori:null;
  const model=(id:string)=>data.products.find(p=>p.id===id)?.name||'Model '+id;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
    <Text style={s.hero}>{user?.displayName || 'Hesabım'}</Text>
    {!ready?<Text style={s.caption}>Hesap yükleniyor…</Text>:!user?<View>
      <Text style={s.paragraph}>Numaraların ve favori ayakkabıların tüm cihazlarında yanında.</Text>
      {preview?<><Button label="Google ile web profilimi aç ↗" disabled={working} onPress={()=>void act(()=>Linking.openURL(portal+(pending?'?favori='+pending:'')))}/><Text style={s.caption}>Expo Go denemesinde hesap tarayıcıda açılır. Uygulama içi Google girişi imzalı sürümde çalışır.</Text></>:<>
      <Button label="Google ile devam et" disabled={working} onPress={()=>void act(()=>googleLogin())}/>
      {Platform.OS==='ios'&&<Apple.AppleAuthenticationButton buttonType={Apple.AppleAuthenticationButtonType.SIGN_IN} buttonStyle={Apple.AppleAuthenticationButtonStyle.WHITE} cornerRadius={10} style={{height:48,marginTop:12}} onPress={()=>void act(()=>appleLogin())}/>}</>}
    </View>:<>
      <Text style={s.caption}>{user.email}</Text>
      {loaded?<><Text style={s.text}>Profil adı</Text><TextInput value={name} onChangeText={setName} maxLength={60} style={s.input} accessibilityLabel="Profil adı"/>
      <Button label={'Numaralarım · '+(chosen.join(' / ').replaceAll('.',',')||'Seç')} onPress={()=>setShowSizes(!showSizes)}/>
      {showSizes&&<View style={s.variants}>{sizes.map(size=>{const on=chosen.includes(size);return <Pressable key={size} accessibilityRole="checkbox" accessibilityState={{checked:on,disabled:!on&&chosen.length>=3}} disabled={!on&&chosen.length>=3} style={[s.chip,on&&s.selected]} onPress={()=>setChosen(prev=>prev.includes(size)?prev.filter(v=>v!==size):[...prev,size].slice(0,3))}><Text style={on?s.selectedText:s.text}>{on?'✓ ':''}{size.replace('.',',')}</Text></Pressable>;})}</View>}
      <Button label="Profili kaydet" disabled={working} onPress={()=>void act(()=>saveProfile(user,name,chosen),'Profilin kaydedildi.')}/>
      {chosen.length>0&&<Button label="Numaralarımla ayakkabı bul" onPress={()=>router.push({pathname:'/',params:{numaralar:chosen.join('|')}})}/>}
      <Text style={s.sectionTitle}>Favorilerim</Text>
      {pending&&!ids.includes(pending)&&<Button label={model(pending)+' · Favorilere ekle'} disabled={working} onPress={()=>toggleFavorite(pending,true)}/>}
      {!ids.length&&<Text style={s.caption}>Beğendiğin ayakkabıyı ürün ekranından ekleyebilirsin.</Text>}
      {ids.map(id=><View key={id} style={s.offer}><Link href={{pathname:'/product/[id]',params:{id}}} style={s.text}>{model(id)} ↗</Link><Button label="Favorilerden kaldır" disabled={working} onPress={()=>toggleFavorite(id,false)}/></View>)}</>:<Button label="Profili yeniden yükle" onPress={()=>void act(async()=>{const p=await profile(user);setIds(p.favorites);setChosen(p.sizes);setLoaded(true);})}/>}
      <Button label="Çıkış yap" disabled={working} onPress={()=>void act(()=>signOut(auth))}/>
      <Button label="Hesabımı sil" disabled={working} onPress={confirmDelete}/>
    </>}
    {!!msg&&<Text accessibilityLiveRegion="polite" style={s.paragraph}>{msg}</Text>}
    <Link href="/alarmlar" style={s.navLink}>Bu cihazdaki alarmlarım ↗</Link><Link href="/about" style={s.navLink}>Gizlilik ve destek ↗</Link>
  </ScrollView>;
}
