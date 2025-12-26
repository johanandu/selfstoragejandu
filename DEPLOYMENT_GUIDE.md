# 🚀 Deployment Guide - Self Storage MVP

## Opcje Deploymentu

### Opcja 1: Vercel (ZALECANA) ⭐

Najprostsza i najszybsza opcja z automatycznym deploymentem.

#### Kroki:

1. **Import projektu**
   - Zaloguj się na [Vercel](https://vercel.com)
   - Kliknij "New Project"
   - Zaimportuj z GitHub/GitLab

2. **Konfiguracja**
   - Framework: Astro
   - Build Command: `npm run build`
   - Output Directory: `dist`

3. **Ustaw zmienne środowiskowe**
   ```
   SUPABASE_URL=
   SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   STRIPE_PRICE_ID=
   FAKTUROWNIA_API_KEY=
   FAKTUROWNIA_ACCOUNT_NAME=
   GATE_API_URL=
   GATE_API_TOKEN=
   PUBLIC_APP_URL=
   ```

4. **Deploy!**
   - Vercel automatycznie deployuje przy każdym push
   - Dostaniesz URL: `https://your-app.vercel.app`

5. **Skonfiguruj Stripe Webhook**
   - Zaloguj się do Stripe Dashboard
   - Dodaj nowy webhook:
     - URL: `https://your-app.vercel.app/api/webhooks/stripe`
     - Events: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`
   - Zapisz `whsec_...` jako `STRIPE_WEBHOOK_SECRET`

---

### Opcja 2: Docker

#### Dockerfile:
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/server/entry.mjs"]
```

#### Docker Compose:
```yaml
version: '3.8'
services:
  self-storage:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    restart: unless-stopped
```

#### Build i run:
```bash
docker-compose up --build
```

---

### Opcja 3: VPS (Node.js + PM2)

#### 1. Przygotuj serwer
```bash
# Zainstaluj Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Zainstaluj PM2
npm install -g pm2
```

#### 2. Sklonuj i zbuduj projekt
```bash
git clone <your-repo>
cd self-storage-astro
npm install
npm run build
```

#### 3. Skonfiguruj PM2
```bash
# Stwórz ecosystem.config.js
pm2 init
```

#### ecosystem.config.js:
```javascript
module.exports = {
  apps: [{
    name: 'self-storage',
    script: 'dist/server/entry.mjs',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

#### 4. Uruchom aplikację
```bash
# Uruchom
pm2 start ecosystem.config.js

# Zapisz proces (autostart)
pm2 save

# Setup startup script
pm2 startup
```

#### 5. Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🔧 Konfiguracja Integracji

### 1. Supabase Setup

#### Utwórz projekt Supabase:
1. Zaloguj się na [supabase.com](https://supabase.com)
2. Stwórz nowy projekt
3. Pobierz:
   - Project URL → `SUPABASE_URL`
   - Anon Key → `SUPABASE_ANON_KEY`
   - Service Role Key → `SUPABASE_SERVICE_ROLE_KEY`

#### Załaduj schema:
```bash
# W Supabase Dashboard → SQL Editor
# Skopiuj zawartość pliku supabase_schema.sql
```

#### Włącz RLS:
Upewnij się, że Row Level Security jest włączony dla tabel (ustawiony w schema.sql)

### 2. Stripe Setup

#### Utwórz produkt i cenę:
1. Zaloguj się do Stripe Dashboard
2. Products → Add product
3. Ustaw:
   - Name: "Wynajem Kontenera"
   - Price: 200.00 PLN
   - Recurring: Monthly
4. Zapisz Price ID jako `STRIPE_PRICE_ID`

#### Webhook setup (po deployment):
1. Developers → Webhooks
2. Add endpoint
3. URL: `https://your-app.com/api/webhooks/stripe`
4. Events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`

### 3. Fakturownia Setup

1. Zaloguj się na [fakturownia.pl](https://fakturownia.pl)
2. Ustawienia → Ustawienia konta → API
3. Skopiuj API Token → `FAKTUROWNIA_API_KEY`
4. Skopiuj nazwę konta → `FAKTUROWNIA_ACCOUNT_NAME`

### 4. Gate Controller Setup

#### Grenton:
```javascript
// Przykładowy endpoint w Grenton
function onHTTPRequest(request) {
  if (request.path == "/api/trigger" && request.method == "POST") {
    var token = request.headers["Authorization"];
    if (token == "Bearer YOUR_SECRET_TOKEN") {
      // Otwórz bramę
      GateModule.Open();
      request.respond(200, "OK");
    } else {
      request.respond(401, "Unauthorized");
    }
  }
}
```

#### BleBox:
```bash
# Przykładowe wywołanie API
curl -X POST "http://blebox-ip/api/gate/open" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🧪 Testowanie

### 1. Lokalne testy
```bash
npm run dev
# Otwórz http://localhost:4321
```

### 2. Stripe CLI (dla webhooków)
```bash
# Zainstaluj Stripe CLI
stripe login

# Nasłuchuj webhooków lokalnie
stripe listen --forward-to localhost:4321/api/webhooks/stripe

# Przetestuj event
stripe trigger checkout.session.completed
```

### 3. Test płatności
Użyj testowej karty:
- Numer: `4242 4242 4242 4242`
- Data: 12/25
- CVV: 123
- Imię: Test User

### 4. Test otwierania bramy
- Zaloguj się do panelu klienta
- Kliknij "OTWÓRZ BRAMĘ"
- Sprawdź logi w Supabase (tabela access_logs)

---

## 📊 Monitoring

### 1. Vercel Analytics
- Automatycznie dostępne w Vercel Dashboard
- Metryki wydajności, uptime

### 2. Supabase Analytics
- Zapytania SQL, wydajność bazy
- Logi autoryzacji

### 3. Stripe Dashboard
- Przychody, subskrypcje, płatności
- Metryki konwersji

---

## 🚨 Troubleshooting

### Problem: Webhook nie działa
**Rozwiązanie:**
1. Sprawdź, czy URL jest publicznie dostępny (`https://...`)
2. Sprawdź `STRIPE_WEBHOOK_SECRET` w .env
3. Zobacz logi w Vercel/Stripe Dashboard

### Problem: Brama się nie otwiera
**Rozwiązanie:**
1. Sprawdź logi w Supabase (access_logs)
2. Sprawdź status subskrypcji
3. Przetestuj kod PIN ręcznie
4. Sprawdź połączenie z gate controller

### Problem: Cold start zbyt wolny
**Rozwiązanie:**
1. Użyj Vercel (edge functions)
2. Minimalizuj kod w endpointach API
3. Cache gdzie możliwe

---

## 📞 Wsparcie

W razie problemów:
1. Sprawdź logi aplikacji
2. Upewnij się, że wszystkie env variables są ustawione
3. Przejrzyj kod w `/api/webhooks/stripe.ts` - to serce systemu

---

**Powodzenia! 🚀**

Po udanym deployment, Twój system Self Storage będzie działał 24/7 bez Twojej ingerencji. Klienci będą mogli wynająć kontener o 3:00 w nocy, a Ty będziesz otrzymywał pieniądze automatycznie.