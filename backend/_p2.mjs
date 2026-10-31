import mongoose from 'mongoose';
import { connectDB } from './src/config/db.js';
import { Examination } from './src/models/index.js';
await connectDB();
const db = mongoose.connection.db;
for (let i = 0; i < 3; i++) {
  let t = Date.now(); await db.collection('examinations').findOne({}); const raw = Date.now() - t;
  t = Date.now(); await Examination.findOne().lean(); const m = Date.now() - t;
  t = Date.now(); await db.command({ ping: 1 }); console.log('raw', raw, 'model', m, 'ping', Date.now() - t);
}
await mongoose.disconnect();
