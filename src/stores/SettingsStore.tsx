import create from "zustand";

export enum GroundUnitMode {
  FRIENDLY = "friendly",
  ENEMY = "enemy",
}

export enum FlightUnitMode {
  FRIENDLY = "friendly",
  ENEMY = "enemy",
}

export enum UnitSystem {
  IMPERIAL = "imperial",
  METRIC = "metric",
}

export type SettingsStoreData = {
  unitSystem: UnitSystem;
  map: {
    showTrackIcons?: boolean;
    showTrackLabels?: boolean;
    trackTrailLength?: number;
    groundUnitMode?: GroundUnitMode;
    prettyMapBrightness?: number;
    prettyMapOpacity?: number;
    dcsMapBrightness?: number;
    dcsMapOpacity?: number;
    mgrsGridBrightness?: number;
    mgrsGridOpacity?: number;
  };
};

const SETTINGS_STORAGE_KEY = "settings";

function defaultSettings(): SettingsStoreData {
  return {
    unitSystem: UnitSystem.IMPERIAL,
    map: {
      showTrackIcons: true,
      showTrackLabels: true,
      trackTrailLength: 9,
      groundUnitMode: GroundUnitMode.ENEMY,
      prettyMapBrightness: 1,
      prettyMapOpacity: 0.8,
      dcsMapBrightness: 1.2,
      dcsMapOpacity: 1,
      mgrsGridBrightness: 1,
      mgrsGridOpacity: 1,
    },
  };
}

function readSettings(storageKey: string): SettingsStoreData | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SettingsStoreData;
  } catch (_error) {
    return null;
  }
}

function readAnyLegacyUserSettings(): SettingsStoreData | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("settings:user:")) continue;
    const parsed = readSettings(key);
    if (parsed) return parsed;
  }
  return null;
}

const bootstrapSettings =
  readSettings(SETTINGS_STORAGE_KEY) ||
  readSettings("settings:guest") ||
  readAnyLegacyUserSettings() ||
  defaultSettings();

export const settingsStore = create<SettingsStoreData>(() => bootstrapSettings);

settingsStore.subscribe((state) => {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state));
});

export function updateSettingsStore(value: Partial<SettingsStoreData>) {
  settingsStore.setState((state) => ({ ...state, ...value }));
}
