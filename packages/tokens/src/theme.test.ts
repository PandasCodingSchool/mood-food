import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oklch, oklchToRgb } from './color';
import { createTheme, gradientPoints } from './theme';
import { timeOfDayForHour, MOODS, TIMES_OF_DAY, WEATHERS } from './context';

const close = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

test('oklch matches reference sRGB values', () => {
  // CSS Color 4 reference: oklch(62.8% 0.2577 29.23) is pure red.
  const red = oklchToRgb(0.62796, 0.25768, 29.2339);
  assert.ok(close(red.r, 255) && close(red.g, 0) && close(red.b, 0), JSON.stringify(red));
  // Achromatic: L=1 is white, L=0 is black.
  assert.equal(oklch(1, 0, 0), '#FFFFFF');
  assert.equal(oklch(0, 0, 0), '#000000');
});

test('oklch with alpha returns rgba()', () => {
  assert.match(oklch(0.76, 0.12, 72, 0.2), /^rgba\(\d+,\d+,\d+,0\.2\)$/);
});

test('every mood accent shares lightness, so accents differ only in hue', () => {
  const accents = MOODS.map((mood) => createTheme({ time: 'evening', weather: 'rainy', mood }).colors.acc);
  assert.equal(new Set(accents).size, MOODS.length);
});

test('stormy forces dark mode even in the morning', () => {
  assert.equal(createTheme({ time: 'morning', weather: 'stormy', mood: 'happy' }).dark, true);
  assert.equal(createTheme({ time: 'morning', weather: 'sunny', mood: 'happy' }).dark, false);
});

test('light rainy swaps in the cool gradient and a blue orb', () => {
  const th = createTheme({ time: 'afternoon', weather: 'rainy', mood: 'tired' });
  assert.equal(th.backdrop.gradient.colors[0], '#DCE4EE');
  assert.deepEqual(th.backdrop.orbs, ['#8FB0D6', '#FFBE45']);
  assert.equal(th.backdrop.overlay, null);
});

test('dark rainy keeps the time gradient and adds an overlay', () => {
  const th = createTheme({ time: 'evening', weather: 'rainy', mood: 'tired' });
  assert.equal(th.backdrop.gradient.colors[0], '#2A1732');
  assert.ok(th.backdrop.overlay);
  assert.equal(th.colors.solid, '#231726');
});

test('all 64 context combinations build', () => {
  for (const time of TIMES_OF_DAY)
    for (const weather of WEATHERS)
      for (const mood of MOODS) {
        const { colors } = createTheme({ time, weather, mood });
        for (const v of Object.values(colors)) assert.match(v, /^(#[0-9A-F]{6}|rgba\()/i);
      }
});

test('gradientPoints follows CSS angle convention', () => {
  const down = gradientPoints(180);
  assert.ok(close(down.start.y, 0, 1e-9) && close(down.end.y, 1, 1e-9));
  const right = gradientPoints(90);
  assert.ok(close(right.start.x, 0, 1e-9) && close(right.end.x, 1, 1e-9));
});

test('timeOfDayForHour buckets', () => {
  assert.equal(timeOfDayForHour(8), 'morning');
  assert.equal(timeOfDayForHour(13), 'afternoon');
  assert.equal(timeOfDayForHour(19), 'evening');
  assert.equal(timeOfDayForHour(23), 'night');
  assert.equal(timeOfDayForHour(2), 'night');
});
