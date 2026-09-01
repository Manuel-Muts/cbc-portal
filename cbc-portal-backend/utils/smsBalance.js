export function applyMonthlySmsAllocation(currentBalance = 0, allocatedCount = 0) {
  const parsedCurrent = Number(currentBalance) || 0;
  const parsedAllocated = Number(allocatedCount) || 0;

  // Each monthly allocation is fresh. Previous month credits do not carry over.
  void parsedCurrent;
  return parsedAllocated;
}

export function shouldBypassSchoolProfileCache(query = {}) {
  const normalized = query && typeof query === 'object' ? query : {};
  return ['refresh', 'forceRefresh', 'bypassCache'].some((key) => {
    const value = normalized[key];
    return value !== undefined && String(value).toLowerCase() === 'true';
  });
}
