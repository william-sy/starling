'use strict';
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { sendGdprConfirmation } from '../email';

export function createGdprRouter(pool: Pool): Router {
  const r = Router();

  // ── Incoming request (from public-facing form or in-app request) ──────────
  // This endpoint is public — no auth. Called by the client app or a web form.
  r.post('/request', async (req: Request, res: Response) => {
    const { request_type, account_pin, email } = req.body || {};
    const valid = ['erasure', 'portability', 'access', 'rectification', 'restriction'];
    if (!valid.includes(request_type) || !email) {
      res.status(400).json({ error: 'request_type and email are required' });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO mwt_gdpr_requests (request_type, account_pin, email)
       VALUES ($1, $2, $3)
       RETURNING id, due_at`,
      [request_type, account_pin ?? null, email]
    );
    const req_row = rows[0];

    // Confirm receipt to the requester
    sendGdprConfirmation({
      to: email,
      requestType: request_type,
      dueDate: new Date(req_row.due_at).toISOString().slice(0, 10),
      referenceId: req_row.id,
    }).catch(() => {});

    res.json({ ok: true, reference: req_row.id });
  });

  // ── Admin: list open requests ──────────────────────────────────────────────
  r.get('/', async (_req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT *, (due_at < NOW()) AS overdue
       FROM mwt_gdpr_requests
       WHERE status NOT IN ('completed','rejected')
       ORDER BY due_at ASC`
    );
    res.json(rows);
  });

  // ── Admin: update status ───────────────────────────────────────────────────
  r.patch('/:id', async (req: Request, res: Response) => {
    const { status, notes, handler } = req.body || {};
    const valid = ['pending', 'in_progress', 'completed', 'rejected'];
    if (!valid.includes(status)) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }

    await pool.query(
      `UPDATE mwt_gdpr_requests
       SET status = $1,
           notes = COALESCE($2, notes),
           handler = COALESCE($3, handler),
           completed_at = CASE WHEN $1 IN ('completed','rejected') THEN NOW() ELSE completed_at END
       WHERE id = $4`,
      [status, notes ?? null, handler ?? null, req.params.id]
    );

    // For erasure requests: soft-delete the customer record
    if (status === 'completed') {
      const { rows } = await pool.query(
        `SELECT account_pin FROM mwt_gdpr_requests WHERE id = $1`,
        [req.params.id]
      );
      if (rows[0]?.account_pin) {
        await pool.query(
          `UPDATE mwt_customers SET deleted_at = NOW(), email = '[erased]' WHERE account_pin = $1`,
          [rows[0].account_pin]
        );
      }
    }

    res.json({ ok: true });
  });

  return r;
}
