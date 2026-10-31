#!/usr/bin/env python3
"""Generate the local audio pack for 英语记忆乐园 / 英语小镇.

Voices chosen by the user:
  teacher / words / sentences : en-US-EmmaNeural
  shopkeeper                  : en-US-GuyNeural
  child                       : en-US-AnaNeural

Outputs:
  audio/*.mp3
  audio/entries.json   (resume cache)
  audio/manifest.js    (window.AUDIO_MANIFEST)
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audio"
OUT.mkdir(parents=True, exist_ok=True)
ENTRIES = OUT / "entries.json"

VOICES = {
    "emma": "en-US-EmmaNeural",
    "guy": "en-US-GuyNeural",
    "ana": "en-US-AnaNeural",
}

# ---------------------------------------------------------------- content
WORDS = [
    # toys
    "toy jeep", "toy train", "toy truck", "toy digger", "robot", "teddy bear",
    "doll", "building blocks", "ball", "toy car", "toy gun",
    # shapes
    "triangle", "rectangle", "square", "diamond", "heart", "circle",
    # school places
    "school", "classroom", "music room", "art room", "gym", "library",
    # colours
    "orange", "pink", "red", "yellow", "purple", "green", "blue", "white", "brown",
    # food
    "tea", "coffee", "milk", "noodles", "chicken", "hamburger", "vegetables",
    "pear", "apple", "banana", "watermelon",
    # body
    "eye", "ear", "face", "nose", "hand",
    # sports
    "play football", "play ping-pong", "ski", "skate", "swim",
    # school things
    "ruler", "marker", "pencil",
    # extra words from the supplementary worksheets
    "a balloon", "car", "bus", "jeep", "juice", "water",
    "kitten", "puppy", "bird", "three", "four", "one",
    # 快乐英语第 3 册 · Unit 1 Our school
    "school", "classroom", "music room", "art room", "science room", "library",
    # Unit 2 Our classroom
    "blackboard", "chair", "desk", "door", "floor",
    # Unit 3 Our weekdays
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
    "jump rope", "go swimming", "go skating",
    # Unit 4 Our subjects
    "Chinese", "English", "maths", "PE", "science", "music", "art",
    # Unit 5 Our weekends
    "clean my room", "go to the museum", "make New Year cards",
    "sing and dance", "visit grandma and grandpa",
]

SENTENCES = [
    # Unit 1
    "I have a toy truck.",
    "I like toy trucks.",
    "I like toy trains.",
    "I want a pink doll.",
    "Look at my robot.",
    "Do you have a toy jeep?",
    "What colour is it?",
    "How many balls?",
    "What about some milk?",
    "Touch your nose, please.",
    # Unit 2
    "It's a diamond.",
    "It's a circle.",
    "There are two squares.",
    "There are two triangles.",
    "There are three triangles.",
    "There are four circles.",
    "There are two rectangles.",
    "There are three hearts.",
    "There are two diamonds.",
    "I can draw a heart.",
    "What shape is it?",
    "How many triangles?",
    "Draw one heart.",
    "Draw two squares.",
    "Draw three triangles.",
    "Draw one circle and two rectangles.",
    "Draw two hearts and one diamond.",
    "Draw four circles.",
    "Draw one square and three hearts.",
    # Unit 3
    "This is our music room.",
    "This is our classroom.",
    "This is our library.",
    "This is our gym.",
    "This is our art room.",
    "Welcome to our classroom.",
    "Welcome to our art room.",
    "We love our library.",
    "We love our music room.",
    "I like my school.",
    # extra sentences from the supplementary worksheets
    "Look, my building blocks.",
    "Look, my toy digger.",
    "I want a toy train.",
    "I want a toy jeep.",
    "A robot for you.",
    "A doll for you.",
    "I have a red toy car.",
    "I have a yellow toy truck.",
    "A blue toy digger for you.",
    "A red toy digger for you.",
    "Here you are.",
    "Thank you.",
    "You are welcome.",
    "My car is coming.",
    "Would you like some Coke?",
    "Look, a toy digger!",
    "I am a fish. I can swim.",
    "Do you have a robot?",
    "They are building blocks.",
    "It's a square.",
    "I can draw a triangle.",
    "I like the heart.",
    "Look, a diamond.",
    "I can draw three circles.",
    "It's a black triangle.",
    "I can draw a rectangle.",
    "I can draw a very nice robot.",
    "Colour the square pink.",
    "Colour the circle yellow.",
    "Colour the diamond green.",
    "Colour the heart red.",
    "Colour the triangle orange.",
    "This is our school.",
    "What colour?",
    "What shape?",
    "We have six art rooms.",
    "We have five art rooms.",
    "This way, please.",
    "We love our school.",
    "I want a square-shaped cake.",
    "I want a rectangle-shaped cake.",
    "Study and sing, draw and play.",
    "Hello, I'm Jinjin.",
    "Wow! How big!",
    "Thank you. We all love it.",
    # ---- 快乐英语第 3 册 Unit 1 Our school
    "Hello! Welcome to our school.",
    "Hi! Your school is beautiful.",
    "This is our library.",
    "Wow, it's big!",
    "Hello! I'm Li Tiantian.",
    "Look, this is our music room.",
    "School day, happy day.",
    "Library, read all day.",
    "Music room, sing and play.",
    "Art room, draw today.",
    "Science room, fun we play.",
    "Classroom, learn the happy way.",
    # ---- Unit 2 Our classroom
    "I clean the blackboard.",
    "Good job!",
    "I mop the floor.",
    "Mia, please clean the desk.",
    "Clean the classroom.",
    "Clean the door and the desk.",
    "Clean the chair and the blackboard.",
    "All is clean. With great care.",
    # ---- Unit 3 Our weekdays
    "It's Friday. Let's play football!",
    "OK! Let's play together!",
    "It's Monday.",
    "Let's jump rope.",
    "Let's go swimming.",
    "Let's play ping-pong.",
    "Let's go skating.",
    "Monday, Tuesday, Wednesday.",
    "Thursday and Friday.",
    "Weekdays, weekdays, weekdays!",
    "Fine days, fine days!",
    # ---- Unit 4 Our subjects
    "What subject do you like best?",
    "I like Chinese best.",
    "How about you, Leo?",
    "I like PE best.",
    "On Monday, I have maths.",
    "I like music best.",
    "Read, write and say.",
    "Sun, earth and ray.",
    "Jump, run and play.",
    "One, two, three! Hey!",
    # ---- Unit 5 Our weekends
    "What will you do this weekend?",
    "I will visit my grandma and grandpa on Saturday.",
    "I will make New Year cards on Sunday.",
    "Hello! My name is Li Jinjin.",
    "This is my weekend plan.",
    "I will clean my room on Saturday.",
    "I will go to the museum on Sunday.",
    "Weekends! Weekends! What will you do?",
    "Clean my room! Cool! Cool! Cool!",
    "Sing and dance! Good! Good! Good!",
    "Go to the museum! Go! Go! Go!",
    "Make New Year cards! Fun! Fun! Fun!",
    "Visit grandma, grandpa too! Hooray!",
    # ---- Fun story
    "Bye! Tiantian.",
    "Be good, Lucky! Bye!",
    "We read books together.",
    "We play with building blocks together.",
    "We draw pictures together.",
    "They go swimming. I play with toys.",
    "We make New Year cards together.",
    "We play football together.",
    # ---- Amazing Tianjin
    "Welcome to Yangliuqing Ancient Town.",
    "They're famous Yangliuqing Woodblock New Year Prints.",
    "The prints are so beautiful!",
    "This is Clay Figurine Zhang.",
    "Look at the kite. It's Kite Wei.",
    "Xiangsheng is fun.",
]

SHOPKEEPER = [
    "Hello! Welcome to my toy shop.",
    "What do you want?",
    "What colour is it?",
    "Here you are.",
    "Yes, I do. How many?",
    "What about some milk?",
    "Here you are. Goodbye!",
]

CHILD = [
    "Hello!",
    "I want a pink doll.",
    "It's pink.",
    "Thank you!",
    "Do you have a toy jeep?",
    "Two, please.",
    "Yes, please.",
    "Goodbye!",
]

# ---------------------------------------------------------------- helpers
def norm(text: str) -> str:
    text = text.replace("’", "'").replace("‘", "'")
    text = text.replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", text).strip().lower()


def ffprobe_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        text=True,
    ).strip()
    return float(out)


def tokens(text: str):
    return re.findall(r"\S+", text)


def sentence_texts(text: str):
    return [s.strip() for s in re.findall(r"[^.!?]+[.!?]*", text) if s.strip()]


def make_timings(text: str, boundaries, duration: float):
    """Approximate word timings from sentence boundaries."""
    toks = tokens(text)
    if not toks:
        return []
    sentences = sentence_texts(text)
    # Match token groups to sentences in order.
    groups, cursor = [], 0
    for s in sentences:
        n = len(tokens(s))
        if n <= 0:
            continue
        groups.append(toks[cursor:cursor + n])
        cursor += n
    if cursor < len(toks):
        if groups:
            groups[-1].extend(toks[cursor:])
        else:
            groups.append(toks[cursor:])

    boundaries = sorted(boundaries, key=lambda b: b.get("offset", 0))
    timings = []
    if len(boundaries) >= len(groups) and groups:
        for gi, group in enumerate(groups):
            b = boundaries[gi]
            start = b.get("offset", 0) / 10_000_000
            dur = b.get("duration", 0) / 10_000_000
            if dur <= 0:
                dur = max(0.2, duration / max(1, len(groups)))
            weights = [max(1.0, len(t) + 1.2) for t in group]
            total = sum(weights) or 1.0
            acc = 0.0
            for t, w in zip(group, weights):
                s = start + dur * (acc / total)
                e = start + dur * ((acc + w) / total)
                timings.append({"w": t, "s": round(s, 3), "e": round(e, 3)})
                acc += w
    else:
        weights = [max(1.0, len(t) + 1.2) for t in toks]
        total = sum(weights) or 1.0
        acc = 0.0
        for t, w in zip(toks, weights):
            s = duration * (acc / total)
            e = duration * ((acc + w) / total)
            timings.append({"w": t, "s": round(s, 3), "e": round(e, 3)})
            acc += w
    return timings


async def synth_one(clip, index):
    voice_key = clip["voice"]
    voice = VOICES[voice_key]
    rate = clip["rate"]
    text = clip["text"]
    filename = f"{voice_key}-{index:03d}.mp3"
    path = OUT / filename

    last_err = None
    for attempt in range(3):
        try:
            communicate = edge_tts.Communicate(text, voice, rate=rate)
            audio = bytearray()
            boundaries = []
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio.extend(chunk["data"])
                elif chunk["type"] == "SentenceBoundary":
                    boundaries.append(chunk)
            if not audio:
                raise RuntimeError("empty audio")
            path.write_bytes(audio)
            duration = ffprobe_duration(path)
            timings = make_timings(text, boundaries, duration)
            return {
                "file": f"audio/{filename}",
                "voice": voice_key,
                "text": text,
                "duration": round(duration, 3),
                "timings": timings,
            }
        except Exception as exc:
            last_err = exc
            await asyncio.sleep(1.2 + attempt * 1.5)
    raise RuntimeError(f"failed {voice_key} / {text!r}: {last_err}")


# ---------------------------------------------------------------- build list
clips = []

for w in WORDS:
    clips.append({"voice": "emma", "text": w, "rate": "-20%", "kind": "word"})
for s in SENTENCES:
    clips.append({"voice": "emma", "text": s, "rate": "-15%", "kind": "sentence"})
for s in SHOPKEEPER:
    clips.append({"voice": "guy", "text": s, "rate": "-8%", "kind": "shop"})
for s in CHILD:
    clips.append({"voice": "ana", "text": s, "rate": "-10%", "kind": "child"})

# Deduplicate by voice + normalized text; first one wins.
unique, seen = [], set()
for c in clips:
    key = f"{c['voice']}|{norm(c['text'])}"
    if key in seen:
        continue
    seen.add(key)
    unique.append(c)
clips = unique

print(f"clips to generate: {len(clips)}")

entries = {}
if ENTRIES.exists():
    try:
        entries = json.loads(ENTRIES.read_text(encoding="utf-8"))
        print(f"resume cache: {len(entries)} entries")
    except Exception:
        entries = {}

counters = {"emma": 0, "guy": 0, "ana": 0}
for e in entries.values():
    # Keep counters above existing file numbers.
    m = re.search(r"-(\d+)\.mp3$", e.get("file", ""))
    if m:
        v = e.get("voice")
        if v in counters:
            counters[v] = max(counters[v], int(m.group(1)))

async def main():
    generated = 0
    for c in clips:
        key = f"{c['voice']}|{norm(c['text'])}"
        if key in entries and (ROOT / entries[key]["file"]).exists():
            continue
        counters[c["voice"]] += 1
        idx = counters[c["voice"]]
        try:
            info = await synth_one(c, idx)
            entries[key] = info
            generated += 1
            print(f"[{generated}] {c['voice']:4} {c['text']}")
            ENTRIES.write_text(json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8")
            await asyncio.sleep(0.12)
        except Exception as exc:
            print(f"!! {exc}", file=sys.stderr)

asyncio.run(main())

manifest = {
    "voices": {
        "emma": {"id": VOICES["emma"], "label": "Emma · 老师"},
        "guy": {"id": VOICES["guy"], "label": "Guy · 店员"},
        "ana": {"id": VOICES["ana"], "label": "Ana · 小孩"},
    },
    "clips": entries,
}
(OUT / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
)
(OUT / "manifest.js").write_text(
    "window.AUDIO_MANIFEST = "
    + json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
    + ";\n",
    encoding="utf-8",
)
print(f"done. entries={len(entries)} / clips={len(clips)}")
