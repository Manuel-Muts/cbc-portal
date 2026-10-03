export const summarizeCarryForwardAmounts = (rows, academicYear) => {
  const totals = rows.reduce((summary, row) => {
    const amount = Number(row.net_amount || 0);
    if (amount > 0) {
      summary.surplusTotal += amount;
      summary.surplusLearners += 1;
    } else if (amount < 0) {
      summary.arrearsTotal += Math.abs(amount);
      summary.arrearsLearners += 1;
    }
    summary.netTotal += amount;
    summary.learnersWithCarryForward += 1;
    return summary;
  }, {
    surplusTotal: 0,
    arrearsTotal: 0,
    netTotal: 0,
    surplusLearners: 0,
    arrearsLearners: 0,
    learnersWithCarryForward: 0,
  });

  return { academicYear: Number(academicYear), ...totals };
};
