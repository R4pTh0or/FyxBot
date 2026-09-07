// @ts-check

const pino = require('pino');

/**
 * @typedef {Object} FyxLogger
 * @property {(bindings: Record<string, unknown>) => FyxLogger} child
 * @property {(...values: unknown[]) => void} debug
 * @property {(...values: unknown[]) => void} error
 * @property {(...values: unknown[]) => void} fatal
 * @property {(...values: unknown[]) => void} info
 * @property {(...values: unknown[]) => void} log
 * @property {(...values: unknown[]) => void} trace
 * @property {(...values: unknown[]) => void} warn
 */

/**
 * @typedef {Object} StructuredLoggerOptions
 * @property {Record<string, unknown>} [base]
 * @property {import('pino').DestinationStream} [destination]
 * @property {NodeJS.ProcessEnv} [environment]
 * @property {string} [level]
 * @property {boolean} [pretty]
 */

const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_PATHS = Object.freeze([
  'token',
  'authorization',
  'cookie',
  'password',
  'secret',
  'accessKeyId',
  'secretAccessKey',
  'details.token',
  'details.authorization',
  'details.cookie',
  'details.password',
  'details.secret',
  'details.accessKeyId',
  'details.secretAccessKey',
  'details.*.token',
  'details.*.authorization',
  'details.*.cookie',
  'details.*.password',
  'details.*.secret',
]);

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Error);
}

/** @param {unknown[]} values */
function normalizeLogArguments(values) {
  /** @type {Record<string, unknown>} */
  const context = {};
  /** @type {string[]} */
  const messageParts = [];
  /** @type {unknown[]} */
  const details = [];

  values.forEach((value, index) => {
    if (value instanceof Error) {
      if (!context.err) context.err = value;
      else details.push({ name: value.name, message: value.message, stack: value.stack });
      return;
    }
    if (isPlainObject(value)) {
      if (index === 0) Object.assign(context, /** @type {Record<string, unknown>} */ (value));
      else details.push(value);
      return;
    }
    if (value !== undefined && value !== null) messageParts.push(String(value));
  });

  if (details.length === 1) context.details = details[0];
  else if (details.length > 1) context.details = details;
  return {
    context,
    message: messageParts.join(' ').trim() || 'Événement FyxBot',
  };
}

function runningNodeTests(environment = process.env, argv = process.argv) {
  return Boolean(environment.NODE_TEST_CONTEXT)
    || argv.some((value) => /(?:^|[\\/])tests?[\\/].+\.test\.[cm]?js$/i.test(value));
}

function defaultLogLevel(environment = process.env, argv = process.argv) {
  if (environment.FYXBOT_LOG_LEVEL) return environment.FYXBOT_LOG_LEVEL;
  if (runningNodeTests(environment, argv)) return 'silent';
  return environment.NODE_ENV === 'production' ? 'info' : 'debug';
}

function shouldPrettyPrint(environment = process.env, argv = process.argv) {
  if (environment.FYXBOT_LOG_PRETTY === 'false') return false;
  if (environment.FYXBOT_LOG_PRETTY === 'true') return true;
  return environment.NODE_ENV !== 'production' && !runningNodeTests(environment, argv);
}

/** @param {import('pino').Logger} instance @returns {FyxLogger} */
function wrapPino(instance) {
  /** @param {import('pino').Level} level @param {unknown[]} values */
  const emit = (level, values) => {
    const { context, message } = normalizeLogArguments(values);
    if (Object.keys(context).length > 0) instance[level](context, message);
    else instance[level](message);
  };

  return Object.freeze({
    child(bindings) {
      return wrapPino(instance.child(bindings));
    },
    debug(...values) {
      emit('debug', values);
    },
    error(...values) {
      emit('error', values);
    },
    fatal(...values) {
      emit('fatal', values);
    },
    info(...values) {
      emit('info', values);
    },
    log(...values) {
      emit('info', values);
    },
    trace(...values) {
      emit('trace', values);
    },
    warn(...values) {
      emit('warn', values);
    },
  });
}

/** @param {StructuredLoggerOptions} [options] @returns {FyxLogger} */
function createStructuredLogger({
  base = { service: 'fyxbot-bot-api' },
  destination,
  environment = process.env,
  level = defaultLogLevel(environment),
  pretty = shouldPrettyPrint(environment),
} = {}) {
  const options = {
    base,
    level,
    name: 'fyxbot',
    redact: {
      censor: REDACTED_VALUE,
      paths: [...SENSITIVE_PATHS],
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  const output = destination || (pretty ? pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      singleLine: true,
      translateTime: 'SYS:standard',
    },
  }) : undefined);
  return wrapPino(pino(options, output));
}

const logger = createStructuredLogger();

module.exports = {
  REDACTED_VALUE,
  createStructuredLogger,
  defaultLogLevel,
  logger,
  normalizeLogArguments,
  runningNodeTests,
  shouldPrettyPrint,
};
