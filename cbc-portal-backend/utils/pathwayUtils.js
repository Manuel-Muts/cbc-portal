const normalizePathway = (p) => {
  if (p === undefined || p === null) return null;
  const raw = String(p).trim();
  if (!raw) return null;

  const normalizedInput = raw.toLowerCase();
  const directMap = {
    stem: 'STEM',
    STEM: 'STEM',
    'social sciences': 'Social Sciences',
    'SOCIAL SCIENCES': 'Social Sciences',
    socialsciences: 'Social Sciences',
    ARTS: 'Arts & Sports Science',
    'ARTS': 'Arts & Sports Science',
    'arts & sports science': 'Arts & Sports Science',
    'arts and sports science': 'Arts & Sports Science',
    artsandsportsscience: 'Arts & Sports Science',
    artsandsportscience: 'Arts & Sports Science',
    artssportsscience: 'Arts & Sports Science',
    na: 'N/A',
    none: 'N/A'
  };

  if (directMap[normalizedInput]) return directMap[normalizedInput];

  const key = normalizedInput.replace(/[^a-z0-9]+/g, '');
  return directMap[key] || 'N/A';
};

export { normalizePathway };
