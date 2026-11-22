# วิธีนำเกมขึ้นออนไลน์ (Fly.io + Cloudflare Pages)

เกมมี 2 ส่วน:

- **เซิร์ฟเวอร์เกม** (โฟลเดอร์ `server/`) รันบน Fly.io ที่สิงคโปร์ ใช้จัดห้องและคำนวณการเล่นออนไลน์
- **หน้าเว็บเกม** (โฟลเดอร์ `src/`) อยู่บน Cloudflare Pages ฟรี

ค่าใช้จ่ายช่วงทดสอบประมาณ 0-1 ดอลลาร์ต่อเดือน เพราะเซิร์ฟเวอร์จะหลับเองเมื่อไม่มีคนเล่น
(ต้องผูกบัตรเครดิตกับ Fly.io ก่อนถึงจะใช้ได้)

ค่าลับ 3 ตัวที่ต้องใช้ (ห้ามใส่ลงในไฟล์ในโปรเจกต์ ห้าม commit):

| ชื่อ | ค่า | หาจากไหน |
|---|---|---|
| `SUPABASE_URL` | เช่น `https://xxxx.supabase.co` | Supabase > Project Settings > API > Project URL |
| `SUPABASE_ANON_KEY` | คีย์ `anon` `public` | Supabase > Project Settings > API |
| `ALLOWED_ORIGINS` | ที่อยู่หน้าเว็บของเกม เช่น `https://badminton-game.pages.dev` | ดูขั้นตอนที่ 5 (ใส่ได้หลายค่า คั่นด้วยเครื่องหมายจุลภาค) |

## ลำดับที่แนะนำ

ตั้งชื่อโปรเจกต์ Cloudflare Pages ไว้ในใจก่อน (เช่น `badminton-game`) จะได้รู้ที่อยู่หน้าเว็บล่วงหน้าคือ
`https://badminton-game.pages.dev` แล้วเริ่มจาก Fly.io

## ขั้นตอนที่ 1: เซิร์ฟเวอร์เกมบน Fly.io

1. ติดตั้ง flyctl
   - macOS: `brew install flyctl`
   - หรือ: `curl -L https://fly.io/install.sh | sh`
2. เข้าสู่ระบบ (จะเปิดเบราว์เซอร์ให้ล็อกอินและผูกบัตร): `fly auth login`
3. ในโฟลเดอร์โปรเจกต์ รัน `fly launch --no-deploy`
   - ถ้าถามว่าจะใช้ `fly.toml` ที่มีอยู่ไหม ให้ตอบ **ใช้ไฟล์เดิม (Yes)**
   - ถ้าชื่อแอป `badminton-game-server` มีคนใช้แล้ว ให้ตั้งชื่อใหม่ (แก้บรรทัด `app =` ใน `fly.toml` ด้วย)
   - Region เลือก `sin` (Singapore) ไม่ต้องสร้างฐานข้อมูล Postgres หรือ Redis
4. ตั้งค่าลับ (แทนค่าตัวอย่างด้วยค่าจริงของคุณ):

   ```
   fly secrets set SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_ANON_KEY="คีย์-anon-ของคุณ" ALLOWED_ORIGINS="https://badminton-game.pages.dev"
   ```

   - ถ้าจะทดสอบจากเครื่องตัวเองด้วย ให้เพิ่ม `,http://localhost:5173` ต่อท้าย `ALLOWED_ORIGINS`
     (เมื่อตั้งค่านี้แล้ว เซิร์ฟเวอร์จะรับเฉพาะที่อยู่ที่ระบุไว้เท่านั้น)
5. ขึ้นระบบ: `fly deploy` (Fly สร้างอิมเมจให้เอง ไม่ต้องมี Docker ในเครื่อง)
6. ตรวจว่าทำงาน: เปิด `https://<ชื่อแอป>.fly.dev/healthz` ต้องเห็นคำว่า `ok`
   ดูบันทึกการทำงานด้วย `fly logs` และสถานะด้วย `fly status`

ที่อยู่ WebSocket ของเซิร์ฟเวอร์คือ `wss://<ชื่อแอป>.fly.dev` (ใช้ในขั้นตอนที่ 2)

หมายเหตุ: เมื่อ `fly deploy` ใหม่หรือเซิร์ฟเวอร์รีสตาร์ท ห้องที่กำลังเล่นอยู่จะหายไป
(ห้องเก็บอยู่ในหน่วยความจำ) ผู้เล่นจะถูกตัดการเชื่อมต่อด้วยรหัส 1012 เพื่อให้หน้าเว็บเชื่อมต่อใหม่

