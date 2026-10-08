# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = ["faster-whisper>=1.1", "numpy"]
# ///
"""Slice one take of audio/voice/script.md into voice and animal sound clips.

    uv run tools/slice-voice.py recording.m4a [--model small.en] [--dry-run]

Speech regions come from the loudness of the take; words come from faster-whisper.
The script's items are matched in reading order, so a repeated item (a retake) replaces the earlier one.
Writes audio/voice/<id>.mp3, audio/animals/<type>[-2].mp3, build/voice-preview/*.mp3 and prints a report.
"""
import argparse, difflib, os, re, subprocess, sys, tempfile, wave
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent.parent
RATE = 16000
# cleanup for the clips (whisper and the timing use the plain take): rumble and thumps, steady hiss, even loud/soft words
CLEAN = 'highpass=f=80,afftdn=nr=12:nf=-50:tn=1,acompressor=threshold=-24dB:ratio=3:attack=5:release=120:makeup=2'
CLEAN_SOUNDS = 'highpass=f=80,afftdn=nr=4:nf=-50,acompressor=threshold=-24dB:ratio=3:attack=5:release=120:makeup=2'  # sniffs are noise too
DEBUG = bool(os.environ.get('DEBUG'))
ANIMALS = ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick']

# reading order of script.md: (clip id, accepted spellings as word lists)
def item(cid, *alts): return (cid, [a.split() for a in (alts or (cid,))])
NUMS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
EXPECTED = (
    [item(n, n, str(i)) for i, n in enumerate(NUMS)]
    + [item(a) for a in ANIMALS + ['golden']]
    + [item(p) for p in ['pigs', 'cows', 'chickens', 'ducks', 'bunnies', 'dogs', 'chicks']]
    + [item('lets-find', 'lets find'), item('animals'), item('great-job', 'great job'),
       item('go-to-barn', 'go to the barn'), item('lets-count', 'lets count'),
       item('hooray', 'hooray', 'hurray', 'hurrah', 'horay'), item('you-did-it', 'you did it'),
       item('new-sticker', 'you got a sticker'), item('plus'), item('makes', 'makes', 'mix', 'max'),
       item('sleepy', 'the animals are sleepy'), item('goodnight', 'goodnight', 'good night'),
       item('wake-up', 'wake up')]
)
PREVIEWS = {
    'count': ['lets-count', 'three', 'plus', 'two', 'makes', 'five'],
    'find': ['lets-find', 'pigs'],
    'find-all': ['lets-find', 'animals'],
    'show': ['one', 'cow', 'two', 'cows', 'three', 'cows'],
    'end': ['hooray', 'you-did-it', 'new-sticker'],
    'bedtime': ['sleepy', 'goodnight'],
}


def norm(w): return re.sub(r"[^a-z0-9]", '', w.lower())


def load(src):
    tmp = Path(tempfile.mkdtemp()) / 'take.wav'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(src), '-ac', '1', '-ar', str(RATE), str(tmp)], check=True)
    with wave.open(str(tmp)) as w:
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    clean = {}
    for name, af in (('voice', CLEAN), ('sounds', CLEAN_SOUNDS)):
        clean[name] = tmp.with_name(f'{name}.wav')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(src), '-ac', '1', '-ar', '48000', '-af', af, str(clean[name])], check=True)
    return clean, pcm


def speech_regions(pcm, merge_gap=0.25, min_len=0.06):
    """Non-silent [start, end] seconds: 10 ms frames louder than the noise floor + 15 dB, peaking 10 dB above that
    (quieter bumps are breaths and handling noise, where whisper makes up words). Also returns the dB curve."""
    hop = RATE // 100
    frames = pcm[: len(pcm) // hop * hop].reshape(-1, hop)
    db = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9)
    thresh = max(np.percentile(db, 10) + 15, -50)
    loud, regions, start = db > thresh, [], None
    for i, on in enumerate(np.append(loud, False)):
        if on and start is None: start = i
        elif not on and start is not None:
            if regions and (start - regions[-1][1]) / 100 < merge_gap: regions[-1][1] = i
            else: regions.append([start, i])
            start = None
    return [(s / 100, e / 100) for s, e in regions if (e - s) / 100 >= min_len and db[s:e].max() > thresh + 10], thresh, db


def transcribe(pcm, regions, model_name):
    """Each speech region on its own, so a word always belongs to the region it was heard in
    (whisper's timing over a whole take drifts by up to a second across long silences)."""
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device='cpu', compute_type='int8')
    words = []
    for r, (s, e) in enumerate(regions):
        if e - s < 0.12: continue  # clicks and breaths
        off = max(0, s - 0.15)
        segs, _ = model.transcribe(pcm[int(off * RATE): int((e + 0.15) * RATE)], language='en', word_timestamps=True,
                                   vad_filter=False, condition_on_previous_text=False)
        for seg in segs:
            for w in seg.words:
                for part in filter(None, map(norm, w.word.replace('-', ' ').split())):
                    words.append({'w': part, 'start': min(max(off + w.start, s), e), 'end': min(max(off + w.end, s), e),
                                  'p': w.probability, 'r': r})
    return words


