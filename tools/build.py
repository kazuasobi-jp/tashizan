"""公開用の一式を作る（GitHub Actions の pages.yml が main への push ごとに実行する。手元でも試せる）。

使い方: python tools/build.py --site _site

  - 画面・JS・アイコン・音・補助ページ（test/ audio/ design/ samples/）を DIR に写す
  - 音ごとのハッシュを js/version.js に書く（Sound が URL に ?v= で付ける → 変わった音だけ取り直される）
  - sw.js に 版・画面の一覧・音の一覧 を埋める（中身が変わると版が変わり、ブラウザが新しい sw.js を受け取る）
  - アプリが鳴らす音がそろっているか確かめる（足りないものは知らせる。鳴らないだけで止まりはしない）
"""
import hashlib, json, re, shutil, sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
EXT = "ogg"   # 公開版の音の形式（Opus。tools/to_opus.py で wav から作る。js/version.js の audioExt になる。手元の dev は wav）
SHELL = ["./", "manifest.webmanifest", "numparse.js", "js/version.js", "js/quiz.js", "js/store.js", "js/sound.js",
         "js/listen.js", "js/app.js", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
         "icons/favicon-32.png", "icons/apple-touch-icon.png",
         "fonts/rounded-500.woff2", "fonts/rounded-700.woff2", "fonts/rounded-800.woff2"]
COPY_DIRS = ["js", "icons", "fonts", "test", "design", "samples"]
COPY_FILES = ["index.html", "manifest.webmanifest", "numparse.js", "sw.js"]


def sha(b): return hashlib.sha256(b).hexdigest()


def needed_audio():
    """app.js・quiz.js から、鳴らす音の名前を拾う（問題は段階の組み合わせ全部）"""
    app = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
    names = {"p/" + k for k in re.findall(r'"(\w+)"', app.split("const FIXED = [", 1)[1].split("]", 1)[0])}
    names |= {f"ok/{n}" for n in range(11)} | {f"n/{n}" for n in range(1, 11)}
    names |= {f"q/{a}_{b}" for a in range(11) for b in range(11 - a)}   # quiz.js の pairs() の範囲
    return names


def build(out):
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for d in COPY_DIRS:
        shutil.copytree(ROOT / d, out / d)
    for f in COPY_FILES:
        shutil.copy2(ROOT / f, out / f)

    # 音：ファイルごとのハッシュ
    audio = {}
    for f in sorted((ROOT / "audio").rglob(f"*.{EXT}")):
        rel = f.relative_to(ROOT / "audio").as_posix()
        if rel.startswith("try/"):
            continue
        name = rel[: -len(EXT) - 1]
        audio[name] = sha(f.read_bytes())[:8]
        (out / "audio" / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, out / "audio" / rel)
    shutil.copy2(ROOT / "audio" / "index.html", out / "audio" / "index.html")
    no_ogg = sorted(w.relative_to(ROOT / "audio").as_posix() for w in (ROOT / "audio").rglob("*.wav")
                    if not w.relative_to(ROOT / "audio").as_posix().startswith("try/") and not w.with_suffix(f".{EXT}").exists())
    assert not no_ogg, f"{EXT} がない音があります（python tools/to_opus.py を実行）: {', '.join(no_ogg)}"
    missing = sorted(needed_audio() - set(audio))
    if missing:
        print("注意：音がありません（鳴らさずに進みます）:", ", ".join(missing))

    # 版：画面・JS・音のハッシュから
    h = hashlib.sha256()
    for u in SHELL:
        p = ROOT / ("index.html" if u == "./" else u)
        if u != "js/version.js":
            h.update(p.read_bytes())
    h.update(json.dumps(audio, sort_keys=True).encode())
    ver = h.hexdigest()[:10]

    (out / "js" / "version.js").write_text(
        "/* tools/build.py が書いたもの（手で直さない） */\n"
        f"self.APP = {json.dumps({'ver': ver, 'audioExt': EXT, 'audio': audio}, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8")
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    for k in ["__VERSION__", "__SHELL__", "__AUDIO__"]:
        assert sw.count(k) == 1, k
    sw = (sw.replace("__VERSION__", ver).replace("__SHELL__", json.dumps(SHELL))
            .replace("__AUDIO__", json.dumps([f"audio/{n}.{EXT}?v={v}" for n, v in sorted(audio.items())])))
    (out / "sw.js").write_text(sw, encoding="utf-8")
    print(f"版 {ver}：音 {len(audio)} 個 → {out}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) != 2 or args[0] != "--site":
        sys.exit(__doc__)
    build((ROOT / args[1]).resolve() if not Path(args[1]).is_absolute() else Path(args[1]))
