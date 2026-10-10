import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import {
  getCookie,
  getRequest,
  setResponseHeader,
} from '@tanstack/react-start/server';
import { currentAccount } from './google';
import { requireSameOrigin, secureOrigin } from './request-security';

// Possession of the old HttpOnly cookie was the original ownership proof.
// Claim it once, explicitly, without reading or uploading browser study data.
export const claimEarlierOwnership = createServerFn({ method: 'POST' }).handler(
  async () => {
    requireSameOrigin();
    setResponseHeader('Cache-Control', 'private, no-store');
    const account = await currentAccount();
    const token = getCookie('egbe_circle');
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      throw new Error(
        'No earlier circle cookie was found. Refresh to check your contributions.',
      );
    }
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(token),
    );
    const owner = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const guard =
      'EXISTS(SELECT 1 FROM legacy_ownership_claims WHERE legacy_owner = ? AND account_id = ?)';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO legacy_ownership_claims (legacy_owner, account_id, claimed_at)
         SELECT ?, ?, ?
         WHERE NOT EXISTS(SELECT 1 FROM auth_accounts WHERE id = ?)
           AND (EXISTS(SELECT 1 FROM study_circles WHERE owner = ?)
             OR EXISTS(SELECT 1 FROM study_materials WHERE owner = ?)
             OR EXISTS(SELECT 1 FROM check_ins WHERE owner = ?))
         ON CONFLICT(legacy_owner) DO NOTHING`,
      ).bind(owner, account.id, Date.now(), owner, owner, owner, owner),
      env.DB.prepare(
        `INSERT OR IGNORE INTO circle_members (circle_id, owner, joined_at)
         SELECT circle_id, ?, joined_at FROM circle_members
         WHERE owner = ? AND ${guard}`,
      ).bind(account.id, owner, owner, account.id),
      env.DB.prepare(
        `DELETE FROM circle_members WHERE owner = ? AND ${guard}`,
      ).bind(owner, owner, account.id),
      ...['study_circles', 'study_materials', 'check_ins'].map((table) =>
        env.DB.prepare(
          `UPDATE ${table} SET owner = ? WHERE owner = ? AND ${guard}`,
        ).bind(account.id, owner, owner, account.id),
      ),
    ]);
    const claim = await env.DB.prepare(
      'SELECT account_id FROM legacy_ownership_claims WHERE legacy_owner = ?',
    )
      .bind(owner)
      .first<{ account_id: string }>();
    if (claim?.account_id !== account.id) {
      throw new Error(
        'No unclaimed earlier ownership was found for this browser.',
      );
    }
    const secure = secureOrigin(new URL(getRequest().url));
    setResponseHeader(
      'Set-Cookie',
      `egbe_circle=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`,
    );
    return { claimed: true };
  },
);
