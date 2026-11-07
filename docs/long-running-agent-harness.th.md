# Harness สำหรับ Agent ที่ทำงานยาวหลายชั่วโมง (Harnesses for Long-Running Agents)

> สรุปเชิงลึกจากเอกสารหนึ่งหน้าของ Claude เรื่อง *"Harnesses for Long-Running Agents — Keeping an AI coding for hours without losing the plot: why agents quit halfway, and the four files that stop it"*
> แนวคิดเดียวกับบทความวิศวกรรมของ Anthropic เรื่อง *Effective harnesses for long-running agents* (พ.ย. 2025)
> อ่านต่อ: [Graph Engineering](./graph-engineering.th.md) — ชั้นที่อยู่เหนือ harness และ loop

---

## 1. ปัญหาตั้งต้น (Abstract)

- **context window ทุกอันมีวันหมด** และ session ใหม่ทุกครั้ง **เริ่มโดยจำอะไรจาก session ก่อนไม่ได้เลย**
- ถ้าปล่อยไว้เฉย ๆ agent มักพลาด 3 แบบ:
  1. พยายามสร้างทุกอย่างในครั้งเดียว
  2. ประกาศว่า "เสร็จแล้ว" เร็วเกินไป
  3. ทำของที่เคยใช้ได้พังไป
- ทางแก้: **harness แบบสอง agent**
  - **Initializer agent** – ตั้งค่าสภาพแวดล้อม **ครั้งเดียว**
  - **Coding agent** – ใน **ทุก session** ทำความคืบหน้าที่ **ตรวจสอบแล้ว** ให้ได้ **หนึ่ง feature พอดี** แล้วทิ้ง **บันทึกที่สะอาด** ไว้ให้ session ถัดไป

**Harness** = โครงสร้างรอบตัว agent (ไฟล์, สคริปต์, prompt, ขั้นตอน) ที่บังคับพฤติกรรม — ไม่ใช่ตัวโมเดล และไม่ใช่แค่ prompt ที่เขียนเก่งขึ้น

---

## 2. ภาพรวมการทำงาน (Figure 1)

```
Initializer agent ──▶ [ feature_list.json      ] ──▶ Session 1 ──▶ Session 2 ──▶ … ──▶ Session N
   (รันครั้งเดียว)      [ claude-progress.txt    ]     1 feature     1 feature           1 feature
                        [ init.sh                ]
                        [ git history            ]
                                 ▲                                  │
                                 └──── ทุก session อ่านบันทึก แล้วอัปเดตกลับ ────┘
```

> Agent ตั้งค่าหนึ่งตัว ตามด้วย session เขียนโค้ดสั้น ๆ ที่ตรวจสอบแล้ว ต่อกันได้ไม่จำกัด

### "สี่ไฟล์" ที่หยุดไม่ให้ agent เลิกกลางทาง

| ไฟล์ | หน้าที่ | ใครสร้าง / ใครแก้ |
|---|---|---|
| `feature_list.json` | รายการ feature ทั้งหมดของงาน พร้อมขั้นตอนทดสอบ และสถานะ `passes` | Initializer สร้าง; Coding agent แก้ **เฉพาะช่อง `passes`** |
| `claude-progress.txt` | บันทึกความคืบหน้า: ทำอะไรไปแล้ว อะไรค้าง อะไรพัง ขั้นต่อไปคืออะไร | Initializer สร้าง; ทุก session ต่อท้าย |
| `init.sh` | สคริปต์เปิดสภาพแวดล้อม (ติดตั้ง, รัน dev server ฯลฯ) ให้พร้อมทดสอบ | Initializer สร้าง; ทุก session รันก่อนเริ่มงาน |
| git history | ความจำถาวรของโค้ด: commit ทีละ feature ข้อความชัดเจน ย้อนกลับได้ | Initializer ทำ commit แรก; ทุก session commit |

---

## 3. `feature_list.json` (Listing 1 ซ้าย)

```json
[
  { "feature": "user can sign up",
    "steps": ["open /signup",
              "submit form",
              "see dashboard"],
    "passes": true },
  { "feature": "user can reset password",
    "passes": false },
  ... 200+ more, all false at start
]
```

