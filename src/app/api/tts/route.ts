import { NextRequest } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const VOICES: Record<string, string> = {
  en: 'en-US-GuyNeural',
  uz: 'tr-TR-AhmetNeural',
  ru: 'ru-RU-SvetlanaNeural',
};

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text');
  const lang = req.nextUrl.searchParams.get('lang') ?? 'en';

  if (!text || text.replace(/[.\s]/g, '').length < 3) {
    return new Response('Text too short or empty', { status: 400 });
  }

  const voice = VOICES[lang] ?? VOICES.en;

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(text);

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    tts.close();

    const audio = Buffer.concat(chunks);

    return new Response(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    return new Response(`TTS error: ${e instanceof Error ? e.message : 'unknown'}`, { status: 500 });
  }
}
