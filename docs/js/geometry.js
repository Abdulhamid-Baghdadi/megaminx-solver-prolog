// Where each of the 132 stickers sits on a dodecahedron, derived from the move permutations alone:
// a sticker moved by three face turns is part of a corner, by two part of an edge, and those pieces are matched
// to the vertices and edges of a real dodecahedron. Every move is then checked to be a rigid rotation.

const PHI = (1 + Math.sqrt(5)) / 2
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = a => mul(a, 1 / Math.hypot(...a))
const lerp = (a, b, t) => add(a, mul(sub(b, a), t))

function dodecahedron() {
  const v = []
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z])
  for (const a of [-1, 1]) for (const b of [-1, 1]) v.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI])
  const normals = []
  for (const a of [-1, 1]) for (const b of [-1, 1]) normals.push([0, a * PHI, b], [a * PHI, b, 0], [a, 0, b * PHI])
  const faces = normals.map(n0 => {
    const n = norm(n0)
    const ds = v.map(p => dot(p, n)), max = Math.max(...ds)
    const ids = v.map((_, i) => i).filter(i => ds[i] > max - 1e-6)
    const c = mul(ids.reduce((s, i) => add(s, v[i]), [0, 0, 0]), 1 / ids.length)
    const u = norm(sub(v[ids[0]], c)), w = cross(n, u)
    ids.sort((i, j) => Math.atan2(dot(sub(v[i], c), w), dot(sub(v[i], c), u)) - Math.atan2(dot(sub(v[j], c), w), dot(sub(v[j], c), u)))
    return { n, c, ids }   // vertices counter-clockwise seen from outside
  })
  return { v, faces }
}

// Rotation that best maps points a[k] onto b[k] (Horn's quaternion method), with its RMS error.
function bestRotation(a, b) {
  let S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  a.forEach((p, k) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += p[i] * b[k][j] })
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S
  const N = [[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]]
  let q = [1, 0.1, 0.2, 0.3]  // power iteration on N + cI for the largest eigenvector
  for (let it = 0; it < 200; it++) { const r = N.map((row, i) => row.reduce((s, x, j) => s + x * q[j], 0) + 10 * q[i]); const l = Math.hypot(...r); q = r.map(x => x / l) }
  const [w, x, y, z] = q
  const R = [[w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z]]
  const rot = p => R.map(row => dot(row, p))
  const err = Math.sqrt(a.reduce((s, p, k) => s + dot(sub(rot(p), b[k]), sub(rot(p), b[k])), 0) / a.length)
  const angle = 2 * Math.acos(Math.min(1, Math.abs(w))), axis = Math.hypot(x, y, z) > 1e-9 ? norm(mul([x, y, z], Math.sign(w) || 1)) : [0, 1, 0]
  return { R, rot, err, axis, angle }
}

export function buildGeometry(data) {
  const N = 132, F = 12
  // A face turn moves 25 stickers (10 on its face, 15 around it); whole-cube rotations move far more.
  const faceMoves = Object.keys(data.moves).filter(m => {
    const p = data.moves[m]; return p.filter((from, i) => from !== i).length === 25 && [...Array(F).keys()].some(f => p[f * 11] === f * 11 && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(k => p[f * 11 + k] !== f * 11 + k))
  })
  const faceOfMove = Object.fromEntries(faceMoves.map(m => {
    const p = data.moves[m]; return [m, [...Array(F).keys()].find(f => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(k => p[f * 11 + k] !== f * 11 + k))]
  }))
  // Which faces each sticker's piece touches.
  const piece = Array.from({ length: N }, (_, i) => i % 11 === 0 ? [Math.floor(i / 11)] : faceMoves.filter(m => data.moves[m][i] !== i).map(m => faceOfMove[m]))
  piece.forEach((fs, i) => { if (i % 11 && !(fs.length === 2 || fs.length === 3)) throw new Error('sticker ' + i + ' touches ' + fs) })
  const geo = dodecahedron()
  const geoAdj = (g, h) => geo.faces[g].ids.filter(i => geo.faces[h].ids.includes(i)).length === 2
  const geoVertex = (a, b, c) => geo.faces[a].ids.find(i => geo.faces[b].ids.includes(i) && geo.faces[c].ids.includes(i))
  const triples = piece.filter(p => p.length === 3), pairs = piece.filter(p => p.length === 2)

  function placeStickers(label) {   // label[face] = geometric face
    return Array.from({ length: N }, (_, i) => {
      const f = Math.floor(i / 11), g = geo.faces[label[f]], k = i % 11
      const V = g.ids.map(id => geo.v[id]), C = g.c
      const K = V.map(p => lerp(C, p, 0.52)), A = V.map((p, j) => lerp(p, V[(j + 1) % 5], 0.3)), B = V.map((p, j) => lerp(p, V[(j + 1) % 5], 0.7))
      let poly
      if (k === 0) poly = K
      else if (piece[i].length === 3) {
        const [y, z] = piece[i].filter(x => x !== f), vid = geoVertex(label[f], label[y], label[z]), j = g.ids.indexOf(vid)
        poly = [V[j], A[j], K[j], B[(j + 4) % 5]]
      } else {
        const y = piece[i].find(x => x !== f), shared = g.ids.filter(id => geo.faces[label[y]].ids.includes(id))
        let j = g.ids.indexOf(shared[0]); if (g.ids[(j + 1) % 5] !== shared[1]) j = g.ids.indexOf(shared[1])
        poly = [A[j], B[j], K[(j + 1) % 5], K[j]]
      }
      const c = mul(poly.reduce(add, [0, 0, 0]), 1 / poly.length)
      return { poly: poly.map(p => add(lerp(c, p, 0.9), mul(g.n, 0.01))), center: c, normal: g.n, face: f }
    })
  }
  function animations(st) {
    const out = {}
    for (const [m, p] of Object.entries(data.moves)) {
      const moved = p.map((from, i) => from !== i ? i : -1).filter(i => i >= 0)
      const r = bestRotation(moved.map(i => st[p[i]].center), moved.map(i => st[i].center))
      const whole = !faceOfMove.hasOwnProperty(m)
      const group = whole ? [...Array(N).keys()] : [...moved, faceOfMove[m] * 11]
      out[m] = { axis: r.axis, angle: r.angle, err: r.err, group }
    }
    return out
  }
  // Search face labels that keep every corner's three faces around one vertex and every edge's two faces adjacent,
  // and keep the first one whose moves are all rigid rotations (this also fixes the handedness).
  const label = new Array(F).fill(-1), used = new Set()
  let result = null
  ;(function assign(f) {
    if (result) return
    if (f === F) {
      const st = placeStickers(label), an = animations(st)
      const bad = Object.entries(an).filter(([, a]) => a.err > 1e-6).map(([m]) => m)
      if (!bad.length) result = { stickers: st, moves: an, label: [...label] }
      return
    }
    for (let g = 0; g < F && !result; g++) {
      if (used.has(g)) continue
      label[f] = g
      const ok = pairs.every(([a, b]) => label[a] < 0 || label[b] < 0 || geoAdj(label[a], label[b])) &&
        triples.every(([a, b, c]) => label[a] < 0 || label[b] < 0 || label[c] < 0 || geoVertex(label[a], label[b], label[c]) !== undefined)
      if (ok) { used.add(g); assign(f + 1); used.delete(g) }
      label[f] = -1
    }
  })(0)
  if (!result) throw new Error('No consistent sticker layout')
  return { ...result, faces: geo.faces.map(g => ({ normal: g.n, verts: g.ids.map(i => geo.v[i]) })) }
}
