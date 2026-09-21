import type { ChattoClient, ChattoMessageReference } from './client';
import { defuseMentions, split } from './text';

/** The pace Chatto asks of a typing indicator, kept for edits too: each edit is an event every member's client receives. */
const EDIT_INTERVAL_MS = 2_000;

/**
 * An answer in the room: posted once when it is finished, or while it is being
 * written, the first words as a message and the rest as edits to it.
 *
 * One path for both, so a streamed answer ends exactly as a posted one would:
 * the same split, the same defused mentions, the same reply attribution on the
 * first part only.
 */
export class LiveAnswer {
	readonly #client: ChattoClient;
	readonly #reference: ChattoMessageReference;
	readonly #threadRootEventId: string | undefined;
	readonly #signal: AbortSignal;
	readonly #onFirstPost: () => void;

	/** What each part of the answer currently says in the room. */
	#posted: { id: string; body: string }[] = [];
	/** Writes run one after another, so an edit never lands before the post it edits. */
	#chain: Promise<void> = Promise.resolve();
	#pending = '';
	#timer: ReturnType<typeof setTimeout> | null = null;
	#lastWrite = 0;

	constructor(
		client: ChattoClient,
		reference: ChattoMessageReference,
		threadRootEventId: string | undefined,
		signal: AbortSignal,
		onFirstPost: () => void = () => {}
	) {
		this.#client = client;
		this.#reference = reference;
		this.#threadRootEventId = threadRootEventId;
		this.#signal = signal;
		this.#onFirstPost = onFirstPost;
	}

	/** The answer so far. Written at most once per interval; the latest text wins. */
	update(text: string): void {
		this.#pending = text;
		if (this.#timer) return;
		const wait = Math.max(0, this.#lastWrite + EDIT_INTERVAL_MS - Date.now());
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.#lastWrite = Date.now();
			const text = this.#pending;
			// A failed intermediate write is not the end of the answer: the final one
			// tries again with the whole text.
			this.#chain = this.#chain.then(() => this.#write(text)).catch(() => {});
		}, wait);
	}

	/** The finished text. Throws if it cannot be posted. */
	async finish(text: string): Promise<void> {
		this.#cancelTimer();
		const done = this.#chain.then(() => this.#write(text));
		this.#chain = done.catch(() => {});
		await done;
	}

	/** Take back whatever was shown: a turn that fails stays silent in the room, streamed or not. */
	async abandon(): Promise<void> {
		this.#cancelTimer();
		await this.#chain;
		for (const part of this.#posted) {
			await this.#client.deleteMessage(this.#reference.roomId, part.id).catch(() => {});
		}
		this.#posted = [];
	}

	#cancelTimer(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}

	/** Only the parts that changed are sent, and parts the text no longer reaches are removed. */
	async #write(text: string): Promise<void> {
		if (!text.trim()) return;
		// Defused here rather than at the model: what is unsafe is posting it, and this
		// is the only place that posts.
		const parts = split(defuseMentions(text));

		for (const [index, body] of parts.entries()) {
			const existing = this.#posted[index];
			if (existing?.body === body) continue;
			if (existing) {
				await this.#client.updateMessage(this.#reference.roomId, existing.id, body, this.#signal);
				existing.body = body;
				continue;
			}
			const { message } = await this.#client.createMessage(
				{
					roomId: this.#reference.roomId,
					body,
					threadRootEventId: this.#threadRootEventId,
					// Only the first part carries the attribution, or the same reply arrow is
					// drawn three times.
					inReplyTo: index === 0 && !this.#threadRootEventId ? this.#reference.eventId : undefined
				},
				this.#signal
			);
			if (!message?.id) continue;
			if (!this.#posted.length) this.#onFirstPost();
			this.#posted.push({ id: message.id, body });
		}

		// The finished text can be shorter than what was streamed: the protocol blocks a
		// model writes are removed once its turn is complete.
		for (const extra of this.#posted.splice(parts.length)) {
			await this.#client.deleteMessage(this.#reference.roomId, extra.id, this.#signal);
		}
	}
}
