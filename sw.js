/* オフライン用の Service Worker。版・画面の一覧・音の一覧は tools/build.py が埋める（手元の "dev" では登録しない）。
   画面・JS：ネット優先（直したら次に開いたときに新しくなる）。つながらない・遅い（3秒）ときは手元の写し。
   音：手元の写し優先。URL に音ごとのハッシュ（?v=）が付いていて、変わった音だけ取り直す（全部で数MBあるので）。
   更新の知らせは出さない（ネット優先なので、すぐ切り替えてよい）。 */
const VER = "__VERSION__";
const SHELL = __SHELL__;   // 画面・JS・アイコン（この場所からの相対）
const AUDIO = __AUDIO__;   // 音（?v=ハッシュ 付き）
const SHELL_CACHE = "tz-shell-" + VER, AUDIO_CACHE = "tz-audio";
const abs = u => new URL(u, self.location).href;
const AUDIO_SET = new Set(AUDIO.map(abs));
const TOP = new URL("./", self.location).pathname;   // 公開版のトップ（…/tashizan/）

self.addEventListener("install", e => {
  e.waitUntil(Promise.all([
    // 画面と JS は全部そろわないと入れ替えない（ブラウザの HTTP キャッシュは使わず取る）
    caches.open(SHELL_CACHE).then(c => Promise.all(SHELL.map(async u => {
      const res = await fetch(new Request(u, { cache: "reload" }));
      if (!res.ok) throw new Error(u + " " + res.status);
      await c.put(u, res);
    }))),
    // 音は持っていないものだけ取る。取れなかったものは鳴らすときに取る
    caches.open(AUDIO_CACHE).then(c => Promise.all(AUDIO.map(async u => {
      try { if (!(await c.match(u))) { const res = await fetch(u); if (res.ok) await c.put(u, res); } } catch (err) {}
    }))),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("tz-shell-") && k !== SHELL_CACHE).map(k => caches.delete(k)));
    const ac = await caches.open(AUDIO_CACHE);   // 使わなくなった音（古いハッシュ）を消す
    await Promise.all((await ac.keys()).filter(r => !AUDIO_SET.has(r.url)).map(r => ac.delete(r)));
    await self.clients.claim();
  })());
});

const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));

/* ネット優先：取れたら写しも新しくする。だめなら写し */
async function netFirst(req, key) {
  const c = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([fetch(req), timeout(3000)]);
    if (res.ok) c.put(key || req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await c.match(key || req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

/* 写し優先（音） */
async function cacheFirst(req) {
  const c = await caches.open(AUDIO_CACHE);
  const hit = await c.match(req).catch(() => null);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone()).catch(() => {});
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (AUDIO_SET.has(url.href)) { e.respondWith(cacheFirst(req)); return; }
  // トップ（…/ と …/index.html）だけ写しを持つ。ほかのページ（test/ など）はネットに任せる
  if (req.mode === "navigate") {
    if (url.pathname === TOP || url.pathname === TOP + "index.html") e.respondWith(netFirst(req, abs("./")));
    return;
  }
  if (SHELL.some(u => abs(u) === url.origin + url.pathname)) e.respondWith(netFirst(req));
});
