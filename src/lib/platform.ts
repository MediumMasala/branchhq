export type Platform = 'ios' | 'android' | 'desktop';

const IOS_PATTERNS = [
  /iPhone/i,
  /iPad/i,
  /iPod/i,
];

const ANDROID_PATTERNS = [
  /Android/i,
];

export function detectPlatform(userAgent: string | undefined): Platform {
  if (!userAgent) {
    return 'desktop';
  }

  // Check iOS first (iPhone, iPad, iPod)
  for (const pattern of IOS_PATTERNS) {
    if (pattern.test(userAgent)) {
      return 'ios';
    }
  }

  // Check Android
  for (const pattern of ANDROID_PATTERNS) {
    if (pattern.test(userAgent)) {
      return 'android';
    }
  }

  // Default to desktop
  return 'desktop';
}

export function isMobile(platform: Platform): boolean {
  return platform === 'ios' || platform === 'android';
}
