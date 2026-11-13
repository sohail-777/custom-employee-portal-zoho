require('dotenv').config();
const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET) { console.error('JWT_SECRET is missing in backend/.env'); process.exit(1); }

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/roles', require('./routes/roleRoutes'));
app.use('/api/departments', require('./routes/departmentRoutes'));
app.use('/api/activity', require('./routes/activityRoutes'));
app.use('/api/zoho', require('./routes/zohoRoutes'));
app.use('/api', require('./routes/applicationRoutes'));

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ message: 'Internal server error' }); });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Employee Portal API running on http://localhost:${PORT}`);
  require('./services/provisioningService').start();
});
