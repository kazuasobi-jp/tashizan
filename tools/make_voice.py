"""VOICEVOX（起動中のエンジン http://127.0.0.1:50021）でアプリの声を作る。声は 冥鳴ひまり（ノーマル）。

使い方: python tools/make_voice.py audio          … 全部作る（あるファイルは飛ばす）
        python tools/make_voice.py audio --check  … 作らずに読み（カナ）だけ表示する（キュウ・ジュウのウの長さも）
        python tools/make_voice.py audio --redo-u … キュウ・ジュウを含むものを作り直す（ウを U_MIN まで延ばす）
        python tools/make_voice.py audio --redo-acc … 頭高の ヨン・ジュウ（4・10）を含むものを作り直す（2拍目を下げる）
        python tools/make_voice.py audio --redo-acc=ジュウ,ナナ … 頭を絞って作り直す

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
    'pikotte': 'ピコッてなったら、いってね。',   # その日の1回目だけ（マイクの合図を待ってから話すように）
    'mouichido': 'もういちど、いってね。',
    'button': 'ボタンでこたえてね。',
    'kangaeyou': 'もういっかい、かんがえよう。',
    'kazoeyou': 'いっしょにかぞえよう。',
    'iete': 'こたえはいくつかな？',
    'yattane': 'やったね！',
    'sugoi': 'すごい！',
    'kangaeta': 'よくかんがえたね！',
    'kazoeta': 'じぶんでかぞえられたね！',
    'ganbatta': 'さいごまでがんばったね！',
    'oshimai': 'おしまい。',
    'seal': 'シールをどうぞ！',                  # 読点を入れると間が空いて不自然（10/16 指摘）
    'ashita': 'きょうはここまで。またあしたね。',
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

# 「キュウ」「ジュウ」（9・10・19・20 など）の「ウ」が短く切れて聞こえるため、ウの母音を延ばす（10/16 試聴で指摘）
U_AFTER = ('キュ', 'ジュ')
# 10/16 の --check：ウは 0.010〜0.074 秒（数だけの 9・10 は 0.010 でほぼ消えていた）、他の母音の中央値は 0.055〜0.155 秒
U_MIN = 0.12       # ウの母音の長さの下限（秒・speedScale をかける前）
U_MIN_END = 0.16   # 言葉の最後のウ（「9」「10」「19」「20」だけのとき）は少し長めに
REDO_U = '--redo-u' in sys.argv   # キュウ・ジュウを含むものは、ファイルがあっても作り直す

def long_u(q):
    """キュ・ジュの次のウを延ばす。延ばした数を返す"""
    n = 0
    aps = q['accent_phrases']
    for k, ap in enumerate(aps):
        ms = ap['moras']
        for i in range(1, len(ms)):
            last = k == len(aps) - 1 and i == len(ms) - 1
            lo = U_MIN_END if last else U_MIN
            if ms[i]['text'] == 'ウ' and ms[i - 1]['text'] in U_AFTER and ms[i]['vowel_length'] < lo:
                ms[i]['vowel_length'] = lo; n += 1
    return n

# 「4」「10」が頭高（ヨ'ン・ジュ'ウ）の記号なのに 2拍目が下がらず「よん↑」「じゅう→」に聞こえる（10/16 指摘）
# 10/16 の pitch：4＝ヨ5.42→ン5.59（上がる）、10＝ジュ5.53→ウ5.52（平ら）、良いと言われた 9＝キュ5.69→ウ5.51
# 2拍目を下げるだけでは 数だけの 10・せいかいの 10 が直らなかった（ジュ が 5.53〜5.55 と低いまま。良いと言われた問題の 10 は 5.62）
# → 1拍目を HEAD_TOP まで上げてから下げる。7（ナ'ナ）も 2拍目が上がっていたので同じく（17 の ナ'ナ は自然に 5.61→5.45）
# 4 は 2拍目を下げるだけで OK と言われたので上げない（None）
HEAD_FIX = {'ヨン': None, 'ジュウ': 5.62, 'ナナ': 5.62}   # アクセント句の頭がこれで、頭高のとき: 1拍目の高さの下限
HEAD_DROP = 0.18               # 1拍目より最低これだけ 2拍目を下げる（9 と同じ程度）
# 「7。せいかい！」は 0.18 では直らなかった（2つ目のナの終わりが せいかい に向けて 222→233Hz と上がる）
# → 間（、）が後ろにあるときは、良いと言われた「9。せいかい！」と同じ 0.26 下げる
HEAD_DROP_PAUSE = {'ナナ': 0.26}
REDO_ACC = '--redo-acc' in sys.argv   # HEAD_FIX に当たるものは、ファイルがあっても作り直す
# --redo-acc=ジュウ,ナナ のように頭を絞れる（なしなら全部）
ACC_ONLY = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--redo-acc=')), None)
REDO_ACC = REDO_ACC or ACC_ONLY is not None

def head_fix(q, apply=True, only=None):
    """頭高の ヨン・ジュウ・ナナ の 1拍目を上げ、2拍目を 1拍目より HEAD_DROP 下げる。当たった数を返す（only で数える頭を絞る）"""
    n = 0
    for k, ap in enumerate(q['accent_phrases']):
        ms = ap['moras']
        head = ms[0]['text'] + ms[1]['text'] if len(ms) >= 2 else ''
        if ap['accent'] == 1 and head in HEAD_FIX:
            if only is None or head in only: n += 1
            if apply:
                # 上げるのは言葉の頭だけ（文の途中は下がっていくのが自然。「0たす10は？」の 10 は下げるだけで OK と言われた）
                if HEAD_FIX[head] and k == 0: ms[0]['pitch'] = max(ms[0]['pitch'], HEAD_FIX[head])
                drop = HEAD_DROP_PAUSE.get(head, HEAD_DROP) if ap['pause_mora'] else HEAD_DROP
                ms[1]['pitch'] = min(ms[1]['pitch'], ms[0]['pitch'] - drop)
    return n

# 決まった言葉のアクセント（10/16 指摘）。やったね は ヤ'ッタネ と読まれる → やった'ね に。
# すごい は スゴ'イ の記号なのに pitch は ス5.40→ゴ5.49→イ5.62 と上がり続ける（4 と同じ）→ ゴ を山に
# かんがえよう は カンガ'エヨオ（ガが山）・最後のオ（う）が 0.06 秒と短い → かんがえよ'う・オを延ばす
PHRASE_ACCENT = {   # アクセント句のカナ: (何拍目が山か, 山の高さの下限, 最後の拍の母音の長さの下限 or None)
    'ヤッタネ': (3, 5.62, None), 'スゴイ': (2, 5.62, None), 'カンガエヨオ': (5, 5.66, 0.14),
    'イッテネ': (3, 5.62, None)}   # いってね は イッテネ' と ネ が上がる → いって'ね

def phrase_accent(q, apply=True):
    """PHRASE_ACCENT の句で、山の拍を上げ、山より後と（山が頭でなければ）頭の拍を HEAD_DROP 下げる。当たった数を返す"""
    n = 0
    for ap in q['accent_phrases']:
        ms = ap['moras']; key = ''.join(m['text'] for m in ms)
        if key not in PHRASE_ACCENT: continue
        n += 1
        if not apply: continue
        a, top, last_len = PHRASE_ACCENT[key]; ap['accent'] = a
        peak = ms[a - 1]; peak['pitch'] = max(peak['pitch'], top)
        for j, m in enumerate(ms):
            if m['pitch'] > 0 and (j >= a or (j == 0 and a > 1)):   # ッ（pitch 0）はそのまま
                m['pitch'] = min(m['pitch'], peak['pitch'] - HEAD_DROP)
        if last_len: ms[-1]['vowel_length'] = max(ms[-1]['vowel_length'], last_len)
    return n

def u_lengths(q):
    """確認用：キュ・ジュの次のウの長さと、その他の母音の長さの中央値"""
    us, others = [], []
    for ap in q['accent_phrases']:
        ms = ap['moras']
        for i, m in enumerate(ms):
            (us if i and m['text'] == 'ウ' and ms[i - 1]['text'] in U_AFTER else others).append(m['vowel_length'])
    others.sort()
    return us, (others[len(others) // 2] if others else 0)

def post(path, data=None, **params):
    url = f'{E}{path}?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, data=data, method='POST',
                                 headers={'Content-Type': 'application/json'} if data else {})
    return urllib.request.urlopen(req).read()

speakers = json.load(urllib.request.urlopen(f'{E}/speakers'))
sid = next(s['id'] for sp in speakers if sp['name'] == SPEAKER_NAME for s in sp['styles'] if s['name'] == STYLE_NAME)
print(f'{SPEAKER_NAME}（{STYLE_NAME}） style id = {sid}')

# 「もう」が強く聞こえる（10/16 指摘。もう の オ がその文でいちばん高い 5.61〜5.65）。聞き比べで選んだ形にする
def merge_first_two(q):
    """最初の2つのアクセント句を1つにまとめ、高さを VOICEVOX に付け直させる（もういっかい を1語として読む）"""
    aps = q['accent_phrases']; a, b = aps[0], aps[1]
    m = dict(b); m['moras'] = a['moras'] + b['moras']; m['accent'] = len(a['moras']) + b['accent']
    q['accent_phrases'] = json.loads(post('/mora_pitch', json.dumps([m] + aps[2:]).encode(), speaker=sid))

def mou_low(q):
    """もう を 0.15 低くし、いちど の ド を 5.52 に上げる（ドに弱い山。聞き比べの B2）"""
    aps = q['accent_phrases']
    assert [''.join(m['text'] for m in ap['moras']) for ap in aps[:2]] == ['モオ', 'イチド'], q['kana']
    for m in aps[0]['moras']: m['pitch'] -= 0.15
    aps[1]['moras'][2]['pitch'] = 5.52

# 「〜たね！」は最後のネが一番低く（5.25〜5.28）、！なのに上がらない（10/16 指摘）→ ネを少し上げる。
# 聞き比べ：5.50 は強すぎ → かんがえたね・かぞえられたね は 5.43、がんばったね は 5.36
def last_up(p):
    def f(q):
        last = q['accent_phrases'][-1]['moras'][-1]; assert last['text'] == 'ネ', q['kana']
        last['pitch'] = max(last['pitch'], p)
    return f

TWEAKS = {'p/mouichido': mou_low, 'p/kangaeyou': merge_first_two,   # ファイル名: 先にかける直し
          'p/kangaeta': last_up(5.43), 'p/kazoeta': last_up(5.43), 'p/ganbatta': last_up(5.36)}

total = made = 0
for name, text in items():
    f = OUT / f'{name}.wav'
    q = json.loads(post('/audio_query', text=text, speaker=sid))
    kana = q['kana'].replace("'", '').replace('_', '')   # アクセント記号を除いて判定（「キュ'ウ」を拾うため）
    has_u = any(k + 'ウ' in kana for k in U_AFTER)
    if CHECK:
        us, med = u_lengths(q)
        extra = f'  ウ={",".join(f"{u:.3f}" for u in us)} 他の母音の中央値={med:.3f}' if us else ''
        print(f'{name:14} {text:24} {q["kana"]}{extra}'); continue
    if f.exists() and not (REDO_U and has_u) and not (REDO_ACC and head_fix(q, apply=False, only=ACC_ONLY)):
        total += f.stat().st_size; continue
    if name in TWEAKS: TWEAKS[name](q)
    long_u(q); head_fix(q); phrase_accent(q)
    q['speedScale'] = SPEED; q['intonationScale'] = INTONATION
    wav = post('/synthesis', json.dumps(q).encode(), speaker=sid)
    f.parent.mkdir(parents=True, exist_ok=True); f.write_bytes(wav)
    total += len(wav); made += 1
    print(name, text, len(wav) // 1024, 'KB')
if not CHECK:
    print(f'作った {made} 個 / 合計 {total / 1024 / 1024:.1f} MB')
