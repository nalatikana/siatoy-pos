/* ตั้งค่าระบบ · ตอนนี้ค่าทั้งหมดเก็บในเครื่องนี้ (ตาราง meta)
 * เมื่อต่อฐานข้อมูลกลางแล้วจะย้ายไปตาราง settings ให้ทุกเครื่องใช้ค่าเดียวกัน
 * ยกเว้น "จุดขายของเครื่องนี้" ที่ต้องแยกตามเครื่องเสมอ
 */
import { CONFIG, hasBackend } from '../config.js';
import { esc, money, toast, openModal, closeModal, uuid } from '../lib/util.js';
import { db, saveSetting, currentLocation, setLocation, deviceId, pendingCount, wipeLocal } from '../lib/store.js';
import { encode128, padEven } from '../lib/code128.js';
import { S } from '../lib/state.js';

const ROLES = [
  { r: 'พนักงานหน้าร้าน', ico: '👤', key: 'admin',
    can: ['ทำบิล / รับเงิน', 'สแกนรับเข้า-ตัดออก', 'ดูสต๊อกคงเหลือ', 'พิมพ์บาร์โค้ด'],
    cant: ['ดูราคาต้นทุน', 'ยกเลิกบิล', 'ดูรายงานกำไร', 'แก้ราคาสินค้า'] },
  { r: 'หัวหน้างาน', ico: '🛡️', key: 'sup',
    can: ['ทุกอย่างของพนักงาน', 'อนุมัติยกเลิกบิล', 'ดูต้นทุนและกำไร', 'แก้ราคาและข้อมูลสินค้า', 'กระทบยอดธนาคาร'],
    cant: ['เปิดการ์ดโดยไม่รับเงิน'] },
  { r: 'เจ้าของร้าน', ico: '👑', key: 'owner',
    can: ['เห็นทุกอย่าง', 'เปิดการ์ดโดยไม่รับเงิน', 'อนุมัติขั้นสุดท้าย'], cant: [] },
];

/* ตัวอย่างผลของค่า dpi ต่อบาร์โค้ดจริง ใช้รหัสตัวอย่างความยาวเท่าของร้าน */
function dpiExample(dpi) {
  const data = padEven('8859002');
  const { modules } = encode128(data);
  const dot = 25.4 / dpi;
  const dots = Math.floor((30 - 1.6) / (modules + 20) / dot);
  return { dots, mm: dots * dot, ok: dots >= 2 };
}

