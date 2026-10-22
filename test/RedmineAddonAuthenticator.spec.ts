import { AddonConnectionAuthenticator, AddonContext } from '@mr-tick/sdk'
import { describe, expect, it, vi } from 'vitest'

import RedmineAddon from '../src/index'

describe('RedmineAddon Connection Authenticator', () => {
  it('registra o authenticator com authProfileId "redmine-instance" na ativacao', () => {
    let registeredAuthenticator: AddonConnectionAuthenticator | null = null
    const registerAuthenticator = vi.fn(
      (authenticator: AddonConnectionAuthenticator) => {
        registeredAuthenticator = authenticator
      },
    )

    const mockContext = {
      contributions: {
        dataSources: { register: vi.fn(), unregister: vi.fn() },
        connections: {
          registerAuthenticator,
          unregisterAuthenticator: vi.fn(),
          registerProfiles: vi.fn(),
          unregisterProfiles: vi.fn(),
        },
        menus: {
          sidebar: { register: vi.fn() },
          timerbar: { register: vi.fn() },
        },
        commands: { register: vi.fn(), execute: vi.fn() },
        themes: { register: vi.fn(), unregister: vi.fn() },
      },
      host: {
        notifications: { success: vi.fn() },
      },
    } as unknown as AddonContext

    const addon = new RedmineAddon()
    addon.activate(mockContext)

    expect(registerAuthenticator).toHaveBeenCalledTimes(1)
    expect(registeredAuthenticator).not.toBeNull()
    if (registeredAuthenticator) {
      const auth = registeredAuthenticator as Extract<
        AddonConnectionAuthenticator,
        { method: 'credentials' }
      >
      expect(auth.method).toBe('credentials')
      expect(auth.authProfileId).toBe('redmine-instance')
      expect(auth.supportsRefresh).toBe(false)
      expect(auth.supportsRevocation).toBe(false)
    }
  })

  it('desregistra o authenticator na desativacao', () => {
    const unregisterAuthenticator = vi.fn()
    const mockContext = {
      contributions: {
        dataSources: { register: vi.fn(), unregister: vi.fn() },
        connections: {
          registerAuthenticator: vi.fn(),
          unregisterAuthenticator,
          registerProfiles: vi.fn(),
          unregisterProfiles: vi.fn(),
        },
        menus: {
          sidebar: { register: vi.fn() },
          timerbar: { register: vi.fn() },
        },
        commands: { register: vi.fn(), execute: vi.fn() },
        themes: { register: vi.fn(), unregister: vi.fn() },
      },
      host: {
        notifications: { success: vi.fn() },
      },
    } as unknown as AddonContext

    const addon = new RedmineAddon()
    addon.activate(mockContext)
    addon.deactivate()

    expect(unregisterAuthenticator).toHaveBeenCalledWith('redmine-instance')
  })
})
