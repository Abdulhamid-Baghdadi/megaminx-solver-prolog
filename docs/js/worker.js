// Runs the solver off the main thread: one stage at a time, reporting progress and each stage's moves.
import { createSolver } from './solver.js'
import { createFinish } from './finish.js'

let solver
self.onmessage = async ({ data: msg }) => {
  if (!solver) solver = createSolver(await (await fetch(new URL('../data/megaminx.json', import.meta.url))).json())
  if (msg.cmd !== 'solve') return
  let state = Uint8Array.from(msg.state)
  for (let stage = 1; stage <= solver.lastStage; stage++) {
    const started = performance.now()
    // The last stage only has u and sp16; beyond a few moves it is the method's gap, not a slow search.
    const maxDepth = stage === solver.lastStage ? 8 : 9
    const moves = solver.solveStage(String(stage), state, { maxDepth, onDepth: depth => self.postMessage({ type: 'progress', stage, depth }) })
    if (!moves) {
      if (stage !== solver.lastStage) { self.postMessage({ type: 'stuck', stage, maxDepth }); return }
      // The original last stage cannot place last-layer pieces: finish with the slides' macro moves instead.
      const f = createFinish(solver)(state)
      if (!f) { self.postMessage({ type: 'stuck', stage, maxDepth }); return }
      self.postMessage({ type: 'finish', stage, steps: f.steps, ms: performance.now() - started })
      self.postMessage({ type: 'done', solved: f.solved, finished: true })
      return
    }
    state = solver.applyAll(state, moves)
    self.postMessage({ type: 'stage', stage, moves, ms: performance.now() - started })
  }
  self.postMessage({ type: 'done', solved: solver.isSolved(state) })
}
