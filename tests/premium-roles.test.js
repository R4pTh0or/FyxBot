const assert = require('node:assert/strict');
const test = require('node:test');
const { Collection, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const premiumCommand = require('../src/commands/configuration/premium');
const {
  configurePremiumRoles,
  disablePremiumRoles,
  premiumAccessForUser,
  syncPremiumRolesForMember,
} = require('../src/services/premiumRoles');

const USER_ID = '111111111111111111';
const GUILD_ID = '222222222222222222';
const PAID_ROLE_ID = '333333333333333333';
const COMPLIMENTARY_ROLE_ID = '444444444444444444';

function accessStorage({ paid = false, founder = false, manual = false } = {}) {
  return {
    entitlement: {
      getUserPremiumEntitlementState: async () => ({ active: paid }),
    },
    complimentary: {
      getFounderProgramState: async () => ({ userActive: founder }),
      getManualPremiumState: async () => ({ userActive: manual }),
    },
  };
}

function configurationStorage(initial = null) {
  const rows = new Map(initial ? [[`${GUILD_ID}:premium`, initial]] : []);
  return {
    rows,
    async getConfiguration(guildId, section) {
      return rows.get(`${guildId}:${section}`) || null;
    },
    async setConfiguration(guildId, section, value) {
      rows.set(`${guildId}:${section}`, value);
      return value;
    },
  };
}

function safeRole(id, name, permissionBits = []) {
  return {
    id,
    name,
    managed: false,
    permissions: new PermissionsBitField(permissionBits),
    toString: () => `<@&${id}>`,
  };
}

function fixture({ memberRoleIds = [] } = {}) {
  const paidRole = safeRole(PAID_ROLE_ID, '💎 Client Premium');
  const complimentaryRole = safeRole(COMPLIMENTARY_ROLE_ID, '🎁 Premium offert');
  const guild = {
    id: GUILD_ID,
    ownerId: '999999999999999999',
    roles: { cache: new Collection([[paidRole.id, paidRole], [complimentaryRole.id, complimentaryRole]]) },
    members: {
      me: { roles: { highest: { comparePositionTo: () => 1 } } },
    },
  };
  const cache = new Collection(memberRoleIds.map((roleId) => [roleId, guild.roles.cache.get(roleId)]));
  const operations = [];
  const member = {
    id: USER_ID,
    guild,
    user: { bot: false },
    roles: {
      cache,
      highest: { comparePositionTo: () => 1 },
      async add(role) {
        cache.set(role.id, role);
        operations.push(['add', role.id]);
      },
      async remove(role) {
        cache.delete(role.id);
        operations.push(['remove', role.id]);
      },
    },
  };
  return { guild, member, paidRole, complimentaryRole, operations };
}

test('privilégie le rôle Client Premium lorsqu’un abonnement Discord est actif', async () => {
  const stores = accessStorage({ paid: true, founder: true, manual: true });
  const state = await premiumAccessForUser(USER_ID, {
    entitlementOptions: { storage: stores.entitlement },
    founderOptions: { storage: stores.complimentary },
    manualOptions: { storage: stores.complimentary },
  });

  assert.deepEqual(state, { paid: true, complimentary: false, source: 'discord-entitlement' });
});

test('attribue le rôle Premium offert aux essais Fondateur et aux partenaires', async () => {
  for (const access of [{ founder: true }, { manual: true }]) {
    const stores = accessStorage(access);
    const state = await premiumAccessForUser(USER_ID, {
      entitlementOptions: { storage: stores.entitlement },
      founderOptions: { storage: stores.complimentary },
      manualOptions: { storage: stores.complimentary },
    });

    assert.equal(state.paid, false);
    assert.equal(state.complimentary, true);
  }
});

test('fait passer automatiquement un membre de Premium offert à Client Premium', async () => {
  const { member, operations } = fixture({ memberRoleIds: [COMPLIMENTARY_ROLE_ID] });
  const result = await syncPremiumRolesForMember(member, {
    config: { paidRoleId: PAID_ROLE_ID, complimentaryRoleId: COMPLIMENTARY_ROLE_ID },
    access: { paid: true, complimentary: false, source: 'discord-entitlement' },
  });

  assert.deepEqual(operations, [['add', PAID_ROLE_ID], ['remove', COMPLIMENTARY_ROLE_ID]]);
  assert.deepEqual(result.added, [PAID_ROLE_ID]);
  assert.deepEqual(result.removed, [COMPLIMENTARY_ROLE_ID]);
});

test('retire les deux rôles lorsque l’accès Premium est terminé', async () => {
  const { member, operations } = fixture({ memberRoleIds: [PAID_ROLE_ID, COMPLIMENTARY_ROLE_ID] });
  const result = await syncPremiumRolesForMember(member, {
    config: { paidRoleId: PAID_ROLE_ID, complimentaryRoleId: COMPLIMENTARY_ROLE_ID },
    access: { paid: false, complimentary: false, source: 'free' },
  });

  assert.deepEqual(operations, [['remove', PAID_ROLE_ID], ['remove', COMPLIMENTARY_ROLE_ID]]);
  assert.equal(result.removed.length, 2);
});

test('refuse un même rôle et un rôle doté de permissions sensibles', async () => {
  const { guild, member, paidRole, complimentaryRole } = fixture();
  const storage = configurationStorage();

  await assert.rejects(
    () => configurePremiumRoles(guild, {
      paidRole,
      complimentaryRole: paidRole,
      actorMember: member,
      configurationStorage: storage,
    }),
    (error) => error.code === 'DUPLICATE_ROLE',
  );

  const dangerousRole = safeRole(COMPLIMENTARY_ROLE_ID, 'Administrateur Premium', [PermissionFlagsBits.Administrator]);
  guild.roles.cache.set(dangerousRole.id, dangerousRole);
  await assert.rejects(
    () => configurePremiumRoles(guild, {
      paidRole,
      complimentaryRole: dangerousRole,
      actorMember: member,
      configurationStorage: storage,
    }),
    (error) => error.code === 'INVALID_ROLE' && /permissions sensibles/.test(error.message),
  );
});

test('enregistre deux rôles sûrs et expose les sous-commandes Premium', async () => {
  const { guild, member, paidRole, complimentaryRole } = fixture();
  const storage = configurationStorage({ legacy: true });
  const config = await configurePremiumRoles(guild, {
    paidRole,
    complimentaryRole,
    actorMember: member,
    configurationStorage: storage,
  });

  assert.equal(config.legacy, true);
  assert.equal(config.paidRoleId, PAID_ROLE_ID);
  assert.equal(config.complimentaryRoleId, COMPLIMENTARY_ROLE_ID);
  const command = premiumCommand.data.toJSON();
  const names = command.options.map((option) => option.name);
  assert.ok(names.includes('roles-configurer'));
  assert.ok(names.includes('roles-desactiver'));
  assert.deepEqual(
    command.options.find((option) => option.name === 'roles-configurer').options.map((option) => option.name),
    ['role-premium', 'role-offert'],
  );
});

test('désactive la synchronisation même si un retrait Discord isolé échoue', async () => {
  const { guild, member } = fixture({ memberRoleIds: [PAID_ROLE_ID, COMPLIMENTARY_ROLE_ID] });
  const storage = configurationStorage({
    paidRoleId: PAID_ROLE_ID,
    complimentaryRoleId: COMPLIMENTARY_ROLE_ID,
  });
  guild.members.fetch = async () => new Collection([[member.id, member]]);
  member.roles.remove = async (role) => {
    if (role.id === PAID_ROLE_ID) throw new Error('Discord indisponible');
    member.roles.cache.delete(role.id);
  };

  const result = await disablePremiumRoles(guild, { configurationStorage: storage });

  assert.equal(result.removed, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(storage.rows.get(`${GUILD_ID}:premium`), {
    paidRoleId: null,
    complimentaryRoleId: null,
    updatedAt: storage.rows.get(`${GUILD_ID}:premium`).updatedAt,
  });
});
