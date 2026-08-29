-- ============================================================================
--  Siatoy TCG · POS  ·  migration 001 : schema
--  PostgreSQL 15 / Supabase
--
--  หลักการที่สคีมานี้บังคับไว้
--    1. สต๊อกเป็น "สมุดเดินของ" (stock_moves) ไม่ใช่ตัวเลขเดียวที่เขียนทับกันได้
--    2. บิลเก็บ "ราคาและต้นทุน ณ วันขาย" ลงในบรรทัดบิล
--    3. ต้นทุนอยู่คนละตารางกับสินค้า พนักงานหน้าร้านอ่านไม่ได้ตั้งแต่ระดับฐานข้อมูล
--    4. รหัสบิลสร้างจากเครื่องขาย ส่งซ้ำกี่รอบก็ได้บิลเดียว (id เป็น uuid จากเครื่อง)
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums ----
create type user_role   as enum ('staff','supervisor','owner');
create type loc_kind    as enum ('shop','event');
create type sale_status as enum ('normal','void','open_card');
create type pay_method  as enum ('cash','transfer','credit','none');
create type move_type   as enum (
  'opening',        -- ยอดยกมาวันตัดยอด
  'purchase',       -- รับเข้าจากผู้ฝากขาย/ผู้จำหน่าย
  'sale',           -- ขายออก
  'sale_void',      -- คืนของจากบิลที่ยกเลิก
  'open_card',      -- เปิดการ์ดโดยเจ้าของ (ตัดของ ไม่เป็นรายได้)
  'transfer_out',   -- ยกออกไปจุดขายอื่น เช่น บูธงาน
  'transfer_in',    -- รับกลับเข้าจุดขาย
  'damage',         -- เสียหาย
  'sample',         -- ตัวอย่าง/ของแถม
  'return_vendor',  -- คืนของให้ผู้ฝากขาย
  'adjust'          -- ปรับยอดจากการนับสต๊อก
);

-- --------------------------------------------------------------- people ----
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role         user_role not null default 'staff',
  pin_hash     text,                       -- PIN สลับคนหน้าเครื่องเดียวกัน
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create or replace function my_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function can_see_cost() returns boolean
  language sql stable as $$
  select coalesce(my_role() in ('supervisor','owner'), false)
$$;

create or replace function is_owner() returns boolean
  language sql stable as $$
  select coalesce(my_role() = 'owner', false)
$$;

