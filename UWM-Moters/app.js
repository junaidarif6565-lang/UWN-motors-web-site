const WHATSAPP_NUMBER = '923232568977';
const ADMIN_TOKEN_KEY = 'uwn-admin-token';
const REELS = [
  { id: 'Db0shCrsqMj', date: 'August 09, 2026', image: '/assets/reel-1.jpg', alt: 'UWN Motors car video' },
  { id: 'DdrcvlyopYp', date: 'September 24, 2026', image: '/assets/reel-2.jpg', alt: 'UWN Motors car video featuring a sedan' },
  { id: 'DdZPbwBoNYq', date: 'September 17, 2026', alt: 'UWN Motors car video featuring a sedan' },
  { id: 'Dcd_tz3szVJ', date: 'August 25, 2026', alt: 'UWN Motors video featuring a minivan' },
  { id: 'DcLyYG8s8Kz', date: 'August 18, 2026', alt: 'UWN Motors car video' },
  { id: 'Db3T_wos60E', date: 'August 10, 2026', alt: 'UWN Motors car video' },
  { id: 'Db0oV81MtKB', date: 'August 09, 2026', alt: 'UWN Motors car video' },
  { id: 'DbyKJPxMsL4', date: 'August 08, 2026', alt: 'UWN Motors car video' },
  { id: 'DYPn0F-s2zv', date: 'May 12, 2026', alt: 'UWN Motors car video' },
  { id: 'DXiMzVWiIrO', date: 'April 24, 2026', alt: 'UWN Motors car video' },
  { id: 'DXfbxYIDI53', date: 'April 23, 2026', alt: 'UWN Motors car video' },
  { id: 'DXczDEZDLal', date: 'April 22, 2026', alt: 'UWN Motors car video' }
];

const carGrid = document.querySelector('#carGrid');
const reelGrid = document.querySelector('#reelGrid');
const adminDialog = document.querySelector('#adminDialog');
const videoDialog = document.querySelector('#videoDialog');
const adminWorkspace = document.querySelector('#adminWorkspace');
const adminTokenInput = document.querySelector('#adminPassword');
let cars = [];
let selectedImage = null;
let previewUrl = null;

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatPrice(price) {
  return `PKR ${Number(price).toLocaleString('en-PK')}`;
}

function renderReels() {
  reelGrid.innerHTML = REELS.map((reel) => {
    const poster = reel.image
      ? `<img src="${reel.image}" alt="${escapeHTML(reel.alt)}" loading="lazy">`
      : `<div class="reel-placeholder"><img src="/assets/uwn-logo.jpg" alt="" loading="lazy"></div>`;
    return `<a class="reel-card" href="https://www.instagram.com/uwn_motors/reel/${reel.id}/" target="_blank" rel="noopener noreferrer" data-reel-id="${reel.id}" aria-label="Watch UWN Motors Instagram video from ${escapeHTML(reel.date)}">
      ${poster}<span class="reel-play" aria-hidden="true">▶</span><span class="reel-date">${escapeHTML(reel.date)}</span>
    </a>`;
  }).join('');
}

function renderCars() {
  if (!cars.length) {
    carGrid.innerHTML = `<div class="empty-inventory">
      <div><h3>New arrivals are on the way.</h3><p>Get in touch with UWN Motors for the latest available cars, or check back soon for fresh listings.</p></div>
      <a class="button button-red" href="https://wa.me/${WHATSAPP_NUMBER}?text=Hi%20UWN%20Motors%2C%20please%20share%20your%20latest%20car%20inventory." target="_blank" rel="noreferrer">Ask on WhatsApp <span aria-hidden="true">↗</span></a>
    </div>`;
    return;
  }

  carGrid.innerHTML = cars.map((car) => `<article class="car-card">
    <div class="car-photo"><img src="${escapeHTML(car.imageUrl)}" alt="${escapeHTML(`${car.year} ${car.make} ${car.model}`)}" loading="lazy"><span class="car-year">${escapeHTML(car.year)}</span></div>
    <div class="car-info">
      <div class="car-title-row"><div><h3>${escapeHTML(car.make)} ${escapeHTML(car.model)}</h3><p class="car-location">${escapeHTML(car.city)}</p></div><span class="car-price">${formatPrice(car.price)}</span></div>
      <div class="car-specs"><span>${escapeHTML(car.mileage)}</span><span>·</span><span>${escapeHTML(car.transmission)}</span></div>
      <p class="car-description">${escapeHTML(car.description || 'Contact UWN Motors for more information.')}</p>
      <a class="car-enquire" href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi UWN Motors, I'm interested in the ${car.year} ${car.make} ${car.model}.`)}" target="_blank" rel="noreferrer">Enquire about this car <span aria-hidden="true">↗</span></a>
    </div>
  </article>`).join('');
}

async function loadCars() {
  try {
    const response = await fetch('/api/cars');
    if (!response.ok) throw new Error(`Could not load car listings (${response.status}).`);
    const result = await response.json();
    cars = Array.isArray(result) ? result : [];
    renderCars();
    renderAdminCars();
  } catch (error) {
    console.error(error);
    carGrid.innerHTML = `<div class="empty-inventory"><div><h3>Listings are temporarily unavailable.</h3><p>Please contact UWN Motors directly for the latest stock.</p></div></div>`;
  }
}

function renderAdminCars() {
  const list = document.querySelector('#adminCarList');
  document.querySelector('#adminCarCount').textContent = `${cars.length} ${cars.length === 1 ? 'car' : 'cars'}`;
  if (!cars.length) {
    list.innerHTML = '<div class="admin-empty">There are no cars listed yet.</div>';
    return;
  }

  list.innerHTML = cars.map((car) => `<div class="admin-car-item">
    <div><img src="${escapeHTML(car.imageUrl)}" alt=""><span><strong>${escapeHTML(car.year)} ${escapeHTML(car.make)} ${escapeHTML(car.model)}</strong><small>${formatPrice(car.price)}</small></span></div>
    <button class="delete-car" type="button" data-delete-car="${escapeHTML(car.id)}">Delete</button>
  </div>`).join('');
}

function setMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle('success', success);
}

async function apiRequest(url, options = {}) {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

async function compressImage(file) {
  const image = new Image();
  const source = URL.createObjectURL(file);
  try {
    image.src = source;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84));
    if (!blob) throw new Error('This image could not be prepared. Please try another photo.');
    return blob;
  } finally {
    URL.revokeObjectURL(source);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.readAsDataURL(file);
  });
}

document.querySelector('#currentYear').textContent = new Date().getFullYear();
renderReels();
loadCars();

reelGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-reel-id]');
  if (!button) return;
  if (window.matchMedia('(max-width: 680px), (pointer: coarse)').matches) return;
  event.preventDefault();
  const reel = REELS.find((item) => item.id === button.dataset.reelId);
  if (!reel) return;
  const reelUrl = `https://www.instagram.com/uwn_motors/reel/${reel.id}/`;
  document.querySelector('#reelFrame').src = `https://www.instagram.com/reel/${reel.id}/embed`;
  document.querySelector('#openReelLink').href = reelUrl;
  videoDialog.showModal();
  document.body.classList.add('dialog-open');
});

