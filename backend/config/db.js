const mongoose = require('mongoose');

const parsePositiveIntEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isMongoUri = (value) => /^mongodb(\+srv)?:\/\//i.test(String(value || '').trim());

const shouldRetryConnectionError = (error) => {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();

  if (name === 'MongooseServerSelectionError') {
    return true;
  }

  return (
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('failed to connect') ||
    message.includes('server selection timed out')
  );
};

const buildConnectionOptions = () => {
  const serverSelectionTimeoutMS = parsePositiveIntEnv(process.env.MONGO_CONNECT_TIMEOUT_MS, 5000);
  const socketTimeoutMS = parsePositiveIntEnv(process.env.MONGO_SOCKET_TIMEOUT_MS, 45000);

  return {
    dbName: process.env.MONGO_DB_NAME || undefined,
    serverSelectionTimeoutMS,
    socketTimeoutMS,
    autoIndex: process.env.NODE_ENV === 'production' ? false : true,
  };
};

const ensureProductSkuIndex = async () => {
  const collection = mongoose.connection.collection('products');
  const desiredName = 'userId_1_sku_1';
  const desiredOptions = {
    name: desiredName,
    unique: true,
    partialFilterExpression: {
      sku: { $type: 'string', $ne: '' },
    },
  };

  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch (error) {
    console.warn(`[DB] Unable to inspect product indexes: ${error?.message || error}`);
    return;
  }

  const existing = indexes.find((index) => index.name === desiredName);
  const hasDesiredPartial = Boolean(
    existing
      && existing.unique === true
      && existing.partialFilterExpression
      && existing.partialFilterExpression.sku
      && existing.partialFilterExpression.sku.$type === 'string'
      && existing.partialFilterExpression.sku.$ne === ''
  );

  if (hasDesiredPartial) {
    return;
  }

  if (existing) {
    try {
      await collection.dropIndex(desiredName);
      console.log('[DB] Dropped legacy products SKU index.');
    } catch (error) {
      console.warn(`[DB] Failed to drop legacy products SKU index: ${error?.message || error}`);
      return;
    }
  }

  try {
    await collection.createIndex({ userId: 1, sku: 1 }, desiredOptions);
    console.log('[DB] Ensured products SKU partial unique index.');
  } catch (error) {
    console.warn(`[DB] Failed to create products SKU partial unique index: ${error?.message || error}`);
  }
};

const connectDB = async () => {
  const mongoUri = String(process.env.MONGO_URI || '').trim();
  if (!mongoUri) {
    throw new Error('MONGO_URI is not set. Provide a valid MongoDB connection string in environment variables.');
  }

  if (!isMongoUri(mongoUri)) {
    throw new Error('Invalid MONGO_URI format. It must start with mongodb:// or mongodb+srv://');
  }

  const maxRetries = parsePositiveIntEnv(process.env.MONGO_MAX_RETRIES, 3);
  const retryDelayMs = parsePositiveIntEnv(process.env.MONGO_RETRY_DELAY_MS, 2000);
  const options = buildConnectionOptions();

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      await mongoose.connect(mongoUri, options);
      console.log('MongoDB connected');
      await ensureProductSkuIndex();
      return mongoose.connection;
    } catch (error) {
      lastError = error;
      const isRetryable = shouldRetryConnectionError(error);
      const hasMoreAttempts = attempt <= maxRetries;

      console.error(`[DB] MongoDB connection attempt ${attempt} failed: ${error?.message || error}`);

      if (!isRetryable || !hasMoreAttempts) {
        break;
      }

      console.warn(`[DB] Retrying MongoDB connection in ${retryDelayMs}ms...`);
      await sleep(retryDelayMs);
    }
  }

  throw new Error(`MongoDB connection failed after ${maxRetries + 1} attempt(s): ${lastError?.message || 'Unknown error'}`);
};

module.exports = {
  connectDB,
};
