/**
 * The demo server serves the Factory's demo folder on the loopback address, and
 * `tailscale serve` forwards the Mac's /demos path to it, because the Mac App Store and
 * standalone editions of Tailscale cannot serve files from disk (fac-3mz.10). The seam is
 * the server's own interface: a folder and a port on the command line, HTTP on the other
 * side. The tests start the real server on a free port over a temporary folder and ask it
 * for a video the way Safari on iPhone does, then read the status, the headers and the
 * bytes; nothing here reaches inside the server.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { connect, createServer, type Server } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { repoRoot } from "./fixtures/install-mac.ts";

/** A video's bytes, ten of them, so a range's first and last can be read by eye. */
const video = "0123456789";

type Reply = {
	status: number;
	headers: Record<string, string | string[] | undefined>;
	body: Buffer;
};

type Running = {
	port: number;
	/** Ask the server one request and read its answer whole. */
	ask: (options: { path: string; method?: string; range?: string }) => Promise<Reply>;
	/** Connect to the server at one address, true when nothing answers there. */
	refusedAt: (address: string) => Promise<boolean>;
	stop: () => void;
};

/** A port the kernel gave a listener this test closed again. */
const freePort = (): Promise<number> =>
	new Promise((resolve, reject) => {
		const listener: Server = createServer();
		listener.on("error", reject);
		listener.listen(0, "127.0.0.1", () => {
			const address = listener.address();
			if (address === null || typeof address === "string") return reject(new Error("the kernel named no port"));
			listener.close(() => resolve(address.port));
		});
	});

/** Wait until something accepts a connection on the port. */
const listening = (port: number): Promise<void> =>
	new Promise((resolve, reject) => {
		const deadline = Date.now() + 5000;
		const attempt = () => {
			const socket = connect({ host: "127.0.0.1", port });
			socket.on("connect", () => {
				socket.destroy();
				resolve();
			});
			socket.on("error", () => {
				if (Date.now() > deadline) reject(new Error(`nothing listened on 127.0.0.1:${port}`));
				else setTimeout(attempt, 25);
			});
		};
		attempt();
	});

/** The demo server, started on a free port over a folder holding one video, with a file
 * beside that folder that no request may reach. */
const start = async (): Promise<Running> => {
	const root = mkdtempSync(join(tmpdir(), "factory-demos-"));
	const folder = join(root, "demos");
	mkdirSync(folder);
	writeFileSync(join(folder, "run.mp4"), video);
	writeFileSync(join(root, "secret.txt"), "beside the demo folder");
	const port = await freePort();
	const server = spawn(join(repoRoot, "bin", "demos-serve"), [folder, String(port)], { stdio: "ignore" });
	await listening(port);
	return {
		port,
		ask: (options) =>
			new Promise((resolve, reject) => {
				const headers: Record<string, string> = {};
				if (options.range) headers.Range = options.range;
				const ask = request(
					{ host: "127.0.0.1", port, path: options.path, method: options.method ?? "GET", headers },
					(answer) => {
						const chunks: Buffer[] = [];
						answer.on("data", (chunk: Buffer) => chunks.push(chunk));
						answer.on("end", () => resolve({ status: answer.statusCode ?? 0, headers: answer.headers, body: Buffer.concat(chunks) }));
					},
				);
				ask.on("error", reject);
				ask.end();
			}),
		refusedAt: (address) =>
			new Promise((resolve) => {
				const socket = connect({ host: address, port });
				// A firewall that drops the packet answers as plainly as one that refuses it.
				socket.setTimeout(2000, () => {
					socket.destroy();
					resolve(true);
				});
				socket.on("connect", () => {
					socket.destroy();
					resolve(false);
				});
				socket.on("error", () => resolve(true));
			}),
		stop: () => {
			server.kill();
			rmSync(root, { recursive: true, force: true });
		},
	};
};

test("the demo server answers a request for a video with the file's bytes", async (t) => {
	const server = await start();
	t.after(server.stop);

	const answer = await server.ask({ path: "/run.mp4" });
	assert.equal(answer.status, 200);
	assert.equal(answer.body.toString(), video);
	assert.equal(answer.headers["accept-ranges"], "bytes", "it says it takes Range requests");
});

test("the demo server answers Safari's Range request with 206 and the whole video", async (t) => {
	const server = await start();
	t.after(server.stop);

	// Safari on iPhone asks for the file from its first byte, and plays it only from a
	// server that answers 206 rather than the whole file as 200 (fac-3mz.10).
	const answer = await server.ask({ path: "/run.mp4", range: "bytes=0-" });
	assert.equal(answer.status, 206);
	assert.equal(answer.headers["content-range"], `bytes 0-${video.length - 1}/${video.length}`);
	assert.equal(answer.body.toString(), video);
});

test("the demo server answers a Range request with 206 and only that part of the video", async (t) => {
	const server = await start();
	t.after(server.stop);

	// A player that seeks asks for the middle of the video, so the answer must start there
	// rather than at the first byte.
	const answer = await server.ask({ path: "/run.mp4", range: "bytes=2-5" });
	assert.equal(answer.status, 206);
	assert.equal(answer.headers["content-range"], "bytes 2-5/10");
	assert.equal(answer.body.toString(), "2345");
});

test("the demo server refuses to write to the demo folder", async (t) => {
	const server = await start();
	t.after(server.stop);

	const answer = await server.ask({ path: "/run.mp4", method: "PUT" });
	assert.equal(answer.status, 405, "the folder is read only: a Run writes the video, never a request");
	const read = await server.ask({ path: "/run.mp4" });
	assert.equal(read.body.toString(), video, "the video is unchanged");
});

test("the demo server serves no file outside the demo folder", async (t) => {
	const server = await start();
	t.after(server.stop);

	// The folder is the whole of what the tailnet publishes, so a request that climbs out
	// of it reaches nothing on this Mac.
	const answer = await server.ask({ path: "/../secret.txt" });
	assert.equal(answer.status, 404);
	assert.doesNotMatch(answer.body.toString(), /beside the demo folder/);
});

test("the demo server answers on the loopback address only", async (t) => {
	const server = await start();
	t.after(server.stop);

	// The Mac's tailnet is the one network the videos are reached from, so the server must
	// answer nothing at the address this Mac has on the network around it.
	const other = Object.values(networkInterfaces())
		.flat()
		.find((each) => each !== undefined && each.family === "IPv4" && !each.internal);
	if (other === undefined) return t.skip("this Mac has no address besides the loopback one");
	assert.equal(await server.refusedAt(other.address), true, `nothing answers at ${other.address}:${server.port}`);
});

test("the demo server refuses a range that starts past the video's end", async (t) => {
	const server = await start();
	t.after(server.stop);

	// A range past the end names no bytes, so HTTP answers 416 with the file's size rather
	// than a 206 holding nothing.
	const answer = await server.ask({ path: "/run.mp4", range: "bytes=20-" });
	assert.equal(answer.status, 416);
	assert.equal(answer.headers["content-range"], "bytes */10");
});

test("the demo server answers a HEAD request with the video's headers and no body", async (t) => {
	const server = await start();
	t.after(server.stop);

	// A player asks HEAD first to learn a video's length before it asks for a range.
	const answer = await server.ask({ path: "/run.mp4", method: "HEAD" });
	assert.equal(answer.status, 200);
	assert.equal(answer.headers["content-length"], "10");
	assert.equal(answer.body.length, 0);
});
