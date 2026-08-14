// Ecran — Inscription / connexion (refonte UI, socle ui/ + patterns/).
//
// ⚠️ L'ecran ne demande plus QUE le pseudo. La saisie du nombre
// d'abonnes et sa capture de profil ont ete retirees le 2026-08-14
// (Julien : « que le client puisse lui-meme mettre son nombre d'abos,
// c'est inutile »). Un chiffre qu'on se donne a soi-meme ne prouve rien.
// Les abonnes ne peuvent plus venir que d'une connexion reseau.
//
// TROIS VOIES, par ordre de facilite :
//   1. TikTok    — Login Kit, ouvert a TOUS les comptes.
//   2. Instagram — n'accepte QUE les comptes Createur ou Business depuis
//                  la fermeture de Basic Display le 4 decembre 2024. Un
//                  compte perso est refuse par Instagram lui-meme ; le
//                  message d'erreur explique la bascule, gratuite et
//                  instantanee.
//   3. Email     — lien magique, toujours disponible, aucun reseau requis.
//
// Les deux boutons sociaux sont TOUJOURS affiches : l'utilisateur doit
// voir ses options d'un coup d'oeil. Tant qu'une app n'est pas configuree
// (cle + redirect_uri), le bouton est attenue et l'annonce au tap, plutot
// que de lancer une redirection qui casserait chez lui.
//
// ⚠️ CE QUI CREE LA LIGNE DE PROFIL. Aucun declencheur ne genere
// `public.users` a la creation du compte auth : sans l'upsert ci-dessous,
// l'UPDATE du pseudo -- et `declare_followers`, qui fait aussi un UPDATE --
// portent sur 0 ligne SANS lever d'erreur, et le pseudo est perdu en
// silence. C'etait le cas depuis l'origine (voir migration 0018).
//
// CE QUI CHANGE A L'ECRAN :
//  - chaque champ porte SA propre erreur, au lieu d'un unique
//    <p class="ob-alert"> partage par tous ;
//  - le bouton d'envoi garde son libelle pendant le chargement.

import { h, icon } from "../lib/dom.js";
import { Button, Field } from "../ui/index.js";
import { Screen, Title, Sub, Section, Note } from "../patterns/Screen.js";
import { tap } from "../lib/haptics.js";
import { supabase, isConfigured, signInWithEmail } from "../lib/supabase.js";
import { ensureSession } from "../lib/session.js";
import { availableProviders, startSocialLogin, readSocialReturn } from "../lib/social.js";
import { currentClub } from "../lib/club.js";
import { loadMyProfile } from "../lib/game.js";
import "./onboarding.css";

const HANDLE_RE = /^[a-zA-Z0-9._]{2,30}$/;

