# Orcinal · Yayına hazırlık, 8 Kasım 2026

## Altı saatlik uygulama planı

Bunlar iş için ayrılan süre dilimleridir. Mağaza onayı veya test süresi tahmini değildir.

| Dilim | İş | Kabul ölçütü |
|---|---|---|
| 0–1 saat | Apple, Google Play, Türkiye fiyat karşılaştırma uygulamaları ve sneaker rakipleri | Gereksinimler, kaynaklar ve Orcinal’de karşılığı |
| 1–2 saat | Ortak hesap ve erişim kontrolü | Google kimliği, kullanıcının yalnız kendi kayıtlarını okuyup silebilmesi |
| 2–3 saat | Web Hesabım | Google hesap seçimi, profil adı, üç numara, favoriler, hesapsız arama ve silme |
| 3–4 saat | Mobil Hesabım | Aynı hesap/veri modeli, profil numaralarıyla sıralama, ürün ekranından favori, iOS giriş seçeneği |
| 4–5 saat | Görsel kimlik | Amblem, konturlu yazı logosu, favicon, iOS ikonu, Android uyarlanabilir ve tek renk ikonları, açılış görseli |
| 5–6 saat | Yayın provası | Güvenlik kuralları, web giriş penceresi, derleme, erişilebilir mobil ekran, cihaz ve mağaza kontrol listesi |

## Rakiplerden Orcinal’e

