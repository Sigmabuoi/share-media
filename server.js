// server.js bảo mật hơn + hỗ trợ .webp

const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Bảo mật HTTP Headers ======
app.use(helmet());

// ====== Rate Limit: giới hạn request để chống spam/DDoS nhẹ ======
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 phút
    max: 100, // tối đa 100 request/IP/phút
    message: 'Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau.'
});
app.use(limiter);

// ====== Cấu hình MongoDB ======
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Đã kết nối MongoDB'))
  .catch(err => console.error('Lỗi kết nối MongoDB:', err));

// ====== Cấu hình Cloudinary ======
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ====== Schema MongoDB ======
const mediaSchema = new mongoose.Schema({
    url: String,
    type: String,
    createdAt: { type: Date, default: Date.now }
});
const Media = mongoose.model('Media', mediaSchema);

// ====== Middleware upload file với kiểm tra mimetype ======
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/ogg'
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Định dạng file không được phép.'));
        }
    }
});

// ====== API upload ======
app.post('/upload', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Không có file được chọn' });

        // Xác định loại file (image hoặc video)
        const type = req.file.mimetype.startsWith('image') ? 'image' : 'video';

        // Upload lên Cloudinary
        const uploadStream = cloudinary.uploader.upload_stream(
            { resource_type: type },
            async (error, cloudResult) => {
                if (error) return res.status(500).json({ error: 'Upload Cloudinary thất bại' });

                // Lưu vào MongoDB
                const newMedia = new Media({ url: cloudResult.secure_url, type });
                await newMedia.save();

                res.json({ message: 'Tải lên thành công', url: cloudResult.secure_url });
            }
        );
        uploadStream.end(req.file.buffer);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi server khi tải file' });
    }
});

// ====== API lấy danh sách upload ======
app.get('/uploads-list', async (req, res) => {
    try {
        const mediaList = await Media.find({}).sort({ createdAt: -1 });
        res.json(mediaList);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi khi tải danh sách' });
    }
});

// ====== Xử lý lỗi toàn cục ======
app.use((err, req, res, next) => {
    console.error('Lỗi chưa bắt:', err.message);
    res.status(500).json({ error: 'Đã xảy ra lỗi không mong muốn' });
});

// ====== Khởi động server ======
app.use(express.static('public'));
app.listen(PORT, () => console.log(`Server đang chạy tại cổng ${PORT}`));

// ====== Bắt lỗi toàn cục ======
process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
    console.error('Unhandled Rejection:', err);
});
