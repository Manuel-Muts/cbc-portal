function pad(value) {
  return String(value).padStart(2, '0');
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (!value) return null;
  const parsed = new Date(value);
  return isValidDate(parsed) ? parsed : null;
}

export function formatDate(value, options = {}) {
  const date = toDate(value) || new Date();
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = String(date.getFullYear());
  let formatted = `${day}/${month}/${year}`;

  if (options.withTime) {
    let hours = date.getHours();
    const minutes = pad(date.getMinutes());
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    formatted += ` ${hours}:${minutes} ${period}`;
  }

  return formatted;
}
