import type { FapiRequestInit, FapiResponse } from '@clerk/clerk-js/dist/types/core/fapiClient'
import { Clerk } from '@clerk/clerk-js'

const KEY = '__clerk_client_jwt'

import { channels } from '../../../shared/channels'

// Use IPC to cache the Clerk token in the main process
const IpcTokenCache = {
  async getToken(_key: string) {
    return await window.electron.ipcRenderer.invoke(channels.AUTH_TOKEN_GET)
  },
  async saveToken(_key: string, token: string) {
    return window.electron.ipcRenderer.send(channels.AUTH_TOKEN_SET, token)
  },
  clearToken(_key: string) {
    return window.electron.ipcRenderer.send(channels.AUTH_TOKEN_CLEAR)
  }
}

let __internal_clerk: Clerk

function createClerkInstance(ClerkClass: typeof Clerk) {
  return (options: { publishableKey?: string; tokenCache?: typeof IpcTokenCache }): Clerk => {
    const {
      publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
      tokenCache = IpcTokenCache
    } = options || {}

    if (!__internal_clerk && !publishableKey) {
      throw new Error('Missing Publishable Key')
    }

    // Support "hot-swapping" the Clerk instance at runtime. See JS-598 for additional details.
    const hasKeyChanged =
      __internal_clerk && !!publishableKey && publishableKey !== __internal_clerk.publishableKey

    if (!__internal_clerk || hasKeyChanged) {
      if (hasKeyChanged) {
        tokenCache.clearToken?.(KEY)
      }

      const getToken = tokenCache.getToken
      const saveToken = tokenCache.saveToken
      __internal_clerk = new ClerkClass(publishableKey)

      // This is an internal API
      __internal_clerk.__unstable__onBeforeRequest(async (requestInit: FapiRequestInit) => {
        console.log('[clerk] onBeforeRequest', requestInit)
        // https://reactnative.dev/docs/0.61/network#known-issues-with-fetch-and-cookie-based-authentication
        requestInit.credentials = 'omit'

        // Instructs the backend to parse the api token from the Authorization header.
        requestInit.url?.searchParams.append('_is_native', '1')

        const jwt = await getToken(KEY)
        ;(requestInit.headers as Headers).set('authorization', jwt || '')
      })

      let nativeApiErrorShown = false
      __internal_clerk.__unstable__onAfterResponse(
        async (_: FapiRequestInit, response?: FapiResponse<unknown>) => {
          console.log('[clerk] onAfterResponse', response)
          if (!response) return

          // Extract and store the __client JWT from the Authorization header
          const authHeader = response.headers.get('authorization')
          if (authHeader) {
            await saveToken(KEY, authHeader)
          }

          // Handle native API disabled error
          if (
            !nativeApiErrorShown &&
            response.payload?.errors?.[0]?.code === 'native_api_disabled'
          ) {
            console.error(
              'The Native API is disabled for this instance.\nGo to Clerk Dashboard > Configure > Native applications to enable it.\nOr, navigate here: https://dashboard.clerk.com/last-active?path=native-applications'
            )
            nativeApiErrorShown = true
          }
        }
      )
    }
    return __internal_clerk!
  }
}

export const getClerkInstance = createClerkInstance(Clerk)
