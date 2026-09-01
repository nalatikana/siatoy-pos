/* สถานะที่ทั้งแอปใช้ร่วมกัน  แยกไฟล์ไว้กันการ import วนกันเองระหว่าง app กับหน้าต่าง ๆ */
export const S = {
  page:  'pos',
  role:  'owner',   // ชั่วคราว จนกว่าจะต่อระบบล็อกอินจริงใน Supabase
  theme: 'light',
};
