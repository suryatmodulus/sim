/**
 * logger.ts
 *
 * Enhanced logging system with automatic structured logging integration.
 *
 * This logger seamlessly combines:
 * - Legacy console logging for client-side/development
 * - High-performance Pino structured logging for server-side/production
 * - Automatic data sanitization for security
 *
 * Usage remains the same - the logger automatically chooses the best approach
 * based on environment (client vs server, dev vs production).
 */
import chalk from 'chalk'
import { env } from '@/lib/env'
import { createStructuredLogger } from '@/lib/logs/structured/logger'

/**
 * LogLevel enum defines the severity levels for logging
 *
 * DEBUG: Detailed information, typically useful only for diagnosing problems
 *        These logs are only shown in development environment
 *
 * INFO: Confirmation that things are working as expected
 *       These logs are shown in both development and production environments
 *
 * WARN: Indication that something unexpected happened, or may happen in the near future
 *       The application can still continue working as expected
 *
 * ERROR: Error events that might still allow the application to continue running
 *        These should be investigated and fixed
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Configuration for different environments
 *
 * enabled: Whether logging is enabled at all
 * minLevel: The minimum log level that will be displayed
 * colorize: Whether to apply color formatting to logs
 * useStructured: Whether to use Pino structured logging (server-side only)
 */
const LOG_CONFIG = {
  development: {
    enabled: true,
    minLevel: LogLevel.DEBUG, // Show all logs in development
    colorize: true,
    useStructured: false, // Use legacy console logging for client-side in dev
  },
  production: {
    enabled: true, // Now enabled for server-side structured logging
    minLevel: LogLevel.INFO, // Show INFO and above in production
    colorize: false,
    useStructured: true, // Use structured logger for server-side
  },
  test: {
    enabled: false, // Disable logs in test environment
    minLevel: LogLevel.ERROR,
    colorize: false,
    useStructured: false,
  },
}

// Get current environment
const ENV = (env.NODE_ENV || 'development') as keyof typeof LOG_CONFIG
const config = LOG_CONFIG[ENV] || LOG_CONFIG.development

// Format objects for logging
const formatObject = (obj: any): string => {
  try {
    if (obj instanceof Error) {
      return JSON.stringify(
        {
          message: obj.message,
          stack: ENV === 'development' ? obj.stack : undefined,
          ...(obj as any),
        },
        null,
        ENV === 'development' ? 2 : 0
      )
    }
    return JSON.stringify(obj, null, ENV === 'development' ? 2 : 0)
  } catch (_error) {
    return '[Circular or Non-Serializable Object]'
  }
}

/**
 * Enhanced Logger class with automatic structured logging
 *
 * Features:
 * - Automatic environment detection (client vs server)
 * - Seamless integration of Pino structured logging for production
 * - Legacy console logging for development and client-side
 * - Built-in data sanitization for security
 * - Same API - no code changes required in existing usage
 */
export class Logger {
  private module: string
  private structuredLogger: ReturnType<typeof createStructuredLogger> | null = null

  /**
   * Create a new logger for a specific module
   * @param module The name of the module (e.g., 'OpenAIProvider', 'AgentBlockHandler')
   */
  constructor(module: string) {
    this.module = module

    // Initialize structured logger for server-side usage
    const isServerSide = typeof window === 'undefined'
    if (isServerSide && config.useStructured) {
      this.structuredLogger = createStructuredLogger(module)
    }
  }

  /**
   * Check if logging should be enabled based on environment and client/server context
   */
  private shouldLogInEnvironment(): boolean {
    const isServerSide = typeof window === 'undefined'

    // In production: only log on server-side, never on client-side
    if (ENV === 'production') {
      return isServerSide
    }

    // In development/test: follow config.enabled
    return config.enabled
  }

  /**
   * Determines if a log at the given level should be displayed
   * based on the current environment configuration
   *
   * @param level The log level to check
   * @returns boolean indicating whether the log should be displayed
   */
  private shouldLog(level: LogLevel): boolean {
    // First check environment-specific rules
    if (!this.shouldLogInEnvironment()) return false

    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    const minLevelIndex = levels.indexOf(config.minLevel)
    const currentLevelIndex = levels.indexOf(level)

    return currentLevelIndex >= minLevelIndex
  }

  /**
   * Format arguments for logging, converting objects to JSON strings
   *
   * @param args Arguments to format
   * @returns Formatted arguments
   */
  private formatArgs(args: any[]): any[] {
    return args.map((arg) => {
      if (arg === null || arg === undefined) return arg
      if (typeof arg === 'object') return formatObject(arg)
      return arg
    })
  }

