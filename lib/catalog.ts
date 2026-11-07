export type Variant = {size: string; price: number; available: boolean};
export type Offer = {sourceId: string; url: string; checkedAt: string; variants: Variant[]};
export type Product = {id: string; name: string; brand: string; color: string; code: string; image: string; offers: Offer[]};
export type Catalog = {generatedAt: string | null; sources: {id: string; name: string; status: string}[]; products: Product[]};
export type Result = Omit<Product, 'offers'> & {offers: (Offer & {price: number})[]; price: number};
export const emptyCatalog: Catalog = {generatedAt: null, sources: [], products: []};
const hosts = new Set(['www.vitruta.com', 'www.merrell.com.tr', 'www.newbalance.com.tr', 'www.sneaksup.com', 'www.asics.com.tr', 'www.salomon.com.tr', 'www.spx.com.tr', 'www.converse.com.tr', 'tr.puma.com', 'www.reebok.com.tr', 'www.beymen.com']);
export const fold = (text: string) => text.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
export const money = (price: number) => new Intl.NumberFormat('tr-TR', {style: 'currency', currency: 'TRY'}).format(price / 100);
export function shoeSize(value: string): string {
  const match = value.trim().replace(',', '.').match(/^(\d{2})(?:([.]5)|\s*([⅓⅔]))?$/);
  if (!match || Number(match[1]) < 35 || Number(match[1]) > 50 || (match[1] === '50' && (match[2] || match[3]))) return '';
  return match[1] + (match[2] || (match[3] ? ' ' + match[3] : ''));
}
export function safeUrl(value: string, retailer = false): string {
  try { const url = new URL(value); return url.protocol === 'https:' && (!retailer || hosts.has(url.hostname)) ? url.href : ''; } catch { return ''; }
}
export function parseCatalog(raw: unknown): Catalog {
  if (!raw || typeof raw !== 'object') throw new Error('Katalog biçimi geçersiz.');
  const data = raw as Catalog;
  if (!Array.isArray(data.products) || !Array.isArray(data.sources) || data.products.length > 100000) throw new Error('Katalog biçimi geçersiz.');
  for (const s of data.sources) if (!s || typeof s.id !== 'string' || typeof s.name !== 'string' || typeof s.status !== 'string') throw new Error('Mağaza verisi geçersiz.');
  for (const p of data.products) {
    if (!p || !['id','name','brand','color','code','image'].every(k => typeof p[k as keyof Product] === 'string') || !/^[a-f0-9]{20}$/.test(p.id) || !Array.isArray(p.offers)) throw new Error('Ürün verisi geçersiz.');
    for (const o of p.offers) {
      if (!o || typeof o.sourceId !== 'string' || typeof o.checkedAt !== 'string' || typeof o.url !== 'string' || !Array.isArray(o.variants)) throw new Error('Teklif verisi geçersiz.');
      for (const v of o.variants) if (!v || typeof v.size !== 'string' || !Number.isSafeInteger(v.price) || v.price <= 0 || typeof v.available !== 'boolean') throw new Error('Beden verisi geçersiz.');
    }
  }
  return data;
}
export function offersFor(p: Product, data: Catalog, sizes: string[] = [], now = Date.now()): Result['offers'] {
  const sources = new Set(data.sources.filter(s => s.status !== 'error').map(s => s.id));
  return p.offers.flatMap(o => {
    const age = now - Date.parse(o.checkedAt);
    if (!(age >= -300000 && age < 86400000) || !sources.has(o.sourceId) || !safeUrl(o.url, true)) return [];
    const variants = o.variants.filter(v => v.available && (!sizes.length || sizes.includes(shoeSize(v.size))));
    return variants.length ? [{...o, variants, price: Math.min(...variants.map(v => v.price))}] : [];
  }).sort((a,b) => a.price - b.price);
}
export function search(data: Catalog, query: string, brand: string, sizes: string[], now = Date.now()): Result[] {
  const selected = [...new Set(sizes.map(shoeSize).filter(Boolean))].slice(0,3);
  if (!selected.length) return [];
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  return data.products.flatMap(p => {
    if (brand && p.brand !== brand) return [];
    const text = fold([p.name,p.brand,p.code,p.color].join(' '));
    if (!words.every(w => text.includes(w))) return [];
    const offers = offersFor(p, data, selected, now);
    return offers.length ? [{...p, offers, price: offers[0].price}] : [];
  }).sort((a,b) => a.price-b.price);
}
