// The Prolog solver (megaminx_algorithm.pl) in JavaScript, driven by the facts extracted into data/megaminx.json.
// It finds the same solution as the Prolog program: for each stage it tries move sequences from short to long,
// in the same order as Prolog's backtracking (+moves before -moves, candidates in cand/2 order, the first move
// varying slowest), and rejects a move that undoes the one before it, exactly like conflict/2.

export function createSolver(data) {
  const colourIndex = Object.fromEntries(data.colours.map((c, i) => [c, i]))
  const N = 132

  // One permutation per signed move: next[i] = state[perm[i]].
  const perms = new Map()
  const basic = name => data.moves[name]
  const invert = p => { const q = new Array(N); p.forEach((from, i) => { q[from] = i }); return q }
  const compose = (p, q) => q.map(i => p[i])            // apply p, then q
  const identity = Array.from({ length: N }, (_, i) => i)
  function perm(signed) {
    if (perms.has(signed)) return perms.get(signed)
    const sign = signed[0], name = signed.slice(1)
    let p
    if (data.moves[name]) p = basic(name)
    else if (data.specials[name]) p = data.specials[name].reduce((acc, m) => compose(acc, perm(m)), identity)
    else throw new Error('Unknown move ' + signed)
    if (sign === '-') p = invert(p)
    perms.set(signed, Int16Array.from(p))
    return perms.get(signed)
  }

  const solved = () => Uint8Array.from({ length: N }, (_, i) => Math.floor(i / 11))
  const apply = (state, signed) => { const p = perm(signed); const out = new Uint8Array(N); for (let i = 0; i < N; i++) out[i] = state[p[i]]; return out }
  const applyAll = (state, moves) => moves.reduce(apply, state)
  // Expand special moves into basic turns (for animation).
  function expand(signed) {
    const sign = signed[0], name = signed.slice(1)
    if (!data.specials[name]) return [signed]
    const seq = data.specials[name].flatMap(expand)
    return sign === '+' ? seq : seq.slice().reverse().map(m => (m[0] === '+' ? '-' : '+') + m.slice(1))
  }

  const goals = {}
  for (const [n, pattern] of Object.entries(data.goals)) {
    const idx = [], val = []
    pattern.forEach((c, i) => { if (c !== null) { idx.push(i); val.push(colourIndex[c]) } })
    goals[n] = { idx: Int16Array.from(idx), val: Uint8Array.from(val) }
  }
  const matches = (state, g) => { for (let k = 0; k < g.idx.length; k++) if (state[g.idx[k]] !== g.val[k]) return false; return true }

  // Shortest move list from `state` to the goal of `stage`; null if none up to maxDepth (or cancelled).
  function solveStage(stage, state, { maxDepth = 8, shouldStop = () => false, onDepth = () => {} } = {}) {
    const goal = goals[stage]
    if (matches(state, goal)) return []
    // A candidate with no mov/3 clause (sp100 and sp110 in stage 7) simply fails in Prolog: skip it.
    const names = (data.candidates[stage] || []).filter(m => data.moves[m] || data.specials[m])
    const moves = [...names.map(m => '+' + m), ...names.map(m => '-' + m)]
    if (!moves.length) return null
    const P = moves.map(perm)
    const opposite = moves.map(m => moves.indexOf((m[0] === '+' ? '-' : '+') + m.slice(1)))
    const gi = goal.idx, gv = goal.val
    const path = new Int16Array(maxDepth)
    const states = Array.from({ length: maxDepth }, () => new Uint8Array(N))
    let nodes = 0, stop = false
    function leaf(prev, depth) {          // try every last move against the goal without building whole states
      const before = depth > 0 ? path[depth - 1] : -1
      outer: for (let m = 0; m < P.length; m++) {
        if (before >= 0 && opposite[before] === m) continue
        const p = P[m]
        for (let k = 0; k < gi.length; k++) if (prev[p[gi[k]]] !== gv[k]) continue outer
        path[depth] = m
        return true
      }
      return false
    }
    function dfs(prev, depth, target) {
      if (depth === target - 1) return leaf(prev, depth)
      const before = depth > 0 ? path[depth - 1] : -1
      const next = states[depth]
      for (let m = 0; m < P.length; m++) {
        if (before >= 0 && opposite[before] === m) continue
        if ((++nodes & 0xffff) === 0 && shouldStop()) { stop = true; return false }
        const p = P[m]
        for (let i = 0; i < N; i++) next[i] = prev[p[i]]
        path[depth] = m
        if (dfs(next, depth + 1, target)) return true
        if (stop) return false
      }
      return false
    }
    for (let target = 1; target <= maxDepth; target++) {
      onDepth(target)
      if (dfs(state, 0, target)) return Array.from(path.slice(0, target), m => moves[m])
      if (stop) return null
    }
    return null
  }

  // Solved in any orientation: every face shows one colour (the method turns the whole cube along the way).
  const isSolved = state => { for (let f = 0; f < 12; f++) for (let k = 1; k < 11; k++) if (state[f * 11 + k] !== state[f * 11]) return false; return true }

  return { data, solved, isSolved, apply, applyAll, expand, matches: (s, n) => matches(s, goals[n]), solveStage, lastStage: data.lastStage }
}
