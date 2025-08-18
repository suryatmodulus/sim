/**
 * Structured logging system using Pino
 *
 * Provides high-performance, structured logging with standardized formatting,
 * basic sanitization, and environment-specific configuration.
 */

import pino from 'pino'
import { env } from '@/lib/env'
import { sanitizeLogArgs, sanitizeLogData } from '../sanitizer'

/**
 * Log levels supported by the structured logger
 */
export enum LogLevel {
  TRACE = 10,
  DEBUG = 20,
  INFO = 30,
  WARN = 40,
  ERROR = 50,
  FATAL = 60,
}

/**
 * Standard log context interface
 */
export interface LogContext {
  /** Request/operation ID for tracing */
  requestId?: string
  /** User ID associated with the operation */
  userId?: string
  /** Workflow ID if applicable */
  workflowId?: string
  /** Socket ID for real-time operations */
  socketId?: string
  /** Module or component name */
  module?: string
  /** Operation or method name */
  operation?: string
  /** Additional structured data */
  [key: string]: any
}

/**
 * Performance metrics for operations
 */
export interface PerformanceMetrics {
  /** Duration in milliseconds */
  duration?: number
  /** Memory usage in MB */
  memoryMB?: number
  /** Custom performance metrics */
  [key: string]: number | undefined
}

/**
 * Environment-specific logging configuration
 */
const getLoggerConfig = () => {
  const isDevelopment = env.NODE_ENV === 'development'
  const isTest = env.NODE_ENV === 'test'

  // Base configuration
  const config: pino.LoggerOptions = {
    name: 'sim-app',
    level: isTest ? 'silent' : isDevelopment ? 'debug' : 'info',

    // Custom serializers for common objects
    serializers: {
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },

    // Add standard fields to every log
    base: {
      pid: process.pid,
      hostname: process.env.VERCEL_REGION || process.env.HOSTNAME || 'unknown',
      environment: env.NODE_ENV,
      version: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    },

    // Timestamp configuration
    timestamp: pino.stdTimeFunctions.isoTime,
  }

  // Development: Pretty printing with colors
  if (isDevelopment) {
    config.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,environment,version',
        messageFormat: '{module} | {msg}',
        customPrettifiers: {
          // Custom formatting for specific fields
          requestId: (requestId: string) => `req:${requestId.slice(0, 8)}`,
          userId: (userId: string) => `user:${userId.slice(0, 8)}`,
          workflowId: (workflowId: string) => `wf:${workflowId.slice(0, 8)}`,
          socketId: (socketId: string) => `sock:${socketId.slice(0, 8)}`,
        },
      },
    }
  }

  return config
}

/**
 * Structured logger class with standardized formatting and sanitization
 */
export class StructuredLogger {
  private pino: pino.Logger
  private module: string
  private defaultContext: LogContext

  constructor(module: string, defaultContext: LogContext = {}) {
    this.module = module
    this.defaultContext = { module, ...defaultContext }

    // Create Pino logger with configuration
    this.pino = pino(getLoggerConfig())

    // Add shutdown handler for graceful cleanup
    if (typeof process !== 'undefined') {
      process.on('exit', () => this.flush())
      process.on('SIGINT', () => this.flush())
      process.on('SIGTERM', () => this.flush())
    }
  }

  /**
   * Creates a child logger with additional context
   */
  child(context: LogContext): StructuredLogger {
    const childLogger = new StructuredLogger(this.module, {
      ...this.defaultContext,
      ...context,
    })
    childLogger.pino = this.pino.child(sanitizeLogData(context))
    return childLogger
  }

  /**
   * Formats and sanitizes log arguments
   */
  private formatLogData(message: string, context?: LogContext, ...args: any[]) {
    const sanitizedContext = context
      ? sanitizeLogData({ ...this.defaultContext, ...context })
      : this.defaultContext
    const sanitizedArgs = args.length > 0 ? sanitizeLogArgs(args) : []

    // If there are additional args, include them in the context
    if (sanitizedArgs.length > 0) {
      sanitizedContext.additionalData = sanitizedArgs
    }

    return {
      msg: message,
      ...sanitizedContext,
    }
  }

  /**
   * Log a trace message (most verbose)
   * Use for detailed tracing information
   */
  trace(message: string, context?: LogContext, ...args: any[]) {
    const logData = this.formatLogData(message, context, ...args)
    this.pino.trace(logData)
  }

  /**
   * Log a debug message
   * Use for detailed debugging information
   */
  debug(message: string, context?: LogContext, ...args: any[]) {
    const logData = this.formatLogData(message, context, ...args)
    this.pino.debug(logData)
  }

