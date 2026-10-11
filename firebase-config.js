/* ตั้งค่าเว็บฉบับนอก claude.ai — แก้ไฟล์นี้ไฟล์เดียว (ดูขั้นตอนใน SETUP-WEB.md)
   1) วางค่า firebaseConfig ที่คัดลอกจาก Firebase Console → Project settings → Your apps → Web app
   2) ใส่อีเมล Google ของอาจารย์ (ต้องตรงกับรายชื่อใน firestore.rules ด้วย)
   ค่า apiKey ของ Firebase เปิดเผยได้ ความปลอดภัยของข้อมูลมาจาก firestore.rules */
window.TP_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB0pnv5kBW2wd3JR9Nz39fY8nGAQIWQIco",
  authDomain: "training-planner-for-student.firebaseapp.com",
  projectId: "training-planner-for-student",
  storageBucket: "training-planner-for-student.firebasestorage.app",
  messagingSenderId: "256057258679",
  appId: "1:256057258679:web:eabd66d71305b6fd709332"
};
window.TP_TEACHER_EMAILS = [
  "manner1150@gmail.com"
];
