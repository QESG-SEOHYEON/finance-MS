// 출석체크: KST 달력 날짜를 그대로 저장. 모달 재개 타이밍만 정오 기준.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function attendanceKeyForNow(now = new Date()) {
  // KST 달력 날짜 (목요일 오전에 누르면 그 목요일 날짜로 저장)
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

// 캘린더 셀(특정 일자)이 출석된 날인지 비교할 때 쓰는 키.
// 캘린더는 KST 달력 기준이므로 KST 자정 경계로 자른다 (정오 보정 X).
export function calendarDateKey(year, month, day) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// '이 출석 날짜가 캘린더상 어느 일자에 찍혀야 하는지' 매핑.
// attendanceKeyForNow는 KST 정오 기준이라, "오전 출석"은 어제 캘린더 날짜에 매핑됨.
// 사용자가 직관적으로 "오늘 출석했네"라고 느끼는 캘린더 날짜는 attendanceKey 그 자체.
export function attendanceKeyToCalendarKey(attendanceKey) {
  return attendanceKey;
}

// 다음 KST 정오까지 남은 ms (모달 재오픈 타이머용)
export function msUntilNextKSTNoon(now = new Date()) {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const next = new Date(kst);
  next.setUTCHours(12, 0, 0, 0);
  if (kst.getTime() >= next.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - kst.getTime();
}
