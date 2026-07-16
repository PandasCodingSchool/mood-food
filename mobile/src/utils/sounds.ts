import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

let soundsEnabled = true;

export function setSoundsEnabled(enabled: boolean) {
  soundsEnabled = enabled;
}

const popSource = require('../../assets/sounds/pop.wav');
const successSource = require('../../assets/sounds/success.wav');
const swipeSource = require('../../assets/sounds/swipe.wav');
const winSource = require('../../assets/sounds/win.wav');

let popSound: AudioPlayer | null = null;
let successSound: AudioPlayer | null = null;
let swipeSound: AudioPlayer | null = null;
let winSound: AudioPlayer | null = null;

async function ensureSounds() {
  if (!soundsEnabled) return;
  if (popSound && successSound && swipeSound && winSound) return;

  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch {
    // ignore
  }

  try {
    popSound = createAudioPlayer(popSource);
    successSound = createAudioPlayer(successSource);
    swipeSound = createAudioPlayer(swipeSource);
    winSound = createAudioPlayer(winSource);
  } catch {
    // Emulators can fail to load audio; fail silently.
  }
}

async function play(sound: AudioPlayer | null) {
  if (!sound) return;
  try {
    await sound.seekTo(0);
    sound.play();
  } catch {
    // ignore
  }
}

export async function playPopSound() {
  if (!soundsEnabled) return;
  await ensureSounds();
  await play(popSound);
}

export async function playSuccessSound() {
  if (!soundsEnabled) return;
  await ensureSounds();
  await play(successSound);
}

export async function playSwipeSound() {
  if (!soundsEnabled) return;
  await ensureSounds();
  await play(swipeSound);
}

export async function playWinSound() {
  if (!soundsEnabled) return;
  await ensureSounds();
  await play(winSound);
}

export async function unloadSounds() {
  try {
    popSound?.remove();
    successSound?.remove();
    swipeSound?.remove();
    winSound?.remove();
  } catch {
    // ignore
  }
  popSound = null;
  successSound = null;
  swipeSound = null;
  winSound = null;
}
