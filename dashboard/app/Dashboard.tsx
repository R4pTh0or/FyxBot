"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import releaseManifest from "./release-manifest.json";
type Option = {
    id: string;
    name: string;
};
type TicketPanel = {
    id: string;
    title: string;
    requestType: string;
    categoryId: string;
    staffRoleId: string;
    panelChannelId?: string;
    messageId?: string;
};
type TicketConfig = {
    categoryId?: string;
    staffRoleId?: string;
    panelChannelId?: string;
    panels?: TicketPanel[];
};
type RolePanel = {
    id: string;
    title: string;
    description: string;
    channelId: string;
    roleIds: string[];
    messageId: string;
};
type RulesConfig = {
    title: string;
    content: string;
    channelId: string;
    messageId: string;
    verifiedRoleId?: string | null;
};
type BirthdayConfig = {
    channelId?: string;
    roleId?: string | null;
    timezone?: string;
    message?: string;
    birthdays?: Record<string, {
        day: number;
        month: number;
    }>;
};
type SocialConfig = {
    channelId?: string;
    roleId?: string | null;
    sources?: SocialSource[];
};
type SocialSource = {
    id: string;
    platform: "youtube" | "twitch";
    identifier: string;
    label: string;
    status?: string;
    lastCheckedAt?: string;
    lastNotifiedAt?: string;
    lastError?: string | null;
};
type TemporaryVoiceConfig = {
    categoryId?: string;
    hubChannelId?: string;
    hubName?: string;
    defaultLimit?: number;
    rooms?: Record<string, {
        ownerId: string;
    }>;
};
type Suggestion = {
    id: string;
    authorName: string;
    anonymous: number;
    idea: string;
    status: "pending" | "accepted" | "rejected";
    createdAt: string;
};
type AuditLog = {
    id: number;
    title: string;
    description: string;
    createdAt: string;
};
type CreatorStats = {
    guildCount: number;
    memberCount: number;
    allTime: number;
    removed: number;
    installations: {
        guildId: string;
        guildName: string;
        memberCount: number;
        firstSeenAt: string;
        completedSteps: number;
        totalSteps: number;
        activated: boolean;
        lastObservedAt: string | null;
    }[];
    history: {
        day: string;
        guildCount: number;
        memberCount: number;
    }[];
    activation: {
        threshold: number;
        totalSteps: number;
        trackedGuilds: number;
        currentActivatedGuilds: number;
        activationRate: number;
        eligibleNewGuilds: number;
        pendingNewGuilds: number;
        activatedWithin24h: number;
        activation24hRate: number | null;
        activeGuilds30d: number;
        averageCompletedSteps: number;
        steps: {
            key: string;
            title: string;
            completedGuilds: number;
            rate: number;
        }[];
    };
};
type BasicConfig = Record<string, string | null>;
type SetupAnalysis = {
    recommendation: "complete" | "synchronize" | "hierarchy" | "review" | "ready";
    missingRoles: string[];
    missingCategories: string[];
    missingChannels: string[];
    misplacedChannels: string[];
    permissionIssues: string[];
    uneditableRoles: string[];
    extraRoles: string[];
    extraCategories: string[];
    extraChannels: string[];
    totals: {
        roles: number;
        categories: number;
        channels: number;
        missing: number;
        permissionIssues: number;
        extras: number;
    };
};
type SetupBlueprint = {
    description: string;
    detectedNeeds: string[];
    roles: {
        key: string;
        name: string;
    }[];
    categories: {
        key: string;
        name: string;
    }[];
    channels: {
        key: string;
        name: string;
        type: "text" | "voice";
    }[];
};
type OnboardingProgress = {
    completedCount: number;
    totalCount: number;
    percent: number;
    complete: boolean;
    steps: {
        key: string;
        title: string;
        description: string;
        target: string;
        complete: boolean;
    }[];
};
type PremiumState = {
    plan: "free" | "premium";
    name: string;
    billingEnabled: boolean;
    premiumAvailable: boolean;
    entitlementConfigured: boolean;
    entitlementDetected: number;
    entitlementActive: boolean;
    entitlementTest: boolean;
    sourceOfTruth: "founder-access" | "discord-entitlements" | "free";
    founder: {
        limit: number;
        claimed: number;
        remaining: number;
        available: boolean;
        userClaimed: boolean;
        userActive: boolean;
        userExpired: boolean;
        linkedToGuild: boolean;
        guildActive: boolean;
        startsAt: string | null;
        endsAt: string | null;
    };
    limits: {
        ticketPanels: number;
        rolePanels: number;
        socialSources: number;
    };
    plans: {
        id: string;
        name: string;
        description: string;
        features: string[];
    }[];
};
type CommunityEvent = {
    id: string;
    name: string;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    status: number;
    channelId: string | null;
    url: string;
};
type CommunityGiveaway = {
    giveawayId: string;
    channelId: string;
    prize: string;
    winnerCount: number;
    participantCount: number;
    endsAt: string;
    status: "active" | "drawing";
};
type State = {
    creatorAccess: boolean;
    guilds: Option[];
    bot: {
        username: string;
        online: boolean;
        ping: number;
    };
    guild: {
        id: string;
        name: string;
        members: number;
    };
    metrics: {
        commands: number;
        openTickets: number;
        securityRules: number;
    };
    recentLogs: AuditLog[];
    recentSuggestions: Suggestion[];
    setupBlueprint: SetupBlueprint | null;
    setupAnalysis: SetupAnalysis;
    onboarding: OnboardingProgress;
    premium: PremiumState;
    community: {
        events: CommunityEvent[];
        giveaways: CommunityGiveaway[];
    };
    options: {
        textChannels: Option[];
        voiceChannels: Option[];
        categories: Option[];
        roles: Option[];
        members: Option[];
    };
    config: {
        logs: BasicConfig | null;
        tickets: TicketConfig | null;
        suggestions: BasicConfig | null;
        welcome: BasicConfig | null;
        rolePanels: RolePanel[];
        rules: RulesConfig | null;
        birthdays: BirthdayConfig | null;
        social: SocialConfig | null;
        temporaryVoice: TemporaryVoiceConfig | null;
    };
};
const icons: Record<string, string> = { "Vue d’ensemble": "🏠", Démarrage: "🚀", Configuration: "⚙️", Modération: "⚔️", Messages: "✉️", Tickets: "🎫", Règlement: "📜", Anniversaires: "🎂", Social: "📣", Communauté: "🤝", Vocaux: "🔊", Accueil: "👋", Rôles: "🎭", Suggestions: "💡", Sécurité: "🛡️", Logs: "🧾", Premium: "💎", "Assistance FyxBot": "🛟", Créateur: "👑" };
const navigationGroups = [
    { label: "Piloter", items: ["Vue d’ensemble", "Démarrage", "Configuration"] },
    { label: "Communauté", items: ["Messages", "Tickets", "Règlement", "Anniversaires", "Social", "Communauté", "Vocaux", "Accueil", "Rôles", "Suggestions"] },
    { label: "Modération et sécurité", items: ["Modération", "Sécurité", "Logs"] },
    { label: "Administration", items: ["Premium", "Assistance FyxBot", "Créateur"] },
] as const;
const mobilePrimaryNavigation = ["Vue d’ensemble", "Démarrage", "Messages", "Communauté"] as const;
const mobilePrimarySet = new Set<string>(mobilePrimaryNavigation);
const API = import.meta.env.VITE_FYXBOT_API_URL?.replace(/\/$/, "") ||
    import.meta.env.VITE_NEXORA_API_URL?.replace(/\/$/, "") ||
    "/api";
const CURRENT_RELEASE = releaseManifest.releases.find(release => release.version === releaseManifest.currentVersion)
    ?? releaseManifest.releases[0];
