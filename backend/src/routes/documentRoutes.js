import express from 'express'
import { uploadDocuments, retrieveDocuments } from '../controllers/documentController.js'
import { uploadPdfFiles } from '../middleware/uploadMiddleware.js'
import { verifyToken, authorizeRoles } from '../middleware/authMiddleware.js'

const router = express.Router()

/**
 * @route   POST /api/documents/upload
 * @desc    Upload up to 10 PDFs, calculate hash, store embeddings & chunks
 * @access  Private (Admin only)
 */
router.post(
  '/upload',
  verifyToken,
  authorizeRoles('admin'),
  uploadPdfFiles,
  uploadDocuments
)

/**
 * @route   POST /api/documents/retrieve
 * @desc    Retrieve top 5 reranked chunks using BM25 + Qdrant Semantic + Ollama Reranker
 * @access  Private (Admin & User)
 */
router.post(
  '/retrieve',
  verifyToken,
  authorizeRoles('admin', 'user'),
  retrieveDocuments
)

export default router
