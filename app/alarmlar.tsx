import {useEffect,useState} from 'react';
import {Pressable,ScrollView,Text,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Link} from 'expo-router';
import {watch,type LocalWatch} from '@/lib/watch';
import {styles as s} from '@/lib/styles';
import {money} from '@/lib/catalog';
export default function Watches(){
  const [items,setItems]=useState<LocalWatch[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{AsyncStorage.getItem('radar-watches').then(v=>setItems(v?JSON.parse(v):[])).catch(()=>setMessage('Kayıtlar okunamadı.'));},[]);
  async function remove(item:LocalWatch){
    if(busy)return;setBusy(true);
    try{await watch(item.id,item.sizes,null,true,false);setItems(items.filter(w=>w.id!==item.id||String(w.sizes)!==String(item.sizes)));}catch{setMessage('Alarm kaldırılamadı. Tekrar dene.');}finally{setBusy(false);}
  }
  return <ScrollView contentContainerStyle={s.list}><Text style={s.hero}>Alarmlarım</Text>{!items.length&&<Text style={s.caption}>Bir ürünün fiyat geçmişi ekranından stok veya fiyat alarmı ekleyebilirsin.</Text>}
    {items.map(w=><View key={w.id+w.sizes.join(',')} style={s.offer}><Link style={s.navLink} href={{pathname:'/product/[id]',params:{id:w.id,size:w.sizes.join('|')}}}>{w.name||'Takip edilen model'} ↗</Link><Text style={s.text}>EU {w.sizes.join(' / ')} · {w.target?money(w.target):'Stok alarmı'}</Text><Pressable disabled={busy} onPress={()=>remove(w)}><Text style={s.navLink}>Alarmı kaldır</Text></Pressable></View>)}<Text style={s.caption}>{message}</Text></ScrollView>;
}