ประเด็นที่ต้องจำ:
- แต่ละรายการเขียนเป็น **พฤติกรรมที่ผู้ใช้มองเห็น** ("user can …") ไม่ใช่งานภายในของโค้ด
- `steps` = ขั้นตอนทดสอบแบบ end-to-end ที่คนจริงทำ (เปิดหน้า → กรอกฟอร์ม → เห็นผล)
- **ทุกรายการเริ่มที่ `"passes": false`** → agent จะประกาศ "เสร็จทั้งโปรเจกต์" ไม่ได้ ตราบที่ยังมี false เหลือ
- ขนาด **200+ รายการ** — แตกงานให้ละเอียดพอที่หนึ่ง feature จบได้ในหนึ่ง session
- (พื้นหลังจากบทความต้นฉบับ) ใช้ **JSON แทน Markdown** เพราะโมเดลมีแนวโน้มจะไปแก้/เขียนทับไฟล์ JSON โดยไม่ตั้งใจน้อยกว่า

---

## 4. Prompt ของ Coding agent (Listing 1 ขวา) — เหมือนกันทุก session

1. อ่าน `claude-progress.txt` และ `git log`
2. รัน `init.sh` แล้วทำ **smoke test** — ถ้ามีอะไรพัง **แก้ก่อน**
3. เลือก feature ที่ **สำคัญที่สุด** ซึ่ง `"passes"` เป็น false — **แค่ตัวเดียว**
4. ลงมือทำ แล้วทดสอบแบบ end-to-end **ในเบราว์เซอร์จริง เหมือนผู้ใช้**
5. ตั้ง `"passes": true` — **ห้ามแก้หรือลบ test เพื่อให้ผ่านเด็ดขาด**
6. Commit และอัปเดต progress log

> "The two files that matter most. The prompt is identical in every session."
> สองไฟล์ที่สำคัญที่สุดคือ feature list กับ prompt นี้ — และ prompt **ไม่เปลี่ยน** ระหว่าง session สิ่งที่เปลี่ยนคือ "บันทึก"

ลำดับนี้มีเหตุผล:
- ข้อ 1 = **ฟื้นความจำ** (เพราะ session ใหม่จำอะไรไม่ได้)
- ข้อ 2 = **ตรวจว่าฐานไม่พัง** ก่อนสร้างของใหม่ทับ (ถ้า session ก่อนทิ้งบั๊กไว้ จะได้ไม่ซ้อนปัญหา)
- ข้อ 3 = **จำกัดขอบเขต** กันการทำทุกอย่างพร้อมกัน
- ข้อ 4 = **พิสูจน์จริง** ไม่ใช่แค่ unit test หรือ "ดูเหมือนจะใช้ได้"
- ข้อ 5 = **ซื่อสัตย์ต่อเกณฑ์** เกณฑ์ผ่านคือสิ่งตายตัว ไม่ใช่สิ่งที่ agent ปรับให้ตัวเองผ่าน
- ข้อ 6 = **ทิ้งสถานะสะอาด** ให้ session ถัดไปเริ่มได้ทันที

---

## 5. ห้าความล้มเหลว ห้าการแก้เชิงโครงสร้าง (Table 1)

| Agent ล้มเหลวอย่างไรในงานยาว | วิธีแก้ด้วย Harness |
|---|---|
| พยายามสร้างทั้งแอปในรอบเดียว | feature list, **หนึ่ง feature ต่อ session** |
| ประกาศว่าโปรเจกต์เสร็จเร็วเกินไป | ทุก feature เริ่มที่ `"passes": false` |
| ลืมทุกอย่างระหว่าง session | progress log + git history |
| เริ่มงานบนสภาพแวดล้อมที่พัง | `init.sh` + smoke test ก่อน |
| บอกว่างานที่ยังไม่ได้ทดสอบ "เสร็จแล้ว" | ทดสอบ end-to-end ในเบราว์เซอร์ |

> **"None of them is a better prompt."** — ไม่มีข้อไหนเลยที่แก้ด้วยการเขียน prompt ให้ดีขึ้น ทุกข้อแก้ด้วย **โครงสร้าง** (ไฟล์, สคริปต์, กติกา)

---

## 6. กฎของงานยาว (The long-run rule)

> **An agent doesn't need a bigger memory, it needs better notes. Design every session so a stranger could pick it up cold.**
>
> Agent ไม่ต้องการความจำที่ใหญ่ขึ้น แต่ต้องการ **บันทึกที่ดีขึ้น** — ออกแบบทุก session ให้ **คนแปลกหน้า** มารับงานต่อได้ทันทีโดยไม่ต้องมีบริบทใด ๆ

