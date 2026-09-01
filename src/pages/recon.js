/* กระทบยอดธนาคาร
 * นำเข้าไฟล์ statement แล้วจับคู่กับบิลที่ชำระด้วยการโอน
 * คัดเฉพาะรายการที่ยอดไม่ตรงหรือหาบิลคู่ไม่เจอมาให้ตรวจ ไม่ต้องไล่ดูทีละบรรทัด
 */
import { money, esc, uuid, toast, openModal, closeModal, redrawPage } from '../lib/util.js';
import { db } from '../lib/store.js';
import { parseCSV, toAmount, toDate, guessColumns } from '../lib/csv.js';

const WINDOW_MIN = 90;          // ยอมให้เวลาโอนต่างจากเวลาออกบิลได้เท่าไหร่ (นาที)
const TOL_PCT = 0.3;            // ถ้ายอดต่างกันเกินเท่านี้ ถือว่าคนละรายการ ไม่ใช่ยอดไม่ตรง
const TOL_ABS = 2000;
let lines = [], matches = new Map(), sales = [];

async function load() {
  lines = (await db.bank_lines.toArray()).sort((a, b) => b.txn_time.localeCompare(a.txn_time));
  sales = (await db.sales.toArray()).filter(s => s.status === 'normal' && s.payment === 'transfer');
  matches = new Map((await db.recon.toArray()).map(m => [m.bank_line_id, m]));
}

/* จับคู่อัตโนมัติ : ยอดตรงและเวลาใกล้กันที่สุดก่อน แล้วค่อยหาที่ยอดใกล้เคียง */
async function autoMatch() {
  await load();                    // ต้องโหลดใหม่ก่อนเสมอ ไม่งั้นตอนเพิ่งนำเข้าไฟล์
                                   // ตัวแปร lines จะยังเป็นชุดเก่าที่ว่างอยู่ แล้วจับคู่ไม่ได้เลย
  const used = new Set([...matches.values()].map(m => m.sale_id).filter(Boolean));
  const out = [];
  for (const l of lines) {
    if (matches.get(l.id) && matches.get(l.id).status === 'resolved') continue;
    const t = new Date(l.txn_time).getTime();
    const near = sales.filter(s => !used.has(s.id) &&
      Math.abs(new Date(s.client_created_at).getTime() - t) <= WINDOW_MIN * 60000);
    const exact = near.filter(s => Math.abs(s.total - l.amount) < 0.01)
      .sort((a, b) => Math.abs(new Date(a.client_created_at) - t) - Math.abs(new Date(b.client_created_at) - t))[0];
    const close = exact || near.sort((a, b) => Math.abs(a.total - l.amount) - Math.abs(b.total - l.amount))[0];
    let rec;
    // ยอดต่างกันนิดหน่อย = น่าจะบิลเดียวกันแต่ลืมกดส่วนลด
    // ยอดต่างกันมาก = คนละรายการ อย่าจับคู่มั่วให้คนตรวจสับสน
    const near_enough = close &&
      Math.abs(l.amount - close.total) <= Math.min(TOL_ABS, l.amount * TOL_PCT);
    if (exact) { used.add(exact.id); rec = { sale_id: exact.id, diff: 0, status: 'ok' }; }
    else if (near_enough) { used.add(close.id); rec = { sale_id: close.id, diff: l.amount - close.total, status: 'diff' }; }
    else rec = { sale_id: null, diff: l.amount, status: 'none' };
    out.push({ id: matches.get(l.id)?.id || uuid(), bank_line_id: l.id, ...rec });
  }
  await db.recon.bulkPut(out);
  await load();
}

