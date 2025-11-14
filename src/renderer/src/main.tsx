import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App'

import { getClerkInstance } from './lib/clerk'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!publishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable')
}

// Override global fetch to use IPC proxy before ClerkProvider is rendered
window.fetch = async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
  // Convert URL to string
  let urlString: string
  if (typeof url === 'string') {
    urlString = url
  } else if (url instanceof URL) {
    urlString = url.toString()
  } else {
    // It's a Request object
    urlString = url.url
    // Merge Request options with provided options
    if (!options) {
      options = {}
    }
    if (url.headers && !options.headers) {
      options.headers = url.headers
    }
    if (url.method && !options.method) {
      options.method = url.method
    }
    if (url.body && !options.body) {
      options.body = url.body
    }
  }

  // Convert Headers object to plain object if needed
  const headers: Record<string, string> = {}
  if (options?.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers[key] = value
      })
    } else {
      Object.assign(headers, options.headers)
    }
  }

  // Convert body to string if needed
  let bodyString: string | undefined
  if (options?.body) {
    if (typeof options.body === 'string') {
      bodyString = options.body
    } else if (options.body instanceof FormData || options.body instanceof URLSearchParams) {
      bodyString = options.body.toString()
    } else if (options.body instanceof Blob) {
      bodyString = await options.body.text()
    } else if (options.body instanceof ArrayBuffer) {
      bodyString = new TextDecoder().decode(options.body)
    } else {
      bodyString = String(options.body)
    }
  }

  // Use the IPC proxy
  try {
    const res = await window.api.http.request({
      url: urlString,
      method: options?.method || 'GET',
      headers,
      body: bodyString
    })

    console.log('[renderer] fetch', urlString, options?.method || 'GET', res.status, res.ok)

    // Convert the proxy response to a Fetch API Response object
    const responseHeaders = new Headers(res.headers)
    const response = new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders
    })

    // Override the ok property to match our response
    Object.defineProperty(response, 'ok', {
      value: res.ok,
      writable: false,
      enumerable: true,
      configurable: true
    })

    return response
  } catch (error) {
    console.error('[renderer] fetch error', urlString, error)
    // Return an error response
    return new Response(null, {
      status: 0,
      statusText: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={publishableKey} Clerk={getClerkInstance({ publishableKey })}>
      <App />
    </ClerkProvider>
  </StrictMode>
)
