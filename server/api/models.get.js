import { readdirSync } from 'fs'
import { join } from 'path'

export default defineEventHandler(() => {
  const modelsDir = join(process.cwd(), 'public/models')
  const files = readdirSync(modelsDir).filter(file => file.endsWith('.glb'))
  return files
})
