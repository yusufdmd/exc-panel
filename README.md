# EXC Paneli

Üye, rütbe, güç & kamp seviyesi ve etkinlik (GVG/SVS/SS/Diğer) takibi için statik tek sayfalık panel. Veri katmanı Supabase (Postgres + Realtime) üzerinde çalışır; framework veya build adımı yoktur.

## Klasör yapısı

| Yol | Açıklama |
|---|---|
| `index.html` | Sadece HTML iskeleti — stil ve script'i dışarıdan yükler |
| `css/style.css` | Tüm görsel stiller |
| `js/config.js` | Supabase proje bilgileri ve uygulama sabitleri (rütbe sırası/kontenjanı, GVG eşikleri, kamp seviyeleri, diller, admin login domain'i) |
| `js/supabase.js` | Tekil, paylaşılan Supabase istemcisi |
| `js/database.js` | Tüm veritabanı erişim fonksiyonları (eski `window.storage`'ın yerini alır) |
| `js/ui.js` | Paylaşılan state, i18n sözlüğü, ortak biçimlendirme/hücre-renklendirme yardımcıları — diğer tüm modüllerin bağımlı olduğu temel |
| `js/auth.js` | Yönetici girişi/çıkışı (kullanıcı adı ↔ Supabase Auth email dönüşümü) |
| `js/members.js` | Üye state'i, tablo, ekle/düzenle/sil/geri-al, güç geçmişi + etkinlik özeti modalı |
| `js/gvg.js`, `js/svs.js`, `js/ss.js` | Etkinlik türü tablo render'ları (`svs.js` hem SVS hem Diğer sekmesini kapsar) |
| `js/events.js` | Dört etkinlik türü için ortak hafta/kayıt ekleme-silme mantığı |
| `js/dashboard.js` | Puan Sıralaması (leaderboard) |
| `js/backup.js` | Yedekle (JSON indir) / İçe Aktar |
| `js/app.js` | Giriş noktası — ilk yükleme, sekme/dil geçişleri, realtime abonelik, `window`'a bağlama |
| `api/read-screenshot.js` | Vercel serverless fonksiyonu — "AI ile Doldur" butonunun gönderdiği ekran görüntüsünü Gemini API'sine iletir, admin yetkisini sunucu tarafında doğrular |
| `sql/init.sql` | Supabase şeması — sadece kurulum için, **canlı siteye dahil edilmez** |
| `sql/auth_policies.sql` | Yazma işlemlerini admin oturumuyla sınırlayan RLS politikaları — sadece kurulum için |
| `backup/` | Eski `window.storage` sürümünün yedeği — **canlı siteye dahil edilmez** |

`sql/` ve `backup/` klasörleri `.vercelignore` ile deploy'un dışında tutulur (yerelde ve git'te kalırlar, sadece herkese açık URL olarak servis edilmezler).

Modüller arasındaki bağımlılık tek yönlüdür (döngüsel import yok): `config.js`/`supabase.js` → `database.js` → `ui.js` → diğer tüm modüller → `app.js`. Bir modülün başka bir modülün render fonksiyonunu bilmesi gerektiği durumlarda (ör. bir üye silindiğinde etkinlik tablolarının da yenilenmesi) doğrudan import yerine `ui.js`'teki kayıt mekanizması kullanılır (`registerRenderer`/`renderAll`, `registerDataLoader`/`reloadAllData`).

## 1) Supabase kurulumu (deploy'dan önce, bir kere)

1. [supabase.com](https://supabase.com) üzerinde bir proje oluştur.
2. Supabase Dashboard → **SQL Editor**'e git, [`sql/init.sql`](sql/init.sql) içeriğinin tamamını yapıştırıp çalıştır.
3. Dashboard → **Project Settings → API** sayfasından **Project URL** ve **anon public key** değerlerini al.
4. [`js/config.js`](js/config.js) içindeki şu satırları kendi değerlerinle değiştir:
   ```js
   export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
   export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_PUBLIC_KEY";
   ```

> **Güvenlik notu:** `anon` anahtar tarayıcıya gönderilmek üzere tasarlanmıştır — Supabase'in standart istemci modelinde bu anahtarın herkese açık olması normaldir, veri güvenliği `sql/init.sql` içindeki RLS (Row Level Security) politikalarıyla sağlanır. `config.js` bu yüzden bilerek `.gitignore`'a **eklenmemiştir**. Buna karşın bu projeye asla bir `service_role` anahtarı eklemeyin/commit'lemeyin — o anahtar RLS'i tamamen bypass eder ve gizli kalmalıdır.

## 1.1) Yönetici (admin) girişi kurulumu

Panel, verileri **sadece giriş yapan yöneticilerin görüp düzenleyebildiği** şekilde çalışır — üye/etkinlik/göç verileri herkese açık değildir (tek istisna: genel tanıtım sitesindeki [`index.html`](index.html) canlı üye SAYISI, isim/ID gibi ayrıntı içermeyen dar kapsamlı bir fonksiyon üzerinden herkese açık kalır). Bunu etkinleştirmek için iki adım gerekiyor — ikisi de bir kereliktir:

1. **Bir yönetici hesabı oluştur:** Supabase Dashboard → **Authentication → Users → Add User**. Panelde giriş ekranı sana sadece bir "kullanıcı adı" gösterir, ama Supabase Auth arka planda hâlâ bir email adresi bekler — bu yüzden **email alanına** `<kullaniciadi>@excpaneli.local` formatında bir değer gir (örn. yönetici adın "lider" ise `lider@excpaneli.local`; domain [`js/config.js`](js/config.js) içindeki `ADMIN_LOGIN_DOMAIN` ile eşleşmeli). Gerçek bir domain olması gerekmiyor, hiçbir doğrulama e-postası gönderilmiyor — bu yüzden **"Auto Confirm User"** kutusunu mutlaka işaretle. Panelde giriş yaparken sadece `lider` yazman yeterli. Kaç yöneticin olacaksa o kadar kullanıcı ekleyebilirsin — hepsi kendi kullanıcı adıyla giriş yapabilir.
2. **Okuma/yazma politikalarını sıkılaştır:** Supabase Dashboard → **SQL Editor**'e git, [`sql/auth_policies.sql`](sql/auth_policies.sql) içeriğinin tamamını yapıştırıp çalıştır. Bu, okuma (select) dahil tüm işlemleri sadece giriş yapmış kullanıcılarla sınırlar ve genel sitenin üye-sayısı fonksiyonunu oluşturur.

Bundan sonra `panel/` adresindeki giriş ekranına bu email/şifreyi girerek yönetici olarak oturum açabilirsin; giriş yapılmadan panelin içeriği (veriler dahil) hiç yüklenmez/görünmez — asıl güvenlik `auth_policies.sql`'deki veritabanı kuralında, arayüzün kapı olarak davranması sadece ek bir katmandır.

## 2) Yerel önizleme (opsiyonel)

Uygulama ES module `import`/`export` kullandığı için `index.html`'i çift tıklayıp `file://` olarak açmak **çalışmaz** (tarayıcılar modülleri file:// üzerinden yüklemeyi engeller). Yerelde test etmek istersen bir HTTP sunucusundan servis et:

```bash
npm run dev
```

Bu komut `npx serve` ile projeyi `http://localhost:3000` üzerinden servis eder. Deploy sonrası bu adıma ihtiyacın yok — Vercel her isteği zaten HTTP(S) üzerinden servis eder.

## 3) Vercel'e deploy

Proje tamamen statik olduğundan (framework yok, build adımı yok) Vercel'in "zero-config" statik site desteğiyle sorunsuz çalışır.

### Yöntem A — GitHub + Vercel Dashboard (önerilen)

1. Bu klasörü git deposuna çevir:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
2. GitHub'da boş bir repo oluştur, sonra bu depoyu bağla ve gönder:
   ```bash
   git remote add origin https://github.com/<kullanici-adin>/<repo-adi>.git
   git branch -M main
   git push -u origin main
   ```
3. [vercel.com](https://vercel.com) adresine git, GitHub hesabınla giriş yap.
4. **Add New… → Project**'i seç, az önce oluşturduğun repoyu **Import** et.
5. Framework Preset: **Other** (proje kökündeki `vercel.json` zaten `framework: null` belirtiyor, Vercel bunu statik site olarak tanıyacaktır). Build Command ve Output Directory alanlarını **boş bırak**.
6. **Deploy** butonuna bas — birkaç saniye içinde canlıya alınır ve sana `*.vercel.app` uzantılı bir URL verilir.

### Yöntem B — Vercel CLI

```bash
npm i -g vercel      # bir kerelik global kurulum
vercel login
vercel                # ilk deploy — sorulan sorularda varsayılanları kabul edebilirsin (build command yok, output directory "./")
vercel --prod         # sonraki her güncellemede canlıya almak için
```

## 4) "🤖 AI ile Doldur" için Gemini API anahtarı (ücretsiz)

Etkinlikler sekmesindeki toplu giriş modalında, bir oyun ekran görüntüsü yükleyip
üyelerin puan/katılım bilgisini otomatik doldurtabilirsin (bkz. `api/read-screenshot.js`).
Bu özellik Google Gemini'nin (ücretsiz kotalı) API'sini kullanır:

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) adresine git, Google hesabınla giriş yap ve **Create API key**'e bas (kredi kartı gerekmez).
2. Vercel Dashboard → proje → **Settings → Environment Variables**'a git.
3. `GEMINI_API_KEY` adında bir değişken ekle, değerine anahtarını yapıştır, **Production** (ve varsa **Preview**) ortamlarını işaretle.
4. Kaydettikten sonra projeyi yeniden deploy et (env değişikliği mevcut deploy'a otomatik yansımaz).

Ücretsiz kota günlük/dakikalık istek sınırlarıyla gelir (loncanın haftalık birkaç ekran
görüntüsü ihtiyacı için fazlasıyla yeterlidir) — kota dolarsa Google bunu ücretli bir
plana geçmeden otomatik ücretlendirmez, istek sadece geçici olarak reddedilir.

Bu adım atlanırsa panel normal çalışmaya devam eder, sadece "AI ile Doldur" butonu hata
toast'ı gösterir — manuel giriş her zaman mevcut yedek yöntemdir. Görsel hiçbir yerde
saklanmaz, sadece bu isteğin süresince işlenip atılır.

## 5) Deploy sonrası kontrol listesi

- [ ] `sql/init.sql` Supabase projesinde çalıştırıldı mı?
- [ ] `sql/auth_policies.sql` çalıştırıldı mı, en az bir yönetici kullanıcı oluşturuldu mu?
- [ ] `js/config.js` gerçek `SUPABASE_URL` / `SUPABASE_ANON_KEY` ile güncellendi mi?
- [ ] Canlı URL'de üye ekleme/düzenleme/silme çalışıyor mu?
- [ ] Aynı URL'i farklı bir tarayıcı/cihazdan açtığında aynı (paylaşımlı) veriler görünüyor mu?
- [ ] Tarayıcı konsolunda `[EXC Paneli]` ile başlayan bir uyarı **yok** (varsa `config.js` hâlâ placeholder değerde demektir)?
- [ ] (opsiyonel) `GEMINI_API_KEY` Vercel ortam değişkenlerine eklendi mi — "AI ile Doldur" butonu test edildi mi?

## Notlar

- `window.storage` tamamen kaldırıldı; tüm okuma/yazma `js/database.js` üzerinden Supabase'e gidiyor.
- Realtime abonelik (`subscribeToTables`) ile birlikte, bağlantı koparsa devreye giren yedek bir "yoklama" (polling) mekanizması da çalışır — aralığı `js/config.js` içindeki `POLL_INTERVAL_MS` ile kontrol edilir.
- Arayüzde (HTML/CSS) veya mevcut özelliklerde herhangi bir değişiklik yapılmamıştır; değişen tek şey verinin nereden okunup yazıldığıdır.
