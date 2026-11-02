import { Student, University } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { isDuplicateKeyError } from '../utils/helpers.js';
import { universityCache as activeCache } from '../services/cache.js';

/** Active university names, sorted (shared by the public list and registration check). */
export async function activeUniversityNames() {
  const hit = activeCache.get('all');
  if (hit) return hit;
  const list = await University.find({ isActive: true }).select('name').sort({ name: 1 }).collation({ locale: 'en' }).lean();
  return activeCache.set('all', list.map((u) => u.name));
}

const duplicate = () => AppError.conflict('This university is already in the list', 'UNIVERSITY_EXISTS');

export async function publicList(_req, res) {
  res.json({ success: true, data: await activeUniversityNames() });
}

export async function listUniversities(_req, res) {
  const [list, counts] = await Promise.all([
    University.find().sort({ name: 1 }).collation({ locale: 'en' }).lean(),
    Student.aggregate([{ $group: { _id: '$universityName', n: { $sum: 1 } } }]),
  ]);
  const byName = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({ success: true, data: list.map((u) => ({ ...u, students: byName.get(u.name) || 0 })) });
}

export async function createUniversity(req, res) {
  try {
    const u = await University.create({ name: req.body.name, isActive: req.body.isActive ?? true });
    activeCache.clear();
    res.status(201).json({ success: true, data: u });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw duplicate();
    throw err;
  }
}

export async function updateUniversity(req, res) {
  const u = await University.findById(req.params.id);
  if (!u) throw AppError.notFound('University not found');
  if (req.body.name !== undefined) u.name = req.body.name;
  if (req.body.isActive !== undefined) u.isActive = req.body.isActive;
  try {
    await u.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) throw duplicate();
    throw err;
  }
  activeCache.clear();
  res.json({ success: true, data: u });
}

export async function deleteUniversity(req, res) {
  const u = await University.findByIdAndDelete(req.params.id);
  if (!u) throw AppError.notFound('University not found');
  activeCache.clear();
  res.json({ success: true });
}
