'use strict';
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

export function createLegalRouter(pool: Pool): Router {
  const r = Router();

  // ── Public: fetch current version of a page ────────────────────────────────
  // Used by the client app to display ToS/Privacy Policy at signup and in settings.
  r.get('/current/:type', async (req: Request, res: Response) => {
    const valid = ['terms_of_service', 'privacy_policy', 'age_gate_text'];
    if (!valid.includes(req.params.type)) {
      res.status(400).json({ error: 'invalid page type' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT version, content_md, effective_at
       FROM mwt_legal_pages
       WHERE page_type = $1 AND effective_at <= CURRENT_DATE
       ORDER BY effective_at DESC
       LIMIT 1`,
      [req.params.type]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(rows[0]);
  });

  // ── Admin: list all versions ───────────────────────────────────────────────
  r.get('/:type', async (req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT id, version, effective_at, published_by, created_at
       FROM mwt_legal_pages WHERE page_type = $1 ORDER BY effective_at DESC`,
      [req.params.type]
    );
    res.json(rows);
  });

  // ── Admin: get specific version content ───────────────────────────────────
  r.get('/:type/:version', async (req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT * FROM mwt_legal_pages WHERE page_type = $1 AND version = $2`,
      [req.params.type, req.params.version]
    );
    res.json(rows[0] ?? null);
  });

  // ── Admin: publish new version ─────────────────────────────────────────────
  r.post('/:type', async (req: Request, res: Response) => {
    const { version, content_md, effective_at, published_by } = req.body || {};
    if (!version || !content_md || !effective_at) {
      res.status(400).json({ error: 'version, content_md, effective_at required' });
      return;
    }
    const valid = ['terms_of_service', 'privacy_policy', 'age_gate_text'];
    if (!valid.includes(req.params.type)) {
      res.status(400).json({ error: 'invalid page type' });
      return;
    }
    await pool.query(
      `INSERT INTO mwt_legal_pages (page_type, version, content_md, effective_at, published_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.type, version, content_md, effective_at, published_by ?? null]
    );
    res.json({ ok: true });
  });

  return r;
}
