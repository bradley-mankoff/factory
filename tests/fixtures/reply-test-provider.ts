/**
 * The outside service the pi-extension tests talk to: a provider that answers each request
 * with one line and records the conversation it was sent, so a test can see what pi sent it
 * and can drive a turn to its end.
 *
 * REPLY_TEST_LOG: one JSON object a line per request, holding the text of each message it
 * was sent.
 *
 * REPLY_TEST_HOLD: a file the reply waits for, the way a model that takes time holds its
 * turn open; unset, or with the file gone, the reply is immediate. A test writes the file
 * before a turn it wants to hold, so the turn is still running while the test reads what
 * else happens.
 */
import { appendFileSync, existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createAssistantMessageEventStream,
	type Api,
	type AssistantMessage,
	type Model,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";

const api = "reply-test";
const log = process.env.REPLY_TEST_LOG ?? "/dev/null";
const hold = process.env.REPLY_TEST_HOLD;

/** Waits for the hold file to go, so a turn stays open while a test watches it. */
const released = async (): Promise<void> => {
	if (!hold) return;
	while (existsSync(hold)) await new Promise((resolve) => setTimeout(resolve, 20));
};

const replyModel = {
	id: "reply",
	name: "reply",
	reasoning: false,
	input: ["text"] as ("text" | "image")[],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100_000,
	maxTokens: 4096,
};

const message = (requested: Model<Api>, text: string): AssistantMessage => ({
	role: "assistant",
	content: [{ type: "text", text }],
	api: requested.api,
	provider: requested.provider,
	model: requested.id,
	usage: {
		input: 1,
		output: 1,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 2,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
	stopReason: "stop",
	timestamp: Date.now(),
});

export default function replyTestProvider(pi: ExtensionAPI): void {
	const streamSimple = (requested: Model<Api>, context: unknown, _options?: SimpleStreamOptions) => {
		appendFileSync(
			log,
			`${JSON.stringify({
				messages: ((context as { messages?: unknown[] }).messages ?? []).map(textOf),
			})}\n`,
		);
		const stream = createAssistantMessageEventStream();
		const text = "answered";
		const reply = message(requested, text);
		void (async () => {
			await released();
			stream.push({ type: "start", partial: reply });
			stream.push({ type: "text_start", contentIndex: 0, partial: reply });
			stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: reply });
			stream.push({ type: "text_end", contentIndex: 0, content: text, partial: reply });
			stream.push({ type: "done", reason: "stop", message: reply });
		})();
		return stream;
	};

	pi.registerProvider("reply-test", {
		name: "Reply test provider",
		api,
		apiKey: "test-key",
		baseUrl: "http://localhost:0",
		models: [replyModel],
		streamSimple,
	});
}

/** The text a message carries (copied from pi-flows, so this fixture stands alone). */
const textOf = (message: unknown): string => {
	if (typeof message !== "object" || message === null) return "";
	const { content } = message as { content?: unknown };
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((part) => {
			if (typeof part !== "object" || part === null) return [];
			const { type, text } = part as { type?: unknown; text?: unknown };
			return type === "text" && typeof text === "string" ? [text] : [];
		})
		.join("\n");
};
