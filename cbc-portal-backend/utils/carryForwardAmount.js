export const calculateCarryForwardAmount = ({ fee, payments }) => {
  if (!fee) return null;

  const toCents = (amount) => {
    const numericAmount = Number(amount);
    return Number.isFinite(numericAmount) ? Math.round(numericAmount * 100) : 0;
  };
  const expectedCents = toCents(fee.term1Fee)
    + toCents(fee.term2Fee)
    + toCents(fee.term3Fee);
  const paidCents = payments.reduce((total, payment) => total + toCents(payment.amount), 0);

  return (expectedCents - paidCents) / 100;
};