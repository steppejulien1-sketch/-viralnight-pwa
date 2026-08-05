// Retour haptique via la Vibration API (Android / Chrome mobile).
// Silencieux la ou l'API n'existe pas (iOS Safari). Respecte un flag
// desactivable stocke en localStorage.

const KEY = "vn.haptics";

export function hapticsEnabled() {
  return localStorage.getItem(KEY) !== "off";
}

export function setHaptics(on) {
  localStorage.setItem(KEY, on ? "on" : "off");
}

function buzz(pattern) {
  if (!hapticsEnabled()) return;
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

// Tap leger sur une action.
export const tap = () => buzz(12);

// Confirmation / gain : petit motif "ta-daa".
export const success = () => buzz([18, 45, 35]);

// Impact plus marque (deblocage recompense).
export const impact = () => buzz([25, 30, 25, 30, 45]);
