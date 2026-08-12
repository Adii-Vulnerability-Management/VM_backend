/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const readline = require('readline');

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, (ans) => resolve(ans)));
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Keep it simple + consistent
const ACCOUNT_TYPES = [
  'SUPER_ADMIN',
  'ADMIN',
  'TENANT_ADMIN',
  'EMPLOYEE',
  'REVIEWER',
  'ASSIGNER',
  'TPRM_VENDOR_LEAD_RESPONDER',
  'TPRM_CLIENT_LEAD_REVIEWER',
];

function configForAccountType(type) {
  const t = String(type || '')
    .trim()
    .toUpperCase();

  const base = {
    is_superuser: false,
    is_staff: false,
    roles: [],
    permissionKeys: [],
    resources: [],
  };

  switch (t) {
    case 'SUPER_ADMIN':
      return {
        ...base,
        is_superuser: true,
        is_staff: true,
        roles: ['SUPER_ADMIN'],
        permissionKeys: [],
      };

    case 'ADMIN':
      return {
        ...base,
        is_superuser: false,
        is_staff: true,
        roles: ['ADMIN'],
        permissionKeys: [],
      };

    case 'TENANT_ADMIN':
      return {
        ...base,
        is_superuser: false,
        is_staff: false,
        roles: ['TENANT_ADMIN'],
        permissionKeys: ['access.roles.assign'],
      };

    case 'REVIEWER':
      return { ...base, roles: ['REVIEWER'] };

    case 'ASSIGNER':
      return { ...base, roles: ['ASSIGNER'] };

    case 'TPRM_VENDOR_LEAD_RESPONDER':
      return { ...base, roles: ['TPRM_VENDOR_LEAD_RESPONDER'] };

    case 'TPRM_CLIENT_LEAD_REVIEWER':
      return { ...base, roles: ['TPRM_CLIENT_LEAD_REVIEWER'] };

    case 'EMPLOYEE':
    default:
      return { ...base, roles: ['EMPLOYEE'] };
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const MONGO_URL = process.env.MONGODB_URL;
    if (!MONGO_URL) throw new Error('MONGODB_URL missing in .env');

    await mongoose.connect(MONGO_URL);
    const db = mongoose.connection;

    const users = db.collection('users');
    const counters = db.collection('counters');

    console.log('\n=== Create New User (MongoDB) ===\n');

    const emailRaw = await ask(rl, 'Email: ');
    const passwordRaw = await ask(rl, 'Password (min 8): ');
    const first_name = await ask(rl, 'First name (optional): ');
    const last_name = await ask(rl, 'Last name (optional): ');

    console.log('\nAccount Types:');
    ACCOUNT_TYPES.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));

    const accountTypeRaw = await ask(
      rl,
      '\nChoose Account Type (enter name like ADMIN or number 1..n): ',
    );

    const contact_number = await ask(rl, 'Contact number (optional): ');

    const defaultTenant = String(process.env.DEFAULT_TENANT_ID || '').trim();
    const tenant_id_raw = await ask(
      rl,
      defaultTenant
        ? `Tenant ID (optional, default from DEFAULT_TENANT_ID="${defaultTenant}"): `
        : 'Tenant ID (e.g. acme-tenant — recommended for multi-tenant): ',
    );
    const tenant_id = String(tenant_id_raw || '').trim() || defaultTenant || null;

    const admin_email_raw = await ask(rl, 'Admin email (optional): ');
    const admin_id_raw = await ask(rl, 'Admin numeric id (optional): ');
    const admin_uuid_raw = await ask(rl, 'Admin uuid (optional): ');

    const email = String(emailRaw || '')
      .trim()
      .toLowerCase();
    const password = String(passwordRaw || '');

    if (!email) throw new Error('Email is required.');
    if (password.length < 8)
      throw new Error('Password must be at least 8 characters.');

    let accountType = String(accountTypeRaw || '').trim();

    if (/^\d+$/.test(accountType)) {
      const idx = Number(accountType) - 1;
      if (idx < 0 || idx >= ACCOUNT_TYPES.length)
        throw new Error('Invalid account type number.');
      accountType = ACCOUNT_TYPES[idx];
    } else {
      accountType = accountType.toUpperCase();
      if (!ACCOUNT_TYPES.includes(accountType)) {
        throw new Error(
          `Invalid account type. Use one of: ${ACCOUNT_TYPES.join(', ')}`,
        );
      }
    }

    const existing = await users.findOne({
      email: { $regex: new RegExp(`^${escapeRegExp(email)}$`, 'i') },
      is_deleted: { $ne: true },
    });

    if (existing) {
      throw new Error(`User already exists with email: ${email}`);
    }

    const counterRes = await counters.findOneAndUpdate(
      { name: 'user_id' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );

    const user_id = Number(counterRes.value?.seq || 1);

    // ✅ FIX: SAME ObjectId for _id and user_uuid
    const objectId = new mongoose.Types.ObjectId();
    const user_uuid = objectId.toString();

    const passwordHash = await bcrypt.hash(password, 12);

    const fn = String(first_name || '').trim();
    const ln = String(last_name || '').trim();
    const user_name = fn || ln ? `${fn} ${ln}`.trim() : email.split('@')[0];

    const now = new Date();

    const rbac = configForAccountType(accountType);

    const doc = {
      _id: objectId, // ✅ same as user_uuid
      user_id,
      user_uuid,

      email,
      password: passwordHash,

      employeeId: null,
      first_name: fn || '',
      last_name: ln || '',
      user_name,

      profile_img_path: null,
      address: null,
      contact_number: String(contact_number || '').trim() || 'NA',

      ...(tenant_id ? { tenant_id } : {}),

      vendor_uuid: null,
      client_uuid: null,
      tprmVendorSchedule: null,
      tprmClientSchedule: null,

      isPasswordChanged: false,
      emailVerified: false,
      mfaEnabled: false,
      afterLoginMfaVerified: null,

      admin_email: String(admin_email_raw || '').trim() || null,
      admin:
        admin_id_raw && String(admin_id_raw).trim()
          ? Number(admin_id_raw)
          : null,
      admin_uuid: String(admin_uuid_raw || '').trim() || null,

      resources: Array.isArray(rbac.resources) ? rbac.resources : [],
      roles: Array.isArray(rbac.roles) ? rbac.roles : [],
      permissionKeys: Array.isArray(rbac.permissionKeys)
        ? rbac.permissionKeys
        : [],

      is_superuser: !!rbac.is_superuser,
      is_staff: !!rbac.is_staff,
      is_active: true,
      is_deleted: false,

      date_joined: now,
      last_login: null,

      createdAt: now,
      updatedAt: now,
    };

    await users.insertOne(doc);

    console.log('\n✅ User created successfully!\n');
    console.log({
      user_id: doc.user_id,
      user_uuid: doc.user_uuid,
      email: doc.email,
      user_name: doc.user_name,
      tenant_id: doc.tenant_id ?? null,
      roles: doc.roles,
      is_superuser: doc.is_superuser,
      is_staff: doc.is_staff,
      is_active: doc.is_active,
    });
  } catch (err) {
    console.error('\n❌ Failed:', err.message || err);
  } finally {
    rl.close();
    try {
      await mongoose.connection.close();
    } catch {}
    process.exit(0);
  }
}

main();
