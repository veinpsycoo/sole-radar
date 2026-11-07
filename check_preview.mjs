import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const origin = process.argv[2] || 'https://sole-radar-preview.vercel.app';
assert(new URL(origin).protocol === 'https:');
async function get(path, status=200, options={}) {
  let response;
  for(let attempt=0;attempt<3;attempt++) {
    try {response=await fetch(origin + path,{...options,signal:AbortSignal.timeout(30000)});break;}
    catch(error) {if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
  }
  assert.equal(response.status, status, path);
  assert(response.headers.get('x-robots-tag')?.includes('noindex'), `${path}: preview must not be indexed`);
  return response;
}
const home = await (await get('/')).text();
assert(home.includes('id="size-picker"') && home.includes('id="brand"'));
assert(!home.includes('hero-shoe'));
assert(home.includes('noindex,follow'));
assert(home.includes('/blog/'));
assert(home.includes('Senin numaran.'));
assert(home.includes('summary_large_image'));
const catalogText = await (await get('/api/catalog')).text();
const catalogHash = createHash('sha256').update(catalogText).digest('hex');
if(process.argv[4]) assert.equal(catalogHash,process.argv[4],'The alias must serve the published catalog snapshot');
const catalog = JSON.parse(catalogText);
assert.equal(catalog.sources.length,10);
assert(catalog.products.length>100);
for(const product of catalog.products) for(const offer of product.offers) for(const v of offer.variants) {
  assert(Number.isSafeInteger(v.price)&&v.price>0&&v.available===true);
}
const status=await (await get('/api/status')).json();
assert(status.readOnly&&status.preview);
await get('/api/refresh',405,{method:'POST'});
for(const path of ['/.env.local','/collector.py','/data/catalog.json','/.vercel/project.json']) await get(path,404);
const blog=await(await get('/blog/')).text();
assert(blog.includes('Radar rehberi'));
await get('/blog/ayakkabi-beden-filtresi/');
await get('/urun/'+catalog.products[0].id+'/');
const sized = catalog.products.find(p=>p.offers.some(o=>o.variants.some(v=>/^\d+(?:[.,]\d+)?$/.test(v.size))));
assert(sized, 'A product with a verified numeric size must exist');
const size = sized.offers.flatMap(o=>o.variants).find(v=>/^\d+(?:[.,]\d+)?$/.test(v.size)).size;
const detail = await(await get('/urun/'+sized.id+'/?beden='+encodeURIComponent(size))).text();
assert(detail.includes(`value="${size}" checked`));
await get('/modeller/?page=2');
assert((await(await get('/robots.txt')).text()).includes('Disallow: /'));
assert((await(await get('/llms.txt')).text()).includes('[Veri yöntemimiz]'));
for(const path of ['/vendor/font-3.ttf','/vendor/LENIS-LICENSE.txt','/vendor/manrope-OFL.txt','/vendor/barlowcondensed-OFL.txt']) await get(path);
const result={url:origin,checkedAt:new Date().toISOString(),catalogHash,models:catalog.products.length,sources:catalog.sources.length,checks:'HTTP routes, noindex, read-only API, private-file isolation, catalog money/stock, blog, product, fonts and size-first homepage passed'};
if(process.argv[3]) await writeFile(process.argv[3],JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
