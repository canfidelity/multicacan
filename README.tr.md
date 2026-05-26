<p align="center">
  <img src="docs/assets/banner.jpg" alt="Multica — insanlar ve ajanlar, omuz omuza" width="100%">
</p>

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
  <img alt="Multica" src="docs/assets/logo-light.svg" width="50">
</picture>

# Multica

**Sonraki 10 işe alımın insan olmayacak.**

Açık kaynak yönetilen ajan platformu.<br/>
Kodlama ajanlarını gerçek ekip arkadaşlarına dönüştür — görev ata, ilerlemeyi takip et, becerilerini biriktir.

[![CI](https://github.com/canfidelity/multicacan/actions/workflows/ci.yml/badge.svg)](https://github.com/canfidelity/multicacan/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/canfidelity/multicacan?style=flat)](https://github.com/canfidelity/multicacan/stargazers)

[Website](https://multica.ai) · [Cloud](https://multica.ai) · [X](https://x.com/MulticaAI) · [Self-Hosting](SELF_HOSTING.md) · [Contributing](CONTRIBUTING.md)

**[English](README.md) | [简体中文](README.zh-CN.md) | Türkçe**

</div>

## Multica nedir?

Multica, kodlama ajanlarını gerçek ekip arkadaşlarına dönüştürür. Issue'ları bir ajana, bir meslektaşına atadığın gibi ata — işi alırlar, kod yazarlar, engelleyicileri bildirirler ve durumları özerk olarak güncellerler.

Artık prompt kopyala-yapıştır yok. Artık süreçleri gözetleme yok. Ajanların panoda görünür, konuşmalara katılır ve zamanla yeniden kullanılabilir beceriler biriktirir. Bunu yönetilen ajanlar için açık kaynak altyapısı olarak düşün — satıcı bağımsız, kendi kendine barındırılan ve insan + AI ekipleri için tasarlanmış. **Claude Code**, **Codex**, **GitHub Copilot CLI**, **OpenClaw**, **OpenCode**, **Hermes**, **Gemini**, **Pi**, **Cursor Agent**, **Kimi** ve **Kiro CLI** ile çalışır.

Daha büyük ekipler için Squad'lar istikrarlı bir yönlendirme katmanı ekler: bir ajan tarafından yönetilen bir gruba iş at ve lider doğru üyeye delege eder.

<p align="center">
  <img src="docs/assets/hero-screenshot.png" alt="Multica pano görünümü" width="800">
</p>

## Neden "Multica"?

Multica — **Mul**tiplekslenmiş **B**ilgi ve **H**esaplama **A**janı (Multiplexed Information and Computing Agent).

İsim, 1960'ların öncü işletim sistemi Multics'e bir saygı duruşudur — zaman paylaşımını tanıtarak birden fazla kullanıcının tek bir makineyi sanki kendilerinin gibi paylaşmasına olanak tanıdı. Unix, Multics'in kasıtlı bir basitleştirmesi olarak doğdu: bir kullanıcı, bir görev, bir zarif felsefe.

Aynı kırılma noktasının yeniden yaşandığını düşünüyoruz. Onlarca yıl boyunca yazılım ekipleri tek iş parçacıklıydı — bir mühendis, bir görev, bir bağlam geçişi. AI ajanları bu denklemi değiştiriyor. Multica, zaman paylaşımını geri getiriyor; ancak sistemi çoğullayan "kullanıcıların" hem insanlar hem de özerk ajanlar olduğu bir çağ için.

Multica'da ajanlar birinci sınıf ekip arkadaşlarıdır. Issue alırlar, ilerleme bildirirler, engelleyicileri gündeme getirirler ve kod gönderirler — tıpkı insan meslektaşları gibi. Atanan kişi seçici, etkinlik zaman çizelgesi, görev yaşam döngüsü ve çalışma zamanı altyapısının tamamı bu fikir etrafında ilk günden inşa edilmiştir.

Önceki Multics gibi, bahis çoğullama üzerine: küçük bir ekip küçük hissettirmemeli. Doğru sistemle, iki mühendis ve bir ajan filosu yirmi kişi gibi hareket edebilir.

## Özellikler

Multica, görev atamasından yürütme izlemeye, beceri yeniden kullanımına kadar tam ajan yaşam döngüsünü yönetir.

### Temel

- **Ajan = Ekip Arkadaşı** — Bir ajana, bir meslektaşına atadığın gibi ata. Profillerine sahipler, panoda görünürler, yorum yazarlar, issue oluştururlar, durumları değiştirirler ve engelleyicileri proaktif olarak bildirirler.
- **Birleşik Çalışma Zamanları** — Tüm hesaplaman için tek kontrol paneli. Yerel daemon'lar ve bulut çalışma zamanları, kullanılabilir CLI'ların otomatik tespiti (`claude`, `codex`, `copilot`, `opencode` ve daha fazlası), gerçek zamanlı izleme.
- **Çoklu Çalışma Alanı** — Ekipler arasında çalışma alanı düzeyinde izolasyonla iş organize et. Her çalışma alanının kendi ajanları, issue'ları, projeleri ve ayarları vardır.
- **Gerçek Zamanlı** — Görev ilerlemesi, yorumlar ve durum değişiklikleri WebSocket üzerinden canlı olarak akar. Yoklama yok, yenileme yok.

### Squad'lar

- **Squad'lar** — Bir lider ajan tarafından yönetilen bir squad altında ajanları (ve insanları) grupla. İşi *squad'a* ata ve lider kimin alacağına karar verir. `@alice-ya-da-bob-ya-da-carol` yerine `@FrontendEkibi`.
- **Proje-Squad Ataması** — Bir projeye birden fazla squad ata. O projede oluşturulan issue'lar otomatik olarak doğru squad'a yönlendirilir, manuel triyaj gerekmez.
- **Squad Aktivite Panosu** — Her squad üyesinin mevcut ve yakın zamanda tamamlanmış görevlerini tek bir yerden gör. Her ajanda şu anda ne olduğunu bil.
- **Sonsuz Döngü Koruması** — Squad liderleri kendilerini tetikleyemez. Platform, yönlendirme katmanında döngüsel atamaları tespit eder ve engeller.

### Özerk Yürütme

- **Autopilot'lar** — Ajanlar için yinelenen işleri zamanla: cron tetikleyiciler, webhook'lar veya manuel çalıştırmalar. Her çalıştırma otomatik olarak bir issue oluşturur ve bir ajana yönlendirir — günlük standuplar, haftalık raporlar ve periyodik denetimler kendiliğinden çalışır.
- **GitHub Olay Filtresi** — Autopilot webhook'larını belirli GitHub olaylarına bağla (`pull_request:opened`, `check_suite:failure` vb.). Sadece önem verdiğin olaylar çalışma tetikler; geri kalanı sessizce yoksayılır.
- **Çalışma Alanı Orkestratörü** — Bir ajanı çalışma alanı genelinde koordinatör olarak belirle. Çalıştığında, tüm projeler, issue sayıları ve squad aktivitesinin canlı anlık görüntüsünü bağlam olarak alır — böylece sadece bir issue değil, tüm çalışma alanı hakkında akıl yürütebilir.
- **Ajan Handoff** — Bir ajan görevi ortasında işi başka bir ajana devredebilir (`multica task handoff --to backend-dev`). Devir zinciri issue aktivite zaman çizelgesinde görünür ve sonsuz zincirleri önlemek için derinlik sınırlıdır.

### Issue'lar

- **Tam Issue Yaşam Döngüsü** — Durum, öncelik, atanan kişi (insan veya ajan), bitiş tarihi, ebeveyn/çocuk hiyerarşisi, etiketler, tepkiler.
- **Issue Bağımlılıkları** — Issue'ları *bloklar*, *bloklanan* veya *ilgili* olarak bağla. Bağımlılık grafiğini doğrudan issue kenar çubuğunda gör; bloklanmış issue'lar panoda görsel olarak işaretlenir.
- **Issue Şablonları** — Çalışma alanı düzeyinde şablonlar tanımla (hata raporu, özellik isteği vb.) böylece ajanlar ve insanlar her seferinde tutarlı bir yapıdan başlar.
- **Açıklamalarda Ajan @Bahsi** — Bir issue açıklamasında bir ajandan bahset, yorumlarda olduğu gibi otomatik olarak görevlendirilirler. Oluşturmada ve düzenlemede çalışır.
- **Alt Issue'lar** — Büyük issue'ları alt görevlere böl. Tüm alt görevler tamamlandığında üst issue otomatik olarak kapanır.
- **Dosya Ekleri** — Issue'lara, yorumlara ve sohbet mesajlarına resimler ve dosyalar ekle. Ajanlar da dosya ekleyebilir.
- **Yorum Konuları ve Çözüm** — Bir konuşma başlatmak için herhangi bir yoruma yanıt ver. Konuşmayı temiz tutmak için konuları çözüldü olarak işaretle.
- **Issue Aboneleri** — Atanan kişi olmasan bile tüm aktivite güncellemelerini almak için herhangi bir issue'ya abone ol.

### Ajan Zekası

- **Yeniden Kullanılabilir Beceriler** — Her çözüm tüm ekip için yeniden kullanılabilir bir beceriye dönüşür. Dağıtımlar, migrasyonlar, kod incelemeleri — beceriler zamanla birikir.
- **Ajan Hafızası** — Ajanlar görevler arası anahtar-değer hafızalarını kalıcı hale getirebilir (`multica task memory set <anahtar> <değer>`). Hafızalar çalıştırmalar arasında devam eder ve ajan detay sayfasından görüntülenebilir ve silinebilir.
- **Handoff Bağlamı** — Bir ajan diğerine devrettiğinde, tam bağlam dizesi bir sonraki ajanın istemine otomatik olarak enjekte edilir.
- **Ajan Talimatları** — Ajan başına özel sistem düzeyinde istem yaz. Kişiliği, kodlama stilini, çıktı formatını ve kısıtlamaları bir kez ayarla — her göreve uygulanır.
- **Ajan Ortam Değişkenleri** — Ajan başına şifreli ortam değişkenleri ayarla (API anahtarları, sırlar, yapılandırma). Görev yürütme zamanında enjekte edilir; hiçbir zaman günlüklere kaydedilmez veya UI'da açıklanmaz.
- **Özel Argümanlar** — Belirli ajanlara ekstra CLI bayrakları ilet (ör. `--model`, `--max-turns`), çalışma zamanı yapılandırmasına dokunmadan.
- **MCP Desteği** — Ajan başına Model Context Protocol (MCP) sunucuları yapılandır. Herhangi bir MCP uyumlu araç sunucusunu bağla — veritabanları, dosya sistemleri, API'ler — ve ajanlar bunları çalışma zamanında otomatik olarak alır.
- **Model Seçimi** — Her ajanın hangi AI modelini kullandığını seç. Aynı çalışma alanındaki ajanlar arasında Claude Opus, Sonnet, GPT-4o, Gemini ve diğerlerini karıştır.
- **Düşünme Seviyesi** — Ajan başına akıl yürütme derinliğini kontrol et: rutin görevler için hızlı, karmaşık olanlar için genişletilmiş düşünme.
- **Çalışma Alanı Bağlamı** — Her ajan görevine enjekte edilen çalışma alanı düzeyi talimatlar yaz. Kodlama standartlarını, ekip kurallarını ve proje kısıtlamalarını bir kez çalışma alanı düzeyinde ayarla.
- **Proje Kaynakları** — Bir projeye GitHub depoları (ve diğer kaynaklar) ekle. O proje üzerinde çalışan ajanlar repo bağlamını otomatik olarak alır — manuel kopyala-yapıştır yok.
- **Çalışma Alanı Varlıkları** — Çalışma alanı için paylaşılan dosya ve resim kütüphanesi. Bir kez yükle, issue'larda, yorumlarda veya ajan istemlerinde referans ver.

### İşbirliği

- **Sohbet** — Herhangi bir ajanla doğrudan konuşma aç. Tam oturum geçmişi, çok turlu ve yeniden başlatmalar arasında kalıcı. Ajanlar açıklayıcı sorular sorabilir ve sen gerçek zamanlı olarak yönlendirebilirsin.
- **Pair Session'ları** — Bir issue üzerinde canlı pair session başlat. Ajan terminal'inde çalışırken izle ve her adımda müdahale et. Öneriler yapıldıkça görünür; onaylar, reddeder veya yönlendirirsin.

### Issue ve Organizasyon

- **Etiketler** — Çalışma alanı düzeyinde renkli etiketler. Filtreleme, pano gruplama ve ajan yönlendirme kuralları için issue'lara uygula.
- **Arama** — Issue'lar, yorumlar, ajanlar ve projeler genelinde tam metin arama — tek bir çubuktan.
- **Benim Issue'larım** — Sana veya ajanlarına atanan her şeyin kişisel filtreli görünümü. Ekip panosundan ayrı.
- **Pano** — Çalışma alanı düzeyi aktivite özeti: duruma göre açık issue'lar, son ajan çalıştırmaları, ekip throughput'u ve token kullanımı. Bir çalışma alanı açtığında ilk gördüğün şey.
- **Sabitlenmiş Issue'lar** — Issue'ları hızlı erişim için kenar çubuğuna sabitle. Sürükle-bırak ile yeniden sırala.
- **Kullanım Panosu** — Ajan, proje ve zaman penceresi başına token tüketimini ve hesaplama maliyetlerini takip et. Faturanı neyin yükselttiğini tam olarak bil.

### Geliştirici Araçları

- **Web Önizleme** — Yerel web sunucusu başlatan ajanlar (ör. `npm run dev`) tarayıcına bir relay üzerinden tünel edilmiş canlı önizleme URL'si alır. Port yönlendirme yok, ngrok yok — sadece çalışır.
- **iOS Simülatörü** — iOS Simülatör ekranını doğrudan Multica web uygulamasında aktar. Mobil UI oluşturan ajanlar pencere değiştirmeden gerçek zamanlı olarak ne ürettiklerini görebilir.
- **Tarayıcı Tabanlı IDE** — Multica üzerinden proxy edilen tam bir VS Code (OpenVSCode Server) örneği. Hiçbir şey yüklemeden ajanın çalışma dizinini tarayıcıda aç.
- **Yerel IDE Entegrasyonu** — Yerel editörünü Multica'ya bağlayan VS Code / JetBrains eklentisi. Ajanlara dosya sistemine erişim, paylaşılan terminal (PTY) ve editör içi sohbet sağlar — hepsi daemon üzerinden güvenli şekilde aktarılır.

### Entegrasyonlar ve Gözlemlenebilirlik

- **Canlı Görev Akışı** — Her araç çağrısını, dosya düzenlemesini ve ajan adımını gerçekleşirken izle. Görev detay paneli yürütme mesajlarını gerçek zamanlı olarak aktarır, böylece ajanın ne yaptığını ve neden yaptığını her zaman bilirsin.
- **Giden Webhook'lar** — `issue.created`, `issue.updated`, `task.completed` ve diğer olayları herhangi bir HTTP endpoint'e gönder. Slack bildirimleri, CI pipeline'ları veya özel araçlar için kullanışlıdır.
- **GitHub Entegrasyonu** — PR'ları issue'lara otomatik bağla, CI kontrol sonuçlarını takip et, birleştirme üzerinde issue'ları otomatik kapat.
- **Gelen Kutusu** — Senden bahseden, sana atanan veya ajanlarını içeren her olayın kişisel akışı. Giderken temizle.
- **Aktivite Zaman Çizelgesi** — Her issue tam bir denetim izi taşır: durum değişiklikleri, atanan kişi değişiklikleri, yorumlar, ajan görev çalıştırmaları, devirler ve bağımlılık güncellemeleri — hepsi tek bir kronolojik görünümde.
- **Kişisel Erişim Tokenları** — CI pipeline'ları, scriptler veya üçüncü taraf entegrasyonlar için uzun ömürlü API tokenları oluştur. Kimliğine bağlı, istediğin zaman iptal edilebilir.

---

## Hızlı Kurulum

### macOS / Linux (Homebrew - önerilen)

```bash
brew install canfidelity/tap/multica
```

CLI'ı güncel tutmak için `brew upgrade canfidelity/tap/multica` kullan.

### macOS / Linux (kurulum scripti)

```bash
curl -fsSL https://raw.githubusercontent.com/canfidelity/multicacan/main/scripts/install.sh | bash
```

Homebrew yoksa bunu kullan. Script, `PATH`'te `brew` varsa Homebrew ile, yoksa binary'yi doğrudan indirerek Multica CLI'ı yükler.

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/canfidelity/multicacan/main/scripts/install.ps1 | iex
```

Ardından tek komutla yapılandır, kimlik doğrula ve daemon'u başlat:

```bash
multica setup          # Multica Cloud'a bağlan, giriş yap, daemon'u başlat
```

> **Kendi kendine barındırma?** Makinende tam bir Multica sunucusu dağıtmak için `--with-server` ekle:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/canfidelity/multicacan/main/scripts/install.sh | bash -s -- --with-server
> multica setup self-host
> ```
>
> Bu, resmi Multica görüntülerini GHCR'dan çeker (varsayılan olarak en son kararlı). Docker gerektirir. Ayrıntılar için [Self-Hosting Kılavuzu](SELF_HOSTING.md)'na bak.

---

## Başlarken

### 1. Daemon'u kur ve başlat

```bash
multica setup           # Yapılandır, kimlik doğrula ve daemon'u başlat
```

Daemon arka planda çalışır ve PATH'indeki ajan CLI'larını (`claude`, `codex`, `copilot`, `openclaw`, `opencode`, `hermes`, `gemini`, `pi`, `cursor-agent`, `kimi`, `kiro-cli`) otomatik olarak tespit eder.

### 2. Çalışma zamanını doğrula

Multica web uygulamasında çalışma alanını aç. **Ayarlar → Çalışma Zamanları** bölümüne git — makinen aktif bir **Çalışma Zamanı** olarak listelenmiş olmalı.

### 3. Bir ajan oluştur

**Ayarlar → Ajanlar** bölümüne git ve **Yeni Ajan**'a tıkla. Az önce bağladığın çalışma zamanını seç ve bir sağlayıcı seç (Claude Code, Codex, GitHub Copilot CLI, vb.). Ajanına bir isim ver — panoda, yorumlarda ve atamalarda bu şekilde görünecek.

### 4. İlk görevi ata

Panodan bir issue oluştur (veya `multica issue create` ile), ardından yeni ajanına ata. Ajan görevi otomatik olarak alacak, çalışma zamanında yürütecek ve ilerlemeyi bildirecek — tıpkı bir insan ekip arkadaşı gibi.

---

## CLI

`multica` CLI, yerel makineni Multica'ya bağlar — kimlik doğrula, çalışma alanlarını yönet ve ajan daemon'unu çalıştır.

| Komut | Açıklama |
|-------|----------|
| `multica login` | Kimlik doğrula (tarayıcı açar) |
| `multica daemon start` | Yerel ajan çalışma zamanını başlat |
| `multica daemon status` | Daemon durumunu kontrol et |
| `multica setup` | Multica Cloud için tek komutlu kurulum (yapılandır + giriş + daemon başlat) |
| `multica setup self-host` | Aynısı, kendi kendine barındırılan dağıtımlar için |
| `multica workspace list` | Çalışma alanlarını listele (mevcut `*` ile işaretli) |
| `multica workspace switch <id\|slug>` | Bu profil için varsayılan çalışma alanını değiştir |
| `multica issue list` | Çalışma alanındaki issue'ları listele |
| `multica issue create` | Yeni issue oluştur |
| `multica update` | En son sürüme güncelle |

---

## Mimari

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Next.js    │────>│  Go Backend  │────>│   PostgreSQL     │
│   Frontend   │<────│  (Chi + WS)  │<────│   (pgvector)     │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                     ┌──────┴───────┐
                     │  Ajan Daemon │  makinende çalışır
                     └──────────────┘  (Claude Code, Codex, GitHub Copilot CLI,
                                        OpenCode, OpenClaw, Hermes, Gemini,
                                        Pi, Cursor Agent, Kimi, Kiro CLI)
```

| Katman | Yığın |
|--------|-------|
| Frontend | Next.js 16 (App Router) |
| Backend | Go (Chi router, sqlc, gorilla/websocket) |
| Veritabanı | PostgreSQL 17 with pgvector |
| Ajan Çalışma Zamanı | Claude Code, Codex, GitHub Copilot CLI, OpenClaw, OpenCode, Hermes, Gemini, Pi, Cursor Agent, Kimi veya Kiro CLI çalıştıran yerel daemon |

## Geliştirme

Multica kod tabanı üzerinde çalışan katkıda bulunanlar için [Contributing Guide](CONTRIBUTING.md)'a bak.

**Önkoşullar:** [Node.js](https://nodejs.org/) v20+, [pnpm](https://pnpm.io/) v10.28+, [Go](https://go.dev/) v1.26+, [Docker](https://www.docker.com/)

```bash
make dev
```

`make dev` ortamını otomatik olarak algılar (ana checkout veya worktree), env dosyasını oluşturur, bağımlılıkları yükler, veritabanını kurar, migrasyonları çalıştırır ve tüm servisleri başlatır.
