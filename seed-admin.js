/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@vm.local';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
const FIRST_NAME = 'Super';
const LAST_NAME = 'Admin';

async function main() {
  const MONGO_URL = process.env.MONGODB_URL;
  if (!MONGO_URL) throw new Error('MONGODB_URL missing in .env');

  await mongoose.connect(MONGO_URL);
  const db = mongoose.connection;
  const users = db.collection('users');
  const counters = db.collection('counters');

  const email = EMAIL.trim().toLowerCase();

  const existing = await users.findOne({
    email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    is_deleted: { $ne: true },
  });

  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    await mongoose.connection.close();
    process.exit(0);
  }

  const counterRes = await counters.findOneAndUpdate(
    { name: 'user_id' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  const user_id = Number(counterRes.value?.seq || 1);

  const objectId = new mongoose.Types.ObjectId();
  const user_uuid = objectId.toString();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const now = new Date();

  const doc = {
    _id: objectId,
    user_id,
    user_uuid,
    email,
    password: passwordHash,
    employeeId: null,
    first_name: FIRST_NAME,
    last_name: LAST_NAME,
    user_name: `${FIRST_NAME} ${LAST_NAME}`,
    profile_img_path: null,
    address: null,
    contact_number: 'NA',
    vendor_uuid: null,
    client_uuid: null,
    tprmVendorSchedule: null,
    tprmClientSchedule: null,
    isPasswordChanged: true,
    emailVerified: true,
    mfaEnabled: false,
    afterLoginMfaVerified: null,
    admin_email: null,
    admin: null,
    admin_uuid: null,
    resources: [],
    roles: ['SUPER_ADMIN'],
    permissionKeys: [],
    is_superuser: true,
    is_staff: true,
    is_active: true,
    is_deleted: false,
    date_joined: now,
    last_login: null,
    createdAt: now,
    updatedAt: now,
  };

  await users.insertOne(doc);

  console.log('\n✅ Admin user created:');
  console.log({ email, password: PASSWORD, roles: doc.roles });

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed:', err.message || err);
  process.exit(1);
});
