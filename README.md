# Automatyczny System Self Storage - MVP 1.0

W pełni zautomatyzowana platforma do wynajmu powierzchni magazynowych (kontenerów morskich/boxów) działająca w modelu 24/7 bez obsługi fizycznej.

## 🎯 Wizja

Budujemy **"Netflixa dla Garaży"** - system typu "Utility" który jest:
- **Prosty** - utylitarne UI bez zbędnych ozdobników
- **Szybki** - działa natychmiast na słabym LTE
- **Niezawodny** - klient stoi przed bramą w deszczu i musi mieć pewność dostępu

## 🚀 Tech Stack

### Frontend
- **Astro 4.x** - SSR dla SEO i ultra-szybkiej wydajności
- **React** - tylko dla interaktywnych elementów (via Astro Islands)
- **Tailwind CSS** - utility-first styling

### Backend
- **Supabase** - PostgreSQL + Auth + Row Level Security
- **Stripe** - płatności i subskrypcje
- **Fakturownia** - automatyczne faktury VAT

### Infrastruktura
- **Vercel** - deployment z edge functions
- **Sterownik bramy** - Grenton / BleBox / MQTT

## 📁 Struktura Projektu

```
/src
├── components/islands/    # Komponenty React (hydratacja tylko tam gdzie potrzebna)
│   ├── PaymentButton.jsx  # Przycisk płatności Stripe
│   └── GateControl.jsx    # Przycisk otwierania bramy
├── layouts/               # Layouty Astro
│   └── AppLayout.astro    # Główny layout aplikacji
├── lib/                   # Klienci API
│   ├── supabase.js        # Klient Supabase (auth + DB)
│   ├── stripe.js          # Klient Stripe
│   └── fakturownia.js     # Klient Fakturownia
└── pages/                 # Routing Astro
    ├── index.astro        # Landing Page (super szybki)
    ├── dashboard/         # Panel klienta (SSR + auth)
    │   └── index.astro
    └── api/               # Endpointy API
        ├── create-checkout.ts    # Tworzenie sesji Stripe
        ├── gate/open.ts          # Logika otwierania bramy
        └── webhooks/stripe.ts    # Webhook płatności (MÓZG SYSTEMU)
```

## 🔧 Instalacja i Konfiguracja

### 1. Klonowanie i instalacja
```bash
git clone <repository-url>
cd self-storage-astro
npm install
```

### 2. Konfiguracja zmiennych środowiskowych
Skopiuj `.env.example` do `.env.local` i uzupełnij:

```env
# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# Fakturownia
FAKTUROWNIA_API_KEY=your_api_key
FAKTUROWNIA_ACCOUNT_NAME=your_account

# Gate Controller
GATE_API_URL=https://your-gate.local/api
GATE_API_TOKEN=your_secret_token

# App
PUBLIC_APP_URL=https://your-app.vercel.app
```

### 3. Uruchomienie development
```bash
npm run dev
```

### 4. Build i deployment
```bash
npm run build
# Deploy na Vercel
```

## 🗄️ Schemat Bazy Danych

### 1. Profiles (Rozszerzenie Supabase Auth)
```sql
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY,
  email text,
  full_name text,
  phone_number text,
  stripe_customer_id text,
  nip text
);
```

### 2. Units (Kontenery)
```sql
CREATE TABLE public.units (
  id serial PRIMARY KEY,
  name text,
  size text,
  price_monthly integer, -- w groszach
  status text, -- 'available', 'occupied', 'maintenance'
  gate_code text -- PIN do bramy
);
```

### 3. Subscriptions (Źródło Prawdy)
```sql
CREATE TABLE public.subscriptions (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES public.profiles,
  unit_id integer REFERENCES public.units,
  stripe_subscription_id text,
  status text, -- 'active', 'past_due', 'canceled'
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now()
);
```

### 4. Access_Logs (Audit Log)
```sql
CREATE TABLE public.access_logs (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES public.profiles,
  action text, -- 'OPEN_GATE'
  status text, -- 'SUCCESS', 'DENIED_NO_PAYMENT'
  timestamp timestamptz DEFAULT now()
);
```

## 🔄 Flow Aplikacji

### 1. Płatność i Aktywacja (Webhook Pattern)
```
Klient klika "Wynajmij" 
  → POST /api/create-checkout
  → Stripe sesja + metadata
  → Przekierowanie do Stripe
  → Płatność
  → Webhook checkout.session.completed
  → WERYFIKACJA (mózg systemu):
    ✓ Sprawdź podpis webhooka
    ✓ Zmień status unit na 'occupied'
    ✓ Stwórz subskrypcję (active)
    ✓ Generuj fakturę VAT
    ✓ Wyślij SMS/Email z instrukcjami
```

### 2. Otwarcie Bramy (Gate Logic)
```
User klika [OTWÓRZ] w panelu
  → POST /api/gate/open (z tokenem JWT)
  → Sprawdź sesję (czy zalogowany?)
  → Sprawdź subskrypcję (status === 'active'?)
  → JEŚLI NIE: Błąd 402 (Payment Required)
  → JEŚLI TAK:
    ✓ Wyślij request do sterownika bramy
    ✓ Zaloguj zdarzenie w access_logs
    ✓ Zwróć sukces
```

## 🛡️ Bezpieczeństwo

### Kluczowe Zasady
1. **Idempotency** - Webhooki mogą przyjść dwa razy. Sprawdź, czy subskrypcja już istnieje.
2. **Edge Functions** - Endpointy API muszą być lekkie dla natychmiastowego cold start.
3. **Security** - Klucze API trzymamy w .env, NIGDY na frontendzie.
4. **Offline Mode** - Kod PIN fallback gdy padnie internet.

### RLS Polityki (Supabase)
```sql
-- Profiles: użytkownicy mogą czytać tylko swój profil
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Subscriptions: użytkownicy widzą tylko swoje subskrypcje
CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);
```

## 🚀 Deployment

### Vercel (Zalecany)
1. Podłącz repozytorium do Vercel
2. Ustaw zmienne środowiskowe
3. Deploy automatyczny przy każdym push

### VPS (Node.js)
```bash
npm run build
node dist/server/entry.mjs
```

## 📱 Mobile First

Aplikacja jest zoptymalizowana pod kątem użytkowania na telefonach:
- Ultra-lekka (Astro + minimalny JS)
- Działa na słabym LTE
- Przyciski odpowiedniej wielkości (44px+)
- Offline fallback (kod PIN)

## 🧪 Testowanie

### Webhook Testing (Stripe CLI)
```bash
stripe login
stripe listen --forward-to localhost:4321/api/webhooks/stripe
stripe trigger checkout.session.completed
```

### Test Payment
Użyj testowych danych karty Stripe:
- Numer: `4242 4242 4242 4242`
- Data: Dowolna przyszła
- CVV: Dowolne 3 cyfry

## 📞 Wsparcie

W razie problemów z deploymentem lub konfiguracją:
1. Sprawdź zmienne środowiskowe
2. Upewnij się, że webhook URL jest publicznie dostępny
3. Sprawdź logi w Vercel/Supabase

## 📝 Licencja

MIT License - zobacz plik LICENSE

---

**Self Storage MVP 1.0** - "Netflix dla Garaży"