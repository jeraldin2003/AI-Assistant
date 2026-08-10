import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const { Client } = pg

const rawDbUrl = process.env.DATABASE_URL
if (!rawDbUrl) {
  console.error('Missing DATABASE_URL in environment')
  process.exit(1)
}

const sslOpt = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false

const getTargetDbName = (urlString) => {
  try {
    const u = new URL(urlString)
    const name = u.pathname ? u.pathname.replace(/^\//, '') : ''
    return name || process.env.DATABASE_NAME || 'ai_assistant_db'
  } catch (e) {
    return process.env.DATABASE_NAME || 'ai_assistant_db'
  }
}

const targetDb = getTargetDbName(rawDbUrl)

const ensureDatabase = async () => {
  // Connect to default postgres DB to create the target database if needed
  let adminUrl
  try {
    const u = new URL(rawDbUrl)
    u.pathname = '/postgres'
    adminUrl = u.toString()
  } catch (e) {
    adminUrl = rawDbUrl
  }

  const adminClient = new Client({ connectionString: adminUrl, ssl: sslOpt })
  try {
    await adminClient.connect()
    try {
      await adminClient.query(`CREATE DATABASE "${targetDb}"`)
      console.log(`Database '${targetDb}' created.`)
    } catch (err) {
      // Postgres duplicate database error code is 42P04
      if (err && (err.code === '42P04' || /already exists/i.test(err.message))) {
        console.log(`Database '${targetDb}' already exists. Skipping creation.`)
      } else {
        throw err
      }
    }
  } finally {
    await adminClient.end().catch(() => {})
  }
}

const ensureTables = async () => {
  // Ensure connection string points to target DB
  let targetUrl = rawDbUrl
  try {
    const u = new URL(rawDbUrl)
    if (!u.pathname || u.pathname === '/') {
      u.pathname = '/' + targetDb
      targetUrl = u.toString()
    }
  } catch (e) {
    // fallback: append
    if (!rawDbUrl.endsWith('/')) targetUrl = `${rawDbUrl}/${targetDb}`
    else targetUrl = `${rawDbUrl}${targetDb}`
  }

  const client = new Client({ connectionString: targetUrl, ssl: sslOpt })
  try {
    await client.connect()

    const createUsers = `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT now()
    )`

    try {
      await client.query(createUsers)
      console.log('Ensured table: users')
    } catch (err) {
      console.error('Error creating users table:', err.message || err)
      throw err
    }

    // Add additional table creation here as needed
  } finally {
    await client.end().catch(() => {})
  }
}

;(async () => {
  try {
    console.log('Initializing database...')
    await ensureDatabase()
    await ensureTables()
    console.log('Database initialization complete.')
    process.exit(0)
  } catch (err) {
    console.error('Database initialization failed:', err)
    process.exit(1)
  }
})()
