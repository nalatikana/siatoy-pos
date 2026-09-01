/* สมาชิก & แต้มสะสม */
import { CONFIG } from '../config.js';
import { money, esc, uuid, toast, openModal, closeModal } from '../lib/util.js';
import { db } from '../lib/store.js';

let members = [], spendBy = new Map();

async function load() {
  members = await db.members.toArray();
  spendBy = new Map();
  (await db.sales.toArray()).filter(s => s.status === 'normal' && s.member_id).forEach(s => {
    const c = spendBy.get(s.member_id) || { amount: 0, bills: 0 };
    c.amount += s.total; c.bills++;
    spendBy.set(s.member_id, c);
  });
}

async function history(id) {
  const m = members.find(x => x.id === id);
  const list = (await db.sales.toArray())
    .filter(s => s.member_id === id)
    .sort((a, b) => b.client_created_at.localeCompare(a.client_created_at));
  openModal(`
    <div class="modal-head"><h3>ประวัติการซื้อ · ${esc(m.name)}</h3><button class="x" id="mClose">✕</button></div>
    <div class="modal-body">
      <div class="mini" style="margin-bottom:12px">${esc(m.code)} · ${esc(m.tel || '-')} ·
        ${money(m.points)} แต้ม · ระดับ ${esc(m.tier)}</div>
      ${list.length ? list.map(s => `<div class="ci"><div class="info">
        <div class="nm">${esc(s.bill_no)}${s.status === 'void' ? ' <span class="tag red">ยกเลิก</span>' : ''}</div>
        <div class="meta">${new Date(s.client_created_at).toLocaleString('th-TH')} · ${s.item_count} ชิ้น</div></div>
        <div style="align-self:center;color:var(--gold2)">฿ ${money(s.total)}</div></div>`).join('')
        : '<div class="cart-empty"><span class="big">🧾</span>ยังไม่มีประวัติการซื้อในระบบนี้</div>'}
    </div>
    <div class="modal-foot"><button class="btn ghost" id="mNo">ปิด</button></div>`, true);
  const box = document.getElementById('modalBox');
  box.querySelector('#mClose').onclick = box.querySelector('#mNo').onclick = closeModal;
}

function addMember() {
  openModal(`
    <div class="modal-head"><h3>เพิ่มสมาชิก</h3><button class="x" id="mClose">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>ชื่อ</label><input class="inp" id="nmName"></div>
      <div class="field"><label>เบอร์โทรศัพท์ (ใช้ค้นหาตอนคิดเงิน)</label>
        <input class="inp" id="nmTel" inputmode="numeric"></div>
      <div class="field" style="margin:0"><label>ระดับ</label>
        <select class="inp" id="nmTier"><option>ทั่วไป</option><option>เงิน</option><option>ทอง</option></select></div>
    </div>
    <div class="modal-foot"><button class="btn ghost" id="mNo">ยกเลิก</button>
      <button class="btn gold" id="mOk">เพิ่ม</button></div>`);
  const box = document.getElementById('modalBox');
  box.querySelector('#mClose').onclick = box.querySelector('#mNo').onclick = closeModal;
  box.querySelector('#mOk').onclick = async () => {
    const name = box.querySelector('#nmName').value.trim();
    const tel  = box.querySelector('#nmTel').value.trim();
    if (!name || !tel) { toast('กรอกชื่อและเบอร์โทรให้ครบ', 'err'); return; }
    if (await db.members.where('tel').equals(tel).first()) { toast('เบอร์นี้มีสมาชิกอยู่แล้ว', 'err'); return; }
    const n = (await db.members.count()) + 1;
    await db.members.put({ id: uuid(), code: 'M' + String(n).padStart(3, '0'), name, tel,
      tier: box.querySelector('#nmTier').value, points: 0, total_spend: 0,
      created_at: new Date().toISOString() });
    closeModal(); location.reload();
  };
}

export const membersPage = {
  async render() {
    await load();
    return `
    <div class="page-head">
      <div><h1>สมาชิก &amp; แต้มสะสม</h1>
        <p>บันทึกลูกค้าด้วยรหัสสมาชิกหรือเบอร์โทรตอนคิดเงิน · ทุก ${CONFIG.pointRate} บาท = 1 แต้ม</p></div>
      <div class="spacer"></div><button class="btn gold" id="memAdd">+ เพิ่มสมาชิก</button>
    </div>
    <div class="grid g3" style="margin-bottom:16px">
      <div class="stat"><div class="lbl">สมาชิกทั้งหมด</div><div class="val">${members.length}</div></div>
      <div class="stat"><div class="lbl">แต้มสะสมคงค้าง</div>
        <div class="val g">${money(members.reduce((a, m) => a + m.points, 0))}</div>
        <div class="sub">ยังไม่เปิดให้แลก</div></div>
      <div class="stat"><div class="lbl">ยอดซื้อที่บันทึกในระบบนี้</div>
        <div class="val">฿ ${money([...spendBy.values()].reduce((a, c) => a + c.amount, 0))}</div>
        <div class="sub">${[...spendBy.values()].reduce((a, c) => a + c.bills, 0)} บิล</div></div>
    </div>
    <div class="notice info" style="margin-bottom:14px">💡 ระบบสะสมแต้มเตรียมไว้แล้ว
      แต่ยังไม่เปิดให้แลก · ปรับอัตราสะสมได้ที่หน้าตั้งค่าระบบ</div>
    <div class="card tight"><div class="tbl-wrap"><table>
      <thead><tr><th>รหัส</th><th>ชื่อ</th><th>เบอร์โทร</th><th>ระดับ</th>
        <th class="num">แต้ม</th><th class="num">ยอดซื้อในระบบนี้</th><th></th></tr></thead>
      <tbody>${members.map(m => {
        const c = spendBy.get(m.id) || { amount: 0, bills: 0 };
        return `<tr><td>${esc(m.code)}</td><td>${esc(m.name)}</td><td>${esc(m.tel || '-')}</td>
          <td><span class="tag gold">${esc(m.tier)}</span></td>
          <td class="num">${money(m.points)}</td>
          <td class="num">฿ ${money(c.amount)}<div class="mini">${c.bills} บิล</div></td>
          <td class="num"><button class="btn sm" data-hist="${m.id}">ประวัติ</button></td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  },
  mount(el) {
    el.querySelector('#memAdd').onclick = addMember;
    el.addEventListener('click', e => {
      const h = e.target.closest('[data-hist]'); if (h) history(h.dataset.hist);
    });
  },
};