แบบทดสอบง่าย ๆ: ถ้าลบความจำ agent ทิ้งตอนนี้ แล้วให้คนใหม่อ่านแค่ `claude-progress.txt` + `git log` + `feature_list.json` เขาจะรู้ไหมว่า (1) ทำอะไรไปแล้ว (2) อะไรใช้ได้จริง (3) ต้องทำอะไรต่อ — ถ้าไม่ได้ บันทึกยังไม่ดีพอ

---

## 7. รายละเอียดเสริมจากบทความต้นฉบับ (พื้นหลัง ไม่ได้อยู่ในหน้าเดียว)

- Initializer ใช้ prompt **ต่างจาก** coding agent (เฉพาะ session แรก) แต่ทั้งคู่อาจเป็นโมเดล/ระบบเดียวกัน ต่างกันที่ prompt เริ่มต้น
- การทดสอบในเบราว์เซอร์ทำผ่านเครื่องมือ automation (เช่น Puppeteer MCP) เพื่อให้ agent คลิก/พิมพ์/ดูหน้าจอได้จริง
- ข้อจำกัดที่บทความยอมรับ: เครื่องมือเบราว์เซอร์บางอย่างมองไม่เห็นบางองค์ประกอบ (เช่น native alert/modal) จึงยังมีบั๊กหลุดได้
- คำถามเปิด: แบบ agent เดียวทั่วไป vs หลาย agent เฉพาะทาง (เช่น testing agent, QA agent) แบบไหนดีกว่า; และแนวคิดนี้ใช้กับงานนอกเหนือการพัฒนาเว็บได้แค่ไหน

---

## 8. แม่แบบนำไปใช้จริง

### `claude-progress.txt`
```
## Session 2026-11-07 #12
Feature: user can reset password  -> passes: true
Did: added /reset route, email token, form validation
Tested: browser e2e – request link, open link, set new password, log in
Broken / notes: none. Email is mocked in dev (see init.sh)
Next: highest-priority false = "user can edit profile"
Commit: a1b2c3d
```

### `init.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail
npm install
npm run dev &            # start the app
npx wait-on http://localhost:3000
echo "ready"
```

### Smoke test ขั้นต่ำ
เปิดแอป → ทำ feature หลักที่เคย `passes: true` สัก 1–2 ตัว → ถ้าพัง ให้แก้ก่อนเริ่ม feature ใหม่

---

## 9. แบบทดสอบความเข้าใจ (เฉลยท้าย)

1. Harness นี้มี agent กี่ตัว ทำหน้าที่อะไร?
2. ทำไมทุก feature ต้องเริ่มที่ `"passes": false`?
3. ขั้นแรกของทุก session คืออะไร และทำไม?
4. ถ้า smoke test พัง ต้องทำอะไร?
5. หนึ่ง session ทำได้กี่ feature?
6. ถ้า test ไม่ผ่าน แก้ test ให้ผ่านได้ไหม?
7. อะไรคือ "ความจำ" ของ agent ระหว่าง session?
8. ทำไมตาราง Table 1 จึงบอกว่า "ไม่มีข้อไหนคือ prompt ที่ดีขึ้น"?

<details><summary>เฉลย</summary>

1. สองตัว: Initializer (รันครั้งเดียว ตั้งค่า 4 ไฟล์) และ Coding agent (รันทุก session ทำทีละ feature)
2. กันการประกาศเสร็จก่อนเวลา — เสร็จได้ก็ต่อเมื่อทุกรายการถูกพิสูจน์ว่า true
3. อ่าน `claude-progress.txt` และ `git log` เพราะ session ใหม่จำอะไรไม่ได้
4. แก้ให้ใช้ได้ก่อน แล้วค่อยเริ่ม feature ใหม่
5. หนึ่งตัวเท่านั้น (ตัวที่สำคัญที่สุดที่ยัง false)
6. ไม่ได้ — ห้ามแก้หรือลบ test เพื่อให้ผ่าน
7. progress log + git history (และสถานะใน feature_list.json)
8. เพราะทุกปัญหาแก้ด้วยโครงสร้าง (ไฟล์ สคริปต์ กติกา) ไม่ใช่ถ้อยคำใน prompt

</details>
