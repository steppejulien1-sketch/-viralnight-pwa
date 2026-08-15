// Ecran — Boutique (refonte UI, socle ui/ + patterns/).
//
// ⚠️ AUCUN APPEL SUPABASE N'A CHANGE : meme lecture du club, meme
// requete `rewards`, meme abonnement Realtime, meme RPC
// `redeem_reward` (atomique, verrou de ligne), meme generation de QR.
//
// CE QUI CHANGE A L'ECRAN :
//  - les deux `alert()` disparaissent. L'un servait a annoncer un
//    echec d'echange, l'autre a donner le code de retrait quand le
//    ticket ne s'affichait pas : une fenetre systeme grise, en pleine
//    soiree, pour l'information la plus importante du parcours ;
//  - le prix n'est en encre rouge que s'il est atteignable — sinon
//    tout le catalogue s'allume et plus rien ne ressort ;
//  - le QR passe sur fond BLANC (voir rewards.css) ;
//  - la confirmation arrive par le bas, dans la zone du pouce.

import { h, icon } from "../lib/dom.js";
import { Button, Chips, Empty, Points, Sheet, Skeleton } from "../ui/index.js";
import { Screen } from "../patterns/Screen.js";
import { RewardCard, etatRecompense } from "../patterns/RewardCard.js";
import { currentClub } from "../lib/club.js";
import { supabase, isConfigured } from "../lib/supabase.js";
import { ensureSession } from "../lib/session.js";
import { impact } from "../lib/haptics.js";
import { celebrate } from "../lib/celebrate.js";
import QRCode from "qrcode";
import "./rewards.css";

const nf = new Intl.NumberFormat("fr-FR");

const CATS = [
  { value: "all", label: "Tout" },
  { value: "boisson", label: "Boissons" },
  { value: "entree", label: "Entrées" },
  { value: "vip", label: "VIP" },
  { value: "exclusif", label: "Exclusif" },
];

