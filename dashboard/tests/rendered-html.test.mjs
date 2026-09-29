import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("affiche le Control Center FyxBot côté serveur", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /connect-src 'self'(?:;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval|\bhttps:\s|\bws:\s|\bwss:\s/);

  const html = await response.text();
  assert.match(html, /<title>FyxBot — Bot Discord de modération, tickets et sécurité<\/title>/i);
  assert.match(html, /name="description" content="FyxBot est un bot Discord français/i);
  assert.match(html, /name="google-site-verification"/i);
  assert.match(html, /rel="canonical" href="https:\/\/fyxbot-panel-production\.up\.railway\.app\/?"/i);
  assert.match(html, /application\/ld\+json/i);
  assert.match(html, /FYXBOT/);
  assert.match(html, /CONTROL CENTER/);
  assert.match(html, /BOT DISCORD PUBLIC/);
  assert.match(html, /Ajoutez FyxBot à votre serveur Discord/);
  assert.match(html, /Modérez votre communauté/);
  assert.match(html, /Inviter FyxBot/);
  assert.match(html, /Mascotte robot FyxBot/);
  assert.match(html, /Support et signalement/);
  assert.match(html, /name="creator" content="Équipe FyxBot"/i);
  assert.doesNotMatch(html, /Antony Gerphagnon/i);
  assert.doesNotMatch(html, /DISCORD_TOKEN|DISCORD_CLIENT_SECRET|BACKUP_SECRET|PRIVATE KEY/i);
});

