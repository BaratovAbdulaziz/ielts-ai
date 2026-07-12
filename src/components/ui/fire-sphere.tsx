'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const vert = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const frag = `
  uniform float time;
  uniform float intensity;
  uniform float mode;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float softNoise(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.45), sin(0.45), -sin(0.45), cos(0.45));
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p = rot * p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float wideFresnel = pow(1.0 - max(dot(N, V), 0.0), 1.5);

    vec3 listenCore = vec3(0.0, 0.0, 0.0);
    vec3 listenMid = vec3(0.25, 0.0, 0.0);
    vec3 listenRim = vec3(0.7, 0.02, 0.0);

    vec3 speakCore = vec3(0.5, 0.6, 0.75);
    vec3 speakMid = vec3(0.15, 0.4, 0.75);
    vec3 speakRim = vec3(0.35, 0.6, 0.9);

    vec3 core = mix(listenCore, speakCore, mode);
    vec3 mid = mix(listenMid, speakMid, mode);
    vec3 rim = mix(listenRim, speakRim, mode);

    float swirl1 = softNoise(vWorldPos.xz * 1.6 + vec2(time * 0.00025, time * 0.00015));
    float swirl2 = softNoise(vWorldPos.yz * 1.3 + vec2(-time * 0.00015, time * 0.0003));
    float swirl = (swirl1 + swirl2) * 0.5;

    float volSwirl = swirl * intensity * 0.4 * mode;

    vec3 glassColor = mix(core, mid, wideFresnel * 0.5 + volSwirl * 0.3);
    glassColor = mix(glassColor, rim, fresnel * 0.8);

    float innerGlow = (1.0 - wideFresnel) * intensity * 0.2 * mode;
    glassColor += mid * innerGlow;

    float breathe = sin(time * 0.0013) * 0.5 + 0.5;
    glassColor += rim * fresnel * breathe * 0.06 * mode;

    float alpha = mix(0.12, 0.45, wideFresnel);
    alpha += fresnel * 0.3;
    alpha = clamp(alpha, 0.08, 0.7);

    gl_FragColor = vec4(glassColor, alpha);
  }
`;

export type FireSphereProps = {
  mode?: 'idle' | 'listening' | 'speaking';
  intensity?: number;
  className?: string;
};

function FireSphere({ mode = 'idle', intensity = 0, className = '' }: FireSphereProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const targetModeRef = useRef(0);
  const currentModeRef = useRef(0);
  const targetIntensityRef = useRef(0);
  const currentIntensityRef = useRef(0);

  const apiRef = useRef<{
    uniforms?: {
      time: { value: number };
      intensity: { value: number };
      mode: { value: number };
    };
    bloomPass?: UnrealBloomPass;
    renderer?: THREE.WebGLRenderer;
    composer?: EffectComposer;
    scene?: THREE.Scene;
    camera?: THREE.Camera;
    mesh?: THREE.Mesh;
    cleanup?: () => void;
    clock?: THREE.Clock;
    raf?: number;
  }>({});

  useEffect(() => {
    if (!mountRef.current) return;
    let width = mountRef.current.clientWidth;
    let height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 4.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.2, 0.3, 0.3);
    composer.addPass(bloomPass);

    const uniforms = {
      time: { value: 0.0 },
      intensity: { value: 0.0 },
      mode: { value: 0.0 },
    };

    const geometry = new THREE.SphereGeometry(1.8, 64, 64);
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: vert,
      fragmentShader: frag,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const onResize = () => {
      if (!mountRef.current) return;
      width = mountRef.current.clientWidth;
      height = mountRef.current.clientHeight;
      (camera as THREE.PerspectiveCamera).aspect = width / height;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    let prevVol = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);

      currentModeRef.current += (targetModeRef.current - currentModeRef.current) * 0.035;
      currentIntensityRef.current += (targetIntensityRef.current - currentIntensityRef.current) * 0.15;

      uniforms.time.value = clock.getElapsedTime() * 1000.0;
      uniforms.mode.value = currentModeRef.current;
      uniforms.intensity.value = currentIntensityRef.current;

      const t = clock.getElapsedTime();
      const isSpeaking = currentModeRef.current > 0.5;
      const rawVol = currentIntensityRef.current;
      const vol = Math.min(rawVol * 8.0, 1.0);
      const volDelta = Math.abs(vol - prevVol);
      prevVol = vol;
      let spike = 0;

      if (isSpeaking) {
        const basePulse = Math.sin(t * 2.5) * 0.06;
        const fastPulse = Math.sin(t * 6.0) * 0.04;
        const volPush = vol * 0.2;
        spike = volDelta * 0.5;
        mesh.scale.setScalar(1.0 + basePulse + fastPulse + volPush + spike);

        mesh.rotation.y += 0.02 + vol * 0.03;
        mesh.rotation.x = Math.sin(t * 0.8) * 0.35 + Math.cos(t * 1.3) * 0.15 * vol;
        mesh.rotation.z = Math.sin(t * 1.1) * 0.12 + Math.cos(t * 0.6) * 0.08;

        const jitterX = (Math.random() - 0.5) * vol * 0.03;
        const jitterY = (Math.random() - 0.5) * vol * 0.03;
        mesh.position.x = jitterX;
        mesh.position.y = jitterY;
      } else {
        const basePulse = Math.sin(t * 2.0) * 0.03;
        const volPush = vol * 0.25;
        spike = volDelta * 0.8;
        mesh.scale.setScalar(1.0 + basePulse + volPush + spike);

        mesh.rotation.y += vol * 0.04;
        mesh.rotation.x = Math.sin(t * 3.0) * vol * 0.3;
        mesh.rotation.z = Math.cos(t * 2.5) * vol * 0.15;

        const jitterX = (Math.random() - 0.5) * vol * 0.05;
        const jitterY = (Math.random() - 0.5) * vol * 0.05;
        mesh.position.x = jitterX;
        mesh.position.y = jitterY;
      }

      if (!isSpeaking && mesh.position.x !== 0) {
        mesh.position.x *= 0.9;
        mesh.position.y *= 0.9;
        if (Math.abs(mesh.position.x) < 0.001) mesh.position.x = 0;
        if (Math.abs(mesh.position.y) < 0.001) mesh.position.y = 0;
      }

      const baseBloom = isSpeaking ? 1.5 : 1.4;
      const volBloom = vol * (isSpeaking ? 1.0 : 1.5);
      bloomPass.strength += ((baseBloom + volBloom + spike * 2.0) - bloomPass.strength) * 0.1;

      composer.render();
    };
    tick();

    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      composer.dispose();
      renderer.dispose();
      scene.clear();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };

    apiRef.current = { uniforms, bloomPass, renderer, composer, scene, camera, mesh, cleanup, clock, raf };
    return cleanup;
  }, []);

  useEffect(() => {
    if (mode === 'speaking') targetModeRef.current = 1.0;
    else if (mode === 'listening') targetModeRef.current = 0.0;
    else targetModeRef.current = 0.0;
  }, [mode]);

  useEffect(() => {
    targetIntensityRef.current = intensity;
  }, [intensity]);

  return (
    <div className={`relative h-screen w-screen ${className}`}>
      <div ref={mountRef} className="absolute inset-0" />
    </div>
  );
}

export { FireSphere };
