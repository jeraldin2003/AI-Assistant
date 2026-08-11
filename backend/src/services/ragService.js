import crypto from 'crypto'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { OllamaEmbeddings, ChatOllama } from '@langchain/ollama'
import {
  qdrantClient,
  QDRANT_COLLECTION_NAME,
  ensureQdrantCollection,
} from '../config/qdrant.js'
import { findHash, savePdfHash, saveDocumentChunks } from '../models/hashModel.js'

// ─── Ollama clients ───────────────────────────────────────────────────────────

const OLLAMA_BASE_URL  = process.env.OLLAMA_BASE_URL  || 'http://localhost:11434'
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'
const OLLAMA_MODEL     = process.env.OLLAMA_MODEL     || 'llama3.2'

const embeddings = new OllamaEmbeddings({
  baseUrl: OLLAMA_BASE_URL,
  model: OLLAMA_EMBED_MODEL,
})

const llmReranker = new ChatOllama({
  baseUrl: OLLAMA_BASE_URL,
  model: OLLAMA_MODEL,
  temperature: 0,
})

// ─── Sparse vector helpers (feature-hashing BM25 proxy) ──────────────────────
//
// We do NOT maintain any in-memory corpus index.  Instead we use feature
// hashing to convert raw text into a sparse {indices, values} vector that
// Qdrant stores and searches on-disk.
//
// Algorithm:
//   1. Tokenise text (lowercase, strip punctuation, min length 2)
//   2. Hash each token with FNV-1a into a bucket inside [0, SPARSE_DIM)
//   3. The value for each bucket is the normalised term frequency
//
// Because both documents and queries are encoded the same way, the dot-product
// similarity computed by Qdrant's sparse engine is equivalent to a cosine
// over TF vectors — a practical approximation of BM25 without IDF.
// IDF would require corpus statistics; by storing all chunks in Qdrant we
// intentionally let Qdrant own that data so nothing lives in RAM.

const SPARSE_DIM = 30_000 // vocabulary bucket count

/**
 * FNV-1a 32-bit hash — fast, good distribution for short tokens.
 */
const fnv1a = (str) => {
  let hash = 2_166_136_261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619) >>> 0
  }
  return hash
}

/**
 * Tokenise text: lowercase → strip non-alphanumeric → split on whitespace
 * → drop tokens shorter than 2 chars.
 */
const tokenise = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)

/**
 * Build a sparse vector for `text`.
 * Returns { indices: number[], values: number[] } — the format Qdrant expects
 * for named sparse vectors.
 */
export const buildSparseVector = (text) => {
  const tokens = tokenise(text)
  if (tokens.length === 0) return { indices: [], values: [] }

  const freq = new Map()
  for (const token of tokens) {
    const idx = fnv1a(token) % SPARSE_DIM
    freq.set(idx, (freq.get(idx) ?? 0) + 1)
  }

  const normFactor = tokens.length
  const indices = []
  const values  = []
  for (const [idx, count] of freq) {
    indices.push(idx)
    values.push(count / normFactor) // normalised TF
  }
  return { indices, values }
}

// ─── PDF processing ───────────────────────────────────────────────────────────

/**
 * Process a single PDF file end-to-end:
 *  1. Extract text with pdf-parse
 *  2. SHA-256 hash the raw buffer
 *  3. Deduplicate via PostgreSQL pdf_hashes table
 *  4. Chunk with LangChain RecursiveCharacterTextSplitter
 *  5. For each chunk: generate dense (Ollama) + sparse (feature-hash) vectors
 *  6. Upsert both vector types into Qdrant (one point per chunk)
 *  7. Persist chunk text in PostgreSQL document_chunks
 */
export const processPdfFile = async (fileBuffer, filename, userId) => {
  // 1. Parse PDF
  const pdfData = await pdfParse(fileBuffer)
  const pdfText = pdfData.text ?? ''

  if (!pdfText.trim()) {
    throw new Error(`PDF '${filename}' contains no readable text.`)
  }

  // 2. Content hash (deduplication key)
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

  // 3. Duplicate check
  const existing = await findHash(fileHash)
  if (existing) {
    return {
      filename,
      fileHash,
      status: 'skipped',
      message: 'Duplicate PDF — content hash already exists.',
    }
  }

  // 4. Chunk
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  })
  const rawDocs = await splitter.createDocuments([pdfText], [{ filename, fileHash }])

  if (rawDocs.length === 0) {
    throw new Error(`No chunks could be generated from '${filename}'.`)
  }

  // 5. Ensure Qdrant collection has the hybrid schema (dense + sparse).
  //    We probe vector size from a sample embedding so the collection is
  //    sized correctly for the configured Ollama model.
  const sampleVec = await embeddings.embedQuery('init')
  await ensureQdrantCollection(sampleVec.length)

  // 6. Build points and persist chunk text concurrently per batch
  const points       = []
  const chunkRecords = []

  for (let i = 0; i < rawDocs.length; i++) {
    const chunkText = rawDocs[i].pageContent
    const pointId   = crypto.randomUUID()

    // Dense embedding (Ollama)
    const denseVector  = await embeddings.embedQuery(chunkText)
    // Sparse BM25-proxy vector (computed locally, stored on-disk in Qdrant)
    const sparseVector = buildSparseVector(chunkText)

    const payload = {
      filename,
      pdfHash:    fileHash,
      chunkIndex: i,
      text:       chunkText,
    }

    points.push({
      id:     pointId,
      vector: {
        dense:  denseVector,
        sparse: sparseVector, // { indices, values }
      },
      payload,
    })

    chunkRecords.push({
      pdfHash:    fileHash,
      chunkIndex: i,
      content:    chunkText,
      metadata:   payload,
    })
  }

  // Upsert to Qdrant — all vectors stored server-side, nothing kept in RAM
  try {
    await qdrantClient.upsert(QDRANT_COLLECTION_NAME, { wait: true, points })
  } catch (err) {
    console.warn(`[Qdrant] Upsert warning: ${err.message}`)
  }

  // Persist chunk text to PostgreSQL (for audit / admin inspection)
  await saveDocumentChunks(chunkRecords)
  await savePdfHash(fileHash, filename, rawDocs.length, userId)

  return {
    filename,
    fileHash,
    status:      'processed',
    chunksCount: rawDocs.length,
    message:     'PDF chunked, embedded (dense + sparse) and stored in Qdrant.',
  }
}

