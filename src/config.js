/* ค่าตั้งต้นของระบบ
 * anon key ของ Supabase ถูกออกแบบมาให้เปิดเผยได้ ทุกเบราว์เซอร์ที่เปิดแอปจะเห็นอยู่แล้ว
 * ความปลอดภัยอยู่ที่การล็อกอินและกฎสิทธิ์ระดับแถว (RLS) ในฐานข้อมูล ไม่ใช่ที่การซ่อนคีย์
 * ห้ามเอา service_role key มาใส่ไฟล์นี้เด็ดขาด อันนั้นข้ามสิทธิ์ทั้งหมด
 */
export const CONFIG = {
  supabaseUrl:     'https://rtydqmzmrbxqozfgfwpm.supabase.co',
  supabaseAnonKey: 'sb_publishable_prSKiod6syszIKhigCuorw_v3N2sDda',
  shopName:  'Siatoy TCG',
  creditFee: 3,             // % ค่าธรรมเนียมบัตร ย้ายไปตาราง settings เมื่อต่อฐานข้อมูลแล้ว
  pointRate: 100,           // ทุกกี่บาทได้ 1 แต้ม
  printerDpi: 203,          // ความละเอียดเครื่องพิมพ์สติกเกอร์ ES-9960 (203 หรือ 300)
};

export const hasBackend = () => Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
