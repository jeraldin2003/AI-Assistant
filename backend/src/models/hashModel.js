import db from '../config/db.js'

export const findHash = async (fileHash) => {
  const query = 'SELECT * FROM pdf_hashes WHERE file_hash = $1 LIMIT 1'
  const { rows } = await db.query(query, [fileHash])
  return rows[0] || null
}

export const savePdfHash = async (fileHash, filename, chunkCount, userId) => {
  const query = `
    INSERT INTO pdf_hashes (file_hash, filename, chunk_count, uploaded_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `
  const { rows } = await db.query(query, [fileHash, filename, chunkCount, userId || null])
  return rows[0]
}

export const saveDocumentChunks = async (chunks) => {
  if (!chunks || chunks.length === 0) return []

  // Batch insert chunks
  const values = []
  const valueStrings = []

  chunks.forEach((chunk, index) => {
    const offset = index * 4
    valueStrings.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`)
    values.push(chunk.pdfHash, chunk.chunkIndex, chunk.content, JSON.stringify(chunk.metadata || {}))
  })

  const query = `
    INSERT INTO document_chunks (pdf_hash, chunk_index, content, metadata)
    VALUES ${valueStrings.join(', ')}
    RETURNING *
  `
  const { rows } = await db.query(query, values)
  return rows
}


