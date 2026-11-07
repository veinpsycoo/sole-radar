# SOLE RADAR mobile

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

## Hesap ve mağaza adımları
Expo CLI cihaz girişi başlatıldı; sahibin giriş onayı bekleniyor. Apple Developer hesabı hazır olduğu bildirildi, ekip ve imzalama erişimi doğrulanmadı.
Girişten sonra sahibi altında EAS projesini bağla, com.soleradar.app uygunluğunu kontrol et, production profiliyle imzalı iOS build al.
TestFlight cihaz testi, gerçek ekran görüntüleri, App Store gizlilik cevapları ve inceleme tamamlanmadan mağaza yayını tamamlandı denmez.
store-listing.tr.json metin taslağıdır; Muhammet Çay ve veinpsyco@gmail.com kullanıcı tarafından sağlandı.

## Yerel doğrulama
npm run typecheck
npx expo lint app lib --max-warnings 0
node --experimental-strip-types lib/catalog.test.mjs
npx expo-doctor
npx expo export --platform ios --output-dir dist-ios

Bulut build planını ve kota durumunu EAS projesi bağlandıktan sonra kontrol et; başarısız buildleri körlemesine tekrarlama.
