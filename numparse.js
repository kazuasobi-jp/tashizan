/* 音声認識の文字列 → 考えられる数（0〜20）の集合。
   子どもの1語の発話は同音の漢字（似・市・後 など）で返りやすいので、
   1つの言葉が複数の数にとれるときは全部を返す（答えが分かっている側で「どれかに当たれば正解」とする）。 */
(function (root) {
  "use strict";

  // 1〜9 の読み（じゅう＋□ の組み立てにも使う）
  const ONES = {
    1: ["いち"], 2: ["に"], 3: ["さん"], 4: ["よん", "し", "よ"], 5: ["ご"],
    6: ["ろく"], 7: ["なな", "しち"], 8: ["はち"], 9: ["きゅう", "く"]
  };
  const KANJI = "〇一二三四五六七八九";

  // 言葉 → 数（複数可）。正規化後（ひらがな・空白なし）の形で書く
  const WORDS = {};
  const add = (n, ...ws) => ws.forEach(w => (WORDS[w] = WORDS[w] || new Set()).add(n));

  add(0, "ぜろ", "れい", "零");
  add(1, "ひとつ", "一つ", "いっこ", "一個", "位置", "市");
  add(2, "ふたつ", "二つ", "にこ", "二個", "似", "煮", "荷", "仁");
  add(3, "みっつ", "三つ", "さんこ", "三個", "参", "産", "酸", "算", "山");
  add(4, "よっつ", "四つ", "よんこ", "四個", "死", "氏", "市", "詩", "史", "師", "子", "四", "いおん");   // イオン＝よん（10/22 実機。カタカナはひらがなにしてから引く）
  add(5, "いつつ", "五つ", "ごこ", "五個", "ここ", "個々", "後", "語", "碁", "誤", "午後", "互");
  add(6, "むっつ", "六つ", "ろっこ", "六個", "ろくこ", "六甲", "録", "ろっく", "rock");
  add(7, "ななつ", "七つ", "ななこ", "七個", "しちこ", "菜々", "奈々", "七々", "質");
  add(8, "やっつ", "八つ", "はっこ", "はちこ", "八個", "蜂", "鉢", "発行", "発酵", "はっこう");
  add(9, "ここのつ", "九つ", "きゅうこ", "九個", "急", "球", "旧", "救", "級", "求", "q", "九");
  add(10, "とお", "とう", "じゅっこ", "じっこ", "十個", "銃", "重", "自由", "住", "柔", "渋");
  add(20, "にじゅう", "二十", "にじゅっこ", "二十個");

  for (const [n, ws] of Object.entries(ONES)) ws.forEach(w => add(+n, w));
  for (let i = 0; i <= 9; i++) add(i, KANJI[i]);
  add(10, "じゅう", "十");
  for (const [n, ws] of Object.entries(ONES)) {
    ws.forEach(w => add(10 + +n, "じゅう" + w, "じゅう" + w + "こ"));
    add(10 + +n, "十" + KANJI[+n]);
  }

  // カタカナ → ひらがな、全角 → 半角、記号・空白・語尾を落とす
  function normalize(s) {
    s = String(s || "").normalize("NFKC").toLowerCase();
    s = s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
    s = s.replace(/[\s、。,.!?！？「」〜~]/g, "");
    s = s.replace(/(です|だよ|だね|かな|だ|よ|ね)$/u, m => (s === m ? m : ""));
    // 前につく「はい」「えっと」などを落とす（「はい、ごこ」→ ごこ）
    s = s.replace(/^(はい|えっと|えーと|えと|うーん|あの)+/u, m => (s === m ? m : ""));
    return s;
  }

  function lookup(s, out) {
    if (WORDS[s]) WORDS[s].forEach(n => out.add(n));
    const m = s.match(/^(\d{1,2})(個|こ|つ)?$/);
    if (m && +m[1] <= 20) out.add(+m[1]);
  }

  /* text: 認識結果の1候補。返り値: Set<number> */
  function parseNumber(text) {
    const out = new Set();
    const n = normalize(text);
    if (!n) return out;
    // のばす音（きゅー・じゅー・にー）は「う」にした形と、消した形の両方で探す
    const forms = [...new Set([n.replace(/ー/g, "う"), n.replace(/ー/g, "")])];
    for (const s of forms) { parseForm(s, out); if (out.size) break; }
    return out;
  }

  function parseForm(s, out) {
    lookup(s, out);
    // 「〜こ」「〜個」「〜つ」を外した形でも探す（にこ→に、ごこ→ご）。ここのつ 等は上で当たっている
    if (!out.size) {
      const t = s.replace(/(個|こ|つ)$/u, "");
      if (t && t !== s) lookup(t, out);
    }
    // 同じ言葉の繰り返し（「さんさん」「3 3」）は1つとみなす
    if (!out.size) {
      const h = s.length / 2;
      if (Number.isInteger(h) && s.slice(0, h) === s.slice(h)) lookup(s.slice(0, h), out);
    }
    // 文の中に数字が1つだけあればそれ（「3です」「答えは5」）
    if (!out.size) {
      const ds = s.match(/\d+/g);
      if (ds && ds.length === 1 && +ds[0] <= 20) out.add(+ds[0]);
    }
  }

  root.NumParse = { parseNumber, normalize };
})(typeof window !== "undefined" ? window : globalThis);
