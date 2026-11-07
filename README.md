# SOLE RADAR

Türkiye'deki tanımlı ayakkabı mağazalarının stok, beden ve fiyatlarını karşılaştıran bağımsız uygulama. Eski ChatGPT Sites projesinin koduna erişilemediği için ayrı kurulmuştur; eski site değiştirilmedi.

**Gösterim sürümü:** https://sole-radar-preview.vercel.app

**GitHub üzerinden site:** https://veinpsycoo.github.io/sole-radar/

Depoda `main` dalı GitHub Pages çıktısı, `source` dalı web uygulamasının kaynak kodudur. GitHub sürümü son dışa aktarılan katalogdur; yerel altı saatlik Vercel görevi GitHub'ı otomatik güncellemez. 24 saati geçen teklifler gizlenir.

## Yerel web

Python 3.11+; web ve veri toplayıcı standart kütüphaneyle çalışır.

```powershell
python server.py --port 8767
python collector.py --limit 0
python collector.py --limit 0 --sources vitruta spx puma
python -m unittest test_collector test_site test_refresh_guard test_worker test_publish -q
```

Yerel adres http://127.0.0.1:8767. Yerel sunucuyu internete doğrudan açmayın. Verileri yenile düğmesi yalnız yerel sürümde bulunur. `--limit 0` erişilebilir kategori sayfalarını okur; kategori başına 100 sayfalık sınır ve erişim hataları kısmi kapsam olarak raporlanır.

## Önizleme yayını

`python build_preview.py` yalnız gerekli web dosyaları, içerik ve katalog anlık görüntüsünü `preview/` altına hazırlar. Kaynak önbellekleri, loglar, mobil proje ve .env dosyaları gönderilmez. Vercel CLI'nin oluşturduğu `preview/.env.local`, `.vercelignore` ile dışlanır.

```powershell
python publish_preview.py
```

Bu adres bir gösterim sürümüdür: arama motorlarına kapalıdır, salt okunurdur ve son yayımlanan katalog anlık görüntüsünü kullanır. Tarama yerel bilgisayarda yapılır. SoleRadar-CatalogPreview görevi altı saatte bir tarar ve kontrolleri geçen kataloğu otomatik yayımlar. Bilgisayar ve kullanıcı oturumu açık olmalıdır; bu bir bulut tarayıcısı değildir. Vercel fonksiyon yanıt sınırı nedeniyle büyük katalog JSON'u CDN üzerinden sunulur; ürün/blog sayfaları Python WSGI ile sunucuda üretilir.

## Veri doğruluğu

- Para tam sayı kuruş; yalnız doğrulanan stoklu varyantlar. Para birimi TRY kontrolü yapılır.
- Bedene göre filtreleme ve fiyat hesabı; ölçü sistemleri arasında tahmini dönüşüm yok.
- 24 saati geçen veya kaynağı başarısız teklifler aktif sonuçlardan çıkarılır. Kaynak ve kontrol tarihi görünür.
- Tam model/renk kodu eşleşmesi; belirsiz kodlarda mağaza bazında ayrı kayıt. Ad benzerliğiyle birleştirme yok.
- SPX/Converse ürün düzeyi stok bildirir; beden çıkarımı yapılmaz. SPX markası görünür marka alanından okunur.
- Kargo ve koşullu sepet kampanyaları kapsam dışıdır. Ürünün fiziksel orijinalliği doğrulanmaz.
- Katalog atomik değiştirilir, önceki sürüm ve tamamlanan kaynaklar korunur. İşletim sistemi tarama kilidini süreç kapanınca serbest bırakır; eski kilit biçimiyle başlatılmış taramanın bitmesi beklenir. Mağaza şablonları değişebilir; kısmi tarama arayüzde açıkça belirtilir.

## Tasarım ve içerik

Ana sayfa doğrudan ayak numarası, isteğe bağlı ikinci numara ve marka seçimiyle açılır. Beden seçilmeden ürün gösterilmez. İki beden seçilirse herhangi birinde stok olması yeterlidir; model fiyatı yalnız bu bedenlerdeki güncel teklifler arasındaki en düşük tutardır. Sonuçlar ucuzdan pahalıya sıralanır. Seçimler URL'de ve ürün detayında korunur. Örnek: `/?size=44.5&size2=45&brand=SALOMON`. Büyük ayakkabı görseli ve hareket betikleri ana sayfadan, 36 kare yeni yayın paketinden çıkarıldı.

`site_pages.py`: sunucuda üretilen ürün, model, blog, yöntem, hakkında ve gizlilik sayfaları. `content/articles.json`: üç rehber. Canonical, Article/Product şeması, sitemap, robots, sosyal paylaşım meta verileri ve llms.txt bulunur. Üretim için gerçek HTTPS `SITE_URL` ayarlanmadan indeksleme açılmaz. Çoklu güncel mağazası olmayan ürün sayfaları noindex kalır; uydurma yorum veya puan eklenmez.

Kaynak/lisans notları: `THIRD_PARTY.md`. Kullanımdan kaldırılan 9060 görsellerinin yerel kopyaları tutulur; yeni önizlemede yayımlanmaz. Mağaza ürün görsellerinin ticari kullanım koşulları gerçek yayın öncesi ayrıca değerlendirilmelidir.

## iOS öncelikli uygulama

Yerel çalışma alanındaki `mobile/` ayrı Expo Router projesidir; bu web kaynak dalına dahil değildir. Arama, marka/beden filtresi, ürün ayrıntısı, güncel teklifler ve mağazaya geçiş bulunur. iOS paketi üretildi; fiziksel iPhone ve TestFlight testi yapılmadı.

## Gerçek yayın öncesinde

`public_app.py` salt okunur WSGI girişidir; üretim sunucusunda `SITE_URL` zorunludur. `worker.py --once --publish`, kayıtlı Windows görevi tarafından çalıştırılır. Önizlemede otomatik uzak tarama veya kalıcı bulut veri deposu kurulu değildir. Alan adı, barındırma/zamanlama, mağaza kaynak koşulları, görsel kullanım hakkı, işletmeci/iletişim ve gizlilik metninin son bilgileri tamamlanmalıdır.

Son ölçümler ve sınırlar: `VERIFICATION.md`. Bir denetim skoru, arama sıralaması veya kusursuz çalışma garantisi değildir.

## Otomatik yenileme

Windows görevi: `SoleRadar-CatalogPreview`, 6 saat aralık, aynı anda tek çalışma, 4 saat üst süre. İlk çalışma 7 Kasım 2026 08:18 TSİ'de başlatıldı; tamamlandığı henüz doğrulanmadı. `data/worker-status.json` çalışma ve yayın sonucunu, `data/scheduled-refresh*.log` günlükleri gösterir. Sonraki çalışma `Get-ScheduledTaskInfo -TaskName SoleRadar-CatalogPreview` ile görülebilir. Bilgisayar kapalı veya oturum kapalıysa sürekli yenileme garanti edilmez.

Yayıncı, Vercel'in düz URL ve yapılandırılmış çıktı biçimlerini kabul eder; hedefi ayrıca `inspect --json` ile doğrular. Yayınlanan kataloğun SHA-256 özeti karşılaştırılır. Boş/başarısız katalog ve yayın hataları başarı diye kaydedilmez.
