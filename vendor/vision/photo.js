'use strict';
const root=new URL('.',document.currentScript.src);
let session, index, sequence=0;
const input=document.querySelector('#photo'), status=document.querySelector('#photo-status'), results=document.querySelector('#photo-results');
input.addEventListener('change',async()=>{
  const run=++sequence, file=input.files[0];results.replaceChildren();
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12000000){status.textContent='12 MB altında JPG, PNG veya WebP seç.';return;}
  status.textContent='Görsel cihazında karşılaştırılıyor…';
  let objectURL;
  try {
    ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=root.href;
    session ||= await ort.InferenceSession.create(new URL('squeezenet1.1-7.onnx',root).href,{executionProviders:['wasm']});
    if(!index){const res=await fetch(new URL('index.json?v=2',root));if(!res.ok)throw Error();index=await res.json();}
    const im=new Image();objectURL=URL.createObjectURL(file);im.src=objectURL;await im.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=224;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,224,224);
    const ratio=224/Math.max(im.width,im.height),w=Math.round(im.width*ratio),h=Math.round(im.height*ratio);
    ctx.drawImage(im,Math.floor((224-w)/2),Math.floor((224-h)/2),w,h);
    const n=224*224,first=ctx.getImageData(0,0,224,224).data;
    const background=[0,1,2].map(c=>{const a=[0,223,223*224,n-1].map(i=>first[4*i+c]).sort((a,b)=>a-b);return (a[1]+a[2])/2;});
    let x0=224,y0=224,x1=0,y1=0,visible=0;const hist=new Float32Array(64);
    for(let i=0;i<n;i++){
      const r=first[4*i],g=first[4*i+1],b=first[4*i+2];
      if(Math.max(Math.abs(r-background[0]),Math.abs(g-background[1]),Math.abs(b-background[2]))<=24)continue;
      visible++;hist[(r>>6)*16+(g>>6)*4+(b>>6)]++;const x=i%224,y=Math.floor(i/224);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
    }
    if(visible>100){
      const temp=document.createElement('canvas');temp.width=temp.height=224;temp.getContext('2d').drawImage(canvas,0,0);
      const cw=x1-x0+1,ch=y1-y0+1,scale=210/Math.max(cw,ch),nw=Math.round(cw*scale),nh=Math.round(ch*scale);
      ctx.fillRect(0,0,224,224);ctx.drawImage(temp,x0,y0,cw,ch,Math.floor((224-nw)/2),Math.floor((224-nh)/2),nw,nh);
    }
    const rgba=ctx.getImageData(0,0,224,224).data,tensor=new Float32Array(3*n);
    for(let i=0;i<hist.length;i++)hist[i]=Math.sqrt(hist[i]/Math.max(1,visible));
    for(let c=0;c<3;c++)for(let i=0;i<n;i++)tensor[c*n+i]=(rgba[i*4+c]/255-[.485,.456,.406][c])/[.229,.224,.225][c];
    const out=await session.run({data:new ort.Tensor('float32',tensor,[1,3,224,224])});
    const vector=out[session.outputNames[0]].data;
    const length=Math.sqrt(vector.reduce((sum,v)=>sum+v*v,0))||1;
    const ranked=index.map(p=>{
      const v=new Int8Array(Uint8Array.from(atob(p.v),c=>c.charCodeAt(0)).buffer);
      let dot=0,norm=0;for(let i=0;i<v.length;i++){dot+=v[i]*vector[i];norm+=v[i]*v[i];}
      const colors=atob(p.h);let overlap=0;for(let i=0;i<64;i++)overlap+=hist[i]*colors.charCodeAt(i)/255;
      return {p,score:.65*dot/(length*Math.sqrt(norm||1))+.35*overlap};
    }).sort((a,b)=>b.score-a.score);
    if(run!==sequence)return;
    status.textContent=index.length+' referans arasından görsel olarak en yakın modeller. Rengi ve ürün kodunu kontrol et.';
    for(const {p} of ranked.slice(0,6)){
      const a=document.createElement('a');a.href=new URL('../../urun/'+p.id+'/',root);const img=document.createElement('img');img.src=p.image;img.alt='';img.width=90;img.height=70;const name=document.createElement('span');name.textContent=p.name+' · '+(p.code||p.brand);a.append(img,name);const li=document.createElement('li');li.append(a);results.append(li);
    }
  }catch{if(run===sequence)status.textContent='Görsel karşılaştırma açılamadı. Başka fotoğraf veya güncel bir tarayıcı dene.';}
  finally{if(objectURL)URL.revokeObjectURL(objectURL);}
});
