const express = require('express');
const prisma = require('../utils/prisma');
const { authenticate, authorize, auditLog } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const RACKS_KEY = 'racks';

/** Load racks from settings — supports legacy string[] and new {name,description}[] */
async function getRacks() {
  const setting = await prisma.settings.findUnique({ where: { key: RACKS_KEY } });
  if (!setting) return [];
  try {
    const parsed = JSON.parse(setting.value);
    // Migrate legacy string array to object array
    return parsed.map(r => typeof r === 'string' ? { name: r, description: '' } : r);
  } catch { return []; }
}

async function saveRacks(racks) {
  await prisma.settings.upsert({
    where: { key: RACKS_KEY },
    create: { key: RACKS_KEY, value: JSON.stringify(racks), description: 'Rack / shelf locations for inventory' },
    update: { value: JSON.stringify(racks) },
  });
}

// GET /api/racks — list all racks with medicine counts
router.get('/', async (req, res, next) => {
  try {
    const racks = await getRacks();

    // Count medicines assigned to each rack
    const medicines = await prisma.medicine.findMany({
      where: { isActive: true, location: { not: null } },
      select: { location: true },
    });
    const countMap = {};
    for (const m of medicines) {
      if (m.location) countMap[m.location] = (countMap[m.location] || 0) + 1;
    }

    const data = racks.map(r => ({ ...r, medicineCount: countMap[r.name] || 0 }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /api/racks — add a rack
router.post('/', authorize('ADMIN', 'PHARMACIST'), auditLog('CREATE', 'Rack'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().toUpperCase();
    const description = String(req.body.description || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Rack name is required' });

    const racks = await getRacks();
    if (racks.find(r => r.name === name)) {
      return res.status(400).json({ success: false, message: `Rack "${name}" already exists` });
    }
    racks.push({ name, description });
    racks.sort((a, b) => a.name.localeCompare(b.name));
    await saveRacks(racks);
    res.json({ success: true, message: 'Rack added', data: racks });
  } catch (err) { next(err); }
});

// PUT /api/racks/:name — edit rack (rename and/or update description)
router.put('/:name', authorize('ADMIN', 'PHARMACIST'), auditLog('UPDATE', 'Rack'), async (req, res, next) => {
  try {
    const oldName = decodeURIComponent(req.params.name);
    const newName = String(req.body.name || '').trim().toUpperCase();
    const description = String(req.body.description || '').trim();

    if (!newName) return res.status(400).json({ success: false, message: 'Rack name is required' });

    const racks = await getRacks();
    const idx = racks.findIndex(r => r.name === oldName);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Rack not found' });

    // If renaming, ensure new name is unique
    if (newName !== oldName && racks.find(r => r.name === newName)) {
      return res.status(400).json({ success: false, message: `Rack "${newName}" already exists` });
    }

    // Update rack
    racks[idx] = { name: newName, description };

    // If renamed, update all medicines that used the old name
    if (newName !== oldName) {
      await prisma.medicine.updateMany({
        where: { location: oldName },
        data: { location: newName },
      });
    }

    racks.sort((a, b) => a.name.localeCompare(b.name));
    await saveRacks(racks);
    res.json({ success: true, message: 'Rack updated', data: racks });
  } catch (err) { next(err); }
});

// DELETE /api/racks/:name — remove a rack
router.delete('/:name', authorize('ADMIN'), auditLog('DELETE', 'Rack'), async (req, res, next) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const racks = await getRacks();
    const updated = racks.filter(r => r.name !== name);

    // Clear location from medicines that used this rack
    await prisma.medicine.updateMany({
      where: { location: name },
      data: { location: null },
    });

    await saveRacks(updated);
    res.json({ success: true, message: 'Rack deleted', data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
