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
  ];
  const LATER = ["② 答え6〜10", "③ □と□で10", "③' 10+□", "④ くり上がり"];  // Step 3 で作る
  const ROUND = 5, MIX = 1;  // 1回の問題数、前の段階から混ぜる数（2割）

  const byId = id => STAGES.find(s => s.id === id);
  const shuffle = (a, rand = Math.random) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const take = (st, n, rand) => shuffle(st.pool.slice(), rand).slice(0, n).map(([a, b]) => ({ a, b, s: st.id }));

  /* 1回分の問題 [{a, b, s}]。同じ問題は出さない */
  function makeRound(id, rand = Math.random) {
    const st = byId(id) || STAGES[0], prev = st.prev && byId(st.prev);
    const mix = prev ? take(prev, MIX, rand) : [];
    return shuffle(take(st, ROUND - mix.length, rand).concat(mix), rand);
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
