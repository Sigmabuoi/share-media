const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Cấu hình Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Kết nối MongoDB thành công'))
  .catch(err => console.error('Lỗi kết nối MongoDB:', err));

// Model cho media
const MediaSchema = new mongoose.Schema({
    url: String,
    type: String  // 'image' hoặc 'video'
});
const Media = mongoose.model('Media', MediaSchema);

// Multer cấu hình (lưu tạm vào bộ nhớ)
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 },  // 100MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|mp4|webm|ogg/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) return cb(null, true);
        cb(new Error('Chỉ hỗ trợ ảnh (jpg, png, gif) hoặc video (mp4, webm, ogg)!'));
    }
});

// Phục vụ file tĩnh
app.use(express.static(path.join(__dirname, 'public')));

// API upload file
app.post('/upload', upload.single('media'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Không có tệp được tải lên!' });

    try {
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream({
                resource_type: req.file.mimetype.startsWith('image') ? 'image' : 'video',
                upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET
            }, (error, result) => {
                if (error) reject(error);
                else resolve(result);
            });
            uploadStream.end(req.file.buffer);
        });

        const newMedia = new Media({
            url: result.secure_url,
            type: req.file.mimetype.startsWith('image') ? 'image' : 'video'
        });
        await newMedia.save();

        res.json({ url: result.secure_url, type: newMedia.type });
    } catch (err) {
        console.error('Lỗi upload:', err);
        res.status(500).json({ error: err.message || 'Lỗi tải lên Cloudinary' });
    }
});

// API lấy danh sách file
app.get('/uploads-list', async (req, res) => {
    try {
        const files = await Media.find({});
        res.json(files);
    } catch (err) {
        console.error('Lỗi đọc danh sách:', err);
        res.status(500).json({ error: 'Không thể đọc danh sách tệp' });
    }
});

// Xử lý lỗi
app.use((err, req, res, next) => {
    console.error('Lỗi server:', err);
    res.status(500).json({ error: err.message || 'Đã xảy ra lỗi server' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
});