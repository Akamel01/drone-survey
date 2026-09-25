// Pure pick logic for the hero scene (spec §4.2, hero-pipeline.md §7).
// Kept free of DOM so `node --test` covers it; HeroScene owns the element.

/** One full turn of the island, in seconds. The files turn once in ~32.4 s. */
export const TURN_S = 40;

/** Playback rate stretching `duration` seconds of file into one 40 s turn. */
export function rateFor(duration: number): number {
  return duration / TURN_S;
}

export interface HeroEnv {
  w: number;
  h: number;
  dpr?: number;
  /** Injected `video.canPlayType`: returns "" when the codec won't play. */
  canPlay: (mime: string) => string;
}

export interface HeroPick {
  /** Stable while the same file serves: reload only when this changes. */
  key: string;
  poster: string;
  src: string;
}

export function pickHero({ w, h, dpr = 1, canPlay }: HeroEnv): HeroPick {
  const tall = w <= h;
  const name = tall ? "hero-tall" : "hero-wide";
  // 4K only where the screen has the pixels for it.
  const big = !tall && w * dpr >= 2560;
  const key = name + (big ? "-4k" : "");
  const base = "/hero/v1/";
  const av1 = big ? `${name}-4k60-av1.mp4` : `${name}-1440p60-av1.mp4`;
  const av1Codec = `video/mp4; codecs="av01.0.${big ? 13 : 12}M.08"`;
  const hevc = `${name}-1440p60-hevc.mp4`;
  const h264 = `${name}-1080p30-h264.mp4`;
  const src =
    [[av1, av1Codec], [hevc, 'video/mp4; codecs="hvc1"'], [h264, "video/mp4"]].find(
      ([, type]) => canPlay(type),
    )?.[0] ?? h264;
  return { key, poster: `${base}${name}-poster-1440.jpg`, src: base + src };
}
