/* たしざん 本体の流れ。
   画面：start（はじめる）→ play（5問）→ sheet（シール）→ start か rest（またあしたね）。⚙️3秒長押しで parent（おとな）
   止め方：1回ごとに AbortController を作り、画面を離れるとき abort する（音・聞き取り・待ちがまとめて止まる） */
"use strict";
const $ = id => document.getElementById(id);
const STICKERS = ["🚀", "🪐", "🌙", "☄️", "🛸", "🌈", "👽", "🌍", "✨", "🌟"];
const FIXED = ["hajimeru", "pikotte", "mouichido", "button", "kangaeyou", "kazoeyou", "iete", "yattane", "kangaeta", "kazoeta",
  "ganbatta", "oshimai", "seal", "ashita"].map(k => "p/" + k)
  .concat(Array.from({ length: 11 }, (_, n) => "ok/" + n), Array.from({ length: 10 }, (_, n) => "n/" + (n + 1)));
const noop = () => {};
const isAbort = e => e && e.name === "AbortError";
const wait = Sound.wait;

let ctrl = null;          // 進行中の回（や「またあしたね」の声）を止める
let voiceDown = false;    // マイクが許可されていない → この起動中はボタンで
let qSeq = 0;             // 問題の通し番号（前の問題の「2秒で消す」が次の問題に効かないように）

/* ---------- 画面 ---------- */
const SCREENS = ["start", "rest", "play", "sheet", "parent"];
function show(id) {
  SCREENS.forEach(s => $(s).hidden = s !== id);
  document.body.dataset.screen = id;
  $("gear").hidden = id === "parent";
  scrollTo(0, 0);
}
const screen = () => document.body.dataset.screen;
function stopAll() {
  if (ctrl) ctrl.abort(); ctrl = null;
  Sound.stop(); $("fx").innerHTML = ""; $("gift").hidden = true; $("choices").hidden = true; $("mic").hidden = false;
}
/* 進む画面は履歴に積む（Android の戻るで はじめる画面に戻れるように） */
function enter(s) { if (history.state && history.state.s) history.replaceState({ s }, ""); else history.pushState({ s }, ""); }
function leave() { if (history.state && history.state.s) history.back(); else goHome(); }   // → popstate → goHome
addEventListener("popstate", () => { const from = screen(); goHome(from === "sheet"); });

function goHome(afterRound = false) {
  stopAll(); wakeLock(false);
  drawMini($("miniStart")); drawMini($("miniRest"));
  if (Store.todayLeft() <= 0) {
    show("rest");
    if (afterRound) { ctrl = new AbortController(); Sound.play("p/ashita", ctrl.signal).catch(noop); }
  } else show("start");
}
$("moon").onclick = () => { Sound.unlock(); Sound.play("p/ashita").catch(noop); };

// ほかのアプリに移ったら止めて、はじめる画面に戻す（その回は数えない。聞き取りが止まって「ボタンで」に進まないように）
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { if (screen() === "play") { stopAll(); leave(); } }
  else if (screen() === "start" || screen() === "rest") goHome();   // 日付が変わっていたら はじめる に
});

/* 画面を消さない（問題の間だけ） */
let lock = null;
async function wakeLock(on) {
  try {
    if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
    else if (!on && lock) { const l = lock; lock = null; await l.release(); }
  } catch (e) {}
}

/* ---------- 歯車の3秒長押し → おとなの画面 ---------- */
let gearTimer = null;
const gearOff = () => { clearTimeout(gearTimer); $("gear").classList.remove("hold"); };
$("gear").addEventListener("pointerdown", () => { $("gear").classList.add("hold"); gearTimer = setTimeout(() => { gearOff(); openParent(); }, 3000); });
["pointerup", "pointerleave", "pointercancel"].forEach(ev => $("gear").addEventListener(ev, gearOff));
$("gear").addEventListener("contextmenu", e => e.preventDefault());

/* ---------- シール ---------- */
const sticker = (sheetNo, i) => STICKERS[(i + sheetNo * 3) % STICKERS.length];   // 台紙ごとに並びを少しずらす
function drawMini(box) {  // はじめる画面の小さな台紙（いまの台紙）
  const n = Store.stickers(), sheetNo = n ? Math.floor((n - 1) / 10) : 0, k = n ? (n - 1) % 10 + 1 : 0;
  box.innerHTML = "";
  for (let i = 0; i < 10; i++) { const s = document.createElement("span"); if (i < k) { s.textContent = sticker(sheetNo, i); s.className = "on"; } box.appendChild(s); }
}

