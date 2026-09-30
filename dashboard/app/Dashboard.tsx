"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import releaseManifest from "./release-manifest.json";
import StreamingDashboard from "./StreamingDashboard";
import FyxFlowDashboard from "./FyxFlowDashboard";
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
type FyxFlowConfig = {
    flows: {
        id: string;
        name: string;
        trigger: "member_join" | "member_leave" | "rules_accepted" | "ticket_created";
        action: { type: "send_message"; channelId: string; message: string } | { type: "assign_role"; roleId: string };
        actions?: ({ type: "send_message"; channelId: string; message: string } | { type: "assign_role"; roleId: string })[];
        active: boolean;
        createdAt: string;
        updatedAt: string;
    }[];
    history: {
        id: string;
        flowId: string;
        flowName: string;
        trigger: string;
        status: "success" | "failed";
        detail: string;
        executedAt: string;
    }[];
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
type ChangeHistory = {
    id: string;
    actorName: string;
    kind: string;
    title: string;
    summary: string;
    details: Record<string, unknown>;
    reversible: boolean;
    hasBackup: boolean;
    status: "applied" | "rolled_back";
    createdAt: string;
    rolledBackAt: string | null;
    rolledBackBy: string | null;
};
type ContentLibraryItem = {
    id: string;
    kind: string;
    title: string;
    description: string;
    target: string;
    publicationId?: string;
    entityId?: string;
    updatedAt: string | null;
    editable: boolean;
    removable: boolean;
};
type ContentTrashItem = {
    id: string;
    kind: string;
    title: string;
    target: string;
    removedAt: string;
    expiresAt: string;
};
type PublishedMessage = {
    id: string;
    messageId: string;
    channelId: string;
    channelName: string;
    content: string;
    title: string;
    description: string;
    color: string;
    imageUrl: string;
    thumbnailUrl: string;
    linkUrl: string;
    buttonLabel: string;
    footer: string;
    createdAt: string;
    updatedAt: string;
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
        stalledGuilds7d: number;
        averageCompletedSteps: number;
        steps: {
            key: string;
            title: string;
            completedGuilds: number;
            rate: number;
        }[];
        completionDistribution: {
            key: string;
            title: string;
            guilds: number;
        }[];
    };
    manualPremiumGrants: ManualPremiumGrant[];
};
type ManualPremiumGrant = {
    grantId: string;
    userId: string;
    displayName: string;
    reason: string;
    startsAt: string;
    endsAt: string | null;
    grantedBy: string;
    revokedAt: string | null;
    revokedBy: string | null;
    createdAt: string;
    active: boolean;
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
    guildName?: string | null;
    description: string;
    detectedNeeds: string[];
    roles: {
        key: string;
        name: string;
        color?: number;
        staff?: boolean;
    }[];
    categories: {
        key: string;
        name: string;
        permissionProfile?: string;
    }[];
    explanations?: {
        categoryKey: string;
        name: string;
        reason: string;
    }[];
    channels: {
        key: string;
        category: string;
        name: string;
        type: "text" | "voice";
        permissionProfile?: string;
    }[];
};
type SetupSimulation = {
    previewOnly: true;
    before: { roles: number; categories: number; channels: number };
    desired: { roles: number; categories: number; channels: number };
    additions: string[];
    movements: string[];
    permissionChanges: string[];
    preserved: string[];
    removals: string[];
    permissionPreview: {
        key: string;
        name: string;
        profile: string;
        access: { role: string; label: string; tone: "hidden" | "read" | "write" | "control" }[];
        channelOverrides: {
            name: string;
            access: { role: string; label: string; tone: "hidden" | "read" | "write" | "control" }[];
        }[];
    }[];
    totalChanges: number;
    plans: Record<SetupMode, {
        risk: "low" | "guarded" | "critical";
        creates: number;
        updates: number;
        deletes: number;
        preserves: number;
        projected: { roles: number; categories: number; channels: number };
    }>;
};
type PermissionRoleOption = Option & {
    color?: string;
    everyone?: boolean;
};
type RolePerspective = {
    previewOnly: true;
    guild: { id: string; name: string };
    subject: {
        type: "role" | "member";
        id: string;
        name: string;
        color: string;
        everyone: boolean;
        elevated: boolean;
        roleNames: string[];
        roleCount: number;
    };
    summary: {
        total: number;
        visible: number;
        hidden: number;
        read: number;
        write: number;
        control: number;
    };
    warnings: {
        code: string;
        severity: "critical" | "warning";
        title: string;
        detail: string;
    }[];
    categories: {
        id: string;
        name: string;
        channels: {
            id: string;
            name: string;
            kind: "text" | "voice" | "other";
            visible: boolean;
            canReadHistory: boolean;
            canWrite: boolean;
            canManage: boolean;
            tone: "hidden" | "read" | "write" | "control";
            label: string;
        }[];
    }[];
};
type OnboardingStep = {
    key: string;
    title: string;
    description: string;
    target: string;
    status: "complete" | "attention" | "missing";
    score: number;
    maxScore: number;
    issues: string[];
    impact: string;
    complete: boolean;
};
type OnboardingProgress = {
    completedCount: number;
    totalCount: number;
    percent: number;
    healthScore: number;
    complete: boolean;
    steps: OnboardingStep[];
    diagnostics: OnboardingStep[];
    recommendations: OnboardingStep[];
    recommendedStep: OnboardingStep | null;
    summary: {
        ready: number;
        attention: number;
        missing: number;
    };
    healthLevel: "new" | "starting" | "progressing" | "ready";
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
    sourceOfTruth: "manual-access" | "founder-access" | "discord-entitlements" | "free";
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
    manual: {
        userActive: boolean;
        guildActive: boolean;
        linkedToGuild: boolean;
        grant: ManualPremiumGrant | null;
    };
    roleConfig: {
        paidRoleId: string | null;
        complimentaryRoleId: string | null;
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
        botNickname: string | null;
        botDisplayName: string;
    };
    metrics: {
        commands: number;
        openTickets: number;
        securityRules: number;
    };
    recentLogs: AuditLog[];
    changeHistory: ChangeHistory[];
    recentSuggestions: Suggestion[];
    publishedMessages: PublishedMessage[];
    contentLibrary: ContentLibraryItem[];
    contentTrash: ContentTrashItem[];
    setupBlueprint: SetupBlueprint | null;
    setupAnalysis: SetupAnalysis;
    setupSimulation: SetupSimulation | null;
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
        permissionRoles: PermissionRoleOption[];
        assignableRoles: Option[];
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
        fyxFlow: FyxFlowConfig;
    };
};
const icons: Record<string, string> = { "Vue d’ensemble": "🏠", Pilotage: "🧭", FyxFlow: "⚡", Modération: "⚔️", Messages: "✉️", Tickets: "🎫", Règlement: "📜", Anniversaires: "🎂", Social: "📣", FyxStream: "🟣", Communauté: "🤝", Vocaux: "🔊", Accueil: "👋", Rôles: "🎭", Suggestions: "💡", Sécurité: "🛡️", Logs: "🧾", Premium: "💎", "Assistance FyxBot": "🛟", Créateur: "👑" };
const navigationGroups = [
    { label: "Piloter", items: ["Vue d’ensemble", "Pilotage", "FyxFlow"] },
    { label: "Communauté", items: ["Messages", "Tickets", "Règlement", "Anniversaires", "Social", "Communauté", "Vocaux", "Accueil", "Rôles", "Suggestions"] },
    { label: "Modération et sécurité", items: ["Modération", "Sécurité", "Logs"] },
    { label: "Administration", items: ["Premium", "Assistance FyxBot", "Créateur"] },
] as const;
const mobilePrimaryNavigation = ["Vue d’ensemble", "Pilotage", "Messages", "Communauté"] as const;
const mobilePrimarySet = new Set<string>(mobilePrimaryNavigation);
type InterfaceMode = "simple" | "advanced";
type PanelAlert = {
    id: string;
    icon: string;
    title: string;
    detail: string;
    target: string;
    tone: "critical" | "warning" | "info";
};
const FYXBOT_INTERFACE_MODE_KEY = "fyxbot:interface-mode";
const FYXBOT_FAVORITES_KEY = "fyxbot:favorites";
const SIMPLE_NAVIGATION_ITEMS = new Set([
    "Vue d’ensemble",
    "Pilotage",
    "FyxFlow",
    "Messages",
    "Tickets",
    "Règlement",
    "Social",
    "Communauté",
    "Sécurité",
    "Assistance FyxBot",
]);
function normalizeDashboardView(view: string) {
    if (["FyxPilot", "Démarrage", "Configuration"].includes(view))
        return "Pilotage";
    if (view === "Streaming")
        return "FyxStream";
    return view;
}
const API = import.meta.env.VITE_FYXBOT_API_URL?.replace(/\/$/, "") ||
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
    canReopen?: boolean;
    reopenUntil?: string | null;
    expiresAt?: string | null;
    messageCount?: number;
    lastAuthorRole?: "user" | "staff";
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
    canDeleteRequests: boolean;
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
        actionRequired: number;
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
function CreatorDashboard({ stats, supportStaff, form, update, grantSupportRole, removeSupportRole, grantPremiumAccess, revokePremiumAccess, leaveGuild }: {
    stats: CreatorStats & UsageStats;
    supportStaff: SupportStaffMember[];
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    grantSupportRole: () => void;
    removeSupportRole: (userId: string) => void;
    grantPremiumAccess: () => void;
    revokePremiumAccess: (userId: string) => void;
    leaveGuild: (guildId: string, guildName: string) => void;
}) {
    const maxUses = Math.max(...stats.topCommands.map(item => item.uses), 1);
    const activation24h = stats.activation.activation24hRate === null ? "—" : `${stats.activation.activation24hRate}%`;
    const removalGuild = stats.installations.find(guild => guild.guildId === form.creatorRemovalGuildId) || null;
    const activePremiumGrants = stats.manualPremiumGrants.filter(grant => grant.active).length;
    const commandSuccessRate = stats.totalCommands30d === 0
        ? "—"
        : `${Math.max(0, Math.round((1 - (stats.failedCommands30d / stats.totalCommands30d)) * 1000) / 10)}%`;
    const creatorStatus = stats.activation.stalledGuilds7d > 0 || stats.failedCommands30d > 0 ? "À surveiller" : "Sous contrôle";
    return <section className="creator-workspace">
        <div className="creator-command-center">
            <div className="creator-command-copy">
                <p className="eyebrow"><span aria-hidden="true"/> CENTRE DE PILOTAGE PRIVÉ</p>
                <h2>Une vue claire pour décider, agir et faire grandir FyxBot.</h2>
                <p>Suivez l’adoption, repérez les serveurs à accompagner et gérez les accès sensibles depuis un espace réservé au propriétaire.</p>
                <div className="creator-command-meta"><span>🔒 Accès propriétaire</span><span>● Données synchronisées</span><span>🧭 {stats.guildCount} serveur(s) suivis</span></div>
            </div>
            <aside className={creatorStatus === "Sous contrôle" ? "creator-network-status healthy" : "creator-network-status warning"}>
                <span>ÉTAT DU RÉSEAU</span>
                <strong>{creatorStatus}</strong>
                <p>{stats.activation.stalledGuilds7d > 0 ? `${stats.activation.stalledGuilds7d} serveur(s) n’ont pas progressé depuis 7 jours.` : "Aucun serveur ne nécessite de relance immédiate."}</p>
                <div><small>Fiabilité des commandes</small><b>{commandSuccessRate}</b></div>
            </aside>
        </div>
        <div className="creator-section-nav" role="navigation" aria-label="Sections de l’espace Créateur">
            <a href="#creator-overview">Vue globale</a><a href="#creator-adoption">Adoption</a><a href="#creator-usage">Usage</a><a href="#creator-premium">Premium</a><a href="#creator-team">Équipe</a>
        </div>
        <div className="creator-metrics" id="creator-overview">
            <article><div><i aria-hidden="true">◆</i><span>SERVEURS ACTIFS</span></div><strong>{stats.guildCount}</strong><small>{stats.allTime.toLocaleString("fr-FR")} installation(s) depuis le lancement</small></article>
            <article><div><i aria-hidden="true">◉</i><span>MEMBRES COUVERTS</span></div><strong>{stats.memberCount.toLocaleString("fr-FR")}</strong><small>Audience cumulée des communautés</small></article>
            <article><div><i aria-hidden="true">↗</i><span>COMMANDES · 30 JOURS</span></div><strong>{stats.totalCommands30d.toLocaleString("fr-FR")}</strong><small>{stats.commandActiveGuilds30d} serveur(s) ont utilisé une commande</small></article>
            <article className={stats.failedCommands30d > 0 ? "needs-attention" : "is-healthy"}><div><i aria-hidden="true">{stats.failedCommands30d > 0 ? "!" : "✓"}</i><span>FIABILITÉ</span></div><strong>{commandSuccessRate}</strong><small>{stats.failedCommands30d.toLocaleString("fr-FR")} erreur(s) sur 30 jours</small></article>
        </div>
        <div className="activation-analytics" id="creator-adoption">
            <div><p className="eyebrow">ACTIVATION DES SERVEURS</p><h2>Parcours guidé et rétention</h2><p>Un serveur est activé dès qu’il termine {stats.activation.threshold} étapes sur {stats.activation.totalSteps}. Les compteurs ne contiennent ni utilisateur, ni argument de commande.</p></div>
            <div className="activation-summary">
                <article><strong>{stats.activation.currentActivatedGuilds}/{stats.guildCount}</strong><small>serveurs activés</small></article>
                <article><strong>{stats.activation.activationRate}%</strong><small>activation actuelle</small></article>
                <article><strong>{stats.activation.activeGuilds30d}</strong><small>actifs sur 30 jours</small></article>
                <article><strong>{activation24h}</strong><small>activation en 24 h</small></article>
                <article><strong>{stats.activation.stalledGuilds7d}</strong><small>à relancer depuis 7 jours</small></article>
            </div>
            <div className="activation-funnel">{stats.activation.steps.map(step => <article key={step.key}><div><strong>{step.title}</strong><small>{step.completedGuilds}/{stats.guildCount} serveur(s)</small></div><span><i style={{ width: `${Math.max(step.rate, step.completedGuilds ? 4 : 0)}%` }}/></span><b>{step.rate}%</b></article>)}</div>
            <div className="activation-distribution">{stats.activation.completionDistribution.map(bucket => <article key={bucket.key}><strong>{bucket.guilds}</strong><span>{bucket.title}</span></article>)}</div>
            <p className="activation-note">{stats.activation.eligibleNewGuilds > 0 ? `${stats.activation.activatedWithin24h}/${stats.activation.eligibleNewGuilds} nouveau(x) serveur(s) activé(s) en moins de 24 heures.` : "La cohorte 24 heures commencera avec les prochaines installations ; les anciens serveurs ne sont pas comptés rétroactivement."}{stats.activation.pendingNewGuilds > 0 ? ` ${stats.activation.pendingNewGuilds} installation(s) récente(s) sont encore dans leur fenêtre de 24 heures.` : ""}</p>
        </div>
        <div className="creator-grid">
            <div className="creator-servers"><div className="creator-panel-heading"><div><p className="eyebrow">PARC INSTALLÉ</p><h2>Serveurs et progression</h2></div><span>{stats.installations.length} actif(s)</span></div>{stats.installations.length === 0 ? <p className="creator-list-empty">Aucun serveur actif pour le moment.</p> : stats.installations.map(guild => { const progress = guild.totalSteps > 0 ? Math.min(100, Math.round((guild.completedSteps / guild.totalSteps) * 100)) : 0; return <article key={guild.guildId}><span className="creator-server-avatar" aria-hidden="true">{guild.guildName.slice(0, 1).toUpperCase()}</span><div className="creator-server-copy"><strong>{guild.guildName}</strong><small>{guild.memberCount.toLocaleString("fr-FR")} membres · suivi depuis le {new Date(guild.firstSeenAt).toLocaleDateString("fr-FR")}</small><span className="creator-server-progress" aria-label={`${progress}% du parcours terminé`}><i style={{ width: `${progress}%` }}/></span></div><div className="creator-server-state"><b className={guild.activated ? "activated" : "progress"}>{guild.activated ? "Activé" : "En cours"}</b><small>{guild.completedSteps}/{guild.totalSteps} étapes</small></div></article>; })}</div>
            <div className="premium-plan"><div className="creator-panel-heading"><div><p className="eyebrow">MODÈLE FYXBOT</p><h2>Free + Premium</h2></div><span>{activePremiumGrants} offert(s)</span></div><div className="creator-plan-card"><span aria-hidden="true">○</span><div><strong>Free</strong><p>Les outils essentiels pour découvrir FyxBot et configurer une première communauté.</p></div></div><div className="creator-plan-card premium"><span aria-hidden="true">◆</span><div><strong>Premium utilisateur</strong><p>Toutes les capacités avancées sur les serveurs administrés pendant la durée de l’accès.</p></div></div><small>Offre de lancement : 30 jours offerts aux 100 premiers utilisateurs, sans carte ni renouvellement automatique.</small></div>
        </div>
        <div className="command-analytics" id="creator-usage"><div><p className="eyebrow">USAGE SUR 30 JOURS</p><h2>Commandes les plus utilisées</h2><p>Compteurs anonymes, sans arguments ni identité utilisateur.</p></div>{stats.topCommands.length === 0 ? <p className="analytics-empty">Les prochaines commandes utilisées apparaîtront ici.</p> : <div className="command-ranking">{stats.topCommands.map(item => <article key={item.commandName}><div><strong>/{item.commandName}</strong><small>{item.uses} utilisation(s){item.failures > 0 ? ` · ${item.failures} erreur(s)` : ""}</small></div><span><i style={{ width: `${Math.max((item.uses / maxUses) * 100, 4)}%` }}/></span></article>)}</div>}</div>
        <div className="premium-grant-panel" id="creator-premium">
            <div className="premium-grant-intro"><div><p className="eyebrow">ACCÈS PREMIUM OFFERTS</p><h2>Partenaires et accès administratifs</h2><p>Seul le propriétaire de FyxBot peut attribuer ou retirer ces accès. Chaque décision reste datée et attribuée dans l’historique.</p></div><strong>{stats.manualPremiumGrants.filter(grant => grant.active).length}<small>accès actifs</small></strong></div>
            <div className="premium-grant-form"><label>Identifiant Discord<input inputMode="numeric" maxLength={20} value={form.premiumGrantUserId || ""} onChange={event => update("premiumGrantUserId")(event.target.value.replace(/\D/g, ""))} placeholder="Ex. 123456789012345678"/></label><label>Motif<input maxLength={120} value={form.premiumGrantReason || "Partenaire FyxBot"} onChange={event => update("premiumGrantReason")(event.target.value)} placeholder="Partenaire, équipe, geste commercial…"/></label><label>Durée<select value={form.premiumGrantDuration || "0"} onChange={event => update("premiumGrantDuration")(event.target.value)}><option value="0">Sans échéance</option><option value="30">30 jours</option><option value="90">90 jours</option><option value="365">1 an</option></select></label><label>Confirmation<input value={form.premiumGrantConfirmation || ""} onChange={event => update("premiumGrantConfirmation")(event.target.value)} placeholder="ACCORDER"/></label><button type="button" disabled={!/^\d{17,20}$/.test(form.premiumGrantUserId || "") || (form.premiumGrantReason || "").trim().length < 2 || form.premiumGrantConfirmation !== "ACCORDER"} onClick={grantPremiumAccess}>Accorder Premium</button></div>
            <div className="premium-grant-list">{stats.manualPremiumGrants.length === 0 ? <p>Aucun accès Premium offert. Les droits payants et Fondateur restent inchangés.</p> : stats.manualPremiumGrants.map(grant => <article key={grant.grantId} className={grant.active ? "active" : "inactive"}><span aria-hidden="true">{grant.active ? "💎" : "○"}</span><div><strong>{grant.displayName}</strong><small>{grant.userId} · {grant.reason}</small><small>Attribué le {new Date(grant.createdAt).toLocaleDateString("fr-FR")} · {grant.endsAt ? `expire le ${new Date(grant.endsAt).toLocaleDateString("fr-FR")}` : "sans échéance"}{grant.revokedAt ? ` · retiré le ${new Date(grant.revokedAt).toLocaleDateString("fr-FR")}` : ""}</small></div><b>{grant.active ? "Actif" : grant.revokedAt ? "Retiré" : "Expiré"}</b>{grant.active && <button type="button" onClick={() => revokePremiumAccess(grant.userId)}>Retirer</button>}</article>)}</div>
        </div>
        <div className="support-team-panel" id="creator-team"><div className="support-team-intro"><div><p className="eyebrow">ÉQUIPE SUPPORT</p><h2>Déléguer les demandes FyxBot</h2><p>Ajoutez un compte Discord avec le niveau strictement nécessaire. Le propriétaire conserve seul la gestion de cette équipe.</p></div><div className="support-role-summary"><article><strong>Modérateur</strong><p>Consulte toutes les demandes, répond et change leur statut.</p></article><article><strong>Administrateur</strong><p>Possède aussi le droit de modifier les priorités.</p></article></div></div><div className="support-team-form"><label>Identifiant Discord<input inputMode="numeric" maxLength={20} value={form.supportStaffUserId || ""} onChange={event => update("supportStaffUserId")(event.target.value.replace(/\D/g, ""))} placeholder="Ex. 123456789012345678"/></label><label>Niveau<select value={form.supportStaffRole || "moderator"} onChange={event => update("supportStaffRole")(event.target.value)}><option value="moderator">Modérateur</option><option value="administrator">Administrateur</option></select></label><label>Confirmation<input value={form.supportStaffConfirmation || ""} onChange={event => update("supportStaffConfirmation")(event.target.value)} placeholder="ACCORDER"/></label><button type="button" disabled={!/^\d{17,20}$/.test(form.supportStaffUserId || "") || form.supportStaffConfirmation !== "ACCORDER"} onClick={grantSupportRole}>Accorder les droits</button></div><div className="support-team-list">{supportStaff.length === 0 ? <p>Aucun compte délégué. Vous restez la seule personne ayant accès à toutes les demandes.</p> : supportStaff.map(member => <article key={member.userId}><span>{member.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.userId} · mis à jour le {new Date(member.updatedAt).toLocaleDateString("fr-FR")}</small></div><b className={member.role}>{member.role === "administrator" ? "Administrateur" : "Modérateur"}</b><button type="button" onClick={() => removeSupportRole(member.userId)}>Retirer</button></article>)}</div></div>
        <details className="creator-danger-zone">
            <summary><div><span aria-hidden="true">⚠</span><div><strong>Zone sensible</strong><small>Retirer FyxBot d’un serveur et nettoyer ses données.</small></div></div><b>Afficher</b></summary>
            <div className="creator-removal-panel">
                <div><p className="eyebrow">GESTION DES INSTALLATIONS</p><h2>Retirer FyxBot d’un serveur</h2><p>Cette action est réservée au propriétaire de FyxBot et ne demande pas l’accord du propriétaire du serveur. FyxBot quittera immédiatement le serveur et ses données liées seront nettoyées.</p></div>
                <div className="creator-removal-form"><label>Serveur<select value={form.creatorRemovalGuildId || ""} onChange={event => { update("creatorRemovalGuildId")(event.target.value); update("creatorRemovalConfirmation")(''); }}><option value="">Choisir un serveur…</option>{stats.installations.map(guild => <option key={guild.guildId} value={guild.guildId}>{guild.guildName} · {guild.memberCount.toLocaleString("fr-FR")} membres</option>)}</select></label><label>Recopiez exactement le nom du serveur<input value={form.creatorRemovalConfirmation || ""} onChange={event => update("creatorRemovalConfirmation")(event.target.value)} placeholder={removalGuild?.guildName || "Nom exact du serveur"}/></label><button type="button" disabled={!removalGuild || form.creatorRemovalConfirmation !== removalGuild.guildName} onClick={() => removalGuild && leaveGuild(removalGuild.guildId, removalGuild.guildName)}>Retirer FyxBot</button></div>
                <small>Votre session Discord active, le nom exact du serveur et la confirmation finale protègent cette action.</small>
            </div>
        </details>
    </section>;
}
const MODERATION_COMMANDS = [
    ["🛡️", "/modhelp", "Afficher toute l’aide"],
    ["🔨", "/ban", "Bannir un membre"],
    ["✅", "/unban", "Débannir un membre"],
    ["👢", "/kick", "Expulser un membre"],
    ["⏱️", "/timeout", "Exclure temporairement"],
    ["⚠️", "/warn", "Ajouter un avertissement"],
    ["📋", "/warnings", "Consulter l’historique"],
    ["🧹", "/clear", "Nettoyer des messages"],
    ["🐢", "/slowmode", "Régler le mode lent"],
    ["🔒", "/lock", "Verrouiller un salon"],
    ["🔓", "/unlock", "Déverrouiller un salon"],
] as const;

