/* 聞き取り（Web Speech API、ja-JP）。1回聞いて、聞き取った文字の候補を返す。
   返り値：{ type: "result", t: [文字…] } か { type: "error", error }（no-speech・network・timeout など）
   signal を abort すると聞くのをやめて AbortError。声は認識のため Google に送られる（数を話す間だけ） */
(function (root) {
  "use strict";
  const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
  const TIMEOUT = 12000;  // これより長く返事がなければ打ち切る（端末によって終わりが来ないことがある）

  /* hooks.onOpen：マイクが開いた（ここで「ピコッ」と光る） / hooks.onSpeech：声が届いた */
  function once(sig, hooks = {}) {
    return new Promise((resolve, reject) => {
      if (sig && sig.aborted) return reject(Sound.abortErr());
      let done = false, timer = null;
      const rec = new SR();
      const fin = (r, err) => {
        if (done) return; done = true;
        clearTimeout(timer); sig && sig.removeEventListener("abort", onAbort);
        try { rec.abort(); } catch (e) {}
        err ? reject(err) : resolve(r);
      };
      const onAbort = () => fin(null, Sound.abortErr());
      sig && sig.addEventListener("abort", onAbort, { once: true });
      rec.lang = "ja-JP"; rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 5;
      rec.onaudiostart = () => { if (!done && hooks.onOpen) hooks.onOpen(); };
      rec.onspeechstart = () => { if (!done && hooks.onSpeech) hooks.onSpeech(); };
      rec.onresult = e => {
        const r0 = e.results[0], t = [];
        for (let i = 0; i < r0.length; i++) t.push(r0[i].transcript);
        fin({ type: "result", t });
      };
      rec.onerror = e => fin({ type: "error", error: e.error });
      rec.onend = () => fin({ type: "error", error: "no-result" });
      timer = setTimeout(() => fin({ type: "error", error: "timeout" }), TIMEOUT);
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
