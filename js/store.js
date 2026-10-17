/* 設定と記録。端末の中だけ（localStorage、キーは tashizan.〜）。外には送らない
   tashizan.settings  { stage, fade, limit, input }
   tashizan.log       1問ごと [{ t, d, s, rs, a, b, f, m, sec, v, r }]
                      f＝一発正解 1/0、m＝まちがえた回数、sec＝1回目に答えるまでの秒、v＝声で答えた 1/0、r＝最後にもう一度の問題 1/0
   tashizan.rounds    1回ごと [{ t, d, s, f }]  f＝5問のうち一発正解の数
   tashizan.stickers  もらったシールの数（10まいで台紙1枚） */
(function (root) {
  "use strict";
  const P = "tashizan.", MAX_LOG = 3000, MAX_ROUNDS = 1000;
  const DEF = { stage: "s1", fade: "show", limit: 2, input: "voice" };
  // fade（絵の減らし方）：show＝ずっと出す / flash＝2秒見せて消す / hint＝まちがえたら出す / none＝数式だけ（一緒に数えるときだけ出す）
  const FADES = [["show", "絵をずっと出す"], ["flash", "2秒見せて消す"], ["hint", "まちがえたら出す"], ["none", "数式だけ"]];

  function get(k, def) {
    try { const v = localStorage.getItem(P + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  }
  function set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  const S = {
    FADES,
    now: () => Date.now(),  // テストで差し替える
    today(t) {
      const d = new Date(t == null ? S.now() : t), p = n => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },

    settings() {
      const s = Object.assign({}, DEF, get("settings", {}));
      if (!(s.limit >= 1 && s.limit <= 9)) s.limit = DEF.limit;
      return s;
    },
    saveSettings(patch) { const s = Object.assign(S.settings(), patch); set("settings", s); return s; },

    log: () => get("log", []),
    rounds: () => get("rounds", []),
    stickers: () => get("stickers", 0),

    addQuestion(rec) {
      const log = S.log(); log.push(Object.assign({ t: S.now(), d: S.today() }, rec));
      if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
      return set("log", log);
    },
    /* 1回が終わった：記録してシールを1まい増やす。増やした後のシールの数を返す */
    addRound(rec) {
      const rs = S.rounds(); rs.push(Object.assign({ t: S.now(), d: S.today() }, rec));
      if (rs.length > MAX_ROUNDS) rs.splice(0, rs.length - MAX_ROUNDS);
      set("rounds", rs);
      const n = S.stickers() + 1; set("stickers", n);
      return n;
    },
    roundsToday() { const d = S.today(); return S.rounds().filter(r => r.d === d).length; },
    todayLeft() { return S.settings().limit - S.roundsToday(); },

    /* 段階を上げる・戻す目安（設計メモ。経験的な目安で、決めるのは親）
       上げる：直近15問中13問以上一発正解・3日以上に分けて・答えるまでの中央値 5秒以内
       戻す：その段階の直近2回が どちらも5問中2問以下 */
    advice(stage) {
      const qs = S.log().filter(r => r.s === stage && !r.r).slice(-15);
      const firsts = qs.filter(r => r.f).length, days = new Set(qs.map(r => r.d)).size;
      const med = median(qs.map(r => r.sec).filter(x => typeof x === "number"));
      const last2 = S.rounds().filter(r => r.s === stage).slice(-2);
      return {
        n: qs.length, firsts, days, med,
        up: qs.length >= 15 && firsts >= 13 && days >= 3 && med != null && med <= 5,
        down: last2.length === 2 && last2.every(r => r.f <= 2),
      };
    },

    /* 日ごとのまとめ（新しい日から） [{ d, rounds, n, firsts, med }]。もう一度の問題は数えない */
    days(limit = 14) {
      const by = new Map();
      const row = d => by.get(d) || (by.set(d, { d, rounds: 0, n: 0, firsts: 0, secs: [] }), by.get(d));
      S.rounds().forEach(r => row(r.d).rounds++);
      S.log().filter(r => !r.r).forEach(r => { const x = row(r.d); x.n++; x.firsts += r.f ? 1 : 0; if (typeof r.sec === "number") x.secs.push(r.sec); });
      return [...by.values()].sort((x, y) => (x.d < y.d ? 1 : -1)).slice(0, limit)
        .map(({ d, rounds, n, firsts, secs }) => ({ d, rounds, n, firsts, med: median(secs) }));
    },

    /* 記録を文字にする（親が Claude に貼って相談する用。個人を特定するものは入れない） */
    exportText() {
      const st = S.settings(), lines = [`たしざん 記録（${S.today()} 書き出し）`,
        `設定：段階 ${st.stage}・絵 ${st.fade}・1日 ${st.limit}回・答え方 ${st.input}・シール ${S.stickers()}まい`, "", "日付 回 問題 一発正解 中央値秒"];
      S.days(60).forEach(x => lines.push(`${x.d} ${x.rounds} ${x.n} ${x.firsts} ${x.med == null ? "-" : x.med}`));
      lines.push("", "1問ごと（日付 時刻 段階 問題 一発 まちがい 秒 声 もう一度）");
      S.log().slice(-200).forEach(r => {
        const tm = new Date(r.t), hm = `${String(tm.getHours()).padStart(2, "0")}:${String(tm.getMinutes()).padStart(2, "0")}`;
        lines.push(`${r.d} ${hm} ${r.s} ${r.a}+${r.b} ${r.f} ${r.m} ${r.sec} ${r.v} ${r.r}`);
      });
      return lines.join("\n");
    },

    clearRecords() { ["log", "rounds", "stickers"].forEach(k => { try { localStorage.removeItem(P + k); } catch (e) {} }); },

    /* ブラウザが空き容量の不足で勝手に消さないように頼む（だめでも動く） */
    persist() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}); } catch (e) {} },
  };

  function median(xs) {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b), h = s.length >> 1;
    const m = s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
    return Math.round(m * 10) / 10;
  }
  S.median = median;

  root.Store = S;
})(typeof window !== "undefined" ? window : globalThis);
