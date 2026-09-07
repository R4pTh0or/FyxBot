/* eslint-disable @next/next/no-html-link-for-pages -- Vinext beta déclenche une erreur de préchargement RSC sur cette route statique. */
import type { Metadata } from "next";
import Image from "next/image";
import releaseManifest from "../release-manifest.json";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Changelog FyxBot — Nouveautés et améliorations",
  description: "Suivez les nouvelles commandes, améliorations du panel et corrections de FyxBot.",
  alternates: { canonical: "/changelog" },
};

export default function ChangelogPage() {
  return <main className="changelog-shell">
    <header className="legal-header">
      <a href="/" className="legal-brand"><Image className="brand-logo" src="/brand/fyxbot-logo-symbol.svg" alt="" width={40} height={40}/><strong>FYXBOT</strong></a>
      <a href="/">Retour au site</a>
    </header>
    <section className="changelog-hero">
      <p className="eyebrow">ÉVOLUTION DE FYXBOT</p>
      <h1>Changelog</h1>
      <p>Les nouveautés, améliorations et corrections importantes de FyxBot, présentées clairement version par version.</p>
    </section>
    <section className="release-list" aria-label="Versions de FyxBot">
      {releaseManifest.releases.map(release => <article className="release" key={release.version}>
        <div className="release-meta"><span>VERSION {release.version}</span><b className={release.status === "available" ? "available" : "testing"}>{release.statusLabel}</b><time dateTime={release.releasedAt}>{release.dateLabel}</time></div>
        <div className="release-content"><h2>{release.title}</h2><p>{release.intro}</p><div className="release-changes">{release.changes.map(([icon, title, description]) => <div key={title}><span aria-hidden="true">{icon}</span><div><h3>{title}</h3><p>{description}</p></div></div>)}</div></div>
      </article>)}
    </section>
  </main>;
}
