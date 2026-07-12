# IELTS AI — Open Knowledge Document

> **Version:** 0.2.0
> **Status:** Active
> **Last Updated:** 2026-07-12

---

## 1. Overview

IELTS AI is an audio-reactive IELTS speaking practice application. It features a real-time 3D glass orb visualization driven by microphone input, speech-to-text (STT) transcription, AI-powered conversation, and text-to-speech (TTS) responses. English only.

**Core capabilities:**
- Real-time audio-reactive Three.js glass orb (WebGL + GLSL shaders)
- Speech-to-text via Web Speech API (English)
- AI conversation via OpenRouter free models with fallback chain
- Text-to-speech via server-side Edge neural voices (msedge-tts)
- Admin panel for API key management and fallback chain configuration

---

## 2. Architecture

```
src/
├── app/
│   ├── layout.tsx              Root layout (Inter font, metadata)
│   ├── page.tsx                Main page (orb + STT + TTS + AI)
│   ├── globals.css             Tailwind v4 + shadcn theme
│   ├── api/
│   │   ├── chat/route.ts       AI chat endpoint (multi-provider fallback)
│   │   ├── tts/route.ts        Server-side TTS proxy (Edge neural voices)
│   │   └── admin/
│   │       ├── settings/route.ts  Config read/write (config.json)
│   │       └── test/route.ts      Provider API key tester
│   └── pathfinder/
│       └── page.tsx            Admin panel (sidebar, dynamic keys, fallback chain)
├── components/
│   └── ui/
│       ├── button.tsx          shadcn Button (Ferrari style)
│       └── fire-sphere.tsx     Three.js glass orb component
├── lib/
│   └── utils.ts                cn() utility (clsx + tailwind-merge)
└── speech-recognition.d.ts     Web Speech API type declarations
```

**External dependencies:**
| Package | Purpose |
|---|---|
| `next` 16.x | Framework (App Router, Turbopack) |
| `react` 19.x | UI runtime |
| `three` 0.185 | 3D rendering (WebGL) |
| `@google/generative-ai` | Gemini AI SDK |
| `msedge-tts` | Server-side Edge neural TTS |
| `tailwindcss` v4 | Styling |
| `shadcn` v4 | UI component library |
| `lucide-react` | Icons |

---

## 3. Data Flow

### 3.1 Audio Pipeline

```
Microphone → AudioContext → GainNode → AnalyserNode → FFT (getByteFrequencyData)
    → RMS calculation → smooth (lerp 0.15) → state update
    → Glass orb uniforms (mode, intensity)
    → GainNode muted during TTS playback (gain=0)
```

### 3.2 Speech Pipeline

```
Microphone → Web Speech API (SpeechRecognition, en-US)
    → onresult (final + interim) → React state
    → 800ms debounce (no interim) → POST /api/chat
```

### 3.3 AI Pipeline

```
POST /api/chat { message, history, lang: "en" }
    → Config fallback chain: [name1, name2, ...]
    → For each provider in chain:
        → OpenRouter: openai/gpt-oss-120b:free (primary)
                    → nvidia/nemotron-3-ultra-550b-a55b:free (fallback)
                    → retry on 429 with 2s delay
        → Groq: llama-3.3-70b-versatile
        → Gemini: gemini-2.0-flash
    → Content/reasoning field extraction
    → cleanResponse() strips thinking tags, safety labels
    → { reply, provider, usage: { prompt, completion, total } }
    → Display + server-side TTS
```

### 3.4 TTS Pipeline

```
AI reply text → /api/tts?text=...&lang=en
    → msedge-tts package
    → Voice: en-US-GuyNeural
    → Audio streamed back to client
    → Mic muted during playback (GainNode gain=0)
    → 300ms cooldown after TTS ends before mic unmutes
    → 100ms delay before recognition restarts
```

---

## 4. Component Reference

### 4.1 FireSphere (Glass Orb)

**File:** `src/components/ui/fire-sphere.tsx`

A Three.js WebGL glass orb with custom GLSL shaders, post-processing bloom, and audio-reactive uniforms. Dual-mode visual: red/black for user speaking, blue/white for AI speaking.

| Prop | Type | Default | Description |
|---|---|---|---|
| `mode` | `'idle' \| 'listening' \| 'speaking'` | `'idle'` | Visual state |
| `intensity` | `number` | `0` | Mic RMS volume (0-1) |
| `className` | `string` | `''` | Wrapper class |

**GLSL shader technique:**
- Vertex shader passes normals, view direction, world position
- Fragment uses smooth sine waves (not fbm) for clean surface
- Fresnel-based glass transparency: center transparent, edges glow
- Dual color palettes: black+red (listening), white+blue (speaking)
- Internal swirl noise for liquid light movement
- Alpha transparency (0.08 center → 0.7 edge) for glass feel
- UnrealBloomPass for soft halo glow

