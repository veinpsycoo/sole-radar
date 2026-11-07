# Orcinal mobil

Expo SDK 58 / React Native 0.88 / Expo Router. iOS öncelikli; Android aynı kaynağı kullanır.

## Hazır olanlar
- EU 35–50 stoklu numaralar; tek bölümden en fazla üç tikli seçim, marka filtresi ve uygun fiyat sıralaması.
- Seçilen numaralar ürün ayrıntısında korunur; geçersiz, stok dışı ve 24 saati aşan teklifler sonuçlara girmez.
- Beymen dahil 11 mağaza için izin verilen HTTPS bağlantıları; destek ve gizlilik bağlantıları.
- GitHub Pages katalog adresi tüm EAS profillerinde açıkça tanımlıdır. Yerel .env ve imza dosyaları Git dışında tutulur.

## Kontroller — 7 Kasım 2026
- TypeScript, lint, katalog doğrulama/beden/para/URL testleri geçti.
- Expo Doctor: 20/20 kontrol geçti. Güncel iOS JS paketi ve web paketi üretildi.
- 390 px tarayıcı kontrolü: üç tik, dördüncü seçimi engelleme, 46 temiz seçenek, marka ve detayda numaralar; yatay taşma veya konsol hatası yok.
- Web kontrolü fiziksel iPhone veya VoiceOver testi değildir. İmzalı IPA/TestFlight/App Store yayını henüz yok.

## Telefonda deneme

[Expo Go önizlemesi ve imzalı Android test sürümü](https://orcinal-go.aikolejim.workers.dev/). Expo Go içinde Hesabım web profilini açar. Kurulu Android sürümü cihazın Google girişini kullanır. Numara ve favoriler aynı kullanıcı hesabına bağlıdır.

Önizlemeyi yenilemek için Orcinal Expo hesabında oturum açıkken mobil dizininde çalıştır.

```sh
npx expo export --no-bytecode --platform all --output-dir dist
node preview/pack.cjs dist
npx wrangler deploy --config preview/wrangler.jsonc
```

Paketleyici iki platformun imzasını doğrular ve sertifikanın son tarihini gösterir. Mevcut önizleme sertifikası 7 Aralık 2026 00.54 TSİ’de doluyor. Yayına yeni geliştirme sertifikasıyla tekrar paketleyerek devam edilir.

## Hesap ve mağaza adımları

EAS projesi bağlıdır. İmzalı Android test sürümü ve iOS simülatör sürümü üretildi. Apple üyeliği, Apple ile giriş sağlayıcısı, dağıtım imzası, fiziksel cihaz ve TestFlight adımları açık. Play App Signing kullanıldığında Google Play’in uygulama imza sertifikasını Firebase Android kaydına ekle. Ayrıntılar [mağaza hazırlık kaydında](https://github.com/veinpsycoo/sole-radar/blob/source/ORCINAL-YAYIN.md).

## Yerel doğrulama
npm run typecheck
npx expo lint app lib --max-warnings 0
node --experimental-strip-types lib/catalog.test.mjs
npx expo-doctor
npx expo export --platform ios --output-dir dist-ios
