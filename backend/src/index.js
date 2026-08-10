import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/authRoutes.js'
import {verifyToken} from './middleware/authMiddleware.js'
dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())
app.use('/api/auth', authRoutes)
app.use(verifyToken)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error.' })
})

export default app
