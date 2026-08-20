// Ecran — Inscription / connexion (refonte UI, socle ui/ + patterns/).
//
// ⚠️ L'ecran demande le pseudo, et propose une capture de profil.
//
// 1. La SAISIE DU NOMBRE D'ABONNES a ete retiree le 2026-08-14 (Julien :
//    « que le client puisse lui-meme mettre son nombre d'abos, c'est
//    inutile »). Un chiffre qu'on se donne a soi-meme ne prouve rien : les
//    abonnes ne peuvent plus venir que d'une connexion reseau.
// 2. La CAPTURE DE PROFIL, elle, a ete REDEMANDEE le meme jour (« quand on
//    tape son nom d'utilisateur, mets un truc pour mettre une capture
//    d'ecran en dessous », migration 0027). Ce n'est pas un retour en
//    arriere : on ne demande aucun chiffre, la capture sert au gerant a
//    reconnaitre qui se cache derriere un pseudo — d'autant plus utile
//    qu'une story n'apporte plus de capture depuis la 0026.
//    Elle est FACULTATIVE et part dans `story-proofs`, seul bucket dont le
//    chemin permet au gerant de lire (0015).
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
import { Button, Field, Picker } from "../ui/index.js";
import { Screen, Title, Sub, Section, Note } from "../patterns/Screen.js";
import { tap } from "../lib/haptics.js";
import { supabase, isConfigured, signInWithEmail, signInWithGoogle } from "../lib/supabase.js";
import { ensureSession } from "../lib/session.js";
import { availableProviders, startSocialLogin, readSocialReturn } from "../lib/social.js";
import { currentClub } from "../lib/club.js";
import { loadMyProfile, uploadProfileProof } from "../lib/game.js";
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

    // Google, via le fournisseur OAuth natif de Supabase (voir supabase.js
    // pour pourquoi ce n'est pas le meme chemin que TikTok/Instagram). Le
    // logo Google est une charte a 4 couleurs imposee par Google lui-meme :
    // ca ne rentre pas dans le jeu d'icones a un seul trait de dom.js
    // (voir instagram/tiktok juste au-dessus), d'ou ce SVG inline plutot
    // qu'un icon("google").
    const googleIco = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    googleIco.setAttribute("viewBox", "0 0 48 48");
    googleIco.setAttribute("width", "19");
    googleIco.setAttribute("height", "19");
    googleIco.setAttribute("aria-hidden", "true");
    googleIco.innerHTML =
      '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
      '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
      '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>';

    const googleBtn = Button({
      label: "Continuer avec Google",
      variant: "google",
      ico: googleIco,
      block: true,
      onClick: async (e) => {
        tap();
        const bouton = e.currentTarget;
        bouton.setLoading?.(true);
        const err = await signInWithGoogle();
        // N'arrive que si la redirection n'est jamais partie (Supabase pas
        // configure, ou le fournisseur Google pas encore active cote
        // tableau de bord -- "Unsupported provider"). Si la redirection
        // part, la page quitte avant que ce code ne s'execute.
        if (err) {
          bouton.setLoading?.(false);
          montrer(msg, /unsupported provider/i.test(err)
            ? "Connexion Google bientôt disponible. En attendant, reçois un lien par email."
            : err);
          email.focus();
        }
      },
    });

    el.body.append(
      mascotteAccueil(),
      Title(club ? `Rejoins le ${club.name}` : "Bienvenue sur ViralNight"),
      Sub([
        "Connecte ton réseau, ou reçois un lien par email. ",
        h("strong", {}, "Aucun mot de passe"),
        " à retenir.",
      ]),

      h("div", { class: "ob-social" }, [googleBtn, ...social]),
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

    // ⚠️ CAPTURE DE PROFIL, sous le pseudo (demande de Julien, 0027).
    // Elle ne remplace PAS la declaration d'abonnes retiree par la 0024 :
    // on ne demande aucun chiffre. Elle sert au gerant a reconnaitre qui
    // se cache derriere `@ce.pseudo` — d'autant plus utile qu'une story
    // n'apporte plus de capture depuis la 0026.
    // FACULTATIVE : la rendre obligatoire ferait perdre des inscriptions
    // pour une piece qui n'est pas indispensable au credit.
    const profil = Picker({
      title: "Capture de ton profil",
      sub: "facultatif",
    });

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

        // Capture de profil (0027). « Au mieux » et volontairement :
        // elle est facultative, une panne d'envoi ne doit pas empecher
        // quelqu'un d'entrer dans l'app. Elle part APRES la creation de
        // la ligne `users` — `set_profile_proof` fait un UPDATE, qui ne
        // toucherait aucune ligne avant (meme piege que la 0018).
        const f = profil.getFile();
        if (f && club?.id) {
          const r = await uploadProfileProof(f, club.id);
          if (r?.error) console.warn("capture de profil non enregistree :", r.error);
        }
      }

      profil.destroy();
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

      // Capture de profil, juste sous le pseudo (0027).
      profil,
      h(
        "p",
        { class: "ob-hint" },
        "Une capture de ton profil aide le club à te reconnaître quand tu le tagues."
      ),

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

  // Meme mascotte que la maquette approuvee par Julien (petit personnage a
  // lunettes de soleil, boule a facettes tournante, lumieres animees) --
  // reprise ici a l'identique plutot que retapee, pour garantir un rendu
  // pixel pour pixel identique a ce qu'il a valide.
  function mascotteAccueil() {
    const el = h("div", { class: "ob-mascot", "aria-hidden": "true" });
    el.innerHTML = `<svg viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="obBallShine" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="45%" stop-color="#d8d8de" stop-opacity="0.55" />
          <stop offset="100%" stop-color="#8d8d97" stop-opacity="0.3" />
        </radialGradient>
        <linearGradient id="obBodyShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2a2733" />
          <stop offset="100%" stop-color="#181620" />
        </linearGradient>
      </defs>
      <g class="ob-mascot-lights">
        <circle cx="80" cy="12" r="3" fill="#ff6363" />
        <circle cx="106" cy="24" r="2.4" fill="#9281f7" />
        <circle cx="112" cy="46" r="2" fill="#ffe27a" />
        <circle cx="48" cy="46" r="2" fill="#63a1ff" />
        <circle cx="54" cy="24" r="2.4" fill="#ff6363" />
      </g>
      <g class="ob-mascot-ball">
        <circle cx="80" cy="38" r="17" fill="url(#obBallShine)" stroke="rgba(255,255,255,0.35)" stroke-width="0.6" />
        <g stroke="rgba(10,8,16,0.35)" stroke-width="0.6" fill="none">
          <path d="M63 38h34M80 21v34M67 25l26 26M93 25 67 51" />
          <circle cx="80" cy="38" r="10" />
        </g>
      </g>
      <line x1="80" y1="55" x2="80" y2="76" stroke="rgba(255,255,255,0.25)" stroke-width="1.4" />
      <g class="ob-mascot-body">
        <ellipse cx="80" cy="140" rx="46" ry="50" fill="url(#obBodyShade)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
        <circle cx="38" cy="128" r="9" fill="url(#obBodyShade)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
        <circle cx="122" cy="128" r="9" fill="url(#obBodyShade)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
        <g>
          <rect x="46" y="124" width="30" height="22" rx="11" fill="#0a0810" stroke="#ff6363" stroke-width="2" />
          <rect x="84" y="124" width="30" height="22" rx="11" fill="#0a0810" stroke="#ff6363" stroke-width="2" />
          <path d="M76 133h8" stroke="#ff6363" stroke-width="2" stroke-linecap="round" />
          <path d="M52 130q6-4 12 0" stroke="rgba(255,255,255,0.45)" stroke-width="1.6" fill="none" stroke-linecap="round" />
          <path d="M90 130q6-4 12 0" stroke="rgba(255,255,255,0.45)" stroke-width="1.6" fill="none" stroke-linecap="round" />
        </g>
        <path d="M68 160q12 10 24 0" stroke="#e8e9eb" stroke-width="2.6" fill="none" stroke-linecap="round" />
        <path d="M36 158q-14 6-16 20" stroke="url(#obBodyShade)" stroke-width="10" fill="none" stroke-linecap="round" />
        <path d="M124 158q14 6 16 20" stroke="url(#obBodyShade)" stroke-width="10" fill="none" stroke-linecap="round" />
      </g>
    </svg>`;
    return el;
  }

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
