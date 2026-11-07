import {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, AppState, Linking, FlatList, Image, Platform, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {Link, router} from 'expo-router';
import {Stack} from 'expo-router/stack';
import {useCatalog} from '@/lib/catalog-context';
import {money, safeUrl, search, shoeSize, offersFor} from '@/lib/catalog';
import {styles as s} from '@/lib/styles';

import AsyncStorage from '@react-native-async-storage/async-storage';
import {board,site,type Shipping} from '@/lib/radar';
type Saved={sizes:string[];brand:string;query:string;total:boolean;leader?:{key:string;price:number;sizes:string[]}};
export default function Home() {
  const {data, loading, error, now, refresh,verify} = useCatalog();
  const [query,setQuery] = useState(''), [brand,setBrand] = useState('');
  const [sizes,setSizes] = useState<string[]>([]), [sizesOpen,setSizesOpen] = useState(false);
  const [saved,setSaved]=useState<Saved[]>([]),[total,setTotal]=useState(false),[shipping,setShipping]=useState<Shipping[]>([]),[note,setNote]=useState('');
  useEffect(()=>{let mounted=true;AsyncStorage.getItem('radar-rankings').then(raw=>{if(raw&&mounted){const rows=JSON.parse(raw);if(Array.isArray(rows))setSaved(rows.filter(x=>Array.isArray(x.sizes)&&x.sizes.every((v:unknown)=>typeof v==='string'&&shoeSize(v))&&typeof x.query==='string'&&typeof x.brand==='string').slice(0,12));}}).catch(()=>{});fetch(site+'/radar/shipping.json').then(r=>r.json()).then(rows=>{if(mounted&&Array.isArray(rows))setShipping(rows);}).catch(()=>{});return ()=>{mounted=false;};},[]);
  async function save(rows:Saved[]){try{await AsyncStorage.setItem('radar-rankings',JSON.stringify(rows));setSaved(rows);setNote('Bu cihazda kaydedildi.');}catch{setNote('Seçim kaydedilemedi.');}}

  const brands = useMemo(() => [...new Set(data.products.filter(p=>offersFor(p,data,sizes,now).length).map(p=>p.brand))].sort(), [data,sizes,now]);
  const choices = useMemo(() => [...new Set(data.products.flatMap(p=>offersFor(p,data,[],now).flatMap(o=>o.variants.map(v=>shoeSize(v.size)))).filter(Boolean))].sort((a,b)=>Number(a.replace(' ⅓','.333').replace(' ⅔','.667'))-Number(b.replace(' ⅓','.333').replace(' ⅔','.667'))), [data,now]);
  const results = useMemo(() => search(data,query,brand,sizes,now), [data,query,brand,sizes,now]);
  const rows=useMemo(()=>board(results,shipping,total,now),[results,shipping,total,now]);
  const targets=useMemo(()=>rows.slice(0,3).flatMap(r=>{const p=data.products.find(p=>p.id===r.p.id),index=p?.offers.findIndex(o=>o.url===r.o.url&&o.sourceId===r.o.sourceId)??-1;return index<0?[]:[{id:r.p.id,url:r.o.url,sourceId:r.o.sourceId,index}];}),[rows,data]);
  const due=useRef(new Map<string,number>());
  useEffect(()=>{
    async function check(){if(AppState.currentState!=='active')return;const list=targets.filter(t=>(due.current.get(t.url)||0)<Date.now()-45000);list.forEach(t=>due.current.set(t.url,Date.now()));await verify(list);}
    check();const clock=setInterval(check,15000);return ()=>clearInterval(clock);
  },[targets,verify]);
  const first=rows[0];
  const choice={sizes,brand,query,total,leader:first?{key:first.key,price:first.price,sizes:first.sizes}:undefined};
  const same=(x:Saved)=>x.brand===brand&&x.query===query&&x.total===total&&String(x.sizes)===String(sizes);
  const prior=saved.find(same)?.leader;
  return <>
    <Stack.Screen options={{headerRight:()=> <Link href="/about" style={s.navLink}>Yöntem</Link>}}/>
    {Platform.OS === 'ios' && <Stack.SearchBar placeholder="Model, marka veya kod ara" onChangeText={e=>setQuery(e.nativeEvent.text)}/>}
    <FlatList data={rows} keyExtractor={r=>r.key} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.list} keyboardShouldPersistTaps="handled" refreshing={loading} onRefresh={refresh} initialNumToRender={10} windowSize={5}
      ListHeaderComponent={<View>
        <Text style={s.eyebrow}>NUMARANI SEÇ / KARŞILAŞTIR</Text><Text style={s.hero}>Senin numaran.{"\n"}<Text style={s.muted}>En iyi fiyatıyla.</Text></Text>
        <Pressable accessibilityRole="button" accessibilityState={{expanded:sizesOpen}} style={s.input} onPress={()=>setSizesOpen(!sizesOpen)}><Text style={s.text}>{sizes.length?sizes.map(v=>v.replace('.',',')).join(' · '):'Numaranı seç'} {sizesOpen?'⌃':'⌄'}</Text></Pressable>
        <Text style={s.caption}>EU 35–50 · {sizes.length}/3 seçili</Text>
        {sizesOpen&&<View style={s.variants}>{choices.map(value=>{
          const checked=sizes.includes(value), disabled=!checked&&sizes.length===3;
          return <Pressable key={value} accessibilityRole="checkbox" accessibilityLabel={`${value.replace('.',',')} numara`} accessibilityState={{checked,disabled}} aria-checked={checked} disabled={disabled} style={[s.chip,checked&&s.selected,disabled&&{opacity:0.4}]} onPress={()=>setSizes(current=>current.includes(value)?current.filter(v=>v!==value):current.length<3?[...current,value]:current)}><Text style={checked?s.selectedText:s.text}>{checked?'✓ ':''}{value.replace('.',',')}</Text></Pressable>;
        })}</View>}
        {Platform.OS !== 'ios' && <TextInput style={s.input} value={query} onChangeText={setQuery} placeholder="Model, marka veya kod ara" placeholderTextColor="#9999a8" accessibilityLabel="Ayakkabı ara" autoCapitalize="none"/>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}><Pressable accessibilityRole="button" accessibilityState={{selected:!brand}} style={[s.chip,!brand&&s.selected]} onPress={()=>setBrand('')}><Text style={!brand?s.selectedText:s.text}>Tümü</Text></Pressable>{brands.map(b=><Pressable key={b} accessibilityRole="button" accessibilityState={{selected:brand===b}} style={[s.chip,brand===b&&s.selected]} onPress={()=>setBrand(b)}><Text style={brand===b?s.selectedText:s.text}>{b}</Text></Pressable>)}</ScrollView>
        <Pressable accessibilityRole="checkbox" accessibilityState={{checked:total}} onPress={()=>setTotal(!total)}><Text style={s.text}>{total?'☑':'☐'} Kargo dahil sırala</Text></Pressable>
        <Pressable style={s.button} disabled={!sizes.length} onPress={()=>save([choice,...saved.filter(x=>!same(x))].slice(0,12))}><Text style={s.selectedText}>Sıralamamı kaydet</Text></Pressable>
        {saved.map((x,i)=><View key={JSON.stringify(x)} style={s.variants}><Pressable onPress={()=>{setSizes(x.sizes);setBrand(x.brand);setQuery(x.query);setTotal(x.total);}}><Text style={s.navLink}>{[x.brand,x.query,x.sizes.join(' / '),x.total?'Kargo dahil':''].filter(Boolean).join(' · ')}</Text></Pressable><Pressable accessibilityLabel="Kaydı sil" onPress={()=>save(saved.filter((_,j)=>j!==i))}><Text style={s.caption}>Kaldır</Text></Pressable></View>)}
        <Text style={s.caption}>{note}</Text>{prior&&first&&<Text style={s.caption}>{prior.key!==first.key?'Kaydından beri lider değişti.':prior.price>first.price&&first.sizes.some(s=>prior.sizes.includes(s))?'Kaydından beri aynı numarada liderin fiyatı düştü.':''}</Text>}<View style={s.variants}><Link href="/alarmlar" style={s.navLink}>Alarmlarım</Link><Link href="https://veinpsycoo.github.io/sole-radar/foto/" style={s.navLink}>Fotoğrafla model bul ↗</Link><Link href="https://veinpsycoo.github.io/sole-radar/takvim/" style={s.navLink}>Çıkış takvimi ↗</Link></View>
        {error ? <View accessibilityRole="alert" style={s.notice}><Text style={s.text}>{error}</Text><Pressable accessibilityRole="button" style={s.button} onPress={refresh}><Text style={s.selectedText}>Tekrar dene</Text></Pressable></View> : null}
        <Text style={s.sectionTitle}>{rows.length.toLocaleString('tr-TR')} teklif</Text>
      </View>}
      ListEmptyComponent={loading?<ActivityIndicator color="#eeeef4" style={s.loader}/>:<Text style={s.empty}>{error?'Bağlantı sağlandığında modeller burada görünecek.':!sizes.length?'Önce ayak numaranı seç.':'Bu seçimde güncel teklif bulunamadı. Filtreleri genişletmeyi dene.'}</Text>}
      renderItem={({item:r,index})=>{const p=r.p;return <View><Pressable accessibilityRole="link" accessibilityLabel={`${index+1}. ${p.name}, ${money(r.price)}, mağazaya git`} style={s.card} onPress={()=>Linking.openURL(r.o.url).catch(()=>setNote('Mağaza açılamadı.'))}>
        {safeUrl(p.image)?<Image source={{uri:p.image}} style={s.productImage} resizeMode="contain"/>:<View style={s.productImage}/>}
        <View style={s.cardBody}><Text style={[s.eyebrow,index===0&&{color:'#c4efa2'}]}>{String(index+1).padStart(2,'0')} · {p.brand}{index===0?' · LİDER':''}</Text><Text style={s.productName}>{p.name}</Text><Text style={s.caption}>EU {r.sizes.join(' · ').replaceAll('.',',')}</Text><Text style={s.price}>{money(r.price)}</Text><Text style={s.caption}>{data.sources.find(x=>x.id===r.o.sourceId)?.name} ↗ {r.saving}</Text></View>
      </Pressable><Pressable onPress={()=>router.push({pathname:'/product/[id]',params:{id:p.id,size:sizes.join('|')}})}><Text style={s.navLink}>Fiyat geçmişi ve alarm ↗</Text></Pressable></View>;}}/>
  </>;
}
