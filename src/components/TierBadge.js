// Badge de palier : le multiplicateur (×1/×2/×4/×8) dans une pastille
// premium. Taille "hero" (onboarding, dashboard) ou "inline" (listes).

import { h } from "../lib/dom.js";

export function TierBadge(tier, size = "md") {
  return h("span", { class: `tier-badge tier-${size}`, "data-tier": tier.id }, [
    h("span", { class: "tier-mult mono" }, `×${tier.mult}`),
  ]);
}