/* まず真ん中に大きく出す → 子がさわると台紙に飛んで貼られる */
function showSheet(n, sig) {
  const sheetNo = Math.floor((n - 1) / 10), idx = (n - 1) % 10, bd = $("board");
  bd.innerHTML = "";
  for (let i = 0; i < 10; i++) { const s = document.createElement("span"); if (i < idx) { s.textContent = sticker(sheetNo, i); s.className = "on"; } bd.appendChild(s); }
  $("sheetEnd").hidden = true; $("hint").textContent = "シールを さわってね";
  enter("sheet"); show("sheet");
  const g = $("gift"); g.textContent = sticker(sheetNo, idx); g.className = ""; g.style.transform = ""; g.hidden = false;
  Sound.play("p/seal", sig).catch(noop);
  g.onclick = () => {
    g.onclick = null;
    const slot = bd.children[idx].getBoundingClientRect(), r = g.getBoundingClientRect();
    const dx = slot.left + slot.width / 2 - (r.left + r.width / 2), dy = slot.top + slot.height / 2 - (r.top + r.height / 2);
    g.className = "fly"; g.style.transform = `translate(${dx}px, ${dy}px) scale(${slot.width / r.width})`;
    wait(650, sig).then(() => {
      g.hidden = true; bd.children[idx].textContent = sticker(sheetNo, idx); bd.children[idx].className = "on";
      $("hint").textContent = ""; $("sheetEnd").hidden = false;
      return Sound.play("p/yattane", sig);
    }).catch(noop);
  };
}
$("sheetEnd").onclick = leave;

/* ---------- 問題の画面の部品 ---------- */
/* マイクの見た目：""＝待ち / speak＝読み上げ中 / on＝聞いている / heard＝声が届いた */
function setMic(state) { const m = $("mic"); m.className = state; m.textContent = state === "speak" ? "🔊" : "🎤"; }
async function say(name, sig) { setMic("speak"); try { await Sound.play(name, sig); } finally { setMic(""); } }
const text = s => { $("say").textContent = s; };

function drawFrame(a, b) {
  const fr = $("frame"); fr.innerHTML = ""; const cells = [];
  for (let i = 0; i < 10; i++) {
    const s = document.createElement("span");
    if (i < a + b) { const t = document.createElement("i"); t.className = i < a ? "tok" : "tok b"; s.appendChild(t); }
    fr.appendChild(s); cells.push(s);
  }
  return cells;
}
const frameOn = on => $("frame").classList.toggle("off", !on);
function drawProg(done, total, bump) {
  const p = $("prog"); p.innerHTML = "";
  for (let i = 0; i < total; i++) { const s = document.createElement("span"); s.textContent = "⭐";
    s.className = i < done ? (bump && i === done - 1 ? "new" : "") : "todo"; p.appendChild(s); }
}
function showAns(n) { $("ans").textContent = n == null ? "?" : n; $("ans").className = n == null ? "" : "got"; }

function celebrate() {  // ほしが はじける
  const fx = $("fx"), box = $("ans").getBoundingClientRect();
  const cx = Math.min(Math.max(box.left + box.width / 2, 100), innerWidth - 100), cy = box.top + box.height / 2;
  fx.innerHTML = "";
  for (let i = 0; i < 12; i++) {
    const s = document.createElement("span"), a = i / 12 * Math.PI * 2, r = 100 + Math.random() * 60;
    s.className = "spark"; s.textContent = i % 3 ? "⭐" : "✨"; s.style.left = cx - 16 + "px"; s.style.top = cy - 16 + "px";
    s.style.setProperty("--dx", Math.cos(a) * r + "px"); s.style.setProperty("--dy", Math.sin(a) * r + "px"); fx.appendChild(s);
  }
  setTimeout(() => { fx.innerHTML = ""; }, 2000);
}

/* ---------- 答えを1つ得る：声（無反応・数でないときは1回聞き直し）→ だめならボタン ---------- */
function askButtons(opts, sig) {
  return new Promise((resolve, reject) => {
    const box = $("choices"); box.innerHTML = ""; box.hidden = false; $("mic").hidden = true;  // ボタンの間は🎤を隠す
    const close = () => { box.hidden = true; box.innerHTML = ""; $("mic").hidden = false; sig.removeEventListener("abort", onAbort); };
    const onAbort = () => { close(); reject(Sound.abortErr()); };
    sig.addEventListener("abort", onAbort, { once: true });
    opts.forEach(n => { const b = document.createElement("button"); b.textContent = n;
      b.onclick = () => { close(); resolve(n); }; box.appendChild(b); });
  });
}

/* 1回分の「聞く時間」。Android の認識は数秒黙ると切れる（変えられない）ので、声が来ないまま切れたら
   🎤を光らせたまま WAIT_MS までそっと聞き直す（10/17 実機で「答えるまでの時間が短い」） */