def close(heard, want):
    return heard == want or (len(want) >= 4 and len(heard) >= 4 and difflib.SequenceMatcher(None, heard, want).ratio() >= 0.75)


def quietest(db, t0, t1):
    """Time of the quietest 50 ms between t0 and t1."""
    a, b = int(t0 * 100), max(int(t1 * 100), int(t0 * 100) + 1)
    sm = np.convolve(db, np.ones(5) / 5, mode='same')
    return (a + int(np.argmin(sm[a:b]))) / 100


def match(words):
    """Walk the expected items in order. A word matching one of the 3 items before is a retake (last one wins);
    matching up to 5 items ahead marks the skipped ones missing. Exact spellings win over near misses."""
    found, pos, i = {}, 0, 0

    def try_at(k, i, fuzzy):
        for alt in EXPECTED[k][1]:
            got = [w['w'] for w in words[i:i + len(alt)]]
            want = [norm(x) for x in alt]
            if len(got) == len(want) and all((close if fuzzy else str.__eq__)(g, t) for g, t in zip(got, want)):
                return len(alt)
        return 0

    while i < len(words) and pos < len(EXPECTED):
        order = list(range(pos, min(len(EXPECTED), pos + 6))) + list(range(max(0, pos - 3), pos))[::-1]
        hit = next(((k, n, f) for f in (False, True) for k in order if (n := try_at(k, i, f))), None)
        if not hit: i += 1; continue
        k, n, fuzzy = hit
        ws = words[i:i + n]
        cid = EXPECTED[k][0]
        found[cid] = {'words': ws, 'p': min(w['p'] for w in ws), 'retake': cid in found,
                      'heard': ' '.join(w['w'] for w in ws) if fuzzy else None}
        pos, i = max(pos, k + 1), i + n
    return found, i


def place(found, regions, db):
    """Cut each item at the edges of its speech regions; two items sharing a region split at the quietest point between them."""
    items = sorted(found.values(), key=lambda f: f['words'][0]['start'])
    for f in items:
        r = f['words'][-1]['r']
        f['start'], f['end'] = regions[f['words'][0]['r']][0], regions[r][1]
        f['limit'] = regions[r + 1][0] if r + 1 < len(regions) else 1e9
    for a, b in zip(items, items[1:]):
        if a['words'][-1]['r'] == b['words'][0]['r']:
            lo, hi = sorted((a['words'][-1]['end'], b['words'][0]['start']))
            a['end'] = a['limit'] = b['start'] = quietest(db, max(lo - 0.15, a['start'] + 0.1), min(hi + 0.15, b['end'] - 0.1))


def animal_sounds(words, regions, db, thresh, first_r):
    """Part 5: '<name>' then its sound, in script order; a second pass of all eight gives <type>-2.
    Regions are split around each name word (a sound and the next name often share a breath);
    the speech after a name, up to the next name, is its sound."""
    by_r = {}
    for w in words: by_r.setdefault(w['r'], []).append(w)
    pieces, nxt = [], 0  # nxt counts through ANIMALS twice
    for r in range(first_r, len(regions)):
        s, e = regions[r]
        ws = by_r.get(r, [])
        cuts = [s]
        for k, w in enumerate(ws):
            j = next((j for j in (nxt, nxt + 1, nxt + 2, nxt - 1) if 0 <= j < 2 * len(ANIMALS)
                      and w['p'] >= 0.3 and close(w['w'], ANIMALS[j % len(ANIMALS)])), None)
            if j is None: continue
            nxt = max(nxt, j + 1)
            key = ANIMALS[j % len(ANIMALS)] + ('-2' if j >= len(ANIMALS) else '')
            a = cuts[-1] if k == 0 else quietest(db, ws[k - 1]['end'] - 0.1, w['start'] + 0.1)
            if a - cuts[-1] >= 0.15: pieces.append((None, cuts[-1], a))
            # end of the name: the quiet before the next word, else the first dip after whisper's word end
            b = quietest(db, w['end'] - 0.1, ws[k + 1]['start'] + 0.1) if k + 1 < len(ws) else first_dip(db, thresh, max(w['end'], w['start'] + 0.3), e)
            pieces.append((key, a, b))
            cuts.append(b)
        if e - cuts[-1] >= (0.5 if ws else 0.15) and db[int(cuts[-1] * 100):int(e * 100)].max() > thresh + 10: pieces.append((None, cuts[-1], e))
    if DEBUG: print('\n'.join(f'  piece {k or "sound":<10} {s:7.2f}-{e:7.2f}' for k, s, e in pieces))
    out, cur = {}, None
    for key, s, e in pieces:
        if key:
            if cur: cur.setdefault('limit', s)  # a sound never runs into the next name
            cur = out[key] = {'retake': key in out, 'start': None, 'end': None}
        elif cur and cur['start'] is None: cur['start'], cur['end'] = s, e
        elif cur and 'limit' not in cur and s - cur['end'] < 1.0: cur['end'] = e  # two calls ("oink oink")
        elif cur: cur.setdefault('limit', s)
    for k in [k for k, v in out.items() if v['start'] is None]: del out[k]
    for v in out.values(): v['start'], v['end'] = trim(db, thresh, v['start'], v['end'], v.get('limit', 1e9))
    return out


