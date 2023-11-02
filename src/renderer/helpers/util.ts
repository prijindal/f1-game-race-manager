import { LapData } from 'f1-23-udp';

export const padZeros = (num: number, pad: number) => {
  if (num >= 0) {
    return num.toString().padStart(pad, '0');
  }
  return `-${Math.abs(num).toString().padStart(pad, '0')}`;
};

export function roundToNearest(num: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

export const msToText = (time: number, inputFormat: 'ms' | 's' = 'ms') => {
  let text = '';
  let s = time;
  if (inputFormat === 's') {
    s *= 1000;
  }
  const ms = s % 1000;
  if (inputFormat === 'ms') {
    text = `.${padZeros(ms, 3)}${text}`;
  }
  s = (s - ms) / 1000;
  const secs = s % 60;
  if (Math.abs(s) > 0) {
    text = `${padZeros(secs, 2)}${text}`;
  }
  s = (s - secs) / 60;
  const mins = s;
  if (Math.abs(s) > 0) {
    text = `${padZeros(mins, 2)}:${text}`;
  }
  return text;
};

export const getClassNameFromMs = (ms: number) => {
  if (ms > 0) {
    return 'bg-red-500/80';
  }
  if (ms < 0) {
    return 'bg-green-500/80';
  }
  return 'bg-transparent';
};

export type PrevLapData = {
  distanceToLapTime: Record<number, number>;
  selfLapData: LapData;
};

export const timesFromLapData = (
  lapData: PrevLapData | null,
  selfLapData: LapData | null,
) => {
  if (lapData != null && selfLapData != null) {
    // console.log(prevLapData);
    let maxDistanceIndex = 0;
    // eslint-disable-next-line no-restricted-syntax
    // for (const d of Object.keys(lapData.distanceToLapTime)) {
    const lapDistances = Object.keys(lapData.distanceToLapTime)
      .map((a) => parseFloat(a))
      .sort((a, b) => a - b);
    for (let i = 0; i < lapDistances.length; i += 1) {
      const currentDistance = lapDistances[i];
      // console.log(currentDistance > parseFloat(lapDistances[maxDistanceIndex]));
      // console.log(currentDistance <= selfLapData.m_lapDistance);
      if (
        currentDistance <= selfLapData.m_lapDistance &&
        currentDistance > lapDistances[maxDistanceIndex]
      ) {
        maxDistanceIndex = i;
      }
    }
    const nearestMinDistance = lapDistances[maxDistanceIndex];
    const lapDistanceTime: number =
      lapData.distanceToLapTime[nearestMinDistance as any];
    let predictedTime = lapDistanceTime;
    if (maxDistanceIndex <= lapDistances.length) {
      const nextDistance = lapDistances[maxDistanceIndex + 1];
      const nextDistanceTime = lapData.distanceToLapTime[nextDistance as any];
      // y1 = ax1+b
      // y2 = ax2+b
      // y2 - y1 = a(x2 - x2)
      // b = y1 - ax1
      const yDiff = nextDistanceTime - lapDistanceTime;
      const xDiff = nextDistance - nearestMinDistance;
      const coeffA = yDiff / xDiff;
      const coeffB = lapDistanceTime - coeffA * nearestMinDistance;
      predictedTime = Math.round(coeffA * selfLapData.m_lapDistance + coeffB);
    }
    return {
      lapDistanceTime: predictedTime,
      diff:
        predictedTime == null
          ? 0
          : selfLapData.m_currentLapTimeInMS - predictedTime,
    };
  }
  return {
    lapDistanceTime: 0,
    diff: 0,
  };
};
