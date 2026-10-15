/** TEST FIXTURE: a worker that never reports ready, to exercise the start-up timeout. */
import { parentPort } from 'node:worker_threads'

parentPort!.on('message', () => undefined)
