import { createRequire } from 'node:module';

import {
	DOCUMENT_EXTENSIONS,
	documentsDisabledByInstance,
	tidyDocumentMarkdown
} from '$lib/documents';

/**
 * The server's reading of a document, for files that reach it from somewhere
 * else, a bot's chat room above all. The composer reads in the browser and never
 * comes here.
 *
 * The extension decides the parser: text formats carry no magic bytes, and
 * detection of the others does not survive the server bundle. No OCR: its engine
 * is not installed on the server.
 */
const FILE_TYPES: Partial<Record<(typeof DOCUMENT_EXTENSIONS)[number], string>> = {
	'.pdf': 'pdf',
	'.docx': 'docx',
	'.pptx': 'pptx',
	'.xlsx': 'xlsx',
	'.odt': 'odt',
	'.odp': 'odp',
	'.ods': 'ods',
	'.rtf': 'rtf',
	'.epub': 'epub',
	'.csv': 'csv',
	'.md': 'md',
	'.html': 'html'
};

export function isReadableDocument(name: string): boolean {
	const lower = name.toLowerCase();
	return !documentsDisabledByInstance && DOCUMENT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Markdown, or null for a file this server does not read. Throws when a readable file fails to parse. */
export async function extractDocumentText(bytes: Uint8Array, name: string): Promise<string | null> {
	if (!isReadableDocument(name)) return null;
	const lower = name.toLowerCase();
	if (lower.endsWith('.txt')) return new TextDecoder().decode(bytes).trim();

	const extension = DOCUMENT_EXTENSIONS.find((ext) => lower.endsWith(ext))!;
	const fileType = FILE_TYPES[extension];
	if (!fileType) return null;

	// Registers pdf.js's worker on `globalThis`, so it runs in this thread. Without
	// it officeparser looks for the worker in `node_modules`, which the production
	// image does not have, and falls back to a CDN address.
	if (fileType === 'pdf') await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
	// officeparser probes `typeof require.resolve`, which throws in an ES module
	// rather than answering no. With one defined, its lookup of `pdfjs-dist` fails
	// cleanly in the production image and it uses the copy bundled with the server.
	(globalThis as { require?: NodeJS.Require }).require ??= createRequire(import.meta.url);
	const { parseOffice } = await import('officeparser');
	const ast = await parseOffice(bytes, {
		fileType: fileType as never,
		ocr: false,
		extractAttachments: false
	});
	const { value } = await ast.to('md', {
		ignoreInternalLinks: true,
		generateIds: false,
		includeFormatting: false
	});
	return tidyDocumentMarkdown(value ?? '');
}