function ModerationDashboard({ data, form, update, moderate, warnings, loadWarnings, setWarnings }: {
    data: State;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    moderate: () => Promise<void>;
    warnings: MemberWarning[] | null;
    loadWarnings: () => Promise<void>;
    setWarnings: (value: MemberWarning[] | null) => void;
}) { return <section className="moderation-workspace"><div className="management-panel"><div><p className="eyebrow">BOÎTE À OUTILS</p><h2>Modération FyxBot</h2><p>Choisissez un membre et confirmez explicitement chaque sanction.</p></div><div className="command-grid">{MODERATION_COMMANDS.map(([icon, command, label]) => <article key={command}><span>{icon}</span><div><strong>{command}</strong><small>{label}</small></div></article>)}</div><div className="moderation-form"><Select label="Membre" value={form.moderationMemberId || ""} options={data.options.members} onChange={value => { update("moderationMemberId")(value); setWarnings(null); }}/><label>Action<select value={form.moderationAction || "warn"} onChange={e => update("moderationAction")(e.target.value)}><option value="warn">Avertir</option><option value="timeout">Timeout</option><option value="kick">Expulser</option><option value="ban">Bannir</option></select></label><label>Motif<input value={form.moderationReason || ""} onChange={e => update("moderationReason")(e.target.value)} placeholder="Motif obligatoire"/></label><label>Confirmation<input value={form.moderationConfirmation || ""} onChange={e => update("moderationConfirmation")(e.target.value)} placeholder="CONFIRMER"/></label><button disabled={!form.moderationMemberId || !form.moderationReason || form.moderationConfirmation !== "CONFIRMER"} onClick={moderate}>Appliquer la sanction</button></div></div><div className="warning-history"><div><p className="eyebrow">DOSSIER DU MEMBRE</p><h2>Historique des avertissements</h2><p>Sélectionnez un membre puis chargez son historique.</p></div><button disabled={!form.moderationMemberId} onClick={loadWarnings}>Afficher l’historique</button><div className="warning-list">{warnings === null ? <p>Aucun historique chargé.</p> : warnings.length === 0 ? <p>Ce membre ne possède aucun avertissement.</p> : warnings.map(warning => <article key={warning.id}><span>⚠</span><div><strong>{warning.reason}</strong><small>Par {warning.moderatorName} · {new Date(warning.createdAt).toLocaleString("fr-FR")}</small></div><b>{warning.id}</b></article>)}</div></div></section>; }
function safePreviewUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.toString() : "";
    }
    catch {
        return "";
    }
}
function MessageComposer({ data, form, update, send, selectPublication, newPublication, openLibraryItem, removeLibraryItem, restoreLibraryItem }: {
    data: State;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    send: () => Promise<void>;
    selectPublication: (id: string) => void;
    newPublication: () => void;
    openLibraryItem: (item: ContentLibraryItem) => void;
    removeLibraryItem: (item: ContentLibraryItem, confirmation: string) => Promise<boolean>;
    restoreLibraryItem: (item: ContentTrashItem, confirmation: string) => Promise<boolean>;
}) {
    const [libraryFilter, setLibraryFilter] = useState("all");
    const [removalItem, setRemovalItem] = useState<ContentLibraryItem | null>(null);
    const [removalConfirmation, setRemovalConfirmation] = useState("");
    const [restorationItem, setRestorationItem] = useState<ContentTrashItem | null>(null);
    const [restorationConfirmation, setRestorationConfirmation] = useState("");
    const editing = Boolean(form.messagePublicationId);
    const confirmation = editing ? "MODIFIER" : "PUBLIER";
    const title = form.messageTitle || "Titre de l’embed";
    const description = form.messageDescription || "Le contenu de votre message apparaîtra ici, comme dans Discord.";
    const color = /^#[0-9a-f]{6}$/i.test(form.messageColor || "") ? form.messageColor : "#ef4444";
    const imageUrl = safePreviewUrl(form.messageImageUrl || "");
    const thumbnailUrl = safePreviewUrl(form.messageThumbnailUrl || "");
    const hasContent = Boolean(form.messageContent || form.messageTitle || form.messageDescription || form.messageImageUrl);
    const ready = Boolean(form.messageChannelId && hasContent && form.messageConfirmation === confirmation);
    const channelName = data.options.textChannels.find(channel => channel.id === form.messageChannelId)?.name || "Salon introuvable";
    const contentKinds: Record<string, string> = { message: "✉️", rules: "📜", ticket: "🎫", role: "🎭", welcome: "👋", birthdays: "🎂", social: "📣" };
    const libraryItems = data.contentLibrary.filter(item => libraryFilter === "all" || item.kind === libraryFilter);
    const trashItems = data.contentTrash || [];
    function cancelRemoval() {
        setRemovalItem(null);
        setRemovalConfirmation("");
    }
    async function confirmRemoval() {
        if (!removalItem || removalConfirmation !== "SUPPRIMER")
            return;
        if (await removeLibraryItem(removalItem, removalConfirmation))
            cancelRemoval();
    }
    function cancelRestoration() {
        setRestorationItem(null);
        setRestorationConfirmation("");
    }
    async function confirmRestoration() {
        if (!restorationItem || restorationConfirmation !== "RESTAURER")
            return;
        if (await restoreLibraryItem(restorationItem, restorationConfirmation))
            cancelRestoration();
    }
    return <section className="message-hub">
        <div className="content-library-hub">
            <div className="content-library-head"><div><p className="eyebrow">CENTRE DE CONTENU</p><h2>Toutes vos publications au même endroit</h2><p>Retrouvez, modifiez, retirez ou restaurez les messages, règlements, panneaux et automatisations du serveur.</p></div><strong>{data.contentLibrary.length} actif(s) · {trashItems.length} retiré(s)</strong></div>
            <div className="content-filters"><button type="button" className={libraryFilter === "all" ? "active" : ""} onClick={() => setLibraryFilter("all")}>Tout</button>{[["message", "Messages"], ["rules", "Règlement"], ["ticket", "Tickets"], ["role", "Rôles"], ["social", "Social"]].map(([kind, label]) => <button type="button" className={libraryFilter === kind ? "active" : ""} key={kind} onClick={() => setLibraryFilter(kind)}>{label}</button>)}<button type="button" className={`content-trash-filter ${libraryFilter === "trash" ? "active" : ""}`} onClick={() => setLibraryFilter("trash")}>🗑️ Corbeille ({trashItems.length})</button></div>
            {libraryFilter === "trash" ? <div className="content-trash-grid">{trashItems.length === 0 ? <div className="content-trash-empty"><span>🗑️</span><strong>La corbeille est vide</strong><p>Les contenus retirés resteront récupérables ici pendant 30 jours.</p></div> : trashItems.map(item => <article className="content-trash-card" key={item.id}><span aria-hidden="true">{contentKinds[item.kind] || "📄"}</span><div><strong>{item.title}</strong><small>Retiré le {new Date(item.removedAt).toLocaleString("fr-FR")} · expiration le {new Date(item.expiresAt).toLocaleDateString("fr-FR")}</small></div><button type="button" aria-label={`Restaurer ${item.title}`} onClick={() => { setRestorationItem(item); setRestorationConfirmation(""); }}>Restaurer</button></article>)}</div> : <div className="content-library-grid">{libraryItems.length === 0 ? <p>Aucun contenu dans cette catégorie.</p> : libraryItems.map(item => <article className="content-library-card" key={item.id}><button type="button" className="content-library-open" onClick={() => openLibraryItem(item)}><span aria-hidden="true">{contentKinds[item.kind] || "📄"}</span><div><strong>{item.title}</strong><small>{item.description}</small></div><b>{item.kind === "message" ? "Modifier" : "Gérer"} →</b></button>{item.removable && <button type="button" className="content-library-remove" aria-label={`Retirer ${item.title}`} onClick={() => { setRemovalItem(item); setRemovalConfirmation(""); }}>Retirer</button>}</article>)}</div>}
            {removalItem && <section className="content-removal-panel" aria-label={`Retirer ${removalItem.title}`}><div><p className="eyebrow">ACTION SENSIBLE</p><h3>Retirer « {removalItem.title} » ?</h3><p>Le contenu sera placé dans la corbeille pendant 30 jours. Si un message Discord lui est associé, seul ce message précis sera supprimé. Les salons, rôles et tickets déjà ouverts resteront intacts.</p></div><label>Confirmation<input value={removalConfirmation} onChange={event => setRemovalConfirmation(event.target.value)} placeholder="Écrivez SUPPRIMER"/></label><div><button type="button" className="secondary" onClick={cancelRemoval}>Annuler</button><button type="button" className="danger" disabled={removalConfirmation !== "SUPPRIMER"} onClick={() => void confirmRemoval()}>Placer dans la corbeille</button></div></section>}
            {restorationItem && <section className="content-restoration-panel" aria-label={`Restaurer ${restorationItem.title}`}><div><p className="eyebrow">RESTAURATION CONTRÔLÉE</p><h3>Restaurer « {restorationItem.title} » ?</h3><p>FyxBot republiera ce contenu dans son salon d’origine. Si ce salon, un rôle ou une configuration nécessaire n’existe plus, la restauration sera refusée sans modifier la corbeille.</p></div><label>Confirmation<input value={restorationConfirmation} onChange={event => setRestorationConfirmation(event.target.value)} placeholder="Écrivez RESTAURER"/></label><div><button type="button" className="secondary" onClick={cancelRestoration}>Annuler</button><button type="button" disabled={restorationConfirmation !== "RESTAURER"} onClick={() => void confirmRestoration()}>Restaurer le contenu</button></div></section>}
        </div>
        <div className="message-library"><div><p className="eyebrow">MESSAGES PUBLIÉS</p><h2>Retrouver et modifier une publication</h2><p>FyxBot conserve ici les messages libres envoyés depuis le panel. Les annonces changelog officielles restent gérées automatiquement et ne sont pas accessibles.</p></div><label>Publication<select value={form.messagePublicationId || ""} onChange={event => selectPublication(event.target.value)}><option value="">Nouvelle publication</option>{(data.publishedMessages || []).map(message => <option value={message.id} key={message.id}>{message.title || message.content.slice(0, 50) || "Message sans titre"} · #{message.channelName}</option>)}</select></label><button type="button" onClick={newPublication}>+ Nouveau message</button></div>
        <section className="message-workspace">
        <div className="message-builder">
            <div className="message-builder-head"><div><p className="eyebrow">CONSTRUCTEUR DE MESSAGES</p><h2>{editing ? "Modifier la publication Discord" : "Créer une publication Discord"}</h2><p>Combinez texte, embed, image et bouton. Chaque message publié pourra être retrouvé puis corrigé ici.</p></div><span>✉️</span></div>
            <div className="message-form-grid">
                {editing ? <label>Salon d’origine<input value={`#${channelName}`} disabled/></label> : <Select label="Salon de publication" value={form.messageChannelId || ""} options={data.options.textChannels} onChange={update("messageChannelId")}/>}
                <label className="full-row">Texte au-dessus de l’embed <small>facultatif</small><textarea value={form.messageContent || ""} maxLength={2000} rows={3} onChange={e => update("messageContent")(e.target.value)} placeholder="Une courte introduction…"/></label>
                <label className="wide">Titre de l’embed<input value={form.messageTitle || ""} maxLength={256} onChange={e => update("messageTitle")(e.target.value)} placeholder="Annonce de la communauté"/></label>
                <label>Couleur<input className="color-field" type="color" value={color} onChange={e => update("messageColor")(e.target.value)}/></label>
                <label className="full-row">Description de l’embed<textarea value={form.messageDescription || ""} maxLength={4000} rows={7} onChange={e => update("messageDescription")(e.target.value)} placeholder="Rédigez votre annonce…"/></label>
                <label className="wide">Lien HTTPS<input type="url" value={form.messageLinkUrl || ""} onChange={e => update("messageLinkUrl")(e.target.value)} placeholder="https://votre-site.fr/actualite"/></label>
                <label>Texte du bouton<input value={form.messageButtonLabel || ""} maxLength={80} onChange={e => update("messageButtonLabel")(e.target.value)} placeholder="Voir les détails"/></label>
                <label className="wide">Grande image HTTPS<input type="url" value={form.messageImageUrl || ""} onChange={e => update("messageImageUrl")(e.target.value)} placeholder="https://…/banniere.png"/></label>
                <label>Miniature HTTPS<input type="url" value={form.messageThumbnailUrl || ""} onChange={e => update("messageThumbnailUrl")(e.target.value)} placeholder="https://…/logo.png"/></label>
                <label className="wide">Pied de page<input value={form.messageFooter || ""} maxLength={2048} onChange={e => update("messageFooter")(e.target.value)} placeholder="Votre communauté"/></label>
                <label>Confirmation<input value={form.messageConfirmation || ""} onChange={e => update("messageConfirmation")(e.target.value)} placeholder={confirmation}/></label>
            </div>
            <button className="message-send" disabled={!ready} onClick={send}>{editing ? "Enregistrer la modification" : "Publier dans Discord"}</button>
        </div>
        <aside className="discord-preview" aria-label="Aperçu Discord">
            <div className="discord-preview-head"><p className="eyebrow">APERÇU DISCORD</p><span>{editing ? "Le message existant sera mis à jour par FyxBot" : "Le message final sera envoyé par FyxBot"}</span></div>
            <div className="discord-message"><div className="discord-avatar">F</div><div className="discord-message-body"><div className="discord-author"><strong>FyxBot</strong><b>APP</b><time>Aujourd’hui à 12:00</time></div>{form.messageContent && <p className="discord-content">{form.messageContent}</p>}<div className="discord-embed" style={{ borderLeftColor: color }}><div className="discord-embed-copy"><strong className={form.messageLinkUrl ? "linked" : ""}>{title}</strong><p>{description}</p>{form.messageFooter && <small>{form.messageFooter} • maintenant</small>}</div>{thumbnailUrl && <div className="discord-thumbnail" role="img" aria-label="Aperçu de la miniature" style={{ backgroundImage: `url(${JSON.stringify(thumbnailUrl)})` }}/>} {imageUrl && <div className="discord-image" role="img" aria-label="Aperçu de la grande image" style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}/>}</div>{form.messageLinkUrl && form.messageButtonLabel && <button type="button" className="discord-link-button">🔗 {form.messageButtonLabel}</button>}</div></div>
        </aside>
        </section>
    </section>;
}
type SetupMode = "complete" | "synchronize" | "reset";
function DiscordServerPreview({ blueprint }: { blueprint: SetupBlueprint }) {
    const firstTextChannel = blueprint.channels.find(channel => channel.type !== "voice");
    const staffRoles = blueprint.roles.filter(role => role.staff);
    const memberRoles = blueprint.roles.filter(role => !role.staff);
    const roleDot = (role: SetupBlueprint["roles"][number]) => role.color
        ? `#${role.color.toString(16).padStart(6, "0")}`
        : "#949ba4";
    return <section className="discord-server-mock" aria-label="Aperçu Discord de la structure proposée"><div className="discord-server-mock-head"><div><span>APERÇU DISCORD</span><strong>{blueprint.guildName || "Votre serveur"}</strong></div><small>Simulation visuelle · aucune création réelle</small></div><div className="discord-server-window"><aside className="discord-server-rail"><b>F</b><i/><span>+</span></aside><aside className="discord-channel-list"><header>{blueprint.guildName || "Votre serveur"}<span>⌄</span></header><div>{blueprint.categories.map(category => <section key={category.key}><strong>⌄ {category.name}</strong>{blueprint.channels.filter(channel => channel.category === category.key).map(channel => <div className={channel.key === firstTextChannel?.key ? "selected" : ""} key={channel.key}><span>{channel.type === "voice" ? "🔊" : "#"}</span>{channel.name.replace(/^[^・]+・/, "")}</div>)}</section>)}</div><footer><b>F</b><span><strong>FyxBot</strong><small>En ligne</small></span><i>⚙</i></footer></aside><main className="discord-chat-preview"><header><span>#</span>{firstTextChannel?.name.replace(/^[^・]+・/, "") || "bienvenue"}<small>Salon proposé par FyxBot</small></header><div className="discord-chat-empty"><b>{firstTextChannel?.name.match(/^[^・]+/)?.[0] || "👋"}</b><h3>Bienvenue sur {blueprint.guildName || "votre serveur"}</h3><p>Ceci est le début du salon #{firstTextChannel?.name.replace(/^[^・]+・/, "") || "bienvenue"}.</p></div><article><div>F</div><p><strong>FyxBot <span>APP</span></strong><small>Aujourd’hui à 12:00</small><br/>La structure est prête à être vérifiée avant sa création.</p></article></main><aside className="discord-member-preview">{staffRoles.length > 0 && <section><strong>ÉQUIPE — {staffRoles.length}</strong>{staffRoles.map(role => <div key={role.key}><i style={{ backgroundColor: roleDot(role) }}/><span>{role.name}</span></div>)}</section>}<section><strong>RÔLES — {memberRoles.length}</strong>{memberRoles.map(role => <div key={role.key}><i style={{ backgroundColor: roleDot(role) }}/><span>{role.name}</span></div>)}</section></aside></div></section>;
}
function BlueprintPreview({ blueprint }: { blueprint: SetupBlueprint }) {
    const [previewMode, setPreviewMode] = useState<"discord" | "details">("discord");
    const explanationByCategory = new Map((blueprint.explanations || []).map(item => [item.categoryKey, item.reason]));
    return <details className="setup-blueprint-preview" open><summary>Prévisualiser la structure proposée</summary><div className="setup-preview-switch" role="group" aria-label="Mode de prévisualisation"><button type="button" className={previewMode === "discord" ? "active" : ""} onClick={() => setPreviewMode("discord")}>Aperçu Discord</button><button type="button" className={previewMode === "details" ? "active" : ""} onClick={() => setPreviewMode("details")}>Liste détaillée</button></div>{previewMode === "discord" ? <DiscordServerPreview blueprint={blueprint}/> : <div className="setup-blueprint-grid"><section><h3>Rôles · {blueprint.roles.length}</h3><ul>{blueprint.roles.map(role => <li key={role.key}>{role.name}</li>)}</ul></section><section><h3>Catégories et salons · {blueprint.channels.length}</h3><div className="setup-category-preview">{blueprint.categories.map(category => { const categoryChannels = blueprint.channels.filter(channel => channel.category === category.key); return <article key={category.key}><strong>{category.name}</strong>{explanationByCategory.get(category.key) && <small>{explanationByCategory.get(category.key)}</small>}<ul>{categoryChannels.map(channel => <li key={channel.key}><span>{channel.type === "voice" ? "Vocal" : "Texte"}</span>{channel.name}</li>)}</ul></article>; })}</div></section></div>}<p>Aucun rôle, catégorie ou salon n’est créé tant que vous ne confirmez pas l’action située plus bas.</p></details>;
}
function RolePerspectiveWorkspace({ guildId, roles }: { guildId: string; roles: PermissionRoleOption[] }) {
    const [mode, setMode] = useState<"account" | "role">("account");
    const [roleId, setRoleId] = useState(roles[0]?.id || "");
    const [perspective, setPerspective] = useState<RolePerspective | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");

    useEffect(() => {
        if (mode === "role" && !roleId)
            return;
        const controller = new AbortController();
        const query = new URLSearchParams({ guildId });
        if (mode === "account") query.set("subject", "me");
        else query.set("roleId", roleId);
        void fetch(`${API}/permissions/perspective?${query}`, { credentials: "include", signal: controller.signal })
            .then(async response => {
                const payload = await response.json();
                if (!response.ok)
                    throw Error(payload.error || "La perspective ne peut pas être calculée.");
                setPerspective(payload.perspective);
            })
            .catch(fetchError => {
                if (fetchError?.name !== "AbortError")
                    setError(fetchError?.message || "La perspective ne peut pas être calculée.");
            })
            .finally(() => {
                if (!controller.signal.aborted)
                    setLoading(false);
            });
        return () => controller.abort();
    }, [guildId, mode, roleId]);

    const displayedCategories = perspective?.categories.map(category => ({
        ...category,
        channels: category.channels.filter(channel => filter === "all"
            || (filter === "visible" ? channel.visible : !channel.visible)),
    })).filter(category => category.channels.length > 0) || [];

    return <section className="role-perspective-workspace">
        <header>
            <div>
                <p className="eyebrow">FYXVISION · PERSPECTIVE RÉELLE</p>
                <h2>Voir Discord avec vos permissions</h2>
                <p>Vérifiez votre compte avec tous ses rôles combinés, ou simulez un rôle isolé. Cette lecture ne modifie rien sur Discord.</p>
            </div>
            <div className="role-perspective-controls">
                <div className="role-perspective-mode" role="group" aria-label="Perspective Discord">
                    {([{"id":"account","label":"Mon compte"},{"id":"role","label":"Un rôle"}] as const).map(item => <button type="button" key={item.id} className={mode === item.id ? "active" : ""} aria-pressed={mode === item.id} onClick={() => {
                        if (mode === item.id) return;
                        setMode(item.id);
                        setPerspective(null);
                        setError("");
                        setLoading(true);
                    }}>{item.label}</button>)}
                </div>
                {mode === "role" && <Select label="Rôle à simuler" value={roleId} options={roles} onChange={nextRoleId => {
                    setRoleId(nextRoleId);
                    setPerspective(null);
                    setError("");
                    setLoading(true);
                }}/>}
            </div>
        </header>
        {loading && <div className="role-perspective-state" role="status"><span>◌</span><strong>Calcul des permissions Discord…</strong></div>}
        {error && <div className="role-perspective-state error" role="alert"><span>!</span><div><strong>Perspective indisponible</strong><p>{error}</p></div></div>}
        {perspective && <>
            <div className="role-perspective-identity">
                <i style={{ backgroundColor: perspective.subject.color }}/>
                <div><strong>{perspective.subject.name}</strong><small>{perspective.subject.type === "member" ? `Votre compte · ${perspective.subject.roleCount} rôle(s) combiné(s)` : perspective.subject.everyone ? "Rôle de base du serveur" : perspective.subject.elevated ? "Rôle avec droits élevés" : "Rôle sans droits d’administration détectés"}</small></div>
                <span>Lecture seule</span>
            </div>
            {perspective.subject.type === "member" && <div className="role-perspective-roles" aria-label="Rôles de votre compte"><strong>Rôles pris en compte</strong><div>{perspective.subject.roleNames.length ? perspective.subject.roleNames.map((name, index) => <span key={`${name}-${index}`}>{name}</span>) : <span>@everyone uniquement</span>}</div><small>Les exceptions de salons propres à votre compte sont aussi incluses.</small></div>}
            <div className="role-perspective-summary">
                <article><span>VISIBLES</span><strong>{perspective.summary.visible}</strong><small>sur {perspective.summary.total} salons</small></article>
                <article><span>MASQUÉS</span><strong>{perspective.summary.hidden}</strong><small>inaccessibles {perspective.subject.type === "member" ? "à votre compte" : "au rôle"}</small></article>
                <article><span>ÉCRITURE / VOCAL</span><strong>{perspective.summary.write}</strong><small>interaction autorisée</small></article>
                <article><span>GESTION</span><strong>{perspective.summary.control}</strong><small>droits de modération</small></article>
            </div>
            {perspective.warnings.length > 0 && <div className="role-perspective-warnings">{perspective.warnings.map(warning => <article className={warning.severity} key={warning.code}><span>{warning.severity === "critical" ? "⛔" : "⚠️"}</span><div><strong>{warning.title}</strong><p>{warning.detail}</p></div></article>)}</div>}
            <div className="role-perspective-toolbar" role="group" aria-label="Filtrer les salons simulés">
                <span>Salons par catégorie</span>
                {([{"id":"all","label":"Tous"},{"id":"visible","label":"Visibles"},{"id":"hidden","label":"Masqués"}] as const).map(item => <button type="button" className={filter === item.id ? "active" : ""} key={item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
            </div>
            <div className="role-perspective-categories">
                {displayedCategories.map(category => <article key={category.id}>
                    <header><strong>{category.name}</strong><small>{category.channels.length} salon(s)</small></header>
                    <div>{category.channels.map(channel => <div className={`permission-${channel.tone}`} key={channel.id}><span aria-hidden="true">{channel.kind === "voice" ? "🔊" : "#"}</span><strong>{channel.name.replace(/^[^・]+・/, "")}</strong><small>{channel.label}</small></div>)}</div>
                </article>)}
                {displayedCategories.length === 0 && <p className="role-perspective-empty">Aucun salon ne correspond à ce filtre.</p>}
            </div>
            <p className="role-perspective-note">{perspective.subject.type === "member" ? "FyxVision affiche les droits effectifs de votre compte connecté, avec tous ses rôles et les exceptions de chaque salon. Aucun changement n’est envoyé à Discord." : "FyxVision simule ici un rôle isolé. Un membre qui cumule plusieurs rôles peut obtenir davantage de droits par l’addition de leurs permissions."}</p>
        </>}
    </section>;
}
function FyxVisionWorkspace({ simulation, mode }: { simulation: SetupSimulation; mode: SetupMode }) {
    const [twinOpen, setTwinOpen] = useState(true);
    const plan = simulation.plans[mode];
    const riskLabels = { low: "Faible", guarded: "Surveillé", critical: "Critique" } as const;
    const corrections = [...simulation.movements, ...simulation.permissionChanges];
    const removals = mode === "reset" ? simulation.removals : [];
    const preserved = mode === "reset" ? [] : simulation.preserved;
    const moreRemovals = Math.max(removals.length - 8, 0);

    return <section className="fyxvision-workspace">
        <header>
            <div>
                <p className="eyebrow">FYXVISION + FYXTWIN</p>
                <h2>Voyez l’impact avant de toucher à Discord</h2>
                <p>Le jumeau simule le résultat de l’action choisie. Aucune modification Discord n’est exécutée ici.</p>
            </div>
            <button type="button" onClick={() => setTwinOpen(open => !open)}>{twinOpen ? "Masquer" : "Afficher"} la simulation</button>
        </header>
        {twinOpen && <>
            <div className="fyxtwin-stats">
                <article><span>RÔLES</span><strong>{simulation.before.roles} → {plan.projected.roles}</strong></article>
                <article><span>CATÉGORIES</span><strong>{simulation.before.categories} → {plan.projected.categories}</strong></article>
                <article><span>SALONS</span><strong>{simulation.before.channels} → {plan.projected.channels}</strong></article>
                <article className={`risk-${plan.risk}`}><span>RISQUE</span><strong>{riskLabels[plan.risk]}</strong></article>
            </div>
            <div className="fyxvision-diff">
                <section>
                    <h3>+ Ajouts · {simulation.additions.length}</h3>
                    {simulation.additions.slice(0, 8).map(item => <span className="added" key={item}>{item}</span>)}
                    {simulation.additions.length === 0 && <p>Aucun élément manquant.</p>}
                </section>
                <section>
                    <h3>↔ Corrections · {corrections.length}</h3>
                    {corrections.slice(0, 8).map(item => <span className="updated" key={item}>{item}</span>)}
                    {corrections.length === 0 && <p>Aucune correction nécessaire.</p>}
                </section>
                <section>
                    <h3>− Suppressions · {removals.length}</h3>
                    {removals.slice(0, 8).map(item => <span className="removed" key={item}>{item}</span>)}
                    {moreRemovals > 0 && <span className="removed">+ {moreRemovals} autre(s)</span>}
                    {mode !== "reset" && <p>Aucune suppression avec cette action.</p>}
                    {mode === "reset" && removals.length === 0 && <p>Aucun élément supprimable détecté.</p>}
                </section>
                <section>
                    <h3>✓ Conservés · {preserved.length}</h3>
                    {preserved.slice(0, 8).map(item => <span className="preserved" key={item}>{item}</span>)}
                    {mode === "reset" && <p>La reconstruction remplace les éléments que FyxBot peut gérer.</p>}
                    {mode !== "reset" && preserved.length === 0 && <p>Aucun élément personnel détecté.</p>}
                </section>
            </div>
            <section className="fyxvision-permissions">
                <div className="fyxvision-permissions-head">
                    <div>
                        <p className="eyebrow">PERMISSIONS FINALES</p>
                        <h3>Accès prévus par catégorie et par rôle</h3>
                    </div>
                    <small>Les salons sans exception héritent de leur catégorie.</small>
                </div>
                <div className="fyxvision-permission-grid">
                    {simulation.permissionPreview.map(category => <article key={category.key}>
                        <h4>{category.name}</h4>
                        <div className="permission-access-list">
                            {category.access.map(item => <div key={`${category.key}-${item.role}`}>
                                <span>{item.role}</span>
                                <strong className={`permission-${item.tone}`}>{item.label}</strong>
                            </div>)}
                        </div>
                        {category.channelOverrides.length > 0 && <details>
                            <summary>{category.channelOverrides.length} exception(s) de salon</summary>
                            {category.channelOverrides.map(channel => <div className="permission-channel-override" key={channel.name}>
                                <b>{channel.name}</b>
                                {channel.access.map(item => <small key={`${channel.name}-${item.role}`}>{item.role} : {item.label}</small>)}
                            </div>)}
                        </details>}
                    </article>)}
                </div>
            </section>
            <div className="fyxtwin-plan">
                <strong>Simulation de l’action sélectionnée</strong>
                <span>{plan.creates} création(s)</span>
                <span>{plan.updates} correction(s)</span>
                <span className={plan.deletes ? "danger" : ""}>{plan.deletes} suppression(s)</span>
                <span>{plan.preserves} élément(s) conservé(s)</span>
            </div>
        </>}
    </section>;
}
function SetupDashboard({ data, form, update, runSetup, deletePreview, saveNickname }: {
    data: State;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    runSetup: (mode: SetupMode | "design") => Promise<void>;
    deletePreview: () => Promise<void>;
    saveNickname: (nickname: string, confirmation: string) => Promise<void>;
}) {
    const [isDesigning, setIsDesigning] = useState(false);
    const analysis = data.setupAnalysis;
    const blueprint = data.setupBlueprint;
    const simulation = data.setupSimulation;
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
    const desiredNickname = (form.botNickname || "").trim();
    const nicknameConfirmation = desiredNickname ? "PERSONNALISER" : "REINITIALISER";
    const nicknameChanged = desiredNickname !== (data.guild.botNickname || "");
    async function designServer() {
        setIsDesigning(true);
        try {
            await runSetup("design");
        }
        finally {
            setIsDesigning(false);
        }
    }
    return <section className="setup-workspace"><div className="bot-identity-settings"><div className="bot-identity-preview"><span>F</span><div><p className="eyebrow">IDENTITÉ SUR CE SERVEUR</p><h2>{desiredNickname || "FyxBot"}</h2><small>Application FyxBot · surnom visible uniquement sur {data.guild.name}</small></div></div><div className="bot-identity-form"><label>Surnom du bot<input value={form.botNickname || ""} maxLength={32} onChange={event => { update("botNickname")(event.target.value); update("botNicknameConfirmation")(''); }} placeholder="Laisser vide pour afficher FyxBot"/></label><label>Confirmation<input value={form.botNicknameConfirmation || ""} onChange={event => update("botNicknameConfirmation")(event.target.value)} placeholder={`Écrivez ${nicknameConfirmation}`}/></label><button type="button" disabled={!nicknameChanged || form.botNicknameConfirmation !== nicknameConfirmation} onClick={() => saveNickname(desiredNickname, form.botNicknameConfirmation || "")}>{desiredNickname ? "Appliquer le surnom" : "Revenir à FyxBot"}</button></div><p>Le nom global, le badge d’application et les liens officiels restent FyxBot afin que les membres puissent toujours identifier le bot.</p></div><div className="setup-designer"><div><p className="eyebrow">SERVEUR SUR MESURE</p><h2>Décrivez ce que vous voulez</h2><p>Aucun profil n’est imposé. Expliquez l’objectif du serveur, son public, ses activités et les fonctions nécessaires. FyxBot proposera les rôles, catégories et salons adaptés.</p></div><label>Description libre<textarea rows={5} maxLength={1000} value={form.setupDescription || ""} onChange={event => update("setupDescription")(event.target.value)} placeholder="Ex. Je crée un serveur Minecraft survie avec une équipe de builders, des candidatures, des tickets et des salons vocaux temporaires…"/></label><button className="setup-button" disabled={(form.setupDescription || "").trim().length < 20 || isDesigning} onClick={designServer}>{isDesigning ? "Génération en cours…" : "Générer l’aperçu"}</button>{blueprint && <div className="setup-proposal"><div className="setup-proposal-head"><div><strong>Proposition prête</strong><span>{blueprint.roles.length} rôles · {blueprint.categories.length} catégories · {blueprint.channels.length} salons</span></div><button type="button" onClick={deletePreview}>Supprimer l’aperçu</button></div><small>{blueprint.detectedNeeds.join(" · ")}</small>{blueprint.explanations?.length ? <ul className="setup-reasons">{blueprint.explanations.slice(0, 6).map(item => <li key={item.categoryKey}><b>{item.name}</b><span>{item.reason}</span></li>)}</ul> : null}<BlueprintPreview blueprint={blueprint}/></div>}</div><div className="setup-audit"><div><p className="eyebrow">AUDIT DU SERVEUR</p><h2>{data.guild.name}</h2><p>{blueprint ? "FyxBot compare le serveur à votre proposition personnalisée avant toute action." : "Décrivez d’abord le serveur pour remplacer l’analyse générique par votre proposition personnalisée."}</p>{analysis.uneditableRoles.length > 0 && <p className="setup-warning">⚠️ Placez le rôle FyxBot au-dessus de {analysis.uneditableRoles.join(", ")} pour permettre leur correction.</p>}</div><div className="setup-metrics"><article><span>MANQUANTS</span><strong>{analysis.totals.missing}</strong><small>{missing.slice(0, 3).join(" · ") || "Structure complète"}</small></article><article><span>PERMISSIONS</span><strong>{analysis.totals.permissionIssues}</strong><small>{analysis.permissionIssues.slice(0, 3).join(" · ") || "Permissions conformes"}</small></article><article><span>CONSERVÉS</span><strong>{analysis.totals.extras}</strong><small>{extras.slice(0, 3).join(" · ") || "Aucun élément supplémentaire"}</small></article></div></div>{simulation && <FyxVisionWorkspace simulation={simulation} mode={mode}/>}<RolePerspectiveWorkspace key={data.guild.id} guildId={data.guild.id} roles={data.options.permissionRoles}/><div className={`setup-action ${mode === "reset" ? "danger-panel" : ""}`}><div><p className="eyebrow">ACTION RECOMMANDÉE</p><h2>{blueprint ? analysis.recommendation === "complete" ? "Compléter la structure" : analysis.recommendation === "synchronize" ? "Corriger les permissions" : analysis.recommendation === "hierarchy" ? "Corriger la hiérarchie des rôles" : "Structure déjà exploitable" : "Aucune proposition appliquable"}</h2><p>{!blueprint ? "Générez un aperçu ci-dessus avant de pouvoir modifier Discord." : analysis.recommendation === "hierarchy" ? "Discord bloque les rôles supérieurs à FyxBot. Déplacez le rôle du bot puis relancez Réparer et synchroniser." : labels[mode].description}</p></div><label>Action<select value={mode} onChange={event => { update("setupMode")(event.target.value); update("setupConfirmation")(''); }}><option value="complete">Compléter sans supprimer</option><option value="synchronize">Réparer et synchroniser</option><option value="reset">Tout sauvegarder et reconstruire</option></select></label><label>Confirmation<input value={form.setupConfirmation || ""} onChange={event => update("setupConfirmation")(event.target.value)} placeholder={`Écrivez ${expected}`}/></label><button className={`setup-button ${mode === "reset" ? "danger-button" : ""}`} disabled={!blueprint || form.setupConfirmation !== expected} onClick={() => runSetup(mode)}>{labels[mode].action}</button></div></section>;
}
function OnboardingDashboard({ data, navigate }: {
    data: State;
    navigate: (target: string) => void;
}) {
    const recommended = data.onboarding.recommendedStep;
    const healthLabels = { new: "Nouveau serveur", starting: "Fondations en cours", progressing: "Configuration avancée", ready: "Serveur prêt" };
    const statusLabels = { complete: "Prêt", attention: "À corriger", missing: "À configurer" };
    return <section className="onboarding-workspace">
        <div className="onboarding-summary">
            <div>
                <p className="eyebrow">FYXJOURNEY · DIAGNOSTIC EXPLICABLE</p>
                <h2>{data.onboarding.complete ? "Votre serveur possède ses fondations essentielles" : "Voici les prochaines améliorations utiles"}</h2>
                <p>Le score combine structure, sécurité, règlement, accueil, support et animation sur {data.guild.name}.</p>
                <span className={`journey-health ${data.onboarding.healthLevel}`}>{healthLabels[data.onboarding.healthLevel]}</span>
            </div>
            <strong>{data.onboarding.healthScore}<small>/100</small></strong>
            <div className="onboarding-progress" aria-label={`Score FyxJourney ${data.onboarding.healthScore} sur 100`}><i style={{ width: `${data.onboarding.healthScore}%` }}/></div>
        </div>
        <div className="journey-summary" aria-label="Résumé du diagnostic">
            <article><strong>{data.onboarding.summary.ready}</strong><span>domaines prêts</span></article>
            <article><strong>{data.onboarding.summary.attention}</strong><span>à corriger</span></article>
            <article><strong>{data.onboarding.summary.missing}</strong><span>à configurer</span></article>
        </div>
        {recommended ? <div className="journey-next"><span>PROCHAINE ACTION RECOMMANDÉE</span><div><strong>{recommended.title}</strong><p>{recommended.impact}</p>{recommended.issues[0] && <small>{recommended.issues[0]}</small>}</div><button type="button" onClick={() => navigate(recommended.target)}>Continuer →</button></div> : <div className="journey-ready"><span aria-hidden="true">✓</span><div><strong>Aucune action essentielle en attente</strong><p>FyxJourney continuera de surveiller les réglages visibles par FyxBot.</p></div></div>}
        {data.onboarding.recommendations.length > 1 && <section className="journey-plan"><header><div><p className="eyebrow">PLAN CONSEILLÉ</p><h3>Les trois prochaines actions</h3></div><span>Aucune modification automatique</span></header><div>{data.onboarding.recommendations.map((item, index) => <button type="button" key={item.key} onClick={() => navigate(item.target)}><span>{index + 1}</span><div><strong>{item.title}</strong><small>{item.issues[0] || item.description}</small></div><b>Ouvrir →</b></button>)}</div></section>}
        <section className="journey-diagnostics"><header><div><p className="eyebrow">AUDIT PAR DOMAINE</p><h3>Pourquoi ce score ?</h3></div><span>{data.onboarding.completedCount}/{data.onboarding.totalCount} domaines prêts</span></header><div className="onboarding-steps">{data.onboarding.diagnostics.map((step, index) => <article className={`${step.status} ${recommended?.key === step.key ? "recommended" : ""}`} key={step.key}><span>{step.complete ? "✓" : index + 1}</span><div><div className="journey-step-head"><strong>{step.title}</strong><em className={step.status}>{statusLabels[step.status]} · {step.score}/{step.maxScore}</em></div><p>{step.impact}</p>{step.issues[0] && <small>{step.issues[0]}</small>}</div><button type="button" onClick={() => navigate(step.target)}>{step.complete ? "Vérifier" : "Améliorer"}</button></article>)}</div></section>
    </section>;
}
function FyxPilotDashboard({ data, rollback, navigate }: {
    data: State;
    rollback: (changeId: string, confirmation: string) => Promise<void>;
    navigate: (target: string) => void;
}) {
    const [selectedId, setSelectedId] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const selected = data.changeHistory.find(change => change.id === selectedId);
    const reversible = data.changeHistory.filter(change => change.reversible && change.status === "applied").length;
    const kindIcons: Record<string, string> = { design: "🧠", structure: "🏗️", rollback: "↩️", content: "✉️", configuration: "⚙️", security: "🛡️" };
    async function confirmRollback() {
        if (!selected || confirmation !== "RESTAURER") return;
        await rollback(selected.id, confirmation);
        setSelectedId("");
        setConfirmation("");
    }
    return <section className="fyxpilot-workspace"><div className="fyxpilot-hero"><div><p className="eyebrow">FYXPILOT STUDIO</p><h2>Construire, comprendre et annuler</h2><p>Chaque action importante est expliquée. Les modifications structurelles possèdent une sauvegarde permettant un retour arrière contrôlé.</p></div><div><article><strong>{data.changeHistory.length}</strong><small>changements récents</small></article><article><strong>{reversible}</strong><small>retours arrière disponibles</small></article><button type="button" onClick={() => navigate("Configuration")}>Préparer une modification</button></div></div><div className="fyxpilot-layout"><div className="fyxpilot-timeline"><header><div><p className="eyebrow">HISTORIQUE</p><h3>Chronologie du serveur</h3></div><span>Les sauvegardes restent privées</span></header>{data.changeHistory.length === 0 ? <p className="fyxpilot-empty">Les prochaines modifications effectuées depuis le panel apparaîtront ici.</p> : data.changeHistory.map(change => <article className={`${change.status} ${selectedId === change.id ? "selected" : ""}`} key={change.id}><span className="fyxpilot-kind" aria-hidden="true">{kindIcons[change.kind] || "●"}</span><div><strong>{change.title}</strong><p>{change.summary}</p><small>{change.actorName} · {new Date(change.createdAt).toLocaleString("fr-FR")}</small>{change.status === "rolled_back" && <em>Annulé{change.rolledBackBy ? ` par ${change.rolledBackBy}` : ""}</em>}</div>{change.reversible && change.status === "applied" ? <button type="button" onClick={() => { setSelectedId(change.id); setConfirmation(""); }}>Retour arrière</button> : <b>{change.kind === "design" ? "Aperçu" : change.status === "rolled_back" ? "Annulé" : "Enregistré"}</b>}</article>)}</div><aside className="fyxpilot-safety"><p className="eyebrow">RETOUR ARRIÈRE</p>{selected ? <><h3>{selected.title}</h3><p>FyxBot restaurera l’état enregistré avant cette modification. Les rôles et salons actuels seront reconstruits depuis la sauvegarde.</p><div className="safety-warning">Administrateur doit être accordé temporairement à FyxBot pour restaurer les salons privés, puis retiré immédiatement.</div><label>Confirmation<input value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Écrivez RESTAURER"/></label><button type="button" className="danger-button" disabled={confirmation !== "RESTAURER"} onClick={() => void confirmRollback()}>Restaurer cet état</button><button type="button" className="secondary" onClick={() => { setSelectedId(""); setConfirmation(""); }}>Annuler</button></> : <><h3>Aucune restauration sélectionnée</h3><p>Choisissez une modification marquée « Retour arrière » dans la chronologie. Les simples contenus restent modifiables depuis leur module.</p><button type="button" onClick={() => navigate("Messages")}>Ouvrir le centre de contenu</button></>}</aside></div></section>;
}
type PilotageSection = "journey" | "setup" | "history";
function PilotageDashboard({ data, form, update, runSetup, deletePreview, saveNickname, rollback, navigate }: {
    data: State;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    runSetup: (mode: SetupMode | "design") => Promise<void>;
    deletePreview: () => Promise<void>;
    saveNickname: (nickname: string, confirmation: string) => Promise<void>;
    rollback: (changeId: string, confirmation: string) => Promise<void>;
    navigate: (target: string) => void;
}) {
    const [section, setSection] = useState<PilotageSection>("journey");
    const openTarget = (target: string) => {
        if (target === "Démarrage") {
            setSection("journey");
            return;
        }
        if (target === "Configuration") {
            setSection("setup");
            return;
        }
        if (target === "FyxPilot") {
            setSection("history");
            return;
        }
        navigate(target);
    };
    const tabs: { id: PilotageSection; icon: string; label: string; detail: string }[] = [
        { id: "journey", icon: "🚀", label: "Parcours guidé", detail: "Les prochaines étapes" },
        { id: "setup", icon: "⚙️", label: "Configuration", detail: "Structure et permissions" },
        { id: "history", icon: "↩️", label: "Historique", detail: "FyxPilot et retours arrière" },
    ];
    return <section className="pilotage-workspace"><header className="pilotage-intro"><div><p className="eyebrow">FYXPILOT · CENTRE DE CONFIGURATION</p><h2>Un seul espace pour construire et faire évoluer votre serveur</h2><p>Suivez le parcours recommandé, adaptez la structure Discord et retrouvez chaque modification réversible.</p></div><strong>{data.onboarding.percent}%<small>configuration terminée</small></strong></header><div className="pilotage-tabs" role="tablist" aria-label="Outils de pilotage">{tabs.map(tab => <button type="button" role="tab" aria-selected={section === tab.id} className={section === tab.id ? "active" : ""} key={tab.id} onClick={() => setSection(tab.id)}><span aria-hidden="true">{tab.icon}</span><div><strong>{tab.label}</strong><small>{tab.detail}</small></div></button>)}</div><div className="pilotage-content" role="tabpanel">{section === "journey" && <OnboardingDashboard data={data} navigate={openTarget}/>} {section === "setup" && <SetupDashboard data={data} form={form} update={update} runSetup={runSetup} deletePreview={deletePreview} saveNickname={saveNickname}/>} {section === "history" && <FyxPilotDashboard data={data} rollback={rollback} navigate={openTarget}/>}</div></section>;
}
function PremiumDashboard({ premium, guildName, assignableRoles, form, update, activate, configureRoles, disableRoles, busy }: {
    premium: PremiumState;
    guildName: string;
    assignableRoles: Option[];
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    activate: () => Promise<void>;
    configureRoles: () => Promise<void>;
    disableRoles: () => Promise<void>;
    busy: boolean;
}) {
    const founder = premium.founder;
    const manual = premium.manual;
    const rawExpiration = manual.userActive ? manual.grant?.endsAt : founder.endsAt;
    const expiration = rawExpiration ? new Date(rawExpiration).toLocaleString("fr-FR") : null;
    const activeHere = premium.plan === "premium";
    const partnerReady = manual.userActive && !manual.linkedToGuild;
    const disabled = busy || activeHere || (!partnerReady && (founder.userExpired || (!founder.userClaimed && !founder.available)));
    const buttonLabel = activeHere ? expiration ? `Actif jusqu’au ${expiration}` : "Actif sans échéance" : partnerReady ? `Appliquer l’accès partenaire à ${guildName}` : founder.userActive ? `Appliquer à ${guildName}` : founder.userExpired ? "Accès Fondateur terminé" : founder.available ? "Activer 30 jours gratuitement" : "100 accès déjà attribués";
    const bridgeStatus = premium.entitlementConfigured ? premium.entitlementActive ? `Droit Discord${premium.entitlementTest ? " de test" : ""} détecté` : "Passerelle Discord prête, aucun droit payant actif" : "La facturation Discord reste désactivée";
    const rolesConfigured = Boolean(premium.roleConfig.paidRoleId && premium.roleConfig.complimentaryRoleId);
    const rolesReady = Boolean(form.premiumPaidRoleId && form.premiumComplimentaryRoleId && form.premiumPaidRoleId !== form.premiumComplimentaryRoleId);
    return <section className="premium-workspace"><div className="premium-intro"><div><p className="eyebrow">ACCÈS PREMIUM FYXBOT</p><h2>{manual.userActive ? "Votre accès partenaire est prêt" : "30 jours offerts aux 100 premiers utilisateurs"}</h2><p>{manual.userActive ? "Cet accès offert peut être appliqué aux serveurs que vous administrez, sans paiement." : "Aucune carte bancaire n’est demandée et aucun abonnement ne démarre automatiquement. À l’échéance, le serveur revient simplement à Free."}</p></div><span>💎 {manual.userActive ? "PARTENAIRE" : `${founder.remaining}/${founder.limit} places`}</span></div><div className="founder-offer"><div><strong>{activeHere ? "Premium actif" : manual.userActive ? "Accès partenaire disponible" : founder.userActive ? "Votre accès est prêt" : "Offre de lancement"}</strong><p>{activeHere ? expiration ? `Ce serveur bénéficie de Premium jusqu’au ${expiration}.` : "Ce serveur bénéficie de Premium sans échéance." : manual.userActive ? `Appliquez votre accès partenaire à ${guildName}.` : founder.userActive && expiration ? `Votre compte est Premium jusqu’au ${expiration}. Vous pouvez appliquer cet accès aux serveurs que vous administrez.` : `Activez l’offre sur ${guildName}. Les réglages Premium resteront conservés après l’échéance, sans nouvelle création au-delà des limites Free.`}</p><small>Aucun moyen de paiement requis · Aucun renouvellement automatique · Aucun prélèvement</small></div><button type="button" disabled={disabled} onClick={() => void activate()}>{busy ? "Activation…" : buttonLabel}</button></div><div className="premium-role-panel"><div><p className="eyebrow">RÔLES DISCORD AUTOMATIQUES</p><h2>Reconnaître les membres Premium</h2><p>Choisissez deux rôles sans permissions sensibles. FyxBot les attribue, les remplace et les retire automatiquement selon l’accès réel de chaque membre.</p></div><div className="premium-role-status"><article className={premium.roleConfig.paidRoleId ? "ready" : ""}><span aria-hidden="true">💎</span><div><strong>Client Premium</strong><small>{premium.roleConfig.paidRoleId ? "Synchronisation active" : "Rôle non configuré"}</small></div></article><article className={premium.roleConfig.complimentaryRoleId ? "ready" : ""}><span aria-hidden="true">🎁</span><div><strong>Premium offert</strong><small>{premium.roleConfig.complimentaryRoleId ? "Synchronisation active" : "Rôle non configuré"}</small></div></article></div><div className="premium-role-form"><Select label="Abonnement payant" value={form.premiumPaidRoleId || ""} options={[{ id: "", name: "Choisir un rôle" }, ...assignableRoles]} onChange={update("premiumPaidRoleId")}/><Select label="Accès offert ou partenaire" value={form.premiumComplimentaryRoleId || ""} options={[{ id: "", name: "Choisir un rôle" }, ...assignableRoles]} onChange={update("premiumComplimentaryRoleId")}/><button type="button" disabled={busy || !rolesReady} onClick={() => void configureRoles()}>{rolesConfigured ? "Mettre à jour et synchroniser" : "Activer et synchroniser"}</button>{rolesConfigured && <button type="button" className="secondary danger" disabled={busy} onClick={() => void disableRoles()}>Désactiver</button>}</div>{form.premiumPaidRoleId && form.premiumPaidRoleId === form.premiumComplimentaryRoleId && <p className="premium-role-warning" role="alert">Choisissez deux rôles différents.</p>}<small className="premium-role-help">Le rôle FyxBot doit rester placé au-dessus de ces deux rôles dans la hiérarchie Discord.</small></div><div className="premium-plans">{premium.plans.map(plan => <article className={plan.id === "premium" ? "featured" : ""} key={plan.id}><small>{plan.id === premium.plan ? "FORFAIT ACTUEL" : "COMPARAISON"}</small><h3>{plan.name}</h3><p>{plan.description}</p><ul>{plan.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul><button disabled>{plan.id === premium.plan ? "Actif" : plan.id === "premium" ? "Via un accès éligible" : "Inclus"}</button></article>)}</div><p className="premium-note"><strong>État technique :</strong> {bridgeStatus}. Les accès offerts restent séparés du futur abonnement Discord et sont révocables uniquement par le propriétaire.</p></section>;
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
function SocialDashboard({ data, form, update, save, publish, manageSource, selectSource, cancelSource, navigate }: {
    data: State;
    form: Record<string, string>;
    update: (key: string) => (value: string) => void;
    save: () => void;
    publish: () => Promise<void>;
    manageSource: (action: "add" | "update" | "remove", sourceId?: string) => Promise<void>;
    selectSource: (sourceId: string) => void;
    cancelSource: () => void;
    navigate: (target: string) => void;
}) {
    const sources = data.config.social?.sources || [];
    const editingSourceId = form.socialSourceId || "";
    return <section className="community-workspace">
        <div className="social-tabs" role="tablist" aria-label="Réseaux et streaming"><button type="button" role="tab" aria-selected="true">Notifications</button><button type="button" role="tab" aria-selected="false" onClick={() => navigate("FyxStream")}>Ouvrir FyxStream</button></div>
        <div className="settings community-settings"><div><p className="eyebrow">NOTIFICATIONS SOCIALES</p><h2>Canal de diffusion</h2><p>Choisissez où annoncer les lives et les nouvelles vidéos.</p></div><Select label="Salon des notifications" value={form.socialChannelId || ""} options={data.options.textChannels} onChange={update("socialChannelId")}/><Select label="Rôle à notifier" value={form.socialRoleId || ""} options={[{ id: "", name: "Aucun rôle" }, ...data.options.roles]} onChange={update("socialRoleId")}/><span /><button disabled={!form.socialChannelId} onClick={save}>Enregistrer</button></div>
        <div className="settings community-settings social-source-builder"><div><p className="eyebrow">SURVEILLANCE AUTOMATIQUE</p><h2>{editingSourceId ? "Modifier la chaîne" : "Ajouter une chaîne"}</h2><p>YouTube utilise l’identifiant public UC… ; Twitch utilise le nom de la chaîne. Changer l’identifiant relance le suivi depuis le début.</p></div><label>Plateforme<select value={form.socialSourcePlatform || "youtube"} onChange={e => update("socialSourcePlatform")(e.target.value)}><option value="youtube">YouTube</option><option value="twitch">Twitch</option></select></label><label>Identifiant<input value={form.socialSourceIdentifier || ""} onChange={e => update("socialSourceIdentifier")(e.target.value)} placeholder={form.socialSourcePlatform === "twitch" ? "nom_de_chaine" : "UCxxxxxxxxxxxxxxxxxxxxxx"}/></label><label>Nom affiché<input value={form.socialSourceLabel || ""} onChange={e => update("socialSourceLabel")(e.target.value)} placeholder="Ma chaîne"/></label><div className="social-source-builder-actions"><button disabled={!data.config.social?.channelId || !form.socialSourceIdentifier} onClick={() => void manageSource(editingSourceId ? "update" : "add", editingSourceId)}>{editingSourceId ? "Enregistrer" : "Ajouter la surveillance"}</button>{editingSourceId && <button type="button" className="secondary" onClick={cancelSource}>Annuler</button>}</div></div>
        <div className="social-source-list"><div><p className="eyebrow">SOURCES ACTIVES</p><h2>{sources.length} chaîne(s) surveillée(s)</h2></div>{sources.length === 0 ? <p>Aucune source automatique pour le moment.</p> : sources.map(source => <article className={editingSourceId === source.id ? "selected" : ""} key={source.id}><span>{source.platform === "youtube" ? "▶️" : "🟣"}</span><div><strong>{source.label}</strong><small>{source.identifier} · {source.status || "en attente"}</small>{source.lastError && <em>{source.lastError}</em>}</div><div className="social-source-actions"><button type="button" className="edit" onClick={() => selectSource(source.id)}>Modifier</button><button type="button" onClick={() => void manageSource("remove", source.id)}>Retirer</button></div></article>)}</div>
        <div className="settings community-settings social-publisher"><div><p className="eyebrow">ANNONCE MANUELLE</p><h2>Informer la communauté</h2><p>La publication manuelle reste disponible pour les autres plateformes.</p></div><label>Type<select value={form.socialType || "live"} onChange={e => update("socialType")(e.target.value)}><option value="live">Lancement d’un live</option><option value="video">Nouvelle vidéo</option></select></label><label>Plateforme<select value={form.socialPlatform || "YouTube"} onChange={e => update("socialPlatform")(e.target.value)}><option>YouTube</option><option>Twitch</option><option>TikTok</option><option>Instagram</option><option>Kick</option><option>Autre plateforme</option></select></label><label>Créateur<input value={form.socialCreator || ""} onChange={e => update("socialCreator")(e.target.value)} placeholder="Nom du créateur"/></label><label>Titre<input value={form.socialTitle || ""} onChange={e => update("socialTitle")(e.target.value)} placeholder="Titre du live ou de la vidéo"/></label><label className="wide">Lien HTTPS<input type="url" value={form.socialUrl || ""} onChange={e => update("socialUrl")(e.target.value)} placeholder="https://…"/></label><label>Confirmation<input value={form.socialNotifyConfirmation || ""} onChange={e => update("socialNotifyConfirmation")(e.target.value)} placeholder="NOTIFIER"/></label><button disabled={form.socialNotifyConfirmation !== "NOTIFIER" || !form.socialCreator || !form.socialTitle || !form.socialUrl || !data.config.social} onClick={publish}>Publier la notification</button></div>
    </section>;
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
const SUPPORT_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_VIEW_KEY = "fyxbot-dashboard-active-view";
const SELECTED_GUILD_STORAGE_KEY = "fyxbot-selected-guild";
const supportDeepLinkCategories = new Set(["technical", "configuration", "billing", "abuse", "privacy", "security", "other"]);
function initialSelectedGuild() {
    if (typeof window === "undefined")
        return "";
    const requested = new URLSearchParams(window.location.search).get("guildId") || "";
    if (/^\d{17,20}$/.test(requested))
        return requested;
    try {
        const stored = window.sessionStorage.getItem(SELECTED_GUILD_STORAGE_KEY) || "";
        return /^\d{17,20}$/.test(stored) ? stored : "";
    }
    catch {
        return "";
    }
}
function persistSelectedGuild(guildId: string) {
    if (typeof window === "undefined" || !/^\d{17,20}$/.test(guildId))
        return;
    try { window.sessionStorage.setItem(SELECTED_GUILD_STORAGE_KEY, guildId); }
    catch { /* Le paramètre d’URL conserve malgré tout la sélection. */ }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("guildId", guildId);
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}
function clearSelectedGuild() {
    if (typeof window === "undefined")
        return;
    try { window.sessionStorage.removeItem(SELECTED_GUILD_STORAGE_KEY); }
    catch { /* La sélection en mémoire est facultative. */ }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("guildId");
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}
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
function initialSupportRequestId() {
    if (typeof window === "undefined")
        return "";
    const id = new URLSearchParams(window.location.search).get("supportRequest") || "";
    return SUPPORT_REQUEST_ID_PATTERN.test(id) ? id : "";
}
function SupportCloseAction({ request, closeRequest, reopenRequest, deleteRequest, canDeleteRequest, closingRequest, reopeningRequest, deletingRequest }: {
    request: SupportRequest;
    closeRequest: () => void;
    reopenRequest: () => void;
    deleteRequest: () => void;
    canDeleteRequest: boolean;
    closingRequest: boolean;
    reopeningRequest: boolean;
    deletingRequest: boolean;
}) {
    const archived = request.status === "closed" || request.status === "resolved";
    const expiration = request.expiresAt ? new Date(request.expiresAt).toLocaleDateString("fr-FR") : null;
    const reopenLimit = request.reopenUntil ? new Date(request.reopenUntil).toLocaleDateString("fr-FR") : null;
    return <div className={`support-close-action${archived ? " is-closed" : ""}`}>
        <p>{archived
            ? <>Cette demande est archivée{expiration ? ` jusqu’au ${expiration}` : " pendant 90 jours"}. {request.canReopen && reopenLimit ? `Vous pouvez la rouvrir jusqu’au ${reopenLimit}.` : "Le délai de réouverture est terminé."}</>
            : "Le problème est réglé ? Fermez la demande pour la retirer des demandes actives. Son historique sera conservé pendant 90 jours."}</p>
        <div className="support-lifecycle-actions">
            {!archived && <button type="button" disabled={closingRequest} onClick={closeRequest}>{closingRequest ? "Fermeture…" : "Fermer la demande"}</button>}
            {archived && request.canReopen && <button type="button" disabled={reopeningRequest || deletingRequest} onClick={reopenRequest}>{reopeningRequest ? "Réouverture…" : "Rouvrir"}</button>}
            {archived && canDeleteRequest && <button type="button" className="danger" disabled={deletingRequest || reopeningRequest} onClick={deleteRequest}>{deletingRequest ? "Suppression…" : "Supprimer maintenant"}</button>}
        </div>
    </div>;
}
function SupportDashboard({ workspace, conversation, composing, form, update, selectRequest, startRequest, createRequest, reply, updateRequest, closeRequest, reopenRequest, deleteRequest, closingRequest, reopeningRequest, deletingRequest }: {
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
    closeRequest: () => void;
    reopenRequest: () => void;
    deleteRequest: () => void;
    closingRequest: boolean;
    reopeningRequest: boolean;
    deletingRequest: boolean;
}) {
    const [onlyActionable, setOnlyActionable] = useState(false);
    if (!workspace)
        return <section className="support-workspace"><div className="support-loading"><span>🛟</span><h2>Chargement du support FyxBot…</h2></div></section>;
    const access = workspace.access || { role: workspace.ownerAccess ? "owner" : "user", canViewAll: workspace.ownerAccess, canReplyAsStaff: workspace.ownerAccess, canManageStatus: workspace.ownerAccess, canManagePriority: workspace.ownerAccess, canDeleteRequests: workspace.ownerAccess, canManageTeam: workspace.ownerAccess };
    const teamAccess = access.canViewAll;
    const accessLabel = access.role === "owner" ? "Propriétaire" : access.role === "administrator" ? "Administrateur Support" : access.role === "moderator" ? "Modérateur Support" : null;
    const actionable = (request: SupportRequest) => ["open", "in_progress", "waiting_user"].includes(request.status)
        && request.lastAuthorRole === (teamAccess ? "user" : "staff");
    const visibleRequests = onlyActionable ? workspace.requests.filter(actionable) : workspace.requests;
    return <section className="support-workspace">
        <div className="support-summary"><div><p className="eyebrow">CENTRE D’ASSISTANCE</p><h2>{teamAccess ? "Boîte de réception FyxBot" : "Vos demandes à l’équipe FyxBot"}</h2><p>{teamAccess ? "Suivez les demandes de tous les serveurs depuis un espace privé." : "Expliquez votre problème et retrouvez les réponses sans quitter le panel."}</p>{accessLabel && <b className={`support-access-badge ${access.role}`}>{accessLabel}</b>}</div><div className="support-metrics"><article className="support-action-metric"><strong>{workspace.counts.actionRequired}</strong><small>{teamAccess ? "à traiter" : "réponses"}</small></article><article><strong>{workspace.counts.open}</strong><small>actives</small></article><article><strong>{workspace.counts.urgent}</strong><small>urgentes</small></article></div>{workspace.supportUrl && <a href={workspace.supportUrl} target="_blank" rel="noreferrer">Serveur d’assistance ↗</a>}</div>
        <div className="support-layout"><div className="support-inbox"><header><div><p className="eyebrow">DEMANDES</p><h3>{teamAccess ? "Tous les serveurs" : "Mon historique"}</h3></div><div className="support-inbox-actions"><button type="button" className={onlyActionable ? "active" : ""} aria-pressed={onlyActionable} onClick={() => setOnlyActionable(value => !value)}>{teamAccess ? "À traiter" : "Réponses"} ({workspace.counts.actionRequired})</button><button type="button" onClick={startRequest}>+ Nouvelle</button></div></header><div className="support-request-list">{visibleRequests.length === 0 ? <p className="support-empty">{onlyActionable ? "Aucune demande nécessitant votre attention." : "Aucune demande pour le moment."}</p> : visibleRequests.map(request => <button type="button" className={conversation?.request.id === request.id && !composing ? "selected" : ""} key={request.id} onClick={() => selectRequest(request.id)}><span className={`support-priority ${request.priority}`}/><div><strong>{request.subject}{actionable(request) && <span className="support-needs-action"> · À consulter</span>}</strong><small>{request.guildName} · {request.requesterName}</small><em>{new Date(request.updatedAt).toLocaleString("fr-FR")}</em></div><b className={`support-status ${request.status}`}>{supportStatusLabels[request.status]}</b></button>)}</div></div>
            <div className="support-detail">{composing ? <><header><div><p className="eyebrow">NOUVELLE DEMANDE</p><h2>Comment pouvons-nous vous aider ?</h2><p>Ne transmettez jamais de mot de passe, jeton Discord ou code d’authentification.</p></div><span>📝</span></header><div className="support-form"><label>Catégorie<select value={form.supportCategory || "technical"} onChange={event => update("supportCategory")(event.target.value)}>{Object.entries(supportCategoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Priorité<select value={form.supportPriority || "normal"} onChange={event => update("supportPriority")(event.target.value)}>{Object.entries(supportPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="full-row">Sujet<input maxLength={120} value={form.supportSubject || ""} onChange={event => update("supportSubject")(event.target.value)} placeholder="Ex. La commande /setup ne répond plus"/></label><label className="full-row">Description<textarea rows={8} maxLength={4000} value={form.supportMessage || ""} onChange={event => update("supportMessage")(event.target.value)} placeholder="Décrivez les étapes, le résultat obtenu et le résultat attendu…"/></label><button type="button" disabled={(form.supportSubject || "").trim().length < 5 || (form.supportMessage || "").trim().length < 20} onClick={createRequest}>Envoyer la demande</button></div></> : conversation ? <><header className="support-conversation-head"><div><p className="eyebrow">{supportCategoryLabels[conversation.request.category] || "DEMANDE"}</p><h2>{conversation.request.subject}</h2><p>{conversation.request.guildName} · créée par {conversation.request.requesterName} le {new Date(conversation.request.createdAt).toLocaleString("fr-FR")}</p></div><div><b className={`support-status ${conversation.request.status}`}>{supportStatusLabels[conversation.request.status]}</b><b className={`support-priority-label ${conversation.request.priority}`}>{supportPriorityLabels[conversation.request.priority]}</b></div></header><SupportCloseAction request={conversation.request} closeRequest={closeRequest} reopenRequest={reopenRequest} deleteRequest={deleteRequest} canDeleteRequest={!teamAccess || access.canDeleteRequests} closingRequest={closingRequest} reopeningRequest={reopeningRequest} deletingRequest={deletingRequest}/>{access.canManageStatus && <div className="support-owner-controls"><label>Statut<select value={form.supportStatus || conversation.request.status} onChange={event => update("supportStatus")(event.target.value)}>{Object.entries(supportStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{access.canManagePriority && <label>Priorité<select value={form.supportManagePriority || conversation.request.priority} onChange={event => update("supportManagePriority")(event.target.value)}>{Object.entries(supportPriorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}<button type="button" onClick={updateRequest}>Mettre à jour</button></div>}<div className="support-thread">{conversation.messages.map(message => <article className={message.authorRole === "staff" ? "staff" : "user"} key={message.id}><div><span>{message.authorName.slice(0, 1).toUpperCase()}</span><strong>{message.authorName}</strong>{message.authorRole === "staff" && <b>ÉQUIPE FYXBOT</b>}<time>{new Date(message.createdAt).toLocaleString("fr-FR")}</time></div><p>{message.body}</p></article>)}</div>{!["resolved", "closed"].includes(conversation.request.status) && <div className="support-reply"><label>Répondre<textarea rows={5} maxLength={4000} value={form.supportReply || ""} onChange={event => update("supportReply")(event.target.value)} placeholder="Votre réponse…"/></label><button type="button" disabled={(form.supportReply || "").trim().length < 2} onClick={reply}>Envoyer</button></div>}{conversation.events.length > 1 && <details className="support-history"><summary>Historique de la demande</summary>{conversation.events.slice(1).map(event => <p key={event.id}><strong>{event.actorName}</strong> · {event.detail}<time>{new Date(event.createdAt).toLocaleString("fr-FR")}</time></p>)}</details>}</> : <div className="support-empty-detail"><span>🛟</span><h2>Sélectionnez une demande</h2><p>Ouvrez une conversation existante ou créez une nouvelle demande.</p><button type="button" onClick={startRequest}>Créer une demande</button></div>}</div></div>
        <div className="support-faq"><div><p className="eyebrow">AVANT D’ÉCRIRE</p><h2>Réponses rapides</h2></div><article><strong>Une commande n’apparaît pas</strong><p>Vérifiez que FyxBot a été invité avec le droit d’utiliser les commandes, puis relancez la synchronisation globale.</p></article><article><strong>FyxBot refuse une action</strong><p>Placez son rôle au-dessus des rôles qu’il doit gérer et vérifiez ses permissions dans la catégorie concernée.</p></article><article><strong>Demande liée aux données</strong><p>Choisissez “Données personnelles” et indiquez votre identifiant Discord ainsi que le serveur concerné.</p></article></div>
    </section>;
}
type DashboardProps = {
    variant?: "v1" | "v2";
};

export default function Dashboard({ variant = "v1" }: DashboardProps = {}) {
    const isV2 = variant === "v2";
    const [active, setActiveState] = useState("Vue d’ensemble"), [data, setData] = useState<State | null>(null), [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null), [supportStaff, setSupportStaff] = useState<SupportStaffMember[]>([]), [memberWarnings, setMemberWarnings] = useState<MemberWarning[] | null>(null), [supportWorkspace, setSupportWorkspace] = useState<SupportWorkspace | null>(null), [supportConversation, setSupportConversation] = useState<SupportConversation | null>(null), [supportComposing, setSupportComposing] = useState(false), [requestedSupportCategory, setRequestedSupportCategory] = useState(initialSupportCategory), [requestedSupportId, setRequestedSupportId] = useState(initialSupportRequestId), [account, setAccount] = useState<Account | null>(null), [accountMenuOpen, setAccountMenuOpen] = useState(false), [mobileNavOpen, setMobileNavOpen] = useState(false), [selectedGuild, setSelectedGuild] = useState(""), [form, setForm] = useState<Record<string, string>>({}), [notice, setNotice] = useState("Connexion à FyxBot…"), [authenticated, setAuthenticated] = useState<boolean | null>(null), [csrfToken, setCsrfToken] = useState("");
    const [closingSupportRequest, setClosingSupportRequest] = useState(false);
    const [reopeningSupportRequest, setReopeningSupportRequest] = useState(false);
    const [deletingSupportRequest, setDeletingSupportRequest] = useState(false);
    const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>("simple");
    const [favorites, setFavorites] = useState<string[]>([]);
    const [preferencesReady, setPreferencesReady] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [alertsOpen, setAlertsOpen] = useState(false);
    const refreshController = useRef<AbortController | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const setActive = useCallback((view: string) => {
        const normalizedView = normalizeDashboardView(view);
        try { window.sessionStorage.setItem(ACTIVE_VIEW_KEY, normalizedView); }
        catch { /* La navigation reste utilisable si le stockage est indisponible. */ }
        setActiveState(normalizedView);
    }, []);
    useEffect(() => {
        let storedMode: InterfaceMode = "simple";
        let storedFavorites: string[] = [];
        try {
            storedMode = window.localStorage.getItem(FYXBOT_INTERFACE_MODE_KEY) === "advanced" ? "advanced" : "simple";
            const parsed = JSON.parse(window.localStorage.getItem(FYXBOT_FAVORITES_KEY) || "[]");
            storedFavorites = Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
        }
        catch { /* Les préférences restent facultatives. */ }
        const timer = window.setTimeout(() => {
            setInterfaceMode(storedMode);
            setFavorites(storedFavorites);
            setPreferencesReady(true);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);
    useEffect(() => {
        if (!preferencesReady)
            return;
        try {
            window.localStorage.setItem(FYXBOT_INTERFACE_MODE_KEY, interfaceMode);
            window.localStorage.setItem(FYXBOT_FAVORITES_KEY, JSON.stringify(favorites));
        }
        catch { /* Le panel reste utilisable sans stockage local. */ }
    }, [favorites, interfaceMode, preferencesReady]);
    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setAlertsOpen(false);
                setSearchOpen(open => !open);
            }
            if (event.key === "Escape") {
                setSearchOpen(false);
                setAlertsOpen(false);
            }
        };
        window.addEventListener("keydown", handleShortcut);
        return () => window.removeEventListener("keydown", handleShortcut);
    }, []);
    useEffect(() => {
        if (!searchOpen)
            return;
        const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [searchOpen]);
    useEffect(() => {
        if (!supportDeepLinkCategories.has(requestedSupportCategory))
            return;
        try { window.sessionStorage.setItem(SUPPORT_DEEP_LINK_KEY, requestedSupportCategory); } catch { /* Navigation directe toujours disponible. */ }
    }, [requestedSupportCategory]);
    useEffect(() => {
        document.body.dataset.dashboardVersion = variant;
        return () => {
            delete document.body.dataset.dashboardVersion;
        };
    }, [variant]);
    useEffect(() => {
        let savedView = "";
        try { savedView = window.sessionStorage.getItem(ACTIVE_VIEW_KEY) || ""; }
        catch { /* La navigation reste utilisable si le stockage est indisponible. */ }
        const normalizedView = normalizeDashboardView(savedView);
        if (normalizedView === "Créateur" || !Object.hasOwn(icons, normalizedView))
            return;
        const timer = window.setTimeout(() => setActive(normalizedView), 0);
        return () => window.clearTimeout(timer);
    }, [setActive]);
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
    const refresh = useCallback(async (guildId = initialSelectedGuild(), hydrateForm = true) => {
        if (guildId)
            setSelectedGuild(guildId);
        refreshController.current?.abort();
        const controller = new AbortController();
        refreshController.current = controller;
        try {
            const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
            const r = await fetch(`${API}/state${query}`, { credentials: "include", signal: controller.signal }), n = await r.json();
            if (refreshController.current !== controller)
                return;
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
            persistSelectedGuild(n.guild.id);
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
                    botNickname: n.guild.botNickname || "",
                    botNicknameConfirmation: "",
                    setupMode: n.setupAnalysis?.recommendation === "complete" ? "complete" : "synchronize",
                    setupConfirmation: "",
                    setupDescription: n.setupBlueprint?.description || "",
                    socialChannelId: n.config.social?.channelId || "",
                    socialRoleId: n.config.social?.roleId || "",
                    socialSourceId: "",
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
                    messageMode: "message",
                    messagePublicationId: "",
                    messageChannelId: "",
                    messageContent: "",
                    messageTitle: "",
                    messageDescription: "",
                    messageColor: "#ef4444",
                    messageLinkUrl: "",
                    messageButtonLabel: "",
                    messageImageUrl: "",
                    messageThumbnailUrl: "",
                    messageFooter: "FyxBot",
                    supportCategory: "technical",
                    supportPriority: "normal",
                    supportSubject: "",
                    supportMessage: "",
                    supportReply: "",
                    supportStaffUserId: "",
                    supportStaffRole: "moderator",
                    supportStaffConfirmation: "",
                    premiumPaidRoleId: n.premium.roleConfig?.paidRoleId || "",
                    premiumComplimentaryRoleId: n.premium.roleConfig?.complimentaryRoleId || "",
                });
        }
        catch (error) {
            if (controller.signal.aborted || refreshController.current !== controller)
                return;
            if (guildId)
                setData(current => current?.guild.id === guildId
                    ? { ...current, bot: { ...current.bot, online: false } }
                    : null);
            setNotice(error instanceof Error && error.message
                ? error.message
                : "Le bot FyxBot ou sa passerelle locale est indisponible.");
        }
        finally {
            if (refreshController.current === controller)
                refreshController.current = null;
        }
    }, []);
    useEffect(() => () => refreshController.current?.abort(), []);
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
    }, [authenticated, selectedGuild, requestedSupportCategory, setActive]);
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
        if (authenticated !== true || !selectedGuild)
            return;
        const initialTimer = window.setTimeout(() => void loadSupport(), 0);
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible")
                void loadSupport();
        }, active === "Assistance FyxBot" ? 30000 : 60000);
        return () => {
            window.clearTimeout(initialTimer);
            window.clearInterval(timer);
        };
    }, [active, authenticated, selectedGuild, loadSupport]);
    const selectSupportRequest = useCallback(async (requestId: string) => {
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
    }, []);
    useEffect(() => {
        if (authenticated !== true || !selectedGuild || !requestedSupportId)
            return;
        const timer = window.setTimeout(() => {
            setActive("Assistance FyxBot");
            void selectSupportRequest(requestedSupportId);
            setRequestedSupportId("");
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("supportRequest");
            window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [authenticated, requestedSupportId, selectedGuild, selectSupportRequest, setActive]);
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
    async function closeSupportRequest() {
        const request = supportConversation?.request;
        if (!request || request.status === "closed" || closingSupportRequest)
            return;
        if (!window.confirm("Fermer cette demande ? Elle restera dans l’historique et pourra être rouverte avec une nouvelle réponse."))
            return;
        setClosingSupportRequest(true);
        setNotice("Fermeture de la demande…");
        try {
            const response = await fetch(`${API}/support/close`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ requestId: request.id }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            await loadSupport();
            await selectSupportRequest(request.id);
            setNotice("✓ Demande fermée, historique conservé");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Échec de la fermeture.");
        }
        finally {
            setClosingSupportRequest(false);
        }
    }
    async function reopenSupportRequest() {
        const request = supportConversation?.request;
        if (!request || !["resolved", "closed"].includes(request.status) || !request.canReopen || reopeningSupportRequest)
            return;
        setReopeningSupportRequest(true);
        setNotice("Réouverture de la demande…");
        try {
            const response = await fetch(`${API}/support/reopen`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ requestId: request.id }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            await loadSupport();
            await selectSupportRequest(request.id);
            setNotice("✓ Demande rouverte");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Échec de la réouverture.");
        }
        finally {
            setReopeningSupportRequest(false);
        }
    }
    async function deleteSupportHistory() {
        const request = supportConversation?.request;
        if (!request || !["resolved", "closed"].includes(request.status) || deletingSupportRequest)
            return;
        const confirmation = window.prompt("Cette suppression est définitive. Écrivez SUPPRIMER pour effacer la demande et tous ses messages.");
        if (confirmation !== "SUPPRIMER")
            return;
        setDeletingSupportRequest(true);
        setNotice("Suppression définitive de la demande…");
        try {
            const response = await fetch(`${API}/support/delete`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ requestId: request.id, confirmation }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setSupportConversation(null);
            await loadSupport();
            setNotice("✓ Demande supprimée définitivement");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Échec de la suppression.");
        }
        finally {
            setDeletingSupportRequest(false);
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
        const partnerAccess = data.premium.manual.userActive;
        const expectedExpiration = data.premium.manual.grant?.endsAt
            ? new Date(data.premium.manual.grant.endsAt)
            : data.premium.founder.endsAt
            ? new Date(data.premium.founder.endsAt)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const accessPeriod = partnerAccess && !data.premium.manual.grant?.endsAt
            ? "sans échéance"
            : `jusqu’au ${expectedExpiration.toLocaleString("fr-FR")}`;
        const confirmed = window.confirm(`Activer FyxBot Premium sur ${data.guild.name} ${accessPeriod} ?\n\nAucune carte bancaire ne sera demandée. Aucun abonnement ni renouvellement automatique ne sera créé. Après une éventuelle échéance, les réglages resteront conservés mais le serveur reviendra aux limites Free.`);
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
    async function configurePremiumMemberRoles() {
        if (!data || !form.premiumPaidRoleId || !form.premiumComplimentaryRoleId)
            return;
        setNotice("Synchronisation des rôles Premium…");
        try {
            const response = await fetch(`${API}/premium/roles/configure`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, paidRoleId: form.premiumPaidRoleId, complimentaryRoleId: form.premiumComplimentaryRoleId }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            await refresh(selectedGuild);
            setNotice(`✓ ${payload.message}`);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Configuration des rôles Premium impossible.");
        }
    }
    async function disablePremiumMemberRoles() {
        if (!data || !window.confirm(`Désactiver les rôles Premium automatiques sur ${data.guild.name} ?\n\nLes rôles attribués par cette fonction seront retirés des membres.`))
            return;
        setNotice("Désactivation des rôles Premium…");
        try {
            const response = await fetch(`${API}/premium/roles/disable`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, confirmation: "DESACTIVER" }) });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            await refresh(selectedGuild);
            setNotice(`✓ ${payload.message}`);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Désactivation des rôles Premium impossible.");
        }
    }
    async function runSetup(mode: SetupMode | "design") {
        setNotice(mode === "design" ? "Création de votre proposition personnalisée…" : mode === "reset" ? "Sauvegarde et reconstruction du serveur en cours…" : mode === "synchronize" ? "Synchronisation de la structure et des permissions…" : "Ajout des éléments manquants…");
        try {
            const r = await fetch(`${API}/setup`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, mode, description: form.setupDescription || "", confirmation: form.setupConfirmation || "" }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setForm(f => ({ ...f, setupConfirmation: "" }));
            if (mode === "design") {
                setData(current => current ? { ...current, setupBlueprint: n.blueprint, setupAnalysis: n.analysis, setupSimulation: n.simulation } : current);
                setNotice(`✓ ${n.message}`);
                return;
            }
            await refresh(selectedGuild);
            setNotice(`✓ ${n.message}`);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : "Échec de la configuration.");
        }
    }
    async function saveBotNickname(nickname: string, confirmation: string) {
        setNotice(nickname ? "Personnalisation du nom de FyxBot…" : "Réinitialisation du nom de FyxBot…");
        try {
            const response = await fetch(`${API}/bot/nickname`, {
                method: "POST",
                credentials: "include",
                headers: mutationHeaders(csrfToken),
                body: JSON.stringify({ guildId: selectedGuild, nickname, confirmation }),
            });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setForm(current => ({ ...current, botNickname: payload.nickname || "", botNicknameConfirmation: "" }));
            await refresh(selectedGuild, false);
            setNotice(`✓ ${payload.message}`);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Impossible de modifier le nom affiché de FyxBot.");
        }
    }
    async function deleteSetupPreview() {
        if (!window.confirm("Supprimer cet aperçu de configuration ?\n\nAucun rôle, catégorie ou salon Discord ne sera supprimé."))
            return;
        setNotice("Suppression de l’aperçu…");
        try {
            const response = await fetch(`${API}/setup/preview/delete`, {
                method: "POST",
                credentials: "include",
                headers: mutationHeaders(csrfToken),
                body: JSON.stringify({ guildId: selectedGuild, confirmation: "SUPPRIMER" }),
            });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setForm(current => ({ ...current, setupDescription: "", setupConfirmation: "" }));
            await refresh(selectedGuild);
            setNotice(`✓ ${payload.message}`);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Suppression de l’aperçu impossible.");
        }
    }
    async function rollbackChange(changeId: string, confirmation: string) {
        setNotice("Restauration sécurisée du serveur en cours…");
        try {
            const response = await fetch(`${API}/history/rollback`, {
                method: "POST",
                credentials: "include",
                headers: mutationHeaders(csrfToken),
                body: JSON.stringify({ guildId: selectedGuild, changeId, confirmation }),
            });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            await refresh(selectedGuild);
            setNotice(`✓ ${payload.message}`);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Retour arrière impossible.");
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
    function selectSocialSource(sourceId: string) {
        const source = data?.config.social?.sources?.find(item => item.id === sourceId);
        if (!source)
            return;
        setForm(current => ({ ...current, socialSourceId: source.id, socialSourcePlatform: source.platform, socialSourceIdentifier: source.identifier, socialSourceLabel: source.label }));
    }
    function resetSocialSourceEditor() {
        setForm(current => ({ ...current, socialSourceId: "", socialSourcePlatform: "youtube", socialSourceIdentifier: "", socialSourceLabel: "" }));
    }
    function openContentLibraryItem(item: ContentLibraryItem) {
        if (item.kind === "message" && item.publicationId) {
            selectPublishedMessage(item.publicationId);
            setActive("Messages");
            return;
        }
        if (item.kind === "ticket" && item.entityId) {
            selectTicketPanel(item.entityId);
            setActive("Tickets");
            return;
        }
        if (item.kind === "role" && item.entityId) {
            selectRolePanel(item.entityId);
            setActive("Rôles");
            return;
        }
        if (item.kind === "social" && item.entityId) {
            selectSocialSource(item.entityId);
            setActive("Social");
            return;
        }
        setActive(item.target);
    }
    async function removeContentLibraryItem(item: ContentLibraryItem, confirmation: string) {
        setNotice(`Retrait de ${item.title}…`);
        try {
            const response = await fetch(`${API}/content/delete`, {
                method: "POST",
                credentials: "include",
                headers: mutationHeaders(csrfToken),
                body: JSON.stringify({ guildId: selectedGuild, itemId: item.id, confirmation }),
            });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            if (item.kind === "message" && item.publicationId === form.messagePublicationId)
                resetMessageComposer();
            if (item.kind === "ticket" && item.entityId === form.ticketPanelId)
                setForm(current => ({ ...current, ticketPanelId: "", ticketTitle: "", ticketRequestType: "", ticketEditConfirmation: "" }));
            if (item.kind === "role" && item.entityId === form.rolePanelId)
                setForm(current => ({ ...current, rolePanelId: "", rolePanelTitle: "", rolePanelDescription: "", rolePanelEditConfirmation: "" }));
            if (item.kind === "social" && item.entityId === form.socialSourceId)
                resetSocialSourceEditor();
            await refresh(selectedGuild, false);
            setNotice(`✓ ${payload.message}`);
            return true;
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Impossible de retirer ce contenu.");
            return false;
        }
    }
    async function restoreContentLibraryItem(item: ContentTrashItem, confirmation: string) {
        setNotice(`Restauration de ${item.title}…`);
        try {
            const response = await fetch(`${API}/content/restore`, {
                method: "POST",
                credentials: "include",
                headers: mutationHeaders(csrfToken),
                body: JSON.stringify({ guildId: selectedGuild, trashId: item.id, confirmation }),
            });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            await refresh(selectedGuild, false);
            setNotice(`✓ ${payload.message}`);
            return true;
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Impossible de restaurer ce contenu.");
            return false;
        }
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
    async function manageSocialSource(action: "add" | "update" | "remove", sourceId = "") {
        setNotice(action === "add" ? "Ajout de la surveillance automatique…" : action === "update" ? "Modification de la surveillance…" : "Suppression de la surveillance…");
        try {
            const r = await fetch(`${API}/social/sources`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, action, sourceId, platform: form.socialSourcePlatform || "youtube", identifier: form.socialSourceIdentifier, label: form.socialSourceLabel }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            resetSocialSourceEditor();
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
        const editing = Boolean(form.messagePublicationId);
        setNotice(editing ? "Modification du message Discord…" : "Publication du message dans Discord…");
        try {
            const r = await fetch(`${API}/messages/send`, { method: "POST", credentials: "include", headers: mutationHeaders(csrfToken), body: JSON.stringify({ guildId: selectedGuild, mode: "message", publicationId: form.messagePublicationId || null, channelId: form.messageChannelId, content: form.messageContent, title: form.messageTitle, description: form.messageDescription, color: form.messageColor, imageUrl: form.messageImageUrl, thumbnailUrl: form.messageThumbnailUrl, linkUrl: form.messageLinkUrl, buttonLabel: form.messageButtonLabel, footer: form.messageFooter, confirmation: form.messageConfirmation }) }), n = await r.json();
            if (!r.ok)
                throw Error(n.error);
            setNotice(`✓ ${n.message}`);
            setForm(f => ({ ...f, messageConfirmation: "" }));
            await refresh(selectedGuild, false);
        }
        catch (e) {
            setNotice(e instanceof Error ? e.message : editing ? "Échec de la modification." : "Échec de la publication.");
        }
    }
    function selectPublishedMessage(id: string) {
        if (!id) {
            resetMessageComposer();
            return;
        }
        const publication = data?.publishedMessages?.find(message => message.id === id);
        if (!publication)
            return;
        setForm(current => ({
            ...current,
            messageMode: "message",
            messagePublicationId: publication.id,
            messageChannelId: publication.channelId,
            messageContent: publication.content,
            messageTitle: publication.title,
            messageDescription: publication.description,
            messageColor: publication.color || "#ef4444",
            messageLinkUrl: publication.linkUrl,
            messageButtonLabel: publication.buttonLabel,
            messageImageUrl: publication.imageUrl,
            messageThumbnailUrl: publication.thumbnailUrl,
            messageFooter: publication.footer,
            messageConfirmation: "",
        }));
    }
    function resetMessageComposer() {
        setForm(current => ({
            ...current,
            messageMode: "message",
            messagePublicationId: "",
            messageChannelId: "",
            messageContent: "",
            messageTitle: "",
            messageDescription: "",
            messageColor: "#ef4444",
            messageLinkUrl: "",
            messageButtonLabel: "",
            messageImageUrl: "",
            messageThumbnailUrl: "",
            messageFooter: "FyxBot",
            messageConfirmation: "",
        }));
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
    async function grantPremiumAccess() {
        setNotice("Attribution de l’accès Premium…");
        try {
            const response = await fetch(`${API}/premium/grants/create`, {
                method: "POST",
                credentials: "include",
                headers: mutationHeaders(csrfToken),
                body: JSON.stringify({
                    userId: form.premiumGrantUserId,
                    reason: form.premiumGrantReason,
                    durationDays: Number(form.premiumGrantDuration || 0),
                    confirmation: form.premiumGrantConfirmation,
                }),
            });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setCreatorStats(current => current ? { ...current, manualPremiumGrants: payload.grants || [] } : current);
            setForm(current => ({ ...current, premiumGrantUserId: "", premiumGrantReason: "Partenaire FyxBot", premiumGrantConfirmation: "" }));
            setNotice(`✓ Accès Premium accordé à ${payload.grant.displayName}`);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Attribution Premium impossible.");
        }
    }
    async function revokePremiumAccess(userId: string) {
        const grant = creatorStats?.manualPremiumGrants.find(item => item.userId === userId && item.active);
        if (!window.confirm(`Retirer l’accès Premium offert de ${grant?.displayName || userId} ? Les serveurs liés reviendront aux limites Free si aucun autre droit n’est actif.`))
            return;
        setNotice("Retrait de l’accès Premium…");
        try {
            const response = await fetch(`${API}/premium/grants/revoke`, {
                method: "POST",
                credentials: "include",
                headers: mutationHeaders(csrfToken),
                body: JSON.stringify({ userId, confirmation: "RETIRER" }),
            });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setCreatorStats(current => current ? { ...current, manualPremiumGrants: payload.grants || [] } : current);
            setNotice("✓ Accès Premium offert retiré");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Révocation Premium impossible.");
        }
    }
    async function leaveCreatorGuild(guildId: string, guildName: string) {
        if (!window.confirm(`Retirer définitivement FyxBot de « ${guildName} » ? Le bot quittera le serveur et les données associées seront nettoyées.`))
            return;
        setNotice(`Retrait de FyxBot de ${guildName}…`);
        try {
            const response = await fetch(`${API}/creator/guilds/leave`, {
                method: "POST",
                credentials: "include",
                headers: mutationHeaders(csrfToken),
                body: JSON.stringify({ guildId, confirmation: form.creatorRemovalConfirmation }),
            });
            const payload = await response.json();
            if (!response.ok)
                throw Error(payload.error);
            setCreatorStats(payload.stats);
            setForm(current => ({ ...current, creatorRemovalGuildId: "", creatorRemovalConfirmation: "" }));
            if (selectedGuild === guildId) {
                const nextGuild = payload.stats.installations[0]?.guildId || "";
                if (nextGuild)
                    await refresh(nextGuild);
                else {
                    setData(null);
                    setSelectedGuild("");
                    clearSelectedGuild();
                }
            }
            setNotice(`✓ FyxBot a quitté ${payload.removedGuild.guildName}`);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Retrait de FyxBot impossible.");
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
        refreshController.current?.abort();
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
            clearSelectedGuild();
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
    const modules = [{ icon: "🧭", name: "Pilotage", detail: "Parcours, structure et historique", tone: "orange" }, { icon: "✉️", name: "Messages", detail: "Texte, embeds et images", tone: "orange" }, { icon: "🎫", name: "Tickets", detail: `${data?.metrics.openTickets ?? 0} ticket(s) ouvert(s)`, tone: "violet" }, { icon: "📜", name: "Règlement", detail: data?.config.rules ? "Publié et modifiable" : "À configurer", tone: "orange" }, { icon: "🎂", name: "Anniversaires", detail: `${Object.keys(data?.config.birthdays?.birthdays || {}).length} date(s) enregistrée(s)`, tone: "violet" }, { icon: "📣", name: "Social", detail: data?.config.social ? "Notifications prêtes" : "À configurer", tone: "orange" }, { icon: "🔊", name: "Vocaux", detail: `${Object.keys(data?.config.temporaryVoice?.rooms || {}).length} salon(s) temporaire(s)`, tone: "blue" }, { icon: "🛡️", name: "Sécurité", detail: `${data?.metrics.securityRules ?? 0} protections actives`, tone: "green" }, { icon: "👋", name: "Accueil", detail: "Bienvenue et rôles", tone: "blue" }, { icon: "🧾", name: "Logs", detail: "Journal centralisé", tone: "orange" }];
    const authorizedNavigationGroups = navigationGroups.map(group => ({
        ...group,
        items: group.items.filter(item => item !== "Créateur" || data?.creatorAccess),
    })).filter(group => group.items.length > 0);
    const visibleNavigationGroups = authorizedNavigationGroups.map(group => ({
        ...group,
        items: group.items.filter(item => interfaceMode === "advanced" || SIMPLE_NAVIGATION_ITEMS.has(item)),
    })).filter(group => group.items.length > 0);
    const searchablePanelItems = [
        ...authorizedNavigationGroups.flatMap(group => group.items.map(name => ({ name, group: group.label }))),
        { name: "FyxStream", group: "Streaming" },
    ];
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase("fr-FR");
    const searchResults = searchablePanelItems.filter(item => !normalizedSearch
        || `${item.name} ${item.group}`.toLocaleLowerCase("fr-FR").includes(normalizedSearch));
    const availablePanelNames = new Set(searchablePanelItems.map(item => item.name));
    const visibleFavorites = favorites.filter(item => availablePanelNames.has(item));
    const visibleModules = interfaceMode === "simple"
        ? modules.filter(module => SIMPLE_NAVIGATION_ITEMS.has(module.name))
        : modules;
    const panelAlerts: PanelAlert[] = [];
    if (supportWorkspace && supportWorkspace.counts.actionRequired > 0)
        panelAlerts.push({ id: "support", icon: "🛟", title: supportWorkspace.access.canReplyAsStaff ? "Demandes support à traiter" : "Réponses du support", detail: `${supportWorkspace.counts.actionRequired} demande(s) nécessitent votre attention.`, target: "Assistance FyxBot", tone: "warning" });
    if (data && !data.bot.online)
        panelAlerts.push({ id: "bot-offline", icon: "🔴", title: "Bot déconnecté", detail: "FyxBot ne répond plus sur Discord.", target: "Assistance FyxBot", tone: "critical" });
    if (data && data.setupAnalysis.totals.permissionIssues > 0)
        panelAlerts.push({ id: "permissions", icon: "🔐", title: "Permissions à corriger", detail: `${data.setupAnalysis.totals.permissionIssues} anomalie(s) détectée(s).`, target: "Pilotage", tone: "warning" });
    if (data && data.metrics.securityRules < 4)
        panelAlerts.push({ id: "security", icon: "🛡️", title: "Protection incomplète", detail: `${data.metrics.securityRules}/4 règles de sécurité sont actives.`, target: "Sécurité", tone: "warning" });
    if (data && data.metrics.openTickets > 0)
        panelAlerts.push({ id: "tickets", icon: "🎫", title: "Tickets en attente", detail: `${data.metrics.openTickets} demande(s) restent ouvertes.`, target: "Tickets", tone: "info" });
    const socialErrors = data?.config.social?.sources?.filter(source => source.lastError) || [];
    if (socialErrors.length > 0)
        panelAlerts.push({ id: "social", icon: "📣", title: "Source sociale à vérifier", detail: `${socialErrors.length} source(s) signalent une erreur.`, target: "Social", tone: "warning" });
    if (data && !data.onboarding.complete)
        panelAlerts.push({ id: "onboarding", icon: "🧭", title: "Configuration à terminer", detail: `${data.onboarding.percent}% du parcours est terminé.`, target: "Pilotage", tone: "info" });
    function openPanel(target: string) {
        setActive(target);
        setSearchOpen(false);
        setAlertsOpen(false);
        setMobileNavOpen(false);
    }
    function toggleFavorite(target: string) {
        setFavorites(current => current.includes(target)
            ? current.filter(item => item !== target)
            : [...current, target]);
    }
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
            return <SupportDashboard workspace={supportWorkspace} conversation={supportConversation} composing={supportComposing} form={form} update={update} selectRequest={id => void selectSupportRequest(id)} startRequest={startSupportRequest} createRequest={() => void createSupportTicket()} reply={() => void replyToSupport()} updateRequest={() => void manageSupportRequest()} closeRequest={() => void closeSupportRequest()} reopenRequest={() => void reopenSupportRequest()} deleteRequest={() => void deleteSupportHistory()} closingRequest={closingSupportRequest} reopeningRequest={reopeningSupportRequest} deletingRequest={deletingSupportRequest}/>;
        if (active === "Compte")
            return <section className="account-panel"><div className="account-avatar">{account?.username?.slice(0, 1).toUpperCase() || "?"}</div><div><p className="eyebrow">SESSION DISCORD</p><h2>{account?.username || "Compte connecté"}</h2><p>Tu accèdes uniquement aux serveurs Discord que tu peux administrer. La session expire automatiquement après sept jours.</p></div><button onClick={logout}>Se déconnecter</button></section>;
        if (active === "Modération")
            return <ModerationDashboard data={data} form={form} update={update} moderate={moderate} warnings={memberWarnings} loadWarnings={loadWarnings} setWarnings={setMemberWarnings}/>;
        if (active === "Créateur" && !data.creatorAccess)
            return <section className="creator-workspace"><div className="creator-empty"><p className="eyebrow">ACCÈS RESTREINT</p><h2>Espace privé FyxBot</h2><p>Cette section est réservée au propriétaire de l’application.</p></div></section>;
        if (active === "Créateur" && creatorStats)
            return <CreatorDashboard stats={creatorStats as CreatorStats & UsageStats} supportStaff={supportStaff} form={form} update={update} grantSupportRole={() => void grantSupportRole()} removeSupportRole={userId => void removeSupportRole(userId)} grantPremiumAccess={() => void grantPremiumAccess()} revokePremiumAccess={userId => void revokePremiumAccess(userId)} leaveGuild={(guildId, guildName) => void leaveCreatorGuild(guildId, guildName)}/>;
        if (active === "Créateur")
            return <section className="creator-workspace">{!creatorStats ? <div className="creator-empty"><p className="eyebrow">ESPACE PRIVÉ</p><h2>Observatoire FyxBot</h2><p>Consulte les installations et l’adoption de l’offre Fondateur Premium.</p><button onClick={loadCreatorStats}>Charger les statistiques</button></div> : <><div className="creator-metrics"><article><span>SERVEURS ACTIFS</span><strong>{creatorStats.guildCount}</strong><small>FyxBot installé actuellement</small></article><article><span>MEMBRES COUVERTS</span><strong>{creatorStats.memberCount.toLocaleString("fr-FR")}</strong><small>Total des communautés</small></article><article><span>INSTALLATIONS</span><strong>{creatorStats.allTime}</strong><small>Depuis le début du suivi</small></article><article><span>DÉSINSTALLATIONS</span><strong>{creatorStats.removed}</strong><small>Depuis le début du suivi</small></article></div><div className="creator-grid"><div className="creator-servers"><p className="eyebrow">SERVEURS ACTIFS</p><h2>Utilisation de FyxBot</h2>{creatorStats.installations.map(guild => <article key={guild.guildId}><div><strong>{guild.guildName}</strong><small>Suivi depuis le {new Date(guild.firstSeenAt).toLocaleDateString("fr-FR")}</small></div><b>{guild.memberCount.toLocaleString("fr-FR")} membres</b></article>)}</div><div className="premium-plan"><p className="eyebrow">OFFRE FONDATEUR</p><h2>Free + FyxBot Premium</h2><div><strong>Free</strong><p>Outils essentiels avec un panneau de tickets, un panneau de rôles et une source sociale.</p></div><div className="premium"><strong>Premium utilisateur</strong><p>Capacités renforcées sur tous les serveurs administrés par le bénéficiaire pendant son accès.</p></div><small>30 jours offerts aux 100 premiers utilisateurs · sans carte ni renouvellement automatique.</small></div></div></>}</section>;
        if (isV2 && active === "Vue d’ensemble")
            return <section className="v2-dashboard" aria-label="Centre de pilotage FyxBot V2"><div className="v2-command-bar"><div><p className="eyebrow">PILOTAGE RAPIDE</p><h2>Que voulez-vous faire aujourd’hui ?</h2><p>Les raccourcis ouvrent directement les réglages du serveur sélectionné.</p></div><div><button type="button" onClick={() => setActive("Démarrage")}><span aria-hidden="true">🧭</span>Démarrage</button><button type="button" onClick={() => setActive("Sécurité")}><span aria-hidden="true">🛡️</span>Sécurité</button><button type="button" onClick={() => setActive("Tickets")}><span aria-hidden="true">🎫</span>Tickets</button><button type="button" onClick={() => setActive("Assistance FyxBot")}><span aria-hidden="true">🛟</span>Support</button></div></div><div className="v2-dashboard-grid"><article className="v2-progress-card"><div><p className="eyebrow">MISE EN ROUTE</p><strong>{data.onboarding.percent}%</strong></div><h3>{data.onboarding.complete ? "Configuration terminée" : "Votre serveur prend forme"}</h3><p>{data.onboarding.completedCount}/{data.onboarding.totalCount} étapes terminées sur {data.guild.name}.</p><div className="v2-progress-track" role="progressbar" aria-label="Progression de la configuration" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.onboarding.percent}><i style={{ width: `${data.onboarding.percent}%` }}/></div><button type="button" onClick={() => setActive("Démarrage")}>{data.onboarding.complete ? "Vérifier la configuration" : "Continuer la configuration"} →</button></article><article className="v2-activity-card"><div><p className="eyebrow">ACTIVITÉ RÉCENTE</p><button type="button" onClick={() => setActive("Logs")}>Tout voir</button></div>{data.recentLogs.length === 0 ? <p className="v2-empty-state">Aucune activité récente enregistrée pour ce serveur.</p> : <div className="v2-activity-list">{data.recentLogs.slice(0, 3).map(log => <article key={log.id}><span aria-hidden="true">●</span><div><strong>{log.title}</strong><small>{log.description.replaceAll(/[*<>]/g, "")}</small></div><time>{new Date(log.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</time></article>)}</div>}</article></div><div className="v2-module-heading"><div><p className="eyebrow">OUTILS DU SERVEUR</p><h2>Vos modules FyxBot</h2></div><span>{configuredModules}/8 configurés</span></div><div className="v2-module-board">{visibleModules.map(module => <button type="button" key={module.name} className={module.tone} onClick={() => setActive(module.name)}><span aria-hidden="true">{module.icon}</span><div><strong>{module.name}</strong><small>{module.detail}</small></div><b aria-hidden="true">→</b></button>)}</div></section>;
        if (active === "Vue d’ensemble")
            return <section className="overview-panel" aria-label="État des services FyxBot"><div className="overview-head"><div><p className="eyebrow">CENTRE DE PILOTAGE</p><h2>Votre serveur en un coup d’œil</h2><p>{configuredModules}/8 modules principaux sont configurés sur {data.guild.name}.</p></div><button onClick={() => setActive("Configuration")}>Configurer le serveur</button></div><div className="health-grid"><article><span className="health-icon online">✓</span><div><strong>Bot Discord</strong><small>{data.bot.online ? "Connecté et opérationnel" : "Connexion indisponible"}</small></div></article><article><span className={`health-icon ${data.metrics.securityRules === 4 ? "online" : "warning"}`}>{data.metrics.securityRules === 4 ? "✓" : "!"}</span><div><strong>Protection AutoMod</strong><small>{data.metrics.securityRules}/4 règles actives</small></div></article><article><span className={`health-icon ${data.metrics.openTickets === 0 ? "online" : "warning"}`}>{data.metrics.openTickets}</span><div><strong>Support</strong><small>{data.metrics.openTickets === 0 ? "Aucune demande en attente" : "Ticket(s) à traiter"}</small></div></article></div><div className="quick-actions"><button onClick={() => setActive("Règlement")}><span>📜</span><strong>Publier le règlement</strong><small>Validation des membres</small></button><button onClick={() => setActive("Vocaux")}><span>🔊</span><strong>Gérer les vocaux</strong><small>Salons temporaires</small></button><button onClick={() => setActive("Social")}><span>📣</span><strong>Notifier la communauté</strong><small>Live ou nouvelle vidéo</small></button></div></section>;
        if (active === "Pilotage")
            return <PilotageDashboard data={data} form={form} update={update} runSetup={runSetup} deletePreview={deleteSetupPreview} saveNickname={saveBotNickname} rollback={rollbackChange} navigate={setActive}/>;
        if (active === "FyxFlow")
            return <FyxFlowDashboard apiBaseUrl={API} guildId={selectedGuild} csrfToken={csrfToken} config={data.config.fyxFlow} textChannels={data.options.textChannels} roles={data.options.assignableRoles} onNotice={setNotice} onRefresh={() => refresh(selectedGuild)}/>;
        if (active === "Premium")
            return <PremiumDashboard premium={data.premium} guildName={data.guild.name} assignableRoles={data.options.assignableRoles} form={form} update={update} activate={activateFounderAccess} configureRoles={configurePremiumMemberRoles} disableRoles={disablePremiumMemberRoles} busy={busy}/>;
        if (active === "Communauté")
            return <CommunityDashboard data={data} form={form} update={update} createEvent={createCommunityEvent} createGiveaway={createCommunityGiveaway} navigate={setActive}/>;
        if (active === "Messages")
            return <MessageComposer data={data} form={form} update={update} send={sendCustomMessage} selectPublication={selectPublishedMessage} newPublication={resetMessageComposer} openLibraryItem={openContentLibraryItem} removeLibraryItem={removeContentLibraryItem} restoreLibraryItem={restoreContentLibraryItem}/>;
        if (active === "Règlement")
            return <section className="community-workspace"><div className="settings community-settings"><div><p className="eyebrow">RÈGLEMENT INTERACTIF</p><h2>{data.config.rules ? "Modifier le règlement" : "Publier le règlement"}</h2><p>Publiez les règles du serveur et attribuez facultativement un rôle lorsque les membres les acceptent.</p></div><label>Titre<input value={form.rulesTitle || ""} onChange={e => update("rulesTitle")(e.target.value)} placeholder="Règlement du serveur"/></label><Select label="Salon de publication" value={form.rulesChannelId || ""} options={data.options.textChannels} onChange={update("rulesChannelId")}/><Select label="Rôle après acceptation" value={form.rulesRoleId || ""} options={[{ id: "", name: "Aucun rôle" }, ...data.options.assignableRoles]} onChange={update("rulesRoleId")}/><label className="wide full-row">Articles du règlement<textarea value={form.rulesContent || ""} onChange={e => update("rulesContent")(e.target.value)} maxLength={3900} rows={12} placeholder="1. Respect et bienveillance…"/></label><label>Confirmation<input value={form.rulesConfirmation || ""} onChange={e => update("rulesConfirmation")(e.target.value)} placeholder={data.config.rules ? "MODIFIER" : "PUBLIER"}/></label><button disabled={!form.rulesContent || !form.rulesTitle || (!data.config.rules && !form.rulesChannelId) || form.rulesConfirmation !== (data.config.rules ? "MODIFIER" : "PUBLIER")} onClick={publishRules}>{data.config.rules ? "Mettre à jour" : "Publier le règlement"}</button></div><div className="feature-note"><span>📜</span><div><strong>Commande Discord</strong><p>Les administrateurs disposent aussi de <code>/reglement modele</code>, <code>/reglement publier</code>, <code>/reglement modifier</code> et <code>/reglement statut</code>.</p></div></div></section>;
        if (active === "Anniversaires")
            return <section className="community-workspace"><div className="settings community-settings"><div><p className="eyebrow">ANNIVERSAIRES</p><h2>Annonces automatiques</h2><p>{Object.keys(data.config.birthdays?.birthdays || {}).length} membre(s) ont volontairement enregistré une date. L’année de naissance n’est jamais demandée.</p></div><Select label="Salon des annonces" value={form.birthdayChannelId || ""} options={data.options.textChannels} onChange={update("birthdayChannelId")}/><Select label="Rôle temporaire" value={form.birthdayRoleId || ""} options={[{ id: "", name: "Aucun rôle" }, ...data.options.assignableRoles]} onChange={update("birthdayRoleId")}/><label>Fuseau horaire<select value={form.birthdayTimezone || "Europe/Paris"} onChange={e => update("birthdayTimezone")(e.target.value)}><option>Europe/Paris</option><option>UTC</option><option>America/Montreal</option><option>Indian/Reunion</option></select></label><label className="wide full-row">Message<input value={form.birthdayMessage || ""} onChange={e => update("birthdayMessage")(e.target.value)} placeholder="Joyeux anniversaire {membres}…"/></label><button disabled={!form.birthdayChannelId} onClick={() => save("birthdays", { channelId: form.birthdayChannelId, roleId: form.birthdayRoleId, timezone: form.birthdayTimezone, message: form.birthdayMessage })}>Enregistrer</button></div><div className="feature-note"><span>🎂</span><div><strong>Inscription volontaire</strong><p>Chaque membre utilise <code>/anniversaire definir</code>. Il peut consulter ou supprimer sa date à tout moment.</p></div></div></section>;
        if (active === "Social")
            return <SocialDashboard data={data} form={form} update={update} save={() => void save("social", { channelId: form.socialChannelId, roleId: form.socialRoleId })} publish={sendSocialNotification} manageSource={manageSocialSource} selectSource={selectSocialSource} cancelSource={resetSocialSourceEditor} navigate={setActive}/>;
        if (active === "FyxStream")
            return <StreamingDashboard key={selectedGuild} apiBaseUrl={API} guildId={selectedGuild} csrfToken={csrfToken} navigate={setActive}/>;
        if (active === "Vocaux")
            return <section className="community-workspace"><div className="settings community-settings"><div><p className="eyebrow">SALONS VOCAUX TEMPORAIRES</p><h2>{data.config.temporaryVoice ? "Modifier le générateur" : "Créer le générateur"}</h2><p>Lorsqu’un membre rejoint le générateur, FyxBot crée son salon personnel puis le supprime lorsqu’il est vide.</p></div><Select label="Catégorie" value={form.voiceCategoryId || ""} options={data.options.categories} onChange={update("voiceCategoryId")}/><label>Nom du générateur<input value={form.voiceHubName || ""} onChange={e => update("voiceHubName")(e.target.value)} placeholder="➕ Créer un salon"/></label><label>Limite par défaut<input type="number" min="0" max="99" value={form.voiceDefaultLimit || "0"} onChange={e => update("voiceDefaultLimit")(e.target.value)}/></label><label>Confirmation<input value={form.voiceConfirmation || ""} onChange={e => update("voiceConfirmation")(e.target.value)} placeholder="CONFIGURER"/></label><button disabled={!form.voiceCategoryId || form.voiceConfirmation !== "CONFIGURER"} onClick={setupTemporaryVoice}>Configurer les salons vocaux</button></div><div className="feature-note"><span>🔊</span><div><strong>{Object.keys(data.config.temporaryVoice?.rooms || {}).length} salon(s) actif(s)</strong><p>Les propriétaires peuvent renommer, limiter, verrouiller, autoriser, expulser ou transférer leur salon avec <code>/vocal-temporaire</code>.</p></div></div></section>;
        if (active === "Tickets")
            return <section className="ticket-workspace"><div className="settings ticket-library"><div><p className="eyebrow">MES PANNEAUX</p><h2>Panneaux existants</h2><p>Retrouvez et modifiez les demandes déjà configurées.</p></div><Select label="Panneau à modifier" value={form.ticketPanelId || ""} options={(data.config.tickets?.panels || []).map(panel => ({ id: panel.id, name: panel.title }))} onChange={selectTicketPanel}/><label>Confirmation<input value={form.ticketEditConfirmation || ""} onChange={e => update("ticketEditConfirmation")(e.target.value)} placeholder="MODIFIER"/></label><button disabled={!form.ticketPanelId || form.ticketEditConfirmation !== "MODIFIER"} onClick={updateTicketPanel}>Enregistrer les modifications</button></div><div className="settings ticket-settings"><div><p className="eyebrow">TICKETS MULTI-DEMANDES</p><h2>{form.ticketPanelId ? "Modifier le panneau" : "Nouveau panneau"}</h2><p>Changez les champs après avoir sélectionné un panneau, ou publiez-en un nouveau.</p></div><label>Titre du panneau<input value={form.ticketTitle || ""} onChange={e => update("ticketTitle")(e.target.value)} placeholder="Ex. Recrutement"/></label><label>Type de demande<input value={form.ticketRequestType || ""} onChange={e => update("ticketRequestType")(e.target.value)} placeholder="Ex. candidature"/></label><Select label="Salon du panneau" value={form.ticketPanelChannelId || ""} options={data.options.textChannels} onChange={update("ticketPanelChannelId")}/><Select label="Catégorie des tickets" value={form.categoryId} options={data.options.categories} onChange={update("categoryId")}/><Select label="Rôle responsable" value={form.staffRoleId} options={data.options.roles} onChange={update("staffRoleId")}/><label>Confirmation<input value={form.ticketPublishConfirmation || ""} onChange={e => update("ticketPublishConfirmation")(e.target.value)} placeholder="PUBLIER"/></label><button disabled={form.ticketPublishConfirmation !== "PUBLIER" || !form.ticketPanelChannelId || !form.categoryId || !form.staffRoleId || !form.ticketTitle || !form.ticketRequestType} onClick={publishTicketPanel}>Publier comme nouveau panneau</button></div><div className="feature-note"><span>🔓</span><div><strong>Archives réouvrables</strong><p>À la fermeture, le staff peut conserver le salon comme archive, le réouvrir ou le supprimer. Les nouveaux salons utilisent le format <code>🎫・ticket-nom</code>.</p></div></div></section>;
        if (active === "Accueil")
            return <div className="settings welcome-settings"><div><p className="eyebrow">ACCUEIL</p><h2>Nouveaux membres</h2><p>Salons, messages et rôle automatique.</p></div><Select label="Bienvenue" value={form.welcomeChannelId} options={data.options.textChannels} onChange={update("welcomeChannelId")}/><Select label="Départs" value={form.leaveChannelId} options={data.options.textChannels} onChange={update("leaveChannelId")}/><Select label="Rôle automatique" value={form.autoRoleId} options={data.options.assignableRoles} onChange={update("autoRoleId")}/><label className="wide">Message de bienvenue<input value={form.welcomeMessage} onChange={e => update("welcomeMessage")(e.target.value)} placeholder="Bienvenue {membre}…"/></label><label className="wide">Message de départ<input value={form.leaveMessage} onChange={e => update("leaveMessage")(e.target.value)} placeholder="{membre} a quitté…"/></label><button onClick={() => save("welcome", form)}>Enregistrer</button></div>;
        if (active === "Suggestions")
            return <section className="suggestions-workspace"><div className="settings"><div><p className="eyebrow">SUGGESTIONS</p><h2>Idées de la communauté</h2><p>Choisissez le salon dans lequel les membres voteront.</p></div><Select label="Salon" value={form.suggestionChannelId} options={data.options.textChannels} onChange={update("suggestionChannelId")}/><span /><button onClick={() => save("suggestions", { channelId: form.suggestionChannelId })}>Enregistrer</button></div><div className="suggestions-panel"><div><p className="eyebrow">FILE DE DÉCISION</p><h2>Suggestions récentes</h2><p>Acceptez ou refusez les propositions reçues avec la commande /suggestion. Une décision peut être changée.</p></div><div className="suggestions-list">{data.recentSuggestions.length === 0 ? <p>Aucune nouvelle suggestion enregistrée.</p> : data.recentSuggestions.map(item => <article key={item.id}><div className="suggestion-meta"><span className={`suggestion-status ${item.status}`}>{item.status === "pending" ? "En attente" : item.status === "accepted" ? "Acceptée" : "Refusée"}</span><small>{item.authorName} · {new Date(item.createdAt).toLocaleString("fr-FR")}</small></div><strong>Suggestion {item.id}</strong><p>{item.idea}</p><div className="suggestion-actions"><button disabled={item.status === "accepted"} onClick={() => reviewSuggestion(item.id, "accepted")}>✓ Accepter</button><button disabled={item.status === "rejected"} className="reject" onClick={() => reviewSuggestion(item.id, "rejected")}>× Refuser</button></div></article>)}</div></div></section>;
        if (active === "Sécurité")
            return <div className="settings security-settings"><div><p className="eyebrow">AUTOMOD</p><h2>Protection du serveur</h2><p>{data.metrics.securityRules}/4 règles FyxBot actives : liens, invitations, spam et mentions excessives.</p></div><div className="security-badge">🛡️ AutoMod Discord</div><button onClick={() => toggleSecurity(true)}>Activer les 4 protections</button><button className="security-off" onClick={() => toggleSecurity(false)}>Désactiver</button></div>;
        if (active === "Modération")
            return <section className="management-panel"><div><p className="eyebrow">BOÎTE À OUTILS</p><h2>Modération FyxBot</h2><p>Choisissez un membre et confirmez explicitement chaque sanction.</p></div><div className="command-grid">{[["🔨", "/ban", "Bannir un membre"], ["👢", "/kick", "Expulser un membre"], ["⏱️", "/timeout", "Exclure temporairement"], ["⚠️", "/warn", "Ajouter un avertissement"], ["📋", "/warnings", "Consulter l’historique"], ["🧹", "/clear", "Nettoyer des messages"]].map(([icon, command, label]) => <article key={command}><span>{icon}</span><div><strong>{command}</strong><small>{label}</small></div></article>)}</div><div className="moderation-form"><Select label="Membre" value={form.moderationMemberId || ""} options={data.options.members} onChange={update("moderationMemberId")}/><label>Action<select value={form.moderationAction || "warn"} onChange={e => update("moderationAction")(e.target.value)}><option value="warn">Avertir</option><option value="timeout">Timeout</option><option value="kick">Expulser</option><option value="ban">Bannir</option></select></label><label>Motif<input value={form.moderationReason || ""} onChange={e => update("moderationReason")(e.target.value)} placeholder="Motif obligatoire"/></label><label>Confirmation<input value={form.moderationConfirmation || ""} onChange={e => update("moderationConfirmation")(e.target.value)} placeholder="CONFIRMER"/></label><button disabled={!form.moderationMemberId || !form.moderationReason || form.moderationConfirmation !== "CONFIRMER"} onClick={moderate}>Appliquer la sanction</button></div></section>;
        if (active === "Rôles")
            return <section className="role-workspace"><div className="settings role-library"><div><p className="eyebrow">MES PANNEAUX</p><h2>Panneaux de rôles</h2><p>Retrouvez un panneau publié pour modifier ses boutons.</p></div><Select label="Panneau à modifier" value={form.rolePanelId || ""} options={data.config.rolePanels.map(panel => ({ id: panel.id, name: panel.title }))} onChange={selectRolePanel}/><label>Confirmation<input value={form.rolePanelEditConfirmation || ""} onChange={e => update("rolePanelEditConfirmation")(e.target.value)} placeholder="MODIFIER"/></label><button disabled={!form.rolePanelId || form.rolePanelEditConfirmation !== "MODIFIER" || roleIds().length === 0} onClick={updateRolePanel}>Enregistrer les modifications</button></div><div className="settings role-settings"><div><p className="eyebrow">RÔLES INTERACTIFS</p><h2>{form.rolePanelId ? "Modifier le panneau" : "Nouveau panneau"}</h2><p>Les membres pourront ajouter ou retirer eux-mêmes les rôles choisis.</p></div><label>Titre<input value={form.rolePanelTitle || ""} onChange={e => update("rolePanelTitle")(e.target.value)} placeholder="Choisissez vos rôles"/></label><label className="wide">Description<input value={form.rolePanelDescription || ""} onChange={e => update("rolePanelDescription")(e.target.value)} placeholder="Cliquez sur un bouton…"/></label><Select label="Salon de publication" value={form.rolePanelChannelId || ""} options={data.options.textChannels} onChange={update("rolePanelChannelId")}/>{[1, 2, 3, 4, 5].map(index => <Select key={index} label={`Rôle ${index}${index === 1 ? " (obligatoire)" : ""}`} value={form[`rolePanelRole${index}`] || ""} options={[{ id: "", name: "Aucun" }, ...data.options.assignableRoles]} onChange={update(`rolePanelRole${index}`)}/>)}<label>Confirmation<input value={form.rolePanelPublishConfirmation || ""} onChange={e => update("rolePanelPublishConfirmation")(e.target.value)} placeholder="PUBLIER"/></label><button disabled={form.rolePanelPublishConfirmation !== "PUBLIER" || !form.rolePanelChannelId || !form.rolePanelTitle || roleIds().length === 0} onClick={publishRolePanel}>Publier comme nouveau panneau</button></div></section>;
        return <section className="logs-workspace"><div className="settings"><div><p className="eyebrow">PARAMÈTRES</p><h2>Journal FyxBot</h2><p>Salon central pour les logs et transcripts.</p></div><Select label="Salon des logs" value={form.logChannelId} options={data.options.textChannels} onChange={update("logChannelId")}/><span /><button onClick={() => save("logs", { channelId: form.logChannelId })}>Enregistrer</button></div><div className="logs-panel"><div><p className="eyebrow">HISTORIQUE RÉCENT</p><h2>Activité du serveur</h2></div><div className="logs-list">{data.recentLogs.length === 0 ? <p>Aucune nouvelle activité enregistrée.</p> : data.recentLogs.map(log => <article key={log.id}><span>●</span><div><strong>{log.title}</strong><p>{log.description.replaceAll(/[*<>]/g, "")}</p></div><time>{new Date(log.createdAt).toLocaleString("fr-FR")}</time></article>)}</div></div></section>;
    }
    if (authenticated !== true)
        return <main className="login-screen"><section className="login-card"><div className="brand login-brand"><Image className="brand-logo" src="/brand/fyxbot-logo-symbol.svg" alt="" width={40} height={40}/><div><strong>FYXBOT</strong><small>CONTROL CENTER · v{CURRENT_RELEASE.version}</small></div></div><div className="login-mascot-stage"><Image className="login-mascot" src="/mascotte-fyxbot-640.webp" alt="Mascotte robot FyxBot" width={640} height={640} priority/><span className="login-mascot-shadow" aria-hidden="true"/></div><p className="eyebrow">BOT DISCORD PUBLIC</p><h1>Ajoutez FyxBot à votre serveur Discord</h1><p>Modérez votre communauté, gérez les tickets, renforcez la sécurité et automatisez l’accueil et les rôles avec FyxBot.</p><div className="login-actions"><a className="invite-public" href={INVITE_URL} target="_blank" rel="noreferrer">Inviter FyxBot</a><a className="login-discord" href={`${API}/auth/login`}>Se connecter au panel</a></div></section></main>;
    return (
        <main className="shell">
            <aside className="sidebar">
                <div className="brand">
                    <Image className="brand-logo" src="/brand/fyxbot-logo-symbol.svg" alt="" width={40} height={40}/>
                    <div><strong>FYXBOT</strong><small>CONTROL CENTER · v{CURRENT_RELEASE.version}</small></div>
                </div>
                <nav className="desktop-navigation" aria-label="Navigation principale">
                    {visibleNavigationGroups.map(group => <div className="nav-group" key={group.label}>
                        <p className="nav-group-label">{group.label}</p>
                        {group.items.map(item => <button type="button" title={item} className={active === item ? "active" : ""} key={item} onClick={() => openPanel(item)} aria-current={active === item ? "page" : undefined}>
                            <span className="nav-icon" aria-hidden="true">{icons[item]}</span><span className="nav-label">{item}</span>{item === "Assistance FyxBot" && (supportWorkspace?.counts.actionRequired || 0) > 0 && <b className="support-nav-count" aria-label={`${supportWorkspace?.counts.actionRequired} demande(s) support à consulter`}>{supportWorkspace?.counts.actionRequired}</b>}
                        </button>)}
                    </div>)}
                </nav>
                <div className="fyxstream-entry">
                    <p>ESPACE STREAMING</p>
                    <button type="button" className={active === "FyxStream" ? "active" : ""} onClick={() => openPanel("FyxStream")}>
                        <span aria-hidden="true">🟣</span><div><strong>FyxStream</strong><small>Twitch et chat en direct</small></div><b aria-hidden="true">→</b>
                    </button>
                </div>
                <nav className="mobile-navigation" aria-label="Navigation mobile">
                    {mobilePrimaryNavigation.map(item => <button type="button" title={item} className={active === item ? "active" : ""} key={item} onClick={() => openPanel(item)} aria-current={active === item ? "page" : undefined}>
                        <span className="nav-icon" aria-hidden="true">{icons[item]}</span><span className="nav-label">{item === "Vue d’ensemble" ? "Accueil" : item}</span>
                    </button>)}
                    <button type="button" title="Plus de modules" className={!mobilePrimarySet.has(active) || mobileNavOpen ? "active" : ""} onClick={() => setMobileNavOpen(open => !open)} aria-expanded={mobileNavOpen} aria-controls="mobile-navigation-sheet">
                        <span className="nav-icon" aria-hidden="true">☰</span><span className="nav-label">Plus</span>
                    </button>
                </nav>
                <div className={`sidebar-foot ${accountMenuOpen ? "open" : ""}`}>
                    {accountMenuOpen && <div className="account-popover" role="dialog" aria-label="Compte Discord"><p>Compte connecté</p><strong>{account?.username || "Compte Discord"}</strong><button type="button" onClick={() => { setAccountMenuOpen(false); void logout(); }}>Se déconnecter</button></div>}
                    <button type="button" className="account-summary" onClick={() => setAccountMenuOpen(open => !open)} aria-expanded={accountMenuOpen}><span className="account-mini-avatar">{account?.username?.slice(0, 1).toUpperCase() || "?"}</span><span className="account-mini"><strong>{account?.username || "Compte Discord"}</strong><small><i/> Connecté</small></span><b>⌃</b></button>
                </div>
            </aside>

            {mobileNavOpen && <div className="mobile-nav-backdrop">
                <section id="mobile-navigation-sheet" className="mobile-nav-sheet" role="dialog" aria-modal="true" aria-label="Tous les modules FyxBot">
                    <header><div><p className="eyebrow">NAVIGATION</p><h2>Tous les modules</h2></div><button type="button" className="mobile-nav-close" onClick={() => setMobileNavOpen(false)} aria-label="Fermer le menu">×</button></header>
                    {visibleNavigationGroups.map(group => {
                        const items = group.items.filter(item => !mobilePrimarySet.has(item));
                        return items.length > 0 && <div className="mobile-nav-group" key={group.label}><p>{group.label}</p><div>{items.map(item => <button type="button" key={item} className={active === item ? "active" : ""} onClick={() => openPanel(item)}><span aria-hidden="true">{icons[item]}</span><strong>{item}</strong>{item === "Assistance FyxBot" && (supportWorkspace?.counts.actionRequired || 0) > 0 && <b className="support-nav-count" aria-label={`${supportWorkspace?.counts.actionRequired} demande(s) support à consulter`}>{supportWorkspace?.counts.actionRequired}</b>}</button>)}</div></div>;
                    })}
                    <button type="button" className={`mobile-fyxstream-card ${active === "FyxStream" ? "active" : ""}`} onClick={() => openPanel("FyxStream")}><span aria-hidden="true">🟣</span><div><strong>FyxStream</strong><small>Votre espace Twitch séparé</small></div><b aria-hidden="true">→</b></button>
                    <div className="mobile-account-card"><span className="account-mini-avatar">{account?.username?.slice(0, 1).toUpperCase() || "?"}</span><div><strong>{account?.username || "Compte Discord"}</strong><small>Compte connecté</small></div><button type="button" onClick={() => { setMobileNavOpen(false); void logout(); }}>Se déconnecter</button></div>
                </section>
            </div>}

            {searchOpen && <div className="panel-search-backdrop">
                <section className="panel-search-dialog" role="dialog" aria-modal="true" aria-labelledby="panel-search-title">
                    <header><div><p className="eyebrow">NAVIGATION RAPIDE</p><h2 id="panel-search-title">Rechercher dans FyxBot</h2></div><button type="button" onClick={() => setSearchOpen(false)} aria-label="Fermer la recherche">×</button></header>
                    <label className="panel-search-field"><span aria-hidden="true">⌕</span><input ref={searchInputRef} value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Ex. tickets, sécurité, Twitch…" aria-label="Rechercher un module"/><kbd>Échap</kbd></label>
                    <div className="panel-search-results">
                        {searchResults.length === 0 ? <p className="panel-search-empty">Aucun module ne correspond à votre recherche.</p> : searchResults.map(item => <article key={item.name}>
                            <button type="button" className="panel-search-target" onClick={() => openPanel(item.name)}><span aria-hidden="true">{icons[item.name]}</span><div><strong>{item.name}</strong><small>{item.group}{!SIMPLE_NAVIGATION_ITEMS.has(item.name) && item.name !== "FyxStream" ? " · mode avancé" : ""}</small></div><b aria-hidden="true">→</b></button>
                            <button type="button" className={favorites.includes(item.name) ? "panel-favorite-toggle active" : "panel-favorite-toggle"} onClick={() => toggleFavorite(item.name)} aria-pressed={favorites.includes(item.name)} aria-label={favorites.includes(item.name) ? `Retirer ${item.name} des favoris` : `Ajouter ${item.name} aux favoris`}>★</button>
                        </article>)}
                    </div>
                    <footer><span><kbd>Ctrl</kbd> + <kbd>K</kbd> pour ouvrir</span><small>{searchablePanelItems.length} espaces disponibles</small></footer>
                </section>
            </div>}

            <section className="content">
                <header>
                    <div><p className="eyebrow">SERVEUR DISCORD</p><h1>{active}</h1><p>Pilotez votre communauté simplement avec FyxBot.</p></div>
                    <div className="header-actions">
                        <div className="panel-utility-row">
                            <div className="interface-mode" role="group" aria-label="Niveau d’interface">
                                <button type="button" className={interfaceMode === "simple" ? "active" : ""} aria-pressed={interfaceMode === "simple"} onClick={() => setInterfaceMode("simple")}>Simple</button>
                                <button type="button" className={interfaceMode === "advanced" ? "active" : ""} aria-pressed={interfaceMode === "advanced"} onClick={() => setInterfaceMode("advanced")}>Avancé</button>
                            </div>
                            <button type="button" className="panel-search-trigger" onClick={() => { setAlertsOpen(false); setSearchOpen(true); }} aria-label="Rechercher dans le panel"><span aria-hidden="true">⌕</span><span>Rechercher</span><kbd>Ctrl K</kbd></button>
                            <div className="panel-alert-control">
                                <button type="button" className={panelAlerts.length > 0 ? "panel-alert-trigger has-alerts" : "panel-alert-trigger"} onClick={() => { setSearchOpen(false); setAlertsOpen(open => !open); }} aria-expanded={alertsOpen} aria-label={`Ouvrir le centre d’alertes, ${panelAlerts.length} alerte(s)`}><span aria-hidden="true">🔔</span>{panelAlerts.length > 0 && <b>{panelAlerts.length}</b>}</button>
                                {alertsOpen && <section className="panel-alert-popover" role="dialog" aria-label="Centre d’alertes FyxBot"><header><div><p className="eyebrow">À SURVEILLER</p><h2>Centre d’alertes</h2></div><span>{panelAlerts.length}</span></header>{panelAlerts.length === 0 ? <div className="panel-alert-empty"><span aria-hidden="true">✓</span><strong>Tout est en ordre</strong><p>Aucune action importante n’est requise.</p></div> : <div className="panel-alert-list">{panelAlerts.map(alert => <button type="button" className={alert.tone} key={alert.id} onClick={() => openPanel(alert.target)}><span aria-hidden="true">{alert.icon}</span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div><b aria-hidden="true">→</b></button>)}</div>}</section>}
                            </div>
                        </div>
                        <div className="panel-server-row"><a className="invite-server" href={INVITE_URL} target="_blank" rel="noreferrer">+ Inviter FyxBot</a><select aria-label="Serveur Discord" className="server" value={selectedGuild} onChange={event => refresh(event.target.value)}>{data?.guilds.map(guild => <option key={guild.id} value={guild.id}>{guild.name}</option>)}</select></div>
                    </div>
                </header>

                {visibleFavorites.length > 0 && <div className="panel-favorites" aria-label="Modules favoris"><span>★ FAVORIS</span>{visibleFavorites.map(item => <article key={item}><button type="button" onClick={() => openPanel(item)}><i aria-hidden="true">{icons[item]}</i>{item}</button><button type="button" onClick={() => toggleFavorite(item)} aria-label={`Retirer ${item} des favoris`}>×</button></article>)}</div>}

                <div className="hero">
                    <Image className="fyxbot-overview-banner" src="/brand/fyxbot-banner-discord.webp" alt="" fill sizes="(max-width: 650px) 100vw, (max-width: 1000px) calc(100vw - 78px), calc(100vw - 250px)" priority/>
                    <div><span className="live"><i/> {data?.bot.online ? "BOT OPÉRATIONNEL" : "CONNEXION EN COURS"}</span><h2>{data ? `${data.guild.name} est entre de bonnes mains.` : "Connexion à votre serveur…"}</h2><p>{notice || (data?.metrics.securityRules === 4 ? "Toutes les protections FyxBot sont actives." : "Quelques réglages peuvent encore renforcer votre serveur.")}</p><div className="hero-actions"><button onClick={() => openPanel("Sécurité")}>Voir la sécurité</button><button className="secondary" onClick={() => openPanel("Assistance FyxBot")}>Contacter FyxBot</button></div></div>
                    <div className="score"><strong>{securityScore ?? "--"}</strong><span>/100</span><small>SCORE DE SÉCURITÉ</small></div>
                </div>
                <div className="stats"><article><span>MEMBRES</span><strong>{data?.guild.members ?? "—"}</strong><small>Serveur actuel</small></article><article><span>COMMANDES</span><strong>{data?.metrics.commands ?? "—"}</strong><small>Disponibles</small></article><article><span>TICKETS OUVERTS</span><strong>{data?.metrics.openTickets ?? "—"}</strong><small>Tickets Discord actifs</small></article><article><span>LATENCE</span><strong>{data ? `${data.bot.ping} ms` : "—"}</strong><small>Discord Gateway</small></article></div>
                <div className="section-title"><div><p className="eyebrow">CONFIGURATION RAPIDE</p><h2>Modules FyxBot</h2></div><span>{configuredModules}/8 configurés</span></div>
                <div className="module-grid">{visibleModules.map(module => <article key={module.name} className={`module ${module.tone}`}><div className="module-icon">{module.icon}</div><div><h3>{module.name}</h3><p>{module.detail}</p></div><button onClick={() => openPanel(module.name)} aria-label={`Configurer ${module.name}`}>Configurer →</button></article>)}</div>
                {config()}
            </section>
        </main>
    );
}
