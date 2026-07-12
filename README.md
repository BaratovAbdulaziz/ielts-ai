# IELTS AI

Audio-reactive IELTS speaking practice with a 3D glass orb, real-time STT, AI conversation, and neural TTS.

## Features

- **Glass Orb Visualization** — Three.js WebGL sphere with GLSL shaders, reacts to your voice in real-time. Red/black when you speak, ocean blue when AI responds.
- **Speech-to-Text** — Web Speech API captures your English speech automatically
- **AI Conversation** — Free OpenRouter models with automatic fallback chain
- **Neural TTS** — Server-side Edge voices (msedge-tts) for natural AI responses
- **Admin Panel** — `/pathfinder` for managing API keys and fallback chain

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — mic auto-starts, just speak.

## Configuration

Add your API key in the admin panel at `/pathfinder`, or create `config.json`:

```json
{
  "API_KEYS": [
    { "name": "mykey", "key": "sk-...", "type": "openrouter" }
  ],
  "FALLBACK_CHAIN": ["mykey"]
}
```

**Supported providers:** `openrouter` (free models), `groq`, `gemini`

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- React 19, TypeScript
- Three.js + GLSL shaders
- Tailwind CSS v4, shadcn v4
- msedge-tts (server-side TTS)

## License

Private
