const TZ = "America/Bogota";

/** Clave de día AAAA-MM-DD en hora de Colombia, para agrupar ventas por día. */
export function dayKey(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

export function lastNDays(n: number, now = new Date()): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(dayKey(new Date(now.getTime() - i * 86400000)));
  }
  return days;
}

const timeFmt = new Intl.DateTimeFormat("es-CO", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("es-CO", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const weekdayFmt = new Intl.DateTimeFormat("es-CO", { timeZone: TZ, weekday: "short" });

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

/** "lun", "mar"... a partir de una clave de día. */
export function weekdayLabel(key: string): string {
  return weekdayFmt.format(new Date(`${key}T12:00:00-05:00`)).replace(".", "");
}

export function daysBetween(fromIso: string, to = new Date()): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86400000);
}
