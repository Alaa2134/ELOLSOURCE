-- 🔒 تشديد حماية السحابة — يخلي المفتاح العام لوحده مش كافي للوصول للبيانات
-- بعد التشديد: لازم الجهاز يكون مسجّل دخول (النظام بيعمله تلقائياً "دخول مجهول" من غير شاشة لوجين)
--
-- ====== خطوات مهمة قبل ما تشغّل الملف ده (بالترتيب) ======
-- 1) من لوحة Supabase: Authentication → Sign In / Providers → فعّل "Anonymous sign-ins".
-- 2) افتح الموقع/البرنامج على كل أجهزتك مرة واحدة (عشان كل جهاز ياخد جلسة دخول مجهول).
--    الأجهزة اللي مافتحتش النسخة الجديدة لسه هتفقد المزامنة لحد ما تفتحها وتحدّث الصفحة.
-- 3) بعد ما تتأكد إن كل الأجهزة فتحت النسخة الجديدة، شغّل الملف ده:
--    SQL Editor → New query → الصق ده كله → Run.
--
-- النتيجة: أي حد معاه المفتاح العام بس (من غير جلسة) مش هيقدر يقرا ولا يكتب أي بيانات.
-- (كلمات السر أصلاً مش موجودة في السحابة — فدي طبقة حماية زيادة على باقي البيانات)

do $$
declare t text;
begin
  foreach t in array array['products','customers','invoices','payments','expenses',
                           'suppliers','purchases','stocktakes','daycloses','audit','settings','store_orders','quotes']
  loop
    execute format('alter table %I enable row level security;', t);
    -- شيل السياسة القديمة اللي كانت بتسمح للكل (المفتاح العام)
    execute format('drop policy if exists "allow all %s" on %I;', t, t);
    execute format('drop policy if exists "auth %s" on %I;', t, t);
    -- سياسة جديدة: المسجّلين بس (بيشمل الدخول المجهول التلقائي) — مش anon الخام
    execute format('create policy "auth %s" on %I for all to authenticated using (true) with check (true);', t, t);
  end loop;
end $$;

-- للرجوع للوضع القديم (السماح للكل) لو احتجت — شغّل ده بدل اللي فوق:
-- do $$ declare t text; begin
--   foreach t in array array['products','customers','invoices','payments','expenses',
--                            'suppliers','purchases','stocktakes','daycloses','audit','settings','store_orders','quotes'] loop
--     execute format('drop policy if exists "auth %s" on %I;', t, t);
--     execute format('create policy "allow all %s" on %I for all using (true) with check (true);', t, t);
--   end loop; end $$;
