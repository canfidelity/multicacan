# Kurulum Rehberi

Bu repo, [multica-ai/multica](https://github.com/multica-ai/multica) upstream'inin fork'udur.
Web Preview, iOS Simulator entegrasyonu ve Pair Programming gibi ek özellikler içerir.

## Mimari

| Bileşen | Açıklama | Teknoloji |
|---------|----------|-----------|
| **Backend** | REST API + WebSocket server | Go (tek binary) |
| **Frontend** | Web uygulaması | Next.js |
| **Database** | Ana veri deposu | PostgreSQL 17 + pgvector |
| **Daemon** | Lokal agent yöneticisi | Go binary (`multicacan` CLI) |

Backend + Frontend + Database **VPS'te Docker** içinde çalışır.
Daemon **her geliştiricinin kendi makinesinde** (macOS/Linux) çalışır.

---

## 1. Server Kurulumu (VPS)

**Gereksinimler:** Docker, Docker Compose, Git

```bash
git clone https://github.com/canfidelity/multicacan.git
cd multicacan
cp .env.example .env
```

`.env` dosyasını düzenle — minimum değişiklikler:

```bash
JWT_SECRET=$(openssl rand -hex 32)
RESEND_API_KEY=re_xxxxx          # Email gönderimi için (opsiyonel)
FRONTEND_ORIGIN=https://app.siteadresi.com
MULTICA_APP_URL=https://app.siteadresi.com
```

GHCR'daki hazır image'ları çekip başlat:

```bash
make selfhost
```

- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:8080

### Güncelleme

```bash
git pull origin main
make selfhost
```

### Durdur

```bash
make selfhost-stop
```

---

## 2. Giriş

Tarayıcıdan `http://localhost:3000` aç.

- **Email varsa:** `.env`'de `RESEND_API_KEY` set edilmişse gerçek kod maile gelir.
- **Email yoksa:** Backend container loglarından kodu al:
  ```bash
  docker compose -f docker-compose.selfhost.yml logs backend | grep "Verification code"
  ```
- **Geliştirme ortamı için:** `.env`'e ekle:
  ```
  APP_ENV=development
  MULTICA_DEV_VERIFICATION_CODE=888888
  ```

---

## 3. Daemon Kurulumu (Geliştirici Makinesi)

Daemon lokal makinede çalışır, VPS'teki sunucuya bağlanır ve agent task'larını çalıştırır.

### a) Daemon CLI'ı kur

```bash
# macOS (Apple Silicon)
curl -L https://github.com/canfidelity/multicacan/releases/download/latest/multicacan-darwin-arm64 -o /usr/local/bin/multicacan
chmod +x /usr/local/bin/multicacan
codesign -s - /usr/local/bin/multicacan

# macOS (Intel)
curl -L https://github.com/canfidelity/multicacan/releases/download/latest/multicacan-darwin-amd64 -o /usr/local/bin/multicacan
chmod +x /usr/local/bin/multicacan
codesign -s - /usr/local/bin/multicacan

# Linux (amd64)
curl -L https://github.com/canfidelity/multicacan/releases/download/latest/multicacan-linux-amd64 -o /usr/local/bin/multicacan
chmod +x /usr/local/bin/multicacan
```

### b) Agent CLI kur

```bash
npm install -g @anthropic-ai/claude-code
```

### c) Daemon'u yapılandır ve başlat

```bash
multicacan config set server_url https://api.siteadresi.com
multicacan config set app_url https://app.siteadresi.com
multicacan login
multicacan daemon start
```

Lokal kurulum için (server ve daemon aynı makinede):

```bash
multicacan setup self-host
```

### d) Durumu kontrol et

```bash
multicacan daemon status
```

---

## 4. İlk Kullanım

1. Tarayıcıdan workspace aç
2. **Settings → Runtimes** — makinenin listelendiğini doğrula
3. **Settings → Agents** — yeni agent oluştur, runtime olarak makineyi seç
4. Issue oluştur, agent'a assign et → agent çalışmaya başlar

---

## Ek Özellikler

### Web Preview

Agent'lar local port'larda çalıştırdığı uygulamaları daemon otomatik tespit eder. Sidebar'dan **Web Preview** ile tarayıcıda görüntülenir.

### iOS Simulator

```bash
bunx serve-sim --detach
```

Sidebar'dan **Simulator** ile erişilir.

---

## Sorun Giderme

**Backend başlamıyor:**
```bash
docker compose -f docker-compose.selfhost.yml logs backend
```

**Daemon bağlanamıyor:**
```bash
multicacan daemon stop
multicacan daemon start --debug
```

**macOS'ta binary çalışmıyor (exit 137):**
```bash
codesign -s - /usr/local/bin/multicacan
```
