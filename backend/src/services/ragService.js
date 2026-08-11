import dotenv from 'dotenv'
dotenv.config()
import crypto from 'crypto'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse') // CJS module — must use createRequire in ESM

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { OllamaEmbeddings, ChatOllama } from '@langchain/ollama'
import {
  qdrantClient,
  QDRANT_COLLECTION_NAME,
  ensureQdrantCollection,
} from '../config/qdrant.js'
import { findHash, savePdfHash, saveDocumentChunks } from '../models/hashModel.js'

// ─── Ollama clients ───────────────────────────────────────────────────────────

const OLLAMA_BASE_URL    = process.env.OLLAMA_BASE_URL    || 'http://localhost:11434'
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'
const OLLAMA_MODEL       = process.env.OLLAMA_MODEL       || 'llama3.2'

// How many embedding requests we let run concurrently against Ollama.
// Kept for potential future use; embedDocuments handles batching internally.

const embeddings = new OllamaEmbeddings({
  baseUrl: OLLAMA_BASE_URL,
  model: OLLAMA_EMBED_MODEL,
})

const llmReranker = new ChatOllama({
  baseUrl: OLLAMA_BASE_URL,
  model: OLLAMA_MODEL,
  temperature: 0,
})

// ─── Embedding dimension cache ─────────────────────────────────────────────
//
// The dense vector size only depends on OLLAMA_EMBED_MODEL, which doesn't
// change at runtime, so we probe it once per process (lazily, on first use)
// instead of on every single PDF upload.

let cachedEmbeddingDim = null

const getEmbeddingDim = async () => {
  if (cachedEmbeddingDim === null) {
    const sampleVec = await embeddings.embedQuery('init')
    cachedEmbeddingDim = sampleVec.length
  }
  return cachedEmbeddingDim
}

let qdrantCollectionEnsured = false

const withTimeout = (promise, ms, label) => {
  if (!ms || Number.isNaN(Number(ms)) || ms <= 0) return promise
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
    promise
      .then((val) => {
        clearTimeout(t)
        resolve(val)
      })
      .catch((err) => {
        clearTimeout(t)
        reject(err)
      })
  })
}