const WAIT_MS = 8000;   // 10/17 は15秒 → 10/20 実機で「長すぎる」
async function listenFor(sig) {
  const t0 = Date.now();
  let opened = false, r;
  for (;;) {
    r = await Listen.once(sig, { onOpen: () => { setMic("on"); if (!opened) Sound.ping(); opened = true; }, onSpeech: () => setMic("heard") });
    if (r.type === "result" || !["no-speech", "no-result", "timeout"].includes(r.error) || Date.now() - t0 >= WAIT_MS) return r;
    setMic("on");   // 声が届いた表示を戻す（数として聞き取れないまま切れたとき）
  }
}

async function getAnswer(ans, opts, input, sig) {
  if (input === "voice" && Listen.available() && navigator.onLine && !voiceDown) {
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const r = await listenFor(sig);
      setMic("");
      if (r.type === "result") { const n = Listen.pick(r.t, ans); if (n != null) return { n, by: "voice" }; }  // 数として聞き取れなければ不正解にしない
      else if (["not-allowed", "service-not-allowed", "audio-capture"].includes(r.error)) { voiceDown = true; break; }
      else if (r.error === "network") break;
      if (tryNo === 0) { text("もういちど いってね"); await say("p/mouichido", sig); await wait(300, sig); }
    }
    text("ボタンで こたえてね"); say("p/button", sig).catch(noop);   // 待たない（ボタンを押したら次の声で止まる）
  }
  return { n: await askButtons(opts, sig), by: "button" };
}

/* ---------- 1問 ---------- */
async function askOne(q, set, sig, onSolved) {
  const { a, b } = q, ans = a + b, my = ++qSeq;
  $("qa").textContent = a; $("qb").textContent = b; showAns(null); text("");
  const cells = drawFrame(a, b), opts = Quiz.makeOpts(a, b, ans);
  let keep = false;   // まちがえて絵を出したら、もう消さない
  frameOn(set.fade === "show" || set.fade === "flash");
  if (set.fade === "flash") wait(2000, sig).then(() => { if (my === qSeq && !keep) frameOn(false); }).catch(noop);

  let miss = 0, first = null;
  for (;;) {
    text("");
    await say(`q/${a}_${b}`, sig); await wait(300, sig);
    const t0 = Date.now(), got = await getAnswer(ans, opts, set.input, sig), secs = (Date.now() - t0) / 1000;
    if (!first) first = { secs, by: got.by };
    if (got.n === ans) {
      showAns(ans); text("せいかい！"); celebrate(); onSolved();
      await say(`ok/${ans}`, sig);
      if (miss || secs > 5) await say("p/kangaeta", sig);   // じっくり考えて正解したときは、やり方をほめる
      break;
    }
    if (++miss === 1) {   // 1回目：もういっかい（絵を減らしているときは、ここで絵を出す）
      if (set.fade !== "none") { keep = true; frameOn(true); }
      text("もういっかい かんがえよう"); await say("p/kangaeyou", sig);
      continue;
    }
    // 2回目：一緒に数える → 子に言わせる → この回の最後にもう一度
    keep = true; frameOn(true);
    text("いっしょに かぞえよう"); await say("p/kazoeyou", sig);
    for (let k = 0; k < ans; k++) { cells[k].classList.add("lit"); await say(`n/${k + 1}`, sig); }
    await wait(400, sig);
    text("こたえは いくつかな？"); await say("p/iete", sig); await wait(300, sig);
    await getAnswer(ans, opts, set.input, sig);   // 何と言っても受け取る
    cells.forEach(c => c.classList.remove("lit"));
    showAns(ans); text(""); onSolved();
    await say("p/kazoeta", sig);
    break;
  }
  return { miss, secs: Math.round(first.secs * 10) / 10, voice: first.by === "voice" };
}

/* ---------- 1回（5問） ---------- */
async function startRound() {
  if (Store.todayLeft() <= 0) { goHome(); return; }
  Sound.unlock(); stopAll();
  ctrl = new AbortController(); const sig = ctrl.signal;
  const set = Store.settings(), qs = Quiz.makeRound(set.stage), firstToday = Store.roundsToday() === 0;
  enter("play"); show("play"); wakeLock(true);
  setMic(""); drawProg(0, qs.length); $("qa").textContent = $("qb").textContent = ""; showAns(null); $("frame").innerHTML = ""; text("");
  try {
    await Promise.race([Sound.preload(qs.map(q => `q/${q.a}_${q.b}`)), wait(3000, sig)]);   // その回の問題の声を先に読む
    await say("p/hajimeru", sig);
    if (firstToday) await say("p/pikotte", sig);   // 「ピコッてなったら いってね」（その日の1回目だけ）
    await wait(300, sig);
    const queue = qs.map(q => Object.assign({ again: false }, q));
    let done = 0, firsts = 0;
    while (queue.length) {
      const q = queue.shift();
      const r = await askOne(q, set, sig, () => { if (!q.again) drawProg(++done, qs.length, true); });
      Store.addQuestion({ s: q.s, rs: set.stage, a: q.a, b: q.b, f: r.miss ? 0 : 1, m: r.miss, sec: r.secs, v: r.voice ? 1 : 0, r: q.again ? 1 : 0 });
      if (!q.again && !r.miss) firsts++;
      if (!q.again && r.miss >= 2) queue.push(Object.assign({}, q, { again: true }));
      await wait(700, sig);
    }
    const n = Store.addRound({ s: set.stage, f: firsts });
    await say("p/oshimai", sig); await say("p/ganbatta", sig);
    wakeLock(false);
    showSheet(n, sig);
  } catch (e) { if (!isAbort(e)) { console.error(e); goHome(); } }
}
$("go").onclick = startRound;