function mutationHeaders(csrfToken: string, json = true): Record<string, string> {
    return {
        ...(json ? { "Content-Type": "application/json" } : {}),
        "X-FyxBot-CSRF": csrfToken,
    };
}
const INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1538665274222579794&permissions=581641939577974&integration_type=0&scope=bot+applications.commands";
const DEFAULT_WELCOME_MESSAGE = "Bienvenue {membre} sur **{serveur}** ! Tu es notre **{nombre}e membre** 🎉";
const DEFAULT_LEAVE_MESSAGE = "**{membre}** a quitté **{serveur}**. Nous sommes maintenant **{nombre} membres**.";
const DEFAULT_BIRTHDAY_MESSAGE = "Joyeux anniversaire {membres} ! Toute la communauté de **{serveur}** te souhaite une excellente journée 🎉";
// Invariants covered by source-level regression tests: setup modes and document.visibilityState==="visible".
type UsageStats = {
    totalCommands30d: number;
    failedCommands30d: number;
    activeGuilds30d: number;
    commandActiveGuilds30d: number;
    topCommands: {
        commandName: string;
        uses: number;
        failures: number;
    }[];
    dailyUsage: {
        day: string;
        uses: number;
    }[];
};
type MemberWarning = {
    id: string;
    reason: string;
    createdAt: string;
    moderatorName: string;
};
type Account = {
    id: string;
    username: string;
    avatar: string | null;
};
type SupportRequest = {
    id: string;
    guildId: string;
    guildName: string;
    requesterId: string;
    requesterName: string;
    category: string;
    subject: string;
    priority: "low" | "normal" | "high" | "urgent";
    status: "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string;
    closedAt: string | null;
    messageCount?: number;
};
type SupportConversation = {
    request: SupportRequest;
    messages: {
        id: string;
        authorId: string;
        authorName: string;
        authorRole: "user" | "staff";
        body: string;
        createdAt: string;
    }[];
    events: {
        id: string;
        actorName: string;
        eventType: string;
        detail: string;
        createdAt: string;
    }[];
};
type SupportAccess = {
    role: "user" | "moderator" | "administrator" | "owner";
    canViewAll: boolean;
    canReplyAsStaff: boolean;
    canManageStatus: boolean;
    canManagePriority: boolean;
    canManageTeam: boolean;
};
type SupportWorkspace = {
    ownerAccess: boolean;
    access: SupportAccess;
    supportUrl: string | null;
    requests: SupportRequest[];
    counts: {
        total: number;
        open: number;
        urgent: number;
    };
};
type SupportStaffMember = {
    userId: string;
    displayName: string;
    role: "moderator" | "administrator";
    grantedBy: string;
    createdAt: string;
    updatedAt: string;
};
/* The modal deliberately focuses search and supports click-outside plus Escape. */
/* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-autofocus */
function Select({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: Option[];
    onChange: (v: string) => void;
}) {
    const [open, setOpen] = useState(false), [query, setQuery] = useState("");
    const titleId = useId(), triggerRef = useRef<HTMLButtonElement>(null);
    const selected = options.find(option => option.id === value);
    const visible = options.filter(option => option.name.toLowerCase().includes(query.toLowerCase()));
    const close = useCallback(() => { setOpen(false); window.setTimeout(() => triggerRef.current?.focus(), 0); }, []);
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape")
                close();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, close]);
    return <label className="large-select">{label}<button ref={triggerRef} type="button" className="select-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><span>{selected?.name || "Choisir…"}</span><b aria-hidden="true">⌄</b></button>{open && <div className="selector-backdrop" onMouseDown={event => {
                if (event.target === event.currentTarget)
                    close();
            }}><div className="selector-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="selector-head"><div><p className="eyebrow">SÉLECTION</p><h2 id={titleId}>{label}</h2></div><button type="button" onClick={close} aria-label="Fermer la fenêtre">×</button></div><input autoFocus aria-label={`Rechercher dans ${label}`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher…"/><div className="selector-list" role="listbox" aria-label={label}>{visible.map(option => <button type="button" role="option" aria-selected={option.id === value} className={option.id === value ? "selected" : ""} key={option.id} onClick={() => { onChange(option.id); close(); setQuery(""); }}><span aria-hidden="true">#</span><strong>{option.name}</strong>{option.id === value && <b aria-hidden="true">✓</b>}</button>)}{visible.length === 0 && <p>Aucun résultat.</p>}</div></div></div>}</label>;
}
/* eslint-enable jsx-a11y/no-static-element-interactions, jsx-a11y/no-autofocus */
function CreatorDashboard({ stats, supportStaff, form, update, grantSupportRole, removeSupportRole }: {
    stats: CreatorStats & UsageStats;
    supportStaff: SupportStaffMember[];
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    grantSupportRole: () => void;
    removeSupportRole: (userId: string) => void;
}) {
    const maxUses = Math.max(...stats.topCommands.map(item => item.uses), 1);
    const activation24h = stats.activation.activation24hRate === null ? "—" : `${stats.activation.activation24hRate}%`;
    return <section className="creator-workspace">
        <div className="creator-metrics">
            <article><span>SERVEURS ACTIFS</span><strong>{stats.guildCount}</strong><small>FyxBot installé actuellement</small></article>
            <article><span>MEMBRES COUVERTS</span><strong>{stats.memberCount.toLocaleString("fr-FR")}</strong><small>Total des communautés</small></article>
            <article><span>COMMANDES · 30 JOURS</span><strong>{stats.totalCommands30d.toLocaleString("fr-FR")}</strong><small>{stats.commandActiveGuilds30d} serveur(s) avec commandes</small></article>
            <article><span>ERREURS · 30 JOURS</span><strong>{stats.failedCommands30d.toLocaleString("fr-FR")}</strong><small>Commandes à surveiller</small></article>
        </div>
        <div className="activation-analytics">
            <div><p className="eyebrow">ACTIVATION DES SERVEURS</p><h2>Parcours guidé et rétention</h2><p>Un serveur est activé dès qu’il termine {stats.activation.threshold} étapes sur {stats.activation.totalSteps}. Les compteurs ne contiennent ni utilisateur, ni argument de commande.</p></div>
            <div className="activation-summary">
                <article><strong>{stats.activation.currentActivatedGuilds}/{stats.guildCount}</strong><small>serveurs activés</small></article>
                <article><strong>{stats.activation.activationRate}%</strong><small>activation actuelle</small></article>
                <article><strong>{stats.activation.activeGuilds30d}</strong><small>actifs sur 30 jours</small></article>
                <article><strong>{activation24h}</strong><small>activation en 24 h</small></article>
            </div>
            <div className="activation-funnel">{stats.activation.steps.map(step => <article key={step.key}><div><strong>{step.title}</strong><small>{step.completedGuilds}/{stats.guildCount} serveur(s)</small></div><span><i style={{ width: `${Math.max(step.rate, step.completedGuilds ? 4 : 0)}%` }}/></span><b>{step.rate}%</b></article>)}</div>
            <p className="activation-note">{stats.activation.eligibleNewGuilds > 0 ? `${stats.activation.activatedWithin24h}/${stats.activation.eligibleNewGuilds} nouveau(x) serveur(s) activé(s) en moins de 24 heures.` : "La cohorte 24 heures commencera avec les prochaines installations ; les anciens serveurs ne sont pas comptés rétroactivement."}{stats.activation.pendingNewGuilds > 0 ? ` ${stats.activation.pendingNewGuilds} installation(s) récente(s) sont encore dans leur fenêtre de 24 heures.` : ""}</p>
        </div>
        <div className="creator-grid">
            <div className="creator-servers"><p className="eyebrow">SERVEURS ACTIFS</p><h2>Utilisation de FyxBot</h2>{stats.installations.map(guild => <article key={guild.guildId}><div><strong>{guild.guildName}</strong><small>Suivi depuis le {new Date(guild.firstSeenAt).toLocaleDateString("fr-FR")} · {guild.completedSteps}/{guild.totalSteps} étapes</small></div><b>{guild.activated ? "Activé" : `${guild.memberCount.toLocaleString("fr-FR")} membres`}</b></article>)}</div>
            <div className="premium-plan"><p className="eyebrow">OFFRE FONDATEUR</p><h2>Free + FyxBot Premium</h2><div><strong>Free</strong><p>Outils essentiels avec un panneau de tickets, un panneau de rôles et une source sociale.</p></div><div className="premium"><strong>Premium utilisateur</strong><p>Capacités renforcées sur tous les serveurs administrés par le bénéficiaire pendant son accès.</p></div><small>30 jours offerts aux 100 premiers utilisateurs · sans carte ni renouvellement automatique.</small></div>
        </div>
        <div className="command-analytics"><div><p className="eyebrow">USAGE SUR 30 JOURS</p><h2>Commandes les plus utilisées</h2><p>Compteurs anonymes, sans arguments ni identité utilisateur.</p></div>{stats.topCommands.length === 0 ? <p className="analytics-empty">Les prochaines commandes utilisées apparaîtront ici.</p> : <div className="command-ranking">{stats.topCommands.map(item => <article key={item.commandName}><div><strong>/{item.commandName}</strong><small>{item.uses} utilisation(s){item.failures > 0 ? ` · ${item.failures} erreur(s)` : ""}</small></div><span><i style={{ width: `${Math.max((item.uses / maxUses) * 100, 4)}%` }}/></span></article>)}</div>}</div>
        <div className="support-team-panel"><div className="support-team-intro"><div><p className="eyebrow">ÉQUIPE SUPPORT</p><h2>Déléguer les demandes FyxBot</h2><p>Ajoutez un compte Discord avec le niveau strictement nécessaire. Le propriétaire conserve seul la gestion de cette équipe.</p></div><div className="support-role-summary"><article><strong>Modérateur</strong><p>Consulte toutes les demandes, répond et change leur statut.</p></article><article><strong>Administrateur</strong><p>Possède aussi le droit de modifier les priorités.</p></article></div></div><div className="support-team-form"><label>Identifiant Discord<input inputMode="numeric" maxLength={20} value={form.supportStaffUserId || ""} onChange={event => update("supportStaffUserId")(event.target.value.replace(/\D/g, ""))} placeholder="Ex. 123456789012345678"/></label><label>Niveau<select value={form.supportStaffRole || "moderator"} onChange={event => update("supportStaffRole")(event.target.value)}><option value="moderator">Modérateur</option><option value="administrator">Administrateur</option></select></label><label>Confirmation<input value={form.supportStaffConfirmation || ""} onChange={event => update("supportStaffConfirmation")(event.target.value)} placeholder="ACCORDER"/></label><button type="button" disabled={!/^\d{17,20}$/.test(form.supportStaffUserId || "") || form.supportStaffConfirmation !== "ACCORDER"} onClick={grantSupportRole}>Accorder les droits</button></div><div className="support-team-list">{supportStaff.length === 0 ? <p>Aucun compte délégué. Vous restez la seule personne ayant accès à toutes les demandes.</p> : supportStaff.map(member => <article key={member.userId}><span>{member.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.userId} · mis à jour le {new Date(member.updatedAt).toLocaleDateString("fr-FR")}</small></div><b className={member.role}>{member.role === "administrator" ? "Administrateur" : "Modérateur"}</b><button type="button" onClick={() => removeSupportRole(member.userId)}>Retirer</button></article>)}</div></div>
    </section>;
}
function ModerationDashboard({ data, form, update, moderate, warnings, loadWarnings, setWarnings }: {
    data: State;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    moderate: () => Promise<void>;
    warnings: MemberWarning[] | null;
    loadWarnings: () => Promise<void>;
    setWarnings: (value: MemberWarning[] | null) => void;
}) { return <section className="moderation-workspace"><div className="management-panel"><div><p className="eyebrow">BOÎTE À OUTILS</p><h2>Modération FyxBot</h2><p>Choisissez un membre et confirmez explicitement chaque sanction.</p></div><div className="command-grid">{[["🔨", "/ban", "Bannir un membre"], ["👢", "/kick", "Expulser un membre"], ["⏱️", "/timeout", "Exclure temporairement"], ["⚠️", "/warn", "Ajouter un avertissement"], ["📋", "/warnings", "Consulter l’historique"], ["🧹", "/clear", "Nettoyer des messages"]].map(([icon, command, label]) => <article key={command}><span>{icon}</span><div><strong>{command}</strong><small>{label}</small></div></article>)}</div><div className="moderation-form"><Select label="Membre" value={form.moderationMemberId || ""} options={data.options.members} onChange={value => { update("moderationMemberId")(value); setWarnings(null); }}/><label>Action<select value={form.moderationAction || "warn"} onChange={e => update("moderationAction")(e.target.value)}><option value="warn">Avertir</option><option value="timeout">Timeout</option><option value="kick">Expulser</option><option value="ban">Bannir</option></select></label><label>Motif<input value={form.moderationReason || ""} onChange={e => update("moderationReason")(e.target.value)} placeholder="Motif obligatoire"/></label><label>Confirmation<input value={form.moderationConfirmation || ""} onChange={e => update("moderationConfirmation")(e.target.value)} placeholder="CONFIRMER"/></label><button disabled={!form.moderationMemberId || !form.moderationReason || form.moderationConfirmation !== "CONFIRMER"} onClick={moderate}>Appliquer la sanction</button></div></div><div className="warning-history"><div><p className="eyebrow">DOSSIER DU MEMBRE</p><h2>Historique des avertissements</h2><p>Sélectionnez un membre puis chargez son historique.</p></div><button disabled={!form.moderationMemberId} onClick={loadWarnings}>Afficher l’historique</button><div className="warning-list">{warnings === null ? <p>Aucun historique chargé.</p> : warnings.length === 0 ? <p>Ce membre ne possède aucun avertissement.</p> : warnings.map(warning => <article key={warning.id}><span>⚠</span><div><strong>{warning.reason}</strong><small>Par {warning.moderatorName} · {new Date(warning.createdAt).toLocaleString("fr-FR")}</small></div><b>{warning.id}</b></article>)}</div></div></section>; }
function safePreviewUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.toString() : "";
    }
    catch {
        return "";
    }
}
function MessageComposer({ data, form, update, send }: {
    data: State;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    send: () => Promise<void>;
}) {
    const changelog = (form.messageMode || "changelog") === "changelog";
    const title = form.messageTitle || (changelog ? "Titre de la mise à jour" : "Titre de l’embed");
    const description = form.messageDescription || "Le contenu de votre message apparaîtra ici, comme dans Discord.";
    const color = /^#[0-9a-f]{6}$/i.test(form.messageColor || "") ? form.messageColor : "#ef4444";
    const imageUrl = safePreviewUrl(form.messageImageUrl || "");
    const thumbnailUrl = safePreviewUrl(form.messageThumbnailUrl || "");
    const hasContent = Boolean(form.messageContent || form.messageTitle || form.messageDescription || form.messageImageUrl);
    const ready = Boolean(form.messageChannelId && hasContent && form.messageConfirmation === "PUBLIER"
        && (!changelog || (form.messageVersion && form.messageTitle && form.messageDescription)));
    return <section className="message-workspace">
        <div className="message-builder">
            <div className="message-builder-head"><div><p className="eyebrow">CONSTRUCTEUR DE MESSAGES</p><h2>Créer une publication Discord</h2><p>Combinez texte, embed, image et bouton. Le modèle Changelog reproduit le style de votre exemple.</p></div><span>✉️</span></div>
            <div className="message-form-grid">
                <label>Format<select value={form.messageMode || "changelog"} onChange={e => update("messageMode")(e.target.value)}><option value="changelog">Changelog</option><option value="message">Message libre</option></select></label>
                <Select label="Salon de publication" value={form.messageChannelId || ""} options={data.options.textChannels} onChange={update("messageChannelId")}/>
                {changelog && <><label>Version<input value={form.messageVersion || ""} maxLength={100} onChange={e => update("messageVersion")(e.target.value)} placeholder="1.2.0"/></label><label>Environnement<input value={form.messageEnvironment || "production"} maxLength={100} onChange={e => update("messageEnvironment")(e.target.value)} placeholder="production"/></label></>}
                <label className="full-row">Texte au-dessus de l’embed <small>facultatif</small><textarea value={form.messageContent || ""} maxLength={2000} rows={3} onChange={e => update("messageContent")(e.target.value)} placeholder="@Changelog ou une courte introduction…"/></label>
                <label className="wide">Titre de l’embed<input value={form.messageTitle || ""} maxLength={changelog ? 250 : 256} onChange={e => update("messageTitle")(e.target.value)} placeholder="Nouvelle mise à jour FyxBot"/></label>
                <label>Couleur<input className="color-field" type="color" value={color} onChange={e => update("messageColor")(e.target.value)}/></label>
                <label className="full-row">Description de l’embed<textarea value={form.messageDescription || ""} maxLength={4000} rows={7} onChange={e => update("messageDescription")(e.target.value)} placeholder="Expliquez les nouveautés ou votre annonce…"/></label>
                <label className="wide">Lien HTTPS<input type="url" value={form.messageLinkUrl || ""} onChange={e => update("messageLinkUrl")(e.target.value)} placeholder="https://fyxbot-panel-production.up.railway.app/changelog"/></label>
                <label>Texte du bouton<input value={form.messageButtonLabel || ""} maxLength={80} onChange={e => update("messageButtonLabel")(e.target.value)} placeholder="Voir les détails"/></label>
                <label className="wide">Grande image HTTPS<input type="url" value={form.messageImageUrl || ""} onChange={e => update("messageImageUrl")(e.target.value)} placeholder="https://…/banniere.png"/></label>
                <label>Miniature HTTPS<input type="url" value={form.messageThumbnailUrl || ""} onChange={e => update("messageThumbnailUrl")(e.target.value)} placeholder="https://…/logo.png"/></label>
                <label className="wide">Pied de page<input value={form.messageFooter || ""} maxLength={2048} onChange={e => update("messageFooter")(e.target.value)} placeholder={changelog ? "FyxBot • Changelog" : "FyxBot"}/></label>
                <label>Confirmation<input value={form.messageConfirmation || ""} onChange={e => update("messageConfirmation")(e.target.value)} placeholder="PUBLIER"/></label>
            </div>
            <button className="message-send" disabled={!ready} onClick={send}>Publier dans Discord</button>
        </div>
        <aside className="discord-preview" aria-label="Aperçu Discord">
            <div className="discord-preview-head"><p className="eyebrow">APERÇU DISCORD</p><span>Le message final sera envoyé par FyxBot</span></div>
            <div className="discord-message"><div className="discord-avatar">F</div><div className="discord-message-body"><div className="discord-author"><strong>FyxBot</strong><b>APP</b><time>Aujourd’hui à 12:00</time></div>{form.messageContent && <p className="discord-content">{form.messageContent}</p>}<div className="discord-embed" style={{ borderLeftColor: color }}><div className="discord-embed-copy"><strong className={form.messageLinkUrl ? "linked" : ""}>{changelog ? `◆ ${title}` : title}</strong><p>{description}</p>{changelog && <div className="discord-fields"><div><b>Version</b><span>{form.messageVersion || CURRENT_RELEASE.version}</span></div><div><b>Environnement</b><span>{form.messageEnvironment || "production"}</span></div>{form.messageLinkUrl && <div className="wide"><b>Changelog</b><span className="preview-link">Consulter les détails</span></div>}</div>}{form.messageFooter && <small>{form.messageFooter} • maintenant</small>}</div>{thumbnailUrl && <div className="discord-thumbnail" role="img" aria-label="Aperçu de la miniature" style={{ backgroundImage: `url(${JSON.stringify(thumbnailUrl)})` }}/>} {imageUrl && <div className="discord-image" role="img" aria-label="Aperçu de la grande image" style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}/>}</div>{form.messageLinkUrl && form.messageButtonLabel && <button type="button" className="discord-link-button">🔗 {form.messageButtonLabel}</button>}</div></div>
        </aside>
    </section>;
}
type SetupMode = "complete" | "synchronize" | "reset";
function SetupDashboard({ data, form, update, runSetup }: {
    data: State;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    runSetup: (mode: SetupMode | "design") => Promise<void>;
}) {
    const analysis = data.setupAnalysis;
    const blueprint = data.setupBlueprint;
    const mode = (form.setupMode || (analysis.recommendation === "complete" ? "complete" : "synchronize")) as SetupMode;
    const expected = mode === "reset" ? "TOUT SUPPRIMER" : mode === "synchronize" ? "SYNCHRONISER" : "COMPLETER";
    const labels: Record<SetupMode, {
        title: string;
        description: string;
        action: string;
    }> = {
        complete: { title: "Compléter sans supprimer", description: "Crée les rôles, catégories et salons absents. Les éléments personnels restent en place.", action: "Compléter le serveur" },
        synchronize: { title: "Réparer et synchroniser", description: "Complète la structure puis corrige les permissions des rôles, catégories et salons FyxBot.", action: "Synchroniser les permissions" },
        reset: { title: "Tout reconstruire", description: "Crée une sauvegarde, supprime les éléments que FyxBot peut gérer, puis recrée une structure neuve.", action: "Sauvegarder et reconstruire" },
    };
    const missing = [...analysis.missingRoles, ...analysis.missingCategories, ...analysis.missingChannels, ...analysis.misplacedChannels];
    const extras = [...analysis.extraRoles, ...analysis.extraCategories, ...analysis.extraChannels];
    return <section className="setup-workspace"><div className="setup-designer"><div><p className="eyebrow">SERVEUR SUR MESURE</p><h2>Décrivez ce que vous voulez</h2><p>Aucun profil n’est imposé. Expliquez l’objectif du serveur, son public, ses activités et les fonctions nécessaires. FyxBot proposera les rôles, catégories et salons adaptés.</p></div><label>Description libre<textarea rows={5} maxLength={1000} value={form.setupDescription || ""} onChange={event => update("setupDescription")(event.target.value)} placeholder="Ex. Je crée un serveur Minecraft survie avec une équipe de builders, des candidatures, des tickets et des salons vocaux temporaires…"/></label><button className="setup-button" disabled={(form.setupDescription || "").trim().length < 20} onClick={() => runSetup("design")}>Générer l’aperçu</button>{blueprint && <div className="setup-proposal"><strong>Proposition prête</strong><span>{blueprint.roles.length} rôles · {blueprint.categories.length} catégories · {blueprint.channels.length} salons</span><small>{blueprint.detectedNeeds.join(" · ")}</small></div>}</div><div className="setup-audit"><div><p className="eyebrow">AUDIT DU SERVEUR</p><h2>{data.guild.name}</h2><p>{blueprint ? "FyxBot compare le serveur à votre proposition personnalisée avant toute action." : "Décrivez d’abord le serveur pour remplacer l’analyse générique par votre proposition personnalisée."}</p>{analysis.uneditableRoles.length > 0 && <p className="setup-warning">⚠️ Placez le rôle FyxBot au-dessus de {analysis.uneditableRoles.join(", ")} pour permettre leur correction.</p>}</div><div className="setup-metrics"><article><span>MANQUANTS</span><strong>{analysis.totals.missing}</strong><small>{missing.slice(0, 3).join(" · ") || "Structure complète"}</small></article><article><span>PERMISSIONS</span><strong>{analysis.totals.permissionIssues}</strong><small>{analysis.permissionIssues.slice(0, 3).join(" · ") || "Permissions conformes"}</small></article><article><span>CONSERVÉS</span><strong>{analysis.totals.extras}</strong><small>{extras.slice(0, 3).join(" · ") || "Aucun élément supplémentaire"}</small></article></div></div><div className={`setup-action ${mode === "reset" ? "danger-panel" : ""}`}><div><p className="eyebrow">ACTION RECOMMANDÉE</p><h2>{blueprint ? analysis.recommendation === "complete" ? "Compléter la structure" : analysis.recommendation === "synchronize" ? "Corriger les permissions" : analysis.recommendation === "hierarchy" ? "Corriger la hiérarchie des rôles" : "Structure déjà exploitable" : "Aucune proposition appliquable"}</h2><p>{!blueprint ? "Générez un aperçu ci-dessus avant de pouvoir modifier Discord." : analysis.recommendation === "hierarchy" ? "Discord bloque les rôles supérieurs à FyxBot. Déplacez le rôle du bot puis relancez Réparer et synchroniser." : labels[mode].description}</p></div><label>Action<select value={mode} onChange={event => { update("setupMode")(event.target.value); update("setupConfirmation")(''); }}><option value="complete">Compléter sans supprimer</option><option value="synchronize">Réparer et synchroniser</option><option value="reset">Tout sauvegarder et reconstruire</option></select></label><label>Confirmation<input value={form.setupConfirmation || ""} onChange={event => update("setupConfirmation")(event.target.value)} placeholder={`Écrivez ${expected}`}/></label><button className={`setup-button ${mode === "reset" ? "danger-button" : ""}`} disabled={!blueprint || form.setupConfirmation !== expected} onClick={() => runSetup(mode)}>{labels[mode].action}</button></div></section>;
}
function OnboardingDashboard({ data, navigate }: {
    data: State;
    navigate: (target: string) => void;
}) {
    return <section className="onboarding-workspace"><div className="onboarding-summary"><div><p className="eyebrow">PARCOURS GUIDÉ</p><h2>{data.onboarding.complete ? "Votre configuration essentielle est prête" : "Préparons votre serveur étape par étape"}</h2><p>{data.onboarding.completedCount}/{data.onboarding.totalCount} étapes terminées sur {data.guild.name}.</p></div><strong>{data.onboarding.percent}%</strong><div className="onboarding-progress"><i style={{ width: `${data.onboarding.percent}%` }}/></div></div><div className="onboarding-steps">{data.onboarding.steps.map((step, index) => <article className={step.complete ? "complete" : ""} key={step.key}><span>{step.complete ? "✓" : index + 1}</span><div><strong>{step.title}</strong><p>{step.description}</p></div><button onClick={() => navigate(step.target)}>{step.complete ? "Vérifier" : "Configurer"}</button></article>)}</div></section>;
}
function PremiumDashboard({ premium, guildName, activate, busy }: {
    premium: PremiumState;
    guildName: string;
    activate: () => Promise<void>;
    busy: boolean;
}) {
    const founder = premium.founder;
    const expiration = founder.endsAt ? new Date(founder.endsAt).toLocaleString("fr-FR") : null;
    const activeHere = premium.plan === "premium";
    const disabled = busy || activeHere || founder.userExpired || (!founder.userClaimed && !founder.available);
    const buttonLabel = activeHere ? `Actif jusqu’au ${expiration}` : founder.userActive ? `Appliquer à ${guildName}` : founder.userExpired ? "Accès Fondateur terminé" : founder.available ? "Activer 30 jours gratuitement" : "100 accès déjà attribués";
    const bridgeStatus = premium.entitlementConfigured ? premium.entitlementActive ? `Droit Discord${premium.entitlementTest ? " de test" : ""} détecté` : "Passerelle Discord prête, aucun droit payant actif" : "La facturation Discord reste désactivée";
    return <section className="premium-workspace"><div className="premium-intro"><div><p className="eyebrow">ACCÈS FONDATEUR FYXBOT</p><h2>30 jours Premium offerts aux 100 premiers utilisateurs</h2><p>Aucune carte bancaire n’est demandée et aucun abonnement ne démarre automatiquement. À l’échéance, le serveur revient simplement à Free.</p></div><span>💎 {founder.remaining}/{founder.limit} places</span></div><div className="founder-offer"><div><strong>{activeHere ? "Premium actif" : founder.userActive ? "Votre accès est prêt" : "Offre de lancement"}</strong><p>{activeHere && expiration ? `Ce serveur bénéficie de Premium jusqu’au ${expiration}.` : founder.userActive && expiration ? `Votre compte est Premium jusqu’au ${expiration}. Vous pouvez appliquer cet accès aux serveurs que vous administrez.` : `Activez l’offre sur ${guildName}. Les réglages Premium resteront conservés après l’échéance, sans nouvelle création au-delà des limites Free.`}</p><small>Aucun moyen de paiement requis · Aucun renouvellement automatique · Aucun prélèvement</small></div><button type="button" disabled={disabled} onClick={() => void activate()}>{busy ? "Activation…" : buttonLabel}</button></div><div className="premium-plans">{premium.plans.map(plan => <article className={plan.id === "premium" ? "featured" : ""} key={plan.id}><small>{plan.id === premium.plan ? "FORFAIT ACTUEL" : "COMPARAISON"}</small><h3>{plan.name}</h3><p>{plan.description}</p><ul>{plan.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul><button disabled>{plan.id === premium.plan ? "Actif" : plan.id === "premium" ? "Via l’accès Fondateur" : "Inclus"}</button></article>)}</div><p className="premium-note"><strong>État technique :</strong> {bridgeStatus}. L’accès Fondateur est indépendant du futur abonnement Discord et ne peut pas être converti automatiquement en offre payante.</p></section>;
}
function CommunityDashboard({ data, form, update, createEvent, createGiveaway, navigate }: {
    data: State;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    createEvent: () => Promise<void>;
    createGiveaway: () => Promise<void>;
    navigate: (target: string) => void;
}) {
    return <section className="community-hub"><div><p className="eyebrow">OUTILS COMMUNAUTAIRES</p><h2>Faire participer les membres</h2><p>Programmez les rendez-vous et gérez les concours depuis le panel ou avec <code>/communaute</code>.</p></div><div className="community-cards"><article><span>📊</span><h3>Sondages Discord</h3><p>Publiez un sondage natif avec 2 à 4 choix grâce à <code>/communaute sondage</code>.</p></article><article><span>🔊</span><h3>Salons privés temporaires</h3><p>Les membres créent leur propre vocal, automatiquement supprimé quand il est vide.</p><button onClick={() => navigate("Vocaux")}>Configurer les vocaux</button></article><article><span>📡</span><h3>Notifications automatiques</h3><p>Surveillez YouTube et Twitch puis annoncez uniquement les nouveaux contenus.</p><button onClick={() => navigate("Social")}>Configurer les réseaux</button></article></div><div className="settings community-settings community-builder"><div><p className="eyebrow">ÉVÉNEMENT DISCORD</p><h2>Programmer un rendez-vous</h2><p>L’événement apparaît dans la liste native de Discord avec son heure et son lieu.</p></div><label>Titre<input maxLength={100} value={form.communityEventName || ""} onChange={e => update("communityEventName")(e.target.value)} placeholder="Soirée communautaire"/></label><label>Date<input value={form.communityEventDate || ""} onChange={e => update("communityEventDate")(e.target.value)} placeholder="JJ/MM/AAAA"/></label><label>Heure<input value={form.communityEventTime || ""} onChange={e => update("communityEventTime")(e.target.value)} placeholder="20:30"/></label><label>Type<select value={form.communityEventType || "external"} onChange={e => update("communityEventType")(e.target.value)}><option value="external">Lieu ou lien externe</option><option value="voice">Salon vocal Discord</option></select></label><Select label="Salon vocal" value={form.communityEventVoiceChannelId || ""} options={[{ id: "", name: "Aucun" }, ...data.options.voiceChannels]} onChange={update("communityEventVoiceChannelId")}/><label>Lieu ou lien<input maxLength={100} value={form.communityEventLocation || "Discord"} onChange={e => update("communityEventLocation")(e.target.value)} placeholder="Discord"/></label><label>Durée<select value={form.communityEventDuration || "60"} onChange={e => update("communityEventDuration")(e.target.value)}><option value="30">30 minutes</option><option value="60">1 heure</option><option value="120">2 heures</option><option value="240">4 heures</option></select></label><label>Fuseau<select value={form.communityEventTimezone || "Europe/Paris"} onChange={e => update("communityEventTimezone")(e.target.value)}><option value="Europe/Paris">France métropolitaine</option><option value="UTC">UTC</option><option value="America/Montreal">Montréal</option><option value="Indian/Reunion">La Réunion</option></select></label><label className="wide full-row">Description<textarea rows={4} maxLength={1000} value={form.communityEventDescription || ""} onChange={e => update("communityEventDescription")(e.target.value)} placeholder="Présentez le programme et les informations utiles…"/></label><label>Confirmation<input value={form.communityEventConfirmation || ""} onChange={e => update("communityEventConfirmation")(e.target.value)} placeholder="PROGRAMMER"/></label><button disabled={!form.communityEventName || !form.communityEventDate || !form.communityEventTime || form.communityEventConfirmation !== "PROGRAMMER" || (form.communityEventType === "voice" && !form.communityEventVoiceChannelId)} onClick={() => void createEvent()}>Programmer l’événement</button></div><div className="settings community-settings community-builder"><div><p className="eyebrow">CONCOURS AUTOMATIQUE</p><h2>Faire gagner un lot</h2><p>Une participation par membre. Le tirage est automatique et les identifiants des participants sont supprimés après le résultat.</p></div><label>Lot<input maxLength={200} value={form.communityGiveawayPrize || ""} onChange={e => update("communityGiveawayPrize")(e.target.value)} placeholder="Un mois de grade VIP"/></label><Select label="Salon" value={form.communityGiveawayChannelId || ""} options={data.options.textChannels} onChange={update("communityGiveawayChannelId")}/><label>Durée<select value={form.communityGiveawayDuration || "1440"} onChange={e => update("communityGiveawayDuration")(e.target.value)}><option value="10">10 minutes</option><option value="60">1 heure</option><option value="360">6 heures</option><option value="1440">24 heures</option><option value="4320">3 jours</option><option value="10080">7 jours</option></select></label><label>Gagnants<select value={form.communityGiveawayWinners || "1"} onChange={e => update("communityGiveawayWinners")(e.target.value)}>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Confirmation<input value={form.communityGiveawayConfirmation || ""} onChange={e => update("communityGiveawayConfirmation")(e.target.value)} placeholder="PUBLIER"/></label><button disabled={!form.communityGiveawayPrize || !form.communityGiveawayChannelId || form.communityGiveawayConfirmation !== "PUBLIER"} onClick={() => void createGiveaway()}>Publier le concours</button></div><div className="community-live-grid"><article><p className="eyebrow">ÉVÉNEMENTS À VENIR</p><h2>{data.community.events.length}</h2>{data.community.events.length === 0 ? <small>Aucun événement programmé.</small> : data.community.events.map(event => <a key={event.id} href={event.url} target="_blank" rel="noreferrer"><strong>{event.name}</strong><small>{event.scheduledStartAt ? new Date(event.scheduledStartAt).toLocaleString("fr-FR") : "Date non disponible"}</small></a>)}</article><article><p className="eyebrow">CONCOURS ACTIFS</p><h2>{data.community.giveaways.length}</h2>{data.community.giveaways.length === 0 ? <small>Aucun concours actif.</small> : data.community.giveaways.map(giveaway => <div key={giveaway.giveawayId}><strong>{giveaway.prize}</strong><small>{giveaway.participantCount} participant(s) · tirage {new Date(giveaway.endsAt).toLocaleString("fr-FR")}</small></div>)}</article></div></section>;
}
function SocialDashboard({ data, form, update, save, publish, manageSource }: {
    data: State;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    save: () => void;
    publish: () => Promise<void>;
    manageSource: (action: "add" | "remove", sourceId?: string) => Promise<void>;
}) {
    const sources = data.config.social?.sources || [];
    return <section className="community-workspace"><div className="settings community-settings"><div><p className="eyebrow">NOTIFICATIONS SOCIALES</p><h2>Canal de diffusion</h2><p>Choisissez où annoncer les lives et les nouvelles vidéos.</p></div><Select label="Salon des notifications" value={form.socialChannelId || ""} options={data.options.textChannels} onChange={update("socialChannelId")}/><Select label="Rôle à notifier" value={form.socialRoleId || ""} options={[{ id: "", name: "Aucun rôle" }, ...data.options.roles]} onChange={update("socialRoleId")}/><span /><button disabled={!form.socialChannelId} onClick={save}>Enregistrer</button></div><div className="settings community-settings social-source-builder"><div><p className="eyebrow">SURVEILLANCE AUTOMATIQUE</p><h2>Ajouter une chaîne</h2><p>YouTube utilise l’identifiant public UC… ; Twitch utilise le nom de la chaîne. La première lecture reste silencieuse.</p></div><label>Plateforme<select value={form.socialSourcePlatform || "youtube"} onChange={e => update("socialSourcePlatform")(e.target.value)}><option value="youtube">YouTube</option><option value="twitch">Twitch</option></select></label><label>Identifiant<input value={form.socialSourceIdentifier || ""} onChange={e => update("socialSourceIdentifier")(e.target.value)} placeholder={form.socialSourcePlatform === "twitch" ? "nom_de_chaine" : "UCxxxxxxxxxxxxxxxxxxxxxx"}/></label><label>Nom affiché<input value={form.socialSourceLabel || ""} onChange={e => update("socialSourceLabel")(e.target.value)} placeholder="Ma chaîne"/></label><button disabled={!data.config.social?.channelId || !form.socialSourceIdentifier} onClick={() => void manageSource("add")}>Ajouter la surveillance</button></div><div className="social-source-list"><div><p className="eyebrow">SOURCES ACTIVES</p><h2>{sources.length} chaîne(s) surveillée(s)</h2></div>{sources.length === 0 ? <p>Aucune source automatique pour le moment.</p> : sources.map(source => <article key={source.id}><span>{source.platform === "youtube" ? "▶️" : "🟣"}</span><div><strong>{source.label}</strong><small>{source.identifier} · {source.status || "en attente"}</small>{source.lastError && <em>{source.lastError}</em>}</div><button onClick={() => void manageSource("remove", source.id)}>Retirer</button></article>)}</div><div className="settings community-settings social-publisher"><div><p className="eyebrow">ANNONCE MANUELLE</p><h2>Informer la communauté</h2><p>La publication manuelle reste disponible pour les autres plateformes.</p></div><label>Type<select value={form.socialType || "live"} onChange={e => update("socialType")(e.target.value)}><option value="live">Lancement d’un live</option><option value="video">Nouvelle vidéo</option></select></label><label>Plateforme<select value={form.socialPlatform || "YouTube"} onChange={e => update("socialPlatform")(e.target.value)}><option>YouTube</option><option>Twitch</option><option>TikTok</option><option>Instagram</option><option>Kick</option><option>Autre plateforme</option></select></label><label>Créateur<input value={form.socialCreator || ""} onChange={e => update("socialCreator")(e.target.value)} placeholder="Nom du créateur"/></label><label>Titre<input value={form.socialTitle || ""} onChange={e => update("socialTitle")(e.target.value)} placeholder="Titre du live ou de la vidéo"/></label><label className="wide">Lien HTTPS<input type="url" value={form.socialUrl || ""} onChange={e => update("socialUrl")(e.target.value)} placeholder="https://…"/></label><label>Confirmation<input value={form.socialNotifyConfirmation || ""} onChange={e => update("socialNotifyConfirmation")(e.target.value)} placeholder="NOTIFIER"/></label><button disabled={form.socialNotifyConfirmation !== "NOTIFIER" || !form.socialCreator || !form.socialTitle || !form.socialUrl || !data.config.social} onClick={publish}>Publier la notification</button></div></section>;
}
const supportStatusLabels: Record<SupportRequest["status"], string> = {
    open: "Ouverte",
    in_progress: "En cours",
    waiting_user: "Réponse attendue",
    resolved: "Résolue",
    closed: "Fermée",
};
const supportPriorityLabels: Record<SupportRequest["priority"], string> = {
    low: "Basse",
    normal: "Normale",
    high: "Haute",
    urgent: "Urgente",
};
const supportCategoryLabels: Record<string, string> = {
    technical: "Problème technique",
    configuration: "Configuration",
    billing: "Premium et facturation",
    abuse: "Abus ou signalement",
    privacy: "Données personnelles",
    security: "Incident de sécurité",
    other: "Autre demande",
};
const SUPPORT_DEEP_LINK_KEY = "fyxbot-pending-support-category";
const supportDeepLinkCategories = new Set(["technical", "configuration", "billing", "abuse", "privacy", "security", "other"]);
function initialSupportCategory() {
    if (typeof window === "undefined")
        return "";
    const requested = new URLSearchParams(window.location.search).get("support") || "";
    let pending = "";
    try {
        pending = window.sessionStorage.getItem(SUPPORT_DEEP_LINK_KEY) || "";
    }
    catch { /* Le navigateur peut refuser le stockage sans bloquer le panel. */ }
    const category = supportDeepLinkCategories.has(requested) ? requested : pending;
    return supportDeepLinkCategories.has(category) ? category : "";
}
function SupportDashboard({ workspace, conversation, composing, form, update, selectRequest, startRequest, createRequest, reply, updateRequest }: {
    workspace: SupportWorkspace | null;
    conversation: SupportConversation | null;
    composing: boolean;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    selectRequest: (id: string) => void;
    startRequest: () => void;
    createRequest: () => void;
    reply: () => void;
    updateRequest: () => void;
}) {
    if (!workspace)
        return <section className="support-workspace"><div className="support-loading"><span>🛟</span><h2>Chargement du support FyxBot…</h2></div></section>;
    const access = workspace.access || { role: workspace.ownerAccess ? "owner" : "user", canViewAll: workspace.ownerAccess, canReplyAsStaff: workspace.ownerAccess, canManageStatus: workspace.ownerAccess, canManagePriority: workspace.ownerAccess, canManageTeam: workspace.ownerAccess };
    const teamAccess = access.canViewAll;
    const accessLabel = access.role === "owner" ? "Propriétaire" : access.role === "administrator" ? "Administrateur Support" : access.role === "moderator" ? "Modérateur Support" : null;
    return <section className="support-workspace">
        <div className="support-summary"><div><p className="eyebrow">CENTRE D’ASSISTANCE</p><h2>{teamAccess ? "Boîte de réception FyxBot" : "Vos demandes à l’équipe FyxBot"}</h2><p>{teamAccess ? "Suivez les demandes de tous les serveurs depuis un espace privé." : "Expliquez votre problème et retrouvez les réponses sans quitter le panel."}</p>{accessLabel && <b className={`support-access-badge ${access.role}`}>{accessLabel}</b>}</div><div className="support-metrics"><article><strong>{workspace.counts.open}</strong><small>actives</small></article><article><strong>{workspace.counts.urgent}</strong><small>urgentes</small></article><article><strong>{workspace.counts.total}</strong><small>affichées</small></article></div>{workspace.supportUrl && <a href={workspace.supportUrl} target="_blank" rel="noreferrer">Serveur d’assistance ↗</a>}</div>
        <div className="support-layout"><div className="support-inbox"><header><div><p className="eyebrow">DEMANDES</p><h3>{teamAccess ? "Tous les serveurs" : "Mon historique"}</h3></div><button type="button" onClick={startRequest}>+ Nouvelle</button></header><div className="support-request-list">{workspace.requests.length === 0 ? <p className="support-empty">Aucune demande pour le moment.</p> : workspace.requests.map(request => <button type="button" className={conversation?.request.id === request.id && !composing ? "selected" : ""} key={request.id} onClick={() => selectRequest(request.id)}><span className={`support-priority ${request.priority}`}/><div><strong>{request.subject}</strong><small>{request.guildName} · {request.requesterName}</small><em>{new Date(request.updatedAt).toLocaleString("fr-FR")}</em></div><b className={`support-status ${request.status}`}>{supportStatusLabels[request.status]}</b></button>)}</div></div>
            <div className="support-detail">{composing ? <><header><div><p className="eyebrow">NOUVELLE DEMANDE</p><h2>Comment pouvons-nous vous aider ?</h2><p>Ne transmettez jamais de mot de passe, jeton Discord ou code d’authentification.</p></div><span>📝</span></header><div className="support-form"><label>Catégorie<select value={form.supportCategory || "technical"} onChange={event => update("supportCategory")(event.target.value)}>{Object.entries(supportCategoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Priorité<select value={form.supportPriority || "normal"} onChange={event => update("supportPriority")(event.target.value)}>{Object.entries(supportPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="full-row">Sujet<input maxLength={120} value={form.supportSubject || ""} onChange={event => update("supportSubject")(event.target.value)} placeholder="Ex. La commande /setup ne répond plus"/></label><label className="full-row">Description<textarea rows={8} maxLength={4000} value={form.supportMessage || ""} onChange={event => update("supportMessage")(event.target.value)} placeholder="Décrivez les étapes, le résultat obtenu et le résultat attendu…"/></label><button type="button" disabled={(form.supportSubject || "").trim().length < 5 || (form.supportMessage || "").trim().length < 20} onClick={createRequest}>Envoyer la demande</button></div></> : conversation ? <><header className="support-conversation-head"><div><p className="eyebrow">{supportCategoryLabels[conversation.request.category] || "DEMANDE"}</p><h2>{conversation.request.subject}</h2><p>{conversation.request.guildName} · créée par {conversation.request.requesterName} le {new Date(conversation.request.createdAt).toLocaleString("fr-FR")}</p></div><div><b className={`support-status ${conversation.request.status}`}>{supportStatusLabels[conversation.request.status]}</b><b className={`support-priority-label ${conversation.request.priority}`}>{supportPriorityLabels[conversation.request.priority]}</b></div></header>{access.canManageStatus && <div className="support-owner-controls"><label>Statut<select value={form.supportStatus || conversation.request.status} onChange={event => update("supportStatus")(event.target.value)}>{Object.entries(supportStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{access.canManagePriority && <label>Priorité<select value={form.supportManagePriority || conversation.request.priority} onChange={event => update("supportManagePriority")(event.target.value)}>{Object.entries(supportPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}<button type="button" onClick={updateRequest}>Mettre à jour</button></div>}<div className="support-thread">{conversation.messages.map(message => <article className={message.authorRole === "staff" ? "staff" : "user"} key={message.id}><div><span>{message.authorName.slice(0, 1).toUpperCase()}</span><strong>{message.authorName}</strong>{message.authorRole === "staff" && <b>ÉQUIPE FYXBOT</b>}<time>{new Date(message.createdAt).toLocaleString("fr-FR")}</time></div><p>{message.body}</p></article>)}</div><div className="support-reply"><label>Répondre<textarea rows={5} maxLength={4000} value={form.supportReply || ""} onChange={event => update("supportReply")(event.target.value)} placeholder="Votre réponse…"/></label><button type="button" disabled={(form.supportReply || "").trim().length < 2} onClick={reply}>Envoyer</button></div>{conversation.events.length > 1 && <details className="support-history"><summary>Historique de la demande</summary>{conversation.events.slice(1).map(event => <p key={event.id}><strong>{event.actorName}</strong> · {event.detail}<time>{new Date(event.createdAt).toLocaleString("fr-FR")}</time></p>)}</details>}</> : <div className="support-empty-detail"><span>🛟</span><h2>Sélectionnez une demande</h2><p>Ouvrez une conversation existante ou créez une nouvelle demande.</p><button type="button" onClick={startRequest}>Créer une demande</button></div>}</div></div>
        <div className="support-faq"><div><p className="eyebrow">AVANT D’ÉCRIRE</p><h2>Réponses rapides</h2></div><article><strong>Une commande n’apparaît pas</strong><p>Vérifiez que FyxBot a été invité avec le droit d’utiliser les commandes, puis relancez la synchronisation globale.</p></article><article><strong>FyxBot refuse une action</strong><p>Placez son rôle au-dessus des rôles qu’il doit gérer et vérifiez ses permissions dans la catégorie concernée.</p></article><article><strong>Demande liée aux données</strong><p>Choisissez “Données personnelles” et indiquez votre identifiant Discord ainsi que le serveur concerné.</p></article></div>
    </section>;
}
export default function Dashboard() {
    const [active, setActive] = useState("Vue d’ensemble"), [data, setData] = useState<State | null>(null), [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null), [supportStaff, setSupportStaff] = useState<SupportStaffMember[]>([]), [memberWarnings, setMemberWarnings] = useState<MemberWarning[] | null>(null), [supportWorkspace, setSupportWorkspace] = useState<SupportWorkspace | null>(null), [supportConversation, setSupportConversation] = useState<SupportConversation | null>(null), [supportComposing, setSupportComposing] = useState(false), [requestedSupportCategory, setRequestedSupportCategory] = useState(initialSupportCategory), [account, setAccount] = useState<Account | null>(null), [accountMenuOpen, setAccountMenuOpen] = useState(false), [mobileNavOpen, setMobileNavOpen] = useState(false), [selectedGuild, setSelectedGuild] = useState(""), [form, setForm] = useState<Record<string, string>>({}), [notice, setNotice] = useState("Connexion à FyxBot…"), [authenticated, setAuthenticated] = useState<boolean | null>(null), [csrfToken, setCsrfToken] = useState("");
    useEffect(() => {
        if (!supportDeepLinkCategories.has(requestedSupportCategory))
            return;
        try { window.sessionStorage.setItem(SUPPORT_DEEP_LINK_KEY, requestedSupportCategory); } catch { /* Navigation directe toujours disponible. */ }
    }, [requestedSupportCategory]);
    useEffect(() => {
        if (!mobileNavOpen)
            return;
        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape")
                setMobileNavOpen(false);
        };
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [mobileNavOpen]);
    const refresh = useCallback(async (guildId = "", hydrateForm = true) => {
        try {
            const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
            const r = await fetch(`${API}/state${query}`, { credentials: "include" }), n = await r.json();
            if (r.status === 401) {
                setAuthenticated(false);
                setCsrfToken("");
                return;
            }
            if (!r.ok)
                throw Error(n.error);
            if (hydrateForm && guildId) {
                setSupportConversation(null);
                setSupportComposing(false);
            }
            setData(n);
            setSelectedGuild(n.guild.id);
            setNotice("");
            if (hydrateForm)
                setForm({
                    logChannelId: n.config.logs?.channelId || "",
                    categoryId: n.config.tickets?.categoryId || "",
                    staffRoleId: n.config.tickets?.staffRoleId || "",
                    ticketPanelChannelId: n.config.tickets?.panelChannelId || "",
                    suggestionChannelId: n.config.suggestions?.channelId || "",
                    welcomeChannelId: n.config.welcome?.welcomeChannelId || "",
                    leaveChannelId: n.config.welcome?.leaveChannelId || "",
                    autoRoleId: n.config.welcome?.autoRoleId || "",
                    welcomeMessage: n.config.welcome?.welcomeMessage || DEFAULT_WELCOME_MESSAGE,
                    leaveMessage: n.config.welcome?.leaveMessage || DEFAULT_LEAVE_MESSAGE,
                    rulesTitle: n.config.rules?.title || `Règlement ${n.guild.name}`,
                    rulesContent: n.config.rules?.content || "",
                    rulesChannelId: n.config.rules?.channelId || "",
                    rulesRoleId: n.config.rules?.verifiedRoleId || "",
                    birthdayChannelId: n.config.birthdays?.channelId || "",
                    birthdayRoleId: n.config.birthdays?.roleId || "",
                    birthdayTimezone: n.config.birthdays?.timezone || "Europe/Paris",
                    birthdayMessage: n.config.birthdays?.message || DEFAULT_BIRTHDAY_MESSAGE,
                    setupMode: n.setupAnalysis?.recommendation === "complete" ? "complete" : "synchronize",
                    setupConfirmation: "",
                    setupDescription: n.setupBlueprint?.description || "",
                    socialChannelId: n.config.social?.channelId || "",
                    socialRoleId: n.config.social?.roleId || "",
                    socialSourcePlatform: "youtube",
                    socialSourceIdentifier: "",
                    socialSourceLabel: "",
                    communityEventName: "",
                    communityEventDate: "",
                    communityEventTime: "20:00",
                    communityEventDescription: "",
                    communityEventType: "external",
                    communityEventVoiceChannelId: "",
                    communityEventLocation: "Discord",
                    communityEventDuration: "60",
                    communityEventTimezone: "Europe/Paris",
                    communityEventConfirmation: "",
                    communityGiveawayPrize: "",
                    communityGiveawayChannelId: "",
                    communityGiveawayDuration: "1440",
                    communityGiveawayWinners: "1",
                    communityGiveawayConfirmation: "",
                    voiceCategoryId: n.config.temporaryVoice?.categoryId || "",
                    voiceHubName: n.config.temporaryVoice?.hubName || "➕ Créer un salon",
                    voiceDefaultLimit: String(n.config.temporaryVoice?.defaultLimit || 0),
                    messageMode: "changelog",
                    messageChannelId: "",
                    messageVersion: CURRENT_RELEASE.version,
                    messageEnvironment: "production",
                    messageContent: "",
                    messageTitle: "",
                    messageDescription: "",
                    messageColor: "#ef4444",
                    messageLinkUrl: "https://fyxbot-panel-production.up.railway.app/changelog",
                    messageButtonLabel: "Consulter le changelog",
                    messageImageUrl: "",
                    messageThumbnailUrl: "",
                    messageFooter: "FyxBot • Changelog",
                    supportCategory: "technical",
                    supportPriority: "normal",
                    supportSubject: "",
                    supportMessage: "",
                    supportReply: "",
                    supportStaffUserId: "",
                    supportStaffRole: "moderator",
                    supportStaffConfirmation: "",
                });
        }
        catch {
            setNotice("Le bot FyxBot ou sa passerelle locale est indisponible.");
        }
    }, []);
    useEffect(() => {
        const timer = window.setTimeout(async () => {
            try {
                const r = await fetch(`${API}/auth/status`, { credentials: "include" }), n = await r.json();
                setAuthenticated(n.authenticated);
                setAccount(n.user || null);
                setCsrfToken(n.csrfToken || "");
                if (n.authenticated)
                    await refresh();
            }
            catch {
                setAuthenticated(false);
                setAccount(null);
                setCsrfToken("");
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);
    useEffect(() => {
        if (!selectedGuild)
            return;
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible")
                void refresh(selectedGuild, false);
        }, 15000);
        return () => window.clearInterval(timer);
    }, [selectedGuild, refresh]);
    useEffect(() => {
        if (authenticated !== true || !selectedGuild || !supportDeepLinkCategories.has(requestedSupportCategory))
            return;
        const timer = window.setTimeout(() => {
            setActive("Assistance FyxBot");
            setSupportConversation(null);
            setSupportComposing(true);
            setForm(current => ({ ...current, supportCategory: requestedSupportCategory, supportPriority: "normal", supportSubject: "", supportMessage: "" }));
            try { window.sessionStorage.removeItem(SUPPORT_DEEP_LINK_KEY); } catch { /* Le formulaire reste utilisable. */ }
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("support");
            window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
            setRequestedSupportCategory("");
        }, 0);
        return () => window.clearTimeout(timer);
    }, [authenticated, selectedGuild, requestedSupportCategory]);
    const update = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));
    const loadSupport = useCallback(async () => {
        try {
            const response = await fetch(`${API}/support`, { credentials: "include" });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setSupportWorkspace(payload);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Support indisponible.");
        }
    }, []);
    useEffect(() => {
        if (active !== "Assistance FyxBot" || !selectedGuild)
            return;
        const initialTimer = window.setTimeout(() => void loadSupport(), 0);
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible")
                void loadSupport();
        }, 30000);
        return () => {
            window.clearTimeout(initialTimer);
            window.clearInterval(timer);
        };
    }, [active, selectedGuild, loadSupport]);
    async function selectSupportRequest(requestId: string) {
        setNotice("Chargement de la demande…");
        try {
            const query = new URLSearchParams({ id: requestId });
            const response = await fetch(`${API}/support/conversation?${query}`, { credentials: "include" });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setSupportConversation(payload.conversation);
            setSupportComposing(false);
            setForm(current => ({ ...current, supportReply: "", supportStatus: payload.conversation.request.status, supportManagePriority: payload.conversation.request.priority }));
            setNotice("");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Demande indisponible.");
        }
    }
    function startSupportRequest() {
        setSupportConversation(null);
        setSupportComposing(true);
        setForm(current => ({ ...current, supportCategory: "technical", supportPriority: "normal", supportSubject: "", supportMessage: "" }));
    }
    async function createSupportTicket() {
        setNotice("Envoi de la demande…");
        try {
            const response = await fetch(`${API}/support/create`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, category: form.supportCategory, priority: form.supportPriority, subject: form.supportSubject, message: form.supportMessage }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setSupportComposing(false);
            setForm(current => ({ ...current, supportSubject: "", supportMessage: "" }));
            await loadSupport();
            await selectSupportRequest(payload.request.id);
            setNotice("✓ Demande envoyée à l’équipe FyxBot");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Échec de l’envoi.");
        }
    }
    async function replyToSupport() {
        if (!supportConversation)
            return;
        setNotice("Envoi de la réponse…");
        try {
            const response = await fetch(`${API}/support/reply`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ requestId: supportConversation.request.id, message: form.supportReply }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setSupportConversation(payload.conversation);
            setForm(current => ({ ...current, supportReply: "", supportStatus: payload.conversation.request.status, supportManagePriority: payload.conversation.request.priority }));
            await loadSupport();
            setNotice("✓ Réponse envoyée");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Échec de la réponse.");
        }
    }
    async function manageSupportRequest() {
        if (!supportConversation)
            return;
        setNotice("Mise à jour de la demande…");
        try {
            const response = await fetch(`${API}/support/update`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ requestId: supportConversation.request.id, status: form.supportStatus, priority: form.supportManagePriority }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            await loadSupport();
            await selectSupportRequest(payload.request.id);
            setNotice("✓ Demande mise à jour");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Échec de la mise à jour.");
        }
    }
    async function save(section: string, body: Record<string, string>) {
        setNotice("Enregistrement…");
        try {
            const r = await fetch(`${API}/config/${section}`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ ...body, guildId: selectedGuild }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice("✓ Configuration appliquée à FyxBot");
            await refresh(selectedGuild);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la modification.");
        }
    }
    async function activateFounderAccess() {
        if (!data)
            return;
        const expectedExpiration = data.premium.founder.endsAt
            ? new Date(data.premium.founder.endsAt)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const confirmed = window.confirm(`Activer FyxBot Premium sur ${data.guild.name} jusqu’au ${expectedExpiration.toLocaleString("fr-FR")} ?\n\nAucune carte bancaire ne sera demandée. Aucun abonnement ni renouvellement automatique ne sera créé. Après l’échéance, les réglages resteront conservés mais le serveur reviendra aux limites Free.`);
        if (!confirmed)
            return;
        setNotice("Activation de Premium…");
        try {
            const response = await fetch(`${API}/premium/founder`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, confirmation: "ACTIVER" }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setData(current => current ? { ...current, premium: payload.premium } : current);
            setNotice(`✓ ${payload.message}`);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Activation Premium impossible.");
        }
    }
    async function runSetup(mode: SetupMode | "design") {
        setNotice(mode === "design" ? "Création de votre proposition personnalisée…" : mode === "reset" ? "Sauvegarde et reconstruction du serveur en cours…" : mode === "synchronize" ? "Synchronisation de la structure et des permissions…" : "Ajout des éléments manquants…");
        try {
            const r = await fetch(`${API}/setup`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, mode, description: form.setupDescription || "", confirmation: form.setupConfirmation || "" }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setForm(f => ({ ...f, setupConfirmation: "" }));
            setNotice(`✓ ${n.message}`);
            await refresh(selectedGuild);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la configuration.");
        }
    }
    async function moderate() {
        if (form.moderationConfirmation !== "CONFIRMER")
            return;
        setNotice("Application de la sanction…");
        try {
            const r = await fetch(`${API}/moderation`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, memberId: form.moderationMemberId, action: form.moderationAction || "warn", reason: form.moderationReason, duration: form.moderationDuration }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, moderationConfirmation: "", moderationReason: "" }));
            await refresh(selectedGuild, false);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la sanction.");
        }
    }
    async function toggleSecurity(enabled: boolean) {
        setNotice(enabled ? "Activation des protections…" : "Désactivation des protections…");
        try {
            const r = await fetch(`${API}/security`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, enabled }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            await refresh(selectedGuild, false);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la modification.");
        }
    }
    async function publishTicketPanel() {
        setNotice("Publication du panneau…");
        try {
            const r = await fetch(`${API}/tickets/publish`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, channelId: form.ticketPanelChannelId, categoryId: form.categoryId, staffRoleId: form.staffRoleId, title: form.ticketTitle, requestType: form.ticketRequestType, confirmation: form.ticketPublishConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, ticketPublishConfirmation: "" }));
            await refresh(selectedGuild);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la publication.");
        }
    }
    function selectTicketPanel(panelId: string) {
        const panel = data?.config.tickets?.panels?.find(item => item.id === panelId);
        if (!panel)
            return;
        setForm(f => ({ ...f, ticketPanelId: panel.id, ticketTitle: panel.title, ticketRequestType: panel.requestType, categoryId: panel.categoryId, staffRoleId: panel.staffRoleId, ticketPanelChannelId: panel.panelChannelId || "", ticketEditConfirmation: "" }));
    }
    async function updateTicketPanel() {
        setNotice("Modification du panneau…");
        try {
            const r = await fetch(`${API}/tickets/update`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, panelId: form.ticketPanelId, title: form.ticketTitle, requestType: form.ticketRequestType, categoryId: form.categoryId, staffRoleId: form.staffRoleId, confirmation: form.ticketEditConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, ticketEditConfirmation: "" }));
            await refresh(selectedGuild, false);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la modification.");
        }
    }
    const roleIds = () => [1, 2, 3, 4, 5].map(index => form[`rolePanelRole${index}`]).filter(Boolean);
    function selectRolePanel(panelId: string) {
        const panel = data?.config.rolePanels.find(item => item.id === panelId);
        if (!panel)
            return;
        setForm(f => ({ ...f, rolePanelId: panel.id, rolePanelTitle: panel.title, rolePanelDescription: panel.description, rolePanelChannelId: panel.channelId, rolePanelRole1: panel.roleIds[0] || "", rolePanelRole2: panel.roleIds[1] || "", rolePanelRole3: panel.roleIds[2] || "", rolePanelRole4: panel.roleIds[3] || "", rolePanelRole5: panel.roleIds[4] || "", rolePanelEditConfirmation: "" }));
    }
    async function publishRolePanel() {
        setNotice("Publication du panneau de rôles…");
        try {
            const r = await fetch(`${API}/roles/publish`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, channelId: form.rolePanelChannelId, title: form.rolePanelTitle, description: form.rolePanelDescription, roleIds: roleIds(), confirmation: form.rolePanelPublishConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, rolePanelPublishConfirmation: "" }));
            await refresh(selectedGuild, false);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la publication.");
        }
    }
    async function updateRolePanel() {
        setNotice("Modification du panneau de rôles…");
        try {
            const r = await fetch(`${API}/roles/update`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, panelId: form.rolePanelId, title: form.rolePanelTitle, description: form.rolePanelDescription, roleIds: roleIds(), confirmation: form.rolePanelEditConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, rolePanelEditConfirmation: "" }));
            await refresh(selectedGuild, false);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la modification.");
        }
    }
    async function publishRules() {
        const updating = Boolean(data?.config.rules);
        setNotice(updating ? "Modification du règlement…" : "Publication du règlement…");
        try {
            const r = await fetch(`${API}/rules/publish`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, mode: updating ? "update" : "publish", channelId: form.rulesChannelId, title: form.rulesTitle, content: form.rulesContent, verifiedRoleId: form.rulesRoleId || null, confirmation: form.rulesConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, rulesConfirmation: "" }));
            await refresh(selectedGuild);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec du règlement.");
        }
    }
    async function sendSocialNotification() {
        setNotice("Publication de la notification…");
        try {
            const r = await fetch(`${API}/social/notify`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, type: form.socialType || "live", platform: form.socialPlatform || "YouTube", creator: form.socialCreator, title: form.socialTitle, url: form.socialUrl, confirmation: form.socialNotifyConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, socialNotifyConfirmation: "", socialTitle: "", socialUrl: "" }));
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la notification.");
        }
    }
    async function manageSocialSource(action: "add" | "remove", sourceId = "") {
        setNotice(action === "add" ? "Ajout de la surveillance automatique…" : "Suppression de la surveillance…");
        try {
            const r = await fetch(`${API}/social/sources`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, action, sourceId, platform: form.socialSourcePlatform || "youtube", identifier: form.socialSourceIdentifier, label: form.socialSourceLabel }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, socialSourceIdentifier: "", socialSourceLabel: "" }));
            await refresh(selectedGuild, false);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la surveillance automatique.");
        }
    }
    async function createCommunityEvent() {
        setNotice("Programmation de l’événement…");
        try {
            const r = await fetch(`${API}/community/event`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, name: form.communityEventName, date: form.communityEventDate, time: form.communityEventTime, description: form.communityEventDescription, type: form.communityEventType || "external", channelId: form.communityEventVoiceChannelId, location: form.communityEventLocation, durationMinutes: form.communityEventDuration, timeZone: form.communityEventTimezone, confirmation: form.communityEventConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, communityEventName: "", communityEventDescription: "", communityEventConfirmation: "" }));
            await refresh(selectedGuild, false);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la programmation.");
        }
    }
    async function createCommunityGiveaway() {
        setNotice("Publication du concours…");
        try {
            const r = await fetch(`${API}/community/giveaway`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, channelId: form.communityGiveawayChannelId, prize: form.communityGiveawayPrize, durationMinutes: form.communityGiveawayDuration, winnerCount: form.communityGiveawayWinners, confirmation: form.communityGiveawayConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, communityGiveawayPrize: "", communityGiveawayConfirmation: "" }));
            await refresh(selectedGuild, false);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la publication du concours.");
        }
    }
    async function sendCustomMessage() {
        setNotice("Publication du message dans Discord…");
        try {
            const r = await fetch(`${API}/messages/send`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, mode: form.messageMode || "changelog", channelId: form.messageChannelId, content: form.messageContent, title: form.messageTitle, description: form.messageDescription, color: form.messageColor, imageUrl: form.messageImageUrl, thumbnailUrl: form.messageThumbnailUrl, linkUrl: form.messageLinkUrl, buttonLabel: form.messageButtonLabel, footer: form.messageFooter, version: form.messageVersion, environment: form.messageEnvironment, confirmation: form.messageConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, messageConfirmation: "" }));
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la publication.");
        }
    }
    async function setupTemporaryVoice() {
        setNotice("Configuration des salons vocaux…");
        try {
            const r = await fetch(`${API}/voice/setup`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, categoryId: form.voiceCategoryId, hubName: form.voiceHubName, defaultLimit: form.voiceDefaultLimit, confirmation: form.voiceConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, voiceConfirmation: "" }));
            await refresh(selectedGuild);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la configuration vocale.");
        }
    }
    async function reviewSuggestion(suggestionId: string, status: "accepted" | "rejected") {
        setNotice("Mise à jour de la suggestion…");
        try {
            const r = await fetch(`${API}/suggestions/review`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, suggestionId, status, confirmation: "CONFIRMER" }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            await refresh(selectedGuild, false);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la décision.");
        }
    }
    async function loadCreatorStats() {
        setNotice("Chargement de l’espace Créateur…");
        try {
            const [statsResponse, staffResponse] = await Promise.all([
                fetch(`${API}/creator/stats`, { credentials: "include" }),
                fetch(`${API}/support/staff`, { credentials: "include" }),
            ]);
            const [statsPayload, staffPayload] = await Promise.all([statsResponse.json(), staffResponse.json()]);
            if (!statsResponse.ok)
                throw Error(statsPayload.error);
            if (!staffResponse.ok)
                throw Error(staffPayload.error);
            setCreatorStats(statsPayload);
            setSupportStaff(staffPayload.staff || []);
            setNotice("");
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Statistiques indisponibles.");
        }
    }
    async function grantSupportRole() {
        setNotice("Attribution des droits Support…");
        try {
            const response = await fetch(`${API}/support/staff/upsert`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ userId: form.supportStaffUserId, role: form.supportStaffRole }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setSupportStaff(payload.staff || []);
            setForm(current => ({ ...current, supportStaffUserId: "", supportStaffConfirmation: "" }));
            setNotice(`✓ ${payload.member.displayName} possède maintenant les droits ${payload.member.role === "administrator" ? "Administrateur" : "Modérateur"}`);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Attribution des droits impossible.");
        }
    }
    async function removeSupportRole(userId: string) {
        const member = supportStaff.find(item => item.userId === userId);
        if (!window.confirm(`Retirer les droits Support de ${member?.displayName || userId} ?`))
            return;
        setNotice("Retrait des droits Support…");
        try {
            const response = await fetch(`${API}/support/staff/remove`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ userId }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setSupportStaff(payload.staff || []);
            setNotice("✓ Droits Support retirés");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Retrait des droits impossible.");
        }
    }
    async function loadWarnings() {
        if (!form.moderationMemberId)
            return;
        setNotice("Chargement des avertissements…");
        try {
            const query = new URLSearchParams({ guildId: selectedGuild, memberId: form.moderationMemberId });
            const r = await fetch(`${API}/moderation/warnings?${query}`, { credentials: "include" }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setMemberWarnings(n.warnings);
            setNotice("");
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Historique indisponible.");
        }
    }
    async function logout() {
        setNotice("Déconnexion…");
        try {
            const r = await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken, false) });
            if (!r.ok)
                throw Error("Déconnexion impossible.");
            setAuthenticated(false);
            setCsrfToken("");
            setAccount(null);
            setData(null);
            setCreatorStats(null);
            setSupportStaff([]);
            setMemberWarnings(null);
            setSupportWorkspace(null);
            setSupportConversation(null);
            setSupportComposing(false);
            setSelectedGuild("");
            setForm({});
            setActive("Vue d’ensemble");
            setNotice("");
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Déconnexion impossible.");
        }
    }
    const securityScore = data ? Math.round((data.metrics.securityRules / 4) * 100) : null;
    const configuredModules = data ? [data.config.logs, data.config.tickets, data.config.suggestions, data.config.welcome, data.config.rules, data.config.birthdays, data.config.social, data.config.temporaryVoice].filter(Boolean).length : 0;
    const modules = [{ icon: "⚙️", name: "Configuration", detail: "Préparer ce serveur", tone: "orange" }, { icon: "✉️", name: "Messages", detail: "Texte, embeds et images", tone: "orange" }, { icon: "🎫", name: "Tickets", detail: `${data?.metrics.openTickets ?? 0} ticket(s) ouvert(s)`, tone: "violet" }, { icon: "📜", name: "Règlement", detail: data?.config.rules ? "Publié et modifiable" : "À configurer", tone: "orange" }, { icon: "🎂", name: "Anniversaires", detail: `${Object.keys(data?.config.birthdays?.birthdays || {}).length} date(s) enregistrée(s)`, tone: "violet" }, { icon: "📣", name: "Social", detail: data?.config.social ? "Notifications prêtes" : "À configurer", tone: "orange" }, { icon: "🔊", name: "Vocaux", detail: `${Object.keys(data?.config.temporaryVoice?.rooms || {}).length} salon(s) temporaire(s)`, tone: "blue" }, { icon: "🛡️", name: "Sécurité", detail: `${data?.metrics.securityRules ?? 0} protections actives`, tone: "green" }, { icon: "👋", name: "Accueil", detail: "Bienvenue et rôles", tone: "blue" }, { icon: "🧾", name: "Logs", detail: "Journal centralisé", tone: "orange" }];
    const busy = notice.endsWith("…") && notice !== "Connexion à FyxBot…";
    useEffect(() => {
        document.body.dataset.dashboardView = active === "Vue d’ensemble" ? "overview" : "module";
        const content = document.querySelector<HTMLElement>(".content");
        content?.setAttribute("aria-busy", String(busy));
        let status = document.querySelector<HTMLElement>("#fyxbot-live-status");
        if (!status) {
            status = document.createElement("p");
            status.id = "fyxbot-live-status";
            status.setAttribute("role", "status");
            status.setAttribute("aria-live", "polite");
            document.body.appendChild(status);
        }
        status.className = authenticated === true && notice ? "fyxbot-status" : "sr-only";
        status.textContent = notice;
        return () => content?.removeAttribute("aria-busy");
    }, [active, authenticated, busy, notice]);
    function config() {
        if (!data)
            return <div className="settings"><div><h2>Connexion au bot…</h2><p>{notice}</p></div></div>;
        if (active === "Assistance FyxBot")
            return <SupportDashboard workspace={supportWorkspace} conversation={supportConversation} composing={supportComposing} form={form} update={update} selectRequest={id => void selectSupportRequest(id)} startRequest={startSupportRequest} createRequest={() => void createSupportTicket()} reply={() => void replyToSupport()} updateRequest={() => void manageSupportRequest()}/>;
        if (active === "Compte")
            return <section className="account-panel"><div className="account-avatar">{account?.username?.slice(0, 1).toUpperCase() || "?"}</div><div><p className="eyebrow">SESSION DISCORD</p><h2>{account?.username || "Compte connecté"}</h2><p>Tu accèdes uniquement aux serveurs Discord que tu peux administrer. La session expire automatiquement après sept jours.</p></div><button onClick={logout}>Se déconnecter</button></section>;
        if (active === "Modération")
            return <ModerationDashboard data={data} form={form} update={update} moderate={moderate} warnings={memberWarnings} loadWarnings={loadWarnings} setWarnings={setMemberWarnings}/>;
        if (active === "Créateur" && !data.creatorAccess)
            return <section className="creator-workspace"><div className="creator-empty"><p className="eyebrow">ACCÈS RESTREINT</p><h2>Espace privé FyxBot</h2><p>Cette section est réservée au propriétaire de l’application.</p></div></section>;
        if (active === "Créateur" && creatorStats)
            return <CreatorDashboard stats={creatorStats as CreatorStats & UsageStats} supportStaff={supportStaff} form={form} update={update} grantSupportRole={() => void grantSupportRole()} removeSupportRole={userId => void removeSupportRole(userId)}/>;
        if (active === "Créateur")
            return <section className="creator-workspace">{!creatorStats ? <div className="creator-empty"><p className="eyebrow">ESPACE PRIVÉ</p><h2>Observatoire FyxBot</h2><p>Consulte les installations et l’adoption de l’offre Fondateur Premium.</p><button onClick={loadCreatorStats}>Charger les statistiques</button></div> : <><div className="creator-metrics"><article><span>SERVEURS ACTIFS</span><strong>{creatorStats.guildCount}</strong><small>FyxBot installé actuellement</small></article><article><span>MEMBRES COUVERTS</span><strong>{creatorStats.memberCount.toLocaleString("fr-FR")}</strong><small>Total des communautés</small></article><article><span>INSTALLATIONS</span><strong>{creatorStats.allTime}</strong><small>Depuis le début du suivi</small></article><article><span>DÉSINSTALLATIONS</span><strong>{creatorStats.removed}</strong><small>Depuis le début du suivi</small></article></div><div className="creator-grid"><div className="creator-servers"><p className="eyebrow">SERVEURS ACTIFS</p><h2>Utilisation de FyxBot</h2>{creatorStats.installations.map(guild => <article key={guild.guildId}><div><strong>{guild.guildName}</strong><small>Suivi depuis le {new Date(guild.firstSeenAt).toLocaleDateString("fr-FR")}</small></div><b>{guild.memberCount.toLocaleString("fr-FR")} membres</b></article>)}</div><div className="premium-plan"><p className="eyebrow">OFFRE FONDATEUR</p><h2>Free + FyxBot Premium</h2><div><strong>Free</strong><p>Outils essentiels avec un panneau de tickets, un panneau de rôles et une source sociale.</p></div><div className="premium"><strong>Premium utilisateur</strong><p>Capacités renforcées sur tous les serveurs administrés par le bénéficiaire pendant son accès.</p></div><small>30 jours offerts aux 100 premiers utilisateurs · sans carte ni renouvellement automatique.</small></div></div></>}</section>;
        if (active === "Vue d’ensemble")
            return <section className="overview-panel" aria-label="État des services FyxBot"><div className="overview-head"><div><p className="eyebrow">CENTRE DE PILOTAGE</p><h2>Votre serveur en un coup d’œil</h2><p>{configuredModules}/8 modules principaux sont configurés sur {data.guild.name}.</p></div><button onClick={() => setActive("Configuration")}>Configurer le serveur</button></div><div className="health-grid"><article><span className="health-icon online">✓</span><div><strong>Bot Discord</strong><small>{data.bot.online ? "Connecté et opérationnel" : "Connexion indisponible"}</small></div></article><article><span className={`health-icon ${data.metrics.securityRules === 4 ? "online" : "warning"}`}>{data.metrics.securityRules === 4 ? "✓" : "!"}</span><div><strong>Protection AutoMod</strong><small>{data.metrics.securityRules}/4 règles actives</small></div></article><article><span className={`health-icon ${data.metrics.openTickets === 0 ? "online" : "warning"}`}>{data.metrics.openTickets}</span><div><strong>Support</strong><small>{data.metrics.openTickets === 0 ? "Aucune demande en attente" : "Ticket(s) à traiter"}</small></div></article></div><div className="quick-actions"><button onClick={() => setActive("Règlement")}><span>📜</span><strong>Publier le règlement</strong><small>Validation des membres</small></button><button onClick={() => setActive("Vocaux")}><span>🔊</span><strong>Gérer les vocaux</strong><small>Salons temporaires</small></button><button onClick={() => setActive("Social")}><span>📣</span><strong>Notifier la communauté</strong><small>Live ou nouvelle vidéo</small></button></div></section>;
        if (active === "Démarrage")
            return <OnboardingDashboard data={data} navigate={setActive}/>;
        if (active === "Premium")
            return <PremiumDashboard premium={data.premium} guildName={data.guild.name} activate={activateFounderAccess} busy={busy}/>;
        if (active === "Communauté")
            return <CommunityDashboard data={data} form={form} update={update} createEvent={createCommunityEvent} createGiveaway={createCommunityGiveaway} navigate={setActive}/>;
        if (active === "Configuration")
            return <SetupDashboard data={data} form={form} update={update} runSetup={runSetup}/>;
        if (active === "Messages")
            return <MessageComposer data={data} form={form} update={update} send={sendCustomMessage}/>;
        if (active === "Règlement")
            return <section className="community-workspace"><div className="settings community-settings"><div><p className="eyebrow">RÈGLEMENT INTERACTIF</p><h2>{data.config.rules ? "Modifier le règlement" : "Publier le règlement"}</h2><p>Publiez les règles du serveur et attribuez facultativement un rôle lorsque les membres les acceptent.</p></div><label>Titre<input value={form.rulesTitle || ""} onChange={e => update("rulesTitle")(e.target.value)} placeholder="Règlement du serveur"/></label><Select label="Salon de publication" value={form.rulesChannelId || ""} options={data.options.textChannels} onChange={update("rulesChannelId")}/><Select label="Rôle après acceptation" value={form.rulesRoleId || ""} options={[{ id: "", name: "Aucun rôle" }, ...data.options.roles]} onChange={update("rulesRoleId")}/><label className="wide full-row">Articles du règlement<textarea value={form.rulesContent || ""} onChange={e => update("rulesContent")(e.target.value)} maxLength={3900} rows={12} placeholder="1. Respect et bienveillance…"/></label><label>Confirmation<input value={form.rulesConfirmation || ""} onChange={e => update("rulesConfirmation")(e.target.value)} placeholder={data.config.rules ? "MODIFIER" : "PUBLIER"}/></label><button disabled={!form.rulesContent || !form.rulesTitle || (!data.config.rules && !form.rulesChannelId) || form.rulesConfirmation !== (data.config.rules ? "MODIFIER" : "PUBLIER")} onClick={publishRules}>{data.config.rules ? "Mettre à jour" : "Publier le règlement"}</button></div><div className="feature-note"><span>📜</span><div><strong>Commande Discord</strong><p>Les administrateurs disposent aussi de <code>/reglement modele</code>, <code>/reglement publier</code>, <code>/reglement modifier</code> et <code>/reglement statut</code>.</p></div></div></section>;
        if (active === "Anniversaires")
            return <section className="community-workspace"><div className="settings community-settings"><div><p className="eyebrow">ANNIVERSAIRES</p><h2>Annonces automatiques</h2><p>{Object.keys(data.config.birthdays?.birthdays || {}).length} membre(s) ont volontairement enregistré une date. L’année de naissance n’est jamais demandée.</p></div><Select label="Salon des annonces" value={form.birthdayChannelId || ""} options={data.options.textChannels} onChange={update("birthdayChannelId")}/><Select label="Rôle temporaire" value={form.birthdayRoleId || ""} options={[{ id: "", name: "Aucun rôle" }, ...data.options.roles]} onChange={update("birthdayRoleId")}/><label>Fuseau horaire<select value={form.birthdayTimezone || "Europe/Paris"} onChange={e => update("birthdayTimezone")(e.target.value)}><option>Europe/Paris</option><option>UTC</option><option>America/Montreal</option><option>Indian/Reunion</option></select></label><label className="wide full-row">Message<input value={form.birthdayMessage || ""} onChange={e => update("birthdayMessage")(e.target.value)} placeholder="Joyeux anniversaire {membres}…"/></label><button disabled={!form.birthdayChannelId} onClick={() => save("birthdays", { channelId: form.birthdayChannelId, roleId: form.birthdayRoleId, timezone: form.birthdayTimezone, message: form.birthdayMessage })}>Enregistrer</button></div><div className="feature-note"><span>🎂</span><div><strong>Inscription volontaire</strong><p>Chaque membre utilise <code>/anniversaire definir</code>. Il peut consulter ou supprimer sa date à tout moment.</p></div></div></section>;
        if (active === "Social")
            return <SocialDashboard data={data} form={form} update={update} save={() => void save("social", { channelId: form.socialChannelId, roleId: form.socialRoleId })} publish={sendSocialNotification} manageSource={manageSocialSource}/>;
        if (active === "Vocaux")
            return <section className="community-workspace"><div className="settings community-settings"><div><p className="eyebrow">SALONS VOCAUX TEMPORAIRES</p><h2>{data.config.temporaryVoice ? "Modifier le générateur" : "Créer le générateur"}</h2><p>Lorsqu’un membre rejoint le générateur, FyxBot crée son salon personnel puis le supprime lorsqu’il est vide.</p></div><Select label="Catégorie" value={form.voiceCategoryId || ""} options={data.options.categories} onChange={update("voiceCategoryId")}/><label>Nom du générateur<input value={form.voiceHubName || ""} onChange={e => update("voiceHubName")(e.target.value)} placeholder="➕ Créer un salon"/></label><label>Limite par défaut<input type="number" min="0" max="99" value={form.voiceDefaultLimit || "0"} onChange={e => update("voiceDefaultLimit")(e.target.value)}/></label><label>Confirmation<input value={form.voiceConfirmation || ""} onChange={e => update("voiceConfirmation")(e.target.value)} placeholder="CONFIGURER"/></label><button disabled={!form.voiceCategoryId || form.voiceConfirmation !== "CONFIGURER"} onClick={setupTemporaryVoice}>Configurer les salons vocaux</button></div><div className="feature-note"><span>🔊</span><div><strong>{Object.keys(data.config.temporaryVoice?.rooms || {}).length} salon(s) actif(s)</strong><p>Les propriétaires peuvent renommer, limiter, verrouiller, autoriser, expulser ou transférer leur salon avec <code>/vocal-temporaire</code>.</p></div></div></section>;
        if (active === "Tickets")
            return <section className="ticket-workspace"><div className="settings ticket-library"><div><p className="eyebrow">MES PANNEAUX</p><h2>Panneaux existants</h2><p>Retrouvez et modifiez les demandes déjà configurées.</p></div><Select label="Panneau à modifier" value={form.ticketPanelId || ""} options={(data.config.tickets?.panels || []).map(panel => ({ id: panel.id, name: panel.title }))} onChange={selectTicketPanel}/><label>Confirmation<input value={form.ticketEditConfirmation || ""} onChange={e => update("ticketEditConfirmation")(e.target.value)} placeholder="MODIFIER"/></label><button disabled={!form.ticketPanelId || form.ticketEditConfirmation !== "MODIFIER"} onClick={updateTicketPanel}>Enregistrer les modifications</button></div><div className="settings ticket-settings"><div><p className="eyebrow">TICKETS MULTI-DEMANDES</p><h2>{form.ticketPanelId ? "Modifier le panneau" : "Nouveau panneau"}</h2><p>Changez les champs après avoir sélectionné un panneau, ou publiez-en un nouveau.</p></div><label>Titre du panneau<input value={form.ticketTitle || ""} onChange={e => update("ticketTitle")(e.target.value)} placeholder="Ex. Recrutement"/></label><label>Type de demande<input value={form.ticketRequestType || ""} onChange={e => update("ticketRequestType")(e.target.value)} placeholder="Ex. candidature"/></label><Select label="Salon du panneau" value={form.ticketPanelChannelId || ""} options={data.options.textChannels} onChange={update("ticketPanelChannelId")}/><Select label="Catégorie des tickets" value={form.categoryId} options={data.options.categories} onChange={update("categoryId")}/><Select label="Rôle responsable" value={form.staffRoleId} options={data.options.roles} onChange={update("staffRoleId")}/><label>Confirmation<input value={form.ticketPublishConfirmation || ""} onChange={e => update("ticketPublishConfirmation")(e.target.value)} placeholder="PUBLIER"/></label><button disabled={form.ticketPublishConfirmation !== "PUBLIER" || !form.ticketPanelChannelId || !form.categoryId || !form.staffRoleId || !form.ticketTitle || !form.ticketRequestType} onClick={publishTicketPanel}>Publier comme nouveau panneau</button></div><div className="feature-note"><span>🔓</span><div><strong>Archives réouvrables</strong><p>À la fermeture, le staff peut conserver le salon comme archive, le réouvrir ou le supprimer. Les nouveaux salons utilisent le format <code>🎫・ticket-nom</code>.</p></div></div></section>;
        if (active === "Accueil")
            return <div className="settings welcome-settings"><div><p className="eyebrow">ACCUEIL</p><h2>Nouveaux membres</h2><p>Salons, messages et rôle automatique.</p></div><Select label="Bienvenue" value={form.welcomeChannelId} options={data.options.textChannels} onChange={update("welcomeChannelId")}/><Select label="Départs" value={form.leaveChannelId} options={data.options.textChannels} onChange={update("leaveChannelId")}/><Select label="Rôle automatique" value={form.autoRoleId} options={data.options.roles} onChange={update("autoRoleId")}/><label className="wide">Message de bienvenue<input value={form.welcomeMessage} onChange={e => update("welcomeMessage")(e.target.value)} placeholder="Bienvenue {membre}…"/></label><label className="wide">Message de départ<input value={form.leaveMessage} onChange={e => update("leaveMessage")(e.target.value)} placeholder="{membre} a quitté…"/></label><button onClick={() => save("welcome", form)}>Enregistrer</button></div>;
        if (active === "Suggestions")
            return <section className="suggestions-workspace"><div className="settings"><div><p className="eyebrow">SUGGESTIONS</p><h2>Idées de la communauté</h2><p>Choisissez le salon dans lequel les membres voteront.</p></div><Select label="Salon" value={form.suggestionChannelId} options={data.options.textChannels} onChange={update("suggestionChannelId")}/><span /><button onClick={() => save("suggestions", { channelId: form.suggestionChannelId })}>Enregistrer</button></div><div className="suggestions-panel"><div><p className="eyebrow">FILE DE DÉCISION</p><h2>Suggestions récentes</h2><p>Acceptez ou refusez les propositions reçues avec la commande /suggestion. Une décision peut être changée.</p></div><div className="suggestions-list">{data.recentSuggestions.length === 0 ? <p>Aucune nouvelle suggestion enregistrée.</p> : data.recentSuggestions.map(item => <article key={item.id}><div className="suggestion-meta"><span className={`suggestion-status ${item.status}`}>{item.status === "pending" ? "En attente" : item.status === "accepted" ? "Acceptée" : "Refusée"}</span><small>{item.authorName} · {new Date(item.createdAt).toLocaleString("fr-FR")}</small></div><strong>Suggestion {item.id}</strong><p>{item.idea}</p><div className="suggestion-actions"><button disabled={item.status === "accepted"} onClick={() => reviewSuggestion(item.id, "accepted")}>✓ Accepter</button><button disabled={item.status === "rejected"} className="reject" onClick={() => reviewSuggestion(item.id, "rejected")}>× Refuser</button></div></article>)}</div></div></section>;
        if (active === "Sécurité")
            return <div className="settings security-settings"><div><p className="eyebrow">AUTOMOD</p><h2>Protection du serveur</h2><p>{data.metrics.securityRules}/4 règles FyxBot actives : liens, invitations, spam et mentions excessives.</p></div><div className="security-badge">🛡️ AutoMod Discord</div><button onClick={() => toggleSecurity(true)}>Activer les 4 protections</button><button className="security-off" onClick={() => toggleSecurity(false)}>Désactiver</button></div>;
        if (active === "Modération")
            return <section className="management-panel"><div><p className="eyebrow">BOÎTE À OUTILS</p><h2>Modération FyxBot</h2><p>Choisissez un membre et confirmez explicitement chaque sanction.</p></div><div className="command-grid">{[["🔨", "/ban", "Bannir un membre"], ["👢", "/kick", "Expulser un membre"], ["⏱️", "/timeout", "Exclure temporairement"], ["⚠️", "/warn", "Ajouter un avertissement"], ["📋", "/warnings", "Consulter l’historique"], ["🧹", "/clear", "Nettoyer des messages"]].map(([icon, command, label]) => <article key={command}><span>{icon}</span><div><strong>{command}</strong><small>{label}</small></div></article>)}</div><div className="moderation-form"><Select label="Membre" value={form.moderationMemberId || ""} options={data.options.members} onChange={update("moderationMemberId")}/><label>Action<select value={form.moderationAction || "warn"} onChange={e => update("moderationAction")(e.target.value)}><option value="warn">Avertir</option><option value="timeout">Timeout</option><option value="kick">Expulser</option><option value="ban">Bannir</option></select></label><label>Motif<input value={form.moderationReason || ""} onChange={e => update("moderationReason")(e.target.value)} placeholder="Motif obligatoire"/></label><label>Confirmation<input value={form.moderationConfirmation || ""} onChange={e => update("moderationConfirmation")(e.target.value)} placeholder="CONFIRMER"/></label><button disabled={!form.moderationMemberId || !form.moderationReason || form.moderationConfirmation !== "CONFIRMER"} onClick={moderate}>Appliquer la sanction</button></div></section>;
        if (active === "Rôles")
            return <section className="role-workspace"><div className="settings role-library"><div><p className="eyebrow">MES PANNEAUX</p><h2>Panneaux de rôles</h2><p>Retrouvez un panneau publié pour modifier ses boutons.</p></div><Select label="Panneau à modifier" value={form.rolePanelId || ""} options={data.config.rolePanels.map(panel => ({ id: panel.id, name: panel.title }))} onChange={selectRolePanel}/><label>Confirmation<input value={form.rolePanelEditConfirmation || ""} onChange={e => update("rolePanelEditConfirmation")(e.target.value)} placeholder="MODIFIER"/></label><button disabled={!form.rolePanelId || form.rolePanelEditConfirmation !== "MODIFIER" || roleIds().length === 0} onClick={updateRolePanel}>Enregistrer les modifications</button></div><div className="settings role-settings"><div><p className="eyebrow">RÔLES INTERACTIFS</p><h2>{form.rolePanelId ? "Modifier le panneau" : "Nouveau panneau"}</h2><p>Les membres pourront ajouter ou retirer eux-mêmes les rôles choisis.</p></div><label>Titre<input value={form.rolePanelTitle || ""} onChange={e => update("rolePanelTitle")(e.target.value)} placeholder="Choisissez vos rôles"/></label><label className="wide">Description<input value={form.rolePanelDescription || ""} onChange={e => update("rolePanelDescription")(e.target.value)} placeholder="Cliquez sur un bouton…"/></label><Select label="Salon de publication" value={form.rolePanelChannelId || ""} options={data.options.textChannels} onChange={update("rolePanelChannelId")}/>{[1, 2, 3, 4, 5].map(index => <Select key={index} label={`Rôle ${index}${index === 1 ? " (obligatoire)" : ""}`} value={form[`rolePanelRole${index}`] || ""} options={[{ id: "", name: "Aucun" }, ...data.options.roles]} onChange={update(`rolePanelRole${index}`)}/>)}<label>Confirmation<input value={form.rolePanelPublishConfirmation || ""} onChange={e => update("rolePanelPublishConfirmation")(e.target.value)} placeholder="PUBLIER"/></label><button disabled={form.rolePanelPublishConfirmation !== "PUBLIER" || !form.rolePanelChannelId || !form.rolePanelTitle || roleIds().length === 0} onClick={publishRolePanel}>Publier comme nouveau panneau</button></div></section>;
        return <section className="logs-workspace"><div className="settings"><div><p className="eyebrow">PARAMÈTRES</p><h2>Journal FyxBot</h2><p>Salon central pour les logs et transcripts.</p></div><Select label="Salon des logs" value={form.logChannelId} options={data.options.textChannels} onChange={update("logChannelId")}/><span /><button onClick={() => save("logs", { channelId: form.logChannelId })}>Enregistrer</button></div><div className="logs-panel"><div><p className="eyebrow">HISTORIQUE RÉCENT</p><h2>Activité du serveur</h2></div><div className="logs-list">{data.recentLogs.length === 0 ? <p>Aucune nouvelle activité enregistrée.</p> : data.recentLogs.map(log => <article key={log.id}><span>●</span><div><strong>{log.title}</strong><p>{log.description.replaceAll(/[*<>]/g, "")}</p></div><time>{new Date(log.createdAt).toLocaleString("fr-FR")}</time></article>)}</div></div></section>;
    }
    if (authenticated !== true)
        return <main className="login-screen"><section className="login-card"><div className="brand login-brand"><Image className="brand-logo" src="/brand/fyxbot-logo-symbol.svg" alt="" width={40} height={40}/><div><strong>FYXBOT</strong><small>CONTROL CENTER · v{CURRENT_RELEASE.version}</small></div></div><div className="login-mascot-stage"><Image className="login-mascot" src="/mascotte-fyxbot-640.webp" alt="Mascotte robot FyxBot" width={640} height={640} priority/><span className="login-mascot-shadow" aria-hidden="true"/></div><p className="eyebrow">BOT DISCORD PUBLIC</p><h1>Ajoutez FyxBot à votre serveur Discord</h1><p>Modérez votre communauté, gérez les tickets, renforcez la sécurité et automatisez l’accueil et les rôles avec FyxBot.</p><div className="login-actions"><a className="invite-public" href={INVITE_URL} target="_blank" rel="noreferrer">Inviter FyxBot</a><a className="login-discord" href={`${API}/auth/login`}>Se connecter au panel</a></div></section></main>;
    return <main className="shell"><aside className="sidebar"><div className="brand"><Image className="brand-logo" src="/brand/fyxbot-logo-symbol.svg" alt="" width={40} height={40}/><div><strong>FYXBOT</strong><small>CONTROL CENTER · v{CURRENT_RELEASE.version}</small></div></div><nav className="desktop-navigation" aria-label="Navigation principale">{navigationGroups.map(group => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map(i => <button type="button" title={i} className={active === i ? "active" : ""} key={i} onClick={() => setActive(i)} aria-current={active === i ? "page" : undefined}><span className="nav-icon" aria-hidden="true">{icons[i]}</span><span className="nav-label">{i}</span></button>)}</div>)}</nav><nav className="mobile-navigation" aria-label="Navigation mobile">{mobilePrimaryNavigation.map(i => <button type="button" title={i} className={active === i ? "active" : ""} key={i} onClick={() => { setActive(i); setMobileNavOpen(false); }} aria-current={active === i ? "page" : undefined}><span className="nav-icon" aria-hidden="true">{icons[i]}</span><span className="nav-label">{i === "Vue d’ensemble" ? "Accueil" : i}</span></button>)}<button type="button" title="Plus de modules" className={!mobilePrimarySet.has(active) || mobileNavOpen ? "active" : ""} onClick={() => setMobileNavOpen(open => !open)} aria-expanded={mobileNavOpen} aria-controls="mobile-navigation-sheet"><span className="nav-icon" aria-hidden="true">☰</span><span className="nav-label">Plus</span></button></nav><div className={`sidebar-foot ${accountMenuOpen ? "open" : ""}`}>{accountMenuOpen && <div className="account-popover" role="dialog" aria-label="Compte Discord"><p>Compte connecté</p><strong>{account?.username || "Compte Discord"}</strong><button type="button" onClick={() => { setAccountMenuOpen(false); void logout(); }}>Se déconnecter</button></div>}<button type="button" className="account-summary" onClick={() => setAccountMenuOpen(open => !open)} aria-expanded={accountMenuOpen}><span className="account-mini-avatar">{account?.username?.slice(0, 1).toUpperCase() || "?"}</span><span className="account-mini"><strong>{account?.username || "Compte Discord"}</strong><small><i /> Connecté</small></span><b>⌃</b></button></div></aside>{mobileNavOpen && <div className="mobile-nav-backdrop"><section id="mobile-navigation-sheet" className="mobile-nav-sheet" role="dialog" aria-modal="true" aria-label="Tous les modules FyxBot"><header><div><p className="eyebrow">NAVIGATION</p><h2>Tous les modules</h2></div><button type="button" className="mobile-nav-close" onClick={() => setMobileNavOpen(false)} aria-label="Fermer le menu">×</button></header>{navigationGroups.map(group => { const items = group.items.filter(item => !mobilePrimarySet.has(item)); return items.length > 0 && <div className="mobile-nav-group" key={group.label}><p>{group.label}</p><div>{items.map(i => <button type="button" key={i} className={active === i ? "active" : ""} onClick={() => { setActive(i); setMobileNavOpen(false); }}><span aria-hidden="true">{icons[i]}</span><strong>{i}</strong></button>)}</div></div>; })}<div className="mobile-account-card"><span className="account-mini-avatar">{account?.username?.slice(0, 1).toUpperCase() || "?"}</span><div><strong>{account?.username || "Compte Discord"}</strong><small>Compte connecté</small></div><button type="button" onClick={() => { setMobileNavOpen(false); void logout(); }}>Se déconnecter</button></div></section></div>}<section className="content"><header><div><p className="eyebrow">SERVEUR DISCORD</p><h1>{active}</h1><p>Pilotez votre communauté simplement avec FyxBot.</p></div><div className="header-actions"><a className="invite-server" href={INVITE_URL} target="_blank" rel="noreferrer">+ Inviter FyxBot</a><select aria-label="Serveur Discord" className="server" value={selectedGuild} onChange={e => refresh(e.target.value)}>{data?.guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div></header><div className="hero"><Image className="fyxbot-overview-banner" src="/brand/fyxbot-banner-discord.webp" alt="" fill sizes="(max-width: 650px) 100vw, (max-width: 1000px) calc(100vw - 78px), calc(100vw - 250px)" priority/><div><span className="live"><i /> {data?.bot.online ? "BOT OPÉRATIONNEL" : "CONNEXION EN COURS"}</span><h2>{data ? `${data.guild.name} est entre de bonnes mains.` : "Connexion à votre serveur…"}</h2><p>{notice || (data?.metrics.securityRules === 4 ? "Toutes les protections FyxBot sont actives." : "Quelques réglages peuvent encore renforcer votre serveur.")}</p><div className="hero-actions"><button onClick={() => setActive("Sécurité")}>Voir la sécurité</button><button className="secondary" onClick={() => setActive("Assistance FyxBot")}>Contacter FyxBot</button></div></div><div className="score"><strong>{securityScore ?? "--"}</strong><span>/100</span><small>SCORE DE SÉCURITÉ</small></div></div><div className="stats"><article><span>MEMBRES</span><strong>{data?.guild.members ?? "—"}</strong><small>Serveur actuel</small></article><article><span>COMMANDES</span><strong>{data?.metrics.commands ?? "—"}</strong><small>Disponibles</small></article><article><span>TICKETS OUVERTS</span><strong>{data?.metrics.openTickets ?? "—"}</strong><small>Tickets Discord actifs</small></article><article><span>LATENCE</span><strong>{data ? `${data.bot.ping} ms` : "—"}</strong><small>Discord Gateway</small></article></div><div className="section-title"><div><p className="eyebrow">CONFIGURATION RAPIDE</p><h2>Modules FyxBot</h2></div><span>{configuredModules}/8 configurés</span></div><div className="module-grid">{modules.map(m => <article key={m.name} className={`module ${m.tone}`}><div className="module-icon">{m.icon}</div><div><h3>{m.name}</h3><p>{m.detail}</p></div><button onClick={() => setActive(m.name)} aria-label={`Configurer ${m.name}`}>Configurer →</button></article>)}</div>{config()}</section></main>;
}
