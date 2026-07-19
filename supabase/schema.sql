-- سكيما التخزين السحابي لنظام كاشير السقا
-- شغّل الملف ده مرة واحدة في Supabase: SQL Editor -> New query -> الصق -> Run

create table if not exists products (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists customers (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists invoices (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists payments (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists expenses (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists daycloses (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists audit (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists settings (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- تفعيل RLS مع سماح كامل بمفتاح anon (نظام داخلي لمحل واحد)
-- لو عايز أمان أعلى: اعمل مستخدم Supabase Auth وعدّل السياسات دي
alter table products enable row level security;
alter table customers enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;
alter table expenses enable row level security;
alter table daycloses enable row level security;
alter table audit enable row level security;
alter table settings enable row level security;

drop policy if exists "allow all payments" on payments;
create policy "allow all payments" on payments for all using (true) with check (true);

drop policy if exists "allow all expenses" on expenses;
create policy "allow all expenses" on expenses for all using (true) with check (true);

drop policy if exists "allow all daycloses" on daycloses;
create policy "allow all daycloses" on daycloses for all using (true) with check (true);

drop policy if exists "allow all audit" on audit;
create policy "allow all audit" on audit for all using (true) with check (true);

drop policy if exists "allow all products" on products;
create policy "allow all products" on products for all using (true) with check (true);

drop policy if exists "allow all customers" on customers;
create policy "allow all customers" on customers for all using (true) with check (true);

drop policy if exists "allow all invoices" on invoices;
create policy "allow all invoices" on invoices for all using (true) with check (true);

drop policy if exists "allow all settings" on settings;
create policy "allow all settings" on settings for all using (true) with check (true);

-- المزامنة اللحظية (Realtime): أي تعديل من جهاز بيوصل لباقي الأجهزة فوراً
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table customers;
alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table payments;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table daycloses;
alter publication supabase_realtime add table settings;
