/* 音：Web Audio で鳴らす（先に読み込んで decode しておく → すぐ鳴る・止めたら確実に終わる）。
   鳴らすのは1つずつ（新しく鳴らすと前のは止まる）。
   止め方は AbortSignal：signal を abort すると、鳴っている音が止まり、待っている側には AbortError が返る。 */
(function (root) {
  "use strict";
  const APP = root.APP || {};
  // 音の URL に版を付ける（作り直した音が古いまま残らないように）。公開版は build.py がファイルごとのハッシュを入れる
  const url = name => `audio/${name}.${APP.audioExt || "wav"}?v=${(APP.audio && APP.audio[name]) || APP.ver || "dev"}`;

  let ctx = null, cur = null;
  const bufs = new Map();

  const abortErr = () => new DOMException("止めました", "AbortError");
  const check = sig => { if (sig && sig.aborted) throw abortErr(); };
  function audioCtx() {
    if (!ctx) { const AC = root.AudioContext || root.webkitAudioContext; if (AC) ctx = new AC(); }
    return ctx;
  }
  /* 「はじめる」などのタップの中で呼ぶ（スマホはタップしないと音が出ない） */
  function unlock() { try { const c = audioCtx(); if (c && c.state !== "running") c.resume(); } catch (e) {} }

  /* 読み込んで decode する（同じ名前は1回だけ。失敗したら次に読み直す） */
  function load(name) {
    if (!bufs.has(name)) {
      const p = fetch(url(name))
        .then(r => { if (!r.ok) throw new Error(name + " " + r.status); return r.arrayBuffer(); })
        .then(ab => audioCtx().decodeAudioData(ab));
      p.catch(() => bufs.delete(name));
      bufs.set(name, p);
    }
    return bufs.get(name);
  }
  const preload = names => Promise.all(names.map(n => load(n).catch(() => null)));

  /* 鳴らして、終わるまで待つ。音がない・読めないときは鳴らさずに先へ進む */
  async function play(name, sig) {
    stop(); check(sig);
    let buf = null;
    try { buf = await load(name); } catch (e) { console.warn("音がありません", name, e); }
    check(sig);
    const c = audioCtx();
    if (!buf || !c) return;
    // resume はタップのあとでないと終わらないことがあるので、待ちすぎない
    if (c.state !== "running") { await Promise.race([c.resume().catch(() => {}), wait(300)]); check(sig); }
    return new Promise((resolve, reject) => {
      const src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination);
      const me = {};
      const end = err => {
        if (me.done) return; me.done = true;
        clearTimeout(me.timer); sig && sig.removeEventListener("abort", onAbort);
        if (cur === me) cur = null;
        src.onended = null; try { src.stop(); } catch (e) {}
        err ? reject(err) : resolve();
      };
      const onAbort = () => end(abortErr());
      me.finish = () => end();
      src.onended = () => end();
      sig && sig.addEventListener("abort", onAbort, { once: true });
      // 保険：画面が消えたなどで onended が来なくても、音の長さ＋1秒で先へ
      me.timer = setTimeout(() => end(), (buf.duration + 1) * 1000);
      cur = me; src.start();
    });
  }
  function stop() { if (cur) cur.finish(); }

  /* マイクが開いた合図「ピコッ」 */
  function ping() {
    const c = ctx; if (!c) return;
    try {
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.2);
    } catch (e) {}
  }

  /* ms 待つ。signal で止めると AbortError */
  function wait(ms, sig) {
    return new Promise((resolve, reject) => {
      if (sig && sig.aborted) return reject(abortErr());
      const t = setTimeout(() => { sig && sig.removeEventListener("abort", onAbort); resolve(); }, ms);
      const onAbort = () => { clearTimeout(t); reject(abortErr()); };
      sig && sig.addEventListener("abort", onAbort, { once: true });
    });
  }

  root.Sound = { url, unlock, load, preload, play, stop, ping, wait, abortErr };
})(window);
