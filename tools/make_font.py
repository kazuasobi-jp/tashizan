"""M PLUS Rounded 1c を、アプリで使う字だけに絞って fonts/ に置く（woff2。オフラインでも同じ形で出るように）。

使い方: python tools/make_font.py 元のフォントのフォルダ
  元のフォント（MPLUSRounded1c-{Medium,Bold,ExtraBold}.ttf）は https://github.com/google/fonts/tree/main/ofl/mplusrounded1c から取る
  （リポジトリには置かない）。画面の文を変えて新しい字が増えたら、もう一度作る。
  ライセンスは SIL Open Font License 1.1（fonts/OFL.txt）。絞るのは改変にあたるが、予約フォント名はないので名前はそのまま。

使う字：index.html と js/*.js の中の字すべて ＋ ASCII（数・英字・記号）
"""
import sys, pathlib
from fontTools import subset
sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1])
WEIGHTS = {500: "Medium", 700: "Bold", 800: "ExtraBold"}   # index.html の font-weight と合わせる

text = "".join(chr(c) for c in range(0x20, 0x7F))
for f in [ROOT / "index.html", *sorted((ROOT / "js").glob("*.js"))]:
    if f.name == "version.js": continue
    text += f.read_text(encoding="utf-8")
chars = sorted({c for c in text if ord(c) >= 0x20})

out = ROOT / "fonts"; out.mkdir(exist_ok=True)
for w, name in WEIGHTS.items():
    src = SRC / f"MPLUSRounded1c-{name}.ttf"
    opt = subset.Options(); opt.flavor = "woff2"; opt.layout_features = ["*"]
    font = subset.load_font(str(src), opt)
    s = subset.Subsetter(opt); s.populate(text="".join(chars)); s.subset(font)
    dst = out / f"rounded-{w}.woff2"
    subset.save_font(font, str(dst), opt)
    cmap = font.getBestCmap()
    missing = "".join(c for c in chars if ord(c) not in cmap and ord(c) > 0x7F)
    print(f"{dst.name}: {dst.stat().st_size // 1024} KB（字 {len(cmap)}）")
print(f"使う字 {len(chars)} 個。フォントにない字（絵文字など。端末のフォントで出る）: {missing}")
