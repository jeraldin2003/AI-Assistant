import dotenv from 'dotenv'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { createUser, getUserByEmail } from '../models/userModel.js'

dotenv.config()

const JWT_SECRET = process.env.JWT_SECRET || 'please-set-a-strong-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'
const signupRoles = ['guest', 'user']
const defaultRole = 'user'

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
    },
  )
}

export const signup = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const requestedRole = role ? String(role).toLowerCase() : defaultRole

    if (requestedRole === 'admin') {
      return res.status(403).json({ error: 'Admin role cannot be assigned via signup.' })
    }

    if (!signupRoles.includes(requestedRole)) {
      return res.status(400).json({ error: `Role must be one of: ${signupRoles.join(', ')}` })
    }

    const existingUser = await getUserByEmail(normalizedEmail)
    if (existingUser) {
      return res.status(409).json({ error: 'A user with that email already exists.' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await createUser({
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: requestedRole,
    })

    const token = generateToken(user)
    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    })
  } catch (error) {
    next(error)
  }
}

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    const normalizedEmail = String(email).toLowerCase().trim()
    const user = await getUserByEmail(normalizedEmail)

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials.' })
    }

    const token = generateToken(user)
    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    })
  } catch (error) {
    next(error)
  }
}
