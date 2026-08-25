import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

const repo = (process.env.GITHUB_REPOSITORY || 'Gustavohps10/redmine-plugin').trim()
const branch = 'main'
const manifestPath = path.resolve('manifest.yaml')

if (!fs.existsSync(manifestPath)) {
  console.error('❌ manifest.yaml não encontrado')
  process.exit(1)
}

let existingManifest = {}
try {
  existingManifest = yaml.load(fs.readFileSync(manifestPath, 'utf-8')) || {}
} catch (e) {
  console.warn('⚠️ Não foi possível ler manifest.yaml como YAML válido, reiniciando objeto.', e.message)
}

// 1. Scan /screenshots directory
const screenshotsDir = path.resolve('screenshots')
const screenshots = []

if (fs.existsSync(screenshotsDir)) {
  const files = fs.readdirSync(screenshotsDir)
  const imageFiles = files
    .filter((f) => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f))
    .sort()

  for (const file of imageFiles) {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/screenshots/${file}`
    const nameWithoutExt = file.replace(/\.[^/.]+$/, '')
    const cleanName = nameWithoutExt
      .replace(/^[0-9]+[-_.]*/, '')
      .replace(/[-_]/g, ' ')
    const caption = cleanName.charAt(0).toUpperCase() + cleanName.slice(1)

    screenshots.push({ url: rawUrl, caption: caption || 'Screenshot' })
  }
}

console.log(`📸 Encontradas ${screenshots.length} screenshot(s) na pasta /screenshots`)

// 2. Icon URL
let iconUrl = `https://raw.githubusercontent.com/${repo}/${branch}/src/icon.png`
if (fs.existsSync(path.resolve('icon.png'))) {
  iconUrl = `https://raw.githubusercontent.com/${repo}/${branch}/icon.png`
}

// 3. Mount Clean Manifest in standard order
const cleanManifest = {
  id: existingManifest.id || 'gustavohps10-redmine',
  name: existingManifest.name || 'Redmine',
  version: existingManifest.version || '0.1.0',
  categories: existingManifest.categories || ['dataSource'],
  author: existingManifest.author || 'Gustavo Henrique',
  shortDescription: existingManifest.shortDescription || 'Redmine data source for projects and issues',
  description: existingManifest.description || 'Integration with Redmine to fetch projects, issues, users, and time entries',
  iconUrl: iconUrl,
  sourceUrl: `https://github.com/${repo}`,
  homepage: `https://github.com/${repo}#readme`,
  tags: existingManifest.tags || ['redmine', 'datasource', 'time-entries'],
}

if (screenshots.length > 0) {
  cleanManifest.screenshots = screenshots
}

if (existingManifest.downloadUrl) {
  cleanManifest.downloadUrl = existingManifest.downloadUrl
}
if (existingManifest.requiredApiVersion) {
  cleanManifest.requiredApiVersion = existingManifest.requiredApiVersion
}
if (existingManifest.releaseDate) {
  cleanManifest.releaseDate = existingManifest.releaseDate
}
if (existingManifest.changelog) {
  cleanManifest.changelog = existingManifest.changelog
}
if (existingManifest.packages) {
  cleanManifest.packages = existingManifest.packages
}

const yamlOutput = yaml.dump(cleanManifest, {
  lineWidth: -1,
  noRefs: true,
})

fs.writeFileSync(manifestPath, yamlOutput, 'utf-8')
console.log('✅ manifest.yaml sincronizado com sucesso no formato oficial!')
