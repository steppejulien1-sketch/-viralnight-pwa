// Briques communes aux tests navigateur : cles, SQL, comptes jetables.
// ⚠️ L'API Management refuse urllib/fetch sans curl ? Non : c'est urllib
// (python) qui prend un 403. En node, fetch passe. Verifie a l'usage.
const fs = require("fs");
const { execFileSync } = require("child_process");

const REF = "gcopwgmqjiufemapamek";
const BASE = `https://${REF}.supabase.co`;
const PROD = "https://viralnight-pwa.vercel.app";

function env(nom, chemin) {
  for (const l of fs.readFileSync(chemin, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (l.trim().startsWith(nom + "=")) return l.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");
  }
  return null;
}

const ANON = env("VITE_SUPABASE_ANON_KEY", "C:/Users/stepp/Downloads/ViralNight-ClaudeCode-FULL/06-pwa-clubbeurs/.env.local");
const SBP = env("SUPABASE_ACCESS_TOKEN", "C:/Users/stepp/Downloads/ViralNight-ClaudeCode-FULL/01-base-fonctionnelle-vite-supabase-api/.env.local");

// ⚠️ Passage par curl : l'API Management repond 403 a certains clients.
// C'est un piege deja paye, on ne le rejoue pas.
// ⚠️ L'API Management renvoie parfois une PAGE HTML (limite de debit,
// passerelle) au lieu de JSON. Sans ce filet, ca casse en plein test avec
// un « Unexpected token '<' » qui ne dit pas ce qui s'est passe.
// On reessaie, puis on echoue en disant ce qui est vraiment revenu.
function mgmt(chemin, corps, essai = 0) {
  const args = ["-s", `https://api.supabase.com/v1${chemin}`, "-H", `Authorization: Bearer ${SBP}`];
  let f = null;
  if (corps !== undefined) {
    f = `${__dirname}/_mgmt_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
    fs.writeFileSync(f, JSON.stringify(corps));
    args.push("-X", "POST", "-H", "Content-Type: application/json", "--data-binary", "@" + f);
  }
  const out = execFileSync("curl", args, { encoding: "utf8" });
  if (f) fs.unlinkSync(f);
  if (!out.trim()) return null;
  try {
    const r = JSON.parse(out);
    if (r && r.message && /rate|limit|too many/i.test(r.message) && essai < 4) {
      execFileSync("curl", ["-s", "-o", process.platform === "win32" ? "NUL" : "/dev/null", "https://api.supabase.com/"]);
      return mgmt(chemin, corps, essai + 1);
    }
    return r;
  } catch {
    if (essai < 4) {
      // Petite attente sans dependance : un appel reseau qui ne fait rien.
      execFileSync("curl", ["-s", "-m", "3", "-o", process.platform === "win32" ? "NUL" : "/dev/null", "https://api.supabase.com/v1/projects"]);
      return mgmt(chemin, corps, essai + 1);
    }
    throw new Error(`API Management : reponse non-JSON (${out.slice(0, 120).replace(/\s+/g, " ")})`);
  }
}

const sql = (q) => mgmt(`/projects/${REF}/database/query`, { query: q });

let SERVICE = null;
function service() {
  if (!SERVICE) SERVICE = mgmt(`/projects/${REF}/api-keys`).find((k) => k.name === "service_role").api_key;
  return SERVICE;
}

async function admin(chemin, method, body) {
  const r = await fetch(`${BASE}${chemin}`, {
    method,
    headers: { apikey: service(), Authorization: `Bearer ${service()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  return [r.status, t ? JSON.parse(t) : null];
}

// Un compte jetable + son lien magique vers la PROD.
// ⚠️ Supabase COUPE les parametres de redirect_to : on atterrit sur la
// racine, puis on renavigue avec ?c=<slug> (le club vit en localStorage).
async function compteJetable(prefixe, redirect = PROD) {
  const email = `e2e-${prefixe}-${Date.now()}@viralnight.test`;
  const [st, u] = await admin("/auth/v1/admin/users", "POST", { email, password: "E2e-" + Math.random().toString(36).slice(2), email_confirm: true });
  if (st >= 400) throw new Error("creation compte: " + JSON.stringify(u));
  const [st2, l] = await admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email, redirect_to: redirect });
  if (st2 >= 400) throw new Error("lien: " + JSON.stringify(l));
  return { email, uid: u.id, lien: l.action_link };
}

async function lienGerant(redirect = PROD + "/owner.html") {
  const [st, l] = await admin("/auth/v1/admin/generate_link", "POST", { type: "magiclink", email: "owner@mirage.club", redirect_to: redirect });
  if (st >= 400) throw new Error("lien gerant: " + JSON.stringify(l));
  return l.action_link;
}

async function supprimerCompte(uid) {
  sql(`delete from public.point_grants where user_id='${uid}';
       delete from public.leaderboard_entries where user_id='${uid}';
       delete from public.view_claims where user_id='${uid}';
       delete from public.story_events where user_id='${uid}';
       delete from public.user_badges where user_id='${uid}';
       delete from public.users where id='${uid}';`);
  await admin(`/auth/v1/admin/users/${uid}`, "DELETE");
}

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

module.exports = { REF, BASE, PROD, ANON, SBP, mgmt, sql, service, admin, compteJetable, lienGerant, supprimerCompte, CHROME };
