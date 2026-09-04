/* ล็อกหน้าจอด้วย PIN
 *
 * ปัญหาจริงที่หน้าร้านคือเครื่องค้างล็อกอินไว้เป็นเจ้าของ แล้วใครก็เดินมากดดูต้นทุนได้
 * แต่จะให้พิมพ์รหัสผ่านยาว ๆ ใหม่ทุกครั้งต่อหน้าลูกค้าก็ไม่ไหว
 * จึงใช้ PIN 6 หลักปลดล็อก ส่วนตัวเซสชันยังคาไว้เหมือนเดิม ไม่ต้องล็อกอินใหม่
 *
 * PIN ไม่ได้ถูกเก็บตรง ๆ ที่ไหนเลย เก็บเป็นค่าที่ผ่านการแปลงแบบย้อนกลับไม่ได้
 * ด้วย PBKDF2 สองแสนรอบพร้อมค่าสุ่มประจำคน ต่อให้ค่านั้นหลุดก็เดา PIN กลับไม่ได้ง่าย ๆ
 */
import { db, metaGet, metaSet } from './store.js';
import { client, currentUser, logEvent, signOut } from './sync.js';
import { hasBackend } from '../config.js';

const ITER = 200000;
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = s => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)));

async function derive(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}

export async function makeHash(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${hex(salt)}$${await derive(pin, salt)}`;
}

export async function checkHash(pin, stored) {
  if (!stored) return false;
  const [, iter, saltHex, want] = stored.split('$');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unhex(saltHex), iterations: Number(iter), hash: 'SHA-256' }, key, 256);
  return hex(bits) === want;
}

/* ---------------------------------------------------------- เก็บ / อ่าน ---- */
export async function getPinHash() {
  if (hasBackend() && currentUser()) {
    const { data } = await client().from('user_pins').select('pin_hash')
      .eq('user_id', currentUser().id).maybeSingle();
    return data ? data.pin_hash : null;
  }
  return await metaGet('pin_hash', null);
}

export async function setPin(pin) {
  const h = await makeHash(pin);
  if (hasBackend() && currentUser()) {
    const { error } = await client().from('user_pins')
      .upsert({ user_id: currentUser().id, pin_hash: h, updated_at: new Date().toISOString() },
              { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  } else {
    await metaSet('pin_hash', h);
  }
  await logEvent('pin_set');
  return true;
}

export async function clearPin() {
  if (hasBackend() && currentUser()) await client().from('user_pins').delete().eq('user_id', currentUser().id);
  else await metaSet('pin_hash', null);
}

export const hasPin = async () => !!(await getPinHash());

/* -------------------------------------------------------------- ล็อกจอ ---- */
let locked = false, idleTimer = null, idleMinutes = 5, wrongCount = 0, cooldownUntil = 0;
export const isLocked = () => locked;

function overlayHTML(name) {
  return `
  <div class="lock-card">
    <div class="lock-logo">🔒</div>
    <div class="lock-name">${name ? 'ล็อกหน้าจอไว้ · ' + name : 'ล็อกหน้าจอไว้'}</div>
    <div class="lock-sub">ใส่ PIN 6 หลักเพื่อใช้งานต่อ</div>
    <input class="lock-pin" id="lockPin" type="password" inputmode="numeric" maxlength="6"
      autocomplete="off" placeholder="••••••">
    <div class="lock-msg" id="lockMsg"></div>
    <div class="lock-keys" id="lockKeys">
      ${[1,2,3,4,5,6,7,8,9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
      <button data-k="back">⌫</button><button data-k="0">0</button><button data-k="ok">✓</button>
    </div>
    <button class="btn ghost block" id="lockOut" style="margin-top:14px">ออกจากระบบแทน</button>
    <div class="mini" style="margin-top:8px;text-align:center">
      ถ้าจำ PIN ไม่ได้ ให้ออกจากระบบแล้วเข้าใหม่ด้วยรหัสผ่าน</div>
  </div>`;
}

export async function lockNow(reason) {
  if (locked) return;
  if (!(await hasPin())) return;                 // ยังไม่ได้ตั้ง PIN ก็ล็อกไม่ได้
  locked = true; wrongCount = 0;
  const me = currentUser();
  const name = me ? (me.email || '') : '';
  const el = document.createElement('div');
  el.className = 'lockscreen';
  el.id = 'lockScreen';
  el.innerHTML = overlayHTML(name);
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  const input = el.querySelector('#lockPin');
  const msg = el.querySelector('#lockMsg');
  setTimeout(() => input.focus(), 50);

  const fail = async () => {
    wrongCount++;
    await logEvent('unlock_failed', { tries: wrongCount });
    input.value = '';
    if (wrongCount >= 5) {
      cooldownUntil = Date.now() + 30000;
      msg.innerHTML = '<span style="color:var(--red)">ใส่ผิดหลายครั้ง รอ 30 วินาทีแล้วลองใหม่</span>';
    } else {
      msg.innerHTML = `<span style="color:var(--red)">PIN ไม่ถูกต้อง (ผิด ${wrongCount} ครั้ง)</span>`;
    }
  };

  const submit = async () => {
    if (Date.now() < cooldownUntil) {
      msg.innerHTML = `<span style="color:var(--red)">รออีก ${Math.ceil((cooldownUntil - Date.now()) / 1000)} วินาที</span>`;
      return;
    }
    const pin = input.value.trim();
    if (pin.length < 4) { msg.textContent = 'ใส่ PIN ให้ครบก่อน'; return; }
    msg.textContent = 'กำลังตรวจสอบ…';
    if (await checkHash(pin, await getPinHash())) {
      await logEvent('unlock');
      el.remove(); document.body.style.overflow = '';
      locked = false; wrongCount = 0; resetIdle();
    } else await fail();
  };

  input.onkeydown = e => { if (e.key === 'Enter') submit(); };
  el.querySelector('#lockKeys').onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    if (k === 'ok') return submit();
    if (k === 'back') input.value = input.value.slice(0, -1);
    else if (input.value.length < 6) input.value += k;
    input.focus();
    if (input.value.length === 6) submit();
  };
  el.querySelector('#lockOut').onclick = async () => {
    await logEvent('logout', { from: 'lockscreen' });
    await signOut();
    location.reload();
  };
  await logEvent('lock', reason ? { reason } : null);
}

/* ----------------------------------------------------- ล็อกเองเมื่อว่าง ---- */
function resetIdle() {
  clearTimeout(idleTimer);
  if (!idleMinutes || locked) return;
  idleTimer = setTimeout(() => lockNow('ไม่ได้ใช้งาน'), idleMinutes * 60000);
}

export async function startAutoLock() {
  idleMinutes = Number(await metaGet('lockMinutes', 5)) || 0;
  if (!(await hasPin())) return;
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
    addEventListener(ev, resetIdle, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resetIdle(); });
  resetIdle();
}

export async function setLockMinutes(m) {
  idleMinutes = Number(m) || 0;
  await metaSet('lockMinutes', idleMinutes);
  resetIdle();
}
export const lockMinutes = () => idleMinutes;
