# ฟังก์ชันฝั่งเซิร์ฟเวอร์ (Supabase Edge Functions)

มีสองฟังก์ชัน ทั้งคู่จำเป็นต่อเมื่อขึ้นใช้งานจริง

| ฟังก์ชัน | ทำอะไร | ทำไมต้องอยู่ฝั่งเซิร์ฟเวอร์ |
|---|---|---|
| `create-user` | สร้าง ลบ และตั้งรหัสผ่านใหม่ให้บัญชีพนักงาน | ต้องใช้คีย์ระดับผู้ดูแล ซึ่งห้ามอยู่ในหน้าเว็บเด็ดขาด |
| `notify` | ส่งสรุปยอดเข้า LINE และ Telegram | LINE บล็อกการเรียกจากเบราว์เซอร์ และตอนตี 1 ไม่มีใครเปิดแอปค้างไว้ |

## ติดตั้งครั้งแรก

ต้องมี Supabase CLI ในเครื่อง (`npm i -g supabase`) แล้วรันจากโฟลเดอร์โปรเจกต์

```bash
supabase login
supabase link --project-ref <รหัสโปรเจกต์ของคุณ>
supabase functions deploy create-user
supabase functions deploy notify
```

รหัสโปรเจกต์คือส่วนหน้าของ Project URL เช่นถ้า URL เป็น `https://abcdefgh.supabase.co`
รหัสคือ `abcdefgh`

## ตั้งค่าโทเคนแจ้งเตือน

เลือกทางใดทางหนึ่ง

**ทางที่ 1 — กรอกในแอป (ง่ายกว่า)** ไปหน้าแจ้งเตือนในระบบ ใส่โทเคนแล้วกดออกจากช่อง
ระบบจะเก็บลงตาราง `settings` ซึ่งเปิดอ่านได้เฉพาะสิทธิ์เจ้าของร้าน และฟังก์ชันจะอ่านจากตรงนั้น

**ทางที่ 2 — ตั้งเป็น secret ของฟังก์ชัน (ปลอดภัยกว่า)**

```bash
supabase secrets set LINE_CHANNEL_TOKEN="โทเคนจาก LINE Developers"
supabase secrets set LINE_TO="U1234...หรือ C1234..."
supabase secrets set TELEGRAM_BOT_TOKEN="123456789:AA..."
supabase secrets set TELEGRAM_CHAT_ID="-1001234567890"
```

ถ้าตั้งเป็น secret ไว้ ระบบจะใช้ค่านั้นก่อนเสมอ ไม่สนใจค่าที่กรอกในแอป

## ตั้งเวลาส่งสรุปทุกวันตอนตี 1

รันที่ SQL Editor ครั้งเดียว **ต้องแทน `<ref>` และ `<SERVICE_ROLE_KEY>` ด้วยของจริงก่อน**

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- เวลาของ cron เป็น UTC  ตี 1 ที่ไทย = 18:00 UTC ของวันก่อนหน้า
select cron.schedule('daily-summary', '0 18 * * *', $$
  select net.http_post(
    url     := 'https://<ref>.supabase.co/functions/v1/notify',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);
```

ดูว่าตั้งไว้แล้วหรือยัง `select * from cron.job;`
ถ้าจะเลิกส่ง `select cron.unschedule('daily-summary');`

> คีย์ `service_role` ในคำสั่งนี้อยู่ในฐานข้อมูล ไม่ได้อยู่ในหน้าเว็บและไม่ได้อยู่ใน repo
> อ่านได้เฉพาะเจ้าของโปรเจกต์ Supabase เท่านั้น
> ถ้าอยากปลอดภัยขึ้นอีกให้เก็บคีย์ใน Vault ของ Supabase แล้วดึงมาใช้แทนการพิมพ์ตรง ๆ

## ทดสอบว่าใช้ได้ไหม

กดปุ่ม **ส่งสรุปของวันนี้เดี๋ยวนี้** ที่หน้าแจ้งเตือนในระบบ ถ้าขึ้นว่าส่งแล้วแปลว่าใช้ได้
ถ้าขึ้นว่ายังไม่ได้ตั้งค่า แปลว่าฟังก์ชันหาโทเคนไม่เจอ

## การ์ดที่ส่งเข้า LINE

โครงสร้างการ์ดอยู่ในไฟล์เดียวคือ `supabase/functions/_shared/flex.js`
ทั้งตัวอย่างที่เห็นในหน้าแจ้งเตือนและการ์ดจริงที่ส่งออกไปใช้ไฟล์นี้ร่วมกัน
แก้ที่นี่ที่เดียวแล้วเปลี่ยนพร้อมกันทั้งสองที่ ไม่มีทางหลุดจากกัน

ถ้าแก้ไฟล์นี้ อย่าลืม deploy ฟังก์ชัน `notify` ใหม่ด้วย ไม่งั้นของจริงจะยังเป็นของเดิม
