import { createServer, Server } from 'node:http'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RedmineClient } from '../../src/client/RedmineClient'
import { RedmineTimeEntryProvider } from '../../src/datasource/versions/3.4/RedmineTimeEntryProvider'
import { AxiosHttpClient } from '../helpers/AxiosHttpClient'

describe('T01 / M01 / M18: Isolamento HTTP por conexão entre múltiplos provedores', () => {
  let serverA: Server
  let serverB: Server
  let urlA = ''
  let urlB = ''
  const requestsA: Array<{ method: string; url: string; headers: Record<string, string | string[] | undefined> }> = []
  const requestsB: Array<{ method: string; url: string; headers: Record<string, string | string[] | undefined> }> = []

  let shouldSimulateAtomLoginRedirect = false

  beforeEach(async () => {
    requestsA.length = 0
    requestsB.length = 0
    shouldSimulateAtomLoginRedirect = false

    serverA = createServer((req, res) => {
      let method = ''
      if (req.method) {
        method = req.method
      }
      let url = ''
      if (req.url) {
        url = req.url
      }
      requestsA.push({
        method,
        url,
        headers: req.headers,
      })

      if (shouldSimulateAtomLoginRedirect) {
        res.setHeader('Content-Type', 'text/html')
        res.writeHead(200).end('<!DOCTYPE html><html><body class="action-login">Login Required</body></html>')
        return
      }

      res.setHeader('Content-Type', 'application/json')
      res.writeHead(200).end(
        JSON.stringify({
          time_entries: [
            {
              id: 101,
              project: { id: 1, name: 'Project A' },
              issue: { id: 10 },
              user: { id: 1, name: 'User A' },
              activity: { id: 9, name: 'Dev' },
              hours: 1,
              comments: 'Entry from Server A',
              spent_on: '2026-10-18',
              created_on: '2026-10-18T10:00:00Z',
              updated_on: '2026-10-18T10:00:00Z',
            },
          ],
          total_count: 1,
          offset: 0,
          limit: 100,
        }),
      )
    })

    serverB = createServer((req, res) => {
      let method = ''
      if (req.method) {
        method = req.method
      }
      let url = ''
      if (req.url) {
        url = req.url
      }
      requestsB.push({
        method,
        url,
        headers: req.headers,
      })
      res.setHeader('Content-Type', 'application/json')
      res.writeHead(200).end(
        JSON.stringify({
          time_entries: [
            {
              id: 202,
              project: { id: 2, name: 'Project B' },
              issue: { id: 20 },
              user: { id: 2, name: 'User B' },
              activity: { id: 9, name: 'Dev' },
              hours: 2,
              comments: 'Entry from Server B',
              spent_on: '2026-10-18',
              created_on: '2026-10-18T10:00:00Z',
              updated_on: '2026-10-18T10:00:00Z',
            },
          ],
          total_count: 1,
          offset: 0,
          limit: 100,
        }),
      )
    })

    await new Promise<void>((resolve) => serverA.listen(0, '127.0.0.1', resolve))
    await new Promise<void>((resolve) => serverB.listen(0, '127.0.0.1', resolve))

    const addrA = serverA.address()
    const addrB = serverB.address()
    if (!addrA || typeof addrA === 'string' || !addrB || typeof addrB === 'string') {
      throw new Error('Falha ao inicializar servidores loopback de teste')
    }
    urlA = `http://127.0.0.1:${addrA.port}/subpathA`
    urlB = `http://127.0.0.1:${addrB.port}/subpathB`
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => serverA.close(() => resolve()))
    await new Promise<void>((resolve) => serverB.close(() => resolve()))
  })

  it('deve garantir que chamadas alternadas entre Provider A e Provider B mantenham URLs, portas, paths e API keys estritamente isoladas', async () => {
    // Simula o cliente HTTP compartilhado que era injetado no modelo anterior
    const sharedHttpClient = new AxiosHttpClient()

    // Inicializa Provider A com servidor A e chave A
    const clientA = new RedmineClient(sharedHttpClient, {
      apiUrl: urlA,
      apiKey: 'api-key-A-secret',
    })
    const providerA = new RedmineTimeEntryProvider(clientA)

    // Inicializa Provider B com servidor B e chave B
    const clientB = new RedmineClient(sharedHttpClient, {
      apiUrl: urlB,
      apiKey: 'api-key-B-secret',
    })
    const providerB = new RedmineTimeEntryProvider(clientB)

    const startDate = new Date('2026-10-01')
    const endDate = new Date('2026-10-18')

    // 1. Executa chamada em A
    const resultA1 = await providerA.findByMemberId('1', startDate, endDate)
    expect(resultA1.isSuccess()).toBe(true)

    // 2. Executa chamada em B
    const resultB1 = await providerB.findByMemberId('2', startDate, endDate)
    expect(resultB1.isSuccess()).toBe(true)

    // 3. Executa chamada novamente em A
    const resultA2 = await providerA.findByMemberId('1', startDate, endDate)
    expect(resultA2.isSuccess()).toBe(true)

    // Asserções determinísticas de isolamento estrito:
    // Server A DEVE ter recebido exatamente as 2 chamadas de Provider A com a API key de A
    expect(requestsA).toHaveLength(2)
    for (const req of requestsA) {
      expect(req.headers['x-redmine-api-key']).toBe('api-key-A-secret')
      expect(req.url).toContain('/subpathA/time_entries.json')
    }

    // Server B DEVE ter recebido exatamente a 1 chamada de Provider B com a API key de B
    expect(requestsB).toHaveLength(1)
    for (const req of requestsB) {
      expect(req.headers['x-redmine-api-key']).toBe('api-key-B-secret')
      expect(req.url).toContain('/subpathB/time_entries.json')
    }
  })

  it('deve retornar Unauthorized em getActivityAtom quando o servidor Redmine redirecionar para a tela de login (HTML)', async () => {
    const sharedHttpClient = new AxiosHttpClient()
    const client = new RedmineClient(sharedHttpClient, {
      apiUrl: urlA,
      apiKey: 'test-key',
    })

    shouldSimulateAtomLoginRedirect = true

    const result = await client.getActivityAtom({ key: 'invalid-atom-key' })
    expect(result.isFailure()).toBe(true)
    if (result.isFailure()) {
      expect(result.failure.statusCode).toBe(401)
      expect(result.failure.messageKey).toContain('Acesso não autorizado ao feed Atom do Redmine')
    }
  })
})
