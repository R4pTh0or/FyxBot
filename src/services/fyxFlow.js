const { randomUUID } = require('node:crypto');
const logger = require('./logger').logger.child({ component: 'fyxflow' });
const { getFyxFlowConfig, updateFyxFlowConfig } = require('../database/fyxFlowStore');

const TRIGGERS = new Set(['member_join', 'member_leave', 'rules_accepted', 'ticket_created']);
const ACTIONS = new Set(['send_message', 'assign_role']);
const MAX_FLOWS = 20;
const MAX_HISTORY = 50;
const EVENT_CHANNEL_ID = 'event_channel';

class FyxFlowValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FyxFlowValidationError';
  }
}

function cleanText(value, maximum) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum);
}

function allowedId(id, allowed, label) {
  if (!/^\d{17,20}$/.test(id) || (allowed && !allowed.has(id))) {
    throw new FyxFlowValidationError(`${label} invalide.`);
  }
  return id;
}

function normalizeFlow(input, { channelIds = null, roleIds = null } = {}) {
  const name = cleanText(input?.name, 80);
  const trigger = String(input?.trigger || 'member_join');
  const actionType = String(input?.action?.type || 'send_message');
  if (name.length < 3) throw new FyxFlowValidationError('Donnez un nom d’au moins 3 caractères à cette automatisation.');
  if (!TRIGGERS.has(trigger)) throw new FyxFlowValidationError('Déclencheur FyxFlow inconnu.');
  if (!ACTIONS.has(actionType)) throw new FyxFlowValidationError('Action FyxFlow inconnue.');
  if (actionType === 'assign_role' && trigger !== 'member_join') {
    throw new FyxFlowValidationError('Un rôle ne peut être attribué que lorsqu’un membre arrive.');
  }

  const requestedChannelId = String(input?.action?.channelId || '');
  if (requestedChannelId === EVENT_CHANNEL_ID && trigger !== 'ticket_created') {
    throw new FyxFlowValidationError('Le salon lié à l’événement est disponible uniquement lors de la création d’un ticket.');
  }
  const action = actionType === 'send_message'
    ? {
      type: actionType,
      channelId: requestedChannelId === EVENT_CHANNEL_ID
        ? EVENT_CHANNEL_ID
        : allowedId(requestedChannelId, channelIds, 'Salon Discord'),
      message: cleanText(input?.action?.message, 1500),
    }
    : {
      type: actionType,
      roleId: allowedId(String(input?.action?.roleId || ''), roleIds, 'Rôle Discord'),
    };
  if (action.type === 'send_message' && !action.message) {
    throw new FyxFlowValidationError('Écrivez le message que FyxBot doit envoyer.');
  }

  return {
    id: /^[-0-9a-f]{36}$/i.test(String(input?.id || '')) ? String(input.id) : randomUUID(),
    name,
    trigger,
    action,
    active: Boolean(input?.active),
    createdAt: input?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildFyxFlowSimulation(input, options = {}) {
  const flow = normalizeFlow({ ...input, active: false }, options);
  const triggerLabels = {
    member_join: 'un membre rejoint le serveur',
    member_leave: 'un membre quitte le serveur',
    rules_accepted: 'un membre accepte le règlement',
    ticket_created: 'un membre crée un ticket',
  };
  const triggerLabel = triggerLabels[flow.trigger];
  const actionLabel = flow.action.type === 'send_message'
    ? flow.action.channelId === EVENT_CHANNEL_ID
      ? 'envoyer un message dans le ticket qui vient d’être créé'
      : 'envoyer un message dans le salon sélectionné'
    : 'attribuer le rôle sélectionné au nouveau membre';
  return {
    previewOnly: true,
    flow: { ...flow, active: false },
    steps: [
      `Détecter lorsque ${triggerLabel}.`,
      `Vérifier que la cible Discord existe et reste accessible à FyxBot.`,
      `Puis ${actionLabel}.`,
      'Ajouter le résultat au journal FyxFlow.',
    ],
    warning: 'Cette simulation ne publie rien sur Discord et n’active pas le scénario.',
  };
}

async function saveFyxFlow(guildId, input, options = {}, storage) {
  const normalized = normalizeFlow({ ...input, active: false }, options);
  return updateFyxFlowConfig(guildId, (config) => {
    const existing = config.flows.find((flow) => flow.id === normalized.id);
    const flows = existing
      ? config.flows.map((flow) => flow.id === normalized.id
        ? { ...normalized, createdAt: flow.createdAt || normalized.createdAt, active: false }
        : flow)
      : [...config.flows, normalized];
    if (flows.length > MAX_FLOWS) throw new FyxFlowValidationError(`Un serveur peut contenir au maximum ${MAX_FLOWS} automatisations.`);
    return { ...config, flows, updatedAt: new Date().toISOString() };
  }, storage);
}

async function setFyxFlowActive(guildId, flowId, active, options = {}, storage) {
  let found = false;
  const config = await updateFyxFlowConfig(guildId, (current) => ({
    ...current,
    flows: current.flows.map((flow) => {
      if (flow.id !== flowId) return flow;
      found = true;
      const normalized = normalizeFlow(flow, options);
      return { ...normalized, active: Boolean(active), createdAt: flow.createdAt || normalized.createdAt };
    }),
    updatedAt: new Date().toISOString(),
  }), storage);
  if (!found) throw new FyxFlowValidationError('Automatisation FyxFlow introuvable.');
  return config;
}

async function deleteFyxFlow(guildId, flowId, storage) {
  let found = false;
  const config = await updateFyxFlowConfig(guildId, (current) => ({
    ...current,
    flows: current.flows.filter((flow) => {
      if (flow.id === flowId) found = true;
      return flow.id !== flowId;
    }),
    updatedAt: new Date().toISOString(),
  }), storage);
  if (!found) throw new FyxFlowValidationError('Automatisation FyxFlow introuvable.');
  return config;
}

function renderFlowMessage(template, member, context = {}) {
  const targetChannel = context.channel?.id ? `<#${context.channel.id}>` : 'le salon concerné';
  return String(template || '')
    .replaceAll('{membre}', `<@${member.id}>`)
    .replaceAll('{serveur}', member.guild.name)
    .replaceAll('{nombre}', String(member.guild.memberCount))
    .replaceAll('{ticket}', targetChannel)
    .replaceAll('{salon}', targetChannel);
}

async function recordExecution(guildId, entry, storage) {
  await updateFyxFlowConfig(guildId, (config) => ({
    ...config,
    history: [{ id: randomUUID(), ...entry, executedAt: new Date().toISOString() }, ...config.history].slice(0, MAX_HISTORY),
  }), storage);
}

async function executeFyxFlowTrigger(member, trigger, storage, context = {}) {
  if (!member?.guild || member.user?.bot || !TRIGGERS.has(trigger)) return [];
  const config = await getFyxFlowConfig(member.guild.id, storage);
  const flows = config.flows.filter((flow) => flow.active && flow.trigger === trigger);
  const results = [];
  for (const flow of flows) {
    try {
      if (flow.action.type === 'send_message') {
        const channel = flow.action.channelId === EVENT_CHANNEL_ID
          ? context.channel
          : member.guild.channels.cache.get(flow.action.channelId)
            || await member.guild.channels.fetch(flow.action.channelId).catch(() => null);
        if (!channel?.isTextBased() || typeof channel.send !== 'function') throw new Error('Salon de destination indisponible.');
        await channel.send({
          content: renderFlowMessage(flow.action.message, member, context),
          allowedMentions: { parse: [], users: [member.id] },
        });
      } else if (flow.action.type === 'assign_role') {
        if (trigger !== 'member_join') throw new Error('Attribution de rôle interdite pour ce déclencheur.');
        const role = member.guild.roles.cache.get(flow.action.roleId)
          || await member.guild.roles.fetch(flow.action.roleId).catch(() => null);
        if (!role || role.managed || !role.editable) throw new Error('Rôle indisponible ou placé au-dessus de FyxBot.');
        await member.roles.add(role, `Automatisation FyxFlow : ${flow.name}`);
      }
      const entry = { flowId: flow.id, flowName: flow.name, trigger, status: 'success', detail: 'Action exécutée avec succès.' };
      await recordExecution(member.guild.id, entry, storage);
      results.push(entry);
    } catch (error) {
      const entry = {
        flowId: flow.id,
        flowName: flow.name,
        trigger,
        status: 'failed',
        detail: flow.action.type === 'send_message'
          ? 'Le message n’a pas pu être envoyé. Vérifiez le salon et les permissions de FyxBot.'
          : 'Le rôle n’a pas pu être attribué. Vérifiez sa position et les permissions de FyxBot.',
      };
      await recordExecution(member.guild.id, entry, storage).catch(() => {});
      logger.warn({ err: error, guildId: member.guild.id, flowId: flow.id, trigger }, '[FyxBot] Une automatisation FyxFlow a échoué.');
      results.push(entry);
    }
  }
  return results;
}

module.exports = {
  ACTIONS,
  EVENT_CHANNEL_ID,
  FyxFlowValidationError,
  MAX_FLOWS,
  TRIGGERS,
  buildFyxFlowSimulation,
  deleteFyxFlow,
  executeFyxFlowTrigger,
  normalizeFlow,
  renderFlowMessage,
  saveFyxFlow,
  setFyxFlowActive,
};
