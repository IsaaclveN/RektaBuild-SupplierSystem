import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";

const uploadDir = path.resolve("public/uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const allowedTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "text/plain": ".txt",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = allowedTypes[file.mimetype] || path.extname(file.originalname);
    cb(null, crypto.randomUUID() + extension);
  },
});

// Purchase order documents (canvass, quotes, etc.)
export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedTypes[file.mimetype] && !Object.values(allowedTypes).includes(ext)) {
      return cb(new Error("Unsupported file format."));
    }

    cb(null, true);
  },
});

// CSV import for product sources (kept in memory)
export const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype !== "text/csv" && ext !== ".csv") {
      return cb(new Error("Please upload a CSV file."));
    }
    cb(null, true);
  },
});
