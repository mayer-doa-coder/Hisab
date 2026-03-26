require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const authMiddleware = require('./middleware/authMiddleware');
const { getProfile } = require('./controllers/authController');
const { connectDB } = require('./config/db');

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

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

app.use('/api/auth', authRoutes);

// Example protected route
app.get('/api/user/profile', authMiddleware, getProfile);

// Example ownership-scoped route pattern for future modules
app.get('/api/user/scoped-example', authMiddleware, (req, res) => {
  return res.status(200).json({
    message: 'Use req.user_id to scope queries (e.g., WHERE user_id = ?).',
    scope: {
      user_id: req.user_id,
    },
  });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, _req, res, _next) => {
  const statusCode = Number(error?.statusCode || 500);
  res.status(statusCode).json({
    message: error?.message || 'Internal server error.',
  });
});

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error?.message || error);
    process.exit(1);
  });
