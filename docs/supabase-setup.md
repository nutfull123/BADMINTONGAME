# ตั้งค่า Supabase และ Google login

ทำครั้งเดียวในเว็บ Supabase และ Google Cloud (ไม่ต้องเขียนโค้ด) ถ้าไม่ทำ เกมยังเล่นแบบแขก (guest) ได้ตามปกติ แค่ล็อกอินไม่ได้

## 1. สร้างโปรเจกต์ Supabase

1. เข้า https://supabase.com แล้วสมัคร/ล็อกอิน
2. กด **New project** ตั้งชื่อ (เช่น `badminton`) ตั้ง Database Password แล้วเก็บไว้
3. **Region** เลือก **Southeast Asia (Singapore)**
4. รอจนโปรเจกต์สร้างเสร็จ

## 2. รันไฟล์ SQL

1. เมนูซ้าย **SQL Editor** > **New query**
2. เปิดไฟล์ `supabase/migrations/0001_user_saves.sql` ในโปรเจกต์ คัดลอกทั้งไฟล์มาวาง
3. กด **Run** ต้องขึ้น Success (ตาราง `user_saves`, นโยบาย row level security และฟังก์ชัน `delete_own_account` ถูกสร้าง)

## 3. เปิดล็อกอินด้วยอีเมล

1. **Authentication** > **Providers** > **Email**
2. เปิด Enable Email provider
3. ปิด **Confirm email** (ตอนนี้ปิดไว้ก่อน ก่อนเปิดให้คนอื่นใช้จริงให้เปิดกลับพร้อมตั้ง custom SMTP) แล้วกด **Save**

## 4. เปิด Google login

1. เข้า https://console.cloud.google.com สร้างโปรเจกต์ (หรือใช้อันเดิม)
2. **APIs & Services** > **OAuth consent screen** ตั้งค่าชื่อแอปและอีเมลติดต่อ (User type: External)
3. **APIs & Services** > **Credentials** > **Create credentials** > **OAuth client ID** ชนิด **Web application**
4. ใน **Authorized JavaScript origins** ใส่ `http://localhost:5173`
   ใน **Authorized redirect URIs** ใส่ `https://<project-ref>.supabase.co/auth/v1/callback` (`<project-ref>` ดูได้จาก Supabase: **Project Settings** > **General** > Reference ID)
5. กด Create แล้วคัดลอก **Client ID** และ **Client secret**
6. กลับไป Supabase: **Authentication** > **Providers** > **Google** เปิด Enable วาง Client ID และ Client secret แล้วกด **Save**

## 5. ตั้ง URL ที่อนุญาต

**Authentication** > **URL Configuration**

- **Site URL**: `http://localhost:5173`
- **Redirect URLs**: เพิ่ม `http://localhost:5173/**`

ตอนขึ้นเว็บจริง ให้เพิ่มโดเมนจริงทั้งสองช่องด้วย

## 6. ใส่ค่าในโปรเจกต์

1. **Project Settings** > **API** คัดลอก **Project URL** และ **anon public key**
2. ในโฟลเดอร์โปรเจกต์: `cp .env.example .env.local`
3. เปิด `.env.local` แล้วกรอก

   ```
   VITE_SUPABASE_URL=<Project URL>
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```

4. รีสตาร์ท `npm run dev`

ห้ามใช้ **service_role key** ในไฟล์ใดเลย (ไม่ใส่ใน `.env.local`, ไม่ commit, ไม่ส่งให้ใคร) และห้าม commit `.env.local` (anon key ปลอดภัยสำหรับเบราว์เซอร์เพราะข้อมูลถูกป้องกันด้วย row level security)

## 7. เช็กลิสต์ทดสอบ

ทำหลังหน้าล็อกอินและหน้าตั้งค่าในเกมพร้อมแล้ว

- [ ] สมัครด้วยอีเมล (อีเมลทดสอบ + รหัสผ่านอย่างน้อย 6 ตัว)
- [ ] ออกจากระบบ แล้วล็อกอินด้วยอีเมลเดิมได้
- [ ] ล็อกอินด้วย Google ได้
- [ ] ลบบัญชีทดสอบจากหน้า Settings แล้วล็อกอินด้วยบัญชีนั้นอีกไม่ได้ (ใน Supabase **Authentication** > **Users** และตาราง `user_saves` ไม่เหลือแถวของบัญชีนั้น)
