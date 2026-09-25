"use client";

// The hero scene: the turning island behind the phone's Missions view
// (spec §4.2). Video picks tall/wide + codec in `lib/hero`; birds are an
// internal layer on the same `playing` signal, at natural speed whatever
// the island does. MapLibre stays the only WebGL on the page.

import { useEffect, useRef, useState } from "react";
import { pickHero, rateFor } from "@/lib/hero";
import styles from "./HeroScene.module.css";

export interface HeroSceneProps {
  /** True while the Missions view is on screen. Pauses video and birds. */
  playing: boolean;
  /** `still` renders the pre-blurred image only (deeper levels, Q10). */
  variant?: "live" | "still";
}

const SPRITE = "/hero/v1/bird-sprite.webp";
const FRAMES = 16;
const GLIDE = 16;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Bird {
  el: HTMLDivElement;
  size: number;
  ltr: boolean;
  speed: number;
  y0: number;
  rise: number;
  w: number;
  x: number;
  beat: number;
  phase: number;
  flaps: number;
  glide: number;
  t: number;
  sway: number;
}

function BirdLayer({ playing }: { playing: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    if (!layer || !playing) return;
    let flock: Bird[] = [];
    let raf = 0;
    let last = 0;
    let next = 4000;

    const spawn = () => {
      const n = Math.round(rnd(2, 4));
      const ltr = Math.random() < 0.6;
      const w = layer.clientWidth || innerWidth;
      const h = layer.clientHeight || innerHeight;
      const speed = rnd(70, 100);
      const y0 = h * rnd(0.1, 0.3);
      const rise = rnd(-0.06, 0.04) * h;
      for (let i = 0; i < n; i++) {
        const size = rnd(16, 28) * (i ? rnd(0.75, 1) : 1);
        const el = document.createElement("div");
        el.className = styles.bird;
        el.style.width = el.style.height = `${size}px`;
        el.style.backgroundImage = `url("${SPRITE}")`;
        el.style.backgroundSize = `${(FRAMES + 1) * size}px ${size}px`;
        el.style.opacity = (0.55 + size / 60).toFixed(2);
        layer.appendChild(el);
        flock.push({
          el, size, ltr, speed: speed * rnd(0.97, 1.03), y0: y0 + rnd(-18, 18), rise, w,
          x: ltr ? -60 - i * rnd(24, 48) : w + 60 + i * rnd(24, 48),
          beat: rnd(0.3, 0.34), phase: rnd(0, 1), flaps: Math.round(rnd(3, 6)),
          glide: 0, t: 0, sway: rnd(0, 6.28),
        });
      }
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min((now - (last || now)) / 1000, 0.1);
      last = now;
      next -= dt * 1000;
      if (next <= 0) {
        spawn();
        next = rnd(9000, 20000);
      }
      flock = flock.filter((b) => {
        b.t += dt;
        b.x += (b.ltr ? 1 : -1) * b.speed * dt;
        const along = b.ltr ? b.x / b.w : 1 - b.x / b.w;
        const y = b.y0 + b.rise * along + 4 * Math.sin(b.t * 1.7 + b.sway);
        let frame: number;
        if (b.glide > 0) {
          b.glide -= dt;
          frame = GLIDE;
          if (b.glide <= 0) b.flaps = Math.round(rnd(3, 6));
        } else {
          b.phase += dt / b.beat;
          if (b.phase >= 1) {
            b.phase -= 1;
            if (--b.flaps <= 0) b.glide = rnd(0.6, 1.6);
          }
          frame = Math.floor(b.phase * FRAMES) % FRAMES;
        }
        const bank = 3 * Math.sin(b.t * 0.9 + b.sway);
        b.el.style.backgroundPositionX = `${-frame * b.size}px`;
        b.el.style.transform = `translate(${b.x}px, ${y}px) rotate(${bank}deg) scaleX(${b.ltr ? 1 : -1})`;
        const gone = b.ltr ? b.x > b.w + 80 : b.x < -80 - b.size;
        if (gone) b.el.remove();
        return !gone;
      });
    };
    const onHide = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        flock.forEach((b) => b.el.remove());
        flock = [];
      } else if (playing && !raf) {
        last = 0;
        raf = requestAnimationFrame(step);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    if (document.hidden) {
      return () => {
        document.removeEventListener("visibilitychange", onHide);
      };
    }
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onHide);
      flock.forEach((b) => b.el.remove());
    };
  }, [playing]);

  if (!playing) return null;
  return <div ref={ref} className={styles.birds} />;
}

export default function HeroScene({ playing, variant = "live" }: HeroSceneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const [pick, setPick] = useState<{ key: string; poster?: string; src?: string }>({ key: "" });

  // Live reduced-motion signal: poster only, no video, no birds.
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // One file per viewport: tall on phones, wide elsewhere, 4K on wide pixels.
  useEffect(() => {
    const probe = document.createElement("video");
    const choose = () =>
      setPick((p) => {
        const next = pickHero({
          w: innerWidth,
          h: innerHeight,
          dpr: devicePixelRatio || 1,
          canPlay: (t) => probe.canPlayType(t),
        });
        return p.key === next.key ? p : next;
      });
    choose();
    addEventListener("resize", choose);
    return () => removeEventListener("resize", choose);
  }, []);

  // The file turns once in ~32.4 s; stretch it to the 40 s turn.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const setRate = () => {
      if (video.duration) video.playbackRate = rateFor(video.duration);
    };
    setRate();
    video.addEventListener("loadeddata", setRate);
    return () => video.removeEventListener("loadeddata", setRate);
  }, [pick.src]);

  // Wide screens hide the scene in CSS (display:none ≥1000px): no source
  // there either, so a desktop visit fetches nothing until UI-3 shows it.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1000px)");
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const active = playing && !wide;

  // Play only while the Missions view is on screen and the page is visible.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active || document.hidden) {
      video.pause();
      return;
    }
    video.play().catch(() => {});
  }, [active, pick.src]);

  useEffect(() => {
    const onHide = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) video.pause();
      else if (playing) video.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [playing]);

  // Low Power Mode refuses autoplay: the first touch or key starts it, and the
  // listeners detach once the video is playing.
  useEffect(() => {
    if (!playing) return;
    const video = videoRef.current;
    if (!video) return;
    const resume = () => {
      if (video.paused && !document.hidden) video.play().catch(() => {});
    };
    const done = () => {
      removeEventListener("pointerdown", resume);
      removeEventListener("keydown", resume);
    };
    video.addEventListener("playing", done);
    addEventListener("pointerdown", resume);
    addEventListener("keydown", resume);
    return () => {
      video.removeEventListener("playing", done);
      removeEventListener("pointerdown", resume);
      removeEventListener("keydown", resume);
    };
  }, [playing]);

  if (variant === "still") {
    const blur = pick.poster?.replace("-poster-1440.jpg", "-blur.jpg");
    return (
      <div className={styles.scene} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- versioned static, no optimizer */}
        <img src={blur} alt="" />
      </div>
    );
  }

  if (reduced) {
    return (
      <div className={styles.scene} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- versioned static, no optimizer */}
        <img src={pick.poster} alt="" />
      </div>
    );
  }

  return (
    <div className={styles.scene} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- poster under video, versioned static */}
      <img src={pick.poster} alt="" />
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        loop
        preload={active ? "metadata" : "none"}
        poster={pick.poster}
        src={active ? pick.src : undefined}
      />
      <BirdLayer playing={playing} />
      <div className={styles.scrim} />
    </div>
  );
}
