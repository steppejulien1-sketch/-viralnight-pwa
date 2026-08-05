// Ecran — Boutique (PWA client), branchée sur Supabase.
//  - grille de rewards filtrable par catégorie, "accessible en premier"
//  - verrouillage : pas assez de points (barre) OU niveau requis (badge)
//  - rédemption : confirmation -> RPC redeem_reward (atomique) -> QR
//  - Realtime : toute modif côté dashboard owner apparaît sans refresh

import { h, icon } from "../lib/dom.js";
import { CLUB } from "../lib/mock.js";
import { supabase, isConfigured } from "../lib/supabase.js";
import { ensureSession } from "../lib/session.js";
import { impact } from "../lib/haptics.js";
import { celebrate } from "../lib/celebrate.js";
import QRCode from "qrcode";

const nf = new Intl.NumberFormat("fr-FR");
const CATS = [
  { v: "all", l: "Tout" },
  { v: "boisson", l: "Boissons" },
  { v: "entree", l: "Entrées" },
  { v: "vip", l: "VIP" },
  { v: "exclusif", l: "Exclusif" },
];
const LEVEL_SORT = { bronze: 1, argent: 2, or: 3, platine: 4, legende: 5 };
const LEVEL_LABEL = { bronze: "Bronze", argent: "Argent", or: "Or", platine: "Platine", legende: "Légende" };

