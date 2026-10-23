const attendanceTimeZone = "Asia/Makassar";
const attendanceCloseSeconds = 19 * 60 * 60;

export function getAttendanceDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: attendanceTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getAttendanceTimeSeconds(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: attendanceTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
  return values.hour * 60 * 60 + values.minute * 60 + values.second;
}

export function isAttendanceWorkday(dateKey: string) {
  const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

export function isAttendanceDayClosed(dateKey: string, now: Date) {
  const todayKey = getAttendanceDateKey(now);
  return dateKey < todayKey || (dateKey === todayKey && getAttendanceTimeSeconds(now) > attendanceCloseSeconds);
}

export function wasRegisteredByAttendanceClose(dateKey: string, createdAt: Date) {
  const createdDateKey = getAttendanceDateKey(createdAt);
  return createdDateKey < dateKey ||
    (createdDateKey === dateKey && getAttendanceTimeSeconds(createdAt) <= attendanceCloseSeconds);
}

export function getAttendanceAcademicYear(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: attendanceTimeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
  return values.month >= 9 ? values.year : values.year - 1;
}
