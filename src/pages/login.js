/* หน้าเข้าสู่ระบบ · แสดงเมื่อผูกกับฐานข้อมูลกลางแล้วแต่ยังไม่ได้ล็อกอิน
 * ตอนยังไม่ผูกฐานข้อมูล แอปจะข้ามหน้านี้ไปเลยเพื่อให้ทดลองใช้ได้ทันที
 */
import { CONFIG } from '../config.js';
import { esc, toast } from '../lib/util.js';
import { signIn, mfaPending, mfaSubmit } from '../lib/sync.js';

/* บัญชีที่เปิดยืนยันสองชั้นไว้ ต้องใส่รหัส 6 หลักจากแอปยืนยันตัวตนอีกชั้น */
function askCode(el, factorId, profile) {
  const card = el.querySelector('.card');
  card.innerHTML = `
    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:40px;line-height:1">🔐</div>
      <h1 style="font-size:19px;font-weight:600;margin:8px 0 2px">ยืนยันตัวตนอีกชั้น</h1>
      <div class="mini">เปิดแอปยืนยันตัวตนแล้วใส่รหัส 6 หลักที่แสดงอยู่</div>
    </div>
    <div class="field"><input class="inp" id="mfaCode" inputmode="numeric" maxlength="6"
      autocomplete="one-time-code" autofocus
      style="text-align:center;font-size:26px;letter-spacing:10px" placeholder="000000"></div>
    <div id="mfaErr"></div>
    <button class="btn gold block" style="padding:13px;font-size:15px" id="mfaGo">ยืนยัน</button>`;
  const go = async () => {
    const code = card.querySelector('#mfaCode').value.trim();
    const err = card.querySelector('#mfaErr');
    const btn = card.querySelector('#mfaGo');
    if (code.length < 6) { err.innerHTML = '<div class="notice red">ใส่รหัสให้ครบ 6 หลัก</div>'; return; }
    btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ…'; err.innerHTML = '';
    try {
      await mfaSubmit(factorId, code);
      toast('ยินดีต้อนรับ <b>' + esc((profile && profile.display_name) || '') + '</b>', 'ok');
      location.reload();
    } catch (e) {
      err.innerHTML = '<div class="notice red">' + esc(e.message) + '</div>';
      btn.disabled = false; btn.textContent = 'ยืนยัน';
      card.querySelector('#mfaCode').value = '';
    }
  };
  card.querySelector('#mfaGo').onclick = go;
  card.querySelector('#mfaCode').onkeydown = e => { if (e.key === 'Enter') go(); };
  setTimeout(() => card.querySelector('#mfaCode').focus(), 60);
}

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
        const factorId = await mfaPending();
        if (factorId) { askCode(el, factorId, p); btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ'; return; }
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
