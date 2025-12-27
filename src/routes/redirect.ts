import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getActiveLink } from '../db/links.js';
import { recordClick } from '../db/stats.js';
import { detectPlatform } from '../lib/platform.js';
import { isBot } from '../lib/isBot.js';
import { buildWhatsAppUrl, buildAndroidBridgeUrl, extractUtmParams } from '../lib/urlBuilder.js';
import { generatePreviewHtml, generate404Html } from '../lib/preview.js';
import { setSecurityHeaders } from '../lib/security.js';
import { hashIp, getClientIp } from '../lib/hash.js';
import { redirectQuerySchema } from '../lib/validation.js';
import { selectPhoneForClick, recordPhoneClick } from '../services/phoneSelector.js';

// Environment variable for admin phone override
const PHONE_OVERRIDE_KEY = process.env.PHONE_OVERRIDE_KEY || '';

interface RedirectParams {
  slug: string;
}

export async function redirectRoutes(fastify: FastifyInstance) {
  // Main redirect endpoint
  fastify.get<{ Params: RedirectParams; Querystring: Record<string, string> }>(
    '/r/:slug',
    async (request, reply) => {
      return handleRedirect(request, reply, false);
    }
  );

  // Preview endpoint (always shows OG page)
  fastify.get<{ Params: RedirectParams; Querystring: Record<string, string> }>(
    '/preview/:slug',
    async (request, reply) => {
      return handleRedirect(request, reply, true);
    }
  );
}

async function handleRedirect(
  request: FastifyRequest<{ Params: RedirectParams; Querystring: Record<string, string> }>,
  reply: FastifyReply,
  forcePreview: boolean
) {
  setSecurityHeaders(reply);

  const { slug } = request.params;
  const queryResult = redirectQuerySchema.safeParse(request.query);

  if (!queryResult.success) {
    return reply.status(400).send({ error: 'Invalid query parameters' });
  }

  const query = queryResult.data;

  // Fetch link from database
  const link = await getActiveLink(slug);

  if (!link) {
    return reply.status(404).type('text/html').send(generate404Html());
  }

  // Get user agent and detect platform/bot
  const userAgent = request.headers['user-agent'] || '';
  const platform = detectPlatform(userAgent);
  const botDetected = isBot(userAgent);

  // Get client IP for fingerprinting
  const clientIp = getClientIp(request);

  // V2: Phone selection via rotation (for humans)
  // Phone override is ONLY allowed with secret key (for admin testing)
  let phone: string;
  let phoneId: string | null = null;

  const hasValidOverrideKey = PHONE_OVERRIDE_KEY && query.override_key === PHONE_OVERRIDE_KEY;

  if (hasValidOverrideKey && query.phone) {
    // Admin override with secret key
    phone = query.phone;
    phoneId = null;
  } else if (botDetected) {
    // Bots get default phone, no rotation
    phone = link.defaultPhone;
    phoneId = null;
  } else {
    // Human: use phone rotation
    try {
      const selection = await selectPhoneForClick({
        link,
        ip: clientIp,
        userAgent,
        isBot: botDetected,
      });
      phone = selection.phone;
      phoneId = selection.phoneId;
    } catch (err) {
      // Fallback to default phone if rotation fails
      request.log.error({ err }, 'Phone selection failed, using default');
      phone = link.defaultPhone;
      phoneId = null;
    }
  }

  // Text can still be overridden via query param (validated for length/encoding)
  const text = query.text || link.defaultText;
  const utmParams = extractUtmParams(query);

  // Check for force=1 to skip bot page
  const forceRedirect = query.force === '1' || query.force === 'true';

  // Record click (don't await - fire and forget for speed)
  recordClick({
    linkId: link.id,
    platform,
    isBot: botDetected,
    referer: request.headers.referer,
    hashedIp: hashIp(clientIp),
    phoneId, // V2: Track which phone was used
  }).catch((err) => {
    request.log.error({ err }, 'Failed to record click');
  });

  // Record phone stats (don't await)
  if (phoneId && !botDetected) {
    recordPhoneClick(phoneId).catch((err) => {
      request.log.error({ err }, 'Failed to record phone click');
    });
  }

  // If force preview OR (bot detected AND not forcing redirect)
  if (forcePreview || (botDetected && !forceRedirect)) {
    const baseUrl = (process.env.BASE_URL || `${request.protocol}://${request.hostname}`).trim();
    const previewHtml = generatePreviewHtml({
      title: link.ogTitle || link.campaignName,
      description: link.ogDescription || `Connect with us on WhatsApp`,
      image: link.ogImage || undefined,
      url: `${baseUrl}/r/${slug}`,
      continueUrl: `${baseUrl}/r/${slug}?force=1`,
    });

    return reply.status(200).type('text/html').send(previewHtml);
  }

  // Human redirect logic
  const baseUrl = (process.env.BASE_URL || `${request.protocol}://${request.hostname}`).trim();

  switch (platform) {
    case 'ios': {
      const targetUrl = buildWhatsAppUrl({ phone, text, utmParams }, 'ios');
      return reply.status(302).redirect(targetUrl);
    }

    case 'desktop': {
      const targetUrl = buildWhatsAppUrl({ phone, text, utmParams }, 'desktop');
      return reply.status(302).redirect(targetUrl);
    }

    case 'android': {
      // Redirect to internal Android bridge page
      const bridgeUrl = buildAndroidBridgeUrl(baseUrl, slug, phone, text, utmParams);
      return reply.status(302).redirect(bridgeUrl);
    }

    default: {
      // Fallback to wa.me
      const targetUrl = buildWhatsAppUrl({ phone, text, utmParams }, 'ios');
      return reply.status(302).redirect(targetUrl);
    }
  }
}