/* ---------- おとなの画面 ---------- */
function openParent() { stopAll(); wakeLock(false); enter("parent"); drawParent(); show("parent"); }
$("back").onclick = leave;

function radios(box, name, items, value, disabled = []) {
  box.innerHTML = "";
  items.concat(disabled.map(l => [null, l])).forEach(([v, label, note]) => {
    const l = document.createElement("label"), i = document.createElement("input");
    i.type = "radio"; i.name = name;
    if (v == null) { i.disabled = true; l.className = "off"; } else { i.value = v; i.checked = v === value; }
    l.append(i, " " + label + (v == null ? "（これから）" : ""));
    if (note) { const s = document.createElement("small"); s.textContent = "　" + note; l.appendChild(s); }
    box.appendChild(l);
  });
}
function drawParent() {
  const st = Store.settings();
  radios($("stages"), "stage", Quiz.STAGES.map(s => [s.id, s.label, s.note]), st.stage, Quiz.LATER);
  radios($("fades"), "fade", Store.FADES, st.fade);
  document.querySelectorAll('input[name="input"]').forEach(i => { i.checked = i.value === st.input; });
  $("limit").textContent = st.limit;
  $("todayN").textContent = `きょう ${Store.roundsToday()}回（のこり ${Math.max(0, Store.todayLeft())}回）`;

  const ad = Store.advice(st.stage);
  const tip = ad.down ? '<span class="tip down">戻しどき（直近2回とも5問中2問以下）</span>'
    : ad.up ? '<span class="tip up">上げどき（目安を満たしました）</span>' : '<span class="tip">まだこのまま</span>';
  $("advice").innerHTML = `この段階の直近${ad.n}問：一発正解 ${ad.firsts}問・${ad.days}日・答えるまで中央値 ${ad.med == null ? "-" : ad.med + "秒"}<br>${tip}`
    + "<br>目安：上げる＝直近15問中13問以上一発正解・3日以上・中央値5秒以内／戻す＝2回続けて5問中2問以下。決めるのはおとなです。";

  const rows = Store.days();
  $("days").innerHTML = rows.length ? rows.map(x => `<tr><td>${x.d.slice(5).replace("-", "/")}</td><td>${x.rounds}</td><td>${x.n}</td>`
    + `<td>${x.firsts}${x.n ? `（${Math.round(x.firsts / x.n * 100)}%）` : ""}</td><td>${x.med == null ? "-" : x.med + "秒"}</td></tr>`).join("")
    : '<tr><td colspan="5">まだありません</td></tr>';
  $("ver").textContent = (window.APP && APP.ver) || "dev";
  $("copied").textContent = "";
}
$("parent").addEventListener("change", e => {
  const i = e.target; if (i.type !== "radio") return;
  Store.saveSettings({ [i.name]: i.value }); drawParent();
});
const bumpLimit = d => { const st = Store.settings(); Store.saveSettings({ limit: Math.min(9, Math.max(1, st.limit + d)) }); drawParent(); };
$("limDown").onclick = () => bumpLimit(-1);
$("limUp").onclick = () => bumpLimit(1);
$("copy").onclick = async () => {
  const t = Store.exportText();
  try { await navigator.clipboard.writeText(t); $("copied").textContent = "コピーしました"; }
  catch (e) {   // 古い方法
    const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); $("copied").textContent = "コピーしました"; } catch (e2) { $("copied").textContent = "コピーできませんでした"; }
    ta.remove();
  }
};
$("clear").onclick = () => {
  if (!confirm("記録とシールを全部消します。よいですか？（設定は残ります）")) return;
  Store.clearRecords(); drawParent();
};

/* ---------- 起動 ---------- */
Store.persist();
Sound.preload(FIXED);   // 決まった言葉・数は先に読み込む
goHome();
