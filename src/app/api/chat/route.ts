import { NextRequest, NextResponse } from 'next/server';
import { readConfig } from '@/app/api/admin/settings/route';

type ApiKey = { name: string; key: string; type: string };
type TokenUsage = { prompt: number; completion: number; total: number };

const OPENROUTER_MODELS = [
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
];
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GEMINI_MODEL = 'gemini-2.0-flash';

function cleanResponse(text: string): string {
  let t = text.trim();
  t = t.replace(/<\|?\/?(?:thinking|reason|thought|scratchpad)\|?>/gi, '');
  t = t.replace(/\[\/?(?:thinking|reason|thought|scratchpad)\s*\]/gi, '');
  t = t.replace(/User Safety:.*$/gm, '');
  t = t.replace(/Response Safety:.*$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t.length < 3 ? '' : t;
}

async function callOpenAI(baseUrl: string, model: string, messages: { role: string; content: string }[], apiKey: string): Promise<{ reply: string; usage: TokenUsage }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 200, temperature: 0.7 }),
    signal: controller.signal,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  const content = msg?.content ?? '';
  const reasoning = msg?.reasoning ?? '';
  let raw: string;
  if (content && content !== reasoning) {
    raw = content;
  } else if (content) {
    raw = content;
  } else {
    raw = reasoning;
  }
  return {
    reply: cleanResponse(raw),
    usage: { prompt: data.usage?.prompt_tokens ?? 0, completion: data.usage?.completion_tokens ?? 0, total: data.usage?.total_tokens ?? 0 },
  };
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(messages: { role: string; content: string }[], apiKey: string): Promise<{ reply: string; usage: TokenUsage }> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMsgs = messages.filter((m) => m.role !== 'system');
  const contents = chatMsgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  if (systemMsg && contents.length > 0 && contents[0].role === 'user') {
    contents[0].parts[0].text = systemMsg.content + '\n\n' + contents[0].parts[0].text;
  }
  const result = await model.generateContent({ contents });
  const meta = result.response.usageMetadata;
  return {
    reply: cleanResponse(result.response.text()),
    usage: { prompt: meta?.promptTokenCount ?? 0, completion: meta?.candidatesTokenCount ?? 0, total: meta?.totalTokenCount ?? 0 },
  };
}

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function tryOpenRouter(messages: { role: string; content: string }[], apiKey: string): Promise<{ reply: string; usage: TokenUsage }> {
  let lastErr = '';
  for (const model of OPENROUTER_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await callOpenAI('https://openrouter.ai/api/v1', model, messages, apiKey);
      } catch (e) {
        lastErr = `${model}: ${e instanceof Error ? e.message : 'failed'}`;
        if (e instanceof Error && e.message.includes('429')) {
          await sleep(2000);
          continue;
        }
        break;
      }
    }
  }
  throw new Error(lastErr || 'All OpenRouter models failed');
}

async function callProvider(messages: { role: string; content: string }[], entry: ApiKey): Promise<{ reply: string; usage: TokenUsage; provider: string }> {
  if (entry.type === 'groq') {
    const r = await callOpenAI('https://api.groq.com/openai/v1', GROQ_MODEL, messages, entry.key);
    return { ...r, provider: entry.name };
  }
  if (entry.type === 'openrouter') {
    const r = await tryOpenRouter(messages, entry.key);
    return { ...r, provider: entry.name };
  }
  if (entry.type === 'gemini') {
    const r = await callGemini(messages, entry.key);
    return { ...r, provider: entry.name };
  }
  throw new Error(`Unknown provider: ${entry.type}`);
}

export async function POST(req: NextRequest) {
  try {
    const { message, history, lang } = await req.json();
    if (!message) return NextResponse.json({ error: 'No message' }, { status: 400 });

    const config = readConfig();
    const prompts: Record<string, string> = {
      en: 'You are Grammar Qassob, a sarcastic IELTS speaking coach. Reply only in English.\n\nFor every student answer:\n1. Find grammar mistake\n2. Roast it briefly\n3. Give correct English in quotes\n4. Ask next IELTS question\n\nNo mistakes? Say "Grammar survived" and ask next question.\nMax 25 words.',
      uz: "Sen Grammar Qassob, IELTS o'qituvchisisan. Faqat o'zbekchada javob ber.\n\nHar bir javobda:\n1. Xatoni top\n2. Hazil qil\n3. To'g'risini tirnoqda ber\n4. Keyingi savol ber\n\nXato yo'q? \"Grammatika tirik\" deb ayt va savol ber.\n25 so'zdan kam.",
      ru: 'Ты Grammar Qassob, строгий преподаватель IELTS. Отвечай только по-русски.\n\nДля каждого ответа:\n1. Найди ошибку\n2. Подшути\n3. Правильный вариант в кавычках\n4. Задай следующий вопрос\n\nОшибок нет? Скажи "Грамматика выжила" и задай вопрос.\nМаксимум 25 слов.',
    };

    const messages = [
      { role: 'system', content: prompts[lang] || prompts.en },
      ...((history || []) as { role: string; content: string }[]),
    ];

    const chain: string[] = config.FALLBACK_CHAIN || [];
    const keys: ApiKey[] = config.API_KEYS || [];
    let lastError: string | undefined;

    for (const name of chain) {
      const entry = keys.find((k) => k.name === name);
      if (!entry) { lastError = `${name}: not found`; continue; }
      try {
        const r = await callProvider(messages, entry);
        return NextResponse.json({ reply: r.reply, provider: r.provider, usage: r.usage });
      } catch (e) {
        lastError = `${entry.name}: ${e instanceof Error ? e.message : 'failed'}`;
      }
    }

    if (chain.length === 0 && keys.length > 0) {
      try {
        const r = await callProvider(messages, keys[0]);
        return NextResponse.json({ reply: r.reply, provider: r.provider, usage: r.usage });
      } catch (e) {
        lastError = `${keys[0].name}: ${e instanceof Error ? e.message : 'failed'}`;
      }
    }

    return NextResponse.json({ reply: 'All providers failed. Check your API keys.', error: lastError }, { status: 502 });
  } catch (err) {
    console.error('Chat API error:', err);
    return NextResponse.json({ reply: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
