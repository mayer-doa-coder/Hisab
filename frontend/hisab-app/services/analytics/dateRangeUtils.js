export const DATE_RANGE_TYPES = {
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
};

export const getStartOfDay = (inputDate = new Date()) => {
  const date = new Date(inputDate);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

export const getStartOfWeek = (inputDate = new Date()) => {
  const date = new Date(inputDate);
  if (Number.isNaN(date.getTime())) {
    return getStartOfDay(new Date());
  }

  const dayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayIndex);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

export const getStartOfMonth = (inputDate = new Date()) => {
  const date = new Date(inputDate);
  if (Number.isNaN(date.getTime())) {
    return getStartOfDay(new Date());
  }

  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

export const getRangeBounds = (rangeType = DATE_RANGE_TYPES.TODAY, inputDate = new Date()) => {
  const endDate = new Date(inputDate);
  if (Number.isNaN(endDate.getTime())) {
    const now = new Date();
    return {
      rangeType: DATE_RANGE_TYPES.TODAY,
      startDateIso: getStartOfDay(now),
      endDateIso: now.toISOString(),
      rangeDays: 1,
    };
  }

  let startDateIso = getStartOfDay(endDate);

  if (rangeType === DATE_RANGE_TYPES.WEEK) {
    startDateIso = getStartOfWeek(endDate);
  } else if (rangeType === DATE_RANGE_TYPES.MONTH) {
    startDateIso = getStartOfMonth(endDate);
  }

  const startDate = new Date(startDateIso);
  const rangeDays = Math.max(
    1,
    Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1
  );

  return {
    rangeType,
    startDateIso,
    endDateIso: endDate.toISOString(),
    rangeDays,
  };
};

export const DATE_RANGE_OPTIONS = [
  { value: DATE_RANGE_TYPES.TODAY, label: 'Today' },
  { value: DATE_RANGE_TYPES.WEEK, label: 'This Week' },
  { value: DATE_RANGE_TYPES.MONTH, label: 'This Month' },
];
