'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseMicrophoneReturn = {
  isListening: boolean;
  rms: number;
  start: () => Promise<void>;
  stop: () => void;
};

export function useMicrophone(fftSize = 256): UseMicrophoneReturn {
  const [isListening, setIsListening] = useState(false);
  const [rms, setRms] = useState(0);
  const audioDataRef = useRef<Uint8Array>(new Uint8Array(fftSize / 2));

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef(0);

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
      setRms(rawRms);
      rafRef.current = requestAnimationFrame(tick);
    }

    if (isListening) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isListening]);

  const start = useCallback(async () => {
    const ctx = new AudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    ctxRef.current = ctx;
    streamRef.current = stream;
    sourceRef.current = source;
    analyserRef.current = analyser;
    audioDataRef.current = new Uint8Array(analyser.frequencyBinCount);

    setIsListening(true);
  }, [fftSize]);

  const stop = useCallback(() => {
    analyserRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();

    analyserRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;

    audioDataRef.current.fill(0);
    setRms(0);
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      analyserRef.current?.disconnect();
      sourceRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close();
    };
  }, []);

  return {
    isListening,
    rms,
    start,
    stop,
  };
}
