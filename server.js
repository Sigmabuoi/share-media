// server.js bảo mật hơn + hỗ trợ .webp + fix lỗi JSON

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

// ====== Rate Limit ======
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau.' }
});
app.use(limiter);

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
    limits: { fileSize: 100 * 1024 * 1024 },
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

// ====== Upload API ======
app.post('/upload', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được chọn' });
        }

        const type = req.file.mimetype.startsWith('image') ? 'image' : 'video';

        // Dùng Promise để chờ upload_stream hoàn thành
        const uploadToCloudinary = () => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { resource_type: type },
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
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Lỗi khi tải file lên' });
    }
});

// ====== List API ======
app.get('/uploads-list', async (req, res) => {
    try {
        const mediaList = await Media.find({}).sort({ createdAt: -1 });
        res.json(mediaList);
    } catch (err) {
        console.error('List error:', err);
        res.status(500).json({ error: 'Lỗi khi tải danh sách' });
    }
});

// ====== Xử lý lỗi ======
app.use((err, req, res, next) => {
    console.error('Global error:', err.message);
    res.status(500).json({ error: 'Đã xảy ra lỗi không mong muốn' });
});

app.use(express.static('public'));

app.listen(PORT, () => console.log(`Server chạy tại cổng ${PORT}`));

process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
    console.error('Unhandled Rejection:', err);
});
