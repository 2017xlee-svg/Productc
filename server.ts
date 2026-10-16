import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { fetchRemoteImageBuffer, getFreshTeableUrls } from './server/teableProxy.ts';
import { checkStorageConnection, uploadBufferToStorage, batchMigrateAllMediaServer, defaultBucket, firebaseConfigData } from './server/storageServer.ts';

const app = express();

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
    projectId: firebaseConfigData.projectId || 'gen-lang-client-0152097172',
    databaseId: firebaseConfigData.firestoreDatabaseId || 'ai-studio-recordcompare-9b5993ac-3307-430e-af50-d0e625993029',
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
  const isProduction = process.env.NODE_ENV === 'production' && hasDist;

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Fallback for all SPA page requests in development
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        if (vite) vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const DEFAULT_PORT = 3000;
  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : null;

  // Primary listener on port 3000
  const server3000 = app.listen(DEFAULT_PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${DEFAULT_PORT}`);
  });
  server3000.on('error', (err: any) => {
    if (err.code !== 'EADDRINUSE') {
      console.error('Port 3000 error:', err);
    }
  });

  // Rollout listener for Cloud Run deployment where process.env.PORT is 8080 or other
  if (envPort && envPort !== DEFAULT_PORT) {
    try {
      const serverEnv = app.listen(envPort, '0.0.0.0', () => {
        console.log(`Deployment rollout server running on http://0.0.0.0:${envPort}`);
      });
      serverEnv.on('error', (err: any) => {
        if (err.code !== 'EADDRINUSE') {
          console.warn(`Port ${envPort} warning:`, err.message);
        }
      });
    } catch {
      // safely ignore
    }
  }
}

startServer();
