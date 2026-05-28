# MeetMind

AI meeting assistant — upload meeting audio and get a **speaker-separated transcript** plus an **AI summary** (ringkasan, poin per pembicara, action items, keputusan) in Bahasa Indonesia.

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Transcription (speech-to-text):** [Deepgram](https://deepgram.com) `nova-3` — diarization + utterances + smart formatting, `language=id`
- **Summarization (LLM):** [OpenRouter](https://openrouter.ai) with a fallback chain of free models (`openai/gpt-oss-120b` → `qwen/qwen3-next-80b` → `meta-llama/llama-3.3-70b`) so a rate-limited model rolls over to the next
- **Audio preprocessing:** ffmpeg (used when available — see below)
- **Upload UI:** react-dropzone

## How it works

1. User uploads meeting audio (`.mp3` / `.wav` / `.m4a`).
2. `POST /api/transcribe`:
   - if ffmpeg is available, the audio is **preprocessed** first (see below);
   - audio is sent to Deepgram, which returns words/utterances tagged with a speaker number;
   - the response is formatted into `Pembicara 1: …`, `Pembicara 2: …`, etc.
3. `POST /api/summarize`: the speaker-labelled transcript is sent to an OpenRouter model, which returns a Markdown summary (Ringkasan, Poin per Pembicara, Action Items, Keputusan Penting).

### Audio preprocessing (why it matters)

Low-bitrate / quiet recordings made Deepgram **silently drop speech** — quiet speakers and the tail end of long files. Before sending to Deepgram, the route runs ffmpeg:

```bash
ffmpeg -i <input> -af "dynaudnorm=f=150:g=15,apad=pad_dur=10" \
  -ac 1 -ar 16000 -c:a libopus -b:a 32k -f ogg pipe:1
```

- **Re-encode to clean 16 kHz mono Opus** — fixes the codec-decode quirk that dropped the tail of long recordings.
- **`dynaudnorm`** — dynamic loudness normalization; lifts quiet speakers so they aren't missed.
- **`apad` (trailing silence)** — Deepgram tends to drop speech sitting right at the end of a long file; padding pushes the real audio off that boundary.

If ffmpeg is **not** found, the route falls back to sending the original audio unchanged — so it never crashes, it just skips the enhancement.

## Local vs. hosting (Vercel)

| | Local (full quality) | Vercel (serverless) |
|---|---|---|
| ffmpeg preprocessing | ✅ runs — better accuracy, no dropped speech | ❌ no ffmpeg → falls back to original audio |
| Upload size | large meetings OK | ⚠️ ~4.5 MB request-body limit → short clips only |
| Function timeout | none | ⚠️ up to 60s (Hobby) → long files may time out |

The app **runs on Vercel and won't crash** (it degrades gracefully), but only for short clips and without audio enhancement. For full quality on long meetings, run it **locally** — or deploy to a non-serverless host (Railway / Render / Fly / VPS) where ffmpeg and long processing work.

## Getting started

```bash
npm install
npm run dev
```

Create a `.env` file:

```bash
DEEPGRAM_API_KEY=your_deepgram_key
OPENROUTER_API_KEY=your_openrouter_key
```

### Full quality (local) requires ffmpeg

```bash
# macOS
brew install ffmpeg
```

### Accessing the dev server from another device

`next.config.ts` sets `allowedDevOrigins`. Update the IP there to match your machine if it changes.
