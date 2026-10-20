// Optional finish after stage 115. The original stage 116 searches with u and sp16 only, which cannot
// move last-layer edges or corners into place, so on most scrambles it never ends. This finish uses the
// group's own macro moves from the slides, in three steps:
//   1. place the last-layer edges   (search over u, sp12, sp13)
//   2. place the last-layer corners (search over u, sp14, sp15; orientation ignored)
//   3. twist the corners as the slides do: repeat sp16 until the corner in front is grey on top, then u; five times.

export function createFinish(solver) {
  const data = solver.data, N = 132
  const goal = data.goals[String(solver.lastStage)].map(c => data.colours.indexOf(c))
  const faceMoves = Object.keys(data.moves).filter(m => data.moves[m].filter((f, i) => f !== i).length === 25)
  // Stickers of one piece are moved by the same face turns.
  const key = i => faceMoves.filter(m => data.moves[m][i] !== i).join(',')
  const pieces = new Map()
  for (let i = 0; i < N; i++) if (i % 11) { const k = key(i); if (!pieces.has(k)) pieces.set(k, []); pieces.get(k).push(i) }
  const upPieces = [...pieces.values()].filter(p => p.some(i => i < 11))   // pieces with a sticker on the Up face
  const edges = upPieces.filter(p => p.length === 2), corners = upPieces.filter(p => p.length === 3)
  const sameColours = (state, p) => p.map(i => state[i]).sort().join() === p.map(i => goal[i]).sort().join()
  const lowerSolved = state => { for (let i = 11; i < N; i++) if (goal[i] >= 0 && !upPieces.some(p => p.includes(i)) && state[i] !== goal[i]) return false; return true }

  function search(state, names, test, maxDepth = 8) {
    const moves = [...names.map(m => '+' + m), ...names.map(m => '-' + m)]
    const inv = m => (m[0] === '+' ? '-' : '+') + m.slice(1)
    const path = []
    function dfs(s, depth) {
      if (depth === 0) return test(s)
      for (const m of moves) {
        if (path.length && path.at(-1) === inv(m)) continue
        path.push(m); if (dfs(solver.apply(s, m), depth - 1)) return true; path.pop()
      }
      return false
    }
    for (let d = 0; d <= maxDepth; d++) if (dfs(state, d)) return path
    return null
  }

  // The Up-face corner that sp16 twists.
  const twisted = corners.find(p => { const s = solver.apply(solver.solved(), '+sp16'); return p.some(i => s[i] !== solver.solved()[i]) })
  const upSticker = twisted.find(i => i < 11)

  return function finish(state) {
    const steps = []
    const edgeMoves = search(state, ['u', 'sp12', 'sp13'], s => lowerSolved(s) && edges.every(p => p.every(i => s[i] === goal[i])))
    if (!edgeMoves) return null
    steps.push({ name: 'Last-layer edges', moves: edgeMoves }); state = solver.applyAll(state, edgeMoves)
    const cornerMoves = search(state, ['u', 'sp14', 'sp15'], s => lowerSolved(s) && edges.every(p => p.every(i => s[i] === goal[i])) && corners.every(p => sameColours(s, p)))
    if (!cornerMoves) return null
    steps.push({ name: 'Last-layer corners', moves: cornerMoves }); state = solver.applyAll(state, cornerMoves)
    const twist = []
    for (let k = 0; k < 5; k++) {
      for (let n = 0; n < 6 && state[upSticker] !== goal[upSticker]; n++) { twist.push('+sp16'); state = solver.apply(state, '+sp16') }
      twist.push('+u'); state = solver.apply(state, '+u')
    }
    for (let n = 0; n < 5 && !state.every((v, i) => goal[i] < 0 || v === goal[i]); n++) { twist.push('+u'); state = solver.apply(state, '+u') }
    steps.push({ name: 'Twist the corners', moves: twist })
    return { steps, state, solved: solver.isSolved(state) }
  }
}
