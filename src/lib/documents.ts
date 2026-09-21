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

/** Extensions offered in the file picker, and read by a bot. */
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

export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.join(',');

export type Anydoc = typeof import('@firecrawl/anydoc-wasm');

/** A document with no text in it: a scan, or pages that are pictures of text. Said to the person rather than attached empty. */
export class DocumentWithoutText extends Error {
	constructor(name: string) {
		super(`${name} has no text to read`);
		this.name = 'DocumentWithoutText';
	}
}

export function isDocumentName(name: string): boolean {
	const lower = name.toLowerCase();
	return DOCUMENT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Markdown from a document's bytes. Throws `DocumentWithoutText` for a scan,
 * and anydoc's own error for a file it cannot convert.
 *
 * Markdown and plain text are already what a model reads. CSV has no signature
 * to detect it by, so it is named; every other format is read from the bytes.
 */
export function documentMarkdown(anydoc: Anydoc, bytes: Uint8Array, name: string): string {
	const lower = name.toLowerCase();
	if (lower.endsWith('.md') || lower.endsWith('.txt')) {
		const text = new TextDecoder().decode(bytes).trim();
		if (!text) throw new DocumentWithoutText(name);
		return text;
	}

	let markdown: string;
	try {
		markdown = anydoc.toMarkdownBytes(bytes, lower.endsWith('.csv') ? 'csv' : undefined).trim();
	} catch (error) {
		if ((error as { code?: string }).code === 'needsOcr') throw new DocumentWithoutText(name);
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

/** In the browser. Throws `DocumentWithoutText` for a scan, and anything else for a file that cannot be read. */
export async function extractDocument(file: File): Promise<DocumentExtraction> {
	const anydoc = await loadInBrowser();
	const markdown = documentMarkdown(anydoc, new Uint8Array(await file.arrayBuffer()), file.name);
	return { markdown, tokens: Math.ceil(markdown.length / 3.7) };
}