function importCSV(el) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.csv,.txt,text/csv';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const rows = parseCSV(await f.text());
    if (rows.length < 2) { toast('ไฟล์ว่างหรืออ่านไม่ออก', 'err'); return; }
    const header = rows[0], col = guessColumns(header);
    openModal(`
      <div class="modal-head"><h3>นำเข้า statement · ${esc(f.name)}</h3>
        <button class="x" id="mClose">✕</button></div>
      <div class="modal-body">
        <div class="notice info">พบ ${rows.length - 1} บรรทัด · ตรวจว่าระบบเดาคอลัมน์ถูกไหม
          ถ้าไม่ถูกเลือกใหม่ได้</div>
        <div class="grid g3" style="gap:9px;margin-top:14px">
          ${[['date','วันที่/เวลา'],['amount','จำนวนเงินเข้า'],['ref','รายละเอียด/อ้างอิง']].map(([k, n]) =>
            `<div class="field" style="margin:0"><label>${n}</label>
              <select class="inp" id="c_${k}">
                ${header.map((h, i) => `<option value="${i}" ${col[k] === i ? 'selected' : ''}>
                  ${esc(String(h).slice(0, 24) || 'คอลัมน์ ' + (i + 1))}</option>`).join('')}
              </select></div>`).join('')}
        </div>
        <div class="card tight" style="margin-top:14px;background:var(--bg2)"><div class="tbl-wrap">
          <table><thead><tr>${header.map(h => `<th>${esc(String(h).slice(0, 18))}</th>`).join('')}</tr></thead>
          <tbody>${rows.slice(1, 6).map(r => `<tr>${r.map(c =>
            `<td class="mini">${esc(String(c).slice(0, 22))}</td>`).join('')}</tr>`).join('')}</tbody></table>
        </div></div>
      </div>
      <div class="modal-foot"><button class="btn ghost" id="mNo">ยกเลิก</button>
        <button class="btn gold" id="mOk">นำเข้าและจับคู่</button></div>`, true);
    const box = document.getElementById('modalBox');
    box.querySelector('#mClose').onclick = box.querySelector('#mNo').onclick = closeModal;
    box.querySelector('#mOk').onclick = async () => {
      const ci = k => Number(box.querySelector('#c_' + k).value);
      const out = [];
      for (const r of rows.slice(1)) {
        const amt = toAmount(r[ci('amount')]);
        const dt  = toDate(r[ci('date')]);
        if (!amt || amt <= 0 || !dt) continue;                 // ข้ามเงินออกและบรรทัดที่อ่านไม่ออก
        const ref = String(r[ci('ref')] || '').trim();
        out.push({ id: 'bk-' + dt.getTime() + '-' + amt + '-' + ref.slice(0, 12),
                   txn_time: dt.toISOString(), amount: amt, ref, imported_at: new Date().toISOString() });
      }
      if (!out.length) { toast('อ่านรายการเงินเข้าไม่ได้เลย ลองเลือกคอลัมน์ใหม่', 'err'); return; }
      await db.bank_lines.bulkPut(out);
      closeModal();
      toast('นำเข้า ' + out.length + ' รายการ · กำลังจับคู่', 'ok');
      await autoMatch();
      await redrawPage(el, reconPage);
    };
  };
  inp.click();
}

