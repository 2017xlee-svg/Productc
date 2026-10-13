import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { fetchRemoteImageBuffer, getFreshTeableUrls } from './server/teableProxy';
import { checkStorageConnection, uploadBufferToStorage, batchMigrateAllMediaServer, defaultBucket } from './server/storageServer';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ProductCompare Hub - Google Cloud Firestore Architecture',
  });
});

// App configuration & cloud status endpoint
app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    app: 'ProductCompare Hub',
    databaseType: 'local_first_firestore',
    projectId: 'fast-xenops-09v0l',
    databaseId: 'ai-studio-recordcompare-9b5993ac-3307-430e-af50-d0e625993029',
    firestoreNative: true,
    storageBucket: defaultBucket,
  });
});

// Storage health and bucket probe endpoint
app.get('/api/storage/status', async (req, res) => {
  const bucket = (req.query.bucket as string) || defaultBucket;
  const status = await checkStorageConnection(bucket);
  res.json(status);
});

// Direct server-side upload endpoint (avoids all browser CORS issues)
app.post('/api/storage/upload', async (req, res) => {
  try {
    const { base64Data, fileName, folder, contentType, customBucket } = req.body;
    if (!base64Data || !fileName) {
      return res.status(400).json({ success: false, error: 'base64Data and fileName are required' });
    }

    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const result = await uploadBufferToStorage(
      buffer,
      fileName,
      contentType || 'image/jpeg',
      folder || 'attachments',
      customBucket
    );

    if (!result) {
      return res.status(500).json({ success: false, error: 'Could not upload to Cloud Storage' });
    }

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Full database media migration executed server-side
app.post('/api/storage/migrate', async (req, res) => {
  try {
    const { database, customBucket } = req.body;
    const result = await batchMigrateAllMediaServer(database, customBucket);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Returns fresh Teable presigned URLs for all media attachments
app.get('/api/media/teable-fresh-urls', async (req, res) => {
  try {
    const freshMap = await getFreshTeableUrls();
    const obj: Record<string, string> = {};
    for (const [k, v] of freshMap.entries()) {
      obj[k] = v;
    }
    res.json({ success: true, count: Object.keys(obj).length, urls: obj });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// High-performance media proxy: resolves fresh Teable signatures & bypasses CORS for Cloud Storage uploads
app.get('/api/media/proxy', async (req, res) => {
  const url = (req.query.url as string) || '';
  const id = (req.query.id as string) || '';
  const name = (req.query.name as string) || '';

  if (!url && !id && !name) {
    return res.status(400).json({ error: 'Provide at least one of: url, id, name' });
  }

  const result = await fetchRemoteImageBuffer(url, id, name);
  if (!result) {
    return res.status(404).json({ error: 'Image could not be retrieved from remote source' });
  }

  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Length', result.buffer.length);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(result.buffer);
});

async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' || hasDist;

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