  /**
   * Internal method to log a message with the specified level
   *
   * @param level The severity level of the log
   * @param message The main log message
   * @param args Additional arguments to log
   */
  private log(level: LogLevel, message: string, ...args: any[]) {
    if (!this.shouldLog(level)) return

    const timestamp = new Date().toISOString()
    const formattedArgs = this.formatArgs(args)

    // Color configuration
    if (config.colorize) {
      let levelColor
      const moduleColor = chalk.cyan
      const timestampColor = chalk.gray

      switch (level) {
        case LogLevel.DEBUG:
          levelColor = chalk.blue
          break
        case LogLevel.INFO:
          levelColor = chalk.green
          break
        case LogLevel.WARN:
          levelColor = chalk.yellow
          break
        case LogLevel.ERROR:
          levelColor = chalk.red
          break
      }

      const coloredPrefix = `${timestampColor(`[${timestamp}]`)} ${levelColor(`[${level}]`)} ${moduleColor(`[${this.module}]`)}`

      if (level === LogLevel.ERROR) {
        console.error(coloredPrefix, message, ...formattedArgs)
      } else {
        console.log(coloredPrefix, message, ...formattedArgs)
      }
    } else {
      // No colors in production
      const prefix = `[${timestamp}] [${level}] [${this.module}]`

      if (level === LogLevel.ERROR) {
        console.error(prefix, message, ...formattedArgs)
      } else {
        console.log(prefix, message, ...formattedArgs)
      }
    }
  }

  /**
   * Log a debug message
   *
   * Use for detailed information useful during development and debugging.
   * These logs are only shown in development environment.
   *
   * Examples:
   * - Variable values during execution
   * - Function entry/exit points
   * - Detailed request/response data
   *
   * @param message The message to log
   * @param args Additional arguments to log
   */
  debug(message: string, ...args: any[]) {
    if (this.structuredLogger) {
      // Server-side: use structured logger
      this.structuredLogger.debug(message, {}, ...args)
    } else {
      // Client-side: use legacy console (disabled in production)
      this.log(LogLevel.DEBUG, message, ...args)
    }
  }

  /**
   * Log an info message
   *
   * Use for general information about application operation.
   * These logs are shown in both development and production environments.
   *
   * Examples:
   * - Application startup/shutdown
   * - Configuration information
   * - Successful operations
   *
   * @param message The message to log
   * @param args Additional arguments to log
   */
  info(message: string, ...args: any[]) {
    if (this.structuredLogger) {
      // Server-side: use structured logger
      this.structuredLogger.info(message, {}, ...args)
    } else {
      // Client-side: use legacy console (disabled in production)
      this.log(LogLevel.INFO, message, ...args)
    }
  }

  /**
   * Log a warning message
   *
   * Use for potentially problematic situations that don't cause operation failure.
   *
   * Examples:
   * - Deprecated feature usage
   * - Suboptimal configurations
   * - Recoverable errors
   *
   * @param message The message to log
   * @param args Additional arguments to log
   */
  warn(message: string, ...args: any[]) {
    if (this.structuredLogger) {
      // Server-side: use structured logger
      this.structuredLogger.warn(message, {}, ...args)
    } else {
      // Client-side: use legacy console (disabled in production)
      this.log(LogLevel.WARN, message, ...args)
    }
  }

  /**
   * Log an error message
   *
   * Use for error events that might still allow the application to continue.
   *
   * Examples:
   * - API call failures
   * - Operation failures
   * - Unexpected exceptions
   *
   * @param message The message to log
   * @param args Additional arguments to log
   */
  error(message: string, ...args: any[]) {
    if (this.structuredLogger) {
      // Server-side: use structured logger
      this.structuredLogger.error(message, {}, ...args)
    } else {
      // Client-side: use legacy console (disabled in production)
      this.log(LogLevel.ERROR, message, ...args)
    }
  }
}

/**
 * Create a logger for a specific module
 *
 * This creates an enhanced logger that automatically:
 * - Uses structured logging (Pino) on server-side in production
 * - Uses console logging on client-side and in development
 * - Sanitizes sensitive data automatically
 *
 * Usage example:
 * ```
 * import { createLogger } from '@/lib/logs/console/logger'
 *
 * const logger = createLogger('MyComponent')
 *
 * logger.debug('Initializing component', { props })
 * logger.info('Component mounted')
 * logger.warn('Deprecated prop used', { propName })
 * logger.error('Failed to fetch data', error)
 * ```
 *
 * @param module The name of the module (e.g., 'OpenAIProvider', 'AgentBlockHandler')
 * @returns Enhanced Logger instance with automatic structured logging
 */
export function createLogger(module: string): Logger {
  return new Logger(module)
}

/**
 * Export sanitization utilities for manual usage
 */
export {
  containsSensitiveData,
  sanitizeLogArgs,
  sanitizeLogData,
} from '@/lib/logs/sanitizer'
/**
 * Export structured logger components for advanced usage
 *
 * Use these when you need direct access to structured logging features:
 * - Performance timing
 * - Custom context management
 * - Specialized log formatting
 */
export {
  createRequestLogger,
  createStructuredLogger,
  createUserLogger,
  createWorkflowLogger,
  type LogContext,
  type PerformanceMetrics,
  StructuredLogger,
} from '@/lib/logs/structured/logger'
