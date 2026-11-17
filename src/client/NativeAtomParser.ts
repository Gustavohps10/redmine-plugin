export interface AtomEntryDTO {
  id: string
  title: string
  updated: string
  authorName: string
  contentHtml: string
  rawXmlBlock?: string
}

function capture(block: string, pattern: RegExp): string {
  const match = pattern.exec(block)
  if (match === null) return ''
  const value = match.at(1)
  if (value === undefined) return ''
  return value.trim()
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export class NativeAtomParser {
  public static parseEntries(xml: string): AtomEntryDTO[] {
    const blocks = xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi)
    if (blocks === null) return []
    return blocks.map((block) => ({
      id: capture(block, /<id>([\s\S]*?)<\/id>/i),
      title: decode(capture(block, /<title[^>]*>([\s\S]*?)<\/title>/i)),
      updated: capture(block, /<updated>([\s\S]*?)<\/updated>/i),
      authorName: decode(
        capture(
          block,
          /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i,
        ),
      ),
      contentHtml: decode(
        capture(block, /<content[^>]*>([\s\S]*?)<\/content>/i),
      ),
      rawXmlBlock: block,
    }))
  }
}
