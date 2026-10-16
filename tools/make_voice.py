"""VOICEVOX（起動中のエンジン http://127.0.0.1:50021）でアプリの声を作る。声は 冥鳴ひまり（ノーマル）。

使い方: python tools/make_voice.py audio          … 全部作る（あるファイルは飛ばす）
        python tools/make_voice.py audio --check  … 作らずに読み（カナ）だけ表示する

できるもの（audio/ の下）
  q/a_b.wav   問題「aたすbは？」（a+b が 10 まで。0 も入れる）
  ok/n.wav    「n。せいかい！」（0〜10）
  n/n.wav     数だけ（1〜20。一緒に数えるとき）
  p/*.wav     決まった言葉（下の PHRASES）
"""
import json, urllib.request, urllib.parse, sys, pathlib
sys.stdout.reconfigure(encoding='utf-8')
OUT = pathlib.Path(sys.argv[1]); CHECK = '--check' in sys.argv
E = 'http://127.0.0.1:50021'
SPEAKER_NAME, STYLE_NAME = '冥鳴ひまり', 'ノーマル'
SPEED, INTONATION = 0.9, 1.2

# 数は数字のまま渡す（ひらがなだと「はち」が「わち」になる。
# 数字なら 4＝ヨン・7＝ナナ・9＝キュウ・0＝ゼロ と読む。--check で確かめる）
def yomi(n): return str(n)

PHRASES = {  # ファイル名: 言葉
    'hajimeru': 'はじめるよ！',
    'mouichido': 'もういちど、いってね。',
    'button': 'ボタンで、こたえてね。',
    'kangaeyou': 'もういっかい、かんがえよう。',
    'kazoeyou': 'いっしょに、かぞえよう。',
    'iete': 'こたえは、いくつかな？',
    'yattane': 'やったね！',
    'sugoi': 'すごい！',
    'kangaeta': 'よく、かんがえたね！',
    'kazoeta': 'じぶんで、かぞえられたね！',
    'ganbatta': 'さいごまで、がんばったね！',
    'oshimai': 'おしまい。',
    'seal': 'シールを、どうぞ！',
    'ashita': 'きょうは、ここまで。またあしたね。',
}

def items():
    for a in range(11):
        for b in range(11 - a):
            yield f'q/{a}_{b}', f'{yomi(a)}たす{yomi(b)}は？'
    for n in range(11):
        yield f'ok/{n}', f'{yomi(n)}。せいかい！'
    for n in range(1, 21):
        yield f'n/{n}', yomi(n)
    for k, t in PHRASES.items():
        yield f'p/{k}', t

def post(path, data=None, **params):
    url = f'{E}{path}?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, data=data, method='POST',
                                 headers={'Content-Type': 'application/json'} if data else {})
    return urllib.request.urlopen(req).read()

speakers = json.load(urllib.request.urlopen(f'{E}/speakers'))
sid = next(s['id'] for sp in speakers if sp['name'] == SPEAKER_NAME for s in sp['styles'] if s['name'] == STYLE_NAME)
print(f'{SPEAKER_NAME}（{STYLE_NAME}） style id = {sid}')

total = made = 0
for name, text in items():
    f = OUT / f'{name}.wav'
    q = json.loads(post('/audio_query', text=text, speaker=sid))
    if CHECK:
        print(f'{name:14} {text:24} {q["kana"]}'); continue
    if f.exists():
        total += f.stat().st_size; continue
    q['speedScale'] = SPEED; q['intonationScale'] = INTONATION
    wav = post('/synthesis', json.dumps(q).encode(), speaker=sid)
    f.parent.mkdir(parents=True, exist_ok=True); f.write_bytes(wav)
    total += len(wav); made += 1
    print(name, text, len(wav) // 1024, 'KB')
if not CHECK:
    print(f'作った {made} 個 / 合計 {total / 1024 / 1024:.1f} MB')
