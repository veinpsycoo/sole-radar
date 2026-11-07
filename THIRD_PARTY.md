# Kaynaklar ve lisanslar

- GSAP 3.15.1 — https://github.com/greensock/GSAP — commit `5e6c35ff8eedea12d4f229129def635277d8b0f2`.
  `dist/gsap.min.js` ve `dist/ScrollTrigger.min.js` depodan alınıp `web/vendor` içine kopyalandı; telif başlıkları korunmuştur.
  Standard No Charge License: https://gsap.com/community/standard-license/ (6 Kasım 2026 tarihinde kontrol edildi).
- Lenis 1.3.27 — https://github.com/darkroomengineering/lenis — incelenen depo commit'i `e01eefb1f55cd08bc051521d74f5f8182b71ee9d`.
  Minify edilmiş sürüm: https://unpkg.com/lenis@1.3.27/dist/lenis.min.js.
  MIT lisansı `web/vendor/LENIS-LICENSE.txt`; CSS kaynak depodan.
- Barlow Condensed ve Manrope: Google Fonts dağıtımı; SIL Open Font License metinleri `web/vendor/*-OFL.txt` içinde.
- Ürün görselleri ve ürün bilgileri ilgili mağazalara/markalara aittir; kaynaklarına bağlantı verilir. GSAP/Lenis lisansları marka görsellerinin haklarını kapsamaz.
- GitHub/21st.dev araştırması görsel yön ve hareket yaklaşımını belirlemek için yapıldı. Başka bir sitenin logosu veya tüm sayfa tasarımı kopyalanmadı.

## 3D ana ekran — 6 Kasım 2026

- Görsel referans: [Liquid Metal Hero / Caio Bonato](https://21st.dev/@chowlol202/components/liquid-metal-hero). Kaynak kodu alınmadı; karanlık sahne ve merkezde hareket eden nesne yaklaşımı uygulandı.
- Nike Air Force1: [kiria_d / kirilldrac78](https://sketchfab.com/3d-models/air-force1-9497c5d927b04f2281e86a0777784177), CC BY 4.0. Sketchfab API ve GLB içindeki lisans metadatasıyla doğrulandı. Optimize model ve önizleme [Shoe Forge](https://github.com/hardikverma22/shoe-forge) deposundan alındı; sayfa altında görünür atıf vardır. SOLE RADAR sahne ışığını, deri yüzeyini ve hareketi değiştirdi.
- Model ailesi seçimi: [Nike Best Sellers Air Force 1](https://www.nike.com/w/best-air-force-1-shoes-5sj3yz76m50zy7ok), 6 Kasım 2026 tarihinde doğrulandı. Türkiye satış liderliği veya satış adedi iddiası değildir.
- Google model-viewer 4.2.0: https://github.com/google/model-viewer — Apache 2.0; `web/vendor/MODEL-VIEWER-LICENSE.txt`. Meshoptimizer 0.24.0: https://github.com/zeux/meshoptimizer — MIT; `MESHOPT-LICENSE.txt`.
- Stüdyo ışığı: [Studio Small 09 / Sergej Majboroda](https://polyhaven.com/a/studio_small_09), CC0. Deri normal haritası: ambientCG Leather037, CC0; Shoe Forge'un WebP dönüşümü kullanıldı.
- Tüm 3D çalışma dosyaları yerelde sunulur. Model 680 KB; model-viewer yaklaşık 1 MB; stüdyo HDR ortamı 1,6 MB. Sayfada AR, kamera veya mikrofon erişimi açılmaz.

## New Balance 9060 turntable — 7 November 2026
- Grey Jet Black, 36 source photographs: https://geturbrick.com/products/new-balance-9060-grey-jet-black
- Source URLs recorded in data/nb9060-source.html. Local originals: web/vendor/nb9060-01.jpg through nb9060-36.jpg.
- User explicitly authorized local background extraction for all 36 frames. rembg/IS-Net removed the white background (replacing the first U2Net extraction to remove remaining floor shadows); WebP preserves alpha, CSS adds a -14 degree roll. Real source angles remain intact.
- Website assets: web/vendor/nb9060-01.webp through nb9060-36.webp. Total image sequence is approximately 1.4 MB, before HTTP headers.
- Rights review on 7 November 2026: [Geturbrick Terms of Use, article 7](https://geturbrick.com/pages/cgu) requires prior written authorization for reproduction, modification and publication. No such authorization is held for these photographs; this applies to public preview reuse as well as commercial launch. Rights clearance or licensed/owned 9060 photography remains unresolved. Do not describe these images as CC-licensed or cleared.
- Potential replacement assets were located on [CGTrader](https://www.cgtrader.com/3d-models/character/clothing/new-balance-9060-u9060gre) and [TurboSquid](https://www.turbosquid.com/FullPreview/2489165), both labeled editorial-use licenses. Neither was purchased or downloaded; their listings are not permission to reuse the current photos or proof of suitability for a commercial hero.
- A single imagegen extraction was evaluated but is not used by the live turntable. Prompt: background extraction only, preserve shoe, canvas and camera angle; transparent PNG. Original generated output remains in the Codex generated-images directory.
- rembg: https://github.com/danielgatis/rembg; U2Net: https://github.com/xuebinqin/U-2-Net
- The earlier Nike model and lighting assets are no longer loaded and are excluded from the Vercel preview package.

Photo matching: web/vendor/vision contains ONNX Runtime Web 1.22.0 and the ONNX Model Zoo SqueezeNet 1.1 (opset 7). Redistribution notices and licenses are in that directory. Model source: https://github.com/onnx/models/tree/main/validated/vision/classification/squeezenet . The local reference index contains features of retailer catalog photos. Photos are loaded from the original retailers.
