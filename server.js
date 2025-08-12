const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const basicAuth = require('express-basic-auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Bảo mật HTTP Headers ======
app.use(helmet());

// ====== Basic Authentication ======
app.use(basicAuth({
    users: { 'admin': process.env.APP_PASSWORD }, // Username: admin, Password: từ biến môi trường
    challenge: true, // Hiển thị hộp thoại login
    unauthorizedResponse: { error: 'Cần tên đăng nhập và mật khẩu!' }
}));

// ====== Rate Limit Toàn App (20 request/phút/IP) ======
const generalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 phút
    max: 20, // 20 request mỗi IP mỗi phút
    message: { error: 'Quá nhiều yêu cầu! Vui lòng thử lại sau 1 phút.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate Limit riêng cho Upload (10 request/phút/IP)
const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 phút
    max: 10, // 10 upload mỗi IP mỗi phút
    message: { error: 'Quá nhiều yêu cầu tải lên! Vui lòng thử lại sau 1 phút.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Áp dụng rate limit toàn app
app.use(generalLimiter);

// ====== MongoDB ======
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Đã kết nối MongoDB'))
  .catch(err => console.error('Lỗi kết nối MongoDB:', err));

// ====== Cloudinary ======
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ====== Schema ======
const mediaSchema = new mongoose.Schema({
    url: String,
    type: String,
    createdAt: { type: Date, default: Date.now }
});
const Media = mongoose.model('Media', mediaSchema);

// ====== Multer config ======
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // Giảm xuống 20MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/ogg'
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Định dạng file không được phép. Chỉ hỗ trợ jpg, png, gif, webp, mp4, webm, ogg.'));
        }
    }
});

// ====== Upload API ======
app.post('/upload', uploadLimiter, upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được chọn' });
        }

        const type = req.file.mimetype.startsWith('image') ? 'image' : 'video';

        // Dùng Promise để chờ upload_stream hoàn thành
        const uploadToCloudinary = () => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { 
                        resource_type: type,
                        upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                stream.end(req.file.buffer);
            });
        };

        const cloudResult = await uploadToCloudinary();

        // Lưu MongoDB
        const newMedia = new Media({ url: cloudResult.secure_url, type });
        await newMedia.save();

        res.json({ message: 'Tải lên thành công', url: cloudResult.secure_url });

    } catch (err) {
        console.error(`Upload error from IP ${req.ip}:`, err);
        res.status(500).json({ error: 'Lỗi khi tải file lên: ' + err.message });
    }
});

// ====== List API ======
app.get('/uploads-list', async (req, res) => {
    try {
        const mediaList = await Media.find({}).sort({ createdAt: -1 }).limit(100); // Giới hạn 100 file để tránh quá tải
        res.json(mediaList);
    } catch (err) {
        console.error(`List error from IP ${req.ip}:`, err);
        res.status(500).json({ error: 'Lỗi khi tải danh sách' });
    }
});

// ====== Phục vụ file tĩnh ======
app.use(express.static('public'));

// ====== Xử lý lỗi ======
app.use((err, req, res, next) => {
    console.error(`Global error from IP ${req.ip}:`, err.message);
    res.status(500).json({ error: 'Đã xảy ra lỗi không mong muốn' });
});

// ====== Xử lý lỗi crash ======
process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
    console.error('Unhandled Rejection:', err);
});

app.listen(PORT, () => console.log(`Server chạy tại cổng ${PORT}`));