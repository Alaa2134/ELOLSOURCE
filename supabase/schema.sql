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

create table if not exists suppliers (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists purchases (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists stocktakes (
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

create table if not exists store_orders (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists quotes (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- تفعيل RLS (Row Level Security) على كل الجداول — طبقة حماية على السحابة
-- ملاحظة أمان: النظام بيستخدم مفتاح anon مشترك عشان يشتغل أوف لاين ويتزامن ببساطة،
--   فالسياسات بتسمح بالقراءة والكتابة بالمفتاح ده (زي أي نظام محل واحد).
--   *كلمات السر (أدمن/محاسب/كاشير/استعلام) مش بتترفع للسحابة خالص* — بتفضل محلية
--   على كل جهاز، فحتى لو حد وصل للمفتاح ميقدرش يقرا كلمات السر.
--   لأمان أعلى (فصل كل مستخدم): فعّل Supabase Auth وغيّر using(true) لـ using(auth.uid() is not null).
alter table products enable row level security;
alter table customers enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;
alter table expenses enable row level security;
alter table suppliers enable row level security;
alter table purchases enable row level security;
alter table stocktakes enable row level security;

drop policy if exists "allow all suppliers" on suppliers;
create policy "allow all suppliers" on suppliers for all using (true) with check (true);

drop policy if exists "allow all purchases" on purchases;
create policy "allow all purchases" on purchases for all using (true) with check (true);

drop policy if exists "allow all stocktakes" on stocktakes;
create policy "allow all stocktakes" on stocktakes for all using (true) with check (true);
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

alter table store_orders enable row level security;
drop policy if exists "allow all store_orders" on store_orders;
create policy "allow all store_orders" on store_orders for all using (true) with check (true);

alter table quotes enable row level security;
drop policy if exists "allow all quotes" on quotes;
create policy "allow all quotes" on quotes for all using (true) with check (true);

-- المزامنة اللحظية (Realtime): أي تعديل من جهاز بيوصل لباقي الأجهزة فوراً
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table customers;
alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table payments;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table suppliers;
alter publication supabase_realtime add table purchases;
alter publication supabase_realtime add table stocktakes;
alter publication supabase_realtime add table daycloses;
alter publication supabase_realtime add table settings;
alter publication supabase_realtime add table store_orders;
alter publication supabase_realtime add table quotes;
