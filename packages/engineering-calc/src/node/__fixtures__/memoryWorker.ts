/** TEST FIXTURE: a worker that allocates without bound to exercise the memory limit. */
import { parentPort } from 'node:worker_threads'

parentPort!.on('message', () => {
  const hoard: number[][] = []
  for (;;) hoard.push(new Array(1_000_000).fill(Math.random()))
})

parentPort!.postMessage({ ready: true })
