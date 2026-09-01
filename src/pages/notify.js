/* แจ้งเตือนอัตโนมัติ
 *
 * ข้อจำกัดที่ต้องรู้ : หน้าเว็บส่งข้อความตอนตี 1 เองไม่ได้ เพราะตอนนั้นไม่มีใครเปิดแอปค้างไว้
 * การส่งอัตโนมัติต้องให้เซิร์ฟเวอร์เป็นคนทำ (งานตั้งเวลาฝั่ง Supabase)
 * หน้านี้จึงทำได้สองอย่างคือ ตั้งค่าช่องทาง และกดส่งสรุปเดี๋ยวนี้ด้วยตัวเอง
 */
import { CONFIG } from '../config.js';
import { money, esc, toast } from '../lib/util.js';
import { db, metaGet, metaSet, currentLocation } from '../lib/store.js';

let cfg = { channel: 'telegram', token: '', chat: '', time: '01:00', alerts: {} };
const ALERTS = [
  ['low',   'สินค้าใกล้หมด (เหลือไม่ถึง 3 ชิ้น)'],
  ['void',  'มีการยกเลิกบิล'],
  ['disc',  'ส่วนลดเกิน 500 บาทต่อบิล'],
  ['recon', 'กระทบยอดธนาคารพบรายการไม่ตรง'],
  ['event', 'สรุปยอดงานอีเวนต์เมื่อปิดบูธ'],
];

async function summary() {
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const loc = await currentLocation();
  const sales = (await db.sales.toArray()).filter(s => s.client_created_at >= from.toISOString());
  const ok = sales.filter(s => s.status === 'normal');
  const products = await db.products.toArray();

  const okIds = new Set(ok.map(s => s.id));
  const top = new Map();
  let qty = 0;
  await db.sale_items.each(it => {
    if (!okIds.has(it.sale_id)) return;
    const t = top.get(it.product_id) || { qty: 0, name: it.product_name };
    t.qty += it.qty; top.set(it.product_id, t);
  });
  const moves = new Map();
  await db.stock_moves.each(m => moves.set(m.product_id, (moves.get(m.product_id) || 0) + m.qty));
  products.forEach(p => { qty += moves.get(p.id) || 0; });

  const pay = k => ok.filter(s => s.payment === k).reduce((a, s) => a + s.total, 0);
  const best = [...top.values()].sort((a, b) => b.qty - a.qty).slice(0, 3);
  const low = products.filter(p => (moves.get(p.id) || 0) <= 3 && (moves.get(p.id) || 0) >= 0);

  return `🃏 สรุปยอดขาย ${CONFIG.shopName}
📅 ${from.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} · ${loc.name}

💰 ยอดขายรวม  ${money(ok.reduce((a, s) => a + s.total, 0))} ฿
🧾 จำนวนบิล  ${ok.length} บิล
🏷️ ส่วนลดรวม  ${money(ok.reduce((a, s) => a + s.item_discount + s.bill_discount, 0))} ฿

💵 เงินสด  ${money(pay('cash'))} ฿
📱 เงินโอน  ${money(pay('transfer'))} ฿
💳 บัตรเครดิต  ${money(pay('credit'))} ฿

🔥 ขายดีวันนี้
${best.length ? best.map((t, i) => `${i + 1}. ${t.name} ×${t.qty}`).join('\n') : '— ยังไม่มีการขาย —'}

📦 สต๊อกคงเหลือ ${money(qty)} ชิ้น
⚠️ ใกล้หมด ${low.length} รายการ
🚫 บิลยกเลิก ${sales.filter(s => s.status === 'void').length} ใบ
👑 เปิดการ์ด ${sales.filter(s => s.status === 'open_card').length} รายการ`;
}

async function sendTelegram(text) {
  if (!cfg.token || !cfg.chat) { toast('ยังไม่ได้ใส่ Bot token และ Chat ID', 'err'); return; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(cfg.token)}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chat, text }),
    });
    const j = await r.json();
    if (j.ok) toast('ส่งเข้า Telegram แล้ว', 'ok');
    else toast('Telegram ตอบกลับว่า: ' + esc(j.description || 'ส่งไม่สำเร็จ'), 'err');
  } catch (e) {
    toast('ส่งไม่สำเร็จ · ' + esc(e.message), 'err');
  }
}

