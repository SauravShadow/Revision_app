import express from 'express';
import multer from 'multer';
import { makeId } from '@revision-app/shared';
import { verifySession, verifyFileToken } from '@revision-app/shared/server';
import { writeBlob, readBlob, deleteBlob, isValidBlobId } from './blobStore';
import { sweepUnreferenced } from './gc';

const MAX_UPLOAD = 25 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD } });

function sessionUserId(req: express.Request): string | null {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token) {
    const session = verifySession(token);
    if (session) return session.userId;
  }
  const qToken = typeof req.query.token === 'string' ? req.query.token : null;
  if (qToken) return verifyFileToken(qToken);
  return null;
}

export function createApp() {
  const app = express();
  app.use(express.json());

  app.post('/upload', upload.single('file'), async (req, res) => {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'no file' });
    if (!ALLOWED.has(file.mimetype)) return res.status(400).json({ error: 'unsupported type' });

    const id = makeId();
    await writeBlob(id, file.buffer, { name: file.originalname || id, mime: file.mimetype, size: file.size }, userId);
    res.json({ id, url: `/api/files/${id}`, name: file.originalname || id, mime: file.mimetype, size: file.size });
  });

  app.get('/:id', async (req, res) => {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).end();
    if (!isValidBlobId(req.params.id)) return res.status(400).end();
    const blob = await readBlob(req.params.id, userId);
    if (!blob) return res.status(404).end();
    res.set('Content-Type', blob.meta.mime);
    res.set('Content-Disposition', `inline; filename="${blob.meta.name.replace(/"/g, '')}"`);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(blob.bytes);
  });

  app.delete('/:id', async (req, res) => {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).end();
    if (!isValidBlobId(req.params.id)) return res.status(400).end();
    await deleteBlob(req.params.id, userId);
    res.status(204).end();
  });

  app.post('/gc', async (req, res) => {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const referencedIds: string[] = Array.isArray(req.body?.referencedIds) ? req.body.referencedIds : [];
    const result = await sweepUnreferenced(new Set(referencedIds), userId);
    res.json(result);
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(4003, () => console.log('files-service listening on 4003'));
}
