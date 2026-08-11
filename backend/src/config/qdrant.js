import { QdrantClient } from '@qdrant/js-client-rest'
import dotenv from 'dotenv'

dotenv.config()

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333'
export const QDRANT_COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'pdf_documents'

export const qdrantClient = new QdrantClient({ url: QDRANT_URL })

/**
 * Ensure the Qdrant collection exists with the correct schema for hybrid search:
 *   - "dense"  : named dense vector   (Ollama embeddings, Cosine similarity)
 *   - "sparse" : named sparse vector  (feature-hash BM25, on-disk index)
 *
 * If the collection already exists with the OLD single-vector schema (no named
 * vectors), it is recreated automatically so the hybrid query API works.
 */
export const ensureQdrantCollection = async (vectorSize = 768) => {
  try {
    const collections = await qdrantClient.getCollections()
    const exists = collections.collections.some(
      (c) => c.name === QDRANT_COLLECTION_NAME
    )

    if (exists) {
      // Verify the collection has named vectors (hybrid-compatible schema).
      // If it was created with the old flat-vector schema we must recreate it.
      const info = await qdrantClient.getCollection(QDRANT_COLLECTION_NAME)
      const hasNamedDense = info.config?.params?.vectors?.dense !== undefined

      if (!hasNamedDense) {
        console.log(
          `[Qdrant] Collection '${QDRANT_COLLECTION_NAME}' uses legacy schema — recreating for hybrid search.`
        )
        await qdrantClient.deleteCollection(QDRANT_COLLECTION_NAME)
        // Fall through to create below
      } else {
        // Already in the right shape
        return
      }
    }

    console.log(`[Qdrant] Creating hybrid collection '${QDRANT_COLLECTION_NAME}'...`)
    await qdrantClient.createCollection(QDRANT_COLLECTION_NAME, {
      vectors: {
        // Named dense vector for Ollama semantic embeddings
        dense: {
          size: vectorSize,
          distance: 'Cosine',
          on_disk: true,
        },
      },
      sparse_vectors: {
        // Named sparse vector for BM25/feature-hash keyword representation
        sparse: {
          index: {
            on_disk: true, // Keep sparse index on disk — no RAM cost
          },
        },
      },
    })

    console.log(`[Qdrant] Collection '${QDRANT_COLLECTION_NAME}' created (dense + sparse).`)
  } catch (error) {
    console.warn(`[Qdrant] Could not verify/create collection: ${error.message}`)
  }
}
