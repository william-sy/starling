'use strict';
import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

// ── Public endpoint — called by the app before showing any purchase UI ────────
// GET /api/mwt/flags/paid-available?country=DE
// Returns: { paid_available: true, launch_date: null }
// Unknown countries default to free-only.
export function createPublicFlagsRouter(pool: Pool): Router {
  const r = Router();

  r.get('/paid-available', async (req: Request, res: Response) => {
    const cc = String(req.query.country || '').toUpperCase().slice(0, 2);
    if (!cc) { res.json({ paid_available: false, launch_date: null }); return; }

    const { rows } = await pool.query(
      `SELECT paid_available, launch_date
       FROM mwt_country_availability WHERE country_code = $1`,
      [cc]
    );
    // Unknown country → free-only
    const row = rows[0] ?? { paid_available: false, launch_date: null };
    res.json({
      country_code:   cc,
      paid_available: row.paid_available,
      launch_date:    row.launch_date ?? null,
    });
  });

  return r;
}

// ── Admin router — manage country flags ──────────────────────────────────────
export function createAdminFlagsRouter(pool: Pool): Router {
  const r = Router();

  // List all countries (known + unknown ROW)
  r.get('/', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT ca.*, COUNT(w.id) AS waitlist_count
       FROM mwt_country_availability ca
       LEFT JOIN mwt_waitlist w ON w.country_code = ca.country_code AND w.notified_at IS NULL
       GROUP BY ca.country_code
       ORDER BY ca.paid_available DESC, ca.country_code`
    );
    res.json(rows);
  });

  // Enable or disable paid tier for a country, optionally set a launch date
  r.patch('/:code', async (req: Request, res: Response) => {
    const cc   = req.params.code.toUpperCase().slice(0, 2);
    const { paid_available, launch_date, notes } = req.body;
    const user = (req as any).user?.sub || 'admin';

    await pool.query(
      `INSERT INTO mwt_country_availability
         (country_code, paid_available, launch_date, notes, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (country_code) DO UPDATE SET
         paid_available = EXCLUDED.paid_available,
         launch_date    = COALESCE(EXCLUDED.launch_date, mwt_country_availability.launch_date),
         notes          = COALESCE(EXCLUDED.notes, mwt_country_availability.notes),
         updated_at     = NOW(),
         updated_by     = EXCLUDED.updated_by`,
      [cc, paid_available ?? false, launch_date ?? null, notes ?? null, user]
    );

    res.json({ ok: true, country_code: cc, paid_available });
  });

  return r;
}
