const fs = require('node:fs');
const path = require('node:path');
const {createHash,randomUUID,X509Certificate,verify} = require('node:crypto');
const {getConfig} = require('expo/config');
const root = path.resolve(__dirname,'..');
const cli = path.dirname(require.resolve('@expo/cli/package.json',{paths:[path.dirname(require.resolve('expo/package.json'))]}));
const {getCodeSigningInfoAsync,signManifestString} = require(path.join(cli,'build/src/utils/codesigning.js'));
const origin = 'https://orcinal-go.aikolejim.workers.dev';
const target = path.join(__dirname,'public');
const exported = path.resolve(process.argv[2] || 'dist');
const mime = {png:'image/png',jpg:'image/jpeg',webp:'image/webp',ttf:'font/ttf',xml:'application/xml',js:'application/javascript'};
function publishAsset(raw, ext) {
  const hash=createHash('sha256').update(raw).digest('base64url');
  const key=createHash('md5').update(raw).digest('hex');
  const filename=hash+'.'+ext;
  fs.writeFileSync(path.join(target,'assets',filename),raw);
  return {key,hash,contentType:mime[ext]||'application/octet-stream',fileExtension:'.'+ext,url:origin+'/assets/'+filename};
}
async function main() {
  const {exp}=getConfig(root,{isPublicConfig:true,skipSDKVersionRequirement:false});
  const sign=await getCodeSigningInfoAsync(exp,'sig, keyid="expo-root", alg="rsa-v1_5-sha256"');
  if(!sign?.certificateChainForResponse.length) throw Error('Sign in to the Orcinal Expo project first.');
  const cert=new X509Certificate(sign.certificateChainForResponse[0]);
  fs.mkdirSync(path.join(target,'assets'),{recursive:true});
  fs.copyFileSync(path.join(root,'assets/icon.png'),path.join(target,'icon.png'));
  fs.copyFileSync(path.join(root,'assets/orcinal-wordmark.png'),path.join(target,'orcinal-wordmark.png'));
  fs.copyFileSync(path.join(__dirname,'index.html'),path.join(target,'index.html'));
  const meta=JSON.parse(fs.readFileSync(path.join(exported,'metadata.json'))).fileMetadata;
  for(const platform of ['ios','android']) {
    const files=meta[platform];
    if(!files.bundle.endsWith('.js')) throw Error('Expo Go requires expo export --no-bytecode.');
    const launchAsset=publishAsset(fs.readFileSync(path.join(exported,files.bundle)),'js');
    const assets=files.assets.map(a=>publishAsset(fs.readFileSync(path.join(exported,a.path.replaceAll('\\','/'))),a.ext));
    const { _internal, updates, runtimeVersion, ...client }=exp;
    const hostUri=new URL(origin).host;
    const manifest=JSON.stringify({
      id:randomUUID(),createdAt:new Date().toISOString(),runtimeVersion:'exposdk:'+client.sdkVersion,launchAsset,assets,metadata:{},
      extra:{eas:client.extra.eas,scopeKey:sign.scopeKey,expoClient:{...client,hostUri,iconUrl:origin+'/icon.png'},
        expoGo:{debuggerHost:hostUri,developer:{tool:'expo-cli'},packagerOpts:{dev:false},mainModuleName:'node_modules/expo-router/entry'}}
    });
    const sig=signManifestString(manifest,sign);
    if(!verify('sha256',Buffer.from(manifest),cert.publicKey,Buffer.from(sig,'base64')))throw Error('Manifest signature verification failed.');
    const boundary='orcinal-preview-manifest';
    const body=['--'+boundary,'Content-Disposition: form-data; name="manifest"','Content-Type: application/json; charset=utf-8',
      'expo-signature: keyid="'+sign.keyId+'", sig="'+sig+'", alg="rsa-v1_5-sha256"','',manifest,
      '--'+boundary,'Content-Disposition: form-data; name="certificate_chain"','Content-Type: application/x-pem-file','',sign.certificateChainForResponse.join('\n'),'--'+boundary+'--',''].join('\r\n');
    fs.writeFileSync(path.join(target,platform+'.multipart'),body);
  }
  console.log('Both Expo Go manifests verified. Preview certificate expires '+cert.validTo);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
