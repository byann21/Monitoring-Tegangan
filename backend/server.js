require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Konfigurasi
const ESP32_API_KEY = process.env.ESP32_API_KEY;
const ALLOWED_DEVICES = process.env.ALLOWED_DEVICES.split(',');

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));

// Database
const db = new sqlite3.Database(path.join(__dirname, 'data.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    voltage REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Autentikasi ESP32
const authESP32 = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.body.apiKey;
  const deviceId = req.body.deviceId;
  
  if (!apiKey || apiKey !== ESP32_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  if (!ALLOWED_DEVICES.includes(deviceId)) {
    return res.status(403).json({ error: 'Device not authorized' });
  }
  
  next();
};

// Endpoint untuk ESP32
app.post('/api/data', authESP32, (req, res) => {
  const { deviceId, voltage } = req.body;
  
  if (!deviceId || voltage === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run(
    'INSERT INTO sensor_data (device_id, voltage) VALUES (?, ?)',
    [deviceId, voltage],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({ 
        success: true,
        id: this.lastID,
        timestamp: new Date().toISOString()
      });
    }
  );
});

// Endpoint untuk website
app.get('/api/data', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  
  db.all(
    'SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT ?',
    [limit],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json(rows);
    }
  );
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
