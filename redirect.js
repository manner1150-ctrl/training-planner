/* เว็บห้องเรียนย้ายไป https://tnsu-coach.web.app (ต้องเข้าสู่ระบบด้วย Google) หน้านี้พาทุกลิงก์เก่าไปหน้าเดียวกันบนเว็บใหม่ */
(function (g) {
  var NEW = 'https://tnsu-coach.web.app/';
  function target(pathname, search, hash) {
    var rest = String(pathname || '/').replace(/^\/training-planner(\/|$)/, '').replace(/^\/+/, '');
    return NEW + rest + (search || '') + (hash || '');
  }
  g.TP_REDIRECT = { target: target };
  if (typeof location !== 'undefined') location.replace(target(location.pathname, location.search, location.hash));
})(typeof window !== 'undefined' ? window : globalThis);
