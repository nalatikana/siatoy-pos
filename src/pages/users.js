/* ผู้ใช้งานและสิทธิ์
 *
 * การสร้างบัญชีต้องใช้คีย์ระดับผู้ดูแลของฐานข้อมูล ซึ่งห้ามอยู่ในหน้าเว็บเด็ดขาด
 * หน้านี้จึงส่งคำสั่งไปให้ฟังก์ชันฝั่งเซิร์ฟเวอร์ทำแทน และฟังก์ชันนั้นเช็กก่อนทุกครั้ง
 * ว่าคนสั่งเป็นเจ้าของร้านจริง
 */
import { esc, toast, openModal, closeModal, redrawPage } from '../lib/util.js';
import { hasBackend } from '../config.js';
import { invoke, currentUser, currentProfile, client, canSeeCost } from '../lib/sync.js';
import { db } from '../lib/store.js';
import { S } from '../lib/state.js';

const ROLE_NAME = { staff: 'พนักงานหน้าร้าน', supervisor: 'หัวหน้างาน', owner: 'เจ้าของร้าน' };
const ROLE_ICON = { staff: '👤', supervisor: '🛡️', owner: '👑' };
const CAN = {
  staff:      { can: ['ทำบิล รับเงิน', 'สแกนรับเข้า-ตัดออก', 'ดูสต๊อกคงเหลือ', 'พิมพ์บาร์โค้ด'],
                cant: ['ดูต้นทุนและกำไร', 'ยกเลิกบิล', 'แก้ราคา', 'นำเข้าข้อมูล'] },
  supervisor: { can: ['ทุกอย่างของพนักงาน', 'อนุมัติยกเลิกบิล', 'ดูต้นทุนและกำไร', 'แก้ราคาและข้อมูลสินค้า', 'กระทบยอดธนาคาร'],
                cant: ['เปิดการ์ดโดยไม่รับเงิน', 'จัดการบัญชีผู้ใช้'] },
  owner:      { can: ['เห็นและทำได้ทุกอย่าง', 'เปิดการ์ดโดยไม่รับเงิน', 'สร้างและลบบัญชีผู้ใช้'], cant: [] },
};

let list = [], events = [];

const KIND = {
  login:         ['เข้าสู่ระบบ', 'green'],
  logout:        ['ออกจากระบบ', ''],
  lock:          ['ล็อกหน้าจอ', ''],
  unlock:        ['ปลดล็อกหน้าจอ', 'green'],
  unlock_failed: ['ใส่ PIN ผิด', 'red'],
  pin_set:       ['ตั้ง PIN ใหม่', 'warn'],
};

async function load() {
  list = []; events = [];
  const sb = client();
  if (sb && currentUser()) {
    const { data } = await sb.from('profiles').select('*').order('created_at');
    list = data || [];
    const { data: ev } = await sb.from('login_events_view')
      .select('*').order('at', { ascending: false }).limit(60);
    events = ev || [];
  } else {
    // โหมดทดลอง ยังไม่มีบัญชีจริง แต่ประวัติในเครื่องมีให้ดู
    events = (await db.events.orderBy('id').reverse().limit(60).toArray())
      .map(e => ({ ...e, display_name: 'เครื่องนี้' }));
  }
}

