const axios = require('axios');
const FormData = require('form-data');
const xlsx = require('xlsx');

const FILE = './imports/control34.xlsx';
const FRAMEWORK_ID = '69d392ec1428b53ad1a78704';
const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoiYWNjZXNzIiwiZW1haWwiOiJzaHJhZGRoYS5rQGtyaXRpa2FsaGlyZS5jb20iLCJ1c2VyX2lkIjoxNzcwOTcyODcxMDY5LCJzZXNzaW9uaWQiOiI5ZTUzOThmMTQwZGVjN2UyOGRjNGM4ZjgwZDg1MGY5NjY2YmYxZGZkZTg1MDUzNDEiLCJpYXQiOjE3NzU1NTk5NjQsImV4cCI6MTc3NTU2NzE2NH0.ASkCyjr9j8Hnlul14cMoYyw7OWlOPQUKmEMUN6ehaow'; // set TOKEN=<access_token>
const BASE = 'https://dev.grc3.io/priv';
const TENANT = 'acme-tenant';

const wb = xlsx.readFile(FILE);
const rows = xlsx.utils.sheet_to_json(wb.Sheets[0], { defval: '' });

(async () => {
  for (const r of rows) {
    const form = new FormData();
    // optional, but harmless
    form.append('_id', FRAMEWORK_ID);

    form.append('controlcode', String(r.controlcode));
    form.append('controlname', String(r.controlname));
    form.append('controldescription', String(r.controldescription));
    form.append('controlcategory', String(r.controlcategory));
    form.append('scopetype', String(r.scopetype));
    form.append(
      'is_custom',
      String(r.is_custom === true || r.is_custom === 'true'),
    );
    form.append(
      'is_enabled',
      String(r.is_enabled === true || r.is_enabled === 'true'),
    );
    form.append('frameworks[]', FRAMEWORK_ID); // relation

    try {
      await axios.post(`${BASE}/frame-controls`, form, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'x-tenant-id': TENANT,
          ...form.getHeaders(),
        },
      });
      console.log('Added:', r.controlcode);
    } catch (e) {
      console.error('Failed:', r.controlcode, e.response?.data || e.message);
    }
  }
})();
