/**
 * Robust date formatting for LIYAMU
 * Handles Firestore Timestamps (seconds/_seconds), Date objects, and ISO strings.
 */
export const formatDate = (date, includeTime = false) => {
  if (!date) return 'N/A';
  
  const d = new Date(
    date?._seconds ? date._seconds * 1000 : 
    date?.seconds ? date.seconds * 1000 : 
    date
  );

  if (isNaN(d.getTime())) return 'N/A';

  if (includeTime) {
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};
