const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('请通过环境变量 ACCESS_TOKEN 设置访问口令，例如: ACCESS_TOKEN=你的口令 node server.js');
  process.exit(1);
}
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const MAX_IMAGE_MB = parseInt(process.env.MAX_IMAGE_MB || '10', 10);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'droplink.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    sender TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )
`);

const insertMsg = db.prepare(
  'INSERT INTO messages (type, content, sender, created_at) VALUES (?, ?, ?, ?)'
);
const getMsg = db.prepare('SELECT * FROM messages WHERE id = ?');
const listRecent = db.prepare(
  'SELECT * FROM messages ORDER BY id DESC LIMIT ?'
);
const listBefore = db.prepare(
  'SELECT * FROM messages WHERE id < ? ORDER BY id DESC LIMIT ?'
);

// 口令不直接放进 cookie，存其哈希
const SESSION_TOKEN = crypto
  .createHash('sha256')
  .update('droplink:' + ACCESS_TOKEN)
  .digest('hex');

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function isAuthed(req) {
  return timingSafeEqual(req.cookies?.dl_token || '', SESSION_TOKEN);
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

const app = express();
app.use(cookieParser());
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!timingSafeEqual(password || '', ACCESS_TOKEN)) {
    return res.status(401).json({ error: '口令错误' });
  }
  res.cookie('dl_token', SESSION_TOKEN, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 365 * 24 * 3600 * 1000,
  });
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ authed: isAuthed(req) });
});

app.get('/api/messages', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
  const before = parseInt(req.query.before || '0', 10);
  const rows = before > 0 ? listBefore.all(before, limit) : listRecent.all(limit);
  rows.reverse();
  res.json({ messages: rows });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.png').toLowerCase().slice(0, 10);
      cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext);
    },
  }),
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'));
  },
});

app.post('/api/upload', requireAuth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `图片不能超过 ${MAX_IMAGE_MB}MB` : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: '未收到图片' });
    const msg = saveAndBroadcast('image', '/uploads/' + req.file.filename, req.body.sender || '');
    res.json({ ok: true, message: msg });
  });
});

app.use('/uploads', (req, res, next) => {
  if (!isAuthed(req)) return res.status(401).end();
  next();
}, express.static(UPLOAD_DIR, { maxAge: '365d', immutable: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim().split('=').map(decodeURIComponent))
      .filter((p) => p.length === 2)
  );
  if (!timingSafeEqual(cookies.dl_token || '', SESSION_TOKEN)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

function saveAndBroadcast(type, content, sender) {
  const info = insertMsg.run(type, content, String(sender).slice(0, 32), Date.now());
  const msg = getMsg.get(info.lastInsertRowid);
  broadcast({ kind: 'message', message: msg });
  return msg;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.kind === 'text') {
      const content = String(data.content || '').trim().slice(0, 20000);
      if (content) saveAndBroadcast('text', content, data.sender || '');
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`droplink 已启动: http://localhost:${PORT}  数据目录: ${DATA_DIR}`);
});
