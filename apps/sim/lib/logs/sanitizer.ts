/**
 * Data sanitization utilities for logging
 *
 * Provides functions to sanitize sensitive data from log outputs while
 * preserving debugging information and maintaining log readability.
 */

/**
 * Patterns for identifying sensitive data that should be masked in logs
 */
const SENSITIVE_PATTERNS = [
  // Bearer tokens
  {
    pattern: /Bearer\s+[A-Za-z0-9._-]+/gi,
    replacement: 'Bearer [REDACTED]',
    description: 'Bearer tokens',
  },

  // API keys (various formats)
  {
    pattern: /\bsk-[A-Za-z0-9]{20,}/g,
    replacement: 'sk-[REDACTED]',
    description: 'OpenAI/Stripe-style API keys',
  },

  // Generic API keys in various formats
  {
    pattern: /\b(?:api_key|apikey|api-key)\s*[=:]\s*["']?[A-Za-z0-9._-]{16,}["']?/gi,
    replacement: (match: string) => match.replace(/[A-Za-z0-9._-]{16,}/g, '[REDACTED]'),
    description: 'Generic API keys',
  },

  // Password fields (but not the word "password" itself)
  {
    pattern: /(?:password|secret|key)\s*[=:]\s*["'][^"']{2,}["']/gi,
    replacement: (match: string) => match.replace(/["'][^"']{2,}["']/, '"[REDACTED]"'),
    description: 'Password/secret fields',
  },

  // JWT tokens
  {
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
    replacement: 'eyJ[REDACTED_JWT]',
    description: 'JWT tokens',
  },

  // Database connection strings (partial masking)
  {
    pattern: /(postgresql:\/\/[^:]+:)[^@]+(@[^/]+)/gi,
    replacement: '$1[REDACTED]$2',
    description: 'Database connection strings',
  },
]

/**
 * Sanitizes a string by masking sensitive patterns
 */
function sanitizeString(input: string): string {
  let result = input

  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    if (typeof replacement === 'function') {
      result = result.replace(pattern, replacement as any)
    } else {
      result = result.replace(pattern, replacement)
    }
  }

  return result
}

/**
 * Recursively sanitizes an object, preserving structure while masking sensitive data
 */
function sanitizeObject(obj: any, maxDepth = 10): any {
  if (maxDepth <= 0) return '[MAX_DEPTH_REACHED]'

  if (obj === null || obj === undefined) return obj

  // Handle primitive types
  if (typeof obj === 'string') {
    return sanitizeString(obj)
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj
  }

  // Handle Error objects specially
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: sanitizeString(obj.message),
      stack: process.env.NODE_ENV === 'development' ? sanitizeString(obj.stack || '') : undefined,
      ...sanitizeObject(
        Object.getOwnPropertyNames(obj).reduce((acc, key) => {
          if (key !== 'name' && key !== 'message' && key !== 'stack') {
            acc[key] = (obj as any)[key]
          }
          return acc
        }, {} as any),
        maxDepth - 1
      ),
    }
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return obj.toISOString()
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, maxDepth - 1))
  }

  // Handle plain objects
  if (typeof obj === 'object') {
    const sanitized: any = {}

    for (const [key, value] of Object.entries(obj)) {
      // Skip circular references and functions
      if (typeof value === 'function') continue

      try {
        sanitized[key] = sanitizeObject(value, maxDepth - 1)
      } catch (error) {
        // Handle circular references
        sanitized[key] = '[CIRCULAR_REFERENCE]'
      }
    }

    return sanitized
  }

  return obj
}

/**
 * Main sanitization function for log data
 *
 * @param data - The data to sanitize (can be any type)
 * @returns Sanitized version of the data safe for logging
 */
export function sanitizeLogData(data: any): any {
  try {
    return sanitizeObject(data)
  } catch (error) {
    // Fallback for any sanitization errors
    return {
      _sanitization_error: true,
      _original_type: typeof data,
      _error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Sanitizes multiple arguments (like those passed to logger methods)
 *
 * @param args - Array of arguments to sanitize
 * @returns Array of sanitized arguments
 */
export function sanitizeLogArgs(args: any[]): any[] {
  return args.map((arg) => sanitizeLogData(arg))
}

/**
 * Checks if a string contains potentially sensitive data
 *
 * @param input - String to check
 * @returns true if sensitive patterns are detected
 */
export function containsSensitiveData(input: string): boolean {
  return SENSITIVE_PATTERNS.some(({ pattern }) => pattern.test(input))
}

/**
 * Get information about what patterns were detected (for debugging)
 *
 * @param input - String to analyze
 * @returns Array of pattern descriptions that matched
 */
export function detectSensitivePatterns(input: string): string[] {
  return SENSITIVE_PATTERNS.filter(({ pattern }) => pattern.test(input)).map(
    ({ description }) => description
  )
}
