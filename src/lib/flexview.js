/* แสดงตัวอย่างข้อความ Flex ของ LINE บนหน้าเว็บ
 *
 * เดินตามโครงสร้าง Flex ที่ตัวสร้างส่งมาแล้ววาดเป็น HTML ตรง ๆ
 * ไม่ได้ทำภาพจำลองแยกไว้ต่างหาก ตัวอย่างที่เห็นจึงเปลี่ยนตามของจริงเสมอ
 */
const SIZE = { xxs: 10, xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, '3xl': 28, '4xl': 34 };
const GAP  = { none: 0, xs: 2, sm: 5, md: 9, lg: 14, xl: 18, xxl: 24 };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const px = v => (typeof v === 'string' && v.endsWith('px')) ? v : (v || 0) + 'px';

/* LINE กับ CSS ตีความ flex:0 ไม่เหมือนกัน
   ของ LINE แปลว่า "ไม่ต้องยืด ใช้ความกว้างเท่าเนื้อหา"
   ส่วนของ CSS ย่อ flex:0 เป็น flex:0 1 0% ซึ่งทำให้กล่องกว้างศูนย์แล้วตัวหนังสือหลุดออกมาทับกัน
   ต้องแปลงเป็น 0 0 auto เอง ไม่งั้นตัวอย่างจะไม่ตรงกับที่เห็นจริงใน LINE */
const flexCss = f => (f === 0 || f === '0') ? 'flex:0 0 auto' : `flex:${f}`;

function node(n) {
  if (!n) return '';
  if (n.type === 'separator')
    return `<div style="height:1px;background:#E7E7E7;margin-top:${GAP[n.margin] || 0}px"></div>`;
  if (n.type === 'filler') return '<div style="flex:1"></div>';

  if (n.type === 'text') {
    const st = [
      `font-size:${SIZE[n.size] || 14}px`,
      `color:${n.color || '#111'}`,
      n.weight === 'bold' ? 'font-weight:700' : 'font-weight:400',
      n.align === 'end' ? 'text-align:right' : '',
      n.letterSpacing ? `letter-spacing:${n.letterSpacing}` : '',
      n.margin ? `margin-top:${GAP[n.margin] || 0}px` : '',
      n.flex !== undefined ? flexCss(n.flex) : 'flex:1',
      n.wrap === false ? 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' : 'word-break:break-word',
      'line-height:1.35;min-width:0',
    ].filter(Boolean).join(';');
    return `<div style="${st}">${esc(n.text)}</div>`;
  }

  if (n.type === 'box') {
    const horiz = n.layout === 'horizontal' || n.layout === 'baseline';
    const st = [
      'display:flex',
      horiz ? 'flex-direction:row' : 'flex-direction:column',
      n.layout === 'baseline' ? 'align-items:baseline' : (horiz ? 'align-items:center' : ''),
      `gap:${GAP[n.spacing] || 0}px`,
      n.margin ? `margin-top:${GAP[n.margin] || 0}px` : '',
      n.paddingAll ? `padding:${px(n.paddingAll)}` : '',
      n.backgroundColor ? `background:${n.backgroundColor}` : '',
      n.cornerRadius ? `border-radius:${px(n.cornerRadius)}` : '',
      n.flex !== undefined ? flexCss(n.flex) : '',
      'min-width:0',
    ].filter(Boolean).join(';');
    return `<div style="${st}">${(n.contents || []).map(node).join('')}</div>`;
  }
  return '';
}

/* คืน HTML ของฟองข้อความ พร้อมกรอบแบบที่เห็นในแอป LINE */
export function renderFlex(bubble) {
  if (!bubble || bubble.type !== 'bubble') return '<div class="mini">ไม่มีข้อมูล</div>';
  return `
  <div style="max-width:340px;border-radius:14px;overflow:hidden;background:#fff;
              box-shadow:0 2px 10px rgba(0,0,0,.18);font-family:inherit;color:#111">
    ${node(bubble.header)}${node(bubble.body)}
    ${bubble.footer ? `<div style="border-top:1px solid #EEE">${node(bubble.footer)}</div>` : ''}
  </div>`;
}
