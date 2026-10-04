export interface DisplayPreferences {
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
}
const key = "przejscie-display-v1";
export const displayDefaults: DisplayPreferences = {
  largeText: false,
  highContrast: false,
  reduceMotion: false,
};
export function readDisplayPreferences(): DisplayPreferences {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    return {
      largeText: data?.largeText === true,
      highContrast: data?.highContrast === true,
      reduceMotion: data?.reduceMotion === true,
    };
  } catch {
    return displayDefaults;
  }
}
export function applyDisplayPreferences(value = readDisplayPreferences()) {
  document.documentElement.dataset.textSize = value.largeText
    ? "large"
    : "standard";
  document.documentElement.dataset.contrast = value.highContrast
    ? "high"
    : "standard";
  document.documentElement.dataset.motion = value.reduceMotion
    ? "reduced"
    : "system";
}
export function saveDisplayPreferences(value: DisplayPreferences) {
  applyDisplayPreferences(value);
  let saved = true;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    saved = false;
  }
  window.dispatchEvent(
    new CustomEvent("przejscie-display-change", { detail: value }),
  );
  return saved;
}
export function motionReduced() {
  return (
    document.documentElement.dataset.motion === "reduced" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