export function Onboarding(_params, ctx) {
  const root = h("div");

  // Le club vient du QR scanne : l'ecran annoncait « Rejoins le Mirage »
  // et le handle @mirage.brussels a tout le monde, quel que soit
  // l'etablissement scanne.
  let club = null;

  start();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  async function start() {
    // Resolu AVANT tout rendu : l'ecran affiche le nom du club des sa
    // premiere image, on ne veut pas afficher un nom puis un autre.
    club = await currentClub().catch(() => null);

    // Retour d'un reseau social. La session est deja ouverte par
    // Supabase (l'edge function a renvoye le navigateur sur le lien
    // d'action), il ne reste qu'a lire le resultat.
    const retour = readSocialReturn();
    if (retour && !retour.ok) return renderConnect(retour.message);

    // Retour de lien magique ou de reseau social : la session existe.
    const s = await ensureSession().catch(() => null);
    if (s?.user) {
      // Le pseudo deja enregistre vient de la BASE, pas d'une variable
      // en memoire : il doit survivre a la fermeture de l'app.
      const profil = await loadMyProfile().catch(() => null);
      return renderHandle(s.user, profil?.handle || "");
    }
    renderConnect();
  }

  /* ================= 1. Choix de la voie ================= */

  function renderConnect(erreur) {
    const el = Screen({
      label: club ? `${club.name} · ${club.city}` : "Ton club",
      onBack: () => ctx.back("landing"),
    });

    const msg = h("p", { class: "ob-alert", role: "alert", hidden: true });

    const email = Field({
      label: "Ton adresse email",
      type: "email",
      inputmode: "email",
      autocomplete: "email",
      placeholder: "ton@email.com",
      onEnter: () => envoyer(),
    });

    const btn = Button({
      label: "Recevoir mon lien",
      block: true,
      onClick: () => envoyer(),
    });

    async function envoyer() {
      const adresse = email.getValue();
      if (!adresse || !adresse.includes("@")) {
        email.setError("Il manque une adresse email valide.");
        return;
      }
      tap();
      cacher(msg);
      btn.setLoading(true);

      if (!isConfigured) {
        // Mode demo hors ligne : on n'invente pas une connexion reussie.
        btn.setLoading(false);
        montrer(msg, "Connexion indisponible : l'app n'est pas reliée à sa base.");
        return;
      }

      const { error } = await signInWithEmail(adresse);
      btn.setLoading(false);
      if (error) {
        email.setError(traduire(error));
        return;
      }
      renderSent(adresse);
    }

    // Les deux boutons sont toujours visibles. S'ils ne sont pas encore
    // configures, on le dit au tap plutot que de lancer une redirection
    // qui echouerait chez l'utilisateur.
    const social = availableProviders().map((p) =>
      Button({
        label: `Continuer avec ${p.label}`,
        variant: p.id === "instagram" ? "ig" : "tiktok",
        ico: icon(p.ico, 19),
        block: true,
        soon: !p.ready,
        onClick: async (e) => {
          tap();
          if (!p.ready) {
            montrer(
              msg,
              `Connexion ${p.label} bientôt disponible. En attendant, reçois un lien par email.`
            );
            email.focus();
            return;
          }
          const bouton = e.currentTarget;
          bouton.setLoading?.(true);
          const err = await startSocialLogin(p.id);
          if (err) {
            bouton.setLoading?.(false);
            montrer(msg, err);
          }
        },
      })
    );

    el.body.append(
      h("div", { class: "ob-badge", "aria-hidden": "true" }, icon("sparkles", 30)),
      Title(club ? `Rejoins le ${club.name}` : "Rejoins ton club"),
      Sub([
        "Connecte ton réseau, ou reçois un lien par email. ",
        h("strong", {}, "Aucun mot de passe"),
        " à retenir.",
      ]),

      h("div", { class: "ob-social" }, social),
      h("p", { class: "ob-sep" }, h("span", {}, "ou par email")),
      email,
      msg,

      h("ul", { class: "ob-assure" }, [
        assure("On ne poste jamais à ta place."),
        assure("On lit juste les stories qui taguent le club."),
        assure("Ton email ne sert qu'à te reconnaître."),
      ])
    );

    el.foot.append(btn, Note("Gratuit, rien à installer."));

    if (erreur) montrer(msg, erreur);
    swap(el);
  }

  /* ================= 2. Lien envoye ================= */

  function renderSent(adresse) {
    const el = Screen({ label: "Vérifie tes mails", onBack: () => renderConnect() });

    el.body.append(
      h("div", { class: "ob-center" }, [
        h("div", { class: "ob-badge", "aria-hidden": "true" }, icon("check", 30)),
        Title("Regarde tes mails"),
        Sub([
          "On vient d'envoyer un lien à ",
          h("strong", {}, adresse),
          ". Clique dessus depuis ce téléphone et tu reviens ici connecté.",
        ]),
        h(
          "p",
          { class: "vn-meta vn-mute" },
          "Rien reçu ? Vérifie les spams, ou reviens en arrière pour corriger l'adresse."
        ),
      ])
    );

    swap(el);
  }

  /* ================= 3. Pseudo ================= */

  function renderHandle(user, handleExistant = "") {
    const el = Screen({
      label: club ? `${club.name} · ${club.city}` : "Ton club",
      onBack: () => ctx.back("landing"),
    });

    const msg = h("p", { class: "ob-alert", role: "alert", hidden: true });

    const pseudo = Field({
      label: "Ton pseudo Instagram",
      prefix: "@",
      placeholder: "ton.pseudo",
      value: handleExistant,
      onEnter: () => enregistrer(),
    });

    // ⚠️ LA SAISIE DES ABONNES A ETE RETIREE (Julien, 2026-08-14 : « que
    // le client puisse lui-meme mettre son nombre d'abos, c'est inutile »).
    // Un chiffre qu'on se donne a soi-meme ne vaut rien, et il donnait a
    // l'inscription un air de formulaire. Le nombre d'abonnes ne peut
    // desormais venir QUE d'une connexion reseau (TikTok/Instagram), qui
    // l'ecrit avec `follower_source = 'tiktok'/'instagram'`.
    // 👉 Ne pas remettre de champ de saisie ici : `declare_followers` a
    // ete revoquee pour `authenticated`, l'appel echouerait.

    const btn = Button({ label: "C'est parti", block: true, onClick: () => enregistrer() });

    async function enregistrer() {
      const handle = pseudo.getValue().replace(/^@/, "");
      if (!HANDLE_RE.test(handle)) {
        pseudo.setError("Pseudo invalide : lettres, chiffres, point et underscore.");
        return;
      }

      tap();
      cacher(msg);
      btn.setLoading(true);

      if (isConfigured) {
        // ⚠️ ON CONFLICT DO NOTHING : on ne retouche pas une ligne
        // existante. C'est aussi ce qu'imposent les droits, le grant
        // UPDATE ne couvrant pas la colonne id (migration 0018). Les
        // colonnes inserables se limitent a (id, handle, email) :
        // impossible de se donner des points en passant par ici.
        const { error: creaErr } = await supabase
          .from("users")
          .upsert(
            { id: user.id, handle, email: user.email || null },
            { onConflict: "id", ignoreDuplicates: true }
          );
        if (creaErr) {
          btn.setLoading(false);
          montrer(msg, traduire(creaErr.message));
          return;
        }

        // La migration 0004 n'autorise l'ecriture que sur handle et
        // email : impossible de toucher a son solde en passant par ici.
        const { error } = await supabase.from("users").update({ handle }).eq("id", user.id);

        if (error) {
          btn.setLoading(false);
          montrer(msg, traduire(error.message));
          return;
        }
      }

      ctx.navigate("dashboard");
    }

    el.body.append(
      h("div", { class: "ob-badge", "aria-hidden": "true" }, icon("instagram", 30)),
      Title("Ton pseudo Instagram"),
      Sub(
        club
          ? [
              "C'est lui qu'on cherche dans les mentions de ",
              h("strong", {}, `@${club.ig_handle}`),
              ". Pas besoin de te connecter à Instagram : poster depuis ton compte suffit à prouver que c'est le tien.",
            ]
          : "C'est lui qu'on cherche dans les mentions de ton club. Pas besoin de te connecter à Instagram : poster depuis ton compte suffit à prouver que c'est le tien."
      ),

      pseudo,

      msg
      // ⚠️ Le bandeau « Ton premier objectif » a ete RETIRE (demande de
      // Julien, 2026-08-14). Il annoncait la recompense la moins chere du
      // catalogue pendant l'inscription. Ne pas le remettre sans qu'il le
      // redemande : la fabrique `rappelObjectif()` et la feuille
      // `.ob-goal` ont ete supprimees avec lui.
    );

    el.foot.append(btn, Note("Tu pourras le changer depuis ton profil."));
    swap(el);
  }

  /* ---------- Fabriques ---------- */

  function assure(txt) {
    return h("li", { class: "ob-assure__item" }, [
      h("span", { class: "ob-assure__dot", "aria-hidden": "true" }, icon("check", 12)),
      h("span", {}, txt),
    ]);
  }

  function montrer(el, txt) {
    el.textContent = txt;
    el.hidden = false;
  }
  function cacher(el) {
    el.textContent = "";
    el.hidden = true;
  }
}

// Les erreurs Supabase arrivent en anglais et sont trop techniques.
function traduire(m) {
  const s = String(m || "").toLowerCase();
  if (s.includes("rate limit") || s.includes("too many"))
    return "Trop de tentatives. Réessaie dans une minute.";
  if (s.includes("invalid") && s.includes("email")) return "Cette adresse email n'est pas valide.";
  if (s.includes("duplicate") || s.includes("unique")) return "Ce pseudo est déjà pris sur ce club.";
  if (s.includes("permission") || s.includes("denied")) return "Action non autorisée.";
  return "Ça n'a pas marché. Réessaie dans un instant.";
}