def trim(db, thresh, t0, t1, limit, pad=0.06, tail=0.25):
    """Drop hiss before the clip: start at the first 10 ms frame 8 dB over the speech threshold.
    Keep the word's trail-off: end 250 ms after the last such frame (the cut fades it out), short of `limit` (the next item)."""
    a = int(t0 * 100)
    loud = np.flatnonzero(db[a:int(t1 * 100)] > thresh + 8)
    if len(loud): t0, t1 = (a + loud[0]) / 100, (a + loud[-1] + 1) / 100
    return max(0, t0 - pad), min(t1 + tail, limit - 0.03)


def first_dip(db, thresh, t0, t1):
    """First 80 ms near the noise floor between t0 and t1 (the gap after a word), else t1."""
    a, b = int(t0 * 100), int(t1 * 100)
    quiet = np.convolve(db[a:b] < thresh + 3, np.ones(8), mode='valid') >= 8
    return (a + int(np.argmax(quiet))) / 100 if quiet.any() else t1


def cut(src_wav, t0, t1, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{t0:.3f}', '-to', f'{t1:.3f}', '-i', str(src_wav),
                    '-af', 'afade=t=in:d=0.01,areverse,afade=t=in:d=0.12,areverse',
                    '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '2', str(dest)], check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('take')
    ap.add_argument('--model', default='small.en')
    ap.add_argument('--dry-run', action='store_true', help='report only, write no clips')
    a = ap.parse_args()

    wav, pcm = load(a.take)
    regions, thresh, db = speech_regions(pcm)
    print(f'take {len(pcm) / RATE:.1f} s, {len(regions)} speech regions (threshold {thresh:.0f} dBFS)')
    words = transcribe(pcm, regions, a.model)
    found, last_i = match(words)
    place(found, regions, db)
    sounds = animal_sounds(words, regions, db, thresh, words[last_i - 1]['r'] + 1 if last_i else 0)

    voice_dir, animal_dir, prev_dir = HERE / 'audio/voice', HERE / 'audio/animals', HERE / 'build/voice-preview'
    print('\nclip            start    len  conf  note')
    for cid, _ in EXPECTED:
        f = found.get(cid)
        if not f: print(f'{cid:<14}      -      -     -  MISSING'); continue
        t0, t1 = trim(db, thresh, f['start'], f['end'], f['limit'])
        notes = [n for n, on in [('retake', f['retake']), ('DOUBTFUL', f['p'] < 0.5), ('LONG', t1 - t0 > (1.5 if len(f['words']) == 1 else 3)), ('SHORT', t1 - t0 < 0.2)] if on]
        if f['heard']: notes.append(f'HEARD "{f["heard"]}"')
        print(f'{cid:<14} {t0:7.2f} {t1 - t0:6.2f} {f["p"]:5.2f}  {" ".join(notes)}')
        if not a.dry_run: cut(wav['voice'], t0, t1, voice_dir / f'{cid}.mp3')
    for key in ANIMALS + [f'{x}-2' for x in ANIMALS]:
        s = sounds.get(key)
        if not s:
            if '-2' not in key: print(f'sound {key:<8}      -      -        MISSING')
            continue
        notes = [n for n, on in [('retake', s['retake']), ('LONG', s['end'] - s['start'] > 2)] if on]
        print(f'sound {key:<8} {s["start"]:7.2f} {s["end"] - s["start"]:6.2f}        {" ".join(notes)}')
        if not a.dry_run: cut(wav['sounds'], s['start'], s['end'], animal_dir / f'{key}.mp3')

    print('\nheard:', ' '.join(w['w'] for w in words))
    if a.dry_run: return
    prev_dir.mkdir(parents=True, exist_ok=True)
    gap = prev_dir / '_gap.wav'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.12', str(gap)], check=True)
    for name, ids in PREVIEWS.items():
        if not all(i in found for i in ids): continue
        inputs = sum([['-i', str(voice_dir / f'{i}.mp3'), '-i', str(gap)] for i in ids], [])
        n = len(ids) * 2
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex',
                        ''.join(f'[{k}:a]' for k in range(n)) + f'concat=n={n}:v=0:a=1', str(prev_dir / f'{name}.mp3')], check=True)
    gap.unlink()
    print(f'\npreviews in {prev_dir.relative_to(HERE)}/ ; clips in audio/voice/ and audio/animals/')


if __name__ == '__main__':
    sys.exit(main())