document.querySelector('#closeVideo').addEventListener('click', () => videoDialog.close());
videoDialog.addEventListener('close', () => {
  document.querySelector('#reelFrame').src = 'about:blank';
  document.body.classList.remove('dialog-open');
});

document.querySelector('#menuToggle').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const nav = document.querySelector('#mainNav');
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  nav.classList.toggle('open', !expanded);
});

document.querySelector('#mainNav').addEventListener('click', (event) => {
  if (event.target.closest('a')) {
    document.querySelector('#mainNav').classList.remove('open');
    document.querySelector('#menuToggle').setAttribute('aria-expanded', 'false');
  }
});

document.querySelector('#manageCarsButton').addEventListener('click', () => {
  adminDialog.showModal();
  document.body.classList.add('dialog-open');
  const savedToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (savedToken) {
    adminTokenInput.value = savedToken;
    adminWorkspace.hidden = false;
    renderAdminCars();
  } else {
    adminTokenInput.focus();
  }
});

document.querySelector('#closeAdmin').addEventListener('click', () => adminDialog.close());
adminDialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));

document.querySelector('#adminLogin').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#loginMessage');
  const token = adminTokenInput.value;
  setMessage(message, 'Checking password…');
  try {
    await apiRequest('/api/admin/check', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    adminWorkspace.hidden = false;
    setMessage(message, 'Signed in. Listings are shared with all website visitors.', true);
    renderAdminCars();
  } catch (error) {
    setMessage(message, error.message);
  }
});

document.querySelector('#carForm input[name="image"]').addEventListener('change', (event) => {
  const file = event.target.files[0];
  const preview = document.querySelector('#imagePreview');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  if (!file) {
    selectedImage = null;
    preview.hidden = true;
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    event.target.value = '';
    selectedImage = null;
    preview.hidden = true;
    setMessage(document.querySelector('#carFormMessage'), 'Choose a JPG, PNG, or WebP image.');
    return;
  }
  setMessage(document.querySelector('#carFormMessage'), '');
  previewUrl = URL.createObjectURL(file);
  document.querySelector('#previewImage').src = previewUrl;
  document.querySelector('#previewName').textContent = file.name;
  preview.hidden = false;
  selectedImage = file;
});

document.querySelector('#carForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#carFormMessage');
  const button = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  if (!selectedImage) {
    setMessage(message, 'Please choose a car photo.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Adding car…';
  setMessage(message, '');
  try {
    const compressed = await compressImage(selectedImage);
    if (compressed.size > 3 * 1024 * 1024) throw new Error('This photo is still too large. Please choose a smaller image.');
    const imageData = await fileToDataUrl(compressed);
    const newCar = Object.fromEntries(['make', 'model', 'year', 'price', 'mileage', 'transmission', 'city', 'description'].map((key) => [key, String(formData.get(key) || '').trim()]));
    newCar.image = imageData;
    await apiRequest('/api/cars', { method: 'POST', body: JSON.stringify(newCar) });
    form.reset();
    selectedImage = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    document.querySelector('#imagePreview').hidden = true;
    setMessage(message, 'Car added to the website.', true);
    await loadCars();
  } catch (error) {
    setMessage(message, error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Add car to website <span aria-hidden="true">↗</span>';
  }
});

document.querySelector('#adminCarList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-car]');
  if (!button) return;
  const car = cars.find((entry) => entry.id === button.dataset.deleteCar);
  if (!car || !window.confirm(`Delete ${car.year} ${car.make} ${car.model} from the website?`)) return;
  button.disabled = true;
  try {
    await apiRequest(`/api/cars/${encodeURIComponent(car.id)}`, { method: 'DELETE' });
    await loadCars();
  } catch (error) {
    button.disabled = false;
    window.alert(error.message);
  }
});

document.querySelector('#adminSignOut').addEventListener('click', () => {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  adminTokenInput.value = '';
  adminWorkspace.hidden = true;
  setMessage(document.querySelector('#loginMessage'), 'Signed out.', true);
});
