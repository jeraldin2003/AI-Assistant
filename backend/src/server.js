import dotenv from 'dotenv'
import app from './index.js'

dotenv.config()

const PORT = process.env.PORT || 4000

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
