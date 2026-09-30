"use client";

import { useMemo, useState } from "react";

type Option = { id: string; name: string };
type Trigger = "member_join" | "member_leave" | "rules_accepted" | "ticket_created";
type FyxFlowAction =
    | { type: "send_message"; channelId: string; message: string }
    | { type: "assign_role"; roleId: string };
type FyxFlowItem = {
    id: string;
    name: string;
    trigger: Trigger;
    action: FyxFlowAction;
    actions?: FyxFlowAction[];
    active: boolean;
    createdAt: string;
    updatedAt: string;
};
type FyxFlowHistory = {
    id: string;
    flowId: string;
    flowName: string;
    trigger: string;
    status: "success" | "failed";
    detail: string;
    executedAt: string;
};
type FyxFlowConfig = { flows: FyxFlowItem[]; history: FyxFlowHistory[] };
type DraftAction = { type: "send_message" | "assign_role"; channelId: string; roleId: string; message: string };
type Draft = { id?: string; name: string; trigger: Trigger; actions: DraftAction[] };
type Simulation = { steps: string[]; warning: string };
type FlowTemplate = { id: string; icon: string; title: string; detail: string; draft: () => Draft };

const defaultMessage = "Bienvenue {membre} sur **{serveur}** ! Nous sommes maintenant {nombre} membres.";
const messageAction = (message = defaultMessage, channelId = ""): DraftAction => ({ type: "send_message", channelId, roleId: "", message });
const roleAction = (): DraftAction => ({ type: "assign_role", channelId: "", roleId: "", message: defaultMessage });
const emptyDraft = (): Draft => ({ name: "", trigger: "member_join", actions: [messageAction()] });
const templates: FlowTemplate[] = [
    { id: "welcome", icon: "👋", title: "Accueil complet", detail: "Message puis rôle automatique", draft: () => ({ name: "Accueil des nouveaux membres", trigger: "member_join", actions: [messageAction(), roleAction()] }) },
    { id: "rules", icon: "✅", title: "Règlement accepté", detail: "Confirmer l’accès membre", draft: () => ({ name: "Confirmation du règlement", trigger: "rules_accepted", actions: [messageAction("✅ {membre} a accepté le règlement de **{serveur}**.")] }) },
    { id: "ticket", icon: "🎫", title: "Accueil du ticket", detail: "Répondre dans le ticket créé", draft: () => ({ name: "Accueil automatique du ticket", trigger: "ticket_created", actions: [messageAction("Bonjour {membre}, votre demande est bien ouverte dans {ticket}. Décrivez votre besoin et l’équipe vous répondra rapidement.", "event_channel")] }) },
    { id: "departure", icon: "🚪", title: "Journal des départs", detail: "Prévenir dans un salon choisi", draft: () => ({ name: "Journal des départs", trigger: "member_leave", actions: [messageAction("{membre} a quitté **{serveur}**. Le serveur compte maintenant {nombre} membres.")] }) },
];
const triggerLabels: Record<Trigger, string> = {
    member_join: "Arrivée d’un membre",
    member_leave: "Départ d’un membre",
    rules_accepted: "Règlement accepté",
    ticket_created: "Ticket créé",
};

