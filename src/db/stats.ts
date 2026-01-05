import type { Platform } from '../lib/platform.js';
import prisma from './client.js';

export interface ClickData {
  linkId: string;
  platform: Platform;
  isBot: boolean;
  referer?: string;
  hashedIp?: string;
  phoneId?: string | null; // V2: Track which phone was used
}

export async function recordClick(data: ClickData): Promise<void> {
  const { linkId, platform, isBot, referer, hashedIp, phoneId } = data;

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
          phoneId: phoneId || undefined, // V2: Track which phone was used
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

// V3: Record Android retry click (manual button tap on bridge page)
export async function recordAndroidRetryClick(linkId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Update aggregated stats
    await tx.linkStats.upsert({
      where: { linkId },
      create: {
        linkId,
        totalClicks: 0,
        humanClicks: 0,
        iosClicks: 0,
        androidClicks: 0,
        desktopClicks: 0,
        androidRetryClicks: 1,
      },
      update: {
        androidRetryClicks: { increment: 1 },
      },
    });

    // Also create a ClickEvent for date-based filtering
    if (process.env.ENABLE_CLICK_EVENTS !== 'false') {
      await tx.clickEvent.create({
        data: {
          linkId,
          platform: 'android',
          isBot: false,
          isRetryClick: true,
        },
      });
    }
  });
}

// V3: Get stats filtered by date range (for dashboard filtering)
export interface DateFilteredStats {
  totalClicks: number;
  humanClicks: number;
  iosClicks: number;
  androidClicks: number;
  desktopClicks: number;
  androidRetryClicks: number;
}

export async function getStatsForDateRange(
  linkId: string,
  startDate: Date,
  endDate: Date
): Promise<DateFilteredStats> {
  const [clickStats, retryStats] = await Promise.all([
    // Get regular click stats
    prisma.clickEvent.groupBy({
      by: ['platform', 'isBot'],
      where: {
        linkId,
        timestamp: {
          gte: startDate,
          lt: endDate,
        },
        isRetryClick: false,
      },
      _count: true,
    }),
    // Get retry click count
    prisma.clickEvent.count({
      where: {
        linkId,
        timestamp: {
          gte: startDate,
          lt: endDate,
        },
        isRetryClick: true,
      },
    }),
  ]);

  // Aggregate the results
  let totalClicks = 0;
  let humanClicks = 0;
  let iosClicks = 0;
  let androidClicks = 0;
  let desktopClicks = 0;

  for (const group of clickStats) {
    const count = group._count;
    totalClicks += count;

    if (!group.isBot) {
      humanClicks += count;
      if (group.platform === 'ios') iosClicks += count;
      else if (group.platform === 'android') androidClicks += count;
      else if (group.platform === 'desktop') desktopClicks += count;
    }
  }

  return {
    totalClicks,
    humanClicks,
    iosClicks,
    androidClicks,
    desktopClicks,
    androidRetryClicks: retryStats,
  };
}

// V3: Get stats for all links filtered by date range (for admin list page)
export async function getAllLinksStatsForDateRange(
  startDate: Date,
  endDate: Date
): Promise<Map<string, DateFilteredStats>> {
  // Get all click events in the date range, grouped by linkId
  const [clickStats, retryStats] = await Promise.all([
    prisma.clickEvent.groupBy({
      by: ['linkId', 'platform', 'isBot'],
      where: {
        timestamp: {
          gte: startDate,
          lt: endDate,
        },
        isRetryClick: false,
      },
      _count: true,
    }),
    prisma.clickEvent.groupBy({
      by: ['linkId'],
      where: {
        timestamp: {
          gte: startDate,
          lt: endDate,
        },
        isRetryClick: true,
      },
      _count: true,
    }),
  ]);

  // Build a map of linkId -> stats
  const statsMap = new Map<string, DateFilteredStats>();

  // Process regular clicks
  for (const group of clickStats) {
    const linkId = group.linkId;
    const count = group._count;

    if (!statsMap.has(linkId)) {
      statsMap.set(linkId, {
        totalClicks: 0,
        humanClicks: 0,
        iosClicks: 0,
        androidClicks: 0,
        desktopClicks: 0,
        androidRetryClicks: 0,
      });
    }

    const stats = statsMap.get(linkId)!;
    stats.totalClicks += count;

    if (!group.isBot) {
      stats.humanClicks += count;
      if (group.platform === 'ios') stats.iosClicks += count;
      else if (group.platform === 'android') stats.androidClicks += count;
      else if (group.platform === 'desktop') stats.desktopClicks += count;
    }
  }

  // Process retry clicks
  for (const group of retryStats) {
    const linkId = group.linkId;
    const count = group._count;

    if (!statsMap.has(linkId)) {
      statsMap.set(linkId, {
        totalClicks: 0,
        humanClicks: 0,
        iosClicks: 0,
        androidClicks: 0,
        desktopClicks: 0,
        androidRetryClicks: 0,
      });
    }

    statsMap.get(linkId)!.androidRetryClicks = count;
  }

  return statsMap;
}
