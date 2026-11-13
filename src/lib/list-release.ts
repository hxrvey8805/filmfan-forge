export type ReleaseDate = { date: string; precision: "day" | "month" | "year" };

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Preserve catalogue precision; a year-only date is not January 1st. */
export function catalogueReleaseDate(value: string, precision: number): ReleaseDate | null {
  const m = /^\+?(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!m || +m[1] < 1800 || +m[1] > 2999 || ![9, 10, 11].includes(precision)) return null;
  const month = precision === 9 ? 1 : +m[2], day = precision === 11 ? +m[3] : 1;
  const date = new Date(Date.UTC(+m[1], month - 1, day));
  if (date.getUTCFullYear() !== +m[1] || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { date: date.toISOString().slice(0, 10), precision: precision === 9 ? "year" : precision === 10 ? "month" : "day" };
}

/** First release anywhere, not streaming availability or a show's next season. */
export function upcomingRelease(dates: ReleaseDate[] | undefined, today = localDateKey()): boolean | null {
  if (!dates?.length) return null;
  let uncertain = false;
  for (const release of dates) {
    const valid = catalogueReleaseDate(release.date, {year:9,month:10,day:11}[release.precision]);
    if (!valid) { uncertain = true; continue; }
    const start = valid.date;
    const end = valid.precision === "year" ? start.slice(0, 4) + "-12-31"
      : valid.precision === "month" ? new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7), 0)).toISOString().slice(0, 10) : start;
    // An earlier release outweighs a later regional release or rerelease.
    if (end <= today) return false;
    if (start <= today) uncertain = true;
  }
  return uncertain ? null : true;
}