// ─── Hybrid retrieval + Ollama reranking ──────────────────────────────────────

/**
 * Retrieve the top-K most relevant chunks for `queryText` using Qdrant's
 * native hybrid search followed by Ollama LLM reranking.
 *
 * Pipeline (all computation happens inside Qdrant — zero in-memory corpus):
 *  Step 1 — Prefetch dense:   Qdrant ANN search on the "dense" named vector
 *  Step 2 — Prefetch sparse:  Qdrant sparse dot-product on the "sparse" vector
 *  Step 3 — Fusion:           Qdrant server-side RRF over both prefetch lists
 *  Step 4 — Rerank:           Ollama LLM scores each candidate (0-10) and we
 *                             return the top-K by that score (fallback: RRF order)
 */
export const retrieveTopChunks = async (queryText, topK = 5) => {
  if (!queryText?.trim()) throw new Error('A non-empty query string is required.')

  // Generate query representations
  const [denseQueryVec, sparseQueryVec] = await Promise.all([
    embeddings.embedQuery(queryText),
    Promise.resolve(buildSparseVector(queryText)),
  ])

  // ── Qdrant hybrid query ──────────────────────────────────────────────────
  // One round-trip to Qdrant; it runs both searches in parallel internally
  // and fuses them with RRF before returning the merged, scored list.
  let candidates = []
  try {
    const result = await qdrantClient.query(QDRANT_COLLECTION_NAME, {
      prefetch: [
        {
          // Leg 1: dense semantic search
          query: denseQueryVec,
          using: 'dense',
          limit: 20,
        },
        {
          // Leg 2: sparse keyword search
          query: sparseQueryVec, // { indices, values }
          using: 'sparse',
          limit: 20,
        },
      ],
      // Qdrant fuses both prefetch results with Reciprocal Rank Fusion
      query:        { fusion: 'rrf' },
      limit:        topK * 2,   // fetch double so reranking has room to work
      with_payload: true,
    })

    candidates = (result.points ?? []).map((p) => ({
      id:      p.id,
      content: p.payload?.text ?? '',
      metadata: p.payload ?? {},
      rrfScore: p.score,
    }))
  } catch (err) {
    console.warn(`[Qdrant] Hybrid query warning: ${err.message}`)
  }

  if (candidates.length === 0) return []

  // ── Ollama LLM reranker ──────────────────────────────────────────────────
  // Send the top candidates (max 10 to keep the prompt small) to the LLM for
  // fine-grained relevance scoring.  On any failure we fall back gracefully
  // to the RRF order returned by Qdrant.
  try {
    const pool = candidates.slice(0, 10)

    const prompt =
      `You are a search-result relevance expert.\n` +
      `Query: "${queryText}"\n\n` +
      `Score each candidate's relevance to the query on a scale of 0–10.\n` +
      `Return ONLY a valid JSON array, e.g.:\n` +
      `[{"index":0,"score":9.2},{"index":1,"score":3.1}]\n\n` +
      `Candidates:\n` +
      pool
        .map((c, i) => `[${i}]: ${c.content.replace(/\n/g, ' ').slice(0, 300)}`)
        .join('\n\n')

    const response     = await llmReranker.invoke(prompt)
    const responseText = typeof response === 'string' ? response : response.content

    const jsonMatch = responseText.match(/\[\s*\{[\s\S]*?\}\s*\]/)?.[0]
    if (jsonMatch) {
      const scores = JSON.parse(jsonMatch)
      for (const { index, score } of scores) {
        if (pool[index]) pool[index].rerankScore = score
      }
      pool.sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0))
    }

    return pool.slice(0, topK).map((chunk, rank) => ({
      rank:        rank + 1,
      content:     chunk.content,
      metadata:    chunk.metadata,
      rrfScore:    chunk.rrfScore,
      rerankScore: chunk.rerankScore ?? null,
    }))
  } catch (err) {
    console.warn(`[Ollama Reranker] Warning: ${err.message}. Using RRF order.`)

    // Graceful fallback — return Qdrant's RRF ranking unchanged
    return candidates.slice(0, topK).map((chunk, rank) => ({
      rank:        rank + 1,
      content:     chunk.content,
      metadata:    chunk.metadata,
      rrfScore:    chunk.rrfScore,
      rerankScore: null,
    }))
  }
}
