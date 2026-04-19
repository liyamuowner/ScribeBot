import { col, snapToArray } from '../config/firestore.js';

export const getAuthorEarnings = async (req, res) => {
  const booksSnap = await col.books().where('authorId', '==', req.user.id).get();
  const bookIds = booksSnap.docs.map(d => d.id);

  let purchases = [];
  if (bookIds.length > 0) {
    // Firestore 'in' supports up to 30 items; chunk if needed
    const chunks = [];
    for (let i = 0; i < bookIds.length; i += 30) chunks.push(bookIds.slice(i, i + 30));

    const results = await Promise.all(
      chunks.map(chunk => col.purchases().where('bookId', 'in', chunk).get())
    );
    results.forEach(s => purchases.push(...snapToArray(s)));
  }

  const total = purchases.reduce((sum, p) => sum + (p.authorEarnings || 0), 0);
  res.json({ balance: req.user.earningsBalance || 0, total, purchases });
};