function historyCard() {
  return `
  <div class="card" style="margin-top:14px">
    <div class="card-title"><span class="ic">🕘</span> ประวัติการเข้าใช้งาน
      <span class="sub">${events.length} รายการล่าสุด</span></div>
    ${events.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>เวลา</th><th>ใคร</th><th>เหตุการณ์</th><th>เครื่อง / จุดขาย</th></tr></thead>
      <tbody>${events.map(e => {
        const k = KIND[e.kind] || [e.kind, ''];
        return `<tr>
          <td class="mini">${new Date(e.at).toLocaleString('th-TH', { day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit' })}</td>
          <td>${esc(e.display_name || '-')}</td>
          <td><span class="tag ${k[1]}">${k[0]}</span></td>
          <td class="mini">${esc(e.device_name || '-')}${e.device_id ? ' · ' + esc(e.device_id) : ''}</td>
        </tr>`; }).join('')}</tbody></table></div>`
      : '<div class="cart-empty"><span class="big">🕘</span>ยังไม่มีประวัติ</div>'}
    <div class="notice info" style="margin-top:12px">ประวัตินี้แก้หรือลบย้อนหลังไม่ได้
      แม้แต่เจ้าของร้าน · เก็บย้อนหลัง 180 วัน · ถ้าเห็นการเข้าใช้งานจากเครื่องที่ไม่รู้จัก
      ให้เปลี่ยนรหัสผ่านของบัญชีนั้นทันที</div>
  </div>`;
}

function userForm(existing) {
  const isNew = !existing;
  openModal(`
    <div class="modal-head"><h3>${isNew ? 'เพิ่มผู้ใช้งาน' : 'แก้ไข ' + esc(existing.display_name)}</h3>
      <button class="x" id="mClose">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>ชื่อที่แสดงในระบบ</label>
        <input class="inp" id="uName" value="${isNew ? '' : esc(existing.display_name)}"
          placeholder="เช่น พนักงานเอ"></div>
      ${isNew ? `
      <div class="field"><label>อีเมลสำหรับล็อกอิน</label>
        <input class="inp" id="uMail" type="email" placeholder="staff1@siatoy.local"></div>
      <div class="field"><label>รหัสผ่าน (อย่างน้อย 8 ตัว)</label>
        <input class="inp" id="uPass" type="text" placeholder="ตั้งให้พนักงานแล้วบอกเขาไปได้เลย"></div>
      <div class="notice info">อีเมลไม่จำเป็นต้องเป็นอีเมลจริงที่ใช้รับเมลได้
        ใช้เป็นแค่ชื่อผู้ใช้ก็ได้ เช่น staff1@siatoy.local เพราะระบบยืนยันบัญชีให้อัตโนมัติ</div>` : ''}
      <div class="field" style="margin-top:14px"><label>ระดับสิทธิ์</label>
        <select class="inp" id="uRole">
          ${Object.keys(ROLE_NAME).map(r => `<option value="${r}"
            ${!isNew && existing.role === r ? 'selected' : ''}>${ROLE_ICON[r]} ${ROLE_NAME[r]}</option>`).join('')}
        </select></div>
      <div id="uCan"></div>
      ${isNew ? '' : `<label class="chk"><input type="checkbox" id="uActive"
        ${existing.is_active !== false ? 'checked' : ''}> เปิดใช้งานบัญชีนี้</label>`}
    </div>
    <div class="modal-foot"><button class="btn ghost" id="mNo">ยกเลิก</button>
      <button class="btn gold" id="mOk">${isNew ? 'สร้างบัญชี' : 'บันทึก'}</button></div>`);

  const box = document.getElementById('modalBox');
  const drawCan = () => {
    const r = box.querySelector('#uRole').value;
    box.querySelector('#uCan').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px">
      ${CAN[r].can.map(c => `<span class="tag green">✓ ${c}</span>`).join('')}
      ${CAN[r].cant.map(c => `<span class="tag red">✕ ${c}</span>`).join('')}</div>`;
  };
  box.querySelector('#uRole').onchange = drawCan; drawCan();
  box.querySelector('#mClose').onclick = box.querySelector('#mNo').onclick = closeModal;

  box.querySelector('#mOk').onclick = async () => {
    const btn = box.querySelector('#mOk');
    const name = box.querySelector('#uName').value.trim();
    const role = box.querySelector('#uRole').value;
    if (!name) { toast('กรอกชื่อที่แสดง', 'err'); return; }
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try {
      if (isNew) {
        const email = box.querySelector('#uMail').value.trim();
        const password = box.querySelector('#uPass').value;
        if (!email || !password) throw new Error('กรอกอีเมลและรหัสผ่านให้ครบ');
        await invoke('create-user', { email, password, display_name: name, role });
        toast('สร้างบัญชี <b>' + esc(name) + '</b> แล้ว', 'ok');
      } else {
        const { error } = await client().from('profiles').update({
          display_name: name, role, is_active: box.querySelector('#uActive').checked,
        }).eq('id', existing.id);
        if (error) throw new Error(error.message);
        toast('บันทึกแล้ว', 'ok');
      }
      closeModal(); location.reload();
    } catch (e) {
      toast(esc(e.message), 'err');
      btn.disabled = false; btn.textContent = isNew ? 'สร้างบัญชี' : 'บันทึก';
    }
  };
}

function resetPassword(u) {
  openModal(`
    <div class="modal-head"><h3>ตั้งรหัสผ่านใหม่ · ${esc(u.display_name)}</h3>
      <button class="x" id="mClose">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label>
        <input class="inp" id="rpPass" type="text" autofocus></div>
      <div class="notice warn">ตั้งเสร็จแล้วบอกรหัสใหม่กับเจ้าตัวด้วย ระบบไม่ได้ส่งอีเมลแจ้ง</div>
    </div>
    <div class="modal-foot"><button class="btn ghost" id="mNo">ยกเลิก</button>
      <button class="btn gold" id="mOk">ตั้งรหัสผ่าน</button></div>`);
  const box = document.getElementById('modalBox');
  box.querySelector('#mClose').onclick = box.querySelector('#mNo').onclick = closeModal;
  box.querySelector('#mOk').onclick = async () => {
    const password = box.querySelector('#rpPass').value;
    try {
      await invoke('create-user', { action: 'reset_password', user_id: u.id, password });
      closeModal(); toast('ตั้งรหัสผ่านใหม่แล้ว', 'ok');
    } catch (e) { toast(esc(e.message), 'err'); }
  };
}

function removeUser(u) {
  openModal(`
    <div class="modal-head"><h3>ลบบัญชี ${esc(u.display_name)}</h3><button class="x" id="mClose">✕</button></div>
    <div class="modal-body">
      <div class="notice red">บัญชีนี้จะเข้าระบบไม่ได้อีก · <b>บิลและประวัติที่เคยทำไว้ยังอยู่ครบ</b>
        ไม่ได้ถูกลบไปด้วย<br><br>ถ้าแค่ให้พนักงานหยุดใช้ชั่วคราว แนะนำให้ปิดใช้งานบัญชีแทนการลบ</div>
    </div>
    <div class="modal-foot"><button class="btn ghost" id="mNo">ไม่ลบ</button>
      <button class="btn danger" id="mOk">ยืนยันลบบัญชี</button></div>`);
  const box = document.getElementById('modalBox');
  box.querySelector('#mClose').onclick = box.querySelector('#mNo').onclick = closeModal;
  box.querySelector('#mOk').onclick = async () => {
    try {
      await invoke('create-user', { action: 'delete', user_id: u.id });
      closeModal(); toast('ลบบัญชีแล้ว'); location.reload();
    } catch (e) { toast(esc(e.message), 'err'); }
  };
}

export const usersPage = {
  async render() {
    await load();
    const me = currentProfile();
    const amOwner = me && me.role === 'owner';

    if (!hasBackend()) return `
      <div class="page-head"><div><h1>ผู้ใช้งานและสิทธิ์</h1>
        <p>จัดการบัญชีพนักงาน ระดับสิทธิ์ และรหัสผ่าน</p></div></div>
      <div class="card" style="max-width:640px">
        <div class="card-title"><span class="ic">🔌</span> ต้องต่อฐานข้อมูลกลางก่อน</div>
        <p style="font-size:14px;color:var(--muted);line-height:1.75;margin:0 0 14px">
          บัญชีผู้ใช้จริงเก็บอยู่บนเซิร์ฟเวอร์ ไม่ได้เก็บในเครื่อง เพราะพนักงานต้องล็อกอิน
          จากคนละเครื่องได้ และเพราะการกันไม่ให้พนักงานเห็นต้นทุนต้องบังคับที่ฐานข้อมูล
          ไม่ใช่ที่หน้าจอ<br><br>
          ตอนนี้ระบบยังอยู่ในโหมดทดลอง ใช้ปุ่มสลับสิทธิ์ที่มุมขวาบนเพื่อดูความต่างของแต่ละสิทธิ์ไปก่อนได้
        </p>
        <div class="notice info">ขั้นตอนต่อฐานข้อมูลอยู่ในไฟล์ <b>docs/supabase-setup.md</b>
          และขั้นตอนติดตั้งฟังก์ชันสร้างบัญชีอยู่ใน <b>docs/edge-functions.md</b></div>
      </div>
      <div class="card" style="margin-top:14px">
        <div class="card-title"><span class="ic">👥</span> สิทธิ์ทั้งสามระดับ</div>
        ${Object.keys(ROLE_NAME).map(r => `<div style="padding:12px 0;border-bottom:1px solid var(--line)">
          <b style="font-weight:500;font-size:13.5px">${ROLE_ICON[r]} ${ROLE_NAME[r]}</b>
          <div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:5px">
            ${CAN[r].can.map(c => `<span class="tag green">✓ ${c}</span>`).join('')}
            ${CAN[r].cant.map(c => `<span class="tag red">✕ ${c}</span>`).join('')}</div></div>`).join('')}
      </div>
      ${historyCard()}`;

    return `
    <div class="page-head">
      <div><h1>ผู้ใช้งานและสิทธิ์</h1><p>${list.length} บัญชีในระบบ</p></div>
      <div class="spacer"></div>
      ${amOwner ? '<button class="btn gold" id="usAdd">+ เพิ่มผู้ใช้งาน</button>' : ''}
    </div>
    ${amOwner ? '' : '<div class="notice info">🔒 ดูได้อย่างเดียว · จัดการบัญชีได้เฉพาะสิทธิ์เจ้าของร้าน</div>'}
    <div class="card tight"><div class="tbl-wrap"><table>
      <thead><tr><th>ชื่อ</th><th>ระดับสิทธิ์</th><th>สถานะ</th><th>เพิ่มเมื่อ</th><th></th></tr></thead>
      <tbody>${list.map(u => `<tr style="${u.is_active === false ? 'opacity:.5' : ''}">
        <td><b style="font-weight:500">${esc(u.display_name)}</b>
          ${u.id === (currentUser() || {}).id ? ' <span class="tag gold">คุณ</span>' : ''}</td>
        <td>${ROLE_ICON[u.role]} ${ROLE_NAME[u.role] || u.role}</td>
        <td>${u.is_active === false ? '<span class="tag red">ปิดใช้งาน</span>' : '<span class="tag green">ใช้งานอยู่</span>'}</td>
        <td class="mini">${u.created_at ? new Date(u.created_at).toLocaleDateString('th-TH') : '-'}</td>
        <td class="num">${amOwner ? `
          <button class="btn sm" data-edit="${u.id}">แก้ไข</button>
          <button class="btn sm" data-pw="${u.id}">รหัสผ่าน</button>
          ${u.id === (currentUser() || {}).id ? '' : `<button class="btn sm danger" data-del="${u.id}">ลบ</button>`}
        ` : ''}</td>
      </tr>`).join('')}</tbody></table></div></div>
    <div class="notice warn" style="margin-top:14px">⚠️ การลบบัญชีไม่ได้ลบบิลหรือประวัติที่คนนั้นเคยทำไว้
      ทุกอย่างยังตรวจย้อนหลังได้ครบ · ถ้าแค่ให้หยุดใช้ชั่วคราว ใช้วิธีปิดใช้งานบัญชีแทน</div>
    ${historyCard()}`;
  },

  mount(el) {
    const add = el.querySelector('#usAdd');
    if (add) add.onclick = () => userForm(null);
    el.addEventListener('click', e => {
      const f = k => e.target.closest('[data-' + k + ']');
      const ed = f('edit'), pw = f('pw'), dl = f('del');
      if (ed) userForm(list.find(u => u.id === ed.dataset.edit));
      if (pw) resetPassword(list.find(u => u.id === pw.dataset.pw));
      if (dl) removeUser(list.find(u => u.id === dl.dataset.del));
    });
  },
};
