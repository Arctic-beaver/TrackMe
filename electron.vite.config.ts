import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

const contentSecurityPolicyMarker = '__TRACKME_CONTENT_SECURITY_POLICY__'
const productionContentSecurityPolicy = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self'",
	"img-src 'self' data:",
	"font-src 'self'",
	"connect-src 'self'",
	"object-src 'none'",
	"base-uri 'none'",
	"frame-ancestors 'none'",
	"form-action 'none'"
].join('; ')
const developmentContentSecurityPolicy = productionContentSecurityPolicy
	.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
	.replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*")

function rendererContentSecurityPolicy(): Plugin {
	return {
		name: 'trackme-renderer-content-security-policy',
		transformIndexHtml(html, context) {
			if (!html.includes(contentSecurityPolicyMarker)) {
				throw new Error('Renderer HTML is missing the TrackMe CSP marker.')
			}
			const policy =
				context.server === undefined
					? productionContentSecurityPolicy
					: developmentContentSecurityPolicy
			return html.replace(contentSecurityPolicyMarker, policy)
		}
	}
}

export default defineConfig({
	main: {},
	preload: {},
	renderer: {
		resolve: {
			alias: {
				'@renderer': resolve('src/renderer/src'),
				'@shared': resolve('src/shared')
			}
		},
		build: {
			minify: 'esbuild',
			cssMinify: 'esbuild',
			reportCompressedSize: true
		},
		plugins: [rendererContentSecurityPolicy(), react()]
	}
})
