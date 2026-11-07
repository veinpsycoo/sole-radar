import {getApps, getApp, initializeApp} from 'firebase/app';
import * as authSdk from 'firebase/auth';
import {arrayRemove, arrayUnion, deleteDoc, doc, getDoc, getFirestore, setDoc} from 'firebase/firestore/lite';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from './firebase-public.json';
import {shoeSize} from './catalog';
import clients from './google-clients.json';

const app = getApps().length ? getApp() : initializeApp(config);
function initAuth() {
  if (Platform.OS === 'web') return authSdk.getAuth(app);
  // Metro selects Firebase's React Native export, while TypeScript resolves the web declarations.
  const native = authSdk as typeof authSdk & {getReactNativePersistence(storage: typeof AsyncStorage): authSdk.Persistence};
  try { return authSdk.initializeAuth(app,{persistence:native.getReactNativePersistence(AsyncStorage)}); }
  catch (e) { if ((e as {code?:string}).code === 'auth/already-initialized') return authSdk.getAuth(app); throw e; }
}
export const auth = initAuth();
auth.languageCode = 'tr';
const db = getFirestore(app);
const ref = (user:authSdk.User) => doc(db,'profiles',user.uid);
export const validId = (value:unknown): value is string => typeof value === 'string' && /^[a-f0-9]{20}$/.test(value);
export async function profile(user:authSdk.User) {
  const data = (await getDoc(ref(user))).data();
  const favorites:string[] = Array.isArray(data?.favorites) ? data.favorites.filter(validId).slice(0,80) : [];
  const sizes:string[] = Array.isArray(data?.sizes) ? data.sizes.filter((v:unknown)=>typeof v==='string' && shoeSize(v)===v).slice(0,3) : [];
  return {sizes,favorites};
}
export async function saveProfile(user:authSdk.User, name:string, sizes:string[]) {
  if (name.trim().length > 60 || sizes.length > 3 || sizes.some(size=>shoeSize(size)!==size)) throw Error('Profil bilgilerini kontrol et.');
  await authSdk.updateProfile(user,{displayName:name.trim()});
  await setDoc(ref(user),{sizes},{merge:true});
}
export async function favorite(user:authSdk.User,id:string,add:boolean) {
  if (!validId(id)) throw Error('Model bulunamadı.');
  await setDoc(ref(user),{favorites:add?arrayUnion(id):arrayRemove(id)},{merge:true});
}
export async function googleLogin(reauth?:authSdk.User) {
  if (Platform.OS==='web') {
    const provider = new authSdk.GoogleAuthProvider();
    return reauth ? authSdk.reauthenticateWithPopup(reauth,provider) : authSdk.signInWithPopup(auth,provider);
  }
  const {GoogleSignin,isSuccessResponse} = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure(clients);
  if (Platform.OS==='android') await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog:true});
  const response=await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) throw Object.assign(new Error('Giriş iptal edildi.'), {code: 'ERR_REQUEST_CANCELED'});
  if (!response.data.idToken) throw new Error('Google kimliği doğrulanamadı.');
  const credential=authSdk.GoogleAuthProvider.credential(response.data.idToken);
  return reauth ? authSdk.reauthenticateWithCredential(reauth,credential) : authSdk.signInWithCredential(auth,credential);
}
export async function appleLogin(reauth?:authSdk.User) {
  const Apple = await import('expo-apple-authentication');
  const Crypto = await import('expo-crypto');
  const nonce=Crypto.randomUUID(), hashed=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,nonce);
  const result=await Apple.signInAsync({requestedScopes:[Apple.AppleAuthenticationScope.EMAIL,Apple.AppleAuthenticationScope.FULL_NAME],nonce:hashed});
  if (!result.identityToken) throw Error('Apple kimliği doğrulanamadı.');
  const credential=new authSdk.OAuthProvider('apple.com').credential({idToken:result.identityToken,rawNonce:nonce});
  if (reauth) {
    await authSdk.reauthenticateWithCredential(reauth,credential);
    if (!result.authorizationCode) throw Error('Apple doğrulama kodu alınamadı.');
    // Apple's native sheet returns an authorization code. Firebase's web helper expects an access token.
    const response = await fetch('https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key='+encodeURIComponent(config.apiKey), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({providerId:'apple.com',tokenType:'CODE',token:result.authorizationCode,idToken:await reauth.getIdToken(true),requestUri:'https://'+config.authDomain+'/__/auth/handler'})
    });
    if (!response.ok) throw Error('Apple izni kaldırılamadı. Tekrar dene.');
  } else {
    const {user}=await authSdk.signInWithCredential(auth,credential);
    const name=[result.fullName?.givenName,result.fullName?.familyName].filter(Boolean).join(' ');
    if (!user.displayName && name) await authSdk.updateProfile(user,{displayName:name});
  }
}
export async function removeAccount(user:authSdk.User) {
  if (user.providerData.some(p=>p.providerId==='apple.com')) await appleLogin(user);
  else await googleLogin(user);
  await deleteDoc(ref(user)); await authSdk.deleteUser(user);
}
