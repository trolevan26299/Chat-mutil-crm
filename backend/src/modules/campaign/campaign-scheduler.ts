/**
 * Campaign Scheduler — checks every minute for campaigns due to run.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { enqueueCampaign } from './campaign-runner.js';

let schedulerInterval: NodeJS.Timeout | null = null;

export function startCampaignScheduler() {
  if (schedulerInterval) return;
  logger.info('Campaign scheduler started');
  schedulerInterval = setInterval(runSchedulerTick, 60_000);
  // Also run once immediately on startup
  runSchedulerTick();
}

export function stopCampaignScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

async function runSchedulerTick() {
  try {
    const now = new Date();
    const dueCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'active',
        nextRunAt: { lte: now },
      },
      include: { group: true },
    });

    for (const campaign of dueCampaigns) {
      logger.info(`Scheduling campaign "${campaign.title}" (${campaign.id})`);
      enqueueCampaign(campaign as any).catch((err: any) => {
        logger.error(`Campaign enqueue failed: ${campaign.id}`, err);
      });

      // Calculate next run
      let nextRunAt: Date | null = null;
      if (campaign.isRecurring && campaign.scheduleType !== 'once') {
        nextRunAt = calcNextRun({
          scheduleType: campaign.scheduleType,
          scheduleTime: campaign.scheduleTime,
          scheduleValue: campaign.scheduleValue,
        });
      }

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          lastRunAt: now,
          nextRunAt,
          status: nextRunAt ? 'active' : 'completed',
        },
      });
    }
  } catch (err) {
    logger.error('Campaign scheduler tick error:', err);
  }
}

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7

/** Returns current moment expressed as if we were in UTC+7 (local-like Date object). */
function nowVN(): Date {
  return new Date(Date.now() + TZ_OFFSET_MS);
}

/** Build a UTC Date from a Vietnam local date+time (YYYY-MM-DD, HH:MM). */
function vnLocalToUTC(dateStr: string, hh: number, mm: number): Date {
  // Parse YYYY-MM-DD as UTC midnight, then add hours/minutes + subtract the VN offset
  const utcMidnight = new Date(`${dateStr}T00:00:00.000Z`);
  return new Date(utcMidnight.getTime() + hh * 3_600_000 + mm * 60_000 - TZ_OFFSET_MS);
}

/** Build a UTC Date for "today in VN + given HH:MM". */
function vnTodayAtUTC(refVN: Date, hh: number, mm: number): Date {
  // refVN is a shifted Date (UTC+7), so its UTC day = VN day. Format the date part.
  const yyyy = refVN.getUTCFullYear();
  const mo   = String(refVN.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(refVN.getUTCDate()).padStart(2, '0');
  return vnLocalToUTC(`${yyyy}-${mo}-${dd}`, hh, mm);
}

/**
 * Calculate the next run date given schedule settings (all times in UTC+7).
 * Returns null if scheduleType=once and target is in the past.
 */
export function calcNextRun(opts: {
  scheduleType?: string | null;
  scheduleTime?: string | null;
  scheduleValue?: string | null;
}): Date | null {
  const { scheduleType, scheduleTime, scheduleValue } = opts;
  const [hh, mm] = (scheduleTime || '08:00').split(':').map(Number);
  const nowUtc = new Date();

  if (scheduleType === 'once') {
    if (!scheduleValue) return null;
    const target = vnLocalToUTC(scheduleValue, hh, mm);
    return target > nowUtc ? target : null;
  }

  const vnNow = nowVN(); // current moment shifted to VN local

  if (scheduleType === 'daily') {
    let target = vnTodayAtUTC(vnNow, hh, mm);
    if (target <= nowUtc) target = new Date(target.getTime() + 86_400_000);
    return target;
  }

  if (scheduleType === 'weekly') {
    const targetDay = parseInt(scheduleValue || '1'); // 0=Sun..6=Sat
    const todayVN   = vnNow.getUTCDay(); // VN day-of-week
    let daysUntil   = (targetDay - todayVN + 7) % 7;
    let target = vnTodayAtUTC(vnNow, hh, mm);
    if (daysUntil > 0) {
      target = new Date(target.getTime() + daysUntil * 86_400_000);
    } else if (target <= nowUtc) {
      target = new Date(target.getTime() + 7 * 86_400_000);
    }
    return target;
  }

  if (scheduleType === 'monthly') {
    const targetDate = parseInt(scheduleValue || '1');
    // Try this month
    const yyyy = vnNow.getUTCFullYear();
    const mo   = String(vnNow.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(targetDate).padStart(2, '0');
    let target = vnLocalToUTC(`${yyyy}-${mo}-${dd}`, hh, mm);
    if (target <= nowUtc) {
      // Next month
      const nextMonth = new Date(vnNow.getTime());
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const mo2 = String(nextMonth.getUTCMonth() + 1).padStart(2, '0');
      target = vnLocalToUTC(`${nextMonth.getUTCFullYear()}-${mo2}-${dd}`, hh, mm);
    }
    return target;
  }

  return null;
}
