import { createServer } from 'node:http'

import { describe, expect, it } from 'vitest'

import { RedmineClient } from '../../src/client/RedmineClient'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

describe('Analytics in-flight isolation over HTTP', () => {
  it('keeps distinct filters separate while both requests are in flight', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered = () => {}
    const requested = new Promise<void>((resolve) => {
      entered = resolve
    })
    const requests: string[] = []
    const server = createServer(async (request, response) => {
      const url = new URL(String(request.url), 'http://127.0.0.1')
      requests.push(url.search)
      entered()
      await gate
      let id = 1
      if (url.searchParams.get('user_id') === '2') id = 2
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          issues: [
            {
              id,
              project: { id: 1, name: 'Project' },
              subject: 'Task',
              status: { id: 1, name: 'New' },
              created_on: '2026-11-01T00:00:00Z',
              updated_on: '2026-11-01T00:00:00Z',
            },
          ],
          total_count: 1,
          offset: 0,
          limit: 100,
        }),
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string')
      throw new Error('Server address missing')

    try {
      const client = new RedmineClient(new AxiosHttpClient(), {
        apiUrl: `http://127.0.0.1:${address.port}`,
        apiKey: 'reader',
      })
      const first = client.listIssues({ q: 'x&user_id=2' })
      const second = client.listIssues({ q: 'x', user_id: '2' })
      await requested
      release()
      const [one, two] = await Promise.all([first, second])
      expect(one.success.issues.map((issue) => issue.id)).toEqual([1])
      expect(two.success.issues.map((issue) => issue.id)).toEqual([2])
      expect(requests).toHaveLength(2)
    } finally {
      release()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
