-- ============================================================================
--  migration 002 : จัดการผู้ใช้งาน และสรุปยอดประจำวันสำหรับส่งแจ้งเตือน
--  รันต่อจาก 001_schema.sql
-- ============================================================================

-- ---------------------------------------------------- สิทธิ์จัดการผู้ใช้ ----
-- เจ้าของร้านแก้ชื่อ เปลี่ยนระดับสิทธิ์ และปิดการใช้งานบัญชีคนอื่นได้
-- ส่วนการ "สร้างบัญชีใหม่" ต้องผ่าน Edge Function เพราะต้องใช้คีย์ระดับผู้ดูแล
-- ซึ่งห้ามอยู่ในหน้าเว็บเด็ดขาด
drop policy if exists owner_manage on profiles;
create policy owner_manage on profiles for all to authenticated
  using (is_owner()) with check (is_owner());

-- ทุกคนแก้ชื่อที่แสดงและ PIN ของตัวเองได้ แต่เปลี่ยนระดับสิทธิ์ตัวเองไม่ได้
drop policy if exists edit_self on profiles;
create policy edit_self on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));

-- ------------------------------------------------ สรุปยอดประจำวัน (json) ----
-- ใช้ทั้งจากหน้าเว็บ (แสดงตัวอย่างข้อความ) และจากงานตั้งเวลาที่ส่งแจ้งเตือนตอนตี 1
-- คิดวันตามเวลาไทยเสมอ ไม่ใช่ UTC ไม่งั้นยอดของวันจะเพี้ยนไป 7 ชั่วโมง
create or replace function daily_summary(
  p_date date default (now() at time zone 'Asia/Bangkok')::date,
  p_location uuid default null
) returns json
language sql stable security definer set search_path = public as $$
with s as (
  select * from sales
   where (client_created_at at time zone 'Asia/Bangkok')::date = p_date
     and (p_location is null or location_id = p_location)
),
ok as (select * from s where status = 'normal'),
it as (select i.* from sale_items i join ok on ok.id = i.sale_id),
top3 as (
  select product_name, sum(qty)::int as qty, sum(line_total) as amt
    from it group by product_name order by 2 desc, 3 desc limit 3
),
bal as (select product_id, sum(qty)::int as qty from stock_moves group by 1)
select json_build_object(
  'date',            p_date,
  'sales_total',     coalesce((select sum(total)  from ok), 0),
  'bill_count',      (select count(*) from ok),
  'discount_total',  coalesce((select sum(item_discount + bill_discount) from ok), 0),
  'card_fee',        coalesce((select sum(card_fee) from ok), 0),
  'cash',            coalesce((select sum(total) from ok where payment = 'cash'), 0),
  'transfer',        coalesce((select sum(total) from ok where payment = 'transfer'), 0),
  'credit',          coalesce((select sum(total) from ok where payment = 'credit'), 0),
  'void_count',      (select count(*) from s where status = 'void'),
  'open_card_count', (select count(*) from s where status = 'open_card'),
  'stock_qty',       coalesce((select sum(qty) from bal), 0),
  'low_count',       (select count(*) from bal b join products p on p.id = b.product_id
                       where b.qty <= 3 and p.is_active),
  'top',             coalesce((select json_agg(json_build_object(
                        'name', product_name, 'qty', qty, 'amount', amt)) from top3), '[]'::json)
);
$$;

grant execute on function daily_summary(date, uuid) to authenticated;

-- ------------------------------------------------------ ที่เก็บค่าแจ้งเตือน ----
-- โทเคนของ LINE และ Telegram เก็บที่เซิร์ฟเวอร์ ไม่เก็บในเครื่องพนักงาน
-- และให้เฉพาะเจ้าของร้านอ่านได้ เพราะใครได้โทเคนไปก็ส่งข้อความในนามร้านได้
drop policy if exists read_all on settings;
create policy read_all on settings for select to authenticated
  using (key not like 'secret:%' or is_owner());
