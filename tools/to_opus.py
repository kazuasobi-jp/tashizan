"""audio/ の wav を Opus（.ogg）に変える。公開版は ogg を配る（wav の約1/10）。wav は元の音としてリポジトリに残す。

使い方: python tools/to_opus.py        … ogg がないか、wav より古いものだけ作る
        python tools/to_opus.py --all  … 全部作り直す
  声を作り直したら（make_voice.py のあと）これを実行してからコミットする。build.py は ogg が足りないと止まる。
  ffmpeg が要る（winget install Gyan.FFmpeg）。PATH になければ winget の置き場を探す。
"""
import glob, os, shutil, subprocess, sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
BITRATE = "32k"   # 声だけ・モノラルなので 32kbps で十分（聞き比べで確かめる）

ff = shutil.which("ffmpeg") or next(iter(sorted(glob.glob(os.path.expandvars(
    r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\ffmpeg-*\bin\ffmpeg.exe")))), None)
assert ff, "ffmpeg が見つかりません"

made = 0; wav_total = ogg_total = 0
for w in sorted((ROOT / "audio").rglob("*.wav")):
    if w.relative_to(ROOT / "audio").as_posix().startswith("try/"):
        continue
    o = w.with_suffix(".ogg")
    if "--all" in sys.argv or not o.exists() or o.stat().st_mtime < w.stat().st_mtime:
        subprocess.run([ff, "-v", "error", "-y", "-i", str(w), "-map_metadata", "-1", "-ac", "1",
                        "-c:a", "libopus", "-b:a", BITRATE, "-vbr", "on", "-application", "audio", str(o)], check=True)
        made += 1
    wav_total += w.stat().st_size; ogg_total += o.stat().st_size
print(f"作った {made} 個 / wav {wav_total / 1024 / 1024:.1f} MB → ogg {ogg_total / 1024 / 1024:.2f} MB")
