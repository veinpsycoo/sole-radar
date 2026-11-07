export default {async fetch(request,env) {
  const url=new URL(request.url);
  if (!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const platform=url.pathname.slice(1);
  if (['ios','android'].includes(platform)) {
    const source=await env.ASSETS.fetch(new Request(new URL('/'+platform+'.multipart',url),{method:request.method}));
    if (!source.ok)return source;
    return new Response(source.body,{headers:{'content-type':'multipart/mixed; boundary=orcinal-preview-manifest','expo-protocol-version':'0','expo-sfv-version':'0','cache-control':'no-store'}});
  }
  return env.ASSETS.fetch(request);
}};
