/** See `wasmBase64` in `vite.config.ts`. */
declare module '*.wasm?base64' {
	const base64: string;
	export default base64;
}