-- ------------------------------------------------------------ locations ----
create table locations (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,          -- SHOP, FEST2609 …  ใช้เป็นส่วนหนึ่งของเลขบิล
  name       text not null,
  kind       loc_kind not null default 'shop',
  is_active  boolean not null default true,
  opened_at  date,
  closed_at  date,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- vendors ----
create table vendors (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,      -- 001, 002 …
  name           text not null,
  tel            text,
  commission_pct numeric(5,2) not null default 0,
  started_on     date,
  is_active      boolean not null default true,
  note           text,
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------ card sets ----
create table card_sets (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,          -- SV8a, OP09, ACC …
  name       text not null,
  game       text,
  is_open    boolean not null default true,
  sort_order int not null default 0
);

-- ------------------------------------------------------------- products ----
create table products (
  id         uuid primary key default gen_random_uuid(),
  sku        text not null unique,          -- รหัสภายในร้าน 8859xxx
  name       text not null,
  category   text,
  set_id     uuid references card_sets(id),
  vendor_id  uuid references vendors(id),
  price      numeric(12,2) not null default 0,
  vat_rate   numeric(5,2)  not null default 0,   -- เผื่อ VAT ปิดไว้ที่ 0 ก่อน
  is_single  boolean not null default false,     -- การ์ดแยกใบ · หนึ่งรายการ = หนึ่งใบ
  is_active  boolean not null default true,
  icon       text,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on products (is_active, category);

-- ต้นทุนแยกตาราง พนักงานหน้าร้านอ่านไม่ได้
create table product_costs (
  product_id uuid primary key references products(id) on delete cascade,
  cost       numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- หนึ่งสินค้ามีได้หลายบาร์โค้ด : รหัสร้าน + บาร์โค้ดโรงงานที่ติดกล่องมา
create table product_barcodes (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  barcode    text not null unique,
  kind       text not null default 'shop' check (kind in ('shop','factory')),
  created_at timestamptz not null default now()
);
create index on product_barcodes (product_id);

create table price_history (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id) on delete cascade,
  price          numeric(12,2),
  cost           numeric(12,2),
  effective_from timestamptz not null default now(),
  changed_by     uuid references profiles(id),
  reason         text
);
create index on price_history (product_id, effective_from desc);

-- ----------------------------------------------------------- stock book ----
create table stock_moves (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  location_id uuid not null references locations(id),
  qty        integer not null check (qty <> 0),   -- + เข้า / − ออก
  move_type  move_type not null,
  ref_id     uuid,                                -- บิล / เอกสารรับเข้า / รอบนับสต๊อก
  ref_no     text,                                -- เลข PO หรือเลขบิล ไว้ให้คนอ่าน
  reason     text,
  note       text,
  created_by uuid references profiles(id),
  device_id  text,
  created_at timestamptz not null default now()
);
create index on stock_moves (product_id, location_id);
create index on stock_moves (created_at desc);
-- กันบิลเดียวกันที่ส่งซ้ำจากเครื่องออฟไลน์ ตัดสต๊อกซ้ำ
create unique index stock_moves_once
  on stock_moves (ref_id, product_id, move_type) where ref_id is not null;

create view stock_balance as
  select product_id, location_id, sum(qty)::int as qty
  from stock_moves group by 1,2;

create view stock_total as
  select product_id, sum(qty)::int as qty
  from stock_moves group by 1;

-- ---------------------------------------------------------------- sales ----
create table sales (
  id                uuid primary key,        -- เครื่องขายเป็นคนสร้าง ส่งซ้ำไม่เกิดบิลซ้ำ
  bill_no           text not null unique,    -- INV-260829-SHOP-0007 / OPN-…
  location_id       uuid not null references locations(id),
  status            sale_status not null default 'normal',
  payment           pay_method  not null default 'cash',
  subtotal          numeric(12,2) not null default 0,  -- ก่อนส่วนลด
  item_discount     numeric(12,2) not null default 0,
  bill_discount     numeric(12,2) not null default 0,
  discount_reason   text,
  card_fee          numeric(12,2) not null default 0,
  vat_amount        numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  member_id         uuid,
  slip_path         text,
  note              text,
  created_by        uuid references profiles(id),
  device_id         text,
  client_created_at timestamptz not null,    -- เวลาที่กดขายจริงบนเครื่อง
  created_at        timestamptz not null default now(),
  synced_at         timestamptz not null default now(),
  void_reason       text,
  voided_by         uuid references profiles(id),
  voided_at         timestamptz
);
create index on sales (client_created_at desc);
create index on sales (location_id, status);

create table sale_items (
  id             uuid primary key,
  sale_id        uuid not null references sales(id) on delete cascade,
  product_id     uuid references products(id),
  sku            text not null,             -- สำเนา เผื่อสินค้าถูกลบ
  product_name   text not null,             -- สำเนาชื่อ ณ วันขาย
  vendor_id      uuid references vendors(id),
  qty            integer not null check (qty > 0),
  unit_price     numeric(12,2) not null,    -- ราคา ณ วันขาย
  discount       numeric(12,2) not null default 0,   -- ลดต่อชิ้น
  discount_reason text,
  vat_rate       numeric(5,2) not null default 0,
  line_total     numeric(12,2) not null
);
create index on sale_items (sale_id);
create index on sale_items (product_id);

-- ต้นทุน ณ วันขาย แยกตารางเช่นเดียวกับ product_costs
create table sale_item_costs (
  sale_item_id uuid primary key references sale_items(id) on delete cascade,
  unit_cost    numeric(12,2) not null default 0
);

-- -------------------------------------------------------------- members ----
create table members (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  tel         text unique,
  tier        text not null default 'ทั่วไป',
  points      integer not null default 0,
  total_spend numeric(14,2) not null default 0,
  created_at  timestamptz not null default now()
);
alter table sales add constraint sales_member_fk
  foreign key (member_id) references members(id);

create table point_moves (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id) on delete cascade,
  sale_id    uuid references sales(id),
  points     integer not null,
  reason     text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ bank recon ----
create table bank_lines (
  id          uuid primary key default gen_random_uuid(),
  txn_time    timestamptz not null,
  amount      numeric(12,2) not null,
  bank        text,
  ref         text,
  raw         jsonb,
  imported_at timestamptz not null default now(),
  imported_by uuid references profiles(id),
  unique (bank, ref, txn_time, amount)
);

create table recon_matches (
  id           uuid primary key default gen_random_uuid(),
  bank_line_id uuid not null references bank_lines(id) on delete cascade,
  sale_id      uuid references sales(id),
  diff         numeric(12,2) not null default 0,
  status       text not null default 'open'
                 check (status in ('ok','diff','none','open','resolved')),
  resolution   text,
  note         text,
  slip_path    text,
  resolved_by  uuid references profiles(id),
  resolved_at  timestamptz
);

-- --------------------------------------------------- vendor settlements ----
create table vendor_settlements (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references vendors(id),
  period_start date not null,
  period_end   date not null,
  gross        numeric(14,2) not null default 0,
  commission   numeric(14,2) not null default 0,
  payable      numeric(14,2) not null default 0,
  status       text not null default 'draft' check (status in ('draft','sent','paid')),
  paid_at      timestamptz,
  note         text,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------ audit/log ----
create table audit_log (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  user_id   uuid references profiles(id),
  action    text not null,      -- void_sale, price_change, open_card, big_discount …
  entity    text,
  entity_id uuid,
  detail    jsonb
);
create index on audit_log (at desc);

create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

-- ============================================================================
--  ROW LEVEL SECURITY
--  ทุกคนที่ล็อกอินอ่านข้อมูลขายและสินค้าได้  แต่ต้นทุนและกำไรจำกัดที่หัวหน้าขึ้นไป
-- ============================================================================
alter table profiles           enable row level security;
alter table locations          enable row level security;
alter table vendors            enable row level security;
alter table card_sets          enable row level security;
alter table products           enable row level security;
alter table product_costs      enable row level security;
alter table product_barcodes   enable row level security;
alter table price_history      enable row level security;
alter table stock_moves        enable row level security;
alter table sales              enable row level security;
alter table sale_items         enable row level security;
alter table sale_item_costs    enable row level security;
alter table members            enable row level security;
alter table point_moves        enable row level security;
alter table bank_lines         enable row level security;
alter table recon_matches      enable row level security;
alter table vendor_settlements enable row level security;
alter table audit_log          enable row level security;
alter table settings           enable row level security;

-- อ่านได้ทุกคนที่ล็อกอิน
create policy read_all on locations        for select to authenticated using (true);
create policy read_all on vendors          for select to authenticated using (true);
create policy read_all on card_sets        for select to authenticated using (true);
create policy read_all on products         for select to authenticated using (true);
create policy read_all on product_barcodes for select to authenticated using (true);
create policy read_all on stock_moves      for select to authenticated using (true);
create policy read_all on sales            for select to authenticated using (true);
create policy read_all on sale_items       for select to authenticated using (true);
create policy read_all on members          for select to authenticated using (true);
create policy read_all on point_moves      for select to authenticated using (true);
create policy read_all on settings         for select to authenticated using (true);
create policy read_self on profiles        for select to authenticated using (true);

-- ต้นทุน กำไร และการเงิน : หัวหน้างานขึ้นไป
create policy cost_read on product_costs      for select to authenticated using (can_see_cost());
create policy cost_read on sale_item_costs    for select to authenticated using (can_see_cost());
create policy cost_read on price_history      for select to authenticated using (can_see_cost());
create policy sup_read  on bank_lines         for select to authenticated using (can_see_cost());
create policy sup_read  on recon_matches      for select to authenticated using (can_see_cost());
create policy sup_read  on vendor_settlements for select to authenticated using (can_see_cost());
create policy sup_read  on audit_log          for select to authenticated using (can_see_cost());

-- เขียน : ขายและเดินของ ทำได้ทุกสิทธิ์  (เปิดการ์ดถูกกันด้วย trigger ด้านล่าง)
create policy write_sale  on sales       for insert to authenticated with check (true);
create policy write_item  on sale_items  for insert to authenticated with check (true);
create policy write_move  on stock_moves for insert to authenticated with check (true);
create policy write_point on point_moves for insert to authenticated with check (true);
create policy write_audit on audit_log   for insert to authenticated with check (true);

-- แก้บิล (ยกเลิก) : หัวหน้างานขึ้นไป
create policy void_sale on sales for update to authenticated
  using (can_see_cost()) with check (can_see_cost());

-- สินค้า ราคา ผู้ฝากขาย เซต ตั้งค่า : หัวหน้างานขึ้นไป
create policy sup_write on products         for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy sup_write on product_costs    for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy sup_write on product_barcodes for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy sup_write on vendors          for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy sup_write on card_sets        for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy sup_write on locations        for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy sup_write on members          for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy sup_write on settings         for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy sup_write on price_history    for insert to authenticated with check (can_see_cost());
create policy sup_write on bank_lines       for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy sup_write on recon_matches    for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy sup_write on vendor_settlements for all to authenticated using (can_see_cost()) with check (can_see_cost());
create policy cost_write on sale_item_costs for insert to authenticated with check (true);

-- เปิดการ์ด (ตัดของไม่รับเงิน) : เจ้าของร้านเท่านั้น
create or replace function guard_open_card() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'open_card' and not is_owner() then
    raise exception 'เปิดการ์ดได้เฉพาะสิทธิ์เจ้าของร้าน';
  end if;
  return new;
end $$;

create trigger sales_guard_open_card
  before insert or update on sales
  for each row execute function guard_open_card();

-- สมุดเดินของห้ามแก้ย้อนหลัง : ลงบรรทัดกลับรายการแทน
-- ใช้ trigger ไม่ใช่ rule  เพราะ rule แบบ update จะทำให้ insert ... on conflict do nothing
-- ใช้ไม่ได้ ซึ่งเป็นคำสั่งที่เครื่องออฟไลน์ต้องใช้ตอนส่งบิลซ้ำ
create or replace function stock_moves_immutable() returns trigger
  language plpgsql as $$
begin
  raise exception 'สมุดเดินของแก้หรือลบย้อนหลังไม่ได้ ให้ลงบรรทัดกลับรายการแทน';
end $$;

create trigger stock_moves_no_change
  before update or delete on stock_moves
  for each row execute function stock_moves_immutable();
