require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Configuration ---
const ESP32_API_KEY = process.env.ESP32_API_KEY || "default_esp32_secret";
const ALLOWED_DEVICE_IDS = process.env.ESP32_DEVICE_IDS ? 
  process.env.ESP32_DEVICE_IDS.split(',') : 
  ["ESP32_001"];

// --- Middleware ---
const corsOptions = {
  origin: [
    'https://monitoring-tegangan.vercel.app',
    /\.vercel\.app$/,
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
  maxAge: 86400
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));

// --- Database Setup ---
const dbPath = path.join(__dirname, 'voltage_data.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS voltage_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    voltage REAL NOT NULL,
    min_voltage REAL,
    max_voltage REAL,
    avg_voltage REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS welding_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    device_id TEXT NOT NULL,
    start_time DATETIME,
    end_time DATETIME,
    min_voltage REAL,
    max_voltage REAL,
    avg_voltage REAL,
    duration INTEGER,
    operator TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_device_timestamp 
          ON voltage_readings (device_id, timestamp)`);
});

// --- WebSocket Server ---
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

function broadcastData(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// --- Authentication Middleware ---
const authenticateESP32 = (req, res, next) => {
  const apiKey = req.body.apiKey || req.headers['x-api-key'];
  const deviceId = req.body.deviceId;
  
  if (!apiKey || apiKey !== ESP32_API_KEY) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid or missing API key' 
    });
  }
  
  if (deviceId && !ALLOWED_DEVICE_IDS.includes(deviceId)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Device not authorized'
    });
  }
  
  next();
};

// --- Routes ---

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    devices: ALLOWED_DEVICE_IDS
  });
});

// ESP32 Voltage Data Endpoint
app.post('/api/voltage', authenticateESP32, (req, res) => {
  const { deviceId, voltage } = req.body;
  
  if (!deviceId || voltage === undefined) {
    return res.status(400).json({ 
      error: 'Bad Request',
      message: 'Missing required fields: deviceId and voltage',
      required: ['deviceId', 'voltage'],
      received: Object.keys(req.body)
    });
  }

  const timestamp = req.body.timestamp || new Date().toISOString();
  const minVoltage = req.body.minVoltage || null;
  const maxVoltage = req.body.maxVoltage || null;
  const avgVoltage = req.body.avgVoltage || null;
  
  const stmt = db.prepare(`
    INSERT INTO voltage_readings (
      device_id, 
      voltage, 
      min_voltage, 
      max_voltage, 
      avg_voltage, 
      timestamp
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run([
    deviceId, 
    voltage, 
    minVoltage, 
    maxVoltage, 
    avgVoltage,
    timestamp
  ], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Failed to save data',
        details: err.message
      });
    }
    
    const responseData = {
      success: true,
      id: this.lastID,
      timestamp,
      deviceId
    };

    res.json(responseData);

    broadcastData({
      type: 'voltage_update',
      ...responseData,
      voltage,
      minVoltage,
      maxVoltage,
      avgVoltage
    });
  });
  
  stmt.finalize();
});

// ESP32 Statistics Endpoint
app.get('/api/esp32/stats', authenticateESP32, (req, res) => {
  const deviceId = req.query.deviceId || ALLOWED_DEVICE_IDS[0];
  const timeRange = req.query.range || '1h';
  
  let timeCondition = '';
  switch(timeRange) {
    case '1h': timeCondition = "AND timestamp >= datetime('now', '-1 hour')"; break;
    case '24h': timeCondition = "AND timestamp >= datetime('now', '-1 day')"; break;
    case '7d': timeCondition = "AND timestamp >= datetime('now', '-7 days')"; break;
    case '30d': timeCondition = "AND timestamp >= datetime('now', '-30 days')"; break;
  }
  
  db.get(`
    SELECT 
      COUNT(*) as total_readings,
      MIN(voltage) as min_voltage,
      MAX(voltage) as max_voltage,
      AVG(voltage) as avg_voltage,
      MIN(timestamp) as first_reading,
      MAX(timestamp) as last_reading
    FROM voltage_readings 
    WHERE device_id = ? 
    ${timeCondition}
  `, [deviceId], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ 
        error: 'Database error',
        details: err.message
      });
    }
    
    res.json({
      deviceId,
      timeRange,
      ...row
    });
  });
});

// Existing routes (keep your original implementations)
app.get('/api/voltage/latest', (req, res) => { /* ... */ });
app.get('/api/voltage/history', (req, res) => { /* ... */ });
app.get('/api/voltage/stats', (req, res) => { /* ... */ });
app.post('/api/welding/start', (req, res) => { /* ... */ });
app.post('/api/welding/end', (req, res) => { /* ... */ });
app.get('/api/welding/sessions', (req, res) => { /* ... */ });

// --- Error Handling ---
app.use('/api/voltage', (err, req, res, next) => {
  if (req.headers['user-agent'] && req.headers['user-agent'].includes('ESP32')) {
    return res.status(500).json({
      error: 'Internal Error',
      message: 'ESP32_ERROR:' + err.message.substring(0, 50)
    });
  }
  next(err);
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!'
  });
});

// --- Server Startup ---
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running on port 8080`);
  console.log(`Allowed ESP32 devices: ${ALLOWED_DEVICE_IDS.join(', ')}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

// --- Graceful Shutdown ---
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  
  server.close(() => {
    console.log('HTTP server closed.');
  });
  
  wss.close(() => {
    console.log('WebSocket server closed.');
  });
  
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});
