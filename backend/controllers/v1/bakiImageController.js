const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const { success } = require('../../utils/apiResponse');
const { asyncHandler, getUserIdFromReq } = require('./controllerUtils');
const { badRequest } = require('../../services/v1/httpError');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'baki-images');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const hash = crypto.randomBytes(12).toString('hex');
    cb(null, `baki_${Date.now()}_${hash}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter,
});

const uploadMiddleware = upload.single('image');

const uploadBakiImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw badRequest('No image file provided.');
  }

  const userId = getUserIdFromReq(req);
  const customerId = req.body?.customer_id || null;

  // Build a relative public URL — adjust prefix to match your static serving config
  const imageUrl = `/uploads/baki-images/${req.file.filename}`;

  return success(req, res, {
    image_url: imageUrl,
    filename: req.file.filename,
    size: req.file.size,
    customer_id: customerId,
    uploaded_by: userId,
    uploaded_at: new Date().toISOString(),
  }, 201);
});

module.exports = { uploadMiddleware, uploadBakiImage };
