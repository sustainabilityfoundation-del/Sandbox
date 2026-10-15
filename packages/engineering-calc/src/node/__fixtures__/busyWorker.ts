/** TEST FIXTURE: a worker that never answers (an uninterruptible loop) to exercise the hard timeout. */
import { parentPort } from 'node:worker_threads'

parentPort!.on('message', () => {
  for (;;) {
    // spin
  }
})

parentPort!.postMessage({ ready: true })
