export function applyMonthlySmsAllocation(currentBalance = 0, allocatedCount = 0) {
  const parsedCurrent = Number(currentBalance) || 0;
  const parsedAllocated = Number(allocatedCount) || 0;
  return parsedCurrent + parsedAllocated;
}

export function shouldBypassSchoolProfileCache(query = {}) {
  const normalized = query && typeof query === 'object' ? query : {};
  return ['refresh', 'forceRefresh', 'bypassCache'].some((key) => {
    const value = normalized[key];
    return value !== undefined && String(value).toLowerCase() === 'true';
  });
}
