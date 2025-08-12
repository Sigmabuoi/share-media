// server.js (bảo mật + admin login + delete media)
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// Middleware
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// Rate limiter (global)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu, thử lại sau.' }
});
app.use(limiter);

// MongoDB connect
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('Đã kết nối MongoDB'))
  .catch(err => console.error('Lỗi kết nối MongoDB:', err));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Schema: lưu thêm public_id để xóa dễ
const mediaSchema = new mongoose.Schema({
  url: String,
  type: String,
  public_id: String, // lưu public_id trả về từ Cloudinary
  createdAt: { type: Date, default: Date.now }
});
const Media = mongoose.model('Media', mediaSchema);

// Multer config (webp supported)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg','image/png','image/gif','image/webp',
      'video/mp4','video/webm','video/ogg'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Định dạng file không được phép.'));
  }
});

// ---------- Admin auth helpers ----------
function hashSafe(input) {
  return crypto.createHash('sha256').update(input).digest();
}
function safeCompare(a, b) {
  try {
    const ah = hashSafe(a);
    const bh = hashSafe(b);
    if (ah.length !== bh.length) return false;
    return crypto.timingSafeEqual(ah, bh);
  } catch {
    return false;
  }
}
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '6h' });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ---------- Admin routes ----------
// Login (sets httpOnly cookie)
app.post('/admin-login', express.json(), (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin' });

  const envUser = process.env.ADMIN_USER || '';
  const envPass = process.env.ADMIN_PASS || '';

  if (safeCompare(username, envUser) && safeCompare(password, envPass)) {
    const token = generateToken({ role: 'admin', u: envUser });
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 6 * 60 * 60 * 1000
    });
    return res.json({ ok: true });
  } else {
    return res.status(401).json({ error: 'Sai username hoặc password' });
  }
});

// Logout
app.post('/admin-logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

// Check admin status
app.get('/admin-status', (req, res) => {
  const token = req.cookies.admin_token;
  if (!token) return res.json({ admin: false });
  const payload = verifyToken(token);
  if (payload && payload.role === 'admin') return res.json({ admin: true });
  return res.json({ admin: false });
});

// Middleware to protect admin-only routes
function requireAdmin(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(token);
  if (payload && payload.role === 'admin') return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ---------- Upload API ----------
app.post('/upload', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file được chọn' });
    const type = req.file.mimetype.startsWith('image') ? 'image' : 'video';

    const uploadToCloudinary = () => new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ resource_type: type }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
      stream.end(req.file.buffer);
    });

    const cloudResult = await uploadToCloudinary();
    // Save url + type + public_id
    const newMedia = new Media({
      url: cloudResult.secure_url,
      type,
      public_id: cloudResult.public_id || null
    });
    await newMedia.save();
    res.json({ message: 'Tải lên thành công', url: cloudResult.secure_url });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Lỗi khi tải file lên' });
  }
});

// ---------- List API ----------
app.get('/uploads-list', async (req, res) => {
  try {
    const mediaList = await Media.find({}).sort({ createdAt: -1 });
    res.json(mediaList);
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ error: 'Lỗi khi tải danh sách' });
  }
});

// ---------- Delete API (admin only) ----------
app.delete('/media/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const media = await Media.findById(id);
    if (!media) return res.status(404).json({ error: 'Không tìm thấy media' });

    // Determine public_id: prefer saved public_id, else try parse from url
    let publicId = media.public_id;
    if (!publicId && media.url) {
      // Attempt to extract public_id from Cloudinary URL
      // Example: https://res.cloudinary.com/<cloud>/video/upload/v123456/.../public-id.mp4
      const m = media.url.match(/\/(?:upload\/(?:v\d+\/)?)?(.*)\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg)(?:[\?|$])/i);
      if (m && m[1]) {
        // m[1] might include folders; Cloudinary public_id uses the same path without extension
        publicId = m[1];
      }
    }

    // Delete from Cloudinary if we have publicId
    if (publicId) {
      // resource_type based on media.type
      const resource_type = media.type === 'video' ? 'video' : 'image';
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type });
      } catch (e) {
        console.warn('Không xóa được trên Cloudinary:', e.message || e);
      }
    }

    // Delete DB record
    await Media.findByIdAndDelete(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Lỗi khi xóa media' });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err && err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Đã xảy ra lỗi không mong muốn' });
});

// Serve static files and start
app.use(express.static('public'));
app.listen(PORT, () => console.log(`Server chạy tại cổng ${PORT}`));

// Safety nets
process.on('uncaughtException', err => { console.error('Uncaught Exception:', err); });
process.on('unhandledRejection', err => { console.error('Unhandled Rejection:', err); });
