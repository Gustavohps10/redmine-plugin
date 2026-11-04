/**
 * Compartilha uma operação assíncrona idêntica enquanto ela ainda está em voo.
 * Não guarda resultado depois da conclusão, portanto não introduz dados velhos.
 */
export class InFlightRequests<T> {
  private readonly pending = new Map<string, Promise<T>>()

  public run(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key)
    if (existing) return existing

    const promise = operation().finally(() => {
      this.pending.delete(key)
    })
    this.pending.set(key, promise)

    return promise
  }

  public static keyFor(
    resource: string,
    params?: Record<string, string>,
  ): string {
    if (!params) return resource
    const query = Object.entries(params)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([name, value]) => `${name}=${value}`)
      .join('&')

    return `${resource}?${query}`
  }
}
