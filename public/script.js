document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('uploadForm');
    const fileInput = document.getElementById('media');
    const uploadBtn = document.getElementById('uploadBtn');
    const imageContainer = document.getElementById('imageContainer');
    const videoContainer = document.getElementById('videoContainer');
    const statusMessage = document.getElementById('statusMessage');

    // Hàm load danh sách file
    async function loadFiles() {
        try {
            const res = await fetch('/uploads-list', { method: 'GET' });
            if (!res.ok) throw new Error(`Lỗi HTTP: ${res.status}`);
            const files = await res.json();

            // Xóa nội dung cũ
            imageContainer.innerHTML = '';
            videoContainer.innerHTML = '';

            files.forEach(file => {
                if (file.type === 'image') {
                    const img = document.createElement('img');
                    img.src = file.url;
                    img.alt = 'Ảnh chia sẻ';
                    img.classList.add('media-item');
                    imageContainer.appendChild(img);
                } else if (file.type === 'video') {
                    const video = document.createElement('video');
                    video.src = file.url;
                    video.controls = true;
                    video.classList.add('media-item');
                    videoContainer.appendChild(video);
                }
            });
        } catch (err) {
            console.error('Lỗi khi tải danh sách file:', err);
            statusMessage.textContent = '❌ Lỗi khi tải danh sách tệp!';
            statusMessage.style.color = 'red';
        }
    }

    // Xử lý khi tải file lên
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!fileInput.files.length) {
            statusMessage.textContent = '⚠️ Vui lòng chọn tệp!';
            statusMessage.style.color = 'orange';
            return;
        }

        const formData = new FormData();
        formData.append('media', fileInput.files[0]);

        try {
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Đang tải...';
            statusMessage.textContent = '⏳ Đang tải lên...';
            statusMessage.style.color = 'blue';

            const res = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                statusMessage.textContent = '✅ Tải lên thành công!';
                statusMessage.style.color = 'green';
                fileInput.value = '';
                await loadFiles(); // Cập nhật danh sách
            } else {
                throw new Error(data.error || 'Lỗi tải lên!');
            }
        } catch (err) {
            console.error('Lỗi tải lên:', err);
            statusMessage.textContent = `❌ ${err.message}`;
            statusMessage.style.color = 'red';
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = '📤 Tải lên';
        }
    });

    // Load lần đầu
    loadFiles();
});