function resolve(id, el) {
  const l = lines.find(x => x.id === id);
  const m = matches.get(id) || {};
  const s = m.sale_id ? sales.find(x => x.id === m.sale_id) : null;
  openModal(`
    <div class="modal-head"><h3>ตรวจสอบรายการ ${new Date(l.txn_time).toLocaleString('th-TH')}</h3>
      <button class="x" id="mClose">✕</button></div>
    <div class="modal-body">
      <div class="grid g2" style="gap:12px;margin-bottom:14px">
        <div class="card" style="background:var(--bg2)"><div class="mini">ยอดเงินเข้าจริง (ธนาคาร)</div>
          <div style="font-size:25px;font-weight:500">฿ ${money(l.amount)}</div>
          <div class="mini">${esc(l.ref || '-')}</div></div>
        <div class="card" style="background:var(--bg2)"><div class="mini">ยอดในระบบ</div>
          <div style="font-size:25px;font-weight:500;color:${m.diff ? 'var(--red)' : 'inherit'}">
            ฿ ${money(s ? s.total : 0)}</div>
          <div class="mini">${s ? esc(s.bill_no) : 'ไม่พบบิลคู่'}</div></div>
      </div>
      ${m.status === 'diff'
        ? `<div class="notice warn">ส่วนต่าง <b>${money(Math.abs(m.diff))} ฿</b> —
             กรณีที่พบบ่อยคือลูกค้าต่อราคาหน้าร้านแล้วพนักงานลืมกดส่วนลดในระบบ</div>`
        : `<div class="notice red">ไม่พบบิลขายที่ตรงกับยอดนี้ อาจเป็นเงินโอนที่ยังไม่ได้ออกบิล
             หรือไม่ใช่ยอดขาย</div>`}
      <div class="field" style="margin-top:14px"><label>ผูกกับบิลอื่นด้วยตนเอง</label>
        <select class="inp" id="rcSale"><option value="">— ไม่ผูก —</option>
          ${sales.map(x => `<option value="${x.id}" ${m.sale_id === x.id ? 'selected' : ''}>
            ${esc(x.bill_no)} · ฿${money(x.total)} · ${new Date(x.client_created_at).toTimeString().slice(0,5)}</option>`).join('')}
        </select></div>
      <div class="field"><label>วิธีจัดการ</label>
        <select class="inp" id="rcHow">
          <option>บันทึกเป็นส่วนลดย้อนหลัง (ให้หัวหน้าอนุมัติ)</option>
          <option>ผูกกับบิลที่เลือกด้านบน</option>
          <option>บันทึกเป็นรายรับอื่น ไม่ใช่ยอดขาย</option>
          <option>ตรวจแล้ว ไม่ต้องแก้</option>
        </select></div>
      <div class="field" style="margin:0"><label>บันทึกเพิ่มเติม</label>
        <input class="inp" id="rcNote" placeholder="เช่น ลูกค้าโอนขาด 100 ยังไม่ได้ตาม"></div>
    </div>
    <div class="modal-foot"><button class="btn ghost" id="mNo">ปิด</button>
      <button class="btn gold" id="mOk">บันทึกว่าตรวจแล้ว</button></div>`, true);
  const box = document.getElementById('modalBox');
  box.querySelector('#mClose').onclick = box.querySelector('#mNo').onclick = closeModal;
  box.querySelector('#mOk').onclick = async () => {
    const saleId = box.querySelector('#rcSale').value || null;
    const sale = saleId ? sales.find(x => x.id === saleId) : null;
    await db.recon.put({ id: m.id || uuid(), bank_line_id: id, sale_id: saleId,
      diff: sale ? l.amount - sale.total : l.amount, status: 'resolved',
      resolution: box.querySelector('#rcHow').value,
      note: box.querySelector('#rcNote').value.trim(),
      resolved_at: new Date().toISOString() });
    closeModal(); toast('บันทึกการตรวจสอบแล้ว', 'ok');
    await load(); await redrawPage(el, reconPage);
  };
}

