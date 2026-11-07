import {isRunningInExpoGo} from 'expo';
import {useEffect,useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {money} from './catalog';
import {site} from './radar';
import {watch} from './watch';
import {styles as s} from './styles';
export function ProductRadar({id,sizes,name}:{id:string;sizes:string[];name:string}){
  const [days,setDays]=useState<Record<string,Record<string,number>>>({}),[historyState,setHistoryState]=useState(''),[target,setTarget]=useState(''),[daily,setDaily]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{const abort=new AbortController();fetch(site+'/radar/'+id[0]+'.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(!abort.signal.aborted){setDays(d[id]?.days||{});setHistoryState(d[id]?.lastSeen?'Son fiyat gözlemi '+new Date(d[id].lastSeen).toLocaleString('tr-TR'):'');}}).catch(()=>{if(!abort.signal.aborted)setHistoryState('Fiyat geçmişi alınamadı.');});return ()=>abort.abort();},[id]);
  async function submit(remove:boolean){
    if(busy)return;
    const clean=target.trim().replace(',','.');
    if(!remove&&clean&&(!/^\d{1,7}(?:\.\d{1,2})?$/.test(clean)||Number(clean)<=0||Number(clean)>1000000)){setMessage('Geçerli bir TL tutarı yaz.');return;}
    setBusy(true);
    try{await watch(id,sizes,clean?Math.round(Number(clean)*100):null,remove,daily,name);setMessage(remove?'Alarm kaldırıldı.':'Alarm kaydedildi. Sonraki uygun stok veya fiyat değişimini izleyeceğiz.');}
    catch(e){setMessage(e instanceof Error?e.message:'Alarm kaydedilemedi.');}finally{setBusy(false);}
  }
  return <View style={s.offer}><Text style={s.sectionTitle}>Fiyat geçmişi</Text>
    <Text style={s.caption}>{historyState}</Text>{sizes.map(size=>{const obs=Object.entries(days).filter(([,prices])=>prices[size]>0).sort(([a],[b])=>b.localeCompare(a));return <Text key={size} style={s.caption}>EU {size.replace('.',',')} · {obs.length?obs.map(([day,v])=>day.split('-').reverse().join('.')+' '+money(v[size])).join('  /  '):historyState||'Henüz gözlem yok.'}</Text>;})}
    <Text style={s.sectionTitle}>Fiyat ve stok alarmı</Text>{isRunningInExpoGo()?<Text style={s.caption}>Uzaktan bildirimleri TestFlight sürümünde deneyebilirsin.</Text>:<><Text style={s.caption}>Seçtiğin numaralardan biri stoğa gelince veya hedef fiyatına inince bildir. Takip 90 gün sürer.</Text>
    <TextInput style={s.input} accessibilityLabel="Hedef fiyat, TL" keyboardType="decimal-pad" placeholder="Yalnız stok için boş bırak · hedef TL" placeholderTextColor="#999" value={target} onChangeText={setTarget}/>
    <Pressable accessibilityRole="checkbox" accessibilityState={{checked:daily}} onPress={()=>setDaily(!daily)}><Text style={s.text}>{daily?'☑':'☐'} En fazla günde bir bildirim</Text></Pressable>
    <Pressable disabled={busy||!sizes.length} style={s.button} onPress={()=>submit(false)}><Text style={s.selectedText}>Alarmı kaydet</Text></Pressable>
    <Pressable disabled={busy||!sizes.length} onPress={()=>submit(true)}><Text style={s.navLink}>Bu numaraların alarmını kaldır</Text></Pressable><Text accessibilityLiveRegion="polite" style={s.caption}>{message}</Text></>}</View>;
}
