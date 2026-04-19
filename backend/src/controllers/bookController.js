import { col, getDocById, createDoc, updateDoc, deleteDoc, snapToArray, runTransaction, getBatch, FieldValue } from '../config/firestore.js';
import { notifyAdmins } from '../utils/notificationHelper.js';
import { triggerNotification } from '../utils/notificationHelper.js';
import { ApiError } from '../utils/apiError.js';
import { uploadBufferToCloudinary } from '../utils/cloudinaryHelper.js';

export const createBook = async (req, res) => {
  const allowedRoles = ['author', 'verified_author', 'pro_writer'];
  if (!allowedRoles.includes(req.user.role)) throw new ApiError(403, 'Only authors can publish books');

  const { title, category, documentType, content, price = 0 } = req.body;
  if (!title || !category || !documentType) throw new ApiError(400, 'Missing required fields');

  let coverUrl = req.body.coverUrl || '';
  let pdfUrl = req.body.pdfUrl || '';

  if (req.files) {
    if (req.files.cover) {
      if (req.files.cover[0].buffer) {
        coverUrl = await uploadBufferToCloudinary(req.files.cover[0].buffer, 'books/covers', 'image');
      } else {
        coverUrl = req.files.cover[0].path && req.files.cover[0].path.startsWith('http')
          ? req.files.cover[0].path
          : `/uploads/${req.files.cover[0].filename}`;
      }
    }
    if (req.files.pdf) {
      if (req.files.pdf[0].buffer) {
        pdfUrl = await uploadBufferToCloudinary(req.files.pdf[0].buffer, 'books/pdfs', 'raw');
      } else {
        pdfUrl = req.files.pdf[0].path && req.files.pdf[0].path.startsWith('http')
          ? req.files.pdf[0].path
          : `/uploads/${req.files.pdf[0].filename}`;
      }
    }
  }

  const safePrice = req.user.isPro ? Number(price) || 0 : 0;

  const book = await createDoc('books', {
    title,
    category,
    documentType,
    content: documentType === 'text' ? content : '',
    pdfUrl: documentType === 'pdf' ? pdfUrl : '',
    coverUrl,
    authorId: req.user.id,
    authorName: req.user.name,
    price: safePrice,
    isFree: safePrice === 0,
    status: 'pending',
    rejectionReason: '',
    ratingAverage: 0,
    ratingCount: 0,
    viewCount: 0,
    sellCount: 0,
    isHidden: false,
    protectedMode: true,
  });

  await triggerNotification({
    userId: req.user.id,
    title: 'Book submitted',
    message: `${book.title} has been sent for admin review.`,
    type: 'book',
  });

  await notifyAdmins({
    title: 'Content Review Needed',
    message: `A new book "${book.title}" needs review.`,
    type: 'book',
    metadata: { action_type: 'book_submission', title: book.title, authorName: req.user.name, category },
  });

  res.status(201).json(book);
};

export const getBooks = async (req, res) => {
  const { search = '', type } = req.query;

  let query = col.books()
    .where('status', '==', 'approved')
    .where('isHidden', '==', false);

  const snap = await query.get();
  let books = snapToArray(snap);

  // Client-side filter for search (Firestore has no regex)
  if (search) {
    const s = search.toLowerCase();
    books = books.filter(b => b.title?.toLowerCase().includes(s) || b.authorName?.toLowerCase().includes(s));
  }
  if (type === 'free') books = books.filter(b => b.isFree);
  if (type === 'buy') books = books.filter(b => !b.isFree);

  // Strip content & pdfUrl for listing
  books = books.map(({ content, pdfUrl, ...rest }) => rest);

  res.json(books);
};

export const getMyBooks = async (req, res) => {
  const snap = await col.books().where('authorId', '==', req.user.id).orderBy('createdAt', 'desc').get();
  res.json(snapToArray(snap));
};

export const getBookById = async (req, res) => {
  const book = await getDocById('books', req.params.id);
  if (!book) throw new ApiError(404, 'Book not found');

  if (book.status !== 'approved' && book.authorId !== req.user.id) {
    throw new ApiError(403, 'Access denied');
  }

  // Fetch reviews
  const reviewsSnap = await col.reviews().where('bookId', '==', book.id).orderBy('createdAt', 'desc').get();
  const reviews = snapToArray(reviewsSnap);

  // Increment view count
  await updateDoc('books', book.id, { viewCount: (book.viewCount || 0) + 1 });

  const isOwner = book.authorId === req.user.id;
  const isPurchased = (req.user.purchasedBooks || []).includes(book.id);
  const isAdmin = req.user.role === 'admin';

  const bookData = { ...book };
  if (!book.isFree && !isOwner && !isPurchased && !isAdmin) {
    delete bookData.content;
    delete bookData.pdfUrl;
    bookData.requiresPurchase = true;
  }

  res.json({ ...bookData, reviews });
};