| Kaynak | Gözlenen özellik | Orcinal’de karşılığı |
|---|---|---|
| [Cimri](https://www.cimri.com/en-son-kaca-olur) | Hesapta favoriler, fiyat alarmı ve fiyat geçmişi | Favori modeller ve numaralar profil hesabına bağlı. Cihaz alarmları profilin ayrı bağlantısından yönetilir. |
| [RunRepeat](https://www.runrepeat.com/guides/best-cheap-basketball-shoes) | Numara ve renk için mağaza karşılaştırması, fiyat alarmı | Kayıtlı üç numarayla stoklu teklif sıralamasına geçilir. Ürünün beden bazlı geçmişi korunur. |
| [Akakçe](https://www.akakce.com/) | Birden fazla mağazanın fiyat değişimini izleme | Mevcut sıralamada mağaza, kontrol zamanı ve mağazaya giden doğrudan bağlantı korunur. |

## Gönderim öncesi

- **iOS.** Kullanıcı Google ile birincil hesap açıyorsa Apple 4.8’in gizlilik özelliklerine sahip eşdeğer giriş sunulmalı. Orcinal için Apple ile Giriş seçildi. Apple Developer üyeliği ve takım erişimini doğrula. App ID için yeteneği aç, imzalama profilini yenile, Apple giriş ve iptal anahtarlarını Firebase’e bağla. Dağıtım kaydındaki satıcı adı, kişisel kayıtta işletmecinin yasal adıdır. [Apple inceleme kuralları](https://developer.apple.com/app-store/review/guidelines/) · [Firebase Apple kurulumu](https://firebase.google.com/docs/auth/ios/apple)
- **Derleme.** App Store yüklemesinde Xcode 26 veya sonrası ve iOS 26 veya sonrası SDK gerekir. iOS SDK, dağıtım hedefi ve fiziksel cihaz sürümü ayrı değerlerdir. Android telefon için güncel Play hedefi en az API 36. Projenin React Native sürümü API 36 hedefi içeriyor. Son IPA/AAB üzerinde yeniden kontrol et. [Apple gereksinimleri](https://developer.apple.com/news/upcoming-requirements/) · [Google hedef API](https://support.google.com/googleplay/android-developer/answer/11926878)
- **Android giriş.** Yerel test imzası Firebase Android kaydına eklendi. Play Console’daki uygulama imzalama sertifikasını Firebase’e kaydet ve Play üzerinden yüklenmiş sürümle dene. Dahili dağıtım ayrı sertifikayla imzalanırsa onun SHA-1 değerini de kaydet. [Android Google girişi](https://firebase.google.com/docs/auth/android/google-signin)
- **Google Play testi.** 13 Kasım 2023 sonrasında açılan kişisel hesaplarda üretim erişimine başvurmak için en az 12 testçinin 14 gün kesintisiz kapalı teste katılması gerekir. Geliştirici hesabının türünü ve tarihini Play Console’da kontrol et. [Play kapalı test](https://support.google.com/googleplay/android-developer/answer/14151465)
- **Hesap silme.** Uygulama içi silme ve dışarıdan erişilen silme yolu hazırlandı. Apple kimliğiyle kullanılan hesapta tekrar giriş, yetki iptali ve silme gerçek cihazda art arda geçmeli. Google ve Apple hesapları otomatik olarak e-posta adresi üzerinden birleştirilmez. [Apple silme kılavuzu](https://developer.apple.com/support/offering-account-deletion-in-your-app/) · [Play silme şartı](https://support.google.com/googleplay/android-developer/answer/13327111) · [Orcinal silme yolu](https://veinpsycoo.github.io/sole-radar/hesabim/?islem=sil)
- **Mağaza formları.** App Privacy ve Play Data safety beyanlarına ad, e-posta, kimlik, favoriler, numaralar ve opt-in cihaz bildirim verilerinin gerçek kullanımını işle. Kullanılan üçüncü taraf SDK’larını, nihai IPA gizlilik manifestlerini ve gerekli API gerekçelerini denetle. Yaş/içerik derecelendirmesini, destek adresini, erişilebilir politika URL’sini, cihaz ekran görüntülerini ve inceleme hesabını tamamla. [Apple gizlilik beyanı](https://developer.apple.com/app-store/app-privacy-details/) · [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
- **İçerik ve mağazalar.** Ürün görsellerini ve fiyat verilerini dağıtma izinlerinin kapsamını mağaza bazında kayda geçir. Stok filtreleri, eski fiyatın elenmesi ve mağaza yönlendirmesi gerçek ürünlerle kontrol edilmeli. [Apple inceleme kuralları, 5.2](https://developer.apple.com/app-store/review/guidelines/#intellectual-property)
- **Son cihaz turu.** Fiziksel iPhone’da ilk açılış, Google/Apple iptal ve başarılı giriş, yeniden başlatma, web-mobil favori ve beden eşitleme, çıkış, silme, fiyat alarmı ve kapalı uygulamada bildirim. Android’de Play imzalı test dağıtımında aynı tur. Mağaza ikonunu ve gerçek açılış ekranını imzalı uygulamada kontrol et. Expo Go sistem açılış ekranını ve yerel Google SDK’sını tam olarak temsil etmez. [Expo Google girişi](https://docs.expo.dev/guides/google-authentication/) · [Expo açılış ekranı](https://docs.expo.dev/versions/v58.0.0/sdk/splash-screen/)

## Önizlemede doğrulananlar

- Ücretsiz Orcinal Firebase projesi, Google sağlayıcısı, web ve iOS uygulama kaydı, Android yerel test sertifikası, Frankfurt Firestore ve hesap sahibine özel profil belgesi.
- Web önizlemesinde mobil genişlikte gerçek Google hesap seçicisine geçiş. Yerel Google giriş simülasyonunda profil adı, iki beden, favori kaydı, sayfa yenileme, favoriden kaldırma, tekrar kimlik doğrulama ve hesap silme.
- Erişim testinde başka kullanıcı ve ziyaretçi için okuma, yazma ve silme reddedildi. Genel profil listelemesi, beklenmeyen alan ve liste sınırı aşımı reddedildi. Testi çalıştırmak için Firebase Emulator Suite ile `firebase emulators:exec --project demo-orcinal-release --only auth,firestore "node test_profile.mjs"` kullanılabilir.
- Üretim cihazı ve sağlayıcı izinleri gerektiren maddeler açık. Mağazalara başvuru yapılmadı.

## Telefona teslim edilen test sürümleri

- [Telefonda aç](https://orcinal-go.aikolejim.workers.dev/) sayfasındaki iPhone ve Android bağlantıları Expo Go içindir. İmzalar, uygulama dosyaları ve Android’de ana sayfa ile Hesabım ekranı doğrulandı. Bu önizlemenin mevcut imzası 7 Aralık 2026 saat 01.08 TSİ’ye kadar geçerli.
- [İmzalı Android test sürümü](https://expo.dev/artifacts/eas/kQ9nXxe3Sw44q04CBg6309uVwDKW_oAmnbNHvMKR6lU.apk) temiz bir Android sanal cihazına kuruldu. Paket sertifikası doğrulandı, Firebase’e kaydedildi ve uygulamadaki düğmeden Google’ın yerel hesap giriş ekranına geçildi. Geri dönüşte iptal mesajı, soğuk açılışta ise Orcinal amblemi gözlendi. Hedef Android API 36 doğrulandı. Dosya depolama, ekran üstü gösterim ve biyometri için beş gereksiz izin kurulu paketten çıkarıldı. Gerçek kullanıcı hesabıyla oturum, cihazlar arası eşitleme ve bildirimler fiziksel cihaz testinde tamamlanacak.
- [iOS simülatör derlemesi](https://expo.dev/accounts/veinpsyco/projects/sole-radar/builds/7762f980-6cc4-42a7-9459-93084cbd4c88) üretildi. Arşivde Orcinal adı, uygulama ikonu, açılış ekranı, Google geri dönüş şeması ve 20 gizlilik manifesti doğrulandı. Kullanılmayan Face ID açıklaması kaldırıldı. Firebase Apple sağlayıcısı, Apple üyeliği, dağıtım imzası ve gerçek iPhone testleri açık.
- Mobil tip kontrolü, lint ve Expo Doctor kontrolleri geçti. Üretim bağımlılıkları taramasında bilinen açık bulunmadı. Expo Go'da Google düğmesi web profilini açar.
- Android testinde üç numara seçildi, 3.773 teklif listelendi ve ilk sıradaki Reebok ayakkabısına dokununca mağazanın doğrudan ürün adresi açıldı. Teklif sayısı ve fiyatları kontrol anına aittir.

## Mağaza gizlilik formu için hazırlanan yanıtlar

| Akış | Gönderilen bilgiler | Kullanım ve kullanıcı kontrolü |
|---|---|---|
| İsteğe bağlı hesap | Ad, e-posta ve hesap kimliği | Kimlik doğrulama ve cihazlar arası profil. Kullanıcı uygulamada veya webde hesap silmeyi başlatabilir. |
| Favoriler ve ayak numaraları | Kullanıcının seçtiği ürün kodları ve en fazla üç EU numarası | Kişiselleştirme. Ürünler kaldırılabilir, numaralar değiştirilebilir. |
| İsteğe bağlı alarm | Expo bildirim anahtarı, ürün, beden ve hedef fiyat | Bildirim iletimi. Cihazdaki Alarmlarım ekranından silinebilir. En fazla 90 gün tutulur. |
| Fotoğrafla model arama | Fotoğraf cihaz içinde işlenir | Görsel arama akışı resmi sunucuya yüklemez. |

İncelenen iOS simülatör paketinde uygulamanın gizlilik manifesti reklam amaçlı takibi kapalı gösteriyor. Uygulama ve bağımlılık manifestlerinde UserDefaults, dosya zamanı, sistem açılış zamanı ve disk alanı için API beyanları var. Google Sign-In manifesti kendi hizmetinin kimlik, cihaz ve kullanım verilerini ayrıca listeliyor. App Store formu için dağıtım arşivinden birleştirilmiş gizlilik raporu al ve sağlayıcının fiilî kullanımıyla karşılaştır. Reklam takibi ile dolandırıcılık önleme amaçlı veri kullanımı ayrı sorulardır. [Google giriş SDK’sı gizlilik açıklaması](https://developers.google.com/identity/sign-in/ios/app-privacy)

## Alan adı ve Apple üyeliği alındığında

1. Vercel’de satın alınan alan adını projeye ekle ve alan adı sağlayıcısında Vercel’in o alan için verdiği DNS değerini kullan. HTTPS doğrulamasını bekle. Birincil adresi çıplak alan adı veya www olarak seç.
2. Gerçek HTTPS adresiyle `python build_preview.py --production-origin https://ALAN-ADI` çalıştır. Üretim paketi `data/production-web` içine yazılır. Vercel’e bu dizini bağla. Varsayılan `python build_preview.py` deneme paketini üretmeye devam eder.
3. Alan adını Firebase Authentication yetkili alan adlarına ekle. Canlı Google kaydı, çıkış, favori eşitlemesi ve yeniden doğrulamayla silmeyi kendi telefonunda dene.
4. Tarama sonrasında üretim paketini de yeniden yayımlayan görevi etkinleştir. İlk yenilemede `/api/status` zaman damgasının ilerlediğini, `/readyz` yanıtını, ana sayfanın canonical adresini, robots ve sitemap'i doğrula. Search Console alan adını DNS ile doğruladıktan sonra sitemap gönder.
5. Apple üyeliği etkinleşince gerçek takımda com.soleradar.app için Apple ile Giriş ve Push Notifications yeteneklerini, dağıtım imzalarını ve APNs anahtarını tamamla. App Store Connect kaydına gerçek destek, gizlilik ve hesap silme adreslerini gir. Firebase Apple sağlayıcı ayarlarını tamamla.
6. Mobil dizinde `npx eas-cli build -p ios --profile production` ile dağıtım derlemesi oluştur. Tamamlanan derlemenin kimliğiyle `npx eas-cli submit -p ios --id DERLEME-KIMLIGI` çalıştır. TestFlight’ta fiziksel iPhone’da giriş, numara/model seçimi, favori, alarm bildirimi, silme ve mağaza bağlantısı testinden sonra mağaza incelemesine gönder.

Fiyat sıralaması ürünün seçili numaradaki satış fiyatını kullanır. Kargo mağazada hesaplanır.