**Animation:**
- Listening: volume-driven scale pulse (up to 25%), position jitter, rotation
- Speaking: double sine pulse, fast rotation, dramatic wobble
- Smooth mode transitions (lerp at 3.5%/frame)
- Bloom adjusts per mode and volume

### 4.2 STT (Web Speech API)

- Language: `en-US` (hardcoded)
- `continuous: true`, `interimResults: true`
- Auto-restarts on `onend` while mic is active
- 800ms debounce before sending to AI (waits for user to finish speaking)

### 4.3 TTS (Server-side)

- Package: `msedge-tts` (Edge neural voices)
- Voice: `en-US-GuyNeural`
- Language auto-detection: counts Cyrillic vs Latin characters
- Voices: EN=`en-US-GuyNeural`, UZ=`tr-TR-AhmetNeural`, RU=`ru-RU-SvetlanaNeural`
- Mic muted via GainNode during playback
- 300ms cooldown after TTS ends

---

## 5. API Reference

### 5.1 POST /api/chat

Sends user speech to AI with conversation history and returns a reply.

**Request:**
```json
{
  "message": "I go to store yesterday",
  "history": [
    { "role": "user", "content": "hi there" },
    { "role": "assistant", "content": "Grammar survived. Describe a hobby you enjoy." }
  ],
  "lang": "en"
}
```

**Response (200):**
```json
{
  "reply": "Grammar survived. Describe a hobby you enjoy.",
  "provider": "test",
  "usage": { "prompt": 136, "completion": 37, "total": 173 }
}
```

**Response (502):** `{ "reply": "All providers failed.", "error": "..." }`

### 5.2 GET /api/tts

Streams TTS audio for given text.

**Query params:** `text` (string), `lang` (en|uz|ru)
**Response:** Audio/mpeg stream

### 5.3 Admin API

| Route | Method | Description |
|---|---|---|
| `/pathfinder` | GET | Admin UI page |
| `/api/admin/settings` | GET | Read config.json |
| `/api/admin/settings` | POST | Save config.json |
| `/api/admin/test` | POST | Test provider API key |

---

## 6. Configuration

**File:** `config.json` (gitignored, project root)

```json
{
  "API_KEYS": [
    { "name": "test", "key": "sk-...", "type": "openrouter" }
  ],
  "FALLBACK_CHAIN": ["test"],
  "SYSTEM_PROMPT": "..."
}
```

**Provider types:** `groq`, `openrouter`, `gemini`

**Available free OpenRouter models:**
- `openai/gpt-oss-120b:free` (primary — clean content/reasoning separation)
- `nvidia/nemotron-3-ultra-550b-a55b:free` (fallback)

---

## 7. Admin Panel — /pathfinder

Server-rendered admin panel with sidebar layout.

**Features:**
- Dynamic API key management (add/remove/edit keys)
- Fallback chain reorder (drag to prioritize providers)
- System prompt editor
- Provider API key testing
- Provider type selection (groq/openrouter/gemini)

**Security note:** No authentication. Local development use only.

---

## 8. Design System

Based on Ferrari automotive brand design:

- **Canvas:** `#181818` (near-black, never pure black)
- **Primary:** `#da291c` (Rosso Corsa)
- **Typography:** Inter (FerrariSans substitute)
- **Corners:** 0px sharp (never rounded)
- **CTA labels:** Uppercase, 1.4px tracking
- **Background:** Radial gradient with mode-specific glow (red for user, blue for AI)

---

## 9. Speech Recognition

**API:** Web Speech API (`webkitSpeechRecognition`)

| Language | Code | Status |
|---|---|---|
| English (US) | `en-US` | Active (only language) |

**Configuration:**
- `continuous: true` — runs until stopped
- `interimResults: true` — provides partial transcription
- Auto-restarts on `onend` while mic is active
- 800ms silence debounce before sending to AI

---

## 10. Text-to-Speech

**Package:** `msedge-tts` (server-side, Edge neural voices)

| Language | Voice | Quality |
|---|---|---|
| English | `en-US-GuyNeural` | High |
| Uzbek | `tr-TR-AhmetNeural` | High (Turkish, better than native Uzbek) |
| Russian | `ru-RU-SvetlanaNeural` | High |

- Language auto-detected from response text (Cyrillic vs Latin count)
- Mic muted during playback via GainNode
- 300ms cooldown after TTS ends before mic unmutes

---

## 11. Key Behaviors

- **Auto-start:** Mic starts automatically on page load
- **No feedback loop:** Mic muted during TTS, 300ms cooldown after
- **No reasoning leaks:** Models with clean content/reasoning separation used
- **Fast response:** 800ms silence debounce, 25s per-model timeout
- **Fallback chain:** Automatically tries next provider on failure/429

---

## 12. Development

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
```

**Key pages:**
| Path | Description |
|---|---|
| `/` | Main app (glass orb + STT + AI chat + TTS) |
| `/pathfinder` | Admin panel (API key management, fallback chain) |

---

## 13. License

Private — not for distribution.
