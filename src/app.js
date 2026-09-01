/* จุดเริ่มของแอป : ธีม สิทธิ์ นาฬิกา เมนู ตัวจัดเส้นทาง และแถบสถานะการซิงก์ */
import { CONFIG, hasBackend } from './config.js';
import { $, $$, toast } from './lib/util.js';
import { S } from './lib/state.js';
import { ensureSeeded, currentLocation, pendingCount } from './lib/store.js';
import { posPage } from './pages/pos.js';
import { stubPage } from './pages/stub.js';

const ROUTES = {
  pos: posPage,
  bills: stubPage('bills'), scan: stubPage('scan'), stock: stubPage('stock'),
  labels: stubPage('labels'), sets: stubPage('sets'), vendors: stubPage('vendors'),
  event: stubPage('event'), recon: stubPage('recon'), members: stubPage('members'),
  report: stubPage('report'), notify: stubPage('notify'), settings: stubPage('settings'),
};

/* ---------------------------------------------------------------- ธีม ---- */
function applyTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  $('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem('siatoy-theme', t); } catch (e) {}
}
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('siatoy-theme'); } catch (e) {}
  if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(t);
}

/* -------------------------------------------------------------- สิทธิ์ ---- */
function setRole(r) {
  S.role = r;
  document.body.className = 'role-' + r;
  $$('.role-switch button').forEach(b => b.classList.toggle('on', b.dataset.role === r));
  try { localStorage.setItem('siatoy-role', r); } catch (e) {}
  render();
}

/* ------------------------------------------------------------ เส้นทาง ---- */
async function render() {
  const key = (location.hash.replace(/^#\/?/, '') || 'pos').split('?')[0];
  S.page = ROUTES[key] ? key : 'pos';
  $$('.nav-item').forEach(n => n.classList.toggle('on', n.dataset.page === S.page));
  $('#sidebar').classList.remove('open');

  const page = ROUTES[S.page];
  const el = document.createElement('div');
  el.className = 'page on';
  el.innerHTML = await page.render();
  $('#pages').replaceChildren(el);
  if (page.mount) page.mount(el);
  $('#main').scrollTop = 0;
  const first = el.querySelector('input[autofocus]');
  if (first && window.innerWidth > 980) first.focus();
}

/* ------------------------------------------------------ แถบสถานะการส่ง ---- */
async function drawSync() {
  const n = await pendingCount();
  const chip = $('#syncChip');
  if (!navigator.onLine) {
    chip.innerHTML = '📴 <b>ออฟไลน์' + (n ? ' · ค้าง ' + n : '') + '</b>';
    chip.style.color = 'var(--warn)';
  } else if (!hasBackend()) {
    chip.innerHTML = '🧪 <b>โหมดทดลอง' + (n ? ' · ค้าง ' + n : '') + '</b>';
    chip.style.color = 'var(--muted)';
  } else if (n) {
    chip.innerHTML = '⏳ <b>รอส่ง ' + n + '</b>';
    chip.style.color = 'var(--warn)';
  } else {
    chip.innerHTML = '✅ <b>ส่งครบแล้ว</b>';
    chip.style.color = 'var(--green)';
  }
}

function tick() {
  $('#clock').innerHTML = '🕐 <b>' + new Date().toTimeString().slice(0, 5) + '</b>';
}

/* --------------------------------------------------------------- เริ่ม ---- */
async function boot() {
  initTheme();
  try { setRole(localStorage.getItem('siatoy-role') || 'owner'); } catch (e) { setRole('owner'); }

  $('#themeBtn').onclick = () => {
    applyTheme(S.theme === 'dark' ? 'light' : 'dark');
    toast(S.theme === 'dark' ? '🌙 โหมดกลางคืน · ธีมดำ-ทอง' : '☀️ โหมดกลางวัน · ธีมขาว-เขียว');
  };
  $('#hambBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#roleSwitch').onclick = e => {
    const b = e.target.closest('[data-role]'); if (b) setRole(b.dataset.role);
  };
  $('#modalBg').onclick = e => { if (e.target.id === 'modalBg') $('#modalBg').classList.remove('on'); };

  await ensureSeeded();
  const loc = await currentLocation();
  $('#locChip').innerHTML = '<span class="dot"></span> จุดขาย <b>' + loc.name + '</b>';

  addEventListener('hashchange', render);
  addEventListener('online',  drawSync);
  addEventListener('offline', drawSync);
  document.addEventListener('siatoy:changed', drawSync);
  setInterval(tick, 1000); tick();
  setInterval(drawSync, 15000);

  await render();
  await drawSync();

  if (!hasBackend()) {
    toast('โหมดทดลอง · ข้อมูลเก็บในเครื่องนี้เท่านั้น<br><span class="mini">ยังไม่ได้ต่อฐานข้อมูลกลาง</span>');
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot().catch(err => {
  console.error(err);
  document.getElementById('pages').innerHTML =
    '<div class="card" style="max-width:600px"><div class="card-title"><span class="ic">⚠️</span> เปิดแอปไม่สำเร็จ</div>' +
    '<pre style="white-space:pre-wrap;font-size:12px">' + String(err && err.stack || err) + '</pre></div>';
});
