import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import {Platform} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
export type LocalWatch={id:string;sizes:string[];target:number|null;name:string};
export async function watch(id:string,sizes:string[],target:number|null,remove:boolean,daily:boolean,name=''){
  if(Platform.OS==='web')throw Error('Bildirimler iOS ve Android uygulamasında kullanılabilir.');
  const endpoint='https://sole-radar-alerts.aikolejim.workers.dev/watch';
  let auth=await SecureStore.getItemAsync('radar-key');
  if(!auth){auth=Crypto.randomUUID();await SecureStore.setItemAsync('radar-key',auth);}
  let token=await SecureStore.getItemAsync('radar-token');
  if(!remove){
    const projectId=Constants.easConfig?.projectId??Constants.expoConfig?.extra?.eas?.projectId;
    if(!projectId)throw Error('Bildirim için imzalı SOLE RADAR sürümü gerekiyor.');
    const notifications=await import('expo-notifications');
    if(Platform.OS==='android')await notifications.setNotificationChannelAsync('radar',{name:'Fiyat ve stok',importance:notifications.AndroidImportance.DEFAULT});
    if(!(await notifications.requestPermissionsAsync()).granted)throw Error('Bildirim izni verilmedi.');
    token=(await notifications.getExpoPushTokenAsync({projectId})).data;
    await SecureStore.setItemAsync('radar-token',token);
  }
  if(!token)throw Error('Bu cihazda kayıtlı alarm yok.');
  const res=await fetch(endpoint,{method:remove?'DELETE':'PUT',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({token,id,sizes,target,daily}),signal:AbortSignal.timeout(18000)});
  if(!res.ok)throw Error(res.status===503?'Bu model için güncel stok doğrulanamadı.':res.status===409?'En fazla 12 alarm kaydedebilirsin.':'Alarm servisine ulaşılamadı.');
  const rows:LocalWatch[]=JSON.parse((await AsyncStorage.getItem('radar-watches'))||'[]');
  const key=[...sizes].sort().join('|');const next=rows.filter(w=>w.id!==id||[...w.sizes].sort().join('|')!==key);
  if(!remove)next.push({id,sizes,target,name});await AsyncStorage.setItem('radar-watches',JSON.stringify(next));
}
