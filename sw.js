/* 配筋検査アプリ：オフライン用のキャッシュ
   - アプリの画面は「ネット優先・つながらなければ保存済みのもの」で、更新がすぐ届くようにする
   - Excel作成の部品（CDN）は一度取得したら保存したものを使う */
const VERSION = "v5";   // CORE・CDN のファイル構成を変えたときだけ上げる（画面の更新はネット優先なので不要）
const CACHE = "haikin-" + VERSION;
const WAIT = 2500;   // 電波が弱いとき、ネットの返事をこれだけ待ったら保存済みの版で開く（ミリ秒）
const CORE = ["./", "./index.html", "./app.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "./manual/", "./manual/index.html", ...["01_start", "02_list", "03_card", "04_items", "05_plan", "06_select", "07_find", "08_finds", "09_sheet", "10_export"].map(n => "./manual/img/" + n + ".jpg")];
const CDN = ["https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(CORE);
    /* CDN の部品は index.html で照合値（SRI）付き・CORS で読み込むので、CORS で取得して保存する */
    await Promise.all(CDN.map(u => fetch(u, { mode: "cors", credentials: "omit" }).then(r => { if (r.ok) return c.put(u, r); }).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("haikin-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (CDN.includes(req.url)) {
    e.respondWith(caches.match(req.url).then(hit => hit || fetch(req).then(r => {
      if (r.ok && r.type === "cors") { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req.url, copy)); }
      return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  /* 電波があるときは毎回サーバーに最新を確かめる（ブラウザの一時保存で古い版が使われないように）。
     ただし地下などで電波が弱く WAIT ミリ秒たっても返事がなければ、保存済みの版ですぐ開く（遅れて届いた最新版は保存して次回から使う） */
  const net = fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then(r => {
    if (r.ok) { const copy = r.clone(); return caches.open(CACHE).then(c => c.put(req, copy)).then(() => r, () => r); }
    return r;
  });
  const saved = () => caches.match(req, { ignoreSearch: true })
    .then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined));
  e.waitUntil(net.catch(() => {}));   // 返事が遅れて届いても、保存まで終わらせる
  e.respondWith(new Promise(resolve => {
    let done = false; const give = r => { if (!done) { done = true; resolve(r); } };
    const t = setTimeout(() => saved().then(r => { if (r) give(r); }), WAIT);   // 保存済みがなければ、ネットの返事を待ち続ける
    net.then(r => { clearTimeout(t); give(r); },
      () => { clearTimeout(t); saved().then(r => give(r || Response.error())); });
  }));
});
