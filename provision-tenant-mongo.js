/* eslint-disable no-console */
/**
 * Register a tenant id in MongoDB for operations / future app wiring.
 *
 * The Node backend does not ship a single "tenants" master model; tenant is
 * an opaque string (e.g. acme-tenant) carried on documents via tenantId /
 * tenant_id and the x-tenant-id header. This script upserts a lightweight
 * registry document so you have a canonical list of provisioned tenants.
 *
 * After running, for Dataflow privacy seeds you can call:
 *   POST /<API_PREFIX>/dataflow/admin/seed
 *   Header: x-tenant-id: <your-tenant-id>
 *
 * Usage:
 *   node provision-tenant-mongo.js <tenantId> [displayName]
 *
 * Example:
 *   node provision-tenant-mongo.js contoso-tenant "Contoso Ltd"
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const tenantId = String(process.argv[2] || '').trim();
  const displayName = String(process.argv[3] || '').trim() || tenantId;

  if (!tenantId) {
    console.error(
      '\nUsage: node provision-tenant-mongo.js <tenantId> [displayName]\n',
    );
    process.exit(1);
  }

  const MONGO_URL = process.env.MONGODB_URL;
  if (!MONGO_URL) throw new Error('MONGODB_URL missing in .env');

  await mongoose.connect(MONGO_URL);
  const tenants = mongoose.connection.collection('tenants');
  const now = new Date();

  const res = await tenants.updateOne(
    { tenantId },
    {
      $set: { displayName, updatedAt: now, active: true },
      $setOnInsert: { tenantId, createdAt: now },
    },
    { upsert: true },
  );

  console.log('\n✅ Tenant registry upsert complete\n', {
    tenantId,
    displayName,
    matched: res.matchedCount,
    modified: res.modifiedCount,
    upserted: res.upsertedCount,
  });
  console.log(
    '\nNext steps (manual):\n' +
      '  • Set NEXT_PUBLIC_TENANT_ID (or user cookie tenant_id) on the frontend.\n' +
      '  • Seed Dataflow framework topics/maps: POST .../dataflow/admin/seed with header x-tenant-id.\n' +
      '  • Optionally add tenant_id to Mongo users + JWT if you want auth-bound tenancy.\n',
  );
}

(async () => {
  try {
    await main();
  } catch (e) {
    console.error('\n❌ Failed:', e.message || e);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.connection.close();
    } catch {}
    process.exit(process.exitCode || 0);
  }
})();
