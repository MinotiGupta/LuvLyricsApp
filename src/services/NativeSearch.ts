import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import { Song } from '../types/song';

const mod = Platform.OS === 'android'
  ? (() => { try { return requireNativeModule('Search'); } catch { return null; } })()
  : null;

export async function nativeSearch(query: string): Promise<Song[] | null> {
  if (!mod) return null;
  try {
    // Append '*' for prefix matching: "beatl" matches "Beatles"
    const json: string = await mod.search(query.trim() + '*');
    return JSON.parse(json) as Song[];
  } catch {
    return null;
  }
}

export async function ensureSearchIndex(): Promise<void> {
  if (!mod) return;
  try {
    await mod.ensureIndex();
  } catch {
    // Non-fatal — search falls back to JS filter if index is missing
  }
}