  /**
   * Log an info message
   * Use for general operational information
   */
  info(message: string, context?: LogContext, ...args: any[]) {
    const logData = this.formatLogData(message, context, ...args)
    this.pino.info(logData)
  }

  /**
   * Log a warning message
   * Use for potentially problematic situations
   */
  warn(message: string, context?: LogContext, ...args: any[]) {
    const logData = this.formatLogData(message, context, ...args)
    this.pino.warn(logData)
  }

  /**
   * Log an error message
   * Use for error conditions that don't stop the application
   */
  error(message: string, context?: LogContext, ...args: any[]) {
    const logData = this.formatLogData(message, context, ...args)
    this.pino.error(logData)
  }

  /**
   * Log a fatal message
   * Use for severe error conditions that might cause the application to abort
   */
  fatal(message: string, context?: LogContext, ...args: any[]) {
    const logData = this.formatLogData(message, context, ...args)
    this.pino.fatal(logData)
  }

  /**
   * Log with custom level
   */
  logWithLevel(level: LogLevel, message: string, context?: LogContext, ...args: any[]) {
    const logData = this.formatLogData(message, context, ...args)

    // Map our LogLevel enum to Pino's level methods
    switch (level) {
      case LogLevel.TRACE:
        this.pino.trace(logData)
        break
      case LogLevel.DEBUG:
        this.pino.debug(logData)
        break
      case LogLevel.INFO:
        this.pino.info(logData)
        break
      case LogLevel.WARN:
        this.pino.warn(logData)
        break
      case LogLevel.ERROR:
        this.pino.error(logData)
        break
      case LogLevel.FATAL:
        this.pino.fatal(logData)
        break
      default:
        this.pino.info(logData)
    }
  }

  /**
   * Start performance timing
   * Returns a function that when called will log the elapsed time
   */
  startTimer(operation: string, context?: LogContext): () => void {
    const startTime = process.hrtime.bigint()
    const startMemory = process.memoryUsage()

    return () => {
      const endTime = process.hrtime.bigint()
      const endMemory = process.memoryUsage()
      const duration = Number(endTime - startTime) / 1_000_000 // Convert to milliseconds
      const memoryDelta = (endMemory.heapUsed - startMemory.heapUsed) / 1_024 / 1_024 // Convert to MB

      const metrics: PerformanceMetrics = {
        duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
        memoryMB: Math.round(memoryDelta * 100) / 100,
      }

      this.info(`Operation completed: ${operation}`, {
        ...context,
        operation,
        performance: metrics,
      })
    }
  }

  /**
   * Log an HTTP request
   */
  logRequest(req: any, context?: LogContext) {
    this.info('HTTP Request', {
      ...context,
      method: req.method,
      url: req.url,
      userAgent: req.headers?.['user-agent'],
      ip: req.ip || req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress,
    })
  }

  /**
   * Log an HTTP response
   */
  logResponse(res: any, context?: LogContext) {
    this.info('HTTP Response', {
      ...context,
      statusCode: res.statusCode,
      contentLength: res.get?.('content-length'),
    })
  }

  /**
   * Log a database query
   */
  logQuery(query: string, duration?: number, context?: LogContext) {
    this.debug('Database Query', {
      ...context,
      query: query.length > 200 ? `${query.substring(0, 200)}...` : query,
      performance: duration ? { duration } : undefined,
    })
  }

  /**
   * Log an external API call
   */
  logExternalCall(
    url: string,
    method: string,
    statusCode?: number,
    duration?: number,
    context?: LogContext
  ) {
    this.info('External API Call', {
      ...context,
      url,
      method,
      statusCode,
      performance: duration ? { duration } : undefined,
    })
  }

  /**
   * Flush any pending log messages
   */
  flush() {
    this.pino.flush()
  }

  /**
   * Get the underlying Pino logger instance (for advanced usage)
   */
  getPinoInstance(): pino.Logger {
    return this.pino
  }
}

/**
 * Create a structured logger for a specific module
 */
export function createStructuredLogger(
  module: string,
  defaultContext?: LogContext
): StructuredLogger {
  return new StructuredLogger(module, defaultContext)
}

/**
 * Default logger instance for general use
 */
export const logger = createStructuredLogger('sim-app')

/**
 * Convenience function to create a logger with request context
 */
export function createRequestLogger(requestId: string, module?: string): StructuredLogger {
  return createStructuredLogger(module || 'request', { requestId })
}

/**
 * Convenience function to create a logger with user context
 */
export function createUserLogger(userId: string, module?: string): StructuredLogger {
  return createStructuredLogger(module || 'user', { userId })
}

/**
 * Convenience function to create a logger with workflow context
 */
export function createWorkflowLogger(workflowId: string, module?: string): StructuredLogger {
  return createStructuredLogger(module || 'workflow', { workflowId })
}
