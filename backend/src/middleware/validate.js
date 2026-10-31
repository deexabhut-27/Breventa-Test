import { AppError } from '../utils/AppError.js';

/**
 * Validates req.body / req.query / req.params with Zod schemas.
 * Parsed (coerced, stripped) values replace the body and are exposed on req.valid.
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(AppError.badRequest(details[0]?.message || 'Invalid request', 'VALIDATION_ERROR', details));
    }
    req.valid[key] = result.data;
    if (key === 'body') req.body = result.data;
  }
  return next();
};
