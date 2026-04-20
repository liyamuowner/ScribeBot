import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import 'express-async-errors';
import './config/firebase.js'; // Initialize Firebase Admin SDK on startup

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import bookRoutes from './routes/bookRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import verificationRoutes from './routes/verificationRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import earningsRoutes from './routes/earningsRoutes.js';
import creativeRoutes from './routes/creativeRoutes.js';
import proRoutes from './routes/proRoutes.js';
import creditRoutes from './routes/creditRoutes.js';
import withdrawalRoutes from './routes/withdrawalRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
// Middleware
const app = express();

app.set('trust proxy', true);

// Netlify Path Normalization Middleware
app.use((req, res, next) => {
  if (req.url.startsWith('/.netlify/functions/lambda')) {
    req.url = req.url.replace('/.netlify/functions/lambda', '');
  }
  next();
});

app.use(cors({ origin: [process.env.FRONTEND_URL, 'https://liyamu.com', 'https://www.liyamu.com', 'http://127.0.0.1:5173', 'http://localhost:5173'], credentials: true }));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(hpp());
app.use(rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 5000,
  validate: { ip: false },
  keyGenerator: (req) => req.headers['x-nf-client-connection-ip'] || req.ip || 'unknown'
}));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
// app.use('/uploads', express.static('uploads'));

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'LIYAMU API', db: 'Firestore' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/verifications', verificationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/creative', creativeRoutes);
app.use('/api/pro', proRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/contacts', contactRoutes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