## ขั้นตอนที่ 2: หน้าเว็บบน Cloudflare Pages

1. สมัครบัญชีที่ https://dash.cloudflare.com (ฟรี)
2. Workers & Pages > Create > Pages > Connect to Git เลือก repo `nutfull123/BADMINTONGAME`
3. ตั้งชื่อโปรเจกต์ให้ตรงกับที่วางแผนไว้ (เช่น `badminton-game`)
4. ตั้งค่า build:
   - Framework preset: `None` (หรือ `Vite`)
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Environment variables (ใส่ทั้งช่อง Production และ Preview):

   | ชื่อ | ค่า |
   |---|---|
   | `VITE_SUPABASE_URL` | เหมือน `SUPABASE_URL` ด้านบน |
   | `VITE_SUPABASE_ANON_KEY` | เหมือน `SUPABASE_ANON_KEY` ด้านบน |
   | `VITE_GAME_SERVER_URL` | `wss://<ชื่อแอป>.fly.dev` |
   | `NODE_VERSION` | `22` |

   ตัวแปรที่ขึ้นต้นด้วย `VITE_` ถูกฝังตอน build ถ้าแก้ค่าภายหลังต้อง Retry deployment ใหม่
6. กด Save and Deploy รอจนเสร็จ จะได้ที่อยู่ `https://<ชื่อโปรเจกต์>.pages.dev`
   ถ้าที่อยู่ไม่ตรงกับที่ใส่ใน `ALLOWED_ORIGINS` ให้แก้ด้วย `fly secrets set ALLOWED_ORIGINS="..."`
   (Fly จะรีสตาร์ทเซิร์ฟเวอร์ให้เอง)

## ขั้นตอนที่ 3: แก้ที่อยู่ใน Supabase

ที่ Supabase Dashboard > Authentication > URL Configuration:

- **Site URL**: `https://<ชื่อโปรเจกต์>.pages.dev`
- **Redirect URLs**: เพิ่ม `https://<ชื่อโปรเจกต์>.pages.dev/**` (เก็บ `http://localhost:5173/**` ไว้สำหรับเขียนโค้ดในเครื่อง)

## ขั้นตอนที่ 4: แก้ที่อยู่ใน Google (ปุ่มเข้าสู่ระบบด้วย Google)

ที่ Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client ID ที่ใช้กับ Supabase:

- **Authorized JavaScript origins**: เพิ่ม `https://<ชื่อโปรเจกต์>.pages.dev`
- **Authorized redirect URIs**: คงเดิมคือ `https://<รหัสโปรเจกต์>.supabase.co/auth/v1/callback` (ไม่ต้องเปลี่ยน)
- OAuth consent screen: ใส่หน้าแรกของแอปเป็น `https://<ชื่อโปรเจกต์>.pages.dev` และลิงก์นโยบายความเป็นส่วนตัวของเกมก่อนเปลี่ยนสถานะจาก Testing เป็น Production

## ขั้นตอนที่ 5: ลองเล่น

1. เปิด `https://<ชื่อโปรเจกต์>.pages.dev` ล็อกอิน แล้วสร้างห้อง
2. ส่งรหัสห้อง 6 ตัวให้เพื่อน ให้เพื่อนเปิดเว็บเดียวกันแล้วเข้าห้อง
3. การเชื่อมต่อครั้งแรกหลังเซิร์ฟเวอร์หลับจะช้าประมาณ 1-2 วินาที (กำลังปลุกเครื่อง)

## แก้ปัญหา

- **เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ / ถูกตัดทันที**: ตรวจว่า `ALLOWED_ORIGINS` ตรงกับที่อยู่ในแถบเบราว์เซอร์เป๊ะ (ขึ้นต้น `https://` ไม่มี `/` ท้าย) ดู `fly logs`
- **ขึ้นว่า token ไม่ถูกต้อง (bad-token)**: ตรวจ `SUPABASE_URL` และ `SUPABASE_ANON_KEY` ว่าเป็นของโปรเจกต์เดียวกับที่หน้าเว็บใช้ (`fly secrets list` แสดงเฉพาะชื่อ)
- **หน้าเว็บยังเรียกเซิร์ฟเวอร์เก่า**: ตัวแปร `VITE_*` ถูกฝังตอน build ต้อง Retry deployment บน Cloudflare Pages
- **อยากให้เซิร์ฟเวอร์ไม่หลับ**: แก้ `fly.toml` เป็น `auto_stop_machines = "off"` และ `min_machines_running = 1` แล้ว `fly deploy` (ราว 3-5 ดอลลาร์ต่อเดือน)
