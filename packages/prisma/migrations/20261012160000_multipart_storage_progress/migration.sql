CREATE TABLE "MultipartStorageUpload" (
  "id" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL DEFAULT '{}',
  "bytes" BYTEA,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MultipartStorageUpload_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MultipartStorageUpload_bucket_path_key" ON "MultipartStorageUpload"("bucket", "path");
