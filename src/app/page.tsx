'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MicOff, Volume2, VolumeX, Settings } from 'lucide-react';
import { FireSphere } from '@/components/ui/fire-sphere';

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition;
    SpeechRecognition: new () => SpeechRecognition;
  }
}

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [rms, setRms] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [tokenUsage, setTokenUsage] = useState<{ prompt: number; completion: number; total: number } | null>(null);
  const [lastProvider, setLastProvider] = useState<string>('');
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef(0);
  const audioDataRef = useRef<Uint8Array>(new Uint8Array(128));
  const smoothRmsRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const lastSentRef = useRef('');
  const isSpeakingRef = useRef(false);

  const isListeningRef = useRef(false);

  const stopRecognition = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setTranscript('');
    setInterim('');
  }, []);

  const [sttSupported, setSttSupported] = useState(true);

  const startRecognitionRef = useRef<() => void>(() => {});

  const startRecognition = useCallback(() => {
    if (isSpeakingRef.current || recognitionRef.current) return;
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setSttSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      setTranscript(finalText);
      setInterim(interimText);
    };

    recognition.onerror = (event: Event & { error?: string }) => {
      console.warn('STT error:', event.error);
      if (event.error === 'not-allowed') {
        setSttSupported(false);
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current && !isSpeakingRef.current) {
        setTimeout(() => {
          if (isListeningRef.current && !isSpeakingRef.current && !recognitionRef.current) {
            startRecognitionRef.current();
          }
        }, 100);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, []);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  });

  const speak = useCallback((text: string) => {
    try {
      const cleanText = text.replace(/[\n\r"]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleanText || cleanText === '...' || cleanText.length < 3) {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        return;
      }
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (micGainRef.current) {
        micGainRef.current.gain.setValueAtTime(0, ctxRef.current!.currentTime);
      }

      const url = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=en`;
      const audio = new Audio(url);

      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        try {
          const source = ctxRef.current.createMediaElementSource(audio);
          source.connect(ctxRef.current.destination);
          if (analyserRef.current) {
            source.connect(analyserRef.current);
          }
        } catch {
          // already connected
        }
      }

      const unmuteMic = () => {
        if (micGainRef.current && ctxRef.current && ctxRef.current.state !== 'closed') {
          micGainRef.current.gain.setValueAtTime(1, ctxRef.current.currentTime);
        }
      };

      audio.onended = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        setTranscript('');
        setInterim('');
        lastSentRef.current = '';
        setTimeout(() => {
          unmuteMic();
          if (isListeningRef.current) {
            setTimeout(() => startRecognition(), 100);
          }
        }, 300);
      };

      audio.onerror = (e) => {
        console.error('TTS audio error:', e, 'URL:', url);
        unmuteMic();
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (isListeningRef.current) {
          setTimeout(() => startRecognition(), 50);
        }
      };

      audio.play().catch((e) => {
        console.error('TTS play error:', e);
        unmuteMic();
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        if (isListeningRef.current) {
          setTimeout(() => startRecognition(), 50);
        }
      });
    } catch (e) {
      console.error('TTS failed:', e);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    }
  }, [startRecognition]);

  const askAI = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || userMessage === lastSentRef.current) return;
      lastSentRef.current = userMessage;
      setIsThinking(true);
      setAiReply('');
      const userEntry = { role: 'user' as const, content: userMessage };
      const updatedHistory = [...historyRef.current, userEntry];
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage, history: updatedHistory, lang: 'en' }),
        });
        const data = await res.json();
        const reply = data.reply ?? 'Sorry, I did not understand that.';
        setAiReply(reply);
        if (data.usage) {
          setTokenUsage(data.usage);
        }
        if (data.provider) {
          setLastProvider(data.provider);
        }
        const newHistory = [...updatedHistory, { role: 'assistant' as const, content: reply }];
        historyRef.current = newHistory;
        setHistory(newHistory);
        speak(reply);
      } catch {
        setAiReply('Sorry, something went wrong.');
      } finally {
        setIsThinking(false);
      }
    },
    [speak]
  );

  useEffect(() => {
    function tick() {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(audioDataRef.current as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < audioDataRef.current.length; i++) {
        const v = audioDataRef.current[i] / 255;
        sum += v * v;
      }
      const rawRms = Math.sqrt(sum / audioDataRef.current.length);
      smoothRmsRef.current = lerp(smoothRmsRef.current, rawRms, 0.15);
      setRms(smoothRmsRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }

    if (isListening) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isListening]);

  useEffect(() => {
    if (transcript && transcript !== lastSentRef.current && !isSpeakingRef.current) {
      const timer = setTimeout(() => {
        if (!interim && !isSpeakingRef.current) {
          askAI(transcript);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [transcript, interim, askAI]);

  const toggleMic = useCallback(async () => {
    if (isListeningRef.current) {
      isListeningRef.current = false;
      analyserRef.current?.disconnect();
      sourceRef.current?.disconnect();
      micGainRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close();
      analyserRef.current = null;
      sourceRef.current = null;
      micGainRef.current = null;
      streamRef.current = null;
      ctxRef.current = null;
      audioDataRef.current.fill(0);
      smoothRmsRef.current = 0;
      setRms(0);
      setIsListening(false);
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      stopRecognition();
      setHistory([]);
      setAiReply('');
    } else {
      isListeningRef.current = true;
      setIsListening(true);
      setAiReply('');
      lastSentRef.current = '';

      startRecognition();

      const ctx = new AudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      const micGain = ctx.createGain();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(micGain);
      micGain.connect(analyser);

      ctxRef.current = ctx;
      streamRef.current = stream;
      sourceRef.current = source;
      analyserRef.current = analyser;
      micGainRef.current = micGain;
      audioDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, [stopRecognition, startRecognition]);

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      analyserRef.current?.disconnect();
      sourceRef.current?.disconnect();
      micGainRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close();
      recognitionRef.current?.stop();
    };
  }, []);

  const sphereMode = isSpeaking ? 'speaking' : isListening ? 'listening' : 'idle';

  const bgStyle = isSpeaking
    ? 'radial-gradient(ellipse at center, rgba(10,30,60,0.6) 0%, rgba(6,14,26,0.3) 35%, transparent 65%), radial-gradient(ellipse at center, #0a1628 0%, #060e1a 50%, #000000 100%)'
    : isListening
      ? 'radial-gradient(ellipse at center, rgba(40,8,8,0.5) 0%, rgba(13,4,4,0.2) 35%, transparent 65%), radial-gradient(ellipse at center, #1a0808 0%, #0d0404 50%, #000000 100%)'
      : 'radial-gradient(ellipse at center, #1e1e22 0%, #0a0a0c 70%, #000000 100%)';

  return (
    <div className="relative h-dvh w-screen overflow-hidden" style={{ background: bgStyle }}>
      <FireSphere
        mode={sphereMode}
        intensity={rms}
      />

      <div className="absolute top-0 left-0 z-20 p-3 safe-top sm:p-4">
        <a
          href="/pathfinder"
          className="size-11 sm:size-10 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[#666666] hover:text-[#969696] transition-all duration-300"
        >
          <Settings className="size-4" />
        </a>
      </div>

      <div className="absolute top-0 right-0 z-20 p-3 safe-top sm:p-4">
        <div className="sm:hidden flex items-center gap-2 bg-[#252525]/80 backdrop-blur-sm border border-[#303030] px-3 py-1.5 text-[10px] font-mono rounded-full">
          <div className={`size-1.5 rounded-full ${isListening ? 'bg-[#22c55e]' : isSpeaking ? 'bg-[#3b82f6]' : 'bg-[#666666]'}`} />
          <span className="text-[#969696] uppercase tracking-wider">
            {isSpeaking ? 'Speaking' : isListening ? 'Listening' : 'Idle'}
          </span>
        </div>
        <div className="hidden sm:block bg-[#252525]/90 backdrop-blur-sm border border-[#303030] px-4 py-3 text-[11px] font-mono">
          <div className="flex items-center gap-2 mb-2">
            <div className={`size-2 rounded-full ${isListening ? 'bg-[#22c55e]' : isSpeaking ? 'bg-[#3b82f6]' : 'bg-[#666666]'}`} />
            <span className="text-[#969696] uppercase tracking-wider">
              {isSpeaking ? 'Speaking' : isListening ? 'Listening' : 'Idle'}
            </span>
          </div>
          {lastProvider && (
            <div className="text-[#666666] mb-1">
              <span className="text-[#555555]">Provider:</span> <span className="text-[#969696]">{lastProvider}</span>
            </div>
          )}
          {tokenUsage && (
            <div className="space-y-0.5 text-[#666666]">
              <div>
                <span className="text-[#555555]">In:</span> <span className="text-[#969696]">{tokenUsage.prompt}</span>
              </div>
              <div>
                <span className="text-[#555555]">Out:</span> <span className="text-[#969696]">{tokenUsage.completion}</span>
              </div>
              <div className="pt-1 border-t border-[#303030]">
                <span className="text-[#555555]">Total:</span> <span className="text-[#da291c]">{tokenUsage.total}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-0 inset-x-0 z-10 flex justify-center px-4 pt-14 sm:px-6 sm:pt-8">
        <div className="max-w-2xl w-full text-center space-y-2 sm:space-y-3 max-h-[40dvh] overflow-y-auto overscroll-contain scrollbar-none">
          {transcript && (
            <div className="bg-black/30 backdrop-blur-sm rounded-lg px-4 py-2 sm:bg-transparent sm:backdrop-blur-none sm:px-0 sm:py-0">
              <p className="text-base sm:text-[26px] leading-[1.5] tracking-[0.195px] text-white font-medium font-sans">
                {transcript}
                {interim && <span className="text-[#969696]">{interim}</span>}
              </p>
            </div>
          )}

          {isThinking && (
            <p className="text-xs sm:text-[13px] text-[#8f8f8f] animate-pulse uppercase tracking-[1.1px] font-semibold">
              Thinking...
            </p>
          )}

          {aiReply && (
            <div className="bg-black/30 backdrop-blur-sm rounded-lg px-4 py-3 sm:bg-transparent sm:backdrop-blur-none sm:px-0 sm:py-0">
              <div className="flex items-start gap-2 sm:gap-3 justify-center">
                <button
                  onClick={() => speak(aiReply)}
                  className="mt-0.5 sm:mt-1 shrink-0 p-2.5 sm:p-2 hover:bg-[#da291c]/20 transition-colors cursor-pointer min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                  title="Click to hear"
                >
                  {isSpeaking ? (
                    <VolumeX className="size-5 text-[#da291c] animate-pulse" />
                  ) : (
                    <Volume2 className="size-5 text-[#da291c]" />
                  )}
                </button>
                <p className="text-[15px] sm:text-[18px] leading-[1.3] sm:leading-[1.2] text-white font-medium font-sans text-left">
                  {aiReply}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-end pb-24 sm:pb-16 safe-bottom z-10 gap-5 sm:gap-6">
        {!sttSupported && (
          <div className="mx-4 mb-1 px-4 py-3 bg-[#da291c]/10 border border-[#da291c]/30 text-[#da291c] text-xs sm:text-sm text-center max-w-xs sm:max-w-sm leading-relaxed">
            Speech recognition is not supported in this browser.
            <br className="sm:hidden" />
            <span className="sm:hidden"> On iPhone, open this page in Safari. On Android, use Chrome.</span>
          </div>
        )}
        <button
          onClick={toggleMic}
          className="rounded-full size-16 sm:size-16 flex items-center justify-center bg-yellow-500/15 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-400 transition-all duration-300 cursor-pointer active:scale-95"
        >
          {isListening ? (
            <MicOff className="size-7" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19v3"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><rect x="9" y="2" width="6" height="13" rx="3"></rect></svg>
          )}
        </button>

        <p className="text-[11px] sm:text-[12px] text-[#666666] uppercase tracking-[1.1px] font-semibold select-none">
          {isSpeaking ? 'Speaking...' : isListening ? 'Listening' : 'Starting...'}
        </p>
      </div>
    </div>
  );
}
