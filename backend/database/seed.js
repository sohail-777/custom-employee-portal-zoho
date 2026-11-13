// Creates the database, tables and sample data.  Run: npm run seed
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const PERMISSIONS = ['view_users', 'create_users', 'edit_users', 'delete_users', 'view_roles', 'manage_roles',
  'view_zoho_people', 'view_zoho_crm', 'view_zoho_desk', 'view_zoho_books',
  'view_audit_logs', 'view_activity', 'manage_departments', 'connect_zoho'];
const ROLES = {
  Admin: PERMISSIONS,
  HR: ['view_zoho_people'],
  Sales: ['view_zoho_crm'],
  Support: ['view_zoho_desk'],
  Finance: ['view_zoho_books'],
  Manager: [], // configurable by Admin from the portal
};
const USERS = [
  ['Admin User', 'admin@test.com', 'Admin@123', 'Administration', 'Admin'],
  ['Rahul', 'rahul@test.com', 'Rahul@123', 'Human Resources', 'HR'],
  ['Amit', 'amit@test.com', 'Amit@123', 'Sales', 'Sales'],
  ['Priya', 'priya@test.com', 'Priya@123', 'Support', 'Support'],
  ['John', 'john@test.com', 'John@123', 'Finance', 'Finance'],
  ['Meera', 'meera@test.com', 'Meera@123', 'Operations', 'Manager'],
];

(async () => {
  const db = process.env.DB_NAME || 'employee_portal';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\`; USE \`${db}\`;`);
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const permId = {}, roleId = {};
  for (const p of PERMISSIONS) permId[p] = (await conn.query('INSERT INTO permissions (permission_name) VALUES (?)', [p]))[0].insertId;
  for (const [role, perms] of Object.entries(ROLES)) {
    roleId[role] = (await conn.query('INSERT INTO roles (role_name) VALUES (?)', [role]))[0].insertId;
    for (const p of perms) await conn.query('INSERT INTO role_permissions VALUES (?, ?)', [roleId[role], permId[p]]);
  }
  for (const [name, email, pw, dept, role] of USERS) {
    const hash = await bcrypt.hash(pw, 10);
    const [r] = await conn.query('INSERT INTO users (name, email, password, department) VALUES (?,?,?,?)', [name, email, hash, dept]);
    await conn.query('INSERT INTO user_roles VALUES (?, ?)', [r.insertId, roleId[role]]);
  }
  console.log(`Database "${db}" seeded.`);
  USERS.forEach((u) => console.log(`  ${u[4].padEnd(8)} ${u[1]} / ${u[2]}`));
  await conn.end();
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
