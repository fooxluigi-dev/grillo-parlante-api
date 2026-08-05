// Request validation middleware using Zod schemas
// Uses standard Web API types (compatible with Vercel serverless)
import { ZodSchema } from 'zod';

export interface ValidatedRequest extends Request {
  validatedBody?: unknown;
}

// Minimal response interface for Vercel serverless functions
export interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string | number): void;
  end(): void;
}

export function validate<T>(schema: ZodSchema<T>) {
  return (handler: (req: ValidatedRequest, res: VercelResponse) => Promise<void>) => {
    return async (req: ValidatedRequest, res: VercelResponse) => {
      // Parse body if it's a string
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }
      
      const result = schema.safeParse(body);
      if (!result.success) {
        res.status(400).json({
          error: 'Invalid request body',
          details: result.error.flatten(),
        });
        return;
      }
      req.validatedBody = result.data;
      return handler(req, res);
    };
  };
}

// Rate limiting (simple in-memory - for production use Redis/Upstash)
interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per window

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyPrefix?: string;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW;
  const max = options.max ?? RATE_LIMIT_MAX;
  const keyPrefix = options.keyPrefix ?? 'api';

  return (handler: (req: Request, res: VercelResponse) => Promise<void>) => {
    return async (req: Request, res: VercelResponse) => {
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
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
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((record.resetTime - now) / 1000),
        });
        return;
      }

      return handler(req, res);
    };
  };
}

// Combined middleware: auth + validation + rate limiting
export function withMiddleware(
  handler: (req: Request, res: VercelResponse) => Promise<void>,
  options: { schema?: ZodSchema; rateLimit?: RateLimitOptions | false; auth?: boolean } = {}
) {
  const { schema, rateLimit: rlOptions, auth = true } = options;

  let wrapped = handler;

  // Apply rate limiting first
  if (rlOptions !== false) {
    wrapped = rateLimit(rlOptions ?? {})(wrapped);
  }

  // Apply validation
  if (schema) {
    wrapped = validate(schema)(wrapped);
  }

  // Apply auth (already handled by withAuth in individual endpoints)
  // This is just a placeholder for future use

  return wrapped;
}