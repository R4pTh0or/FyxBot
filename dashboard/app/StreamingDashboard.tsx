"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type TwitchCommand = {
    name: string;
    response: string;
    enabled: boolean;
    cooldownSeconds: number;
    accessLevel: "everyone" | "subscriber" | "moderator" | "broadcaster";
    usageCount: number;
};

type TwitchState = {
    connected: boolean;
    broadcasterLogin: string;
    broadcasterDisplayName: string;
    chatEnabled: boolean;
    prefix: string;
    protections: {
        links: boolean;
        caps: boolean;
        repetition: boolean;
    };
    runtimeStatus: string;
    runtimeDetail: string;
    updatedAt: string;
    scopes: string[];
    commands: TwitchCommand[];
};

type LoadState = "loading" | "ready" | "error";

type StreamingDashboardProps = {
    apiBaseUrl: string;
    guildId: string;
    csrfToken: string;
    navigate: (target: string) => void;
};

const EMPTY_STATE: TwitchState = {
    connected: false,
    broadcasterLogin: "",
    broadcasterDisplayName: "",
    chatEnabled: false,
    prefix: "!",
    protections: { links: false, caps: false, repetition: false },
    runtimeStatus: "disconnected",
    runtimeDetail: "",
    updatedAt: "",
    scopes: [],
    commands: [],
};

const TWITCH_MODERATION_COMMANDS = [
    ["🛡️", "!mod", "Afficher l’aide de modération"],
    ["🔨", "!ban @pseudo [raison]", "Bannir un utilisateur"],
    ["✅", "!unban @pseudo", "Retirer un bannissement ou timeout"],
    ["⏳", "!timeout @pseudo [secondes] [raison]", "Timeout de 10 minutes par défaut"],
    ["🧹", "!clear", "Effacer le chat visible"],
    ["🐢", "!slow 0|3-120", "Régler ou désactiver le mode lent"],
] as const;

const TWITCH_MODERATION_SCOPES = [
    "moderator:manage:banned_users",
    "moderator:manage:chat_messages",
    "moderator:manage:chat_settings",
] as const;

const ACCESS_LABELS: Record<TwitchCommand["accessLevel"], string> = {
    everyone: "Tout le monde",
    subscriber: "Abonnés",
    moderator: "Modérateurs",
    broadcaster: "Diffuseur",
};

function asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function asString(value: unknown, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
    return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseCommand(value: unknown): TwitchCommand | null {
    const command = asRecord(value);
    const name = asString(command.name).trim().replace(/^!+/, "");
    const response = asString(command.response);
    if (!name || !response)
        return null;
    const access = asString(command.accessLevel || command.access_level, "everyone");
    const accessLevel = Object.hasOwn(ACCESS_LABELS, access)
        ? access as TwitchCommand["accessLevel"]
        : "everyone";
    return {
        name,
        response,
        enabled: asBoolean(command.enabled, true),
        cooldownSeconds: asNumber(command.cooldownSeconds ?? command.cooldown_seconds, 5),
        accessLevel,
        usageCount: asNumber(command.usageCount ?? command.usage_count),
    };
}

function parseTwitchState(payloadValue: unknown): TwitchState {
    const payload = asRecord(payloadValue);
    const statusObject = asRecord(payload.status);
    const connection = asRecord(payload.connection ?? payload.broadcaster ?? statusObject.connection ?? statusObject.broadcaster);
    const chat = asRecord(payload.chat ?? statusObject.chat);
    const runtime = asRecord(payload.runtime ?? payload.runtimeStatus ?? statusObject.runtime);
    const rawCommands = payload.commands ?? statusObject.commands;
    const commands = Array.isArray(rawCommands)
        ? rawCommands.map(parseCommand).filter((command): command is TwitchCommand => command !== null)
        : [];
    const protections = asRecord(chat.protections);
    const broadcasterLogin = asString(connection.broadcasterLogin ?? connection.broadcaster_login ?? connection.login ?? payload.broadcasterLogin);
    const broadcasterDisplayName = asString(connection.broadcasterDisplayName ?? connection.broadcaster_display_name ?? connection.displayName ?? payload.broadcasterDisplayName, broadcasterLogin);
    const runtimeStatus = asString(runtime.status ?? statusObject.runtimeStatus ?? payload.runtimeStatus, "disconnected");
    const connected = asBoolean(payload.connected ?? statusObject.connected, Boolean(broadcasterLogin || connection.broadcasterUserId || connection.broadcaster_user_id));
    return {
        connected,
        broadcasterLogin,
        broadcasterDisplayName,
        chatEnabled: asBoolean(payload.chatEnabled ?? chat.enabled ?? payload.enabled ?? connection.enabled),
        prefix: asString(chat.prefix ?? payload.prefix, "!") || "!",
        protections: {
            links: asBoolean(protections.links),
            caps: asBoolean(protections.caps),
            repetition: asBoolean(protections.repetition),
        },
        runtimeStatus,
        runtimeDetail: asString(runtime.detail ?? statusObject.runtimeDetail ?? payload.runtimeDetail),
        updatedAt: asString(payload.lastSignalAt ?? runtime.updatedAt ?? runtime.updated_at ?? connection.updatedAt ?? connection.updated_at ?? payload.updatedAt),
        scopes: asStringArray(payload.scopes ?? statusObject.scopes ?? connection.scopes),
        commands,
    };
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
    try {
        return asRecord(await response.json());
    }
    catch {
        return {};
    }
}

function requestError(payload: Record<string, unknown>, fallback: string) {
    return asString(payload.error || payload.message, fallback);
}

function formatDate(value: string) {
    if (!value)
        return "Aucun signal reçu";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date indisponible" : date.toLocaleString("fr-FR");
}

export default function StreamingDashboard({ apiBaseUrl, guildId, csrfToken, navigate }: StreamingDashboardProps) {
    const commandTitleId = useId();
    const deleteTitleId = useId();
    const cancelDeleteButton = useRef<HTMLButtonElement | null>(null);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [twitch, setTwitch] = useState<TwitchState>(EMPTY_STATE);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busyAction, setBusyAction] = useState("");
    const [editingName, setEditingName] = useState("");
    const [name, setName] = useState("");
    const [responseText, setResponseText] = useState("");
    const [cooldownSeconds, setCooldownSeconds] = useState("5");
    const [accessLevel, setAccessLevel] = useState<TwitchCommand["accessLevel"]>("everyone");
    const [pendingDelete, setPendingDelete] = useState<TwitchCommand | null>(null);

    const loadStatus = useCallback(async (signal?: AbortSignal) => {
        if (!guildId) {
            setTwitch(EMPTY_STATE);
            setLoadState("ready");
            return;
        }
        setLoadState("loading");
        setError("");
        try {
            const query = new URLSearchParams({ guildId });
            const result = await fetch(`${apiBaseUrl}/twitch/status?${query}`, {
                credentials: "include",
                signal,
            });
            const payload = await readPayload(result);
            if (!result.ok)
                throw Error(requestError(payload, "Le module Twitch est momentanément indisponible."));
            setTwitch(parseTwitchState(payload));
            setLoadState("ready");
        }
        catch (caught) {
            if (caught instanceof DOMException && caught.name === "AbortError")
                return;
            setError(caught instanceof Error ? caught.message : "Impossible de charger le module Twitch.");
            setLoadState("error");
        }
    }, [apiBaseUrl, guildId]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => void loadStatus(controller.signal), 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadStatus]);

    useEffect(() => {
        if (!pendingDelete)
            return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape")
                setPendingDelete(null);
        };
        cancelDeleteButton.current?.focus();
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [pendingDelete]);

    function resetEditor() {
        setEditingName("");
        setName("");
        setResponseText("");
        setCooldownSeconds("5");
        setAccessLevel("everyone");
    }

    function editCommand(command: TwitchCommand) {
        setEditingName(command.name);
        setName(command.name);
        setResponseText(command.response);
        setCooldownSeconds(String(command.cooldownSeconds));
        setAccessLevel(command.accessLevel);
        setNotice("");
        window.requestAnimationFrame(() => document.getElementById(commandTitleId)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }

    async function mutate(path: string, body: Record<string, unknown>, actionLabel: string) {
        setBusyAction(actionLabel);
        setError("");
        setNotice("");
        try {
            const result = await fetch(`${apiBaseUrl}${path}`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-FyxBot-CSRF": csrfToken,
                },
                body: JSON.stringify({ guildId, ...body }),
            });
            const payload = await readPayload(result);
            if (!result.ok)
                throw Error(requestError(payload, "La modification Twitch a échoué."));
            await loadStatus();
            setNotice(requestError(payload, "Modification enregistrée."));
            return true;
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : "La modification Twitch a échoué.");
            return false;
        }
        finally {
            setBusyAction("");
        }
    }

    async function saveCommand() {
        const normalizedName = name.trim().replace(/^!+/, "");
        const normalizedResponse = responseText.trim();
        const cooldown = Number(cooldownSeconds);
        if (!normalizedName || !normalizedResponse || !Number.isInteger(cooldown) || cooldown < 0 || cooldown > 3600)
            return;
        const saved = await mutate("/twitch/commands", {
            action: editingName ? "update" : "add",
            name: editingName || normalizedName,
            response: normalizedResponse,
            cooldownSeconds: cooldown,
            accessLevel,
        }, "save-command");
        if (saved)
            resetEditor();
    }

    async function toggleCommand(command: TwitchCommand) {
        await mutate("/twitch/commands", {
            action: "toggle",
            name: command.name,
            enabled: !command.enabled,
        }, `toggle-${command.name}`);
    }

    async function removeCommand(command: TwitchCommand) {
        const removed = await mutate("/twitch/commands", {
            action: "remove",
            name: command.name,
            confirmation: "SUPPRIMER",
        }, `remove-${command.name}`);
        if (removed) {
            if (editingName === command.name)
                resetEditor();
            setPendingDelete(null);
        }
    }

    async function toggleChat() {
        await mutate("/twitch/chat/config", {
            enabled: !twitch.chatEnabled,
            prefix: twitch.prefix,
            protections: twitch.protections,
        }, "chat");
    }

    async function disconnect() {
        if (!window.confirm("Déconnecter Twitch de ce serveur ? Les jetons associés seront supprimés."))
            return;
        const disconnected = await mutate("/twitch/disconnect", { confirmation: "DECONNECTER" }, "disconnect");
        if (disconnected)
            resetEditor();
    }

    const connectUrl = `${apiBaseUrl}/twitch/auth/start?${new URLSearchParams({ guildId })}`;
    const commandValid = name.trim().length > 0
        && name.trim().replace(/^!+/, "").length >= 2
        && name.trim().replace(/^!+/, "").length <= 24
        && responseText.trim().length > 0
        && Number.isInteger(Number(cooldownSeconds))
        && Number(cooldownSeconds) >= 0
        && Number(cooldownSeconds) <= 3600;
    const runtimeOnline = ["connected", "online", "ready"].includes(twitch.runtimeStatus.toLowerCase());
    const enabledCommandCount = twitch.commands.filter(command => command.enabled).length;
    const totalCommandUses = twitch.commands.reduce((total, command) => total + command.usageCount, 0);
    const activeProtectionCount = Object.values(twitch.protections).filter(Boolean).length;
    const moderationReady = TWITCH_MODERATION_SCOPES.every(scope => twitch.scopes.includes(scope));

    return <section className="streaming-workspace" aria-labelledby="streaming-title">
        <div className="social-tabs" role="tablist" aria-label="Réseaux et streaming">
            <button type="button" role="tab" aria-selected="false" onClick={() => navigate("Social")}>Notifications</button>
            <button type="button" role="tab" aria-selected="true">Chat Twitch</button>
        </div>
        <div className="streaming-hero">
            <div><p className="eyebrow">STREAMING FYXBOT</p><h2 id="streaming-title">Animez votre chat. Gardez le contrôle.</h2><p>Reliez une chaîne Twitch à ce serveur Discord, activez le chat FyxBot et gérez vos commandes sans utiliser un second bot.</p></div>
            <span className="streaming-mark" aria-hidden="true">◉</span>
        </div>

        {loadState === "loading" && <div className="streaming-state loading" role="status" aria-live="polite"><span aria-hidden="true"/><div><strong>Chargement de Twitch…</strong><p>FyxBot vérifie la connexion de ce serveur.</p></div></div>}
        {loadState === "error" && <div className="streaming-state error" role="alert"><span aria-hidden="true">!</span><div><strong>Impossible de charger Twitch</strong><p>{error}</p><button type="button" onClick={() => void loadStatus()}>Réessayer</button></div></div>}
        {loadState === "ready" && (error || notice) && <div className={`streaming-feedback ${error ? "error" : "success"}`} role={error ? "alert" : "status"} aria-live="polite">{error || notice}</div>}

        {loadState === "ready" && !twitch.connected && <div className="streaming-empty">
            <span aria-hidden="true">🟣</span><div><p className="eyebrow">AUCUNE CHAÎNE RELIÉE</p><h2>Connectez votre chaîne Twitch</h2><p>Vous serez redirigé vers Twitch pour autoriser uniquement les accès nécessaires. Aucun jeton n’est envoyé au navigateur.</p></div><a className="streaming-connect" href={connectUrl}>Connecter Twitch</a>
        </div>}

        {loadState === "ready" && twitch.connected && <>
            <div className="streaming-status-grid">
                <article className="streaming-identity"><div className="streaming-avatar" aria-hidden="true">{(twitch.broadcasterDisplayName || twitch.broadcasterLogin || "T").slice(0, 1).toUpperCase()}</div><div><span>CHAÎNE CONNECTÉE</span><strong>{twitch.broadcasterDisplayName || twitch.broadcasterLogin || "Chaîne Twitch"}</strong><small>{twitch.broadcasterLogin ? `twitch.tv/${twitch.broadcasterLogin}` : "Identité publique indisponible"}</small></div></article>
                <article className="streaming-runtime"><span className={runtimeOnline ? "online" : "warning"} aria-hidden="true"/><div><strong>{runtimeOnline ? "Chat opérationnel" : "Chat en attente"}</strong><small>{twitch.runtimeDetail || `Dernier signal : ${formatDate(twitch.updatedAt)}`}</small></div></article>
                <button type="button" className="streaming-disconnect" disabled={Boolean(busyAction)} onClick={() => void disconnect()}>Déconnecter</button>
            </div>

            <section className="streaming-insights" aria-label="Indicateurs FyxStream">
                <article><span aria-hidden="true">💬</span><div><small>CHAT FYXBOT</small><strong>{twitch.chatEnabled ? "Actif" : "Inactif"}</strong><p>{runtimeOnline ? "Connexion opérationnelle" : "Runtime en attente"}</p></div></article>
                <article><span aria-hidden="true">⚡</span><div><small>COMMANDES ACTIVES</small><strong>{enabledCommandCount}/{twitch.commands.length}</strong><p>{totalCommandUses.toLocaleString("fr-FR")} utilisation(s)</p></div></article>
                <article><span aria-hidden="true">🛡️</span><div><small>PROTECTIONS CHAT</small><strong>{activeProtectionCount}/3</strong><p>Liens, majuscules, répétitions</p></div></article>
                <article><span aria-hidden="true">🕒</span><div><small>DERNIÈRE SYNCHRONISATION</small><strong>{twitch.updatedAt ? new Date(twitch.updatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—"}</strong><p>{formatDate(twitch.updatedAt)}</p></div></article>
            </section>

            <div className="streaming-chat-card">
                <div><p className="eyebrow">BOT DE CHAT</p><h2>Réponses automatiques dans le live</h2><p>Activez le compte officiel FyxBot dans le chat de la chaîne connectée.</p></div>
                <div className="streaming-chat-control"><span><strong>{twitch.chatEnabled ? "Chat activé" : "Chat désactivé"}</strong><small>Préfixe des commandes : {twitch.prefix}</small></span><button type="button" role="switch" aria-checked={twitch.chatEnabled} aria-label="Activer le chat Twitch FyxBot" className={twitch.chatEnabled ? "enabled" : ""} disabled={Boolean(busyAction)} onClick={() => void toggleChat()}><i/></button></div>
            </div>

            <section className="streaming-builtins" aria-labelledby="streaming-builtins-title">
                <header><div><p className="eyebrow">MODÉRATION PRÉDÉFINIE</p><h2 id="streaming-builtins-title">Commandes Twitch prêtes à l’emploi</h2><p>Réservées aux modérateurs et au diffuseur dans le chat.</p></div>{!moderationReady && <a className="streaming-connect" href={connectUrl}>Autoriser la modération</a>}</header>
                {!moderationReady && <div className="streaming-scope-warning" role="status">Reconnectez une fois Twitch pour accorder les permissions nécessaires. Les commandes personnalisées restent inchangées.</div>}
                <div className="streaming-builtins-grid">{TWITCH_MODERATION_COMMANDS.map(([icon, command, description]) => <article key={command}><span aria-hidden="true">{icon}</span><div><strong>{command}</strong><small>{description}</small></div></article>)}</div>
            </section>

            <div className="streaming-command-layout">
                <form className="streaming-command-editor" onSubmit={event => { event.preventDefault(); void saveCommand(); }}>
                    <div><p className="eyebrow">COMMANDE PERSONNALISÉE</p><h2 id={commandTitleId}>{editingName ? `Modifier !${editingName}` : "Créer une commande"}</h2><p>Le nom est enregistré sans le point d’exclamation.</p></div>
                    <label>Commande<div className="streaming-command-name"><span aria-hidden="true">!</span><input minLength={2} maxLength={24} pattern="[A-Za-z0-9_]+" required disabled={Boolean(editingName)} value={name} onChange={event => setName(event.target.value)} placeholder="discord"/></div></label>
                    <label className="wide">Réponse<textarea rows={4} maxLength={400} required value={responseText} onChange={event => setResponseText(event.target.value)} placeholder="Rejoignez notre Discord : https://…"/></label>
                    <label>Cooldown en secondes<input type="number" min="0" max="3600" step="1" required value={cooldownSeconds} onChange={event => setCooldownSeconds(event.target.value)}/></label>
                    <label>Niveau d’accès<select value={accessLevel} onChange={event => setAccessLevel(event.target.value as TwitchCommand["accessLevel"])}>{Object.entries(ACCESS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                    <div className="streaming-editor-actions"><button type="submit" disabled={!commandValid || Boolean(busyAction)}>{editingName ? "Enregistrer" : "Créer la commande"}</button>{editingName && <button type="button" className="secondary" onClick={resetEditor}>Annuler</button>}</div>
                </form>

                <section className="streaming-command-library" aria-labelledby="streaming-command-list-title">
                    <header><div><p className="eyebrow">COMMANDES DU SERVEUR</p><h2 id="streaming-command-list-title">{twitch.commands.length} commande(s)</h2></div><button type="button" className="streaming-refresh" disabled={Boolean(busyAction)} onClick={() => void loadStatus()} aria-label="Actualiser les commandes Twitch">↻</button></header>
                    {twitch.commands.length === 0 ? <div className="streaming-command-empty"><span aria-hidden="true">!</span><strong>Aucune commande personnalisée</strong><p>Créez votre première réponse automatique avec le formulaire.</p></div> : <div className="streaming-command-list">{twitch.commands.map(command => <article className={command.enabled ? "" : "disabled"} key={command.name}><div className="streaming-command-copy"><span className="streaming-command-badge">!{command.name}</span><p>{command.response}</p><small>{ACCESS_LABELS[command.accessLevel]} · {command.cooldownSeconds}s · {command.usageCount} utilisation(s)</small></div><div className="streaming-command-actions"><button type="button" disabled={Boolean(busyAction)} onClick={() => void toggleCommand(command)}>{command.enabled ? "Désactiver" : "Activer"}</button><button type="button" className="edit" onClick={() => editCommand(command)}>Modifier</button><button type="button" className="danger" onClick={() => setPendingDelete(command)}>Supprimer</button></div></article>)}</div>}
                </section>
            </div>

            <div className="streaming-collision-note"><span aria-hidden="true">⚠️</span><div><strong>Une commande répond deux fois ?</strong><p>Une commande StreamElements portant le même nom peut produire une seconde réponse externe. Désactivez-la dans StreamElements ou choisissez un autre nom dans FyxBot.</p></div></div>
        </>}

        {pendingDelete && <div className="streaming-delete-backdrop"><section className="streaming-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby={deleteTitleId}><span aria-hidden="true">🗑️</span><p className="eyebrow">SUPPRESSION</p><h2 id={deleteTitleId}>Supprimer !{pendingDelete.name} ?</h2><p>Cette commande ne répondra plus dans le chat Twitch. Cette action ne touche pas aux commandes Discord.</p><div><button ref={cancelDeleteButton} type="button" className="secondary" onClick={() => setPendingDelete(null)}>Annuler</button><button type="button" className="danger" disabled={Boolean(busyAction)} onClick={() => void removeCommand(pendingDelete)}>Confirmer la suppression</button></div></section></div>}
    </section>;
}
