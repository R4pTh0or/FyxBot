"use client";

import { useMemo, useState } from "react";

type Option = { id: string; name: string };
type FyxFlowAction =
    | { type: "send_message"; channelId: string; message: string }
    | { type: "assign_role"; roleId: string };
type FyxFlowItem = {
    id: string;
    name: string;
    trigger: "member_join" | "member_leave" | "rules_accepted" | "ticket_created";
    action: FyxFlowAction;
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
type Draft = {
    id?: string;
    name: string;
    trigger: "member_join" | "member_leave" | "rules_accepted" | "ticket_created";
    actionType: "send_message" | "assign_role";
    channelId: string;
    roleId: string;
    message: string;
};
type Simulation = { steps: string[]; warning: string };

const emptyDraft: Draft = {
    name: "",
    trigger: "member_join",
    actionType: "send_message",
    channelId: "",
    roleId: "",
    message: "Bienvenue {membre} sur **{serveur}** ! Nous sommes maintenant {nombre} membres.",
};

export default function FyxFlowDashboard({
    apiBaseUrl,
    guildId,
    csrfToken,
    config,
    textChannels,
    roles,
    onNotice,
    onRefresh,
}: {
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

    function update<K extends keyof Draft>(key: K, value: Draft[K]) {
        setDraft(current => ({ ...current, [key]: value }));
        setSimulation(null);
    }

    function updateTrigger(trigger: Draft["trigger"]) {
        setDraft(current => ({
            ...current,
            trigger,
            actionType: trigger !== "member_join" && current.actionType === "assign_role" ? "send_message" : current.actionType,
        }));
        setSimulation(null);
    }

    function edit(flow: FyxFlowItem) {
        setDraft({
            id: flow.id,
            name: flow.name,
            trigger: flow.trigger,
            actionType: flow.action.type,
            channelId: flow.action.type === "send_message" ? flow.action.channelId : "",
            roleId: flow.action.type === "assign_role" ? flow.action.roleId : "",
            message: flow.action.type === "send_message" ? flow.action.message : emptyDraft.message,
        });
        setSimulation(null);
    }

    function payload() {
        return {
            id: draft.id,
            name: draft.name,
            trigger: draft.trigger,
            action: draft.actionType === "send_message"
                ? { type: "send_message", channelId: draft.channelId, message: draft.message }
                : { type: "assign_role", roleId: draft.roleId },
        };
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
                    setDraft(emptyDraft);
                    setSimulation(null);
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
            if (removed && draft.id === flow.id) {
                setDraft(emptyDraft);
                setSimulation(null);
            }
        }
    }

    const draftReady = draft.name.trim().length >= 3
        && (draft.actionType === "send_message" ? Boolean(draft.channelId && draft.message.trim()) : Boolean(draft.roleId));

    return <section className="fyxflow-workspace">
        <header className="fyxflow-intro">
            <div><p className="eyebrow">FYXFLOW · AUTOMATISATIONS</p><h2>Reliez un événement Discord à une action</h2><p>Construisez, simulez puis activez vos scénarios. Une modification désactive toujours le scénario jusqu’à votre nouvelle confirmation.</p></div>
            <strong>{config.flows.filter(flow => flow.active).length}<small>active(s) sur {config.flows.length}</small></strong>
        </header>
        <div className="fyxflow-layout">
            <div className="fyxflow-list">
                <header><div><p className="eyebrow">MES SCÉNARIOS</p><h3>Automatisations du serveur</h3></div><button type="button" onClick={() => { setDraft(emptyDraft); setSimulation(null); }}>+ Nouveau</button></header>
                {config.flows.length === 0 ? <div className="fyxflow-empty"><span>⚡</span><strong>Aucune automatisation</strong><p>Créez votre premier scénario et testez-le sans modifier Discord.</p></div> : config.flows.map(flow => <article className={draft.id === flow.id ? "selected" : ""} key={flow.id}>
                    <button type="button" className="fyxflow-select" onClick={() => edit(flow)}><span>{flow.trigger === "member_join" ? "👋" : flow.trigger === "member_leave" ? "🚪" : flow.trigger === "rules_accepted" ? "✅" : "🎫"}</span><div><strong>{flow.name}</strong><small>{flow.trigger === "member_join" ? "Arrivée d’un membre" : flow.trigger === "member_leave" ? "Départ d’un membre" : flow.trigger === "rules_accepted" ? "Règlement accepté" : "Ticket créé"} · {flow.action.type === "send_message" ? "Envoyer un message" : "Attribuer un rôle"}</small></div><b className={flow.active ? "active" : "inactive"}>{flow.active ? "ACTIF" : "ARRÊTÉ"}</b></button>
                    <div className="fyxflow-row-actions"><button type="button" disabled={busy} onClick={() => flow.active ? call("deactivate", { flowId: flow.id }) : activate(flow)}>{flow.active ? "Désactiver" : "Activer"}</button><button type="button" disabled={busy} onClick={() => remove(flow)}>Supprimer</button></div>
                </article>)}
            </div>
            <div className="fyxflow-builder">
                <div><p className="eyebrow">ÉDITEUR VISUEL</p><h3>{selected ? `Modifier ${selected.name}` : "Nouveau scénario"}</h3><p>{selected?.active ? "Enregistrer une modification désactivera ce scénario par sécurité." : "Le scénario restera désactivé après son enregistrement."}</p></div>
                <label>Nom<input maxLength={80} value={draft.name} onChange={event => update("name", event.target.value)} placeholder="Ex. Bienvenue personnalisée"/></label>
                <label>Quand…<select value={draft.trigger} onChange={event => updateTrigger(event.target.value as Draft["trigger"])}><option value="member_join">Un membre rejoint le serveur</option><option value="member_leave">Un membre quitte le serveur</option><option value="rules_accepted">Un membre accepte le règlement</option><option value="ticket_created">Un membre crée un ticket</option></select></label>
                <label>Alors…<select value={draft.actionType} onChange={event => update("actionType", event.target.value as Draft["actionType"])}><option value="send_message">Envoyer un message</option><option value="assign_role" disabled={draft.trigger !== "member_join"}>Attribuer un rôle</option></select></label>
                {draft.actionType === "send_message" ? <><label>Salon<select value={draft.channelId} onChange={event => update("channelId", event.target.value)}><option value="">Choisir un salon</option>{draft.trigger === "ticket_created" && <option value="event_channel">Le ticket qui vient d’être créé</option>}{textChannels.map(channel => <option value={channel.id} key={channel.id}>{channel.name}</option>)}</select></label><label className="full-row">Message<textarea rows={5} maxLength={1500} value={draft.message} onChange={event => update("message", event.target.value)}/><small>Variables : {`{membre}`} · {`{serveur}`} · {`{nombre}`} · {`{ticket}`}</small></label></> : <label>Rôle<select value={draft.roleId} onChange={event => update("roleId", event.target.value)}><option value="">Choisir un rôle</option>{roles.map(role => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label>}
                <div className="fyxflow-builder-actions"><button type="button" className="secondary" disabled={busy || !draftReady} onClick={() => call("simulate", { flow: payload() })}>Simuler</button><button type="button" disabled={busy || !draftReady} onClick={() => call("save", { flow: payload() })}>{selected ? "Enregistrer et désactiver" : "Enregistrer le brouillon"}</button></div>
                {simulation && <div className="fyxflow-simulation"><strong>Simulation sans publication</strong>{simulation.steps.map(step => <p key={step}>✓ {step}</p>)}<small>{simulation.warning}</small></div>}
            </div>
        </div>
        <div className="fyxflow-history"><div><p className="eyebrow">JOURNAL D’EXÉCUTION</p><h3>50 derniers résultats maximum</h3></div>{config.history.length === 0 ? <p>Aucune exécution réelle pour le moment.</p> : config.history.slice(0, 12).map(item => <article key={item.id}><span className={item.status}>{item.status === "success" ? "✓" : "!"}</span><div><strong>{item.flowName}</strong><small>{item.detail}</small></div><time>{new Date(item.executedAt).toLocaleString("fr-FR")}</time></article>)}</div>
    </section>;
}
