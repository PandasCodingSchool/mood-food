import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';

/** Chat voice notes are short: long enough for a whole week, short enough to stay quick to transcribe. */
export const MAX_VOICE_SECONDS = 90;

export interface VoiceClip { base64: string; mimeType: string; seconds: number }

/** Loudest level (dB, 0 = full scale) below which a clip is treated as silence and never sent: the transcriber
 * "hears" dish names in silence. Normal speech near the phone peaks around −20 dB; a muted or dead mic stays near −160. */
export const SILENT_PEAK_DB = -50;
const NO_READING_DB = -160;

/** Reads a recording (file:// on native, blob: on web) as base64 without extra native modules. */
async function readAsBase64(uri: string): Promise<{ base64: string; mimeType: string }> {
  const blob = await (await fetch(uri)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the recording.'));
    reader.readAsDataURL(blob);
  });
  const [head, base64 = ''] = dataUrl.split(',', 2);
  const fromHead = /^data:([^;,]+)/.exec(head)?.[1];
  const mimeType = (blob.type || fromHead || (Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a')).split(';')[0];
  return { base64, mimeType: mimeType.startsWith('audio/') ? mimeType : Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a' };
}

/** Tap to start, tap to stop: records a voice note for the household chat. Stops itself at MAX_VOICE_SECONDS. */
export function useVoiceNote(onClip: (clip: VoiceClip) => void) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(recorder, 250);
  const peak = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const deliver = useRef(onClip);
  deliver.current = onClip;

  const finish = useCallback(async (send: boolean) => {
    if (!recording) return;
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      const seconds = Math.round((Date.now() - startedAt.current) / 1000);
      if (!send) return;
      if (seconds < 1 || !recorder.uri) { setError('That was too short. Hold on a moment longer.'); return; }
      // Only when the recorder reported levels: no readings → let the server's check decide.
      if (peak.current !== null && peak.current < SILENT_PEAK_DB) { setError('I couldn’t hear anything. Check the microphone, then try again a little closer.'); return; }
      deliver.current({ ...(await readAsBase64(recorder.uri)), seconds });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording failed. You can type instead.');
    }
  }, [recorder, recording]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { setError('Allow microphone access to talk to KitchenCircle.'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      peak.current = null;
      startedAt.current = Date.now();
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The microphone isn’t available.');
    }
  }, [recorder]);

  // The loudest moment of this clip, from the recorder's level readings. −160 is what Android reports when it got
  // no level at all (a dead mic, or a device whose metering fails), so it isn't a reading: the server check decides then.
  useEffect(() => {
    const db = state.metering;
    if (recording && typeof db === 'number' && Number.isFinite(db) && db > NO_READING_DB) peak.current = Math.max(peak.current ?? -Infinity, db);
  }, [recording, state.metering]);

  // Hard cap so a forgotten recording doesn't run on.
  useEffect(() => {
    if (recording && state.durationMillis >= MAX_VOICE_SECONDS * 1000) void finish(true);
  }, [recording, state.durationMillis, finish]);

  return { recording, seconds: Math.floor((state.durationMillis ?? 0) / 1000), error, start, stop: () => finish(true), cancel: () => finish(false), clearError: () => setError(null) };
}
