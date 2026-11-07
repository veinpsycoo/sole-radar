import {useEffect} from 'react';
import {Platform} from 'react-native';
import {router} from 'expo-router';
import {Stack} from 'expo-router/stack';
import {StatusBar} from 'expo-status-bar';
import {CatalogProvider} from '@/lib/catalog-context';
export default function Layout() {
  useEffect(()=>{
    if(Platform.OS==='web')return;
    let active=true,subscription:{remove():void}|undefined;
    import('expo-notifications').then(mod=>{
      if(!active)return;
      const open=(response:ReturnType<typeof mod.getLastNotificationResponse>)=>{
        const data=response?.notification.request.content.data;
        if(data&&typeof data.id==='string'&&/^[a-f0-9]{20}$/.test(data.id)&&typeof data.size==='string'){
          router.push({pathname:'/product/[id]',params:{id:data.id,size:data.size}});mod.clearLastNotificationResponse();
        }
      };
      subscription=mod.addNotificationResponseReceivedListener(open);open(mod.getLastNotificationResponse());
    }).catch(()=>{});
    return ()=>{active=false;subscription?.remove();};
  },[]);
  return <CatalogProvider><StatusBar style="light"/><Stack screenOptions={{headerStyle:{backgroundColor:'#0a0a0d'}, headerTintColor:'#f0f0f5', contentStyle:{backgroundColor:'#0a0a0d'}, headerBackButtonDisplayMode:'minimal'}}><Stack.Screen name="index" options={{title:'SOLE RADAR', headerLargeTitle:true}}/><Stack.Screen name="product/[id]" options={{title:'Teklifler'}}/><Stack.Screen name="about" options={{title:'Yöntemimiz'}}/></Stack></CatalogProvider>;
}
