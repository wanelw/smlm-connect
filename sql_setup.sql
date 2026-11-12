-- SMLM CONNECT — Skema Database & RLS Policy (Supabase PostgreSQL)

-- 1. Buat / Perbarui Tabel participants (Data Peserta & Hasil Analisis)
CREATE TABLE IF NOT EXISTS public.participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  instance TEXT,
  role TEXT,
  answers JSONB,
  analysis JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "deviceId" TEXT
);

-- Pastikan kolom yang dibutuhkan ada jika tabel sudah terbuat sebelumnya
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS instance TEXT;
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS answers JSONB;
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS analysis JSONB;
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS "deviceId" TEXT;

-- 2. Buat / Perbarui Tabel commitments (Dinding Komitmen)
CREATE TABLE IF NOT EXISTS public.commitments (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  author TEXT NOT NULL,
  instance TEXT,
  role TEXT,
  color TEXT,
  edited BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "deviceId" TEXT
);

ALTER TABLE public.commitments ADD COLUMN IF NOT EXISTS instance TEXT;
ALTER TABLE public.commitments ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.commitments ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.commitments ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE;
ALTER TABLE public.commitments ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.commitments ADD COLUMN IF NOT EXISTS "deviceId" TEXT;

-- 3. Buat / Perbarui Tabel ratings (Rating Kepuasan)
CREATE TABLE IF NOT EXISTS public.ratings (
  id BIGSERIAL PRIMARY KEY,
  "deviceId" TEXT UNIQUE NOT NULL,
  rating INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();

-- 4. Aktifkan Row Level Security (RLS)
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- 5. Berikan Kebijakan Akses Penuh (RLS Policies) untuk Peran anon (publik) & authenticated
DROP POLICY IF EXISTS "Public participants policy" ON public.participants;
CREATE POLICY "Public participants policy" ON public.participants
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public commitments policy" ON public.commitments;
CREATE POLICY "Public commitments policy" ON public.commitments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public ratings policy" ON public.ratings;
CREATE POLICY "Public ratings policy" ON public.ratings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
