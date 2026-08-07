// Quel club ? — resolution a partir du QR scanne.
//
// Jusqu'ici le slug "mirage-brussels" etait ecrit en dur dans mock.js :
// tous les QR menaient au meme club fictif, quel que soit l'etablissement.
// Impossible d'installer l'app dans deux boites.
//
// Le QR pose au bar porte maintenant l'adresse du club :
//     https://viralnight-pwa.vercel.app/?c=<slug>
//
// Ordre de resolution, du plus fort au plus faible :
//   1. le parametre ?c= de l'URL — c'est le scan qui vient d'avoir lieu,
//      il prime toujours (on peut changer de boite dans la meme soiree) ;
//   2. le dernier club retenu, en memoire locale — on revient dans l'app
//      sans rescanner ;
//   3. rien. On n'invente PAS de club par defaut : afficher le nom d'un
//      etablissement au hasard serait pire que de demander un scan.

import { supabase, isConfigured } from "./supabase.js";

const CLE = "vn.club";

let courant = null; // { id, name, city, ig_handle, slug }
let resolu = false;

// Slug demande dans l'URL, nettoye. On accepte les memes caracteres que
// ceux generes cote gerant.
function slugDeLUrl() {
  const p = new URLSearchParams(location.search).get("c");
  if (!p) return null;
  const s = p.trim().toLowerCase();
  return /^[a-z0-9-]{2,60}$/.test(s) ? s : null;
}

function lireMemoire() {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

function ecrireMemoire(club) {
  try {
    localStorage.setItem(CLE, JSON.stringify(club));
  } catch {
    /* navigation privee : on continue sans memoriser */
  }
}

// Retourne le club courant, ou null si aucun QR n'a jamais ete scanne.
// Le resultat est mis en cache pour la duree de la page.
export async function currentClub() {
  if (resolu) return courant;

  const memo = lireMemoire();
  const demande = slugDeLUrl();

  // Rien a faire : ni scan, ni souvenir.
  if (!demande && !memo) {
    resolu = true;
    return null;
  }

  // On sert d'abord le souvenir pour que l'ecran s'affiche sans attendre
  // le reseau, PUIS on verifie si le scan pointe ailleurs.
  if (!demande) {
    courant = memo;
    resolu = true;
    return courant;
  }

  if (memo && memo.slug === demande) {
    courant = memo;
    resolu = true;
    return courant;
  }

  if (!isConfigured) {
    resolu = true;
    return memo || null;
  }

  try {
    const { data } = await supabase
      .from("clubs")
      .select("id, slug, name, city, ig_handle")
      .eq("slug", demande)
      .maybeSingle();

    if (data) {
      courant = data;
      ecrireMemoire(data);
    } else {
      // QR inconnu (club supprime, slug mal recopie) : on garde le
      // souvenir plutot que de vider l'app, mais on ne ment pas sur le nom.
      courant = memo || null;
    }
  } catch {
    courant = memo || null;
  }

  resolu = true;
  return courant;
}

// Vrai si le QR de l'URL ne correspond a aucun club connu.
export function slugDemande() {
  return slugDeLUrl();
}

// Utilisee par les ecrans qui ont besoin de l'uuid sans reafficher le nom.
export async function currentClubId() {
  const c = await currentClub();
  return c?.id || null;
}

// Oublie le club retenu (changement d'etablissement, deconnexion).
export function forgetClub() {
  courant = null;
  resolu = false;
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* sans effet en navigation privee */
  }
}

// Adresse a encoder dans le QR d'un club. Une seule definition, partagee
// par le dashboard gerant : si le format change, il change partout.
export function urlDuClub(slug, origine = location.origin) {
  return `${origine}/?c=${encodeURIComponent(slug)}`;
}
