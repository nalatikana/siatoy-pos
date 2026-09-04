/* สร้างบัญชีผู้ใช้งานใหม่ · เรียกได้เฉพาะเจ้าของร้าน
 *
 * การสร้างบัญชีต้องใช้คีย์ระดับผู้ดูแล ซึ่งห้ามอยู่ในหน้าเว็บเด็ดขาด
 * จึงต้องผ่านฟังก์ชันนี้ที่รันอยู่ฝั่งเซิร์ฟเวอร์ และเช็กสิทธิ์ผู้เรียกทุกครั้ง
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const ROLES = ['staff', 'supervisor', 'owner'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') || '';
    const admin = createClient(SB_URL, SERVICE);
    const asUser = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } } });

    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ error: 'ต้องล็อกอินก่อน' }, 401);
    const { data: me } = await admin.from('profiles').select('role').eq('id', u.user.id).maybeSingle();
    if (!me || me.role !== 'owner') return json({ error: 'สร้างบัญชีได้เฉพาะสิทธิ์เจ้าของร้าน' }, 403);

    const { action, email, password, display_name, role, user_id } = await req.json();

    if (action === 'reset_password') {
      if (!user_id || !password) return json({ error: 'ข้อมูลไม่ครบ' }, 400);
      if (String(password).length < 8) return json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว' }, 400);
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }

    if (action === 'delete') {
      if (!user_id) return json({ error: 'ข้อมูลไม่ครบ' }, 400);
      if (user_id === u.user.id) return json({ error: 'ลบบัญชีตัวเองไม่ได้' }, 400);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }

    // สร้างใหม่
    if (!email || !password || !display_name) return json({ error: 'กรอกข้อมูลให้ครบ' }, 400);
    if (String(password).length < 8) return json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว' }, 400);
    if (!ROLES.includes(role)) return json({ error: 'ระดับสิทธิ์ไม่ถูกต้อง' }, 400);

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,        // ร้านสร้างให้พนักงาน ไม่ต้องรอยืนยันอีเมล
    });
    if (cErr) {
      const m = /already been registered/i.test(cErr.message) ? 'อีเมลนี้มีบัญชีอยู่แล้ว' : cErr.message;
      return json({ error: m }, 400);
    }
    const { error: pErr } = await admin.from('profiles')
      .insert({ id: created.user.id, display_name, role, is_active: true });
    if (pErr) {
      await admin.auth.admin.deleteUser(created.user.id);   // ย้อนกลับ ไม่ให้เหลือบัญชีลอย
      return json({ error: pErr.message }, 400);
    }
    return json({ ok: true, id: created.user.id });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
