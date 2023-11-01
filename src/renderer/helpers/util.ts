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
  return '';
};
