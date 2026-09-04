-- ============================================================================
--  migration 003 : ความปลอดภัยของการเข้าใช้งาน
--  รันต่อจาก 002_users_and_summary.sql
-- ============================================================================

-- ------------------------------------------------ ประวัติการเข้าใช้งาน ----
-- เก็บว่าใครเข้าระบบจากเครื่องไหนเมื่อไหร่ และล็อก/ปลดล็อกหน้าจอตอนไหน
-- ไม่เก็บรหัสผ่านหรือ PIN ใด ๆ ทั้งสิ้น เก็บแค่ว่าเกิดเหตุการณ์อะไรขึ้น
create table if not exists login_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete set null,
  kind       text not null check (kind in ('login','logout','lock','unlock','unlock_failed','pin_set')),
  device_id  text,
  device_name text,
  at         timestamptz not null default now(),
  detail     jsonb
);
create index if not exists login_events_at_idx on login_events (at desc);
create index if not exists login_events_user_idx on login_events (user_id, at desc);

alter table login_events enable row level security;

-- ทุกคนบันทึกเหตุการณ์ของตัวเองได้ แต่บันทึกในนามคนอื่นไม่ได้
drop policy if exists write_own on login_events;
create policy write_own on login_events for insert to authenticated
  with check (user_id = auth.uid());

-- อ่านได้เฉพาะหัวหน้างานขึ้นไป และทุกคนอ่านของตัวเองได้
drop policy if exists read_events on login_events;
create policy read_events on login_events for select to authenticated
  using (can_see_cost() or user_id = auth.uid());

-- ประวัติแก้หรือลบย้อนหลังไม่ได้ ไม่งั้นจะไม่มีประโยชน์ในการตรวจสอบ
create or replace function login_events_immutable() returns trigger
  language plpgsql as $$
begin
  raise exception 'ประวัติการเข้าใช้งานแก้หรือลบย้อนหลังไม่ได้';
end $$;

drop trigger if exists login_events_no_change on login_events;
create trigger login_events_no_change
  before update or delete on login_events
  for each row execute function login_events_immutable();

-- --------------------------------------------------------------- มุมมอง ----
-- รวมชื่อผู้ใช้มาให้เลย หน้าเว็บจะได้ไม่ต้องยิงสองรอบ
create or replace view login_events_view as
  select e.*, p.display_name, p.role
    from login_events e left join profiles p on p.id = e.user_id;

grant select on login_events_view to authenticated;

-- --------------------------------------------------------- เก็บกวาดของเก่า ----
-- เก็บย้อนหลัง 180 วันพอ ไม่งั้นตารางจะโตไปเรื่อย ๆ โดยไม่มีใครได้ใช้
create or replace function purge_login_events() returns void
  language sql security definer set search_path = public as $$
  delete from login_events where at < now() - interval '180 days';
$$;

-- ------------------------------------------------------------ PIN ล็อกจอ ----
-- ต้องแยกตาราง ไม่เก็บใน profiles เพราะ profiles ทุกคนที่ล็อกอินอ่านได้
-- ถ้าเก็บรวมกัน พนักงานคนหนึ่งจะดึงค่าที่ใช้เดา PIN ของอีกคนไปได้
-- ตารางนี้แต่ละคนอ่านและเขียนได้เฉพาะแถวของตัวเอง แม้แต่เจ้าของร้านก็อ่านของคนอื่นไม่ได้
create table if not exists user_pins (
  user_id    uuid primary key references profiles(id) on delete cascade,
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);
alter table user_pins enable row level security;

drop policy if exists own_pin on user_pins;
create policy own_pin on user_pins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on column profiles.pin_hash is 'ไม่ใช้แล้ว ย้ายไปตาราง user_pins เพราะ profiles ทุกคนอ่านได้';
