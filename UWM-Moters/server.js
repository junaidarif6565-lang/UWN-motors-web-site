const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PUBLIC_DIR = ROOT;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const CARS_FILE = path.join(DATA_DIR, 'cars.json');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};
const IMAGE_TYPES = {
  'image/jpeg': { extension: '.jpg', signature: (buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: '.png', signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: '.webp', signature: (buffer) => buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' }
};

let writeQueue = Promise.resolve();

async function ensureStorage() {
  await Promise.all([
    fs.mkdir(UPLOAD_DIR, { recursive: true }),
    fs.mkdir(DATA_DIR, { recursive: true })
  ]);
  try {
    await fs.access(CARS_FILE);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(CARS_FILE, '[]\n', { flag: 'wx' });
  }
}

async function readCars() {
  const content = await fs.readFile(CARS_FILE, 'utf8');
  const cars = JSON.parse(content);
  if (!Array.isArray(cars)) throw new Error('Car listings data must be an array.');
  return cars;
}

function updateCars(mutator) {
  const operation = writeQueue.then(async () => {
    const cars = await readCars();
    const result = await mutator(cars);
    const temporaryFile = `${CARS_FILE}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(cars, null, 2)}\n`, { flag: 'wx' });
    await fs.rename(temporaryFile, CARS_FILE);
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

function isAuthorized(request) {
  if (!ADMIN_PASSWORD) return false;
  const authorization = request.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(ADMIN_PASSWORD);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function cleanText(value, field, maxLength, required = true) {
  if (typeof value !== 'string') throw Object.assign(new Error(`${field} must be text.`), { status: 400 });
  const cleaned = value.trim();
  if (required && !cleaned) throw Object.assign(new Error(`${field} is required.`), { status: 400 });
  if (cleaned.length > maxLength) throw Object.assign(new Error(`${field} is too long.`), { status: 400 });
  return cleaned;
}

function validateCar(body) {
  const year = Number(body.year);
  const price = Number(body.price);
  if (!Number.isInteger(year) || year < 1950 || year > 2099) throw Object.assign(new Error('Enter a valid model year.'), { status: 400 });
  if (!Number.isSafeInteger(price) || price < 0) throw Object.assign(new Error('Enter a valid price in PKR.'), { status: 400 });
  if (!body.image || typeof body.image !== 'string') throw Object.assign(new Error('A car photo is required.'), { status: 400 });
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.image);
  if (!match) throw Object.assign(new Error('Upload a JPG, PNG, or WebP photo.'), { status: 400 });
  const mimeType = match[1];
  const imageBuffer = Buffer.from(match[2], 'base64');
  if (imageBuffer.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('The photo must be 3 MB or smaller.'), { status: 413 });
  if (!IMAGE_TYPES[mimeType].signature(imageBuffer)) throw Object.assign(new Error('The uploaded photo does not match its file type.'), { status: 400 });

  return {
    make: cleanText(body.make, 'Make', 40),
    model: cleanText(body.model, 'Model', 50),
    year,
    price,
    mileage: cleanText(body.mileage, 'Mileage', 30),
    transmission: cleanText(body.transmission, 'Transmission', 30),
    city: cleanText(body.city, 'City', 40),
    description: cleanText(body.description || '', 'Description', 500, false),
    mimeType,
    imageBuffer
  };
}

async function handleApi(request, response, url) {
  if (url.pathname === '/api/cars' && request.method === 'GET') {
    await writeQueue;
    return sendJson(response, 200, await readCars());
  }

  if (url.pathname === '/api/admin/check' && request.method === 'POST') {
    return isAuthorized(request) ? response.writeHead(204).end() : sendError(response, 401, 'Incorrect admin password.');
  }

  if (url.pathname === '/api/cars' && request.method === 'POST') {
    if (!isAuthorized(request)) return sendError(response, 401, 'Sign in with the admin password to add cars.');
    const body = await readJson(request);
    const validated = validateCar(body);
    const id = crypto.randomUUID();
    const fileName = `${id}${IMAGE_TYPES[validated.mimeType].extension}`;
    await fs.writeFile(path.join(UPLOAD_DIR, fileName), validated.imageBuffer, { flag: 'wx' });
    const car = {
      id,
      make: validated.make,
      model: validated.model,
      year: validated.year,
      price: validated.price,
      mileage: validated.mileage,
      transmission: validated.transmission,
      city: validated.city,
      description: validated.description,
      imageUrl: `/uploads/${fileName}`,
      createdAt: new Date().toISOString()
    };
    try {
      await updateCars((cars) => cars.unshift(car));
    } catch (error) {
      await fs.unlink(path.join(UPLOAD_DIR, fileName)).catch((unlinkError) => {
        if (unlinkError.code !== 'ENOENT') console.error('Could not remove an unused upload:', unlinkError);
      });
      throw error;
    }
    return sendJson(response, 201, car);
  }

  const deleteMatch = /^\/api\/cars\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (deleteMatch && request.method === 'DELETE') {
    if (!isAuthorized(request)) return sendError(response, 401, 'Sign in with the admin password to delete cars.');
    const removed = await updateCars((cars) => {
      const index = cars.findIndex((car) => car.id === deleteMatch[1]);
      if (index < 0) return null;
      return cars.splice(index, 1)[0];
    });
    if (!removed) return sendError(response, 404, 'This car listing was not found.');
    const imagePath = path.join(UPLOAD_DIR, path.basename(removed.imageUrl));
    await fs.unlink(imagePath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return response.writeHead(204).end();
  }

  return sendError(response, 404, 'API endpoint not found.');
}

async function serveStatic(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendError(response, 400, 'Invalid URL path.');
  }
  if (pathname === '/') pathname = '/index.html';
  const allowedRootFiles = new Set(['/index.html', '/styles.css', '/app.js']);
  if (!allowedRootFiles.has(pathname) && !pathname.startsWith('/assets/') && !pathname.startsWith('/uploads/')) {
    return sendError(response, 404, 'File not found.');
  }
  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    return sendError(response, 403, 'Forbidden.');
  }

  let file;
  try {
    file = await fs.readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return sendError(response, 404, 'File not found.');
    throw error;
  }
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  response.end(file);
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      if (request.method === 'HEAD') {
        const headResponse = new http.ServerResponse(request);
        await serveStatic(request, headResponse, url);
        response.writeHead(headResponse.statusCode || 200, headResponse.getHeaders());
        return response.end();
      }
      await serveStatic(request, response, url);
    } else {
      sendError(response, 405, 'Method not allowed.');
    }
  } catch (error) {
    if (response.headersSent || response.destroyed) {
      console.error('Request failed after response started:', error);
      return;
    }
    console.error('Request failed:', error);
    sendError(response, error.status || 500, error.status ? error.message : 'The request could not be completed.');
  }
}

async function main() {
  if (!ADMIN_PASSWORD) {
    console.error('Set ADMIN_PASSWORD before starting UWN Motors so car listings are protected.');
    process.exitCode = 1;
    return;
  }
  await ensureStorage();
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`UWN Motors website is running at http://localhost:${PORT}`);
    console.log('Car images and listings are stored in uploads and data/cars.json.');
  });
}

main().catch((error) => {
  console.error('Could not start UWN Motors website:', error);
  process.exitCode = 1;
});