export default function FyxFlowDashboard({ apiBaseUrl, guildId, csrfToken, config, textChannels, roles, onNotice, onRefresh }: {
    apiBaseUrl: string;
    guildId: string;
    csrfToken: string;
    config: FyxFlowConfig;
    textChannels: Option[];
    roles: Option[];
    onNotice: (message: string) => void;
    onRefresh: () => Promise<void>;
}) {
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [simulation, setSimulation] = useState<Simulation | null>(null);
    const [busy, setBusy] = useState(false);
    const selected = useMemo(() => config.flows.find(flow => flow.id === draft.id) || null, [config.flows, draft.id]);

    function resetDraft(next = emptyDraft()) {
        setDraft(next);
        setSimulation(null);
    }

    function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
        setDraft(current => ({ ...current, [key]: value }));
        setSimulation(null);
    }

    function updateTrigger(trigger: Trigger) {
        setDraft(current => ({
            ...current,
            trigger,
            actions: current.actions.map(action => trigger !== "member_join" && action.type === "assign_role" ? messageAction() : action),
        }));
        setSimulation(null);
    }

    function updateAction<K extends keyof DraftAction>(index: number, key: K, value: DraftAction[K]) {
        setDraft(current => ({ ...current, actions: current.actions.map((action, actionIndex) => actionIndex === index ? { ...action, [key]: value } : action) }));
        setSimulation(null);
    }

    function edit(flow: FyxFlowItem) {
        const actions = flow.actions?.length ? flow.actions : [flow.action];
        resetDraft({
            id: flow.id,
            name: flow.name,
            trigger: flow.trigger,
            actions: actions.map(action => action.type === "send_message"
                ? { type: action.type, channelId: action.channelId, roleId: "", message: action.message }
                : { type: action.type, channelId: "", roleId: action.roleId, message: defaultMessage }),
        });
    }

    function payload() {
        const actions = draft.actions.map(action => action.type === "send_message"
            ? { type: "send_message", channelId: action.channelId, message: action.message }
            : { type: "assign_role", roleId: action.roleId });
        return { id: draft.id, name: draft.name, trigger: draft.trigger, action: actions[0], actions };
    }

    async function call(action: "simulate" | "save" | "activate" | "deactivate" | "delete", extra: Record<string, unknown>) {
        setBusy(true);
        try {
            const response = await fetch(`${apiBaseUrl}/fyxflow/${action}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", "X-FyxBot-CSRF": csrfToken },
                body: JSON.stringify({ guildId, ...extra }),
            });
            const result = await response.json();
            if (!response.ok) throw Error(result.error || "FyxFlow est momentanément indisponible.");
            if (action === "simulate") {
                setSimulation(result.simulation);
                onNotice("✓ Simulation terminée sans action sur Discord");
            } else {
                if (action === "save") {
                    resetDraft();
                    onNotice("✓ Automatisation enregistrée et laissée désactivée");
                } else {
                    onNotice(action === "activate" ? "✓ Automatisation activée" : action === "deactivate" ? "✓ Automatisation désactivée" : "✓ Automatisation supprimée");
                }
                await onRefresh();
            }
            return true;
        } catch (error) {
            onNotice(error instanceof Error ? error.message : "Action FyxFlow impossible.");
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function activate(flow: FyxFlowItem) {
        const confirmation = window.prompt(`Activer « ${flow.name} » ? Écrivez ACTIVER pour confirmer.`);
        if (confirmation === "ACTIVER") await call("activate", { flowId: flow.id, confirmation });
    }

    async function remove(flow: FyxFlowItem) {
        const confirmation = window.prompt(`Supprimer définitivement « ${flow.name} » ? Écrivez SUPPRIMER.`);
        if (confirmation === "SUPPRIMER") {
            const removed = await call("delete", { flowId: flow.id, confirmation });
            if (removed && draft.id === flow.id) resetDraft();
        }
    }

    const draftReady = draft.name.trim().length >= 3 && draft.actions.every(action => action.type === "send_message"
        ? Boolean(action.channelId && action.message.trim())
        : Boolean(action.roleId));

    return <section className="fyxflow-workspace">
        <header className="fyxflow-intro"><div><p className="eyebrow">FYXFLOW · AUTOMATISATIONS</p><h2>Reliez un événement Discord à plusieurs actions</h2><p>Construisez, simulez puis activez vos scénarios. Une modification désactive toujours le scénario jusqu’à votre nouvelle confirmation.</p></div><strong>{config.flows.filter(flow => flow.active).length}<small>active(s) sur {config.flows.length}</small></strong></header>
        <div className="fyxflow-templates"><header><div><p className="eyebrow">DÉMARRAGE RAPIDE</p><h3>Modèles prêts à personnaliser</h3></div><span>Aucune activation automatique</span></header><div>{templates.map(template => <button type="button" key={template.id} onClick={() => resetDraft(template.draft())}><span>{template.icon}</span><strong>{template.title}</strong><small>{template.detail}</small></button>)}</div></div>
        <div className="fyxflow-layout">
            <div className="fyxflow-list"><header><div><p className="eyebrow">MES SCÉNARIOS</p><h3>Automatisations du serveur</h3></div><button type="button" onClick={() => resetDraft()}>+ Nouveau</button></header>{config.flows.length === 0 ? <div className="fyxflow-empty"><span>⚡</span><strong>Aucune automatisation</strong><p>Choisissez un modèle ou créez votre premier scénario.</p></div> : config.flows.map(flow => {
                const actionCount = flow.actions?.length || 1;
                return <article className={draft.id === flow.id ? "selected" : ""} key={flow.id}><button type="button" className="fyxflow-select" onClick={() => edit(flow)}><span>{flow.trigger === "member_join" ? "👋" : flow.trigger === "member_leave" ? "🚪" : flow.trigger === "rules_accepted" ? "✅" : "🎫"}</span><div><strong>{flow.name}</strong><small>{triggerLabels[flow.trigger]} · {actionCount} action(s)</small></div><b className={flow.active ? "active" : "inactive"}>{flow.active ? "ACTIF" : "ARRÊTÉ"}</b></button><div className="fyxflow-row-actions"><button type="button" disabled={busy} onClick={() => flow.active ? call("deactivate", { flowId: flow.id }) : activate(flow)}>{flow.active ? "Désactiver" : "Activer"}</button><button type="button" disabled={busy} onClick={() => remove(flow)}>Supprimer</button></div></article>;
            })}</div>
            <div className="fyxflow-builder">
                <div><p className="eyebrow">ÉDITEUR VISUEL</p><h3>{selected ? `Modifier ${selected.name}` : "Nouveau scénario"}</h3><p>{selected?.active ? "Enregistrer une modification désactivera ce scénario par sécurité." : "Le scénario restera désactivé après son enregistrement."}</p></div>
                <label>Nom<input maxLength={80} value={draft.name} onChange={event => updateDraft("name", event.target.value)} placeholder="Ex. Bienvenue personnalisée"/></label>
                <label>Quand…<select value={draft.trigger} onChange={event => updateTrigger(event.target.value as Trigger)}><option value="member_join">Un membre rejoint le serveur</option><option value="member_leave">Un membre quitte le serveur</option><option value="rules_accepted">Un membre accepte le règlement</option><option value="ticket_created">Un membre crée un ticket</option></select></label>
                <div className="fyxflow-actions-heading"><div><strong>Alors…</strong><small>Les actions sont exécutées dans cet ordre.</small></div><button type="button" disabled={draft.actions.length >= 3} onClick={() => updateDraft("actions", [...draft.actions, messageAction()])}>+ Ajouter une action</button></div>
                <div className="fyxflow-action-list">{draft.actions.map((action, index) => <article key={`${index}-${action.type}`}><header><span>{index + 1}</span><strong>Action {index + 1}</strong>{draft.actions.length > 1 && <button type="button" aria-label={`Retirer l’action ${index + 1}`} onClick={() => updateDraft("actions", draft.actions.filter((_, actionIndex) => actionIndex !== index))}>×</button>}</header><label>Type<select value={action.type} onChange={event => updateAction(index, "type", event.target.value as DraftAction["type"])}><option value="send_message">Envoyer un message</option><option value="assign_role" disabled={draft.trigger !== "member_join"}>Attribuer un rôle</option></select></label>{action.type === "send_message" ? <><label>Salon<select value={action.channelId} onChange={event => updateAction(index, "channelId", event.target.value)}><option value="">Choisir un salon</option>{draft.trigger === "ticket_created" && <option value="event_channel">Le ticket qui vient d’être créé</option>}{textChannels.map(channel => <option value={channel.id} key={channel.id}>{channel.name}</option>)}</select></label><label className="full-row">Message<textarea rows={4} maxLength={1500} value={action.message} onChange={event => updateAction(index, "message", event.target.value)}/><small>Variables : {`{membre}`} · {`{serveur}`} · {`{nombre}`} · {`{ticket}`}</small></label></> : <label>Rôle<select value={action.roleId} onChange={event => updateAction(index, "roleId", event.target.value)}><option value="">Choisir un rôle</option>{roles.map(role => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label>}</article>)}</div>
                <div className="fyxflow-builder-actions"><button type="button" className="secondary" disabled={busy || !draftReady} onClick={() => call("simulate", { flow: payload() })}>Simuler {draft.actions.length} action(s)</button><button type="button" disabled={busy || !draftReady} onClick={() => call("save", { flow: payload() })}>{selected ? "Enregistrer et désactiver" : "Enregistrer le brouillon"}</button></div>
                {simulation && <div className="fyxflow-simulation"><strong>Simulation sans publication</strong>{simulation.steps.map(step => <p key={step}>✓ {step}</p>)}<small>{simulation.warning}</small></div>}
            </div>
        </div>
        <div className="fyxflow-history"><div><p className="eyebrow">JOURNAL D’EXÉCUTION</p><h3>50 derniers résultats maximum</h3></div>{config.history.length === 0 ? <p>Aucune exécution réelle pour le moment.</p> : config.history.slice(0, 12).map(item => <article key={item.id}><span className={item.status}>{item.status === "success" ? "✓" : "!"}</span><div><strong>{item.flowName}</strong><small>{item.detail}</small></div><time>{new Date(item.executedAt).toLocaleString("fr-FR")}</time></article>)}</div>
    </section>;
}
