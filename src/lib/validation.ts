import { z } from 'zod';

// Slug validation: alphanumeric, hyphens, underscores, 1-100 chars
export const slugSchema = z
  .string()
  .min(1, 'Slug is required')
  .max(100, 'Slug must be 100 characters or less')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Slug can only contain letters, numbers, hyphens, and underscores');

// Phone number validation: digits only (after cleaning), 7-15 digits
export const phoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .transform((val) => val.replace(/[^\d+]/g, '').replace(/^\+/, ''))
  .refine((val) => val.length >= 7 && val.length <= 15, {
    message: 'Phone number must be between 7 and 15 digits',
  });

// Query params schema for redirect
export const redirectQuerySchema = z.object({
  phone: z.string().optional(),
  text: z.string().optional(),
  force: z.enum(['1', 'true']).optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
}).passthrough(); // Allow other utm_* params

// Link creation/update schema
export const linkSchema = z.object({
  slug: slugSchema,
  campaignName: z.string().min(1, 'Campaign name is required').max(200),
  defaultPhone: z.string().min(1, 'Phone number is required'),
  defaultText: z.string().max(2000).default(''),
  isActive: z.boolean().default(true),
  ogTitle: z.string().max(200).optional().nullable(),
  ogDescription: z.string().max(500).optional().nullable(),
  ogImage: z.string().url().optional().nullable().or(z.literal('')),
});

export const linkUpdateSchema = linkSchema.partial().extend({
  slug: slugSchema.optional(),
});

// Android bridge query params
export const androidBridgeQuerySchema = z.object({
  phone: z.string().min(1, 'Phone is required'),
  text: z.string().default(''),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
}).passthrough();

export type LinkInput = z.infer<typeof linkSchema>;
export type LinkUpdateInput = z.infer<typeof linkUpdateSchema>;
export type RedirectQuery = z.infer<typeof redirectQuerySchema>;
export type AndroidBridgeQuery = z.infer<typeof androidBridgeQuerySchema>;

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export function validateAndSanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Only allow http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
