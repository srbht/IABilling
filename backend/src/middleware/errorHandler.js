const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err.name === 'PrismaClientValidationError') {
    const isDev = process.env.NODE_ENV !== 'production';
    const firstLine = (err.message || '').split('\n').map((l) => l.trim()).find(Boolean) || 'Invalid database request';
    const migrateHint =
      ' If this mentions an unknown field or model, stop the API and run from the backend folder: npx prisma migrate deploy && npx prisma generate';
    return res.status(400).json({
      success: false,
      message: isDev ? `${firstLine}${migrateHint}` : 'Invalid data sent to the database. Contact support if this persists.',
      ...(isDev && err.message && err.message !== firstLine ? { detail: err.message } : {}),
    });
  }

  // Prisma errors
  if (err.code === 'P2002') {
    const t = err.meta?.target;
    const fields = Array.isArray(t) ? t.join(', ') : (t || 'field');
    const hint = /sku/i.test(String(fields))
      ? ' Use a different SKU — each product must have its own unique code.'
      : '';
    return res.status(409).json({
      success: false,
      message: `Duplicate value for: ${fields}.${hint}`,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }

  if (err.code === 'P2003') {
    return res.status(400).json({ success: false, message: 'Related record not found' });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }

  if (err.code === 'PRISMA_CLIENT_STALE') {
    return res.status(503).json({
      success: false,
      message: err.message,
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : message,
  });
};

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { errorHandler, AppError };
