import {Alert, Image, Linking, Pressable, ScrollView, Text, View} from 'react-native';
import {Link,useLocalSearchParams} from 'expo-router';
import {Stack} from 'expo-router/stack';
import {useCatalog} from '@/lib/catalog-context';
import {money, offersFor, safeUrl, shoeSize} from '@/lib/catalog';
import {styles as s} from '@/lib/styles';
import {ProductRadar} from '@/lib/ProductRadar';
export default function Detail() {
  const params = useLocalSearchParams<{id:string;size?:string}>();
  const {data, now, loading, refresh} = useCatalog();
  const p = data.products.find(p=>p.id===params.id);
  if (!p) return <View style={s.list}><Text style={s.empty}>{loading?'Ürün yükleniyor…':'Ürün kaydı bulunamadı.'}</Text><Pressable accessibilityRole="button" style={s.button} onPress={refresh}><Text style={s.selectedText}>Yenile</Text></Pressable></View>;
  const sizes = [...new Set((typeof params.size === 'string' ? params.size.split('|') : []).map(shoeSize).filter(Boolean))].slice(0,3);
  const offers = offersFor(p,data,sizes,now);
  async function open(url:string) {
    const safe = safeUrl(url,true); if(!safe) return;
    try {await Linking.openURL(safe);} catch {Alert.alert('Bağlantı açılamadı','Mağaza bağlantısını tekrar dene.');}
  }
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.list}>
    <Stack.Screen options={{title:p.brand}}/>
    {safeUrl(p.image)?<Image source={{uri:p.image}} style={s.detailImage} resizeMode="contain"/>:null}
    <Text style={s.eyebrow}>{p.brand}</Text><Text style={s.hero}>{p.name}</Text><Text style={s.caption}>{p.color} · {p.code||'Mağazaya özel kayıt'}</Text>
    <Link href={{pathname:'/hesabim',params:{favori:p.id}}} style={s.navLink}>♡ Favorilerime ekle</Link>
    <Text style={s.sectionTitle}>{sizes.length?`${sizes.join(' / ').replaceAll('.',',')} beden için teklifler`:'Mağaza teklifleri'}</Text>
    {!offers.length&&<Text style={s.empty}>Güncel teklif yok. Stok ve fiyat bilgisi yenilendiğinde tekrar kontrol et.</Text>}
    {offers.map((o,i)=><View key={o.sourceId+String(i)} style={s.offer}><Text style={s.productName}>{data.sources.find(x=>x.id===o.sourceId)?.name||o.sourceId}</Text><Text style={s.price}>{money(o.price)} <Text style={s.caption}>başlayan fiyat</Text></Text><Text style={s.caption}>Kontrol: {new Date(o.checkedAt).toLocaleString('tr-TR')}</Text><View style={s.variants}>{o.variants.map((v,j)=><View key={String(j)} style={s.variant}><Text style={s.text}>{v.size||'Beden doğrulanmadı'}</Text><Text style={s.text}>{money(v.price)}</Text></View>)}</View><Pressable accessibilityRole="link" accessibilityLabel={`${data.sources.find(x=>x.id===o.sourceId)?.name} mağazasında aç`} style={s.button} onPress={()=>open(o.url)}><Text style={s.selectedText}>Mağazada gör ↗</Text></Pressable></View>)}
    {sizes.length>0&&<ProductRadar key={p.id+'|'+sizes.join(',')} id={p.id} sizes={sizes} name={p.name}/>}
    <Text style={s.caption}>Kargo ve koşullu sepet kampanyaları dahil değildir. Stok son kontrol anına aittir. Satın almadan önce mağazada kodu, rengi, bedeni ve son tutarı doğrula.</Text>
  </ScrollView>;
}
