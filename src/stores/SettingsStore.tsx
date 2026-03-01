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
  };
};

export const settingsStore = create<SettingsStoreData>(() => {
  const localData = localStorage.getItem("settings");
  if (localData) {
    return JSON.parse(localData) as SettingsStoreData;
  }
  return {
    unitSystem: UnitSystem.IMPERIAL,
    map: {
      showTrackIcons: true,
      showTrackLabels: true,
      trackTrailLength: 9,
      groundUnitMode: GroundUnitMode.ENEMY,
    },
  };
});

settingsStore.subscribe((state) => {
  localStorage.setItem("settings", JSON.stringify(state));
});

export function updateSettingsStore(value: Partial<SettingsStoreData>) {
  settingsStore.setState((state) => ({ ...state, ...value }));
}
