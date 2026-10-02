import { env } from '$env/dynamic/public';

/**
 * Reading a document into something a model can answer from.
 *
 * The composer reads in the browser: a file is never uploaded, it is parsed
 * where it was picked, and only the Markdown travels. A bot reads on the server,
 * from a file somebody posted in a chat room. Both go through anydoc, compiled to
 * WebAssembly, and through `documentMarkdown` below.
 *
 * No OCR. A page that is a picture of text yields nothing, and the app says so.
 */

/** Instance-wide off switch. Read at build time like every other `PUBLIC_` flag, so nothing running in the page can talk it out of it. */
export const documentsDisabledByInstance = env.PUBLIC_DISABLE_DOCUMENTS === 'true';

/** Extensions read as documents, and the ones a bot reads at all. */
export const DOCUMENT_EXTENSIONS = [
	'.pdf',
	'.doc',
	'.docx',
	'.ppt',
	'.pptx',
	'.xls',
	'.xlsx',
	'.odt',
	'.odp',
	'.ods',
	'.rtf',
	'.epub',
	'.csv',
	'.md',
	'.txt'
] as const;

/** Refused by name, before any bytes are looked at. Images belong in *Add image*. */
export const BINARY_EXTENSIONS = [
	'.exe',
	'.dll',
	'.so',
	'.dylib',
	'.app',
	'.dmg',
	'.pkg',
	'.msi',
	'.bin',
	'.o',
	'.a',
	'.class',
	'.pyc',
	'.wasm',
	'.zip',
	'.tar',
	'.gz',
	'.tgz',
	'.bz2',
	'.xz',
	'.7z',
	'.rar',
	'.iso',
	'.img',
	'.mp3',
	'.mp4',
	'.mov',
	'.avi',
	'.mkv',
	'.wav',
	'.flac',
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.bmp',
	'.tiff',
	'.heic',
	'.avif',
	'.ico',
	'.woff',
	'.woff2',
	'.ttf',
	'.otf',
	'.sqlite',
	'.db',
	'.parquet'
] as const;

export type Anydoc = typeof import('@firecrawl/anydoc-wasm');

/** No text in it: a scan, or an empty file. */
export class DocumentWithoutText extends Error {
	constructor(name: string) {
		super(`${name} has no text to read`);
		this.name = 'DocumentWithoutText';
	}
}

/** A file that is not text and that anydoc cannot read either. */
export class UnreadableBinary extends Error {
	constructor(name: string) {
		super(`${name} is a binary file`);
		this.name = 'UnreadableBinary';
	}
}

function hasExtension(name: string, extensions: readonly string[]): boolean {
	const lower = name.toLowerCase();
	return extensions.some((extension) => lower.endsWith(extension));
}

export function isDocumentName(name: string): boolean {
	return hasExtension(name, DOCUMENT_EXTENSIONS);
}

export function isBinaryName(name: string): boolean {
	return hasExtension(name, BINARY_EXTENSIONS);
}

const SNIFF_BYTES = 8192;

/** True when the first 8 KiB decode as UTF-8 and hold no NUL byte. */
export function looksLikeText(bytes: Uint8Array): boolean {
	const sample = bytes.subarray(0, SNIFF_BYTES);
	if (sample.includes(0)) return false;
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true });
		return true;
	} catch {
		return false;
	}
}

/**
 * Markdown from a document's bytes. By name first: a known document goes to
 * anydoc, a known binary is refused. Anything else is read as text when its
 * bytes allow it, and handed to anydoc otherwise, so a renamed PDF still reads.
 *
 * anydoc is loaded only when needed. Throws `DocumentWithoutText`,
 * `UnreadableBinary`, or anydoc's own error.
 */
export async function documentMarkdown(
	load: () => Promise<Anydoc>,
	bytes: Uint8Array,
	name: string
): Promise<string> {
	if (isBinaryName(name)) throw new UnreadableBinary(name);

	const lower = name.toLowerCase();
	const known = isDocumentName(name) && !lower.endsWith('.md') && !lower.endsWith('.txt');
	if (!known && looksLikeText(bytes)) {
		const text = new TextDecoder().decode(bytes).trim();
		if (!text) throw new DocumentWithoutText(name);
		return text;
	}

	let markdown: string;
	try {
		const anydoc = await load();
		markdown = anydoc.toMarkdownBytes(bytes, lower.endsWith('.csv') ? 'csv' : undefined).trim();
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code === 'needsOcr') throw new DocumentWithoutText(name);
		if (code === 'unsupported') throw new UnreadableBinary(name);
		throw error;
	}
	if (!markdown) throw new DocumentWithoutText(name);
	return markdown;
}

export interface DocumentExtraction {
	/** What gets sent, as Markdown. */
	markdown: string;
	/** Rough token cost, on the same scale the context meter uses. */
	tokens: number;
}

let browserAnydoc: Promise<Anydoc> | null = null;

/** Fetched on the first document, never before: a conversation that attaches none downloads none of it. */
function loadInBrowser(): Promise<Anydoc> {
	browserAnydoc ??= (async () => {
		const [anydoc, { default: wasmUrl }] = await Promise.all([
			import('@firecrawl/anydoc-wasm'),
			import('@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm?url')
		]);
		await anydoc.default({ module_or_path: wasmUrl });
		return anydoc;
	})();
	// A failed download is not remembered: the next attachment tries again.
	browserAnydoc.catch(() => (browserAnydoc = null));
	return browserAnydoc;
}

/** In the browser. Throws what `documentMarkdown` throws. */
export async function extractDocument(file: File): Promise<DocumentExtraction> {
	const markdown = await documentMarkdown(
		loadInBrowser,
		new Uint8Array(await file.arrayBuffer()),
		file.name
	);
	return { markdown, tokens: Math.ceil(markdown.length / 3.7) };
}
