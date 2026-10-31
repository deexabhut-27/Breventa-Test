// Strips keys that could be interpreted as MongoDB operators ($gt, $where, a.b paths)
// from user-supplied bodies and params. Express 5's default "simple" query parser
// never produces nested objects, and all queries are validated with Zod.
function clean(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor') continue;
    out[k] = clean(v, depth + 1);
  }
  return out;
}

export function sanitizeInput(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  if (req.params) {
    for (const k of Object.keys(req.params)) {
      if (typeof req.params[k] !== 'string') delete req.params[k];
    }
  }
  next();
}
