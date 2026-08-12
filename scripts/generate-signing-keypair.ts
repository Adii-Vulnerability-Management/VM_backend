import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function generateSigningKeyPair() {
  console.log('\n🔐 Generating Ed25519 key pair...\n');

  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  });

  // ── Key ID ────────────────────────────────────────────────────────
  const now = new Date();
  const keyId = `grc3-ed25519-key-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // ── Write public key to keys/ folder ──────────────────────────────
  const keysDir = path.resolve(__dirname, '../keys');
  const publicKeyPath = path.join(keysDir, 'public-key.pem');

  fs.mkdirSync(keysDir, { recursive: true });
  fs.writeFileSync(publicKeyPath, publicKey, 'utf8');

  // ── Print everything to console ───────────────────────────────────
  console.log('✅ Public key saved to: keys/public-key.pem');
  console.log('   (Safe to commit. Safe to serve publicly.)\n');

  console.log('━'.repeat(60));
  console.log('🔑 PRIVATE KEY — Copy this into your .env file now');
  console.log('   NEVER save this to any file inside the repo');
  console.log('━'.repeat(60));
  console.log(privateKey);
  console.log('━'.repeat(60));

  console.log('\n📋 Key Metadata:');
  console.log(`   Key ID    : ${keyId}`);
  console.log(`   Algorithm : Ed25519`);
  console.log(`   Created   : ${now.toISOString()}`);

  console.log('\n📌 What to do next:');
  console.log('   1. Copy the PRIVATE KEY printed above');
  console.log('   2. Add it to your .env file as shown below');
  console.log('   3. Do NOT close this terminal until you have saved it\n');

  console.log('━'.repeat(60));
  console.log('Add these to your .env file:');
  console.log('━'.repeat(60));
  console.log(`CONSENT_SIGNING_KEY_ID=${keyId}`);
  console.log(`CONSENT_SIGNING_ALGORITHM=Ed25519`);
  console.log(`USE_AWS_SECRETS_MANAGER=false`);
  console.log(
    `CONSENT_SIGNING_PRIVATE_KEY="<paste the private key here as single line with \\n>"\n`,
  );
}

generateSigningKeyPair();