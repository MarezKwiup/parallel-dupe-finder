# parallel-dupe-finder
[![CI](https://github.com/MarezKwiup/parallel-dupe-finder/actions/workflows/ci.yml/badge.svg)](https://github.com/MarezKwiup/parallel-dupe-finder/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/parallel-dupe-finder)](https://www.npmjs.com/package/parallel-dupe-finder)
Find duplicate files fast. `parallel-dupe-finder` scans a folder, narrows the candidates down by file size, and hashes the remaining files in parallel on a pool of worker threads.

```
$ npx parallel-dupe-finder ~/Downloads

Scanned 12,483 files in /Users/you/Downloads

Found 37 duplicate groups (94 files)
4.7 GB can be reclaimed by removing 57 redundant copies

[1] 124 MB × 2 (124 MB reclaimable)
    video-copy.mp4
    backup/video.mp4

[2] 8.2 MB × 3 (16.4 MB reclaimable)
    photo.jpg
    photos/photo-copy.jpg
    old/photo.jpg

⚠ 3 paths could not be read (run with --verbose to list them)
```

- **Parallel hashing** on a self-built worker pool with a task queue, crash recovery and graceful shutdown
- **Size pre-filtering**: only files that share a size with another file are hashed
- **Resilient**: unreadable folders and files are skipped and reported, not fatal
- **Usable as a CLI or a library**, with zero runtime dependencies

## Installation

Requires Node.js 20 or later.

```bash
# Run without installing
npx parallel-dupe-finder <directory>

# Or install globally
npm install -g parallel-dupe-finder
```

## CLI usage

```bash
parallel-dupe-finder [directory] [options]
```

| Option | Description |
|---|---|
| `directory` | Folder to scan. Defaults to the current folder. |
| `-w, --workers <n>` | Number of hashing workers. Default: CPU cores − 1. |
| `--min-size <size>` | Ignore files smaller than this, e.g. `500`, `10kb`, `1.5mb`. Default: 1 byte, so empty files are ignored. |
| `--exclude <name>` | File or folder name to skip. Can be repeated. `node_modules` and `.git` are always skipped. |
| `--json` | Print the full result as JSON. |
| `--verbose` | List every path that could not be read. |
| `-h, --help` | Show help. |
| `-v, --version` | Show the version. |

Sizes use 1024-based units: `1kb` = 1024 bytes.

```bash
# Only large files, skipping build output
parallel-dupe-finder ~/Projects --min-size 1mb --exclude dist --exclude build

# Save a machine-readable report
parallel-dupe-finder ~/Photos --json > duplicates.json
```

**Exit codes:** `0` success · `1` invalid arguments or the folder can't be scanned · `130` cancelled with Ctrl+C.

Results go to stdout; errors and warnings go to stderr, so `--json` output can be piped or redirected safely.

## Library usage

```ts
import { DuplicateScanner } from "parallel-dupe-finder";

const scanner = new DuplicateScanner({
    workers: 4,               // default: CPU cores − 1
    minSize: 1024,            // bytes; default: 1
    exclude: ["node_modules"] // names to skip; default: ["node_modules", ".git"]
});

try {
    const result = await scanner.scan("./photos");

    console.log(result.summary.reclaimableBytes);

    for (const group of result.duplicates) {
        console.log(group.size, group.files);
    }

    for (const entry of result.skipped) {
        console.warn(`${entry.path}: ${entry.code ?? entry.message}`);
    }
} finally {
    await scanner.shutdown(); // stops the worker threads
}
```

`scan()` resolves to a `ScanResult`:

| Field | Description |
|---|---|
| `summary` | `totalFilesScanned`, `candidateFiles`, `duplicateGroups`, `duplicateFiles`, `redundantFiles`, `reclaimableBytes`, `skippedPaths` |
| `duplicates` | One entry per group of identical files: `{ hash, size, files }` |
| `skipped` | Paths that could not be read: `{ path, stage, code, message }`, where `stage` is `"scan"`, `"stat"` or `"hash"` |

Always call `shutdown()` when you're done. The worker threads keep the process alive until it is called.

## How it works

```
scanDirectory        walk the tree iteratively (no recursion limit), skipping excluded names
      │
groupFilesBySize     stat every file concurrently; group paths by size
      │              files with a unique size can't have a duplicate → dropped
      │
HashService          SHA-256 each remaining file on the worker pool
      │              each worker streams its file, so memory use stays flat
      │
findDuplicateGroups  group by hash; groups with 2+ files are duplicates
```

Size grouping is what makes the tool practical: on a typical folder most files have a unique size, so they're never read at all.

### The worker pool

Node already handles I/O concurrently, but SHA-256 is CPU work: on the main thread, only one file can be hashed at a time. The pool (`src/workers/worker-pool.ts`) runs the hashing on several threads:

- **Fixed pool + task queue.** Workers are created once and reused. Tasks wait in a queue when every worker is busy, and an idle worker takes the next task as soon as it finishes. Creating a worker per file would spend more time starting threads than hashing.
- **Task IDs.** Every task gets an ID that the worker echoes back with its result, so each reply resolves the right promise.
- **Two kinds of failure.** A file that can't be read is a *task* failure: the worker reports it as a message, that task is rejected, and the worker keeps going. A worker that *crashes* is a *worker* failure: its current task is rejected, the worker is replaced, and queued work continues.
- **Restart budget.** If workers keep crashing without ever completing a task (for example, a broken worker script), the pool stops respawning after a few attempts instead of looping forever, and rejects all work with a `WorkerPoolError`.
- **Graceful shutdown.** `shutdown()` rejects queued and in-flight tasks and terminates every worker. The CLI calls it on Ctrl+C.

### Errors: skip or fail?

| Situation | Behaviour |
|---|---|
| The folder you asked to scan doesn't exist or can't be read | `scan()` rejects |
| A subfolder or file inside it can't be read | skipped and listed in `result.skipped` |
| The worker pool fails or is shut down | `scan()` rejects with a `WorkerPoolError` |

A scan that silently returned "0 duplicates" for a folder it couldn't read would be misleading, but one locked file shouldn't throw away the results for thousands of others.

## Benchmarks

The benchmark hashes the same 600 candidate files (2.61 GB, ~25% duplicates, generated reproducibly from a seed) four ways:

| Strategy | Median time | Speedup | Throughput |
|---|---:|---:|---:|
| Main thread, sequential | 3.78 s | 1.00× | 706 MB/s |
| Main thread, 16 concurrent | 2.15 s | 1.76× | 1240 MB/s |
| Worker pool, 1 worker | 3.98 s | 0.95× | 671 MB/s |
| Worker pool, 2 workers | 2.22 s | 1.70× | 1201 MB/s |
| Worker pool, 4 workers | 1.54 s | 2.45× | 1731 MB/s |
| Worker pool, 8 workers | 1.46 s | **2.59×** | **1829 MB/s** |
| Worker pool, 16 workers | 1.73 s | 2.19× | 1545 MB/s |

<sub>Apple M1 (4 performance + 4 efficiency cores), MacBook Air, Node.js 20.13.1, macOS. `UV_THREADPOOL_SIZE=16`. Median of 5 runs after a warm-up pass, so files are read from the OS cache and the numbers measure CPU parallelism, not disk speed. Worker timings include starting and stopping the pool.</sub>

### What the numbers show

- **Async I/O helps, but only up to a point.** Hashing 16 files concurrently on the main thread is 1.76× faster than one at a time, without any threads of your own: file reads run on libuv's threadpool and overlap with hashing. But all the SHA-256 work still runs on one thread, so that's where it stops.
- **One worker costs almost nothing, and gains nothing.** It's 5% slower than sequential: startup and message passing, with no parallelism to pay for them.
- **Workers scale with fast cores.** 4 workers reach 2.45×, beating everything a single thread can do. That's real CPU parallelism, which async I/O can't provide.
- **The curve flattens at 4, because the M1 has 4 fast cores.** Workers 5–8 run on the slower efficiency cores and add only a little (2.45× → 2.59×).
- **More workers than cores makes it slower.** 16 CPU-bound threads on 8 cores means the OS constantly switches between them, and each extra worker costs startup time and memory. 2.19× vs 2.59× at 8.
- **The threadpool isn't the bottleneck.** All workers share one libuv threadpool (4 threads by default) for file reads. Raising it to 16 changed the 8-worker result only from 2.51× to 2.59×, within run-to-run noise, so the limit is CPU, not reads.

That's why the default is **CPU cores − 1** workers: it uses the cores that help and leaves one free for the main thread.

**A note on laptops.** The MacBook Air has no fan. In some runs the heaviest strategies, which run last, came out much slower than in others because the chip had heated up and slowed itself down. If your results look inconsistent, let the machine cool down and rerun with only the heavier strategies.

### Run it yourself

```bash
npm run bench:data -- --out ~/Desktop/dupe-finder-bench   # ~2.6 GB, reproducible from --seed
npm run bench -- --dir ~/Desktop/dupe-finder-bench
```

Every strategy's result is checked against the dataset's manifest, so a fast but wrong strategy fails instead of winning.

## Limitations

- **Hard links are reported as duplicates.** They have identical content, but deleting one frees no space.
- **Symbolic links are not followed**, so a folder linked into the scan tree isn't scanned twice.
- **Every candidate is fully hashed.** Comparing a small chunk of each file first would avoid reading most of a large file that differs early.
- **The restart budget can't tell a broken worker script from several bad tasks in a row.** The bundled hash worker reports file errors as messages instead of crashing, so this doesn't happen in practice.

## Development

```bash
npm install
npm test            # Vitest: unit, integration and end-to-end CLI tests
npm run typecheck   # tsc --noEmit
npm run build       # compile to dist/
```

Project layout:

```
src/
├── cli/            argument parsing, report formatting, entry point
├── scanner/        directory walk, size grouping, duplicate grouping
├── hashing/        HashService: runs hash tasks on the pool
├── workers/        WorkerPool and the hash worker
├── duplicate-scanner.ts
└── index.ts        public API
tests/              unit, integration and CLI tests, plus worker fixtures
benchmark/          dataset generator and benchmark runner
```

## License

MIT