export function Rewards(_params, ctx) {
  const root = h("div", { class: "rw-page" });
  let rewards = [];
  let me = { points_balance: 0, current_level: "bronze" };
  let clubId = null;
  let filter = "all";
  let channel = null;

  boot();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  async function boot() {
    swap(loading());
    if (!isConfigured) {
      swap(errorView("Boutique indisponible (hors ligne)."));
      return;
    }
    await ensureSession();

    // Club Mirage + rewards actifs + mon profil.
    const { data: club } = await supabase.from("clubs").select("id, name").eq("slug", CLUB.slug).maybeSingle();
    clubId = club?.id;
    const { data: user } = await supabase.from("users").select("points_balance, current_level").maybeSingle();
    if (user) me = user;
    await loadRewards();

    // Realtime : re-render quand un reward du club change.
    channel = supabase
      .channel("rewards-" + clubId)
      .on("postgres_changes", { event: "*", schema: "public", table: "rewards", filter: `club_id=eq.${clubId}` }, () => loadRewards())
      .subscribe();
  }

  async function loadRewards() {
    const { data } = await supabase
      .from("rewards")
      .select("*")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("cost_points");
    rewards = data || [];
    renderCatalog();
  }

  function affordable(r) {
    const lvlOk = !r.required_level || LEVEL_SORT[me.current_level] >= LEVEL_SORT[r.required_level];
    const ptsOk = me.points_balance >= r.cost_points;
    const stockOk = r.stock_remaining == null || r.stock_remaining > 0;
    return { lvlOk, ptsOk, stockOk, open: lvlOk && ptsOk && stockOk };
  }

  function renderCatalog() {
    const shown = rewards.filter((r) => filter === "all" || r.category === filter);
    // "accessible en premier"
    shown.sort((a, b) => Number(affordable(b).open) - Number(affordable(a).open) || a.cost_points - b.cost_points);

    swap(
      h("div", { class: "rw-inner" }, [
        h("header", { class: "rw-head" }, [
          h("button", { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("dashboard") }, icon("arrowRight", 18)),
          h("span", { class: "label" }, "Boutique"),
          h("span", { class: "rw-balance mono" }, `${nf.format(me.points_balance)} pts`),
        ]),

        // Filtres catégorie.
        h(
          "div",
          { class: "rw-filters" },
          CATS.map((c) =>
            h(
              "button",
              {
                class: `rw-chip${filter === c.v ? " is-on" : ""}`,
                onClick: () => {
                  filter = c.v;
                  renderCatalog();
                },
              },
              c.l
            )
          )
        ),

        h("div", { class: "rw-grid" }, shown.length ? shown.map(card) : [h("p", { class: "rw-empty-msg" }, "Rien dans cette catégorie pour l'instant.")]),
      ])
    );
  }

  function card(r) {
    const a = affordable(r);
    const progress = Math.min(100, Math.round((me.points_balance / r.cost_points) * 100));
    const remaining = r.cost_points - me.points_balance;

    return h("div", { class: `rc card${a.open ? " is-open" : " is-locked"}` }, [
      h("div", { class: "rc-top" }, [
        h("div", { class: "rc-info" }, [
          h("p", { class: "rc-title" }, r.title),
          h("p", { class: "rc-desc" }, r.description || ""),
        ]),
        h("div", { class: "rc-cost" }, [
          h("span", { class: "rc-cost-num mono" }, nf.format(r.cost_points)),
          h("span", { class: "rc-cost-unit" }, "pts"),
        ]),
      ]),

      // Ligne meta : stock + catégorie
      h("div", { class: "rc-meta" }, [
        h("span", { class: `rc-cat rc-cat-${r.category}` }, CATS.find((c) => c.v === r.category)?.l || r.category),
        r.stock_remaining != null ? h("span", { class: "rc-stock" }, `${r.stock_remaining} restant${r.stock_remaining > 1 ? "s" : ""}`) : null,
      ]),

      a.open
        ? h("button", { class: "btn btn-primary btn-block rc-btn", onClick: () => confirmRedeem(r) }, [icon("gift", 18), "Débloquer"])
        : !a.lvlOk
          ? h("div", { class: "rc-locked-lvl" }, [icon("sparkles", 14), `Réservé niveau ${LEVEL_LABEL[r.required_level]}`])
          : !a.stockOk
            ? h("div", { class: "rc-locked-lvl" }, "Stock épuisé")
            : h("div", { class: "rc-locked" }, [
                h("div", { class: "rc-bar", "aria-hidden": "true" }, [h("span", { class: "rc-bar-fill", style: { width: `${progress}%` } })]),
                h("p", { class: "rc-remaining" }, [h("span", { class: "mono" }, `${nf.format(remaining)} pts`), " avant de débloquer"]),
              ]),
    ]);
  }

  /* ---------- Confirmation ---------- */
  function confirmRedeem(r) {
    const sheet = h("div", { class: "rw-sheet-backdrop", onClick: (e) => e.target === sheet && close() }, [
      h("div", { class: "rw-sheet" }, [
        h("div", { class: "rw-sheet-grip", "aria-hidden": "true" }),
        h("h3", { class: "rw-sheet-title" }, r.title),
        h("p", { class: "rw-sheet-sub" }, [
          "Tu échanges ",
          h("strong", {}, `${nf.format(r.cost_points)} points`),
          ". Il te restera ",
          h("strong", {}, `${nf.format(me.points_balance - r.cost_points)} pts`),
          ".",
        ]),
        h("button", { class: "btn btn-primary btn-block", onClick: doRedeem }, "Confirmer l'échange"),
        h("button", { class: "rw-sheet-cancel", onClick: close }, "Annuler"),
      ]),
    ]);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add("is-open"));

    function close() {
      sheet.classList.remove("is-open");
      setTimeout(() => sheet.remove(), 250);
    }

    async function doRedeem() {
      const { data, error } = await supabase.rpc("redeem_reward", { p_reward: r.id });
      close();
      if (error) {
        alert("Échange impossible : " + error.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      impact();
      celebrate({ title: "Récompense débloquée !", sub: r.title });
      me.points_balance = row.new_balance;
      renderTicket(r, row.qr_code);
    }
  }

  /* ---------- Ticket QR ---------- */
  async function renderTicket(reward, code) {
    if (channel) supabase.removeChannel(channel);
    const canvas = h("canvas", { class: "tk-qr", width: "220", height: "220" });

    swap(
      h("div", { class: "rw-inner rw-ticket" }, [
        h("header", { class: "rw-head" }, [h("span", {}), h("span", { class: "label" }, "À montrer au bar"), h("button", { class: "ob-back rw-close", "aria-label": "Fermer", onClick: () => ctx.navigate("dashboard") }, icon("arrowRight", 18))]),
        h("div", { class: "tk-body" }, [
          h("div", { class: "tk-check pop", style: { "--d": "0ms" } }, icon("check", 26)),
          h("h1", { class: "tk-title pop", style: { "--d": "90ms" } }, reward.title),
          h("p", { class: "tk-sub pop", style: { "--d": "150ms" } }, "Débloqué. Présente ce code au staff."),
          h("div", { class: "tk-card card pop", style: { "--d": "230ms" } }, [
            h("div", { class: "tk-qr-wrap" }, [canvas]),
            h("div", { class: "tk-code mono" }, code),
            h("div", { class: "tk-meta" }, [h("span", {}, `${CLUB.name} · ${CLUB.city}`), h("span", { class: "tk-valid" }, [h("span", { class: "tk-valid-dot" }), "Valable ce soir"])]),
          ]),
        ]),
        h("footer", { class: "ps-foot pop", style: { "--d": "320ms" } }, [h("button", { class: "btn btn-ghost btn-block", onClick: () => ctx.navigate("dashboard") }, "Retour au tableau de bord")]),
      ])
    );

    try {
      await QRCode.toCanvas(canvas, code, { margin: 0, width: 220, color: { dark: "#f7f5ff", light: "#00000000" } });
    } catch (_) {}
  }

  function loading() {
    return h("div", { class: "rw-inner" }, [
      h("header", { class: "rw-head" }, [h("button", { class: "ob-back", onClick: () => ctx.back("dashboard") }, icon("arrowRight", 18)), h("span", { class: "label" }, "Boutique")]),
      h("div", { class: "rw-grid" }, [skeleton(), skeleton(), skeleton()]),
    ]);
  }
  function skeleton() {
    return h("div", { class: "rc card rc-skeleton" });
  }
  function errorView(msg) {
    return h("div", { class: "rw-inner" }, [h("p", { class: "rw-empty-msg" }, msg)]);
  }
}
