import fs from 'fs'
import path from 'path'

const repo = process.env.GITHUB_REPOSITORY || 'Gustavohps10/redmine-plugin'
const ref = process.env.GITHUB_REF_NAME || 'main'
const tag = process.env.TAG_NAME || ref
const version = tag.replace(/^v/, '')

const manifestPath = path.resolve('manifest.yaml')
if (!fs.existsSync(manifestPath)) {
  console.error('❌ manifest.yaml não encontrado')
  process.exit(1)
}

let content = fs.readFileSync(manifestPath, 'utf-8')

// 1. Scan /screenshots directory
const screenshotsDir = path.resolve('screenshots')
const screenshots = []

if (fs.existsSync(screenshotsDir)) {
  const files = fs.readdirSync(screenshotsDir)
  const imageFiles = files
    .filter((f) => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f))
    .sort()

  for (const file of imageFiles) {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${ref}/screenshots/${file}`
    const nameWithoutExt = file.replace(/\.[^/.]+$/, '')
    const cleanName = nameWithoutExt
      .replace(/^[0-9]+[-_.]*/, '')
      .replace(/[-_]/g, ' ')
    const caption = cleanName.charAt(0).toUpperCase() + cleanName.slice(1)

    screenshots.push({ url: rawUrl, caption: caption || 'Screenshot' })
  }
}

console.log(`📸 Encontradas ${screenshots.length} screenshot(s) na pasta /screenshots`)

// 2. Scan icon
let iconUrl = `https://raw.githubusercontent.com/${repo}/${ref}/src/icon.png`
if (fs.existsSync(path.resolve('icon.png'))) {
  iconUrl = `https://raw.githubusercontent.com/${repo}/${ref}/icon.png`
}

// 3. Atualiza ou adiciona secao de screenshots no YAML de forma simples
if (screenshots.length > 0) {
  let screenshotsYaml = 'screenshots:\n'
  for (const s of screenshots) {
    screenshotsYaml += `  - url: ${s.url}\n    caption: ${s.caption}\n`
  }

  if (content.includes('screenshots:')) {
    content = content.replace(/screenshots:[\s\S]*?(?=\n[a-zA-Z0-9_-]+:|$)/, screenshotsYaml.trim())
  } else {
    content = content.replace(/(iconUrl:[^\n]*\n)/, `$1${screenshotsYaml}`)
  }
}

// 4. Garante que sourceUrl e iconUrl apontem para o repositorio dinamico
content = content.replace(/sourceUrl:.*$/m, `sourceUrl: https://github.com/${repo}.git`)
content = content.replace(/iconUrl:.*$/m, `iconUrl: ${iconUrl}`)

fs.writeFileSync(manifestPath, content, 'utf-8')
console.log('✅ manifest.yaml sincronizado com sucesso com screenshots e links dinamicos!')
