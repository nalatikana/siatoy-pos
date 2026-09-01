export const $  = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const money = n => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
export const uuid  = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
export const yymmdd = (d = new Date()) =>
  String(d.getFullYear() % 100).padStart(2,'0') +
  String(d.getMonth() + 1).padStart(2,'0') +
  String(d.getDate()).padStart(2,'0');

export function toast(msg, kind) {
  const box = $('#toasts'); if (!box) return;
  const d = document.createElement('div');
  d.className = 'toast ' + (kind || '');
  d.innerHTML = msg;
  box.appendChild(d);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => {
    d.style.transition = '.3s'; d.style.opacity = '0'; d.style.transform = 'translateX(30px)';
    setTimeout(() => d.remove(), 300);
  }, 3200);
}

export function openModal(html, wide) {
  $('#modalBox').className = 'modal' + (wide ? ' wide' : '');
  $('#modalBox').innerHTML = html;
  $('#modalBg').classList.add('on');
}
export function closeModal() { $('#modalBg').classList.remove('on'); }
