/* ตัวเชื่อมแทน claude.ai: ให้หน้าเว็บเดิมใช้ Firebase (Google Sign-in + Firestore) ผ่าน window.claude.use(...) แบบเดียวกับใน claude.ai
   - db        → Firestore (path เดิม: groups/{code}, indiv/{uid}, grades/{uid}, ggrades/{code})
   - user      → บัญชี Google ที่เข้าสู่ระบบ (อาจารย์ = อีเมลใน TP_TEACHER_EMAILS)
   - downloads → ดาวน์โหลดไฟล์ตรง (PDF)
   - mcp       → "สร้าง Google Sheet" ดาวน์โหลดเป็นไฟล์ CSV แทน (เปิดใน Google Sheets ได้)
   ยังไม่เข้าสู่ระบบ/ยังไม่ตั้งค่า Firebase: ใช้ได้แบบรายบุคคล (เก็บในเครื่อง) เหมือนฉบับฝึกเดี่ยว */
(function () {
  var V = '10.12.2', BASE = 'https://www.gstatic.com/firebasejs/' + V + '/';
  var cfg = window.TP_FIREBASE_CONFIG || {};
  var teachers = (window.TP_TEACHER_EMAILS || []).map(function (s) { return String(s).trim().toLowerCase(); });
  var configured = !!cfg.apiKey && !/^YOUR_/.test(cfg.apiKey);
  var ready = null;

  function init() {
    if (ready) return ready;
    ready = (async function () {
      if (!configured) return null;
      var m = await Promise.all([import(BASE + 'firebase-app.js'), import(BASE + 'firebase-auth.js'), import(BASE + 'firebase-firestore.js')]);
      var appMod = m[0], authMod = m[1], fs = m[2];
      var app = appMod.initializeApp(cfg);
      var auth = authMod.getAuth(app);
      var db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true });
      var user = await new Promise(function (res) { var off = authMod.onAuthStateChanged(auth, function (u) { off(); res(u); }); });
      window.__tpAuth = {
        user: user,
        // ให้ขึ้นหน้าเลือกบัญชีทุกครั้ง (เครื่องที่ใช้ร่วมกัน/ทดสอบหลายบัญชี) ไม่ล็อกอินบัญชีล่าสุดให้อัตโนมัติ
        signIn: function () { var pv = new authMod.GoogleAuthProvider(); pv.setCustomParameters({ prompt: 'select_account' }); return authMod.signInWithPopup(auth, pv).then(function () { location.reload(); }); },
        signOut: function () { return authMod.signOut(auth).then(function () { location.reload(); }); }
      };
      return { fs: fs, db: db, user: user };
    })().catch(function (e) { console.error('[firebase]', e); return null; });
    return ready;
  }

  // หน้าเว็บเดิมดูรหัสข้อผิดพลาด 'invalid_argument' เมื่อไม่มีสิทธิ์เขียน
  function mapErr(e) { if (e && e.code === 'permission-denied') { var x = new Error(e.message); x.code = 'invalid_argument'; throw x; } throw e; }
  function wrapDoc(s) { return { id: s.id, exists: s.exists(), data: function () { return s.data(); }, metadata: { hasPendingWrites: s.metadata.hasPendingWrites } }; }
  function dbNs(F) {
    var fs = F.fs, db = F.db;
    return {
      doc: function (p) {
        var r = fs.doc(db, p);
        return {
          set: function (d) { return fs.setDoc(r, d).catch(mapErr); },
          update: function (d) { return fs.updateDoc(r, d).catch(mapErr); },
          delete: function () { return fs.deleteDoc(r).catch(mapErr); },
          get: async function () { return wrapDoc(await fs.getDoc(r)); },
          onSnapshot: function (cb, err) { return fs.onSnapshot(r, function (s) { cb(wrapDoc(s)); }, err || function () {}); }
        };
      },
      collection: function (p) {
        return { onSnapshot: function (cb, err) { return fs.onSnapshot(fs.collection(db, p), function (s) { cb({ docs: s.docs.map(wrapDoc) }); }, err || function () {}); } };
      }
    };
  }
  function saveBlob(name, blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  window.claude = {
    use: async function (name) {
      if (name === 'downloads') return { save: async function (o) { saveBlob(o.filename, o.data instanceof Blob ? o.data : new Blob([o.data])); return { status: 'saved' }; } };
      var F = await init();
      var signedIn = !!(F && F.user);
      if (name === 'mcp') return signedIn ? {
        callTool: async function (server, tool, input) {
          var fname = String(input.title || 'scores').replace(/[\\/:*?"<>|]+/g, '-') + '.csv';
          saveBlob(fname, new Blob(['﻿' + input.textContent], { type: 'text/csv;charset=utf-8' })); // BOM ให้ภาษาไทยอ่านถูกใน Sheets/Excel
          return { payload: {} };
        }
      } : null;
      if (!signedIn) return null;
      if (name === 'db') return dbNs(F);
      if (name === 'user') {
        var email = String(F.user.email || '').toLowerCase(), isT = teachers.indexOf(email) >= 0;
        return { isOwner: async function () { return isT; }, canEdit: async function () { return isT; }, id: async function () { return F.user.uid; }, me: async function () { return { id: F.user.uid, name: F.user.displayName || '' }; } };
      }
      return null;
    }
  };

  // ข้อความเฉพาะเว็บ: ปุ่ม "สร้าง Google Sheet" กลายเป็นดาวน์โหลด CSV (L = พจนานุกรมภาษาของหน้าเว็บ ประกาศใน script ของหน้า)
  function patchText() {
    try {
      if (typeof L === 'undefined') return;
      Object.assign(L.th, { toSheet: 'ดาวน์โหลด CSV (เปิดใน Google Sheets)', sheetMaking: 'กำลังสร้างไฟล์ CSV…', sheetDoneNoLink: 'ดาวน์โหลดแล้ว: เปิด Google Sheets → ไฟล์ → นำเข้า แล้วเลือกไฟล์ชื่อ', sheetNoMcp: 'เข้าสู่ระบบด้วย Google ก่อน แล้วลองอีกครั้ง', sheetNote: 'กด "ดาวน์โหลด CSV" ได้ไฟล์คะแนน ณ เวลานั้น แล้วเปิด Google Sheets → ไฟล์ → นำเข้า เพื่อเปิดเป็นชีต ถ้าต้องการเพิ่มลงชีตเดิม ใช้ "คัดลอกเป็นตาราง" แล้ววางต่อท้าย' });
      Object.assign(L.en, { toSheet: 'Download CSV (open in Google Sheets)', sheetMaking: 'Creating CSV file…', sheetDoneNoLink: 'Downloaded. In Google Sheets choose File → Import and pick the file named', sheetNoMcp: 'Sign in with Google first, then try again', sheetNote: '"Download CSV" saves the scores at that moment. Open it in Google Sheets via File → Import. To add to an existing sheet, use "Copy as table" and paste below the last row' });
      Object.assign(L.zh, { toSheet: '下载 CSV(可在 Google Sheets 打开)', sheetMaking: '正在生成 CSV 文件…', sheetDoneNoLink: '已下载:在 Google Sheets 选择 文件 → 导入,并选择文件', sheetNoMcp: '请先使用 Google 登录后再试', sheetNote: '"下载 CSV"保存当时的成绩,可在 Google Sheets 通过 文件 → 导入 打开。如需追加到已有表格,请用"复制为表格"后粘贴到末行下方' });
    } catch (e) {}
  }
  // ปุ่มเข้าสู่ระบบ/ออกจากระบบ บนแถบหัว
  function addAuthButton() {
    patchText();
    var host = document.querySelector('.switches'); if (!host || document.getElementById('tpAuthBtn')) return;
    // ลิงก์กลับหน้าแรกของเว็บ (index.html = หน้าแรก, planner.html = โปรแกรม) — มีเฉพาะเว็บ ไม่อยู่ในฉบับ claude.ai
    if (!document.getElementById('tpHomeBtn')) { var h = document.createElement('a'); h.id = 'tpHomeBtn'; h.className = 'btn small'; h.href = 'index.html'; h.textContent = '🏠 หน้าแรก'; h.style.textDecoration = 'none'; h.style.display = 'inline-flex'; h.style.alignItems = 'center'; host.insertBefore(h, host.firstChild); }
    var b = document.createElement('button'); b.id = 'tpAuthBtn'; b.className = 'btn small'; b.type = 'button';
    if (!configured) { b.textContent = 'ยังไม่ได้ตั้งค่า Firebase'; b.disabled = true; host.appendChild(b); return; }
    b.textContent = 'กำลังตรวจสอบ…'; host.appendChild(b);
    init().then(function () {
      var A = window.__tpAuth;
      if (!A) { b.textContent = 'เชื่อมต่อไม่ได้'; b.disabled = true; return; }
      if (A.user) { b.textContent = 'ออกจากระบบ (' + (A.user.email || '') + ')'; b.onclick = function () { A.signOut(); }; }
      else { b.textContent = 'เข้าสู่ระบบด้วย Google'; b.className = 'btn small primary'; b.onclick = function () { A.signIn().catch(function (e) { alert('เข้าสู่ระบบไม่สำเร็จ: ' + (e && e.message || e)); }); }; }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addAuthButton); else addAuthButton();
})();
