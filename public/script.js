document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('uploadForm');
  const fileInput = document.getElementById('media');
  const uploadBtn = document.getElementById('uploadBtn');
  const imageContainer = document.getElementById('imageContainer');
  const videoContainer = document.getElementById('videoContainer');
  const statusMessage = document.getElementById('statusMessage');

  let isAdmin = false;

  async function checkAdmin() {
    try {
      const res = await fetch('/admin-status', { credentials: 'include' });
      const j = await res.json();
      isAdmin = !!j.admin;
    } catch(e) { isAdmin = false; }
  }

  async function loadFiles() {
    try {
      const res = await fetch('/uploads-list', { method: 'GET' });
      if (!res.ok) throw new Error(`Lỗi HTTP: ${res.status}`);
      const files = await res.json();

      imageContainer.innerHTML = '';
      videoContainer.innerHTML = '';

      for (const file of files) {
        if (file.type === 'image') {
          const wrap = document.createElement('div');
          wrap.style.position = 'relative';
          wrap.style.display = 'inline-block';
          wrap.style.margin = '8px';

          const img = document.createElement('img');
          img.src = file.url;
          img.alt = 'Ảnh chia sẻ';
          img.classList.add('media-item');
          img.style.maxWidth = '220px';
          img.style.borderRadius = '8px';
          wrap.appendChild(img);

          if (isAdmin) {
            const btn = document.createElement('button');
            btn.textContent = 'XÓA';
            btn.style.position = 'absolute';
            btn.style.top = '6px';
            btn.style.right = '6px';
            btn.style.background = 'rgba(255,0,0,0.9)';
            btn.style.color = '#fff';
            btn.style.border = 'none';
            btn.style.padding = '6px';
            btn.style.cursor = 'pointer';
            btn.addEventListener('click', () => deleteMedia(file._id, wrap));
            wrap.appendChild(btn);
          }

          imageContainer.appendChild(wrap);
        } else if (file.type === 'video') {
          const wrap = document.createElement('div');
          wrap.style.position = 'relative';
          wrap.style.display = 'inline-block';
          wrap.style.margin = '8px';

          const video = document.createElement('video');
          video.src = file.url;
          video.controls = true;
          video.classList.add('media-item');
          video.style.maxWidth = '320px';
          video.style.borderRadius = '8px';
          wrap.appendChild(video);

          if (isAdmin) {
            const btn = document.createElement('button');
            btn.textContent = 'XÓA';
            btn.style.position = 'absolute';
            btn.style.top = '6px';
            btn.style.right = '6px';
            btn.style.background = 'rgba(255,0,0,0.9)';
            btn.style.color = '#fff';
            btn.style.border = 'none';
            btn.style.padding = '6px';
            btn.style.cursor = 'pointer';
            btn.addEventListener('click', () => deleteMedia(file._id, wrap));
            wrap.appendChild(btn);
          }

          videoContainer.appendChild(wrap);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách file:', err);
      statusMessage.textContent = '❌ Lỗi khi tải danh sách tệp!';
      statusMessage.style.color = 'red';
    }
  }

  async function deleteMedia(id, domNode) {
    if (!confirm('Xác nhận xóa media này?')) return;
    try {
      const res = await fetch('/media/' + id, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        domNode.remove();
      } else {
        alert(data.error || 'Xóa không thành công');
      }
    } catch (e) {
      console.error('Xóa lỗi:', e);
      alert('Lỗi khi xóa');
    }
  }

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
        body: formData,
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok) {
        statusMessage.textContent = '✅ Tải lên thành công!';
        statusMessage.style.color = 'green';
        fileInput.value = '';
        await checkAdmin();
        await loadFiles();
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

  // Init
  (async () => {
    await checkAdmin();
    await loadFiles();
  })();

});