export const settingsPage = {
  async render() {
    const loc = await currentLocation();
    const locs = await db.locations.toArray();
    const dev  = await deviceId();
    const pend = await pendingCount();
    const bills = await db.sales.count();

    return `
    <div class="page-head"><div><h1>ตั้งค่าระบบ</h1>
      <p>ค่าทั้งหมดยังเก็บในเครื่องนี้ · ย้ายขึ้นเซิร์ฟเวอร์เมื่อต่อฐานข้อมูลแล้ว</p></div></div>
    <div class="grid g2" style="align-items:start">
      <div>
        <div class="card">
          <div class="card-title"><span class="ic">🏪</span> ร้านและจุดขาย</div>
          <div class="field"><label>ชื่อร้าน (แสดงบนสติกเกอร์)</label>
            <input class="inp" id="setShop" value="${esc(CONFIG.shopName)}"></div>
          <div class="field"><label>จุดขายของเครื่องนี้</label>
            <select class="inp" id="setLoc">
              ${locs.map(l => `<option value="${l.id}" ${l.id === loc.id ? 'selected' : ''}>
                ${l.kind === 'event' ? '🎪' : '🏪'} ${esc(l.name)} (${esc(l.code)})</option>`).join('')}
            </select></div>
          <div class="notice info" style="margin:0">เครื่องแต่ละเครื่องตั้งจุดขายของตัวเอง
            บิลและการเดินของจะถูกบันทึกเข้าจุดขายนี้ ทำให้แยกยอดหน้าร้านกับบูธงานออกจากกันได้</div>
          <button class="btn block" style="margin-top:12px" id="setAddLoc">+ เพิ่มจุดขาย (บูธงานใหม่)</button>
        </div>

        <div class="card" style="margin-top:14px">
          <div class="card-title"><span class="ic">🖨️</span> เครื่องพิมพ์สติกเกอร์</div>
          <div class="field"><label>ความละเอียด (ดูได้จากค่ากำหนดลักษณะการพิมพ์ของ ES-9960 ใน Windows)</label>
            <div class="seg" id="setDpi">
              ${[203, 300].map(d => `<button class="${CONFIG.printerDpi === d ? 'on' : ''}" data-dpi="${d}">${d} dpi</button>`).join('')}
            </div></div>
          <div id="dpiInfo"></div>
        </div>

        <div class="card" style="margin-top:14px">
          <div class="card-title"><span class="ic">💳</span> การชำระเงินและแต้ม</div>
          <div class="field"><label>ค่าธรรมเนียมบัตรเครดิต (%)</label>
            <input class="inp" id="setFee" type="number" step="0.5" value="${CONFIG.creditFee}"></div>
          <div class="field" style="margin:0"><label>อัตราสะสมแต้ม (ทุกกี่บาทได้ 1 แต้ม)</label>
            <input class="inp" id="setPoint" type="number" value="${CONFIG.pointRate}"></div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title"><span class="ic">👥</span> สิทธิ์ผู้ใช้งาน</div>
          <div class="notice warn">ตอนนี้ปุ่มสลับสิทธิ์มุมขวาบนเป็นของชั่วคราวไว้ทดลองดูความต่าง
            ยังไม่มีการล็อกอินจริง ของจริงจะบังคับที่ฐานข้อมูลด้วย เมื่อต่อ Supabase แล้ว
            ต้นทุนจะไม่ถูกส่งมาถึงเครื่องพนักงานเลยตั้งแต่แรก</div>
          ${ROLES.map(x => `<div style="padding:12px 0;border-bottom:1px solid var(--line)">
            <div class="flex"><b style="font-weight:500;font-size:13.5px">${x.ico} ${x.r}</b>
              ${S.role === x.key ? '<span class="right tag green">กำลังใช้อยู่</span>' : ''}</div>
            <div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:5px">
              ${x.can.map(c => `<span class="tag green">✓ ${c}</span>`).join('')}
              ${x.cant.map(c => `<span class="tag red">✕ ${c}</span>`).join('')}
            </div></div>`).join('')}
        </div>

        <div class="card" style="margin-top:14px">
          <div class="card-title"><span class="ic">💾</span> ข้อมูลในเครื่องนี้</div>
          <div class="flex" style="padding:8px 0;border-bottom:1px solid var(--line);font-size:13px">
            <span>รหัสเครื่อง</span><b class="right" style="font-weight:400">${esc(dev)}</b></div>
          <div class="flex" style="padding:8px 0;border-bottom:1px solid var(--line);font-size:13px">
            <span>บิลที่บันทึกไว้</span><b class="right" style="font-weight:400">${bills} ใบ</b></div>
          <div class="flex" style="padding:8px 0;border-bottom:1px solid var(--line);font-size:13px">
            <span>รอส่งขึ้นเซิร์ฟเวอร์</span>
            <b class="right" style="font-weight:400;color:${pend ? 'var(--warn)' : 'var(--green)'}">${pend} รายการ</b></div>
          <div class="flex" style="padding:8px 0;font-size:13px">
            <span>ฐานข้อมูลกลาง</span>
            <b class="right" style="font-weight:400">${hasBackend() ? '<span class="tag green">ต่อแล้ว</span>' : '<span class="tag warn">ยังไม่ได้ต่อ</span>'}</b></div>
        </div>

        <div class="card" style="margin-top:14px;border-color:var(--red)">
          <div class="card-title"><span class="ic">⚠️</span> ล้างข้อมูลทดลอง</div>
          <p style="font-size:13px;color:var(--muted);line-height:1.7;margin:0 0 12px">
            ลบทุกอย่างในเครื่องนี้แล้วเริ่มใหม่ด้วยข้อมูลตัวอย่างชุดเดิม
            ใช้ตอนจะเริ่มใช้งานจริง หรือเวลาทดลองจนข้อมูลรก
            <b>บิลที่ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์จะหายไปด้วย</b></p>
          <button class="btn danger block" id="setWipe">ล้างข้อมูลในเครื่องนี้ทั้งหมด</button>
        </div>
      </div>
    </div>`;
  },

  mount(el) {
    const drawDpi = () => {
      const e = dpiExample(CONFIG.printerDpi);
      el.querySelector('#dpiInfo').innerHTML = `
        <div class="notice ${e.ok ? 'info' : 'red'}" style="margin:0">
          ที่ ${CONFIG.printerDpi} dpi หนึ่งจุดกว้าง ${(25.4 / CONFIG.printerDpi).toFixed(4)} มม.<br>
          รหัส 7 หลักบนดวง 30 × 20 มม. จะได้แท่งบางสุด <b>${e.dots} จุด = ${e.mm.toFixed(3)} มม.</b>
          ${e.ok ? 'ซึ่งอยู่ในเกณฑ์ที่เครื่องยิงอ่านได้สบาย' : 'ซึ่งถี่เกินไป ควรใช้ดวงใหญ่ขึ้น'}
        </div>`;
    };
    drawDpi();

    el.querySelector('#setShop').onchange = async e => {
      await saveSetting(CONFIG, 'shopName', e.target.value.trim() || 'Siatoy TCG');
      toast('บันทึกชื่อร้านแล้ว', 'ok');
    };
    el.querySelector('#setFee').onchange = async e => {
      await saveSetting(CONFIG, 'creditFee', Number(e.target.value) || 0);
      toast('ค่าธรรมเนียมบัตร = ' + CONFIG.creditFee + '%', 'ok');
    };
    el.querySelector('#setPoint').onchange = async e => {
      await saveSetting(CONFIG, 'pointRate', Number(e.target.value) || 100);
      toast('ทุก ' + CONFIG.pointRate + ' บาท = 1 แต้ม', 'ok');
    };
    el.querySelector('#setLoc').onchange = async e => {
      await setLocation(e.target.value);
      toast('เปลี่ยนจุดขายของเครื่องนี้แล้ว', 'ok');
      location.reload();
    };
    el.querySelector('#setDpi').onclick = async e => {
      const b = e.target.closest('[data-dpi]'); if (!b) return;
      await saveSetting(CONFIG, 'printerDpi', Number(b.dataset.dpi));
      el.querySelectorAll('[data-dpi]').forEach(x =>
        x.classList.toggle('on', Number(x.dataset.dpi) === CONFIG.printerDpi));
      drawDpi();
      toast('ตั้งความละเอียดเครื่องพิมพ์เป็น ' + CONFIG.printerDpi + ' dpi', 'ok');
    };

    el.querySelector('#setAddLoc').onclick = () => {
      openModal(`
        <div class="modal-head"><h3>เพิ่มจุดขาย</h3><button class="x" id="mClose">✕</button></div>
        <div class="modal-body">
          <div class="field"><label>ชื่อจุดขาย</label>
            <input class="inp" id="nlName" placeholder="เช่น บูธ Bangkok TCG Fest"></div>
          <div class="field"><label>รหัสสั้น (ใช้ในเลขบิล ตัวอักษรอังกฤษ/ตัวเลข)</label>
            <input class="inp" id="nlCode" placeholder="เช่น FEST02"></div>
          <div class="field" style="margin:0"><label>ประเภท</label>
            <select class="inp" id="nlKind"><option value="event">บูธงานอีเวนต์</option>
              <option value="shop">หน้าร้าน / สาขา</option></select></div>
        </div>
        <div class="modal-foot"><button class="btn ghost" id="mNo">ยกเลิก</button>
          <button class="btn gold" id="mOk">เพิ่ม</button></div>`);
      const box = document.getElementById('modalBox');
      box.querySelector('#mClose').onclick = box.querySelector('#mNo').onclick = closeModal;
      box.querySelector('#mOk').onclick = async () => {
        const name = box.querySelector('#nlName').value.trim();
        const code = box.querySelector('#nlCode').value.trim().toUpperCase();
        if (!name || !code) { toast('กรอกชื่อและรหัสให้ครบ', 'err'); return; }
        await db.locations.put({ id: 'loc-' + code.toLowerCase(), code, name,
          kind: box.querySelector('#nlKind').value });
        closeModal(); toast('เพิ่มจุดขาย ' + esc(name) + ' แล้ว', 'ok');
        location.reload();
      };
    };

    el.querySelector('#setWipe').onclick = () => {
      openModal(`
        <div class="modal-head"><h3>ล้างข้อมูลในเครื่องนี้</h3><button class="x" id="mClose">✕</button></div>
        <div class="modal-body">
          <div class="notice red">การกระทำนี้ย้อนกลับไม่ได้ บิลที่ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์จะหายทั้งหมด<br>
            พิมพ์คำว่า <b>ล้าง</b> ในช่องด้านล่างเพื่อยืนยัน</div>
          <div class="field" style="margin-top:14px"><input class="inp" id="wipeKey" placeholder="ล้าง"></div>
        </div>
        <div class="modal-foot"><button class="btn ghost" id="mNo">ยกเลิก</button>
          <button class="btn danger" id="mOk">ล้างข้อมูล</button></div>`);
      const box = document.getElementById('modalBox');
      box.querySelector('#mClose').onclick = box.querySelector('#mNo').onclick = closeModal;
      box.querySelector('#mOk').onclick = async () => {
        if (box.querySelector('#wipeKey').value.trim() !== 'ล้าง') {
          toast('พิมพ์คำว่า ล้าง เพื่อยืนยัน', 'err'); return;
        }
        await wipeLocal(); closeModal(); location.reload();
      };
    };
  },
};
