// Comprehensive list of known bot/crawler User-Agent patterns
const BOT_PATTERNS = [
  // Social media crawlers
  /LinkedInBot/i,
  /Twitterbot/i,
  /facebookexternalhit/i,
  /Facebot/i,
  /Slackbot/i,
  /Discordbot/i,
  /WhatsApp/i,
  /TelegramBot/i,
  /Pinterest/i,
  /Pinterestbot/i,

  // Apple/iMessage
  /Applebot/i,
  /iMessageLinkPreviews/i,

  // Search engines
  /Googlebot/i,
  /Google-InspectionTool/i,
  /bingbot/i,
  /Baiduspider/i,
  /YandexBot/i,
  /DuckDuckBot/i,
  /Sogou/i,

  // Other crawlers/bots
  /bot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl/i,
  /wget/i,
  /python-requests/i,
  /PostmanRuntime/i,
  /axios/i,
  /node-fetch/i,
  /Java\//i,
  /HttpClient/i,

  // Preview/unfurl services
  /Embedly/i,
  /Quora Link Preview/i,
  /Outbrain/i,
  /Rogerbot/i,
  /Showyoubot/i,
  /SkypeUriPreview/i,
  /vkShare/i,
  /W3C_Validator/i,
  /redditbot/i,
  /Mediapartners-Google/i,
  /AdsBot-Google/i,

  // Monitoring/uptime
  /UptimeRobot/i,
  /Pingdom/i,
  /StatusCake/i,
];

export function isBot(userAgent: string | undefined): boolean {
  if (!userAgent) {
    return true; // No user agent = likely a bot
  }

  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(userAgent)) {
      return true;
    }
  }

  return false;
}

export function getBotName(userAgent: string | undefined): string | null {
  if (!userAgent) {
    return null;
  }

  const botNames: Record<string, RegExp> = {
    'LinkedIn': /LinkedInBot/i,
    'Twitter': /Twitterbot/i,
    'Facebook': /facebookexternalhit|Facebot/i,
    'Slack': /Slackbot/i,
    'Discord': /Discordbot/i,
    'WhatsApp': /WhatsApp/i,
    'Telegram': /TelegramBot/i,
    'Pinterest': /Pinterest/i,
    'Apple': /Applebot/i,
    'iMessage': /iMessageLinkPreviews/i,
    'Google': /Googlebot|Google-InspectionTool/i,
    'Bing': /bingbot/i,
  };

  for (const [name, pattern] of Object.entries(botNames)) {
    if (pattern.test(userAgent)) {
      return name;
    }
  }

  return null;
}
