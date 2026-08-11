import multer from 'multer'

const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file format. Only PDF files are allowed.'), false)
  }
}

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB per PDF
    files: 10 // Maximum 10 files per request
  },
  fileFilter
})

export const uploadPdfFiles = (req, res, next) => {
  const handler = upload.array('files', 10)
  handler(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Maximum 10 PDF files allowed per request.' })
      }
      return res.status(400).json({ error: `File upload error: ${err.message}` })
    } else if (err) {
      return res.status(400).json({ error: err.message })
    }
    next()
  })
}
