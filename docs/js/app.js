import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createSolver } from './solver.js'
import { buildGeometry } from './geometry.js'

const data = await (await fetch('data/megaminx.json')).json()
const solver = createSolver(data)
const geo = buildGeometry(data)
const $ = id => document.getElementById(id)

// Sticker colours, matching the colour names used in the Prolog code and the slides.
const COLOURS = { W: '#f4f4f0', G: '#1f8f3a', R: '#d42a2a', B: '#2457c5', Y: '#f5d10a', Pr: '#7b3fb0', H: '#c9a227', Pi: '#f28cc2', L: '#8fd14f', O: '#f07c12', T: '#1fb9c4', Gr: '#9aa0a8' }
const COLOUR_NAMES = { W: 'white', G: 'green', R: 'red', B: 'blue', Y: 'yellow', Pr: 'purple', H: 'honey', Pi: 'pink', L: 'lime', O: 'orange', T: 'turquoise', Gr: 'grey' }

// Phases follow the slide decks in Documentation/.
const PHASES = [[1, 'White face'], [21, 'Second layer'], [37, 'Third layer: edges and corners'], [79, 'Next layer: corners'], [95, 'Next layer: edges'], [113, 'Grey face (last layer)']]
const phaseOf = n => [...PHASES].reverse().find(([start]) => n >= start)[1]

// ---------- 3D scene ----------
const view = $('view')
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(2, devicePixelRatio))
view.appendChild(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enablePan = false; controls.enableDamping = true; controls.minDistance = 5; controls.maxDistance = 16
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6))
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(4, 6, 8); scene.add(sun)

const v3 = a => new THREE.Vector3(...a)
const upN = v3(geo.stickers[0].normal), frontN = v3(geo.stickers[22].normal)
camera.up.copy(upN)
camera.position.copy(frontN.clone().multiplyScalar(5.6).add(upN.clone().multiplyScalar(3.2)).add(new THREE.Vector3().crossVectors(upN, frontN).multiplyScalar(-1.6)))
controls.target.set(0, 0, 0)

function polygonGeometry(points) {
  const pos = []
  for (let k = 1; k < points.length - 1; k++) pos.push(...points[0], ...points[k], ...points[k + 1])
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g
}
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7, side: THREE.DoubleSide })
for (const f of geo.faces) scene.add(new THREE.Mesh(polygonGeometry(f.verts.map(p => p.map(x => x * 0.998))), bodyMat))
const mats = data.colours.map(c => new THREE.MeshStandardMaterial({ color: COLOURS[c], roughness: 0.45, metalness: 0.0, side: THREE.DoubleSide }))
const stickers = geo.stickers.map(s => { const m = new THREE.Mesh(polygonGeometry(s.poly), mats[0]); scene.add(m); return m })
function paint(state) { stickers.forEach((m, i) => { m.material = mats[state[i]] }) }

function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
new ResizeObserver(resize).observe(view); resize()
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera) })

