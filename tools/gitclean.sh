#!/bin/sh
# โฟลเดอร์นี้อยู่บน OneDrive และเซสชันยังไม่ได้รับสิทธิ์ลบไฟล์
# git จึงลบไฟล์ล็อกของตัวเองหลัง commit ไม่ได้ ทำให้ commit ครั้งถัดไปพัง
# สคริปต์นี้กวาดไฟล์ล็อกและไฟล์ชั่วคราวไปไว้ใน .gittrash/ ก่อนสั่ง git ครั้งต่อไป
# ถ้าให้สิทธิ์ลบไฟล์แล้ว หรือย้าย repo ออกจาก OneDrive สคริปต์นี้เลิกใช้ได้เลย
cd "$(dirname "$0")/.."
mkdir -p .gittrash
for f in .git/*.lock .git/refs/heads/*.lock; do
  [ -e "$f" ] && mv "$f" ".gittrash/$(basename "$f").$$" 2>/dev/null
done
find .git -name 'tmp_obj_*' -exec mv {} .gittrash/ \; 2>/dev/null
exit 0
