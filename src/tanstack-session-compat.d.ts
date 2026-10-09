// start-server-core 1.169.39 omits this private union from session.d.ts.
// Its published src/session.ts:11 defines the exact union below. Remove when
// upstream declarations include it; do not bypass library type checking.
type _Algorithm = 'aes-128-ctr' | 'aes-256-cbc' | 'sha256';
