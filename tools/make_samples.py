"""VOICEVOX（起動中のエンジン http://127.0.0.1:50021）で声の試聴用 wav を作る。

使い方: python tools/make_samples.py samples
"""
import json, urllib.request, urllib.parse, sys, pathlib
sys.stdout.reconfigure(encoding='utf-8')
OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
E = 'http://127.0.0.1:50021'
VOICES = [  # (ファイル名, 表示名, style id)
  ('zundamon', 'ずんだもん', 3), ('tsumugi', '春日部つむぎ', 8), ('hanamaru', '満別花丸（元気）', 70),
  ('metan', '四国めたん（あまあま）', 0), ('himari', '冥鳴ひまり', 14), ('no7', 'No.7（読み聞かせ）', 31),
  ('whitecul', 'WhiteCUL（たのしい）', 24)]
TEXT = '3たす4は？……7。せいかい！よく、がんばったね！'
for f, name, sid in VOICES:
    q = json.load(urllib.request.urlopen(urllib.request.Request(
        f'{E}/audio_query?' + urllib.parse.urlencode({'text': TEXT, 'speaker': sid}), method='POST')))
    q['speedScale'] = 0.9; q['intonationScale'] = 1.2
    wav = urllib.request.urlopen(urllib.request.Request(
        f'{E}/synthesis?speaker={sid}', data=json.dumps(q).encode(), headers={'Content-Type': 'application/json'})).read()
    (OUT / f'{f}.wav').write_bytes(wav)
    print(f, name, len(wav)//1024, 'KB')
