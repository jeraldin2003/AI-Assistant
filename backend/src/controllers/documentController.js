import { processPdfFile, retrieveTopChunks } from '../services/ragService.js'

/**
 * Controller to upload and process up to 10 PDF files.
 * Restricted to Admin role.
 */
export const uploadDocuments = async (req, res) => {
  try {
    const files = req.files

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No PDF files were uploaded.' })
    }

    if (files.length > 10) {
      return res.status(400).json({ error: 'Upload limit exceeded. Maximum 10 PDF files allowed per request.' })
    }

    const userId = req.user?.id || null
    const results = []
    let processedCount = 0
    let skippedCount = 0

    // Process PDFs one by one sequentially
    for (const file of files) {
      try {
        const result = await processPdfFile(file.buffer, file.originalname, userId)
        results.push(result)
        if (result.status === 'processed') {
          processedCount++
        } else if (result.status === 'skipped') {
          skippedCount++
        }
      } catch (err) {
        results.push({
          filename: file.originalname,
          status: 'error',
          error: err.message,
        })
      }
    }

    return res.status(200).json({
      message: 'PDF processing complete.',
      summary: {
        totalUploaded: files.length,
        processed: processedCount,
        skipped: skippedCount,
      },
      details: results,
    })
  } catch (error) {
    console.error('Error in uploadDocuments:', error)
    return res.status(500).json({ error: error.message || 'Internal server error during PDF upload.' })
  }
}

/**
 * Controller to retrieve top 5 reranked chunks for a search query.
 * Accessible to Admin and User roles.
 */
export const retrieveDocuments = async (req, res) => {
  try {
    const { query } = req.body

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'A valid search query string is required in request body.' })
    }

    const topChunks = await retrieveTopChunks(query.trim(), 5)

    return res.status(200).json({
      query: query.trim(),
      count: topChunks.length,
      chunks: topChunks,
    })
  } catch (error) {
    console.error('Error in retrieveDocuments:', error)
    return res.status(500).json({ error: error.message || 'Internal server error during document retrieval.' })
  }
}
