import { ElectronAPI } from '@electron-toolkit/preload'

export interface HttpRequestOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface HttpResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  error?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      http: {
        request: (options: HttpRequestOptions) => Promise<HttpResponse>
      }
    }
  }
}