export const notifyPage = {
  async render() {
    cfg = await metaGet('notify', cfg);
    cfg.alerts = cfg.alerts || {};
    const msg = await summary();
    return `
    <div class="page-head"><div><h1>แจ้งเตือนอัตโนมัติ</h1>
      <p>ส่งสรุปยอดเข้าแชตทุกวัน · ตอนนี้กดส่งเองได้ ส่วนการส่งอัตโนมัติต้องรอต่อเซิร์ฟเวอร์</p></div></div>

    <div class="grid g2" style="align-items:start">
      <div>
        <div class="card">
          <div class="card-title"><span class="ic">🔔</span> ตั้งค่าช่องทาง</div>
          <div class="field"><label>ช่องทาง</label>
            <div class="seg" id="nfCh">
              <button class="${cfg.channel === 'telegram' ? 'on' : ''}" data-ch="telegram">Telegram</button>
              <button class="${cfg.channel === 'line' ? 'on' : ''}" data-ch="line">LINE Official Account</button>
            </div></div>
          ${cfg.channel === 'telegram' ? `
            <div class="field"><label>Bot token (ได้จาก @BotFather)</label>
              <input class="inp" id="nfToken" type="password" value="${esc(cfg.token)}"
                placeholder="123456789:AA..."></div>
            <div class="field"><label>Chat ID (ได้จาก @userinfobot หรือกลุ่มที่เชิญบอทเข้าไป)</label>
              <input class="inp" id="nfChat" value="${esc(cfg.chat)}" placeholder="-1001234567890"></div>
            <div class="notice info">Telegram ส่งได้ฟรีไม่จำกัด และเรียกจากหน้าเว็บได้ตรง ๆ
              จึงทดสอบได้ทันทีโดยยังไม่ต้องมีเซิร์ฟเวอร์</div>`
          : `
            <div class="notice warn"><b>LINE Notify ปิดบริการไปแล้วตั้งแต่ 31 มี.ค. 2025</b>
              การส่งเข้า LINE ตอนนี้ต้องใช้ Messaging API ผ่าน LINE Official Account ของร้าน
              ซึ่งเรียกจากหน้าเว็บตรง ๆ ไม่ได้ ต้องให้เซิร์ฟเวอร์เป็นคนส่ง
              จึงจะทำได้หลังต่อฐานข้อมูลกลางแล้ว</div>
            <div class="field" style="margin-top:14px"><label>Channel access token (เก็บไว้ก่อนได้)</label>
              <input class="inp" id="nfToken" type="password" value="${esc(cfg.token)}"></div>
            <div class="field"><label>User ID / Group ID ที่จะส่งเข้า</label>
              <input class="inp" id="nfChat" value="${esc(cfg.chat)}"></div>`}
          <div class="field"><label>เวลาส่งสรุปประจำวัน</label>
            <input class="inp" id="nfTime" type="time" value="${esc(cfg.time)}"></div>
          <button class="btn gold block" id="nfSend">📤 ส่งสรุปของวันนี้เดี๋ยวนี้</button>
        </div>

        <div class="card" style="margin-top:14px">
          <div class="card-title"><span class="ic">⚡</span> แจ้งเตือนอื่น ๆ</div>
          ${ALERTS.map(([k, n]) => `
            <label class="flex" style="padding:9px 0;border-bottom:1px solid var(--line);font-size:13px;cursor:pointer">
              <span>${n}</span>
              <span class="right"><input type="checkbox" data-alert="${k}" ${cfg.alerts[k] ? 'checked' : ''}></span>
            </label>`).join('')}
          <div class="notice warn" style="margin-top:14px">⚠️ ทั้งการส่งสรุปตามเวลา
            และแจ้งเตือนอัตโนมัติเหล่านี้ ต้องให้เซิร์ฟเวอร์เป็นคนส่ง เพราะตอนตี 1 ไม่มีใครเปิดแอปค้างไว้
            ตอนนี้จึงเป็นการเก็บค่าไว้ก่อน แล้วเปิดใช้ตอนต่อฐานข้อมูลกลางเสร็จ</div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title"><span class="ic">💬</span> ตัวอย่างข้อความที่จะได้รับ</div>
          <div class="chat-head"><div class="chat-ava">${cfg.channel === 'line' ? 'L' : 'T'}</div>
            ${cfg.channel === 'line' ? 'LINE Official Account' : 'Telegram'} · ${esc(cfg.time)} น.</div>
          <div class="line-preview">${esc(msg)}</div>
        </div>
      </div>
    </div>`;
  },

  mount(el) {
    const save = async () => {
      const g = id => { const e = el.querySelector('#' + id); return e ? e.value.trim() : ''; };
      cfg.token = g('nfToken'); cfg.chat = g('nfChat'); cfg.time = g('nfTime') || '01:00';
      await metaSet('notify', cfg);
    };
    ['nfToken', 'nfChat', 'nfTime'].forEach(id => {
      const e = el.querySelector('#' + id);
      if (e) e.onchange = async () => { await save(); toast('บันทึกการตั้งค่าแล้ว', 'ok'); };
    });
    el.querySelector('#nfCh').onclick = async e => {
      const b = e.target.closest('[data-ch]'); if (!b) return;
      await save(); cfg.channel = b.dataset.ch; await metaSet('notify', cfg);
      const { redrawPage } = await import('../lib/util.js');
      await redrawPage(el, notifyPage);
    };
    el.addEventListener('change', async e => {
      const a = e.target.closest('[data-alert]');
      if (a) { cfg.alerts[a.dataset.alert] = a.checked; await metaSet('notify', cfg); }
    });
    el.querySelector('#nfSend').onclick = async () => {
      await save();
      const text = await summary();
      if (cfg.channel === 'telegram') await sendTelegram(text);
      else toast('LINE ต้องส่งผ่านเซิร์ฟเวอร์ ยังส่งจากหน้าเว็บไม่ได้', 'err');
    };
  },
};
