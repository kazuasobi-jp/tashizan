/* 問題の作り方。段階ごとに1回分（5問）を作る。画面や音には触らない（テストしやすいように） */
(function (root) {
  "use strict";

  // a+b が 10 までの組から、条件に合うものを集める（音声 q/a_b があるのはこの範囲）
  const pairs = test => {
    const r = [];
    for (let a = 0; a <= 10; a++) for (let b = 0; a + b <= 10; b++) if (test(a, b)) r.push([a, b]);
    return r;
  };

  // id は記録に残すので変えない。prev＝前の段階（その段階の問題を少し混ぜる）
  const STAGES = [
    { id: "s1", label: "① 答え5まで", note: "1+1 〜 4+1（0 は出さない）", pool: pairs((a, b) => a >= 1 && b >= 1 && a + b <= 5) },
    { id: "s1b", label: "①' 5といくつ", note: "5+1 〜 5+5（①を1問まぜる）", pool: pairs((a, b) => a === 5 && b >= 1), prev: "s1" },
    // ②：①' は ② の中に入っているので、混ぜる前の段階は ①（答え5まで）にする
    { id: "s2", label: "② 答え6〜10", note: "1+5 〜 9+1（ときどき 0 と 入れかえ。①を1問まぜる）",
      pool: pairs((a, b) => a >= 1 && b >= 1 && a + b >= 6), zero: pairs((a, b) => (a === 0 || b === 0) && a + b >= 6), prev: "s1" },
  ];
  const LATER = ["③ □と□で10", "③' 10+□", "④ くり上がり"];  // Step 3 で作る
  const ROUND = 5, MIX = 1;  // 1回の問題数、前の段階から混ぜる数（2割）
  const ZERO_P = 0.3, SWAP_P = 0.3;  // ② で 0 の問題を1問・入れかえの組（3+5 の次に 5+3）を入れる割合（「少し」）

  const byId = id => STAGES.find(s => s.id === id);
  const shuffle = (a, rand = Math.random) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const take = (st, n, rand) => shuffle(st.pool.slice(), rand).slice(0, n).map(([a, b]) => ({ a, b, s: st.id }));

  /* その段階の問題 n 問。zero があれば ときどき 0 の問題、入れかえの組（sw＝前の問題の入れかえ）を入れる */
  function takeMain(st, n, rand) {
    if (!st.zero) return take(st, n, rand);
    const zero = rand() < ZERO_P ? take({ pool: st.zero, id: st.id }, 1, rand) : [];
    // 入れかえの組はわざと入れるときだけ（偶然 3+6 と 6+3 が離れて出ないように、裏返しの組はよける）
    const base = [], has = new Set();
    for (const [x, y] of shuffle(st.pool.slice(), rand)) {
      if (base.length === n - zero.length) break;
      if (!has.has(y + "_" + x)) { base.push({ a: x, b: y, s: st.id }); has.add(x + "_" + y); }
    }
    if (rand() < SWAP_P) {
      const i = base.findIndex((q, k) => k < base.length - 1 && q.a !== q.b);
      if (i >= 0) base[base.length - 1] = { a: base[i].b, b: base[i].a, s: st.id, sw: base[i] };   // 最後の1問を入れかえに替える
    }
    return base.concat(zero);
  }

  /* 1回分の問題 [{a, b, s}]。同じ問題は出さない。入れかえの組は続けて出す */
  function makeRound(id, rand = Math.random) {
    const st = byId(id) || STAGES[0], prev = st.prev && byId(st.prev);
    const mix = prev ? take(prev, MIX, rand) : [];
    const r = shuffle(takeMain(st, ROUND - mix.length, rand).concat(mix), rand);
    const j = r.findIndex(q => q.sw);
    if (j >= 0) { const q = r.splice(j, 1)[0], k = r.indexOf(q.sw); delete q.sw; r.splice(k + 1, 0, q); }
    return r;
  }

  /* ボタンの選択肢：答え＋よくある間違い（a・b そのもの、±1）から、足りなければ ±2。小さい順 */
  function makeOpts(a, b, ans, rand = Math.random) {
    const ok = n => n >= 0 && n <= 10 && n !== ans;
    const near = shuffle([...new Set([a, b, ans - 1, ans + 1].filter(ok))], rand);
    const far = shuffle([ans - 2, ans + 2].filter(ok), rand);
    const pool = near.concat(far).filter((n, i, s) => s.indexOf(n) === i);
    return [ans, pool[0], pool[1]].sort((x, y) => x - y);
  }

  root.Quiz = { STAGES, LATER, ROUND, byId, makeRound, makeOpts, shuffle };
})(typeof window !== "undefined" ? window : globalThis);
