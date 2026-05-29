import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

interface Swatch {
  color: string;
  titleTextColor: string;
  bodyTextColor: string;
}

export interface AlbumPalette {
  dominant?: Swatch;
  vibrant?: Swatch;
  darkVibrant?: Swatch;
  muted?: Swatch;
  darkMuted?: Swatch;
  lightVibrant?: Swatch;
}

const mod = Platform.OS === 'android'
  ? (() => { try { return requireNativeModule('Palette'); } catch { return null; } })()
  : null;

export async function extractAlbumColors(imageUri: string | null | undefined): Promise<AlbumPalette | null> {
  if (!mod || !imageUri) return null;
  try {
    const json: string | null = await mod.extractColors(imageUri);
    return json ? (JSON.parse(json) as AlbumPalette) : null;
  } catch {
    return null;
  }
}
