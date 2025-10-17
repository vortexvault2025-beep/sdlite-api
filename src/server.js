import 'dotenv/config';
import express from 'express';
import labelsRouter from './routes/labels.js';
import a4Router from './routes/a4.js';
import datapackRouter from './routes/datapack.js';
import ordersRouter from './routes/orders.js';

const app = express();

// Optional API key guard (enabled only if X_API_KEY is set)
const API_KEY = process.env.X_API_KEY;
app.use((req, res, next) => {
  if (!API_KEY) return next();
  const got = req.get('X-Api-Key');
  if (got && got === API_KEY) return next();
  return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/readyz', (_req, res) => res.json({ ok: true }));

// Mount routers (order not important)
app.use(labelsRouter);
app.use(a4Router);
app.use(datapackRouter);
app.use(ordersRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`sdlite-api listening on http://localhost:${port}`));
