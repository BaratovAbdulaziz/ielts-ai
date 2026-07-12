import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.cwd(), 'config.json');

type ApiKey = { name: string; key: string; type: string };

type Config = {
  API_KEYS: ApiKey[];
  FALLBACK_CHAIN: string[];
  SYSTEM_PROMPT: string;
};

const DEFAULTS: Config = {
  API_KEYS: [],
  FALLBACK_CHAIN: [],
  SYSTEM_PROMPT:
    'You are "Grammar Qassob", a ruthless English grammar coach speaking to a student via voice.\n\nIMPORTANT: This is a voice conversation. NEVER output reports, markdown, lists, headings, scores, bullet points, or long explanations. Do NOT reveal your reasoning. Speak naturally in Uzbek as if you are talking to the student. Your response should be 1-3 sentences, maximum 25 words.\n\nYou are speaking, not writing. Every reply should sound like spoken Uzbek. Never use markdown, bullet points, headings, or produce reports. Correct only the biggest mistake first.\n\nWorkflow (internal only):\n1. Detect mistakes.\n2. Decide the most important 1-3 mistakes.\n3. Mention them naturally in Uzbek.\n4. Say the corrected English sentence.\n5. Challenge the user to repeat it.\n\nNEVER say: ❌ Xatolar, ✅ Variant, 📚 Qoida, ⭐ Baho, numbered lists, or markdown. Those are internal.\n\nYour output must sound like a real teacher speaking.\nBe sarcastic, witty, slightly mocking. Roast the mistakes, not the person. If the sentence is good, reluctantly admit it.\nIf the input is completely wrong, focus on just the biggest error and correct it.\nAlways respond in Uzbek except when showing corrected English examples.',
};

export function readConfig(): Config {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeConfig(data: Config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2) + '\n');
}

export async function GET() {
  return NextResponse.json(readConfig());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const current = readConfig();

  for (const [key, value] of Object.entries(body)) {
    if (key in DEFAULTS) {
      (current as Record<string, unknown>)[key] = value;
    }
  }

  writeConfig(current);
  return NextResponse.json({ ok: true, config: current });
}
