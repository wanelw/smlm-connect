-- 1. Buat Tabel participants
CREATE TABLE IF NOT EXISTS public.participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  school TEXT NOT NULL,
  answers JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  "deviceId" TEXT
);

-- 2. Buat Tabel commitments
CREATE TABLE IF NOT EXISTS public.commitments (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  author TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  color TEXT,
  edited BOOLEAN DEFAULT FALSE,
  "deviceId" TEXT
);

-- 3. Buat Tabel ratings
CREATE TABLE IF NOT EXISTS public.ratings (
  id BIGSERIAL PRIMARY KEY,
  "deviceId" TEXT UNIQUE NOT NULL,
  rating INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Aktifkan Row Level Security (RLS)
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- 5. Berikan Kebijakan Akses (RLS Policies) untuk peran anon (publik)
-- Izinkan SELECT, INSERT, UPDATE, DELETE untuk publik
DROP POLICY IF EXISTS "Public participants policy" ON public.participants;
CREATE POLICY "Public participants policy" ON public.participants
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public commitments policy" ON public.commitments;
CREATE POLICY "Public commitments policy" ON public.commitments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public ratings policy" ON public.ratings;
CREATE POLICY "Public ratings policy" ON public.ratings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
