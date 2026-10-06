import type { AssignmentPlan } from "./assignments.ts";
const formatters = new Map<string, Intl.DateTimeFormat>();
const hour = 3600000;
function formatter(zone: string) {
  if (zone !== "UTC" && !/^[A-Za-z0-9_+.-]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(zone))
    throw new RangeError("Use UTC or a named IANA region timezone");
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, calendar: "iso8601", numberingSystem: "latn",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    if (formatters.size >= 32) formatters.delete(formatters.keys().next().value!);
    formatters.set(zone, f);
  }
  return f;
}
function parts(ms: number, zone: string) {
  const p = Object.fromEntries(formatter(zone).formatToParts(ms).map(p => [p.type, p.value]));
  return {year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
    millisecond: new Date(ms).getUTCMilliseconds()};
}
function wall(p: ReturnType<typeof parts>) {
  const d = new Date(0);
  d.setUTCFullYear(p.year, p.month - 1, p.day);
  d.setUTCHours(p.hour, p.minute, p.second, p.millisecond);
  return d.getTime();
}
export function calendarMonth(anchor: string, months: number, zone: string, choice: "earlier" | "later") {
  const base = Date.parse(anchor);
  if (!Number.isFinite(base) || !Number.isInteger(months) || months < 0 ||
      !["earlier", "later"].includes(choice)) throw new RangeError("Invalid calendar recurrence");
  const initial = parts(base, zone), absolute = initial.year * 12 + initial.month - 1 + months;
  const year = Math.floor(absolute / 12), month = absolute % 12 + 1;
  if (initial.year < 1970 || year > 9998) throw new RangeError("Calendar recurrence supports years 1970 to 9998");
  if (months === 0) return anchor; // The first instant is explicit, including a fold.
  const end = new Date(0); end.setUTCFullYear(year, month, 0);
  const desired = {...initial, year, month, day: Math.min(initial.day, end.getUTCDate())};
  const target = wall(desired), offsets = new Set<number>();
  // Both sides of transitions, including half-hour and skipped-day changes.
  for (let delta = -48; delta <= 48; delta += 6) {
    const sample = target + delta * hour; offsets.add(wall(parts(sample, zone)) - sample);
  }
  const candidates = [...offsets].map(offset => target - offset).sort((a, b) => a - b);
  const exact = candidates.filter(candidate => wall(parts(candidate, zone)) === target);
  if (exact.length) return new Date(choice === "earlier" ? exact[0]! : exact.at(-1)!).toISOString();
  // A missing local time advances by the gap, retaining minutes/seconds.
  const forward = candidates.map(ms => ({ms, difference: wall(parts(ms, zone)) - target}))
    .filter(c => c.difference > 0).sort((a, b) => a.difference - b.difference || a.ms - b.ms)[0];
  if (!forward || forward.difference > 24 * hour) throw new RangeError("Calendar wall time cannot be resolved");
  return new Date(forward.ms).toISOString();
}
export function nextCalendarRun(plan: AssignmentPlan, after: string) {
  const first = parts(Date.parse(plan.startsAt), plan.timeZone!);
  const last = parts(Date.parse(after), plan.timeZone!);
  let index = Math.max(0, Math.floor(((last.year - first.year) * 12 + last.month - first.month) / plan.repeatMonths!));
  for (let n = 0; n < 4; n++, index++) {
    const next = calendarMonth(plan.startsAt, index * plan.repeatMonths!, plan.timeZone!, plan.dstChoice!);
    if (next > after) return next;
  }
  throw new RangeError("Calendar recurrence did not advance");
}
export function calendarRunIndex(plan: AssignmentPlan, runAt: string) {
  const first = parts(Date.parse(plan.startsAt), plan.timeZone!), run = parts(Date.parse(runAt), plan.timeZone!);
  const guess = Math.floor(((run.year - first.year) * 12 + run.month - first.month) / plan.repeatMonths!);
  for (let index = Math.max(0, guess - 1); index <= guess + 1; index++)
    if (calendarMonth(plan.startsAt, index * plan.repeatMonths!, plan.timeZone!, plan.dstChoice!) === runAt) return index;
  throw new RangeError("Run does not match pinned calendar recurrence");
}
export function calendarPreview(plan: AssignmentPlan) {
  const dates = [plan.startsAt];
  for (let n = 0; n < 2; n++) dates.push(nextCalendarRun(plan, dates.at(-1)!));
  return dates.map(utc => ({utc, local: formatter(plan.timeZone!).format(Date.parse(utc)), timeZone: plan.timeZone}));
}
