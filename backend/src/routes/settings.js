const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../utils/prisma');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const logosDir = path.join(__dirname, '../../uploads/logos');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(logosDir, { recursive: true });
    cb(null, logosDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safe = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';
    cb(null, `store-logo${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpeg|jpg|gif|webp)$/i.test(file.mimetype || '');
    cb(ok ? null : new Error('Only PNG, JPEG, GIF, or WebP images are allowed'), ok);
  },
});

router.get('/', async (req, res, next) => {
  try {
    const settings = await prisma.settings.findMany({ orderBy: { key: 'asc' } });
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
    res.json({ success: true, data: settingsMap });
  } catch (err) { next(err); }
});

router.post('/logo', authorize('ADMIN', 'PHARMACIST'), (req, res, next) => {
  upload.single('logo')(req, res, async (err) => {
    try {
      if (err) {
        const msg = err.message || 'Upload failed';
        return res.status(400).json({ success: false, message: msg });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }
      const rel = `/uploads/logos/${req.file.filename}`;
      await prisma.settings.upsert({
        where: { key: 'store_logo_url' },
        update: { value: rel },
        create: {
          key: 'store_logo_url',
          value: rel,
          description: 'Store logo path (served from /uploads)',
        },
      });
      res.json({ success: true, message: 'Logo saved', data: { store_logo_url: rel } });
    } catch (e) { next(e); }
  });
});

router.put('/', authorize('ADMIN'), async (req, res, next) => {
  try {
    const updates = req.body;
    const ops = Object.entries(updates).map(([key, value]) =>
      prisma.settings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    );
    await prisma.$transaction(ops);
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) { next(err); }
});

module.exports = router;