test("publie le Control Center V2 comme interface principale", async () => {
  const [response, v1Page, v2Page, dashboard, css] = await Promise.all([
    render("/v2"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/v2/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>FyxBot Control Center V2<\/title>/i);
  assert.match(html, /name="robots" content="noindex, follow"/i);
  assert.match(v1Page, /<Dashboard variant="v2"\s*\/>/);
  assert.match(v2Page, /<Dashboard variant="v2"\s*\/>/);
  assert.match(dashboard, /Centre de pilotage FyxBot V2/);
  assert.match(dashboard, /data\.onboarding\.percent/);
  assert.match(dashboard, /data\.recentLogs\.slice\(0, 3\)/);
  assert.match(css, /data-dashboard-version="v2"/);
  assert.match(css, /V2 · CONTROL CENTER/);
});

test("publie les informations légales et la procédure de signalement à jour", async () => {
  const [terms, privacy, support, changelog] = await Promise.all([
    render("/conditions-utilisation"),
    render("/politique-confidentialite"),
    render("/support"),
    render("/changelog"),
  ]);

  assert.equal(terms.status, 200);
  const termsHtml = await terms.text();
  assert.match(termsHtml, /FyxBot est disponible en ligne/);
  assert.match(termsHtml, /cent premiers comptes Discord/);
  assert.match(termsHtml, /aucun renouvellement automatique/);
  assert.match(termsHtml, /partenaire, un membre de l’équipe ou un bénéficiaire identifié/);
  assert.equal(privacy.status, 200);
  const privacyHtml = await privacy.text();
  assert.match(privacyHtml, /Railway héberge le bot/);
  assert.match(privacyHtml, /Participants à un concours/);
  assert.match(privacyHtml, /modérateurs et administrateurs Support/);
  assert.match(privacyHtml, /Accès Fondateur Premium/);
  assert.match(privacyHtml, /Accès Premium offerts/);
  assert.match(privacyHtml, /aucune donnée bancaire/);
  assert.equal(support.status, 200);
  const supportHtml = await support.text();
  assert.match(supportHtml, /Support et signalement/);
  assert.match(supportHtml, /Signaler un abus ou une violation/);
  assert.match(supportHtml, /Exercer mes droits/);
  assert.match(supportHtml, /\?support=technical/);
  assert.match(supportHtml, /\?support=abuse/);
  assert.match(supportHtml, /\?support=privacy/);
  assert.match(supportHtml, /\?support=security/);
  assert.equal(changelog.status, 200);
  const changelogHtml = await changelog.text();
  assert.match(changelogHtml, /La communauté au centre/);
  assert.match(changelogHtml, /Disponible/);
  assert.match(changelogHtml, /VERSION[\s\S]*?1\.5\.0/);
  assert.match(changelogHtml, /100 premiers utilisateurs Discord/);
  assert.match(changelogHtml, /26 août 2026/);
});

test("conserve les protections essentielles du panel", async () => {
  const [dashboard, server, css, robots, sitemap, nextConfig, viteConfig, prerenderManifest, releaseSource, releasePublic] = await Promise.all([
    readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/services/dashboardServer.js", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../public/sitemap.txt", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../dist/server/vinext-prerender.json", import.meta.url), "utf8"),
    readFile(new URL("../app/release-manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../public/release.json", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /TOUT SUPPRIMER/);
  assert.match(dashboard, /value="complete"/);
  assert.match(dashboard, /value="synchronize"/);
  assert.match(dashboard, /value="reset"/);
  assert.match(dashboard, /AUDIT DU SERVEUR/);
  assert.match(dashboard, /document\.visibilityState==="visible"/);
  assert.match(dashboard, /aria-modal="true"/);
  assert.match(dashboard, /rel="noreferrer"/);
  assert.match(dashboard, /Inviter FyxBot/);
  assert.match(dashboard, /scope=bot\+applications\.commands/);
  assert.match(dashboard, /permissions=581641939577974/);
  assert.match(dashboard, /securityScore/);
  assert.match(dashboard, /fyxbot-selected-guild/);
  assert.match(dashboard, /initialSelectedGuild/);
  assert.match(dashboard, /persistSelectedGuild\(n\.guild\.id\)/);
  assert.match(dashboard, /searchParams\.set\("guildId", guildId\)/);
  assert.match(dashboard, /bot: \{ \.\.\.current\.bot, online: false \}/);
  assert.match(dashboard, /CENTRE DE PILOTAGE/);
  assert.match(dashboard, /desktop-navigation/);
  assert.match(dashboard, /mobile-navigation/);
  assert.match(dashboard, /Tous les modules/);
  assert.match(dashboard, /mobilePrimaryNavigation/);
  assert.match(dashboard, /items: \["Vue d’ensemble", "Pilotage"\]/);
  assert.match(dashboard, /function PilotageDashboard/);
  assert.match(dashboard, /Parcours guidé/);
  assert.match(dashboard, /FYXJOURNEY · DIAGNOSTIC EXPLICABLE/);
  assert.match(dashboard, /Les trois prochaines actions/);
  assert.match(dashboard, /Pourquoi ce score/);
  assert.match(dashboard, /FYXVISION · PERSPECTIVE RÉELLE/);
  assert.match(dashboard, /Voir Discord avec vos permissions/);
  assert.match(dashboard, /Mon compte/);
  assert.match(dashboard, /permissions\/perspective/);
  assert.match(css, /\.role-perspective-workspace/);
  assert.match(server, /permissions\/perspective/);
  assert.match(dashboard, /data\.onboarding\.healthScore/);
  assert.match(dashboard, /data\.onboarding\.recommendations/);
  assert.match(dashboard, /Structure et permissions/);
  assert.match(dashboard, /Historique/);
  assert.match(dashboard, /item !== "Créateur" \|\| data\?\.creatorAccess/);
  assert.match(dashboard, /visibleNavigationGroups\.map/);
  assert.match(dashboard, /className="fyxstream-entry"/);
  assert.match(dashboard, /className=\{`mobile-fyxstream-card/);
  assert.match(dashboard, /FYXBOT_INTERFACE_MODE_KEY/);
  assert.match(dashboard, /FYXBOT_FAVORITES_KEY/);
  assert.match(dashboard, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(dashboard, /Rechercher dans FyxBot/);
  assert.match(dashboard, /Centre d’alertes/);
  assert.match(dashboard, /interfaceMode === "simple"/);
  assert.match(dashboard, /visibleFavorites\.map/);
  assert.match(dashboard, /panelAlerts\.map/);
  assert.match(css, /\.panel-search-dialog/);
  assert.match(css, /\.panel-alert-popover/);
  assert.match(css, /\.panel-favorites/);
  assert.match(css, /\.journey-summary/);
  assert.match(css, /\.journey-plan/);
  assert.match(css, /\.journey-diagnostics/);
  assert.match(dashboard, /RÈGLEMENT INTERACTIF/);
  assert.match(dashboard, /SALONS VOCAUX TEMPORAIRES/);
  assert.match(dashboard, /CONSTRUCTEUR DE MESSAGES/);
  assert.match(dashboard, /MESSAGES PUBLIÉS/);
  assert.match(dashboard, /Retrouver et modifier une publication/);
  assert.match(dashboard, /messagePublicationId/);
  assert.match(dashboard, /publicationId: form\.messagePublicationId/);
  assert.doesNotMatch(dashboard, /<option value="changelog">/);
  assert.match(dashboard, /Archives réouvrables/);
  assert.match(dashboard, /APERÇU DISCORD/);
  assert.match(dashboard, /DIAGNOSTIC EXPLICABLE/);
  assert.match(dashboard, /SURVEILLANCE AUTOMATIQUE/);
  assert.match(dashboard, /ACCÈS PREMIUM FYXBOT/);
  assert.match(dashboard, /100 premiers utilisateurs/);
  assert.match(dashboard, /Aucun moyen de paiement requis/);
  assert.match(dashboard, /premium\/founder/);
  assert.match(dashboard, /RÔLES DISCORD AUTOMATIQUES/);
  assert.match(dashboard, /premium\/roles\/configure/);
  assert.match(dashboard, /premium\/roles\/disable/);
  assert.match(dashboard, /premiumPaidRoleId/);
  assert.match(css, /\.premium-role-panel/);
  assert.match(server, /configurePremiumRoles/);
  assert.match(server, /disablePremiumRoles/);
  assert.match(dashboard, /ACCÈS PREMIUM OFFERTS/);
  assert.match(dashboard, /premium\/grants\/create/);
  assert.match(dashboard, /premium\/grants\/revoke/);
  assert.match(dashboard, /confirmation: "RETIRER"/);
  assert.match(css, /\.premium-grant-panel/);
  assert.match(server, /Gestion Premium réservée au propriétaire de FyxBot/);
  assert.match(server, /body\.confirmation !== 'ACCORDER'/);
  assert.match(server, /body\.confirmation !== 'RETIRER'/);
  assert.match(dashboard, /ÉQUIPE SUPPORT/);
  assert.match(dashboard, /CENTRE DE PILOTAGE PRIVÉ/);
  assert.match(dashboard, /Une vue claire pour décider, agir et faire grandir FyxBot/);
  assert.match(dashboard, /creator-section-nav/);
  assert.match(dashboard, /creator-danger-zone/);
  assert.match(css, /\.creator-command-center/);
  assert.match(css, /\.creator-server-progress/);
  assert.match(dashboard, /GESTION DES INSTALLATIONS/);
  assert.match(dashboard, /Retirer FyxBot d’un serveur/);
  assert.match(dashboard, /creator\/guilds\/leave/);
  assert.match(server, /url\.pathname === '\/api\/creator\/guilds\/leave'/);
  assert.match(server, /Retrait réservé au propriétaire de FyxBot/);
  const leaveGuildRoute = server.match(/url\.pathname === '\/api\/creator\/guilds\/leave'[\s\S]*?url\.pathname === '\/api\/premium\/grants\/create'/)?.[0] || "";
  assert.doesNotMatch(leaveGuildRoute, /requireRecentAuthentication\(session\)/);
  assert.match(css, /\.creator-removal-panel/);
  assert.match(dashboard, /support\/staff\/upsert/);
  assert.match(dashboard, /support\/staff\/remove/);
  assert.match(dashboard, /support\/close/);
  assert.match(dashboard, /Fermer la demande/);
  assert.match(dashboard, /window\.confirm\("Fermer cette demande/);
  assert.match(dashboard, /support\/reopen/);
  assert.match(dashboard, /support\/delete/);
  assert.match(dashboard, /Supprimer maintenant/);
  assert.match(dashboard, /window\.prompt\("Cette suppression est définitive/);
  assert.match(dashboard, /historique sera conservé pendant 90 jours/);
  assert.match(server, /url\.pathname === '\/api\/support\/close'/);
  assert.match(server, /url\.pathname === '\/api\/support\/reopen'/);
  assert.match(server, /url\.pathname === '\/api\/support\/delete'/);
  assert.match(server, /status: 'closed'/);
  assert.match(css, /\.support-close-action/);
  assert.match(dashboard, /fyxbot-pending-support-category/);
  assert.match(dashboard, /URLSearchParams\(window\.location\.search\)\.get\("support"\)/);
  assert.match(dashboard, /ACCORDER/);
  assert.match(dashboard, /État technique/);
  assert.match(dashboard, /pendingNewGuilds/);
  assert.match(dashboard, /OUTILS COMMUNAUTAIRES/);
  assert.match(dashboard, /ÉVÉNEMENT DISCORD/);
  assert.match(dashboard, /CONCOURS AUTOMATIQUE/);
  assert.match(dashboard, /\/community\/event/);
  assert.match(dashboard, /\/community\/giveaway/);
  assert.match(dashboard, /\/social\/sources/);
  assert.match(dashboard, /\/messages\/send/);
  assert.match(dashboard, /"X-FyxBot-CSRF": csrfToken/);
  assert.match(dashboard, /auth\/logout[\s\S]*?mutationHeaders\(csrfToken, false\)/);
  assert.match(dashboard, /CURRENT_RELEASE\.version/);
  assert.match(css, /\.discord-embed/);
  assert.match(css, /--accent:#ff5a2a/);
  assert.match(css, /@media\(max-width:650px\)/);
  assert.match(css, /mobile-nav-sheet/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(robots, /Sitemap: https:\/\/fyxbot-panel-production\.up\.railway\.app\/sitemap\.txt/);
  assert.match(sitemap, /^https:\/\/fyxbot-panel-production\.up\.railway\.app\/$/m);
  assert.match(sitemap, /^https:\/\/fyxbot-panel-production\.up\.railway\.app\/support$/m);
  assert.match(sitemap, /^https:\/\/fyxbot-panel-production\.up\.railway\.app\/changelog$/m);
  assert.match(nextConfig, /source: "\/api\/:path\*"[\s\S]*?no-store/);
  assert.match(nextConfig, /public, max-age=0, s-maxage=30, must-revalidate/);
  assert.match(nextConfig, /Last-Modified/);
  assert.match(nextConfig, /X-FyxBot-Version/);
  assert.match(nextConfig, /object-src 'none'/);
  assert.match(nextConfig, /!isProduction \? \["'unsafe-eval'"\] : \[\]/);
  assert.doesNotMatch(nextConfig, /connect-src 'self' http:\/\/localhost:3001[\s\S]*?https: ws: wss:/);
  assert.match(viteConfig, /prerender: \{ routes: "\*" \}/);
  const prerenderedRoutes = JSON.parse(prerenderManifest).routes;
  const homeRoute = prerenderedRoutes.find(route => route.route === "/");
  const changelogRoute = prerenderedRoutes.find(route => route.route === "/changelog");
  assert.equal(homeRoute?.status, "rendered");
  assert.equal(homeRoute?.revalidate, 30);
  assert.equal(homeRoute?.expire, 60);
  assert.equal(changelogRoute?.status, "rendered");
  assert.equal(changelogRoute?.revalidate, 30);
  assert.equal(changelogRoute?.expire, 60);
  const release = JSON.parse(releaseSource);
  assert.equal(release.currentVersion, "2.0.1");
  assert.equal(release.status, "available");
  assert.deepEqual(JSON.parse(releasePublic), release);
});

test("intègre le chat Twitch au rendu et à la navigation FyxBot", async () => {
  const [dashboard, streaming, css] = await Promise.all([
    readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/StreamingDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /StreamingDashboard/);
  assert.match(dashboard, /active === "FyxStream"/);
  assert.match(dashboard, /FyxStream: "🟣"/);
  assert.match(dashboard, /ESPACE STREAMING/);
  assert.match(streaming, /STREAMING FYXBOT/);
  assert.match(streaming, /Animez votre chat\. Gardez le contrôle\./);
  assert.match(streaming, /\/twitch\/status/);
  assert.match(streaming, /\/twitch\/auth\/start/);
  assert.match(streaming, /\/twitch\/disconnect/);
  assert.match(streaming, /\/twitch\/chat\/config/);
  assert.match(streaming, /\/twitch\/commands/);
  assert.match(streaming, /confirmation: "SUPPRIMER"/);
  assert.match(streaming, /confirmation: "DECONNECTER"/);
  assert.match(streaming, /AUCUNE CHAÎNE RELIÉE/);
  assert.match(streaming, /Aucune commande personnalisée/);
  assert.match(streaming, /Impossible de charger Twitch/);
  assert.match(streaming, /role="tablist"/);
  assert.match(streaming, /role="status"/);
  assert.match(streaming, /role="alert"/);
  assert.match(streaming, /role="switch"/);
  assert.match(streaming, /aria-checked=\{twitch\.chatEnabled\}/);
  assert.match(streaming, /role="alertdialog"/);
  assert.match(streaming, /aria-modal="true"/);
  assert.match(streaming, /Confirmer la suppression/);
  assert.match(streaming, /StreamElements/);
  assert.match(streaming, /Indicateurs FyxStream/);
  assert.match(streaming, /Commandes Twitch prêtes à l’emploi/);
  assert.match(streaming, /Modération Twitch récente/);
  assert.match(streaming, /Reconnecter Twitch/);
  assert.match(streaming, /TWITCH_OAUTH_ERRORS/);
  assert.match(streaming, /sans conserver le motif saisi dans le chat/);
  assert.match(streaming, /!timeout @pseudo \[secondes\] \[raison\]/);
  assert.match(streaming, /Autoriser la modération/);
  assert.match(streaming, /enabledCommandCount/);
  assert.match(streaming, /totalCommandUses/);
  assert.match(streaming, /activeProtectionCount/);
  assert.match(css, /\.streaming-insights/);
  assert.match(css, /\.streaming-auth-alert/);
  assert.match(css, /\.streaming-history/);
  assert.match(css, /\.streaming-workspace/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
