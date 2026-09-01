/* หน้าเข้าสู่ระบบ · แสดงเมื่อผูกกับฐานข้อมูลกลางแล้วแต่ยังไม่ได้ล็อกอิน
 * ตอนยังไม่ผูกฐานข้อมูล แอปจะข้ามหน้านี้ไปเลยเพื่อให้ทดลองใช้ได้ทันที
 */
import { CONFIG } from '../config.js';
import { esc, toast } from '../lib/util.js';
import { signIn } from '../lib/sync.js';

export const loginPage = {
  async render() {
    return `
    <div style="max-width:420px;margin:6vh auto 0">
      <div class="card">
        <div style="text-align:center;margin-bottom:18px">
          <div style="font-size:44px;line-height:1">🃏</div>
          <h1 style="font-size:22px;font-weight:600;margin:8px 0 2px">${esc(CONFIG.shopName)}</h1>
          <div class="mini">ระบบขายหน้าร้านและจัดการสต๊อก</div>
        </div>
        <div class="field"><label>อีเมล</label>
          <input class="inp" id="lgMail" type="email" autocomplete="username" autofocus></div>
        <div class="field"><label>รหัสผ่าน</label>
          <input class="inp" id="lgPass" type="password" autocomplete="current-password"></div>
        <div id="lgErr"></div>
        <button class="btn gold block" style="padding:13px;font-size:15px" id="lgGo">เข้าสู่ระบบ</button>
        <div class="mini" style="text-align:center;margin-top:14px">
          ลืมรหัสผ่านให้ติดต่อเจ้าของร้าน · บัญชีถูกสร้างจากหน้าตั้งค่าระบบ</div>
      </div>
    </div>`;
  },

  mount(el) {
    const go = async () => {
      const mail = el.querySelector('#lgMail').value.trim();
      const pass = el.querySelector('#lgPass').value;
      const err = el.querySelector('#lgErr');
      const btn = el.querySelector('#lgGo');
      if (!mail || !pass) { err.innerHTML = '<div class="notice red">กรอกอีเมลและรหัสผ่านให้ครบ</div>'; return; }
      btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ…'; err.innerHTML = '';
      try {
        const p = await signIn(mail, pass);
        toast('ยินดีต้อนรับ <b>' + esc((p && p.display_name) || '') + '</b>', 'ok');
        location.reload();
      } catch (e) {
        err.innerHTML = '<div class="notice red">' + esc(e.message) + '</div>';
        btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
      }
    };
    el.querySelector('#lgGo').onclick = go;
    el.querySelectorAll('.inp').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); });
  },
};
