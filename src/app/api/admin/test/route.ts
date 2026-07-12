import { NextRequest, NextResponse } from 'next/server';

async function testGemini(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent('Say "ok" in one word.');
    const text = result.response.text();
    if (text && text.length > 0) return { ok: true };
    return { ok: false, error: 'Empty response' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function testOpenAICompatible(apiKey: string, baseUrl: string, model: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
        max_tokens: 10,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

const PROVIDER_CONFIG: Record<string, { baseUrl: string; model: string }> = {
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/free' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
};

export async function POST(req: NextRequest) {
  const { provider, apiKey } = await req.json();

  if (!provider || !apiKey) {
    return NextResponse.json({ ok: false, error: 'Missing provider or apiKey' }, { status: 400 });
  }

  if (provider === 'gemini') {
    return NextResponse.json(await testGemini(apiKey));
  }

  const config = PROVIDER_CONFIG[provider];
  if (config) {
    return NextResponse.json(await testOpenAICompatible(apiKey, config.baseUrl, config.model));
  }

  return NextResponse.json({ ok: false, error: `Unknown provider type: ${provider}` });
}
