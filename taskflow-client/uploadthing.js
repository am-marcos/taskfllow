import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mime from 'mime-types'
import { UTApi } from 'uploadthing/server'

function getUploadthingSecret() {
  const raw = process.env.UPLOADTHING_SECRET
  if (!raw) {
    throw new Error('Missing UPLOADTHING_SECRET in .env')
  }

  return raw.replace(/^['\"]|['\"]$/g, '')
}

export async function uploadFileToUploadthing(filePath) {
  if (!filePath) throw new Error('Missing filePath for Uploadthing upload')

  const apiKey = getUploadthingSecret()
  const utapi = new UTApi({ apiKey })

  const fileBuffer = await readFile(filePath)
  const fileName = path.basename(filePath)
  const mimeType = mime.lookup(fileName) || 'application/octet-stream'
  const file = new File([fileBuffer], fileName, { type: mimeType })

  const response = await utapi.uploadFiles(file)
  const result = Array.isArray(response) ? response[0] : response

  if (!result || result.error || !result.data?.ufsUrl) {
    throw new Error('Uploadthing upload failed')
  }

  return {
    key: result.data.key,
    url: result.data.ufsUrl
  }
}