export const purchaseBook = async (req, res) => {
  const bookId = req.params.id;
  const userId = req.user.id;

  await runTransaction(async (t) => {
    const bookRef = col.books().doc(bookId);
    const userRef = col.users().doc(userId);

    const [bookSnap, userSnap] = await Promise.all([t.get(bookRef), t.get(userRef)]);

    if (!bookSnap.exists) throw new ApiError(404, 'Book not available');
    const book = { id: bookSnap.id, ...bookSnap.data() };
    if (book.status !== 'approved') throw new ApiError(404, 'Book not available');
    if (book.isFree) throw new ApiError(400, 'This book is free');

    const user = { id: userSnap.id, ...userSnap.data() };
    if ((user.purchasedBooks || []).includes(bookId)) throw new ApiError(400, 'Already purchased');

    const totalBalance = (user.creditBalance || 0) + (user.earningsBalance || 0);
    if (totalBalance < book.price) throw new ApiError(400, `Insufficient credits. You need ${book.price} credits.`);

    const soldPrice = book.price;
    const websiteTax = Math.floor(soldPrice * 0.1);
    const authorEarnings = soldPrice - websiteTax;

    // Deduct from buyer (credits first, then earnings)
    let creditBalance = user.creditBalance || 0;
    let earningsBalance = user.earningsBalance || 0;
    let remaining = soldPrice;

    if (creditBalance >= remaining) {
      creditBalance -= remaining;
    } else {
      remaining -= creditBalance;
      creditBalance = 0;
      earningsBalance -= remaining;
    }

    // Update buyer
    t.update(userRef, {
      creditBalance,
      earningsBalance,
      purchasedBooks: FieldValue.arrayUnion(bookId),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update author earnings
    if (book.authorId) {
      const authorRef = col.users().doc(book.authorId);
      t.update(authorRef, {
        earningsBalance: FieldValue.increment(authorEarnings),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Update book sellCount
    t.update(bookRef, { sellCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });

    // Create purchase record
    const purchaseRef = col.purchases().doc();
    t.set(purchaseRef, {
      buyerId: userId, buyerName: user.name,
      bookId, bookTitle: book.title,
      soldPrice, websiteTax, authorEarnings,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });

    // Credit transactions
    const txBuyerRef = col.creditTransactions().doc();
    t.set(txBuyerRef, {
      userId, type: 'spend', amount: soldPrice,
      description: `Purchased book: ${book.title}`,
      metadata: { bookId },
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });

    if (book.authorId) {
      const txAuthorRef = col.creditTransactions().doc();
      t.set(txAuthorRef, {
        userId: book.authorId, type: 'earn', amount: authorEarnings,
        description: `Sold book: ${book.title}`,
        metadata: { bookId },
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  // Non-blocking notifications
  const [bookData, userData] = await Promise.all([
    getDocById('books', bookId),
    getDocById('users', userId),
  ]);

  triggerNotification({ userId, title: 'Purchase successful', message: `You spent ${bookData?.price} credits on ${bookData?.title}.`, type: 'purchase' }).catch(() => {});
  if (bookData?.authorId) {
    triggerNotification({ userId: bookData.authorId, title: 'New sale', message: `${bookData.title} was sold.`, type: 'earnings' }).catch(() => {});
  }

  res.json({ success: true, balance: userData?.creditBalance });
};

export const reviewBook = async (req, res) => {
  const { rating, comment } = req.body;
  const book = await getDocById('books', req.params.id);
  if (!book) throw new ApiError(404, 'Book not found');

  // Upsert review
  const existingSnap = await col.reviews()
    .where('bookId', '==', book.id)
    .where('userId', '==', req.user.id)
    .limit(1).get();

  if (!existingSnap.empty) {
    await updateDoc('reviews', existingSnap.docs[0].id, { rating, comment });
  } else {
    await createDoc('reviews', { bookId: book.id, userId: req.user.id, userName: req.user.name, rating, comment });
  }

  // Recalculate rating
  const allReviewsSnap = await col.reviews().where('bookId', '==', book.id).get();
  const allReviews = snapToArray(allReviewsSnap);
  const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
  await updateDoc('books', book.id, { ratingAverage: avg, ratingCount: allReviews.length });

  await notifyAdmins({
    title: 'New Book Review',
    message: `${req.user.name} rated "${book.title}" ${rating} stars.`,
    type: 'social',
    metadata: { action_type: 'book_review', bookTitle: book.title, reviewerName: req.user.name, rating },
  });

  // Check pro writer badge
  const authorBooksSnap = await col.books().where('authorId', '==', book.authorId).where('status', '==', 'approved').get();
  const authorBooks = snapToArray(authorBooksSnap).filter(b => b.ratingCount > 0);
  const authorAvg = authorBooks.length
    ? authorBooks.reduce((s, b) => s + (b.ratingAverage / 5) * 100, 0) / authorBooks.length
    : 0;
  if (authorAvg > 70 && book.authorId) {
    await col.users().doc(book.authorId).update({ 'badges.proWriter': true, updatedAt: FieldValue.serverTimestamp() });
  }

  res.json({ success: true, ratingAverage: avg });
};

export const getAuthorStats = async (req, res) => {
  const snap = await col.books().where('authorId', '==', req.user.id).where('status', '==', 'approved').get();
  const books = snapToArray(snap);
  const stats = books.reduce(
    (acc, b) => ({
      totalViews: acc.totalViews + (b.viewCount || 0),
      totalSales: acc.totalSales + (b.sellCount || 0),
      ratingSum: acc.ratingSum + (b.ratingAverage || 0),
      bookCount: acc.bookCount + 1,
    }),
    { totalViews: 0, totalSales: 0, ratingSum: 0, bookCount: 0 }
  );
  res.json({
    totalViews: stats.totalViews,
    totalSales: stats.totalSales,
    avgRating: stats.bookCount ? stats.ratingSum / stats.bookCount : 0,
    bookCount: stats.bookCount,
  });
};

export const deleteBook = async (req, res) => {
  const book = await getDocById('books', req.params.id);
  if (!book) throw new ApiError(404, 'Book not found');
  if (book.authorId !== req.user.id) throw new ApiError(403, 'You can only delete your own books');

  // Delete associated reviews
  const reviewsSnap = await col.reviews().where('bookId', '==', book.id).get();
  const batch = getBatch();
  reviewsSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(col.books().doc(book.id));
  await batch.commit();

  await triggerNotification({
    userId: req.user.id,
    title: 'Book Deleted',
    message: `Your book "${book.title}" has been permanently removed from the platform.`,
    type: 'book',
  });

  res.json({ success: true, message: 'Book deleted successfully' });
};
