/**
 * Centralized logging utility for SVGCanvas.
 * Provides configurable log levels and the ability to disable logging in production.
 * @module logger
 * @license MIT
 */

/** Log levels in order of severity */
export const LogLevel = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
} as const
export type LogLevelValue = typeof LogLevel[keyof typeof LogLevel]

/** Called as `sink(levelName, { message, data })`. */
export type LogSink = (level: string, record: { message: string, data: unknown }) => void

/**
 * Logger configuration. Kept on a `Symbol.for` global so every copy of this
 * module (the editor bundle and the svgcanvas bundle each inline their own)
 * shares one level/sink, which a host sets once.
 */
interface LoggerConfig {
  currentLevel: LogLevelValue
  enabled: boolean
  prefix: string
  sink: LogSink | null
}
const globals = globalThis as unknown as Record<symbol, LoggerConfig | undefined>
const config: LoggerConfig = globals[Symbol.for('svgedit.logger')] ??= {
  currentLevel: LogLevel.WARN,
  enabled: true,
  prefix: '[SVGCanvas]',
  sink: null
}

/**
 * Route every emitted log record to a host-provided function, in addition to
 * the console, so warnings from users' sessions reach e.g. a plugin's debug
 * log. Records below the current log level are not delivered.
 * Pass `null` to stop.
 */
export const setLogSink = (sink: LogSink | null): void => {
  config.sink = typeof sink === 'function' ? sink : null
}

const emit = (level: string, message: string, data: unknown): void => {
  if (!config.sink) return
  try {
    config.sink(level, { message, data })
  } catch {
    // A failing host sink must never break the editor.
  }
}

/** Set the logging level */
export const setLogLevel = (level: LogLevelValue): void => {
  if (Object.values(LogLevel).includes(level)) {
    config.currentLevel = level
  }
}

/** Enable or disable logging */
export const setLoggingEnabled = (enabled: boolean): void => {
  config.enabled = Boolean(enabled)
}

/** Set the prefix used for log messages */
export const setLogPrefix = (prefix: string): void => {
  config.prefix = String(prefix)
}

/** Format a log message with prefix and context */
const formatMessage = (message: string, context = ''): string => {
  const contextStr = context ? ` [${context}]` : ''
  return `${config.prefix}${contextStr} ${message}`
}

/** Log an error message; `error` is an optional error object or additional data, `context` e.g. the module name. */
export const error = (message: string, error?: unknown, context = ''): void => {
  if (!config.enabled || config.currentLevel < LogLevel.ERROR) return

  console.error(formatMessage(message, context))
  if (error) {
    console.error(error)
  }
  emit('error', formatMessage(message, context), error)
}

/** Log a warning message; `data` is optional additional data, `context` e.g. the module name. */
export const warn = (message: string, data?: unknown, context = ''): void => {
  if (!config.enabled || config.currentLevel < LogLevel.WARN) return

  console.warn(formatMessage(message, context))
  if (data !== undefined) {
    console.warn(data)
  }
  emit('warn', formatMessage(message, context), data)
}

/** Log an info message; `data` is optional additional data, `context` e.g. the module name. */
export const info = (message: string, data?: unknown, context = ''): void => {
  if (!config.enabled || config.currentLevel < LogLevel.INFO) return

  console.info(formatMessage(message, context))
  if (data !== undefined) {
    console.info(data)
  }
  emit('info', formatMessage(message, context), data)
}

/** Log a debug message; `data` is optional additional data, `context` e.g. the module name. */
export const debug = (message: string, data?: unknown, context = ''): void => {
  if (!config.enabled || config.currentLevel < LogLevel.DEBUG) return

  console.debug(formatMessage(message, context))
  if (data !== undefined) {
    console.debug(data)
  }
  emit('debug', formatMessage(message, context), data)
}

/** Get a copy of the current logger configuration */
export const getConfig = (): LoggerConfig => ({ ...config })

// Default export as namespace
export default {
  LogLevel,
  setLogLevel,
  setLoggingEnabled,
  setLogPrefix,
  setLogSink,
  error,
  warn,
  info,
  debug,
  getConfig
}
