import db from '../config/db.js'

export const createUser = async ({ name, email, password, role }) => {
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at`,
    [name, email, password, role],
  )
  return rows[0]
}

export const getUserByEmail = async (email) => {
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email])
  return rows[0]
}

export const getUserById = async (id) => {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id])
  return rows[0]
}