export const reconPage = {
  async render() {
    await load();
    const st = k => lines.filter(l => (matches.get(l.id) || {}).status === k).length;
    const todo = lines.filter(l => {
      const m = matches.get(l.id) || {}; return m.status === 'diff' || m.status === 'none';
    });
    return `
    <div class="page-head">
      <div><h1>กระทบยอดธนาคาร</h1>
        <p>นำเข้าไฟล์ statement แล้วจับคู่กับบิลที่ชำระด้วยการโอนอัตโนมัติ</p></div>
      <div class="spacer"></div>
      <div class="flex wrap">
        <button class="btn" id="rcImport">📁 นำเข้าไฟล์ Statement</button>
        <button class="btn gold" id="rcAuto">🔄 จับคู่อัตโนมัติอีกครั้ง</button>
      </div>
    </div>
    ${lines.length ? `
    <div class="grid g4" style="margin-bottom:16px">
      <div class="stat"><div class="lbl">รายการใน statement</div><div class="val">${lines.length}</div></div>
      <div class="stat"><div class="lbl">จับคู่ตรงกัน</div><div class="val green">${st('ok')}</div>
        <div class="sub">ยอดตรงพอดี</div></div>
      <div class="stat"><div class="lbl">ยอดไม่ตรง</div><div class="val red">${st('diff')}</div>
        <div class="sub">ต้องตรวจสอบ</div></div>
      <div class="stat"><div class="lbl">หาบิลคู่ไม่เจอ</div>
        <div class="val" style="color:var(--warn)">${st('none')}</div>
        <div class="sub">อาจลืมออกบิล</div></div>
    </div>
    ${todo.length ? `<div class="notice red" style="margin-bottom:14px">🚨 มี <b>${todo.length} รายการ</b>
      ที่ต้องตรวจ — ระบบคัดมาให้เฉพาะรายการเหล่านี้แล้ว</div>` : `
      <div class="notice" style="margin-bottom:14px;background:rgba(34,197,94,.08);border:1px solid var(--green);color:var(--green)">
        ✅ ทุกรายการจับคู่ได้ครบ ไม่มีอะไรต้องตรวจ</div>`}
    <div class="card tight"><div class="tbl-wrap"><table>
      <thead><tr><th>เวลาโอน</th><th class="num">ยอดเงินเข้า</th><th>อ้างอิง</th>
        <th>บิลที่จับคู่ได้</th><th class="num">ยอดในระบบ</th><th class="num">ส่วนต่าง</th>
        <th>สถานะ</th><th></th></tr></thead>
      <tbody>${lines.map(l => {
        const m = matches.get(l.id) || { status: '-' };
        const s = m.sale_id ? sales.find(x => x.id === m.sale_id) : null;
        const bad = m.status === 'diff' || m.status === 'none';
        return `<tr style="${bad ? 'background:rgba(224,69,59,.045)' : ''}">
          <td>${new Date(l.txn_time).toLocaleString('th-TH', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</td>
          <td class="num"><b style="font-weight:400">${money(l.amount)}</b></td>
          <td class="mini">${esc((l.ref || '-').slice(0, 24))}</td>
          <td>${s ? esc(s.bill_no) : '<span class="tag red">ไม่พบบิล</span>'}</td>
          <td class="num">${s ? money(s.total) : '-'}</td>
          <td class="num" style="color:${m.diff ? 'var(--red)' : 'var(--muted)'}">
            ${m.diff ? (m.diff > 0 ? '+' : '') + money(m.diff) : '0'}</td>
          <td>${({ ok:'<span class="tag green">ตรงกัน</span>',
                   diff:'<span class="tag red">ยอดไม่ตรง</span>',
                   none:'<span class="tag warn">ไม่มีคู่</span>',
                   resolved:'<span class="tag">ตรวจแล้ว</span>' })[m.status] || '-'}</td>
          <td class="num">${bad ? `<button class="btn sm" data-rc="${l.id}">ตรวจสอบ</button>` : ''}</td>
        </tr>`; }).join('')}</tbody></table></div></div>`
    : `<div class="card"><div class="cart-empty"><span class="big">🏦</span>
        ยังไม่ได้นำเข้า statement<br>
        ดาวน์โหลดไฟล์ CSV รายการเดินบัญชีจากแอปธนาคาร แล้วกดปุ่มนำเข้าด้านบน</div></div>`}`;
  },

  mount(el) {
    el.querySelector('#rcImport').onclick = () => importCSV(el);
    el.querySelector('#rcAuto').onclick = async () => {
      await autoMatch(); toast('จับคู่ใหม่แล้ว', 'ok'); await redrawPage(el, reconPage);
    };
    el.addEventListener('click', e => {
      const r = e.target.closest('[data-rc]'); if (r) resolve(r.dataset.rc, el);
    });
  },
};
