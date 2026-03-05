const SHANGHAI_TZ = "Asia/Shanghai";

function getShanghaiParts(input: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
} {
  const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false
  });

  const parts = dateTimeFormat.formatToParts(input);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
    hour: Number(map.get("hour")),
    minute: Number(map.get("minute")),
    second: Number(map.get("second")),
    weekday: weekdayMap[map.get("weekday") ?? "Mon"]
  };
}

export function nowInShanghai(): Date {
  return new Date();
}

export function formatDate(input: Date): string {
  const parts = getShanghaiParts(input);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getShanghaiYear(input: Date): number {
  return getShanghaiParts(input).year;
}

export function getShanghaiWeekday(input: Date): number {
  return getShanghaiParts(input).weekday;
}

export function isTradingDay(input: Date): boolean {
  const weekday = getShanghaiWeekday(input);
  return weekday !== 0 && weekday !== 6;
}

export function isTradingTime(input: Date): boolean {
  const parts = getShanghaiParts(input);
  if (!isTradingDay(input)) {
    return false;
  }

  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= 9 * 60 + 30 && minutes <= 15 * 60;
}

export function getBucketSeconds(input: Date): number {
  return isTradingTime(input) ? 30 : 30 * 60;
}

export function floorToBucketIso(input: Date, bucketSeconds: number): string {
  const ms = input.getTime();
  const bucketMs = bucketSeconds * 1000;
  const floored = Math.floor(ms / bucketMs) * bucketMs;
  return new Date(floored).toISOString();
}

export function daysBetween(older: string, newer: Date): number {
  const oldDate = new Date(`${older}T00:00:00.000Z`);
  const diff = newer.getTime() - oldDate.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

export function secondsStaleness(referenceIso: string, now: Date): number {
  const diffMs = now.getTime() - new Date(referenceIso).getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}
