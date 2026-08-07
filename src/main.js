// Point d'entree de la PWA ViralNight.
// Enregistre les ecrans, demarre le routeur sur la landing.

import "./styles/screens.css";
import "./styles/components.css";
import "./styles/landing.css";
import "./styles/onboarding.css";
import "./styles/dashboard.css";
import "./styles/post-story.css";
import "./styles/rewards.css";
import "./styles/bonus.css";
import "./styles/profile.css";
import "./styles/gamification.css";

import { createRouter } from "./lib/router.js";
import { mountTabBar } from "./components/TabBar.js";
import { Landing } from "./pages/landing.js";
import { Onboarding } from "./pages/onboarding.js";
import { Dashboard } from "./pages/dashboard.js";
import { PostStory } from "./pages/post-story.js";
import { Rewards } from "./pages/rewards.js";
import { Bonus } from "./pages/bonus.js";
import { Profile } from "./pages/profile.js";
import { Leaderboard } from "./pages/leaderboard.js";
import { Collection } from "./pages/collection.js";

const mount = document.getElementById("app");

// Poule et oeuf : la barre a besoin de `navigate`, que seul le routeur
// fournit, et le routeur monte son premier ecran des sa creation. On monte
// donc la barre d'abord, avec un relais qui pointera sur le routeur une
// fois celui-ci construit — un tap ne peut pas arriver avant.
let router;
const setTabRoute = mountTabBar({ navigate: (name) => router?.navigate(name) });

router = createRouter({
  mount,
  initial: "landing",
  onNavigate: setTabRoute,
  routes: {
    landing: Landing,
    onboarding: Onboarding,
    dashboard: Dashboard,
    post: PostStory,
    rewards: Rewards,
    bonus: Bonus,
    profile: Profile,
    leaderboard: Leaderboard,
    collection: Collection,
  },
});

// Service worker : coquille offline. Enregistre seulement en prod (build).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
