-- =====================================================
-- AUTOMATYCZNY SYSTEM SELF STORAGE - SUPABASE SCHEMA
-- =====================================================

-- 1. PROFILES (Rozszerzenie Supabase Auth)
-- =====================================================
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY,
  email text,
  full_name text,
  phone_number text, -- Kluczowe do awaryjnego otwierania/SMS
  stripe_customer_id text, -- Mapowanie na Stripe
  nip text, -- Opcjonalnie do faktury B2B
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Polityka RLS: użytkownicy mogą czytać tylko swój profil
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger do automatycznego tworzenia profilu przy rejestracji
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. UNITS (Kontenery Magazynowe)
-- =====================================================
CREATE TABLE public.units (
  id serial PRIMARY KEY,
  name text NOT NULL, -- np. "Boks A-12"
  size text NOT NULL, -- np. "3m2"
  price_monthly integer NOT NULL, -- w groszach (np. 20000 = 200.00 PLN)
  status text NOT NULL DEFAULT 'available', -- 'available', 'occupied', 'maintenance'
  gate_code text NOT NULL, -- PIN do kłódki/bramy (statyczny)
  description text,
  location text, -- np. "Sektor A, rząd 1"
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Polityka RLS: każdy może czytać jednostki
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Units are viewable by everyone" ON public.units
  FOR SELECT USING (true);

-- Tylko admin (service_role) może modyfikować
CREATE POLICY "Only admin can modify units" ON public.units
  FOR ALL USING (false);

-- 3. SUBSCRIPTIONS (Źródło Prawdy o Dostępie)
-- =====================================================
CREATE TABLE public.subscriptions (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES public.profiles NOT NULL,
  unit_id integer REFERENCES public.units NOT NULL,
  stripe_subscription_id text NOT NULL UNIQUE,
  status text NOT NULL, -- 'active', 'past_due', 'canceled', 'incomplete'
  current_period_end timestamptz NOT NULL, -- Do kiedy opłacone?
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Polityka RLS: użytkownicy widzą tylko swoje subskrypcje
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Tylko admin (service_role) może modyfikować
CREATE POLICY "Only admin can modify subscriptions" ON public.subscriptions
  FOR ALL USING (false);

-- Indeks dla szybkiego sprawdzania statusu
CREATE INDEX idx_subscriptions_user_unit ON public.subscriptions(user_id, unit_id);
CREATE INDEX idx_subscriptions_stripe ON public.subscriptions(stripe_subscription_id);

-- 4. ACCESS_LOGS (Audit Log - kto i kiedy otworzył)
-- =====================================================
CREATE TABLE public.access_logs (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES public.profiles,
  unit_id integer REFERENCES public.units,
  action text NOT NULL, -- 'OPEN_GATE', 'OPEN_FAIL'
  status text NOT NULL, -- 'SUCCESS', 'DENIED_NO_PAYMENT', 'DENIED_NO_AUTH', 'ERROR'
  ip_address inet,
  user_agent text,
  timestamp timestamptz DEFAULT now()
);

-- Polityka RLS: użytkownicy widzą tylko swoje logi
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs" ON public.access_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Tylko admin (service_role) może dodawać logi
CREATE POLICY "Only admin can insert logs" ON public.access_logs
  FOR INSERT USING (false);

-- Indeks dla szybkich zapytań
CREATE INDEX idx_access_logs_user ON public.access_logs(user_id);
CREATE INDEX idx_access_logs_timestamp ON public.access_logs(timestamp DESC);

-- 5. INVOICES (Faktury - opcjonalnie, jeśli chcesz trzymać lokalnie)
-- =====================================================
CREATE TABLE public.invoices (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES public.profiles NOT NULL,
  subscription_id integer REFERENCES public.subscriptions,
  fakturownia_id integer, -- ID z Fakturownia
  stripe_invoice_id text,
  number text,
  amount integer, -- w groszach
  status text DEFAULT 'draft', -- 'draft', 'sent', 'paid'
  issued_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoices" ON public.invoices
  FOR SELECT USING (auth.uid() = user_id);

-- 6. NOTIFICATIONS (Powiadomienia SMS/Email)
-- =====================================================
CREATE TABLE public.notifications (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES public.profiles NOT NULL,
  type text NOT NULL, -- 'SMS', 'EMAIL'
  recipient text NOT NULL,
  subject text,
  message text NOT NULL,
  status text DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- DANE POCZĄTKOWE (Seed Data)
-- =====================================================

-- Kontenery magazynowe
INSERT INTO public.units (name, size, price_monthly, status, gate_code, description, location) VALUES
('Kontener A-1', '3m²', 20000, 'available', '1234', 'Mały kontener idealny na narzędzia', 'Sektor A, rząd 1'),
('Kontener A-2', '3m²', 20000, 'available', '2345', 'Mały kontener idealny na narzędzia', 'Sektor A, rząd 1'),
('Kontener A-3', '5m²', 35000, 'available', '3456', 'Średni kontener na meble lub sprzęt', 'Sektor A, rząd 2'),
('Kontener A-4', '5m²', 35000, 'available', '4567', 'Średni kontener na meble lub sprzęt', 'Sektor A, rząd 2'),
('Kontener B-1', '10m²', 60000, 'available', '5678', 'Duży kontener na cały garaż', 'Sektor B, rząd 1'),
('Kontener B-2', '10m²', 60000, 'available', '6789', 'Duży kontener na cały garaż', 'Sektor B, rząd 1'),
('Kontener C-1', '15m²', 90000, 'available', '7890', 'Kontener XXL dla firm', 'Sektor C, rząd 1'),
('Kontener C-2', '15m²', 90000, 'available', '8901', 'Kontener XXL dla firm', 'Sektor C, rząd 1');

-- =====================================================
-- FUNKCJE POMOCNICZE
-- =====================================================

-- Funkcja do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggery dla automatycznej aktualizacji updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- KONIEC SCHEMA
-- =====================================================