const chunkArray = (arr, size) => {
  const result = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

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
 *  5. For each chunk: generate dense (Ollama, parallelized) + sparse
 *     (feature-hash, synchronous) vectors
 *  6. Upsert both vector types into Qdrant (one point per chunk)
 *  7. Persist chunk text in PostgreSQL document_chunks
 */
export const processPdfFile = async (fileBuffer, filename, userId) => {
  const t0 = Date.now()

  // 1) Content hash (deduplication key) — compute before parsing.
  //    For duplicate uploads this avoids a potentially expensive `pdf-parse`.
  console.log(`[Upload] '${filename}' starting. bytes=${fileBuffer?.length ?? 0}`)
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

  // 2) Duplicate check
  const tHash = Date.now()
  const existing = await findHash(fileHash)
  console.log(`[Upload] '${filename}' hash+dedup check took ${Date.now() - tHash}ms`)
  if (existing) {
    return {
      filename,
      fileHash,
      status: 'skipped',
      message: 'Duplicate PDF — content hash already exists.',
    }
  }

  // 3) Parse PDF — pdfParse(buffer) is the real pdf-parse API (plain async fn)
  const PDF_PARSE_MAX_PAGES =
    process.env.PDF_PARSE_MAX_PAGES !== undefined
      ? Number(process.env.PDF_PARSE_MAX_PAGES)
      : undefined

  const parseOptions = PDF_PARSE_MAX_PAGES ? { max: PDF_PARSE_MAX_PAGES } : undefined
  const tParse = Date.now()
  const pdfParseTimeoutMs =
    process.env.PDF_PARSE_TIMEOUT_MS !== undefined
      ? Number(process.env.PDF_PARSE_TIMEOUT_MS)
      : 120_000
  const pdfData = await withTimeout(
    pdfParse(fileBuffer, parseOptions),
    pdfParseTimeoutMs,
    'pdf-parse'
  )
  const pdfText = pdfData.text ?? ''
  console.log(`[Upload] pdf-parse '${filename}' took ${Date.now() - tParse}ms`)

  if (!pdfText.trim()) {
    throw new Error(`PDF '${filename}' contains no readable text.`)
  }

  // 4) Chunk
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  })
  const rawDocs = await splitter.createDocuments([pdfText], [{ filename, fileHash }])
  console.log(`[Upload] '${filename}' chunking produced raw=${rawDocs.length}`)

  if (rawDocs.length === 0) {
    throw new Error(`No chunks could be generated from '${filename}'.`)
  }

  // Safety cap: very large PDFs can generate thousands of chunks, causing
  // uploads to look “stuck” while embeddings + SQL + Qdrant churns.
  const MAX_CHUNKS_PER_PDF =
    process.env.MAX_CHUNKS_PER_PDF !== undefined
      ? Number(process.env.MAX_CHUNKS_PER_PDF)
      : 500

  const limitedDocs =
    rawDocs.length > MAX_CHUNKS_PER_PDF ? rawDocs.slice(0, MAX_CHUNKS_PER_PDF) : rawDocs

  if (limitedDocs.length !== rawDocs.length) {
    console.warn(
      `[Upload] '${filename}' produced ${rawDocs.length} chunks; limiting to ${limitedDocs.length}. Set MAX_CHUNKS_PER_PDF to override.`
    )
  }

  // 5. Ensure Qdrant collection has the hybrid schema (dense + sparse).
  //    Dimension is cached after the first call in this process, so this
  //    no longer costs an extra Ollama round-trip on every upload.
  const OLLAMA_INIT_TIMEOUT_MS =
    process.env.OLLAMA_INIT_TIMEOUT_MS !== undefined
      ? Number(process.env.OLLAMA_INIT_TIMEOUT_MS)
      : 20_000
  console.log(`[Upload] '${filename}' probing embedding dim (timeout=${OLLAMA_INIT_TIMEOUT_MS}ms)`)
  const embeddingDim = await withTimeout(
    getEmbeddingDim(),
    OLLAMA_INIT_TIMEOUT_MS,
    'ollama embedQuery(init)'
  )
  console.log(`[Upload] '${filename}' embedding dim = ${embeddingDim}`)
  if (!qdrantCollectionEnsured) {
    const QDRANT_INIT_TIMEOUT_MS =
      process.env.QDRANT_INIT_TIMEOUT_MS !== undefined
        ? Number(process.env.QDRANT_INIT_TIMEOUT_MS)
        : 20_000
    console.log(`[Upload] '${filename}' ensuring qdrant collection (timeout=${QDRANT_INIT_TIMEOUT_MS}ms)`)
    await withTimeout(
      ensureQdrantCollection(embeddingDim),
      QDRANT_INIT_TIMEOUT_MS,
      'qdrant ensureQdrantCollection'
    )
    console.log(`[Upload] '${filename}' qdrant collection ensured`)
    qdrantCollectionEnsured = true
  }

  const chunkTexts = limitedDocs.map((d) => d.pageContent)

  const OLLAMA_EMBED_BATCH_SIZE =
    process.env.OLLAMA_EMBED_BATCH_SIZE !== undefined
      ? Number(process.env.OLLAMA_EMBED_BATCH_SIZE)
      : 50

  const OLLAMA_EMBED_TIMEOUT_MS =
    process.env.OLLAMA_EMBED_TIMEOUT_MS !== undefined
      ? Number(process.env.OLLAMA_EMBED_TIMEOUT_MS)
      : 120_000

  const QDRANT_UPSERT_BATCH_SIZE =
    process.env.QDRANT_UPSERT_BATCH_SIZE !== undefined
      ? Number(process.env.QDRANT_UPSERT_BATCH_SIZE)
      : 50

  const QDRANT_UPSERT_TIMEOUT_MS =
    process.env.QDRANT_UPSERT_TIMEOUT_MS !== undefined
      ? Number(process.env.QDRANT_UPSERT_TIMEOUT_MS)
      : 120_000

  // Default to `true` so upload doesn't return before Qdrant indexing finishes.
  // Still, batching keeps each request small enough to avoid “stuck” behaviour.
  const QDRANT_UPSERT_WAIT = process.env.QDRANT_UPSERT_WAIT !== 'false'

  // Process in batches to keep memory + request payloads bounded.
  const chunkCount = chunkTexts.length

  for (let start = 0; start < chunkTexts.length; start += QDRANT_UPSERT_BATCH_SIZE) {
    const end = Math.min(chunkTexts.length, start + QDRANT_UPSERT_BATCH_SIZE)
    const batchTexts = chunkTexts.slice(start, end)
    const batchIndexOffset = start
    console.log(
      `[Upload] '${filename}' embedding+upsert batch chunks=${batchTexts.length} (idx ${batchIndexOffset}-${batchIndexOffset + batchTexts.length - 1})`
    )

    // Dense vectors (Ollama) in smaller sub-batches.
    const denseVectors = []
    const tEmbedBatch = Date.now()
    for (const sub of chunkArray(batchTexts, OLLAMA_EMBED_BATCH_SIZE)) {
      const tSub = Date.now()
      const subDense = await withTimeout(
        embeddings.embedDocuments(sub),
        OLLAMA_EMBED_TIMEOUT_MS,
        'ollama embedDocuments'
      )
      console.log(
        `[Upload] '${filename}' embed sub-batch size=${sub.length} took ${Date.now() - tSub}ms`
      )
      denseVectors.push(...subDense)
    }
    console.log(`[Upload] '${filename}' embeddings for batch took ${Date.now() - tEmbedBatch}ms`)

    // Sparse vectors (cheap, synchronous).
    const sparseVectors = batchTexts.map(buildSparseVector)

    // Assemble Qdrant points for just this batch.
    const points = []
    const chunkRecords = []

    for (let i = 0; i < batchTexts.length; i++) {
      const chunkText = batchTexts[i]
      const pointId = crypto.randomUUID()
      const chunkIndex = batchIndexOffset + i

      const payload = {
        filename,
        pdfHash: fileHash,
        chunkIndex,
        text: chunkText,
      }

      points.push({
        id: pointId,
        vector: {
          dense: denseVectors[i],
          sparse: sparseVectors[i], // { indices, values }
        },
        payload,
      })

      chunkRecords.push({
        pdfHash: fileHash,
        chunkIndex,
        content: chunkText,
        metadata: payload,
      })
    }

    try {
      const tQdrant = Date.now()
      await withTimeout(
        qdrantClient.upsert(QDRANT_COLLECTION_NAME, {
          wait: QDRANT_UPSERT_WAIT,
          points,
        }),
        QDRANT_UPSERT_TIMEOUT_MS,
        'qdrant upsert'
      )
      console.log(`[Upload] '${filename}' Qdrant upsert batch took ${Date.now() - tQdrant}ms`)
    } catch (err) {
      console.warn(`[Qdrant] Upsert warning: ${err.message}`)
    }

    // Write chunk text to Postgres for this batch.
    const tDb = Date.now()
    const dbInsertTimeoutMs =
      process.env.POSTGRES_INSERT_TIMEOUT_MS !== undefined
        ? Number(process.env.POSTGRES_INSERT_TIMEOUT_MS)
        : 120_000
    await withTimeout(
      saveDocumentChunks(chunkRecords),
      dbInsertTimeoutMs,
      'postgres insert'
    )
    console.log(`[Upload] '${filename}' Postgres insert batch took ${Date.now() - tDb}ms`)
  }

  const dbPdfHashTimeoutMs =
    process.env.POSTGRES_PDFHASH_INSERT_TIMEOUT_MS !== undefined
      ? Number(process.env.POSTGRES_PDFHASH_INSERT_TIMEOUT_MS)
      : 60_000
  await withTimeout(
    savePdfHash(fileHash, filename, chunkCount, userId),
    dbPdfHashTimeoutMs,
    'postgres savePdfHash'
  )

  console.log(`[Upload] '${filename}' total took ${Date.now() - t0}ms`)

  return {
    filename,
    fileHash,
    status:      'processed',
    chunksCount: chunkCount,
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