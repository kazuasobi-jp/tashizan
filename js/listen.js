/* 聞き取り（Web Speech API、ja-JP）。1回聞いて、聞き取った文字の候補を返す。
   返り値：{ type: "result", t: [文字…] } か { type: "error", error }（no-speech・network・timeout など）
   iPhone で終わりを待たずに受け取ったときは early: true。どちらにも ms＝{ o: マイクが開いた, sp: 声が届いた, e: 終わった }（start からのミリ秒。なければ null）を付ける（聞き取りの記録用）
   signal を abort すると聞くのをやめて AbortError。声は認識のため Google に送られる（数を話す間だけ） */
(function (root) {
  "use strict";
  const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
  // iPhone・iPad（iPadOS は Mac と名乗る）。iPhone の認識は話し終わってから結果が来るまでが遅い（10/23 実機「反応がちょっと遅い」）
  // → 途中の聞き取り（interim）を受け取り、数が出て言い足しがなければ、終わりを待たずに受け取る
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const SETTLE = 600;          // iPhone：答えの数が出てから、これだけ言い足しがなければ受け取る（「じゅう」→「じゅういち」を待つ）
  const SETTLE_OTHER = 1200;   // iPhone：答えでない数のときは長めに待つ（「ここ」→「ここのつ」、「し」→「しち」の言いかけで取らない）
  const SETTLE_NONUM = 1500;   // iPhone：数でない言葉のまま止まったら、これで受け取る（→ 聞き直し）
  const TIMEOUT = IOS ? 8000 : 12000;  // これより長く返事がなければ打ち切る（端末によって終わりが来ないことがある）

  /* hooks.onOpen：マイクが開いた（ここで「ピコッ」と光る） / hooks.onSpeech：声が届いた。ans：答え（iPhone の途中の聞き取りの待ち方に使う） */
  function once(sig, hooks = {}, ans = null) {
    return new Promise((resolve, reject) => {
      if (sig && sig.aborted) return reject(Sound.abortErr());
      let done = false, timer = null, settle = null, part = null;   // part：iPhone の途中の聞き取り
      const rec = new SR(), t0 = Date.now(), ms = { o: null, sp: null, e: null };
      const fin = (r, err) => {
        if (done) return; done = true;
        if (r) { ms.e = Date.now() - t0; r.ms = ms; }
        clearTimeout(timer); clearTimeout(settle); sig && sig.removeEventListener("abort", onAbort);
        try { rec.abort(); } catch (e) {}
        err ? reject(err) : resolve(r);
      };
      const onAbort = () => fin(null, Sound.abortErr());
      sig && sig.addEventListener("abort", onAbort, { once: true });
      rec.lang = "ja-JP"; rec.continuous = false; rec.interimResults = IOS; rec.maxAlternatives = 5;
      rec.onaudiostart = () => { if (done) return; ms.o = Date.now() - t0; if (hooks.onOpen) hooks.onOpen(); };
      rec.onspeechstart = () => { if (done) return; ms.sp = Date.now() - t0; if (hooks.onSpeech) hooks.onSpeech(); };
      rec.onresult = e => {
        if (done) return;
        const rs = e.results;
        // 区切られて届いたとき：最後のかたまりと、つないだもの（「じゅう」「いち」→ じゅういち。「じゅう」「じゅういち」と
        // それまでの文を毎回返す端末でも最後のかたまりで取れる）。pick は最後の数を取るので、つないだものを後ろに
        const t = rs.length > 1 ? [rs[rs.length - 1][0].transcript, Array.from(rs, r => r[0].transcript).join("")] : Array.from(rs[0], a => a.transcript);
        if (!IOS || rs[rs.length - 1].isFinal) return fin({ type: "result", t });
        // iPhone の途中の聞き取り（声が届いた合図が来ない端末もあるので、ここでも🎤を「届いた」に）
        if (ms.sp == null) { ms.sp = Date.now() - t0; if (hooks.onSpeech) hooks.onSpeech(); }
        clearTimeout(settle);
        const n = pick(t, ans); part = n == null ? null : t;
        settle = setTimeout(() => fin({ type: "result", t, early: true }), n == null ? SETTLE_NONUM : n === ans ? SETTLE : SETTLE_OTHER);
      };
      rec.onerror = e => fin({ type: "error", error: e.error });
      // 途中まで数が聞けていたらそれを（数でない途中の聞き取りなら、そっと聞き直すように error のまま）
      const partOr = error => (part ? { type: "result", t: part, early: true } : { type: "error", error });
      rec.onend = () => fin(partOr("no-result"));
      timer = setTimeout(() => fin(partOr("timeout")), TIMEOUT);
      try { rec.start(); } catch (e) { fin({ type: "error", error: "start-failed" }); }
    });
  }

  /* 聞き取った候補 → 数の並び（numparse.js）。答えが入っていれば答え、なければ最後の数（問題を言い直したときに頭の数を取らないよう）。数がなければ null */
  function pick(texts, ans) {
    const nums = [];
    texts.forEach(t => NumParse.parseNumber(t).forEach(n => nums.push(n)));
    if (nums.includes(ans)) return ans;
    return nums.length ? nums[nums.length - 1] : null;
  }

  root.Listen = { available: () => !!SR, once, pick };
})(window);
