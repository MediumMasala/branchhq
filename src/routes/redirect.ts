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

  // Determine phone and text (with query overrides)
  const phone = query.phone || link.defaultPhone;
  const text = query.text || link.defaultText;
  const utmParams = extractUtmParams(query);

  // Get user agent and detect platform/bot
  const userAgent = request.headers['user-agent'];
  const platform = detectPlatform(userAgent);
  const botDetected = isBot(userAgent);

  // Check for force=1 to skip bot page
  const forceRedirect = query.force === '1' || query.force === 'true';

  // Record click (don't await - fire and forget for speed)
  const clientIp = getClientIp(request);
  recordClick({
    linkId: link.id,
    platform,
    isBot: botDetected,
    referer: request.headers.referer,
    hashedIp: hashIp(clientIp),
  }).catch((err) => {
    request.log.error({ err }, 'Failed to record click');
  });

  // If force preview OR (bot detected AND not forcing redirect)
  if (forcePreview || (botDetected && !forceRedirect)) {
    const baseUrl = process.env.BASE_URL || `${request.protocol}://${request.hostname}`;
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
  const baseUrl = process.env.BASE_URL || `${request.protocol}://${request.hostname}`;

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
