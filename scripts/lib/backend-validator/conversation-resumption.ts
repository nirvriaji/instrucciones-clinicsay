/**
 * ConversationResumption — Domain logic for temporal context in chat.
 *
 * Determines how the bot should greet (or not) based on how much time
 * has elapsed since its last message. All thresholds are fixed by the
 * domain; clinics configure only the style instructions in StructuredLogic.
 *
 * Hito thresholds (fixed):
 *   continuous   → ≤ 10 minutes
 *   short_break  → ≤ 100 minutes
 *   same_period  → same calendar day or next calendar day
 *   recent       → up to 14 calendar days (2 weeks)
 *   distant      → > 14 calendar days
 *
 * Reminder override: when the patient is replying to an active reminder,
 * the resumption type is always forced to `continuous` because the patient
 * just received system communication.
 */

import { DateTime } from 'luxon';

export type ConversationResumptionType =
  | 'continuous'
  | 'short_break'
  | 'same_period'
  | 'recent'
  | 'distant';

export type ConversationResumptionConfig = {
  instructions: Partial<Record<ConversationResumptionType, string>>;
};

const MINUTES_CONTINUOUS = 10;
const MINUTES_SHORT_BREAK = 100;
const DAYS_RECENT = 14;

/**
 * Determine the resumption type based on elapsed time.
 *
 * @param lastBotMessageAt - ISO 8601 timestamp of the last bot message (or fallback)
 * @param now              - Current time in the clinic timezone
 * @param isReminderActive - Whether the patient is replying to a live reminder
 */
export function determineResumptionType(
  lastBotMessageAt: DateTime | null,
  now: DateTime,
  isReminderActive: boolean,
): ConversationResumptionType {
  if (isReminderActive) {
    return 'continuous';
  }

  if (!lastBotMessageAt || !lastBotMessageAt.isValid) {
    return 'distant';
  }

  const diffMinutes = Math.floor(now.diff(lastBotMessageAt, 'minutes').minutes);

  if (diffMinutes <= MINUTES_CONTINUOUS) {
    return 'continuous';
  }

  if (diffMinutes <= MINUTES_SHORT_BREAK) {
    return 'short_break';
  }

  const lastDay = lastBotMessageAt.startOf('day');
  const today = now.startOf('day');
  const diffDays = Math.floor(today.diff(lastDay, 'days').days);

  if (diffDays <= 1) {
    return 'same_period';
  }

  if (diffDays <= DAYS_RECENT) {
    return 'recent';
  }

  return 'distant';
}

/**
 * Format a human-readable Spanish phrase for elapsed time.
 * Examples: "hace 3 minutos", "hace 2 horas", "hace 1 día", "hace 14 días",
 *           "hace 1 año y 3 meses".
 */
export function formatTimeSince(
  lastBotMessageAt: DateTime | null,
  now: DateTime,
): string {
  if (!lastBotMessageAt || !lastBotMessageAt.isValid) {
    return 'primera interaccion';
  }

  const diff = now.diff(lastBotMessageAt, ['years', 'months', 'days', 'hours', 'minutes']);
  const years = Math.floor(diff.years ?? 0);
  const months = Math.floor(diff.months ?? 0);
  const days = Math.floor(diff.days ?? 0);
  const hours = Math.floor(diff.hours ?? 0);
  const minutes = Math.floor(diff.minutes ?? 0);

  const parts: string[] = [];

  if (years > 0) {
    parts.push(years === 1 ? '1 año' : `${years} años`);
  }
  if (months > 0) {
    parts.push(months === 1 ? '1 mes' : `${months} meses`);
  }
  if (days > 0 && years === 0) {
    parts.push(days === 1 ? '1 día' : `${days} días`);
  }
  if (hours > 0 && years === 0 && months === 0) {
    parts.push(hours === 1 ? '1 hora' : `${hours} horas`);
  }
  if (minutes > 0 && years === 0 && months === 0 && days === 0) {
    parts.push(minutes === 1 ? '1 minuto' : `${minutes} minutos`);
  }

  if (parts.length === 0) {
    return 'hace un momento';
  }

  return `hace ${parts.join(' y ')}`;
}
