// Request validation middleware using Zod schemas
// Usage: validate(schema)(req, res) or withAuth(validate(schema)(handler))

import { ZodError } from 'zod';

export function validate(schema) {
  return (handler) => async (req, res) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: result.error.flatten(),
      });
    }
    req.validatedBody = result.data;
    return handler(req, res);
  };
}

// Rate limiting (simple in-memory - for production use Redis/Upstash)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per window

export function rateLimit(options = {}) {
  const windowMs = options.windowMs || RATE_LIMIT_WINDOW;
  const max = options.max || RATE_LIMIT_MAX;
  const keyPrefix = options.keyPrefix || 'api';

  return (handler) => async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    const record = rateLimitMap.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + windowMs;
    }

    record.count++;
    rateLimitMap.set(key, record);

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

    if (record.count > max) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }

    return handler(req, res);
  };
}

// Combined middleware: auth + validation + rate limiting
export function withMiddleware(handler, options = {}) {
  const { schema, rateLimit: rlOptions, auth = true } = options;

  let wrapped = handler;

  // Apply rate limiting first
  if (rlOptions !== false) {
    wrapped = rateLimit(rlOptions)(wrapped);
  }

  // Apply validation
  if (schema) {
    wrapped = validate(schema)(wrapped);
  }

  // Apply auth (already handled by withAuth in individual endpoints)
  // This is just a placeholder for future use

  return wrapped;
}