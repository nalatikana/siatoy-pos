/* อ่านไฟล์ CSV แบบง่าย ๆ รองรับค่าที่ครอบด้วยเครื่องหมายคำพูดและมีลูกน้ำข้างใน */
export function parseCSV(text, delim) {
  text = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  /* ต้องรู้ก่อนว่าไฟล์นี้คั่นด้วยอะไร แล้วใช้ตัวนั้นตัวเดียว
     ถ้าตัดทั้งลูกน้ำและแท็บพร้อมกัน ข้อมูลที่ก๊อบจาก Excel มา (คั่นด้วยแท็บ)
     ซึ่งมีตัวเลขใส่ลูกน้ำอย่าง 2,490 จะถูกตัดเป็นสองช่อง แล้วข้อมูลเลื่อนทั้งแถว */
  if (!delim) {
    const first = text.split('\n')[0] || '';
    const tabs = (first.match(/\t/g) || []).length;
    const commas = (first.match(/,/g) || []).length;
    delim = tabs > commas ? '\t' : ',';
  }

  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

/* แปลงตัวเลขเงินที่มีลูกน้ำคั่นหลักพัน */
export const toAmount = v => {
  const n = Number(String(v == null ? '' : v).replace(/[, ฿]/g, '').replace(/[()]/g, ''));
  return isNaN(n) ? null : n;
};

/* แปลงวันที่ รองรับ พ.ศ. และรูปแบบ วัน/เดือน/ปี ที่ธนาคารไทยชอบใช้ */
export function toDate(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    let [, d, mo, y, hh, mi, ss] = m;
    y = Number(y); if (y > 2400) y -= 543;                 // พ.ศ. → ค.ศ.
    return new Date(y, Number(mo) - 1, Number(d), Number(hh || 0), Number(mi || 0), Number(ss || 0));
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}

/* เดาว่าคอลัมน์ไหนคือวันที่ / จำนวนเงิน / รายละเอียด จากหัวตาราง */
export function guessColumns(header) {
  const find = (...keys) => header.findIndex(h => {
    const s = String(h).toLowerCase();
    return keys.some(k => s.includes(k));
  });
  return {
    date:   find('วันที่', 'วัน/เวลา', 'date', 'time', 'เวลา'),
    amount: find('เงินเข้า', 'ฝาก', 'จำนวนเงิน', 'จำนวน', 'deposit', 'credit', 'amount'),
    ref:    find('รายละเอียด', 'อ้างอิง', 'หมายเหตุ', 'description', 'detail', 'ref', 'channel'),
  };
}
