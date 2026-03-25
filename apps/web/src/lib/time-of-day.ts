import * as THREE from 'three';

export type TimeOfDay = 'night' | 'dawn' | 'day' | 'sunset';

export interface TimeColors {
  period: TimeOfDay;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  ambientIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunPosition: [number, number, number];
}

// Smooth interpolation factor within a range [0, 1]
function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const NIGHT: TimeColors = {
  period: 'night',
  skyTop: new THREE.Color('#0a0a2e'),
  skyBottom: new THREE.Color('#141430'),
  ambientIntensity: 0.3,
  sunColor: new THREE.Color('#8899cc'),
  sunIntensity: 0.4,
  sunPosition: [0, 2, -8],
};

const DAWN: TimeColors = {
  period: 'dawn',
  skyTop: new THREE.Color('#2a3060'),
  skyBottom: new THREE.Color('#ff8855'),
  ambientIntensity: 0.6,
  sunColor: new THREE.Color('#ffaa66'),
  sunIntensity: 0.8,
  sunPosition: [-8, 2, 4],
};

const DAY: TimeColors = {
  period: 'day',
  skyTop: new THREE.Color('#4488cc'),
  skyBottom: new THREE.Color('#aaccee'),
  ambientIntensity: 1.0,
  sunColor: new THREE.Color('#fffaf0'),
  sunIntensity: 1.0,
  sunPosition: [3, 10, 5],
};

const SUNSET: TimeColors = {
  period: 'sunset',
  skyTop: new THREE.Color('#2a2050'),
  skyBottom: new THREE.Color('#ff6633'),
  ambientIntensity: 0.6,
  sunColor: new THREE.Color('#ff8844'),
  sunIntensity: 0.7,
  sunPosition: [8, 2, -4],
};

function lerpColors(a: TimeColors, b: TimeColors, t: number, period: TimeOfDay): TimeColors {
  return {
    period,
    skyTop: a.skyTop.clone().lerp(b.skyTop, t),
    skyBottom: a.skyBottom.clone().lerp(b.skyBottom, t),
    ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * t,
    sunColor: a.sunColor.clone().lerp(b.sunColor, t),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
    sunPosition: [
      a.sunPosition[0] + (b.sunPosition[0] - a.sunPosition[0]) * t,
      a.sunPosition[1] + (b.sunPosition[1] - a.sunPosition[1]) * t,
      a.sunPosition[2] + (b.sunPosition[2] - a.sunPosition[2]) * t,
    ],
  };
}

export function getTimeOfDay(): TimeColors {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;

  // Transition zones (1-hour blend at each boundary)
  // Night: 22:00 - 04:00 (core), Dawn: 05:00 - 06:00 (core), Day: 08:00 - 16:00 (core), Sunset: 18:00 - 20:00 (core)

  if (hour >= 22 || hour < 4) {
    // Deep night
    return { ...NIGHT, skyTop: NIGHT.skyTop.clone(), skyBottom: NIGHT.skyBottom.clone(), sunColor: NIGHT.sunColor.clone() };
  } else if (hour >= 4 && hour < 5) {
    // Night -> Dawn transition
    const t = smoothStep(4, 5, hour);
    return lerpColors(NIGHT, DAWN, t, t < 0.5 ? 'night' : 'dawn');
  } else if (hour >= 5 && hour < 7) {
    // Dawn core
    return { ...DAWN, skyTop: DAWN.skyTop.clone(), skyBottom: DAWN.skyBottom.clone(), sunColor: DAWN.sunColor.clone() };
  } else if (hour >= 7 && hour < 8) {
    // Dawn -> Day transition
    const t = smoothStep(7, 8, hour);
    return lerpColors(DAWN, DAY, t, t < 0.5 ? 'dawn' : 'day');
  } else if (hour >= 8 && hour < 16) {
    // Day core
    return { ...DAY, skyTop: DAY.skyTop.clone(), skyBottom: DAY.skyBottom.clone(), sunColor: DAY.sunColor.clone() };
  } else if (hour >= 16 && hour < 17) {
    // Day -> Sunset transition
    const t = smoothStep(16, 17, hour);
    return lerpColors(DAY, SUNSET, t, t < 0.5 ? 'day' : 'sunset');
  } else if (hour >= 17 && hour < 21) {
    // Sunset core
    return { ...SUNSET, skyTop: SUNSET.skyTop.clone(), skyBottom: SUNSET.skyBottom.clone(), sunColor: SUNSET.sunColor.clone() };
  } else {
    // 21:00 - 22:00: Sunset -> Night transition
    const t = smoothStep(21, 22, hour);
    return lerpColors(SUNSET, NIGHT, t, t < 0.5 ? 'sunset' : 'night');
  }
}
