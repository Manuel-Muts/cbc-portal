//feePosition utils
const TERMS = ['Term 1', 'Term 2', 'Term 3'];

export const calculateAggregateFeePosition = ({ totalExpectedFees, totalReceived }) => {
  const expected = Math.max(0, Number(totalExpectedFees) || 0);
  const received = Math.max(0, Number(totalReceived) || 0);
  const totalPaid = Math.min(received, expected);

  return {
    totalExpectedFees: expected,
    totalPaid,
    totalDeficit: Math.max(0, expected - received),
    totalSurplus: Math.max(0, received - expected),
  };
};

export const calculateTermOverpayment = ({ term, enrollments, feesByGrade, paymentsByStudent }) => {
  if (!TERMS.includes(term)) return 0;

  return enrollments.reduce((totalOverpayment, enrollment) => {
    const fee = feesByGrade.get(enrollment.grade);
    if (!fee) return totalOverpayment;

    const feeField = `${term.toLowerCase().replace(' ', '')}Fee`;
    const expected = Number(fee[feeField] || 0);
    const receipts = Number(paymentsByStudent.get(String(enrollment.studentId))?.receiptsByTerm?.[term] || 0);
    return totalOverpayment + Math.max(0, receipts - expected);
  }, 0);
};

export const calculateFeePosition = ({ enrollments, feesByGrade, paymentsByStudent, term }) => {
  const totals = enrollments.reduce((position, enrollment) => {
    const fee = feesByGrade.get(enrollment.grade);
    const expected = fee
      ? Number(term === 'Term 1' ? fee.term1Fee
        : term === 'Term 2' ? fee.term2Fee
          : term === 'Term 3' ? fee.term3Fee
            : fee.totalFee) || 0
      : 0;
    const studentPayments = paymentsByStudent.get(String(enrollment.studentId));
    const received = term
      ? Number(studentPayments?.[term] || 0)
      : TERMS.reduce((sum, paymentTerm) => sum + Number(studentPayments?.[paymentTerm] || 0), 0);

    position.totalExpectedFees += expected;
    position.totalReceived += received;
    position.totalArrears += Math.max(0, -Number(studentPayments?.broughtForwardAmount || 0));

    return position;
  }, {
    totalExpectedFees: 0,
    totalReceived: 0,
    totalArrears: 0,
  });

  return {
    ...calculateAggregateFeePosition({
      totalExpectedFees: totals.totalExpectedFees,
      totalReceived: totals.totalReceived,
    }),
    totalArrears: totals.totalArrears,
  };
};