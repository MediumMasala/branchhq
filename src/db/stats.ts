import type { Platform } from '../lib/platform.js';
import prisma from './client.js';

export interface ClickData {
  linkId: string;
  platform: Platform;
  isBot: boolean;
  referer?: string;
  hashedIp?: string;
}

export async function recordClick(data: ClickData): Promise<void> {
  const { linkId, platform, isBot, referer, hashedIp } = data;

  // Build the increment object based on platform and bot status
  const increment: Record<string, { increment: number }> = {
    totalClicks: { increment: 1 },
  };

  if (!isBot) {
    increment.humanClicks = { increment: 1 };

    switch (platform) {
      case 'ios':
        increment.iosClicks = { increment: 1 };
        break;
      case 'android':
        increment.androidClicks = { increment: 1 };
        break;
      case 'desktop':
        increment.desktopClicks = { increment: 1 };
        break;
    }
  }

  // Use a transaction to update stats and optionally create click event
  await prisma.$transaction(async (tx) => {
    // Upsert stats record
    await tx.linkStats.upsert({
      where: { linkId },
      create: {
        linkId,
        totalClicks: 1,
        humanClicks: isBot ? 0 : 1,
        iosClicks: !isBot && platform === 'ios' ? 1 : 0,
        androidClicks: !isBot && platform === 'android' ? 1 : 0,
        desktopClicks: !isBot && platform === 'desktop' ? 1 : 0,
        lastClickAt: new Date(),
      },
      update: {
        ...increment,
        lastClickAt: new Date(),
      },
    });

    // Create click event for detailed logging (optional, can be disabled for high-traffic)
    if (process.env.ENABLE_CLICK_EVENTS !== 'false') {
      await tx.clickEvent.create({
        data: {
          linkId,
          platform,
          isBot,
          referer: referer?.slice(0, 500), // Truncate long referers
          hashedIp,
        },
      });
    }
  });
}

export async function getStats(linkId: string) {
  return prisma.linkStats.findUnique({
    where: { linkId },
  });
}

export async function getRecentClicks(linkId: string, limit = 100) {
  return prisma.clickEvent.findMany({
    where: { linkId },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}