export function Rewards(_params, ctx) {
  // Pas de classe de page : le routeur pose deja .screen, et
  // .vn-screen se charge de la mise en page.
  const root = h("div");

  let rewards = [];
  let me = { points_balance: 0 };
  // Le club entier, pas seulement son id : le ticket affiche son nom
  // et sa ville.
  let club = null;
  let clubId = null;
  let filtre = "all";
  let channel = null;

  boot();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  async function boot() {
    swap(chargement());

    if (!isConfigured) {
      swap(
        message(
          "Boutique indisponible",
          "L'app n'est pas reliée à sa base pour le moment. Réessaie dans un instant."
        )
      );
      return;
    }

    await ensureSession();

    club = await currentClub();
    clubId = club?.id;
    if (!clubId) {
      swap(
        message(
          "Scanne le QR de ton club",
          "Il est affiché au bar ou à l'entrée. C'est lui qui ouvre la boutique du bon établissement."
        )
      );
      return;
    }

    const { data: user } = await supabase.from("users").select("points_balance").maybeSingle();
    if (user) me = user;

    await chargerRecompenses();

    // Realtime : une modification cote gerant apparait sans refresh.
    channel = supabase
      .channel("rewards-" + clubId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rewards", filter: `club_id=eq.${clubId}` },
        () => chargerRecompenses()
      )
      .subscribe();
  }

  async function chargerRecompenses() {
    const { data } = await supabase
      .from("rewards")
      .select("*")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("cost_points");
    rewards = data || [];
    renderCatalogue();
  }

  /* ---------- Catalogue ---------- */
  function renderCatalogue() {
    const el = Screen({ label: "Boutique", headRight: soldeEl() });

    const visibles = rewards.filter((r) => filtre === "all" || r.category === filtre);
    // Accessible en premier : c'est ce qu'on peut prendre CE SOIR qui
    // decide si on reste dans l'app.
    visibles.sort(
      (a, b) =>
        Number(etatRecompense(b, me.points_balance).ouverte) -
          Number(etatRecompense(a, me.points_balance).ouverte) ||
        a.cost_points - b.cost_points
    );

    el.body.append(
      Chips(CATS, {
        value: filtre,
        ariaLabel: "Filtrer par catégorie",
        onChange: (v) => {
          filtre = v;
          renderCatalogue();
        },
      }),

      h(
        "div",
        { class: "shop-list" },
        visibles.length
          ? visibles.map((r) => RewardCard(r, me.points_balance, confirmer))
          : [
              Empty({
                title: "Rien dans cette catégorie",
                sub: "Regarde les autres, ou reviens quand le club aura enrichi sa carte.",
              }),
            ]
      )
    );

    swap(el);
  }

  function soldeEl() {
    return h("span", { class: "shop-balance" }, [
      Points(me.points_balance, { size: "sm" }),
    ]);
  }

  /* ---------- Confirmation ---------- */
  function confirmer(r) {
    const reste = me.points_balance - r.cost_points;

    const sheet = Sheet({
      title: r.title,
      body: h("p", { class: "vn-sheet__sub" }, [
        "Tu échanges ",
        h("strong", {}, `${nf.format(r.cost_points)} points`),
        ". Il te restera ",
        h("strong", {}, `${nf.format(reste)} pts`),
        ".",
      ]),
      actions: [
        confirmBtn(),
        Button({
          label: "Annuler",
          variant: "quiet",
          block: true,
          onClick: () => sheet.close(),
        }),
      ],
    });

    function confirmBtn() {
      const btn = Button({
        label: "Confirmer l'échange",
        block: true,
        onClick: async () => {
          btn.setLoading(true);
          const { data, error } = await supabase.rpc("redeem_reward", { p_reward: r.id });

          if (error) {
            // Plus d'alert() : le message revient DANS la feuille,
            // la ou le geste a eu lieu.
            btn.setLoading(false);
            sheet.el.append(
              h("p", { class: "vn-field__err", role: "alert" }, traduire(error.message))
            );
            return;
          }

          const row = Array.isArray(data) ? data[0] : data;
          sheet.close();
          impact();
          celebrate({ title: "Récompense débloquée !", sub: r.title });
          me.points_balance = row.new_balance;

          // ⚠️ Filet de securite. renderTicket est async : une erreur
          // dedans part en rejet silencieux, l'ecran ne change pas, et
          // le clubbeur se retrouve DEBITE SANS SON CODE. C'est
          // exactement ce qui arrivait avec la reference a `CLUB`, qui
          // n'etait pas importee.
          renderTicket(r, row.qr_code).catch(() => {
            renderTicketDegrade(r, row.qr_code);
          });
        },
      });
      return btn;
    }
  }

  /* ---------- Ticket de retrait ---------- */
  async function renderTicket(reward, code) {
    // On quitte l'ecran : plus besoin d'ecouter les changements.
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }

    const canvas = h("canvas", { width: "216", height: "216" });
    const el = Screen({
      label: "À montrer au bar",
      onBack: () => ctx.navigate("dashboard"),
    });

    el.body.append(
      h("div", { class: "shop-ticket" }, [
        h("div", { class: "shop-ticket__check", "aria-hidden": "true" }, icon("check", 28)),
        h("h1", { class: "vn-h2" }, reward.title),
        h("p", { class: "vn-screen__sub" }, "Débloqué. Présente ce code au staff."),
        h("div", { class: "shop-ticket__qr" }, [canvas]),
        h("p", { class: "shop-ticket__code" }, code),
        h("p", { class: "shop-ticket__meta" }, [
          club ? `${club.name} · ${club.city}` : "",
          h("span", {}, "· Valable ce soir"),
        ]),
      ])
    );

    el.foot.append(
      Button({
        label: "Retour à mon espace",
        variant: "ghost",
        block: true,
        onClick: () => ctx.navigate("dashboard"),
      })
    );

    swap(el);

    // ⚠️ QR SOMBRE SUR FOND BLANC. L'ancienne version dessinait un QR
    // clair (#f7f5ff) sur fond transparent, donc sur du noir : aucune
    // douchette ni aucun appareil photo ne lit ca de facon fiable.
    await QRCode.toCanvas(canvas, code, {
      margin: 0,
      width: 216,
      color: { dark: "#08090c", light: "#ffffff" },
    });
  }

  // Si meme le rendu du QR echoue, le code reste lisible : c'est lui
  // qui vaut la recompense, le QR n'est qu'une commodite.
  function renderTicketDegrade(reward, code) {
    const el = Screen({ label: "À montrer au bar", onBack: () => ctx.navigate("dashboard") });
    el.body.append(
      h("div", { class: "shop-ticket" }, [
        h("div", { class: "shop-ticket__check", "aria-hidden": "true" }, icon("check", 28)),
        h("h1", { class: "vn-h2" }, reward.title),
        h("p", { class: "vn-screen__sub" }, "Débloqué. Dicte ce code au staff."),
        h("p", { class: "shop-ticket__code" }, code),
      ])
    );
    el.foot.append(
      Button({
        label: "Retour à mon espace",
        variant: "ghost",
        block: true,
        onClick: () => ctx.navigate("dashboard"),
      })
    );
    swap(el);
  }

  /* ---------- Etats ---------- */
  function chargement() {
    const el = Screen({ label: "Boutique" });
    el.body.append(
      h("div", { class: "shop-list" }, [
        Skeleton({ card: true }),
        Skeleton({ card: true }),
        Skeleton({ card: true }),
      ])
    );
    return el;
  }

  function message(titre, sous) {
    const el = Screen({ label: "Boutique" });
    el.body.append(Empty({ ico: "scan", title: titre, sub: sous }));
    return el;
  }

  function traduire(m) {
    const s = String(m || "").toLowerCase();
    if (s.includes("insufficient") || s.includes("balance"))
      return "Il te manque des points — ton solde a peut-être changé.";
    if (s.includes("stock")) return "Plus de stock : quelqu'un vient de la prendre.";
    if (s.includes("permission") || s.includes("denied")) return "Échange non autorisé.";
    return "L'échange n'a pas abouti. Réessaie dans un instant.";
  }
}
