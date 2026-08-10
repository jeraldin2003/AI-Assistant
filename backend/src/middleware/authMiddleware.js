import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'

dotenv.config()

const JWT_SECRET = process.env.JWT_SECRET || 'please-set-a-strong-secret'

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token is required.' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    return next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired authorization token.' })
  }
}

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' })
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' })
    }

    return next()
  }
}