// ---------- turning ----------
const speed = () => Number($('speed').value)
const turnMs = () => 760 / Math.pow(speed(), 1.15)
function animateTurn(signed) {
  const name = signed.slice(1), a = geo.moves[name], sign = signed[0] === '+' ? 1 : -1
  const axis = v3(a.axis), q = new THREE.Quaternion(), ms = turnMs()
  return new Promise(resolve => {
    const start = performance.now()
    function frame(now) {
      const t = Math.min(1, (now - start) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      q.setFromAxisAngle(axis, sign * a.angle * e)
      for (const i of a.group) stickers[i].quaternion.copy(q)
      if (t < 1) requestAnimationFrame(frame)
      else { for (const i of a.group) stickers[i].quaternion.identity(); resolve() }
    }
    requestAnimationFrame(frame)
  })
}
const inverse = m => (m[0] === '+' ? '-' : '+') + m.slice(1)

// ---------- model ----------
let scramble = solver.solved()       // the state the solution starts from
let scrambleText = ''
let steps = []                       // [{stage, move, basic: [signed basic moves]}] as found by the solver
let timeline = []                    // flat: [{stage, move, basic}]
let pos = 0                          // number of timeline entries applied
let shown = scramble                 // what the cube shows now
let busy = false, playing = false, solving = null

const stateAt = p => solver.applyAll(scramble, timeline.slice(0, p).map(t => t.basic))
function rebuildTimeline() { timeline = steps.flatMap(s => s.basic.map(b => ({ stage: s.stage, move: s.move, basic: b, part: s.part }))); $('scrub').max = timeline.length }
function show(p) { pos = p; shown = stateAt(p); paint(shown); updateUi() }

async function stepForward() {
  if (pos >= timeline.length) return false
  await animateTurn(timeline[pos].basic); pos++; shown = solver.apply(shown, timeline[pos - 1].basic); paint(shown); updateUi(); return true
}
async function stepBack() {
  if (pos <= 0) return false
  await animateTurn(inverse(timeline[pos - 1].basic)); pos--; shown = solver.apply(shown, inverse(timeline[pos].basic)); paint(shown); updateUi(); return true
}
async function run(task) { if (busy) return; busy = true; updateUi(); try { await task() } finally { busy = false; updateUi() } }

function stageBounds(stage) {
  const first = timeline.findIndex(t => t.stage === stage)
  if (first < 0) return null
  let last = first; while (last < timeline.length && timeline[last].stage === stage) last++
  return [first, last]
}

// ---------- UI ----------
function updateUi() {
  const atEnd = pos >= timeline.length
  $('first').disabled = $('prev').disabled = $('prev-stage').disabled = busy || pos === 0
  $('next').disabled = $('next-stage').disabled = busy || atEnd
  $('play').disabled = !timeline.length || (atEnd && !playing)
  $('play').textContent = playing ? '❚❚' : '▶'
  $('scrub').value = pos; $('scrub').disabled = busy || !timeline.length
  for (const id of ['demo', 'random', 'reset', 'solve']) $(id).disabled = busy || playing || !!solving
  document.querySelectorAll('.turns button').forEach(b => { b.disabled = busy || playing || !!solving })
  const cur = pos > 0 ? timeline[pos - 1] : null
  if (!timeline.length) $('now-stage').textContent = solver.isSolved(shown) ? 'Solved cube' : 'Scrambled'
  else if (!cur) $('now-stage').textContent = 'Scrambled · press ▶'
  else $('now-stage').textContent = `Stage ${cur.stage} of ${solver.lastStage} · ${cur.part ? 'finish: ' + cur.part.toLowerCase() : phaseOf(cur.stage)}`
  $('now-move').textContent = cur ? (cur.move.slice(1).startsWith('sp') ? `${cur.move} → ${cur.basic}` : cur.basic) : ''
  document.querySelectorAll('#stages li.st').forEach(li => li.classList.toggle('now', !!cur && Number(li.dataset.stage) === cur.stage))
}

function chip(m) { const sp = m.slice(1).startsWith('sp'); return `<span class="chip${sp ? ' sp' : ''}" title="${sp ? data.specials[m.slice(1)].join(' ') + (m[0] === '-' ? ' (inverted)' : '') : ''}">${m}</span>` }
function renderStages(stuck) {
  const byStage = new Map(steps.map(s => [s.stage, []])); steps.forEach(s => byStage.get(s.stage).push(s.move))
  let html = '', phase = ''
  for (let n = 1; n <= solver.lastStage; n++) {
    const ph = phaseOf(n); if (ph !== phase) { phase = ph; html += `<li class="phase">${ph}</li>` }
    const moves = byStage.get(n), done = solvedStages.has(n)
    const finished = n === solver.lastStage && finishSteps
    const body = finished ? finishSteps.map(p => `<span class="part">${p.name}${p.moves.length ? '' : ': already in place'}</span>${p.moves.map(chip).join('')}`).join('')
      : done ? (moves ? moves.map(chip).join('') : '<span class="chip none">already in place</span>')
      : stuck === n ? '<span class="chip none">not reachable with this stage\'s moves (see note)</span>' : '<span class="chip none">—</span>'
    html += `<li class="st${done ? '' : ' pending'}" data-stage="${n}"><span class="n">${n}</span><span class="chips">${body}</span></li>`
  }
  if (finishSteps) html += `<li class="ext">Stage ${solver.lastStage} in the original program only searches with u and sp16, which cannot place the last-layer pieces, so it never ends on most scrambles. Here it is finished with the group's own macros: edges with sp12/sp13, corners with sp14/sp15, then the corner twists done as on the slides (repeat sp16, turn u).</li>`
  $('stages').innerHTML = html
  updateUi()
}
let solvedStages = new Set(), finishSteps = null
$('stages').addEventListener('click', e => {
  const li = e.target.closest('li.st'); if (!li || busy || playing) return
  const b = stageBounds(Number(li.dataset.stage)); if (b) show(b[1])
})

function newScramble(state, text) {
  stopSolve(); playing = false; finishSteps = null
  scramble = state; scrambleText = text; steps = []; solvedStages = new Set(); rebuildTimeline(); show(0)
  $('scramble-note').textContent = text; $('bar').style.width = '0'
  setNote('Runs the same search as the Prolog program, stage by stage.'); renderStages()
}
function setNote(text, kind = '') { const n = $('solve-note'); n.textContent = text; n.className = 'note' + (kind ? ' ' + kind : '') }

const faceMoves = Object.keys(data.moves).filter(m => geo.moves[m].group.length < 132)
$('demo').onclick = () => newScramble(solver.applyAll(solver.solved(), data.demoScramble), `The ${data.demoScramble.length}-move test scramble from mytest.pl.`)
$('random').onclick = () => {
  const n = Math.max(1, Math.min(200, Number($('random-n').value) || 30)), seq = []
  while (seq.length < n) { const m = (Math.random() < 0.5 ? '+' : '-') + faceMoves[Math.floor(Math.random() * faceMoves.length)]; if (seq.length && seq.at(-1) === inverse(m)) continue; seq.push(m) }
  newScramble(solver.applyAll(solver.solved(), seq), `Random scramble: ${seq.join(' ')}`)
}
$('reset').onclick = () => newScramble(solver.solved(), '')
for (const m of [...faceMoves, 'r_v', 'r_ud']) for (const s of ['+', '-']) {
  const b = document.createElement('button'); b.textContent = s + m; b.title = m === 'r_v' || m === 'r_ud' ? 'Turn the whole cube' : 'Turn this face'
  b.onclick = () => run(async () => {
    if (timeline.length) { scramble = shown; steps = []; solvedStages = new Set(); finishSteps = null; rebuildTimeline(); pos = 0; renderStages() }
    await animateTurn(s + m); shown = solver.apply(shown, s + m); scramble = shown; paint(shown)
    scrambleText = 'Turned by hand.'; $('scramble-note').textContent = scrambleText
  })
  $('turns').appendChild(b)
}

$('first').onclick = () => show(0)
$('prev').onclick = () => run(stepBack)
$('next').onclick = () => run(stepForward)
// Back to just before the last stage shown; pressing again steps back stage by stage.
$('prev-stage').onclick = () => { if (pos > 0) show(stageBounds(timeline[pos - 1].stage)[0]) }
$('next-stage').onclick = () => { const cur = pos < timeline.length ? timeline[pos].stage : null; const b = cur !== null && stageBounds(cur); if (b) show(b[1]) }
$('scrub').oninput = e => show(Number(e.target.value))
$('play').onclick = async () => {
  if (playing) { playing = false; updateUi(); return }
  playing = true; updateUi()
  while (playing && pos < timeline.length) { busy = true; updateUi(); await stepForward(); busy = false }
  playing = false; updateUi()
}

// ---------- solving (in a worker) ----------
function stopSolve() { if (solving) { solving.terminate(); solving = null } }
$('solve').onclick = () => {
  if (solver.isSolved(scramble)) { setNote('The cube is already solved: scramble it first.', 'warn'); return }
  stopSolve(); steps = []; solvedStages = new Set(); finishSteps = null; rebuildTimeline(); show(0); renderStages()
  const started = performance.now()
  solving = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
  updateUi(); setNote('Solving stage 1…')
  solving.onmessage = ({ data: msg }) => {
    if (msg.type === 'progress') setNote(`Solving stage ${msg.stage} of ${solver.lastStage}: trying ${msg.depth}-move sequences…`)
    else if (msg.type === 'stage') {
      solvedStages.add(msg.stage)
      for (const move of msg.moves) steps.push({ stage: msg.stage, move, basic: solver.expand(move) })
      $('bar').style.width = (100 * msg.stage / solver.lastStage) + '%'
      if (msg.stage % 4 === 0 || msg.moves.length) { rebuildTimeline(); renderStages() }
    } else if (msg.type === 'finish') {
      solvedStages.add(msg.stage); finishSteps = msg.steps
      for (const step of msg.steps) for (const move of step.moves) steps.push({ stage: msg.stage, move, basic: solver.expand(move), part: step.name })
      $('bar').style.width = '100%'
    } else {
      rebuildTimeline(); stopSolve()
      const secs = ((performance.now() - started) / 1000).toFixed(1)
      const n = steps.length, b = timeline.length
      if (msg.type === 'done' && msg.finished) setNote(`Solved in ${secs} s: ${n} moves (${b} face turns). Stages 1–115 are the original program; the last stage uses the finish described below the stage list. Press ▶ to watch it.`, 'ok')
      else if (msg.type === 'done') setNote(`Solved in ${secs} s: ${n} moves (${b} face turns). Press ▶ to watch it.`, 'ok')
      else setNote(`Stages 1–${msg.stage - 1} done in ${secs} s (${n} moves, ${b} face turns). Stage ${msg.stage} has no solution within ${msg.maxDepth} moves: the method's last stage may only use u and sp16, which twist corners but cannot swap the last-layer edges, and no earlier goal puts those edges in place. The original Prolog program has the same gap.`, 'warn')
      renderStages(msg.type === 'stuck' ? msg.stage : undefined)
    }
  }
  solving.postMessage({ cmd: 'solve', state: Array.from(scramble) })
}

// Start on the test scramble from mytest.pl.
$('demo').onclick()
paint(shown)
window.__megaminx = { solver, geo, get state() { return shown }, get timeline() { return timeline } }
