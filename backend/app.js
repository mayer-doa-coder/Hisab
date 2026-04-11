const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');

const authRoutes = require('./routes/authRoutes');
const v1Routes = require('./routes/v1');
const authMiddleware = require('./middleware/authMiddleware');
const requestContext = require('./middleware/requestContext');
const securityHeaders = require('./middleware/securityHeaders');
const { createRateLimiter } = require('./middleware/rateLimitMiddleware');
const { getProfile } = require('./controllers/authController');
const { error: sendError } = require('./utils/apiResponse');
const { errorHandler } = require('./controllers/v1/controllerUtils');

const buildCorsOptions = () => {
  const allowedOriginsRaw = String(process.env.CORS_ALLOWED_ORIGINS || '').trim();

  if (!allowedOriginsRaw) {
    return {
      origin: true,
      credentials: true,
    };
  }

  const allowedOrigins = new Set(
    allowedOriginsRaw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );

  return {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin is not allowed.'));
    },
  };
};

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 60,
  keyPrefix: 'auth-routes',
});

const domainReadLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 300,
  keyPrefix: 'domain-read',
  scopeByUser: true,
});

const domainMutationLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 120,
  keyPrefix: 'domain-mutation',
  scopeByUser: true,
});

const app = express();

app.set('trust proxy', 1);

app.use(requestContext);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(securityHeaders);
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Hisab API Running',
    serverTime: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;

  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    database: dbConnected ? 'mongodb-connected' : 'mongodb-disconnected',
  });
});

app.use('/api/auth', authLimiter, authRoutes);

app.use('/api/v1', authMiddleware, (req, res, next) => {
  if (String(req.method || '').toUpperCase() === 'GET') {
    return domainReadLimiter(req, res, next);
  }

  return domainMutationLimiter(req, res, next);
});

app.use('/api/v1', authMiddleware, v1Routes);

app.get('/api/user/profile', authMiddleware, getProfile);

app.get('/api/user/scoped-example', authMiddleware, (req, res) => {
  return res.status(200).json({
    message: 'Use req.user_id to scope queries (e.g., WHERE user_id = ?).',
    scope: {
      user_id: req.user_id,
    },
  });
});

app.use((req, res) => {
  return sendError(req, res, {
    statusCode: 404,
    code: 'ROUTE_NOT_FOUND',
    message: 'Route not found.',
  });
});

app.use((error, _req, res, _next) => {
  if (error?.message === 'CORS origin is not allowed.') {
    return res.status(403).json({
      code: 'CORS_BLOCKED',
      message: error.message,
    });
  }

  return errorHandler(error, _req, res, _next);
});

module.exports = app;