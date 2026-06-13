import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { createInitialState, processTurn, processUlt, resolveBeforeTurn, AT_DAMAGE, SP_DAMAGE } from '../../shared/combat'
import { getAiMove } from '../logic/ai'
import { CHARACTERS } from '../../shared/characters'

const MOVES = ['AT', 'BL', 'SP']

// ─── Tooltip descriptions ─────────────────────────────────────────────────────

const TIPS = {
  keenEye:     { name: 'Keen Eye',     description: 'Grants crit chance on clean hits. Crits deal double damage. Crit chance increases with every RPS win.',               unlock: 'Deal damage 3 times.' },
  nimble:      { name: 'Nimble',       description: 'Chance to evade all incoming damage. Cannot evade ultimates. Evasion chance +2% per RPS win, caps at 30%.',          unlock: 'Successfully dodge AT 2 times.' },
  bloodletter: { name: 'Bloodletter',  description: 'Unleash a guaranteed attack that applies Bleed regardless of opponent\'s move. Must be re-unlocked after each use.',  unlock: 'Land 2 critical hits.' },
  siphon:      { name: 'Siphon',       description: 'Restores 25% of SP damage dealt as HP each between-turns phase.',                                                     unlock: 'Take self-damage 5 times.' },
  overload:    { name: 'Overload',     description: 'When HP drops below 30%, SP damage is permanently multiplied by 1.75.',                                               unlock: 'Accumulate 10 total self-damage.' },
  leech:       { name: 'Leech',        description: 'Good toggled reads restore HP equal to 100% of damage dealt. Suppresses self-damage that turn.',                      unlock: 'Land 3 good toggled reads (any move).' },
  moveAt:      { name: 'Attack',       description: 'A direct strike. Beats Special but loses to Block. Chaining Attack three times in a row builds bonus damage.' },
  moveSp:      { name: 'Special',      description: 'A powerful channeled move. Beats Block but loses to Attack. Chaining Special three times in a row builds damage reduction.' },
  moveBl:      { name: 'Block',        description: 'A defensive stance. Deals small chip damage to an attacker. Beats Attack but loses to Special.' },
  moveDodge:   { name: 'Dodge',        description: 'Cairan\'s unique counter. First dodge absorbs all incoming chip damage. Each consecutive dodge launches a counter-attack for double the attacker\'s AT damage.' },
  moveFF:      { name: 'Force Field',  description: 'Mourne\'s defensive barrier. Absorbs chip damage into the Force Field accumulator instead of taking HP loss. When the accumulator reaches 10, the stored energy fires back at the opponent.' },
}

// ─── Tooltip UI ───────────────────────────────────────────────────────────────

function TooltipBox({ name, description, stat, unlock, unlocked, x, y }) {
  const W = 224
  let left = x + 14
  let top  = y - 8
  if (left + W > window.innerWidth - 8) left = x - W - 14
  if (top < 8) top = y + 14
  return (
    <div style={{
      position: 'fixed', left, top, width: W, zIndex: 9999, pointerEvents: 'none',
      background: '#111', border: '1px solid #444', borderRadius: 4,
      padding: '8px 10px', fontFamily: 'monospace', fontSize: 11,
      color: '#fff', lineHeight: 1.5,
      boxShadow: '0 4px 14px rgba(0,0,0,0.85)',
    }}>
      <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4, color: '#ff0', letterSpacing: 0.5 }}>{name}</div>
      <div style={{ color: '#ccc' }}>{description}</div>
      {stat && (
        <div style={{ color: '#ff0', fontSize: 11, marginTop: 5 }}>{stat}</div>
      )}
      {unlock && !unlocked && (
        <div style={{ color: '#888', fontSize: 10, borderTop: '1px solid #333', paddingTop: 5, marginTop: 5 }}>
          🔒 Unlock: {unlock}
        </div>
      )}
    </div>
  )
}

// Wraps any element (e.g. a button) with tooltip hover logic
function TooltipWrap({ tip, unlocked = true, children }) {
  const [show, setShow]   = useState(false)
  const [pos,  setPos]    = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  return (
    <div
      style={{ display: 'contents' }}
      onMouseEnter={e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={e  => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => { clearTimeout(timer.current); setShow(false) }}
    >
      {children}
      {show && tip && <TooltipBox {...tip} unlocked={unlocked} x={pos.x} y={pos.y} />}
    </div>
  )
}

// ─── Character Select ─────────────────────────────────────────────────────────

const AFFINITY_COLOR = { good: '#5af', evil: '#f55' }
const CLASS_ICON     = { warrior: '⚔️', mage: '✨', tank: '🛡️' }

function CharacterSelect({ step, p1Char, onSelect }) {
  const [hovered, setHovered] = useState(null)

  const good = CHARACTERS.filter(c => c.affinity === 'good')
  const evil = CHARACTERS.filter(c => c.affinity === 'evil')

  function renderCard(char) {
    const accent = AFFINITY_COLOR[char.affinity]
    const isHovered = hovered === char.id
    return (
      <div
        key={char.id}
        onClick={() => onSelect(char)}
        onMouseEnter={() => setHovered(char.id)}
        onMouseLeave={() => setHovered(null)}
        style={{
          border: `2px solid ${isHovered ? accent : '#444'}`,
          backgroundColor: isHovered ? '#1c1c1c' : '#111',
          padding: '10px 12px',
          cursor: 'pointer',
          transition: 'border-color 0.12s, background-color 0.12s',
          userSelect: 'none',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: 13 }}>{char.name}</div>
        <div style={{ fontSize: 11, color: accent, marginBottom: 2 }}>
          {char.affinity.toUpperCase()}
        </div>
        <div style={{ fontSize: 11, color: '#aaa' }}>
          {CLASS_ICON[char.class]} {char.class} · {char.weight} · {char.hp} HP
        </div>
      </div>
    )
  }

  return (
    <div style={{
      maxWidth: 720,
      margin: '40px auto',
      fontFamily: 'monospace',
      color: '#fff',
      padding: '0 16px',
    }}>
      <h2 style={{ textAlign: 'center', marginBottom: 6, fontSize: 20 }}>
        {step === 1 ? 'P1 — Choose Your Character' : 'P2 — Choose Your Character'}
      </h2>

      {step === 2 && p1Char && (
        <div style={{ textAlign: 'center', marginBottom: 16, color: AFFINITY_COLOR[p1Char.affinity], fontSize: 13 }}>
          P1 locked in: <strong>{p1Char.name}</strong>
        </div>
      )}

      <div style={{ marginBottom: 8, color: '#5af', fontSize: 12 }}>GOOD</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
        {good.map(renderCard)}
      </div>

      <div style={{ marginBottom: 8, color: '#f55', fontSize: 12 }}>EVIL</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {evil.map(renderCard)}
      </div>
    </div>
  )
}

// ─── Ability Wheel ────────────────────────────────────────────────────────────

function AbilityWheel({ count, unlocked, label, maxCount = 3, tip }) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  const r = 34, cx = 40, cy = 40
  const circumference = 2 * Math.PI * r
  const filled  = Math.min(count, maxCount)
  const dashLen = filled > 0 ? (circumference / maxCount) * filled : 0
  const stroke  = unlocked ? '#ff4060' : '#c02030'
  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
      onMouseEnter={e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={e  => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => { clearTimeout(timer.current); setShow(false) }}
    >
      <svg viewBox="0 0 80 80" style={{ width: '100%', height: 'auto' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#333" strokeWidth={4} />
        {filled > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke={stroke} strokeWidth={4}
            strokeDasharray={`${dashLen} ${circumference}`}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )}
        {unlocked && (
          <text x={cx} y={cy + 6} textAnchor="middle" fontSize={18} fill="#ff4060" fontWeight="bold">✓</text>
        )}
      </svg>
      <div style={{ fontSize: 9, color: unlocked ? '#ff4060' : '#666', letterSpacing: 0.5, textAlign: 'center', marginTop: 3 }}>{label}</div>
      {show && tip && <TooltipBox {...tip} unlocked={unlocked} x={pos.x} y={pos.y} />}
    </div>
  )
}

// Mourne ability wheel — violet accent
function MourneAbilityWheel({ count, unlocked, label, maxCount = 3, tip }) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  const r = 34, cx = 40, cy = 40
  const circumference = 2 * Math.PI * r
  const filled  = Math.min(count, maxCount)
  const dashLen = filled > 0 ? (circumference / maxCount) * filled : 0
  const stroke  = unlocked ? '#c890ff' : '#b06cff'
  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
      onMouseEnter={e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={e  => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => { clearTimeout(timer.current); setShow(false) }}
    >
      <svg viewBox="0 0 80 80" style={{ width: '100%', height: 'auto' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#333" strokeWidth={4} />
        {filled > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke={stroke} strokeWidth={4}
            strokeDasharray={`${dashLen} ${circumference}`}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )}
        {unlocked && (
          <text x={cx} y={cy + 6} textAnchor="middle" fontSize={18} fill="#c890ff" fontWeight="bold">✓</text>
        )}
      </svg>
      <div style={{ fontSize: 9, color: unlocked ? '#c890ff' : '#888', letterSpacing: 0.5, textAlign: 'center', marginTop: 3 }}>{label}</div>
      {show && tip && <TooltipBox {...tip} unlocked={unlocked} x={pos.x} y={pos.y} />}
    </div>
  )
}

// ─── Log ──────────────────────────────────────────────────────────────────────

const BL_TIE_REASON = {
  weight: 'lighter weight',
  class:  'class advantage',
  hp:     'lower HP',
  coin:   'coin toss',
}

function LogRow({ entry }) {
  if (entry.isBLTie) {
    const who    = entry.blTieWinner === 'p1' ? 'P1' : 'P2'
    const loser  = entry.blTieWinner === 'p1' ? 'P2' : 'P1'
    const reason = BL_TIE_REASON[entry.blTieReason] ?? entry.blTieReason
    return (
      <div style={{ marginBottom: 6, lineHeight: 1.5 }}>
        <div>
          <span style={{ color: '#888' }}>T{entry.turn}</span>
          {'  P1 '}<span style={{ color: '#5af' }}>BL</span>
          {'  P2 '}<span style={{ color: '#5af' }}>BL</span>
          {'  '}<span style={{ color: '#aaa' }}>— CLASH</span>
        </div>
        <div style={{ paddingLeft: 16 }}>
          <span style={{ color: '#f90', fontWeight: 'bold' }}>{who} wins by {reason}</span>
          {'  '}
          <span style={{ color: '#f55' }}>{loser} took {entry.blTieDamage}</span>
        </div>
      </div>
    )
  }

  if (entry.isUlt) {
    const who = entry.ultUser === 'p1' ? 'P1' : 'P2'
    return (
      <div style={{ marginBottom: 6, lineHeight: 1.5, color: '#f90' }}>
        <span style={{ color: '#888' }}>T{entry.turn}</span>
        {`  ${who} ULT — ${entry.rawDamage} dmg`}
        {` → `}<span style={{ color: '#f55' }}>{entry.actualDamage} dealt</span>
        {entry.healAmount > 0 && <span style={{ color: '#4f4' }}>, +{entry.healAmount} HP</span>}
      </div>
    )
  }

  const p1PlainAT = entry.p1Move === 'AT' && entry.p1Read === 'none'
  const p2PlainAT = entry.p2Move === 'AT' && entry.p2Read === 'none'
  const p1PlainSP = entry.p1Move === 'SP' && entry.p1Read === 'none'
  const p2PlainSP = entry.p2Move === 'SP' && entry.p2Read === 'none'

  const details = []
  if (entry.p1Damage > 0)
    details.push(<span key="p1d" style={{ color: '#f55' }}>P1 took {entry.p1Damage}</span>)
  if (entry.p2Damage > 0)
    details.push(<span key="p2d" style={{ color: '#f55' }}>P2 took {entry.p2Damage}</span>)
  if (entry.p1FlowActivated) details.push(<span key="p1flow" style={{ color: '#f80', fontWeight: 'bold' }}>P1 FLOW STATE</span>)
  if (entry.p2FlowActivated) details.push(<span key="p2flow" style={{ color: '#f80', fontWeight: 'bold' }}>P2 FLOW STATE</span>)
  if (entry.p1FlowBroken)    details.push(<span key="p1flowb" style={{ color: '#888' }}>P1 flow broken</span>)
  if (entry.p2FlowBroken)    details.push(<span key="p2flowb" style={{ color: '#888' }}>P2 flow broken</span>)

  if (p1PlainAT && entry.p1AtChain > 2)
    details.push(<span key="p1at" style={{ color: '#ff0' }}>P1 AT×{entry.p1AtChain}→{entry.p1AtDmgBuff}</span>)
  if (p2PlainAT && entry.p2AtChain > 2)
    details.push(<span key="p2at" style={{ color: '#ff0' }}>P2 AT×{entry.p2AtChain}→{entry.p2AtDmgBuff}</span>)
  if (p1PlainSP && entry.p1SpChain >= 2 && entry.p1SpDmgBuff > 0)
    details.push(<span key="p1sp" style={{ color: '#ff0' }}>P1 SP×{entry.p1SpChain}→{entry.p1SpDmgBuff}</span>)
  if (p2PlainSP && entry.p2SpChain >= 2 && entry.p2SpDmgBuff > 0)
    details.push(<span key="p2sp" style={{ color: '#ff0' }}>P2 SP×{entry.p2SpChain}→{entry.p2SpDmgBuff}</span>)

  return (
    <div style={{ marginBottom: 6, lineHeight: 1.5 }}>
      <div>
        <span style={{ color: '#888' }}>T{entry.turn}</span>
        {'  P1 '}
        <span style={{ color: '#5af' }}>{entry.p1Move}</span>
        {entry.p1Read === 'good' && <span style={{ color: '#4f4' }}> good</span>}
        {entry.p1Read === 'bad'  && <span style={{ color: '#f55' }}> bad</span>}
        {'  P2 '}
        <span style={{ color: '#5af' }}>{entry.p2Move}</span>
        {entry.p2Read === 'good' && <span style={{ color: '#4f4' }}> good</span>}
        {entry.p2Read === 'bad'  && <span style={{ color: '#f55' }}> bad</span>}
      </div>
      {details.length > 0 && (
        <div style={{ paddingLeft: 16 }}>
          {details.map((el, i) => [i > 0 ? '  ' : null, el])}
        </div>
      )}
    </div>
  )
}

// ─── HP Bar ───────────────────────────────────────────────────────────────────

const MOVE_EMOJI = { AT: '⚔️', BL: '🛡️', SP: '✨' }

function HpBar({ hp, maxHp, alignRight = false, className }) {
  const pct = Math.max(0, hp / maxHp)
  const hue = Math.max(0, (pct - 0.1) / 0.9 * 120)
  return (
    <div className={['hp-bar', className].filter(Boolean).join(' ')} style={{ width: 280, height: 7, backgroundColor: '#222', marginBottom: 6, marginLeft: alignRight ? 'auto' : 0 }}>
      <div style={{
        width: `${pct * 100}%`,
        height: '100%',
        backgroundColor: `hsl(${hue}, 100%, 38%)`,
        transition: 'width 0.3s ease, background-color 0.3s ease',
        marginLeft: alignRight ? 'auto' : 0,
      }} />
    </div>
  )
}

// ─── GameBoard ────────────────────────────────────────────────────────────────

export default function GameBoard() {
  const [state, setState]           = useState(null)
  const [selectStep, setSelectStep] = useState(1)
  const [p1CharSel, setP1CharSel]   = useState(null)

  const [p1ReadActive, setP1ReadActive]               = useState(false)
  const [animating, setAnimating]                     = useState(false)
  const [lastMoves, setLastMoves]                     = useState({ p1: null, p2: null })
  const [lastReads, setLastReads]                     = useState({ p1: 'none', p2: 'none' })
  const [displayedState, setDisplayedState]           = useState(null)
  const [ultAnimating, setUltAnimating]               = useState(false)
  const [collapseAnimating, setCollapseAnimating]     = useState(false)
  const [collapseData, setCollapseData]               = useState(null)
  const [critDisplay, setCritDisplay]                 = useState({ p1: false, p2: false })
  const [betweenTurns, setBetweenTurns]               = useState(false)
  const [activeEffect, setActiveEffect]               = useState(null)
  const [statUpFlashes, setStatUpFlashes]             = useState({ p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 })
  const [deathEffectsReady, setDeathEffectsReady]     = useState(false)
  const forceCritRef = useRef(false)

  // ── Online multiplayer ────────────────────────────────────────────────────
  const [gameMode, setGameMode] = useState(null)   // null | 'offline' | 'online'
  const [copied,   setCopied]   = useState(false)
  const [online, setOnline]     = useState({
    phase:         'menu',       // 'menu'|'create'|'join'|'waiting'|'char_select'
    roomId:        null,
    myIndex:       null,         // 0=P1  1=P2
    chars:         [null, null], // charId per slot, filled as players select
    pendingMove:   false,
    opponentReady: false,
    error:         null,
    joinInput:     '',
  })
  const socketRef       = useRef(null)
  const pendingStateRef = useRef(null)
  const currentStateRef = useRef(null)

  const [windowWidth, setWindowWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 800)
  useEffect(() => {
    const handle = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])
  const isMobile = windowWidth < 600

  useEffect(() => { currentStateRef.current = state }, [state])

  useEffect(() => {
    const rid = new URLSearchParams(window.location.search).get('room')
    if (rid) {
      setGameMode('online')
      setOnline(o => ({ ...o, phase: 'waiting', joinInput: rid }))
      openSocket(rid)
    }
    return () => socketRef.current?.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!animating) return
    const impact = setTimeout(() => setDisplayedState(null), 2000)
    const end    = setTimeout(() => setAnimating(false), 2250)
    return () => { clearTimeout(impact); clearTimeout(end) }
  }, [animating])

  // Trigger death effects (flip + grayscale) only after all animations finish
  const isGameOver = state ? (state.p1.hp === 0 || state.p2.hp === 0) : false
  useEffect(() => {
    if (isGameOver && !animating && !ultAnimating && !collapseAnimating && !betweenTurns) {
      setDeathEffectsReady(true)
    }
  }, [isGameOver, animating, ultAnimating, collapseAnimating, betweenTurns])

  // ── Socket ────────────────────────────────────────────────────────────────

  function openSocket(autoJoinRoom = null) {
    if (socketRef.current) {
      if (autoJoinRoom && socketRef.current.connected) {
        socketRef.current.emit('join_room', { roomId: autoJoinRoom })
      }
      return socketRef.current
    }
    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      if (autoJoinRoom) socket.emit('join_room', { roomId: autoJoinRoom })
    })

    socket.on('room_created', ({ roomId }) => {
      setOnline(o => ({ ...o, phase: 'waiting', roomId }))
    })

    socket.on('room_state', ({ phase, myIndex, chars, gameState, pendingMove, opponentReady }) => {
      setOnline(o => ({
        ...o, phase,
        myIndex:       myIndex       ?? o.myIndex,
        chars:         chars         ?? o.chars,
        pendingMove,
        opponentReady,
      }))

      if ((phase === 'game' || phase === 'done') && gameState) {
        const prev = currentStateRef.current
        if (!prev) { setState(gameState); return }
        if (prev.log.length !== gameState.log.length) {
          const lt = gameState.lastTurn
          setDisplayedState(prev)
          if (lt?.p1Move) setLastMoves({ p1: lt.p1Move, p2: lt.p2Move })
          if (lt)         setLastReads({ p1: lt.p1Read ?? 'none', p2: lt.p2Read ?? 'none' })
          pendingStateRef.current = gameState

          if (lt?.isUlt) {
            const ultUser = lt.ultUser
            const isCollapse = (ultUser === 'p1' ? prev.p1 : prev.p2).hasMourne
            if (isCollapse) {
              setCollapseData({
                ffAbsorbed: lt.ffAbsorbed, selfDmg: lt.selfDmg,
                rawDamage: lt.rawDamage, actualDamage: lt.actualDamage,
                healAmount: lt.healAmount, overloadBoosted: lt.overloadBoosted,
              })
              setCollapseAnimating(true)
              setTimeout(() => { setState(pendingStateRef.current); setDisplayedState(null) }, 2100)
              setTimeout(() => { setCollapseAnimating(false); setCollapseData(null) }, 3500)
            } else {
              setUltAnimating(true)
              setTimeout(() => { setState(pendingStateRef.current); setDisplayedState(null) }, 1050)
              setTimeout(() => setUltAnimating(false), 2000)
            }
          } else {
            setAnimating(true)
            if (lt?.p1CritHit || lt?.p2CritHit) {
              setTimeout(() => setCritDisplay({ p1: !!lt.p1CritHit, p2: !!lt.p2CritHit }), 2000)
              setTimeout(() => setCritDisplay({ p1: false, p2: false }), 4000)
            }
            setTimeout(() => { setState(pendingStateRef.current); setDisplayedState(null) }, 2000)
            setTimeout(() => setAnimating(false), 2250)
          }
        }
      }
    })

    socket.on('connect_error', (err) => {
      setOnline(o => ({ ...o, error: `Can't reach server: ${err.message}. Is npm run server running?` }))
    })

    socket.on('opponent_disconnected', () => {
      setOnline(o => ({ ...o, error: 'Opponent disconnected.' }))
    })

    socket.on('error', ({ message }) => {
      setOnline(o => ({ ...o, error: message }))
    })

    return socket
  }

  function handleCreateRoom() {
    setOnline(o => ({ ...o, phase: 'create', error: null }))
    const socket = openSocket()
    const go = () => socket.emit('create_room')
    if (socket.connected) go(); else socket.once('connect', go)
  }

  function handleJoinRoom() {
    const raw = online.joinInput.trim()
    let roomId = raw
    try { const u = new URL(raw); roomId = u.searchParams.get('room') || raw } catch {}
    if (!roomId) return
    setOnline(o => ({ ...o, phase: 'waiting', roomId, error: null }))
    const socket = openSocket()
    const go = () => socket.emit('join_room', { roomId })
    if (socket.connected) go(); else socket.once('connect', go)
  }

  function handleOnlineCharSelect(char) {
    socketRef.current?.emit('select_char', { charId: char.id })
    setOnline(o => { const c = [...o.chars]; c[o.myIndex] = char.id; return { ...o, chars: c } })
  }

  function handleOnlineMove(move, opts = {}) {
    if (animating || online.pendingMove) return
    socketRef.current?.emit('submit_move', {
      move, readActive: p1ReadActive,
      useBloodletter: opts.useBloodletter ?? false, useUlt: false,
    })
    setP1ReadActive(false)
    setOnline(o => ({ ...o, pendingMove: true }))
  }

  function handleOnlineUlt() {
    if (animating || ultAnimating || collapseAnimating || online.pendingMove) return
    socketRef.current?.emit('submit_move', { move: null, readActive: false, useBloodletter: false, useUlt: true })
    setOnline(o => ({ ...o, pendingMove: true }))
  }

  function handleOnlineBloodletter() { handleOnlineMove('AT', { useBloodletter: true }) }

  function handleOnlineRematch() {
    setState(null); setP1ReadActive(false); setAnimating(false); setDisplayedState(null)
    setUltAnimating(false); setCollapseAnimating(false); setCollapseData(null)
    setBetweenTurns(false); setActiveEffect(null); setDeathEffectsReady(false)
    setStatUpFlashes({ p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 })
    setOnline(o => ({ ...o, pendingMove: false, opponentReady: false }))
    socketRef.current?.emit('rematch')
  }

  function handleOnlineLeave() {
    socketRef.current?.disconnect(); socketRef.current = null
    setState(null); setGameMode(null)
    setOnline({ phase: 'menu', roomId: null, myIndex: null, chars: [null, null], pendingMove: false, opponentReady: false, error: null, joinInput: '' })
    setP1ReadActive(false); setAnimating(false); setDisplayedState(null)
    setUltAnimating(false); setCollapseAnimating(false); setCollapseData(null)
    setBetweenTurns(false); setActiveEffect(null); setDeathEffectsReady(false)
    setStatUpFlashes({ p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 })
    window.history.replaceState({}, '', window.location.pathname)
  }

  // ── Character Select ──────────────────────────────────────────────────────

  function handleCharSelect(char) {
    if (selectStep === 1) {
      setP1CharSel(char)
      setSelectStep(2)
    } else {
      setState(createInitialState(p1CharSel, char))
    }
  }

  // ── Pre-game screens ──────────────────────────────────────────────────────
  if (!state) {
    // Mode selection
    if (gameMode === null) {
      return (
        <div style={{ maxWidth: 380, margin: '100px auto', fontFamily: 'monospace', color: '#fff', textAlign: 'center', padding: '0 16px' }}>
          <h1 style={{ fontSize: 34, letterSpacing: 6, marginBottom: 60, color: '#ff0', textShadow: '0 0 24px #f804' }}>COMBAT</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button onClick={() => setGameMode('offline')}
              style={{ padding: '16px 0', fontSize: 14, letterSpacing: 3, background: '#111', border: '1px solid #555', color: '#ccc', cursor: 'pointer' }}>
              VS AI
            </button>
            <button onClick={() => setGameMode('online')}
              style={{ padding: '16px 0', fontSize: 14, letterSpacing: 3, background: '#111', border: '1px solid #5af', color: '#5af', cursor: 'pointer' }}>
              PLAY ONLINE
            </button>
          </div>
        </div>
      )
    }

    // Offline char select — existing flow
    if (gameMode === 'offline') {
      return <CharacterSelect step={selectStep} p1Char={p1CharSel} onSelect={handleCharSelect} />
    }

    // Online flow
    const { phase, roomId, myIndex, chars, error, joinInput } = online
    const myCharSelected = myIndex !== null && chars[myIndex] !== null
    const shareUrl = roomId ? `${window.location.origin}${window.location.pathname}?room=${roomId}` : ''

    if (phase === 'char_select') {
      if (myCharSelected) {
        const myChar = CHARACTERS.find(c => c.id === chars[myIndex])
        return (
          <div style={{ maxWidth: 380, margin: '100px auto', fontFamily: 'monospace', color: '#fff', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#4f4', marginBottom: 12 }}>✓ Locked in: <strong>{myChar?.name}</strong></div>
            <div style={{ color: '#888', fontSize: 12 }}>Waiting for opponent to choose...</div>
          </div>
        )
      }
      return (
        <CharacterSelect
          step={myIndex === 1 ? 2 : 1}
          p1Char={null}
          onSelect={handleOnlineCharSelect}
        />
      )
    }

    // Lobby — menu / create / join / waiting
    return (
      <div style={{ maxWidth: 400, margin: '80px auto', fontFamily: 'monospace', color: '#fff', padding: '0 20px' }}>
        <button onClick={() => { setGameMode(null); setOnline(o => ({ ...o, phase: 'menu', error: null })) }}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, marginBottom: 28, padding: 0, letterSpacing: 1 }}>
          ← BACK
        </button>

        <h2 style={{ fontSize: 16, letterSpacing: 4, marginBottom: 32, textAlign: 'center', color: '#5af' }}>PLAY ONLINE</h2>

        {error && (
          <div style={{ background: '#300', border: '1px solid #f44', color: '#f88', padding: '8px 12px', marginBottom: 20, fontSize: 12 }}>
            {error}
          </div>
        )}

        {/* Create / Join buttons */}
        {(phase === 'menu' || phase === 'create') && !roomId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={handleCreateRoom}
              style={{ padding: '15px 0', fontSize: 13, letterSpacing: 3, background: '#111', border: '1px solid #5af', color: '#5af', cursor: 'pointer' }}>
              CREATE ROOM
            </button>
            <button onClick={() => setOnline(o => ({ ...o, phase: 'join', error: null }))}
              style={{ padding: '15px 0', fontSize: 13, letterSpacing: 3, background: '#111', border: '1px solid #555', color: '#ccc', cursor: 'pointer' }}>
              JOIN ROOM
            </button>
          </div>
        )}

        {/* Join input */}
        {phase === 'join' && (
          <div>
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>Paste a room ID or full invite link:</div>
            <input
              value={joinInput}
              onChange={e => setOnline(o => ({ ...o, joinInput: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
              placeholder="e.g. A1B2C3D4"
              autoFocus
              style={{ width: '100%', padding: '10px 12px', background: '#111', border: '1px solid #555', color: '#fff', fontFamily: 'monospace', fontSize: 14, boxSizing: 'border-box' }}
            />
            <button onClick={handleJoinRoom}
              style={{ marginTop: 10, width: '100%', padding: '13px 0', fontSize: 13, letterSpacing: 3, background: '#111', border: '1px solid #5af', color: '#5af', cursor: 'pointer' }}>
              JOIN
            </button>
            <button onClick={() => setOnline(o => ({ ...o, phase: 'menu' }))}
              style={{ marginTop: 8, width: '100%', padding: '8px 0', fontSize: 11, background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}

        {/* Waiting — show room ID + copy link */}
        {phase === 'waiting' && roomId && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6, letterSpacing: 2 }}>ROOM ID</div>
            <div style={{ fontSize: 30, fontWeight: 'bold', letterSpacing: 8, color: '#ff0', marginBottom: 22, textShadow: '0 0 16px #ff08' }}>
              {roomId}
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              style={{ padding: '10px 28px', fontSize: 12, letterSpacing: 2, background: copied ? '#0d2a0d' : '#111', border: `1px solid ${copied ? '#4f4' : '#5af'}`, color: copied ? '#4f4' : '#5af', cursor: 'pointer', marginBottom: 28 }}>
              {copied ? '✓  COPIED' : 'COPY INVITE LINK'}
            </button>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Waiting for opponent to join...</div>
            <div style={{ color: '#5af', letterSpacing: 6, fontSize: 20 }}>· · ·</div>
          </div>
        )}

        {/* Connecting / waiting without roomId yet */}
        {(phase === 'create' || phase === 'waiting') && !roomId && (
          <div style={{ textAlign: 'center', color: '#888', fontSize: 12 }}>Connecting...</div>
        )}
      </div>
    )
  }

  // ── Game ──────────────────────────────────────────────────────────────────

  const isOnline = gameMode === 'online'
  const gameOver = state.p1.hp === 0 || state.p2.hp === 0
  const loser    = state.p1.hp === 0 ? 'p1' : state.p2.hp === 0 ? 'p2' : null
  // myPlayer = the player this client controls (always p1 in offline, depends on myIndex online)
  const myPlayer = isOnline ? (online.myIndex === 0 ? state.p1 : state.p2) : state.p1
  const dispP1Hp = displayedState ? displayedState.p1.hp : state.p1.hp
  const dispP2Hp = displayedState ? displayedState.p2.hp : state.p2.hp

  // Build announcement steps from unlock events in lastTurn (Cairan + Leech)
  function buildUnlockSteps(newState) {
    const toStep = (name, prefix) => ({
      type: 'announce',
      message: (prefix ? prefix + ' ' : '') + (
        name === 'keenEye'     ? 'KEEN EYE UNLOCKED' :
        name === 'nimble'      ? 'NIMBLE UNLOCKED' :
        name === 'bloodletter' ? 'BLOODLETTER READY' :
        name === 'leech'       ? 'LEECH UNLOCKED' :
        name.toUpperCase() + ' UNLOCKED'
      ),
      stateAfter: null,
    })
    const p1Steps = (newState.lastTurn?.p1NewUnlocks ?? []).map(n => toStep(n, ''))
    const p2Steps = (newState.lastTurn?.p2NewUnlocks ?? []).map(n => toStep(n, 'ENEMY'))
    return [...p1Steps, ...p2Steps]
  }

  function scheduleEffects(steps, baseDelay) {
    if (steps.length === 0) return
    setTimeout(() => setBetweenTurns(true), baseDelay - 50)
    steps.forEach((step, idx) => {
      setTimeout(() => {
        if (step.stateAfter !== null) setState(step.stateAfter)
        setActiveEffect({ ...step, key: idx })
      }, baseDelay + idx * 2000)
    })
    setTimeout(() => {
      setBetweenTurns(false)
      setActiveEffect(null)
    }, baseDelay + steps.length * 2000)
  }

  function handleMove(p1Move, opts = {}) {
    if (animating) return
    const { move: p2Move, useRead: p2ReadActive } = getAiMove(state)
    const p2UseBloodletter = state.p2.bloodletterUnlocked && state.p2.hasDodge
    const newState = processTurn(state, p1Move, p2Move, p1ReadActive, p2ReadActive, {
      p1ForceCrit: forceCritRef.current,
      p1UseBloodletter: opts.useBloodletter ?? false,
      p2UseBloodletter,
    })
    forceCritRef.current = false
    setDisplayedState(state)
    setState(newState)
    setLastMoves({ p1: p1Move, p2: p2Move })
    setLastReads({ p1: newState.lastTurn.p1Read ?? 'none', p2: newState.lastTurn.p2Read ?? 'none' })
    setAnimating(true)
    setP1ReadActive(false)
    // Crit display at impact moment
    const { p1CritHit, p2CritHit } = newState.lastTurn
    if (p1CritHit || p2CritHit) {
      setTimeout(() => setCritDisplay({ p1: p1CritHit, p2: p2CritHit }), 2000)
      setTimeout(() => setCritDisplay({ p1: false, p2: false }), 4000)
    }
    // Cairan stat-up flashes — non-blocking, fire after animation
    const p1ke = state.p1.hasDodge && newState.p1.keenEyeUnlocked  && newState.p1.keenEyeChance > state.p1.keenEyeChance
    const p1nb = state.p1.hasDodge && newState.p1.nimbleUnlocked    && newState.p1.nimbleChance  > state.p1.nimbleChance
    const p2ke = state.p2.hasDodge && newState.p2.keenEyeUnlocked  && newState.p2.keenEyeChance > state.p2.keenEyeChance
    const p2nb = state.p2.hasDodge && newState.p2.nimbleUnlocked    && newState.p2.nimbleChance  > state.p2.nimbleChance
    if (p1ke || p1nb || p2ke || p2nb) {
      const flashKey = Date.now()
      setTimeout(() => setStatUpFlashes({ p1ke, p1nb, p2ke, p2nb, key: flashKey }), 2300)
      setTimeout(() => setStatUpFlashes(s => s.key === flashKey ? { p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 } : s), 3500)
    }
    // Between-turns: bleeds + Mourne effects, then unlock announcements
    const effectSteps = resolveBeforeTurn(newState)
    const unlockSteps = buildUnlockSteps(newState)
    scheduleEffects([...effectSteps, ...unlockSteps], 2650)
  }

  function handleBloodletter() {
    handleMove('AT', { useBloodletter: true })
  }

  function handleUlt() {
    if (animating || ultAnimating || collapseAnimating) return
    const ultState = processUlt(state, 'p1')

    if (state.p1.hasMourne) {
      // COLLAPSE path — 3.5s dramatic animation
      const lt = ultState.lastTurn
      setCollapseData({
        ffAbsorbed: lt.ffAbsorbed,
        selfDmg: lt.selfDmg,
        rawDamage: lt.rawDamage,
        actualDamage: lt.actualDamage,
        healAmount: lt.healAmount,
        overloadBoosted: lt.overloadBoosted,
      })
      setDisplayedState(state)
      setCollapseAnimating(true)
      // Apply damage at ~60% through (≈2100ms)
      setTimeout(() => {
        setState(ultState)
        setDisplayedState(null)
      }, 2100)
      // End animation at 3.5s
      setTimeout(() => {
        setCollapseAnimating(false)
        setCollapseData(null)
      }, 3500)
      scheduleEffects(resolveBeforeTurn(ultState), 3900)
      return
    }

    setDisplayedState(state)
    setUltAnimating(true)
    setTimeout(() => {
      setState(ultState)
      setDisplayedState(null)
    }, 1050)
    setTimeout(() => setUltAnimating(false), 2000)
    scheduleEffects(resolveBeforeTurn(ultState), 2400)
  }

  function handleReset() {
    setState(createInitialState(state.p1Character, state.p2Character))
    setP1ReadActive(false)
    setAnimating(false)
    setDisplayedState(null)
    setUltAnimating(false)
    setCollapseAnimating(false)
    setCollapseData(null)
    setBetweenTurns(false)
    setActiveEffect(null)
    setStatUpFlashes({ p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 })
    setDeathEffectsReady(false)
  }

  function handleChangeChars() {
    setState(null)
    setSelectStep(1)
    setP1CharSel(null)
    setP1ReadActive(false)
    setAnimating(false)
    setDisplayedState(null)
    setUltAnimating(false)
    setBetweenTurns(false)
    setActiveEffect(null)
    setStatUpFlashes({ p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 })
  }

  const p1Name   = state.p1Character?.name ?? 'P1'
  const p2Name   = state.p2Character?.name ?? 'P2'
  const p1Accent = AFFINITY_COLOR[state.p1Character?.affinity] ?? '#e03050'
  const p2Accent = AFFINITY_COLOR[state.p2Character?.affinity] ?? '#e03050'

  // ── Effect banner helpers ─────────────────────────────────────────────────
  function renderEffectBanner(effect) {
    if (!effect || effect.type === 'announce') return null
    const { type, player, damage, heal, caster } = effect
    const playerName   = player   ? (player  === 'p1' ? p1Name : p2Name) : ''
    const casterName   = caster   ? (caster  === 'p1' ? p1Name : p2Name) : ''

    let color = '#e03030'
    let text  = ''

    if (type === 'bleed') {
      text = `${playerName} ☠ BLEED — ${damage} damage`
    } else if (type === 'mourne_ff') {
      color = '#b06cff'
      text  = `${casterName} FORCE FIELD UNLEASHED — ${damage} damage to ${playerName}`
    } else if (type === 'mourne_self') {
      color = '#c04070'
      text  = `${playerName} SELF-DAMAGE — ${damage}`
    } else if (type === 'mourne_siphon') {
      color = '#40aaff'
      text  = `${playerName} SIPHON — +${heal} HP`
    } else if (type === 'mourne_leech') {
      color = '#40dd88'
      text  = `${playerName} LEECH — +${heal} HP`
    } else if (type === 'lit_at_lifesteal') {
      color = '#ff6080'
      text  = `${playerName} LIT ATTACK — lifesteal +${heal} HP`
    }

    if (!text) return null
    return (
      <div key={effect.key} className="effect-banner">
        <span style={{ fontSize: 16, fontWeight: 'bold', color, letterSpacing: 1 }}>{text}</span>
      </div>
    )
  }

  // Move label: BL → DO (Cairan dodge), FF (Mourne force field), or BL
  function blLabel(player) {
    if (player.hasDodge)  return 'DODGE'
    if (player.hasMourne) return ['FORCE', 'FIELD']
    return 'BLOCK'
  }

  function moveLabel(move, player) {
    if (move === 'AT') return 'ATTACK'
    if (move === 'SP') return 'SPECIAL'
    return blLabel(player)
  }

  function litClass(player, move) {
    const key = move === 'AT' ? 'at' : move === 'SP' ? 'sp' : 'bl'
    if (!player.litMoves?.[key]) return undefined
    if (player.hasDodge)  return 'lit-crimson'
    if (player.hasMourne) return 'lit-violet'
    return 'lit-gold'
  }

  function cycleTip(move, player) {
    if (move === 'AT') return TIPS.moveAt
    if (move === 'SP') return TIPS.moveSp
    if (player.hasDodge)  return TIPS.moveDodge
    if (player.hasMourne) return TIPS.moveFF
    return TIPS.moveBl
  }

  return (
    <>
    {ultAnimating && <div className="ult-screen-overlay" />}
    {ultAnimating && <div className="ult-text">ASSASSINATE</div>}
    {collapseAnimating && <div className="collapse-overlay" />}
    {collapseAnimating && <div className="collapse-title">COLLAPSE</div>}
    {collapseAnimating && collapseData && (
      <div className="collapse-subtext">
        {`FF ${collapseData.ffAbsorbed} + SELF ${collapseData.selfDmg} = ${collapseData.rawDamage}`}
        {collapseData.overloadBoosted ? ` × 1.75 = ${collapseData.actualDamage}` : ''}
        {` ⟹ HEAL ${collapseData.healAmount}`}
      </div>
    )}
    {activeEffect?.type === 'announce' && (
      <div key={activeEffect.key} className="unlock-text">{activeEffect.message}</div>
    )}
    <div className="game-container" style={{ maxWidth: 620, margin: '40px auto', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      <div className="panels-row" style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 24 }}>

        {/* ── P1 ── */}
        <div className="panel panel-p1">
          {isMobile && (
            <div className="panel-stats-mobile">
              <span style={{ color: p1Accent, fontWeight: 'bold', marginRight: 4 }}>{p1Name}</span>
              <span style={{ color: '#aaa' }}>HP:{dispP1Hp} AT:{Math.max(state.p1.atDmgBuff, state.p1.baseAtDamage)} SP:{state.p1.hasMourne && state.p1.overloadActive ? Math.floor(Math.max(state.p1.spDmgBuff, state.p1.baseSpDamage) * 1.75) : Math.max(state.p1.spDmgBuff, state.p1.baseSpDamage)}</span>
            </div>
          )}
          <div className={['portrait-wrap', collapseAnimating ? 'collapse-charge' : ultAnimating ? 'ult-charge' : animating ? 'p1-fight' : undefined].filter(Boolean).join(' ')}
               style={{ position: 'relative', width: 280, height: 280, marginBottom: 4, display: 'inline-block' }}>
            <img
              src={state.p1Character?.portrait ?? '/src/img/tyrone.png'}
              alt="P1"
              className={['portrait-img', state.p1.flowState ? 'flow-portrait' : undefined].filter(Boolean).join(' ')}
              style={{ width: 280, height: 280, objectFit: 'cover', border: '2px solid #555', display: 'block', transition: 'transform 0.9s ease, filter 0.9s ease', transform: deathEffectsReady && loser === 'p1' ? 'rotate(180deg)' : undefined, filter: deathEffectsReady && loser === 'p1' ? 'grayscale(1)' : undefined }}
            />
            {animating && lastMoves.p1 && (
              <span className="move-emoji">
                {MOVE_EMOJI[lastMoves.p1]}
                {lastReads.p1 !== 'none' && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 4, marginTop: 6,
                    color: lastReads.p1 === 'good' ? '#4f4' : '#f44',
                    textShadow: lastReads.p1 === 'good' ? '0 0 8px #0f0' : '0 0 8px #f00',
                    fontWeight: 'bold', fontSize: 18, letterSpacing: 2, whiteSpace: 'nowrap',
                  }}>
                    READ {lastReads.p1 === 'good' ? '✓' : '✗'}
                  </span>
                )}
              </span>
            )}
            {critDisplay.p2 && (
              <div className="crit-overlay">
                <div style={{ fontSize: 90, color: '#f00', fontWeight: 'bold', lineHeight: 1, textShadow: '0 0 20px #f00, 0 0 40px #f008' }}>!</div>
                <div style={{ fontSize: 13, color: '#f00', fontWeight: 'bold', letterSpacing: 3, whiteSpace: 'nowrap', textShadow: '0 0 8px #f00' }}>CRITICAL HIT!</div>
              </div>
            )}
          </div>
          <HpBar hp={dispP1Hp} maxHp={state.p1.maxHp} />
          {!isMobile && state.p1.flowState && (
            <div style={{ fontSize: 9, color: '#f80', fontWeight: 'bold', letterSpacing: 2, marginBottom: 2 }}>FLOW</div>
          )}
          {!isMobile && state.p1.overloadActive && (
            <div style={{ fontSize: 9, color: '#b06cff', fontWeight: 'bold', letterSpacing: 2, marginBottom: 2 }}>OVERLOAD</div>
          )}
          {!isMobile && <div style={{ color: p1Accent, fontWeight: 'bold', fontSize: 12 }}>{p1Name}</div>}
          {!isMobile && <div>HP: {dispP1Hp}</div>}
          {!isMobile && <div style={{ color: '#aaa', fontSize: 11 }}>
            AT: {Math.max(state.p1.atDmgBuff, state.p1.baseAtDamage)} | SP: {state.p1.hasMourne && state.p1.overloadActive ? Math.floor(Math.max(state.p1.spDmgBuff, state.p1.baseSpDamage) * 1.75) : Math.max(state.p1.spDmgBuff, state.p1.baseSpDamage)}
          </div>}
          <div className="cycle-row" style={{ display: 'flex', gap: 8, marginTop: 6, width: 280 }}>
            {['AT', 'BL', 'SP'].map(move => (
              <TooltipWrap key={move} tip={cycleTip(move, state.p1)} unlocked={true}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: '100%', aspectRatio: '1', borderRadius: '50%',
                    backgroundColor: state.p1.cycleLit[move] ? (state.p1.hasDodge ? '#e03050' : state.p1.hasMourne ? '#7020c0' : p1Accent) : '#333',
                    border: '2px solid ' + (state.p1.cycleLit[move] ? (state.p1.hasDodge ? '#e03050' : state.p1.hasMourne ? '#b06cff' : p1Accent) : '#555'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                    fontSize: 9, fontWeight: 'bold', color: state.p1.cycleLit[move] ? '#000' : '#666',
                    textAlign: 'center', lineHeight: 1.2, cursor: 'default',
                  }}>
                    {Array.isArray(moveLabel(move, state.p1))
                      ? moveLabel(move, state.p1).map((line, i) => <span key={i}>{line}</span>)
                      : moveLabel(move, state.p1)}
                  </div>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    backgroundColor: state.p1.cycleSet.includes(move) ? '#fff' : 'transparent',
                    border: '1px solid #555',
                  }} />
                </div>
              </TooltipWrap>
            ))}
          </div>
          {state.p1.hasDodge && state.p1.dodgeStreak > 0 && (
            <div style={{ fontSize: 10, color: '#7df', marginTop: 4 }}>
              DODGE ×{state.p1.dodgeStreak}
            </div>
          )}
          {/* Evade chance bar — Cairan P1 */}
          {state.p1.hasDodge && !isMobile && (
            <div style={{ marginTop: 5, width: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 9, color: state.p1.nimbleUnlocked ? '#e03050' : '#444', fontWeight: 'bold', letterSpacing: 1, whiteSpace: 'nowrap' }}>EVADE</div>
                <div style={{ flex: 1, height: 8, background: '#222', border: '1px solid #444', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${((state.p1.nimbleChance ?? 0) / 0.30) * 100}%`,
                    background: (state.p1.nimbleChance ?? 0) >= 0.30 ? '#fff' : '#e03050',
                    transition: 'width 0.2s ease',
                    boxShadow: (state.p1.nimbleChance ?? 0) > 0 ? '0 0 6px #e03050' : 'none',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: state.p1.nimbleUnlocked ? '#e03050' : '#444', fontWeight: 'bold', minWidth: 36, textAlign: 'right' }}>
                  {Math.round((state.p1.nimbleChance ?? 0) * 100)}%
                </div>
              </div>
            </div>
          )}
          {/* Force Field accumulator */}
          {state.p1.hasMourne && !isMobile && (
            <div style={{ marginTop: 5, width: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 9, color: '#b06cff', fontWeight: 'bold', letterSpacing: 1, whiteSpace: 'nowrap' }}>FORCE FIELD</div>
                <div style={{ flex: 1, height: 8, background: '#222', border: '1px solid #444', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min((state.p1.forceFieldAccumulated ?? 0) / 10 * 100, 100)}%`,
                    background: (state.p1.forceFieldAccumulated ?? 0) >= 10 ? '#fff' : '#b06cff',
                    transition: 'width 0.2s ease',
                    boxShadow: (state.p1.forceFieldAccumulated ?? 0) > 0 ? '0 0 6px #b06cff' : 'none',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: (state.p1.forceFieldAccumulated ?? 0) > 0 ? '#b06cff' : '#444', fontWeight: 'bold', minWidth: 28, textAlign: 'right' }}>
                  {state.p1.forceFieldAccumulated ?? 0}/10
                </div>
              </div>
            </div>
          )}
          {/* Ability progress wheels — Cairan */}
          {state.p1.hasDodge && !isMobile && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, width: 280 }}>
              <AbilityWheel count={state.p1.damageDealtCount}     unlocked={state.p1.keenEyeUnlocked}     label="Keen Eye"    tip={{ ...TIPS.keenEye, stat: `Current crit chance: ${Math.round((state.p1.keenEyeChance ?? 0.10) * 100)}%` }} />
              <AbilityWheel count={state.p1.successfulDodgeCount} unlocked={state.p1.nimbleUnlocked}      label="Nimble"      maxCount={2} tip={TIPS.nimble} />
              <AbilityWheel count={state.p1.critHitsDealt}        unlocked={state.p1.bloodletterUnlocked} label="Bloodletter" maxCount={2} tip={TIPS.bloodletter} />
            </div>
          )}
          {/* Ability progress wheels — Mourne */}
          {state.p1.hasMourne && !isMobile && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, width: 280 }}>
              <MourneAbilityWheel count={state.p1.selfDamageTaken}    unlocked={state.p1.siphonUnlocked}   label="Siphon"   maxCount={5}  tip={TIPS.siphon} />
              <MourneAbilityWheel count={state.p1.selfDamageTotal}    unlocked={state.p1.overloadUnlocked} label="Overload" maxCount={10} tip={TIPS.overload} />
              <MourneAbilityWheel count={state.p1.goodToggledSpReads} unlocked={state.p1.leechUnlocked}    label="Leech"    maxCount={3}  tip={TIPS.leech} />
            </div>
          )}
          {/* Stat-up flashes */}
          <div style={{ minHeight: 14, marginTop: 2 }}>
            {statUpFlashes.p1ke && <div key={`p1ke-${statUpFlashes.key}`} className="stat-up">CRIT CHANCE UP!</div>}
            {statUpFlashes.p1nb && <div key={`p1nb-${statUpFlashes.key}`} className="stat-up">EVASION CHANCE UP!</div>}
          </div>
        </div>

        {/* ── P2 ── */}
        <div className="panel panel-p2" style={{ textAlign: 'right' }}>
          {isMobile && (
            <div className="panel-stats-mobile" style={{ textAlign: 'right' }}>
              <span style={{ color: p2Accent, fontWeight: 'bold', marginRight: 4 }}>{p2Name}</span>
              <span style={{ color: '#aaa' }}>HP:{dispP2Hp} AT:{Math.max(state.p2.atDmgBuff, state.p2.baseAtDamage)} SP:{state.p2.hasMourne && state.p2.overloadActive ? Math.floor(Math.max(state.p2.spDmgBuff, state.p2.baseSpDamage) * 1.75) : Math.max(state.p2.spDmgBuff, state.p2.baseSpDamage)}</span>
            </div>
          )}
          {!isMobile && state.p2.flowState && (
            <div style={{ fontSize: 9, color: '#f80', fontWeight: 'bold', letterSpacing: 2, marginBottom: 2, textAlign: 'right' }}>FLOW</div>
          )}
          {!isMobile && state.p2.overloadActive && (
            <div style={{ fontSize: 9, color: '#b06cff', fontWeight: 'bold', letterSpacing: 2, marginBottom: 2, textAlign: 'right' }}>OVERLOAD</div>
          )}
          <div className={['portrait-wrap', collapseAnimating ? 'collapse-hit' : ultAnimating ? 'ult-hit' : animating ? 'p2-fight' : undefined].filter(Boolean).join(' ')}
               style={{ position: 'relative', width: 280, height: 280, marginBottom: 4, marginLeft: 'auto', display: 'block' }}>
            <img
              src={state.p2Character?.portrait ?? '/src/img/stotch.png'}
              alt="P2"
              className={['portrait-img', state.p2.flowState ? 'flow-portrait' : undefined].filter(Boolean).join(' ')}
              style={{ width: 280, height: 280, objectFit: 'cover', border: '2px solid #555', display: 'block', transition: 'transform 0.9s ease, filter 0.9s ease', transform: deathEffectsReady && loser === 'p2' ? 'scaleX(-1) rotate(180deg)' : 'scaleX(-1)', filter: deathEffectsReady && loser === 'p2' ? 'grayscale(1)' : undefined }}
            />
            {animating && lastMoves.p2 && (
              <span className="move-emoji">
                {MOVE_EMOJI[lastMoves.p2]}
                {lastReads.p2 !== 'none' && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 4, marginTop: 6,
                    color: lastReads.p2 === 'good' ? '#4f4' : '#f44',
                    textShadow: lastReads.p2 === 'good' ? '0 0 8px #0f0' : '0 0 8px #f00',
                    fontWeight: 'bold', fontSize: 18, letterSpacing: 2, whiteSpace: 'nowrap',
                  }}>
                    READ {lastReads.p2 === 'good' ? '✓' : '✗'}
                  </span>
                )}
              </span>
            )}
            {critDisplay.p1 && (
              <div className="crit-overlay">
                <div style={{ fontSize: 90, color: '#f00', fontWeight: 'bold', lineHeight: 1, textShadow: '0 0 20px #f00, 0 0 40px #f008' }}>!</div>
                <div style={{ fontSize: 13, color: '#f00', fontWeight: 'bold', letterSpacing: 3, whiteSpace: 'nowrap', textShadow: '0 0 8px #f00' }}>CRITICAL HIT!</div>
              </div>
            )}
          </div>
          <HpBar hp={dispP2Hp} maxHp={state.p2.maxHp} alignRight />
          {!isMobile && <div style={{ color: p2Accent, fontWeight: 'bold', fontSize: 12 }}>{p2Name}</div>}
          {!isMobile && <div>HP: {dispP2Hp}</div>}
          {!isMobile && <div style={{ color: '#aaa', fontSize: 11 }}>
            AT: {Math.max(state.p2.atDmgBuff, state.p2.baseAtDamage)} | SP: {state.p2.hasMourne && state.p2.overloadActive ? Math.floor(Math.max(state.p2.spDmgBuff, state.p2.baseSpDamage) * 1.75) : Math.max(state.p2.spDmgBuff, state.p2.baseSpDamage)}
          </div>}
          <div className="cycle-row" style={{ display: 'flex', gap: 8, marginTop: 6, width: 280, marginLeft: 'auto' }}>
            {['AT', 'BL', 'SP'].map(move => (
              <TooltipWrap key={move} tip={cycleTip(move, state.p2)} unlocked={true}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: '100%', aspectRatio: '1', borderRadius: '50%',
                    backgroundColor: state.p2.cycleLit[move] ? (state.p2.hasDodge ? '#e03050' : state.p2.hasMourne ? '#7020c0' : p2Accent) : '#333',
                    border: '2px solid ' + (state.p2.cycleLit[move] ? (state.p2.hasDodge ? '#e03050' : state.p2.hasMourne ? '#b06cff' : p2Accent) : '#555'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                    fontSize: 9, fontWeight: 'bold', color: state.p2.cycleLit[move] ? '#000' : '#666',
                    textAlign: 'center', lineHeight: 1.2, cursor: 'default',
                  }}>
                    {Array.isArray(moveLabel(move, state.p2))
                      ? moveLabel(move, state.p2).map((line, i) => <span key={i}>{line}</span>)
                      : moveLabel(move, state.p2)}
                  </div>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    backgroundColor: state.p2.cycleSet.includes(move) ? '#fff' : 'transparent',
                    border: '1px solid #555',
                  }} />
                </div>
              </TooltipWrap>
            ))}
          </div>
          {state.p2.hasDodge && state.p2.dodgeStreak > 0 && (
            <div style={{ fontSize: 10, color: '#7df', marginTop: 4, textAlign: 'right' }}>
              DODGE ×{state.p2.dodgeStreak}
            </div>
          )}
          {/* Evade chance bar — Cairan P2 */}
          {state.p2.hasDodge && !isMobile && (
            <div style={{ marginTop: 5, width: 280, marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, color: state.p2.nimbleUnlocked ? '#e03050' : '#444', fontWeight: 'bold', minWidth: 36 }}>
                  {Math.round((state.p2.nimbleChance ?? 0) * 100)}%
                </div>
                <div style={{ flex: 1, height: 8, background: '#222', border: '1px solid #444', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${((state.p2.nimbleChance ?? 0) / 0.30) * 100}%`,
                    background: (state.p2.nimbleChance ?? 0) >= 0.30 ? '#fff' : '#e03050',
                    transition: 'width 0.2s ease',
                    boxShadow: (state.p2.nimbleChance ?? 0) > 0 ? '0 0 6px #e03050' : 'none',
                  }} />
                </div>
                <div style={{ fontSize: 9, color: state.p2.nimbleUnlocked ? '#e03050' : '#444', fontWeight: 'bold', letterSpacing: 1, whiteSpace: 'nowrap' }}>EVADE</div>
              </div>
            </div>
          )}
          {/* Force Field accumulator — P2 */}
          {state.p2.hasMourne && !isMobile && (
            <div style={{ marginTop: 5, width: 280, marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, color: (state.p2.forceFieldAccumulated ?? 0) > 0 ? '#b06cff' : '#444', fontWeight: 'bold', minWidth: 28 }}>
                  {state.p2.forceFieldAccumulated ?? 0}/10
                </div>
                <div style={{ flex: 1, height: 8, background: '#222', border: '1px solid #444', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min((state.p2.forceFieldAccumulated ?? 0) / 10 * 100, 100)}%`,
                    background: (state.p2.forceFieldAccumulated ?? 0) >= 10 ? '#fff' : '#b06cff',
                    transition: 'width 0.2s ease',
                    boxShadow: (state.p2.forceFieldAccumulated ?? 0) > 0 ? '0 0 6px #b06cff' : 'none',
                    marginLeft: 'auto',
                  }} />
                </div>
                <div style={{ fontSize: 9, color: '#b06cff', fontWeight: 'bold', letterSpacing: 1, whiteSpace: 'nowrap' }}>FORCE FIELD</div>
              </div>
            </div>
          )}
          {/* Ability progress wheels — Cairan P2 */}
          {state.p2.hasDodge && !isMobile && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, width: 280, marginLeft: 'auto' }}>
              <AbilityWheel count={state.p2.damageDealtCount}     unlocked={state.p2.keenEyeUnlocked}     label="Keen Eye"    tip={{ ...TIPS.keenEye, stat: `Current crit chance: ${Math.round((state.p2.keenEyeChance ?? 0.10) * 100)}%` }} />
              <AbilityWheel count={state.p2.successfulDodgeCount} unlocked={state.p2.nimbleUnlocked}      label="Nimble"      maxCount={2} tip={TIPS.nimble} />
              <AbilityWheel count={state.p2.critHitsDealt}        unlocked={state.p2.bloodletterUnlocked} label="Bloodletter" maxCount={2} tip={TIPS.bloodletter} />
            </div>
          )}
          {/* Ability progress wheels — Mourne P2 */}
          {state.p2.hasMourne && !isMobile && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, width: 280, marginLeft: 'auto' }}>
              <MourneAbilityWheel count={state.p2.selfDamageTaken}    unlocked={state.p2.siphonUnlocked}   label="Siphon"   maxCount={5}  tip={TIPS.siphon} />
              <MourneAbilityWheel count={state.p2.selfDamageTotal}    unlocked={state.p2.overloadUnlocked} label="Overload" maxCount={10} tip={TIPS.overload} />
              <MourneAbilityWheel count={state.p2.goodToggledSpReads} unlocked={state.p2.leechUnlocked}    label="Leech"    maxCount={3}  tip={TIPS.leech} />
            </div>
          )}
          {/* Stat-up flashes */}
          <div style={{ minHeight: 14, marginTop: 2, textAlign: 'right' }}>
            {statUpFlashes.p2ke && <div key={`p2ke-${statUpFlashes.key}`} className="stat-up">CRIT CHANCE UP!</div>}
            {statUpFlashes.p2nb && <div key={`p2nb-${statUpFlashes.key}`} className="stat-up">EVASION CHANCE UP!</div>}
          </div>
        </div>
      </div>

      {/* Between-turns effect strip */}
      <div style={{ minHeight: 52, marginBottom: 8, display: 'flex', alignItems: 'center' }}>
        {activeEffect && activeEffect.type !== 'announce' && renderEffectBanner(activeEffect)}
      </div>

      <div className="move-btn-row" style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {MOVES.map(move => (
          <button
            key={move}
            onClick={() => isOnline ? handleOnlineMove(move) : handleMove(move)}
            disabled={gameOver || animating || ultAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove)}
            className={litClass(myPlayer, move)}
          >
            {move === 'BL' ? (Array.isArray(blLabel(myPlayer)) ? blLabel(myPlayer).join(' ') : blLabel(myPlayer)) : move}
          </button>
        ))}
        {myPlayer.ultimateReady && !gameOver && (
          <button
            onClick={isOnline ? handleOnlineUlt : handleUlt}
            disabled={animating || ultAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove)}
            style={{ background: myPlayer.hasMourne ? '#7020c0' : '#1a0008', color: myPlayer.hasMourne ? '#e0b0ff' : '#cc2244', fontWeight: 'bold', border: `1px solid ${myPlayer.hasMourne ? 'transparent' : '#cc2244'}`, padding: '2px 10px', cursor: 'pointer', letterSpacing: 1 }}
          >
            {myPlayer.hasMourne ? 'COLLAPSE' : 'ASSASSINATE'}
          </button>
        )}
        {/* Bloodletter — Cairan only */}
        {myPlayer.bloodletterUnlocked && !gameOver && (
          <TooltipWrap tip={TIPS.bloodletter} unlocked={true}>
            <button
              onClick={isOnline ? handleOnlineBloodletter : handleBloodletter}
              disabled={animating || ultAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove)}
              style={{
                background: 'transparent',
                color: '#c44',
                border: '1px solid #c44',
                fontWeight: 'bold', fontSize: 10, cursor: 'pointer',
                padding: '2px 8px',
              }}
            >
              BLOODLETTER
            </button>
          </TooltipWrap>
        )}
        {isOnline ? (
          <>
            <button onClick={handleOnlineRematch} disabled={!gameOver || animating || ultAnimating || collapseAnimating || betweenTurns} style={{ marginLeft: 'auto' }}>Rematch</button>
            <button onClick={handleOnlineLeave} style={{ fontSize: 10, color: '#aaa' }}>Leave</button>
          </>
        ) : (
          <>
            <button onClick={handleReset} disabled={animating || ultAnimating || collapseAnimating || betweenTurns} style={{ marginLeft: 'auto' }}>Reset</button>
            <button onClick={handleChangeChars} style={{ fontSize: 10, color: '#aaa' }}>Change</button>
            {/* DEBUG — offline only */}
            <button
              onClick={() => setState(s => ({ ...s, p1: { ...s.p1, bleeds: [...s.p1.bleeds, { currentDamage: 1 }] } }))}
              style={{ marginLeft: 12, fontSize: 9, color: '#f80', border: '1px dashed #f80', background: 'transparent', cursor: 'pointer', padding: '1px 6px' }}
            >⚠ Bleed P1</button>
            <button
              onClick={() => { forceCritRef.current = true }}
              style={{ fontSize: 9, color: '#f80', border: '1px dashed #f80', background: 'transparent', cursor: 'pointer', padding: '1px 6px' }}
            >⚠ Force Crit</button>
          </>
        )}
      </div>

      {isOnline && !gameOver && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 6, marginBottom: 2, fontFamily: 'monospace' }}>
          {online.pendingMove
            ? (online.opponentReady ? 'Processing...' : 'Waiting for opponent...')
            : `You are P${(online.myIndex ?? 0) + 1} — pick a move`}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => setP1ReadActive(r => !r)}
          disabled={gameOver || animating || betweenTurns || (isOnline && online.pendingMove)}
          style={{ outline: p1ReadActive ? '2px solid orange' : 'none' }}
        >
          Read{p1ReadActive ? ' (ON)' : ''}
        </button>
      </div>

      {gameOver && (
        <div style={{ marginBottom: 16, fontWeight: 'bold' }}>
          {state.p1.hp === 0 && state.p2.hp === 0 ? 'Draw!' : state.p1.hp === 0 ? `${p2Name} wins!` : `${p1Name} wins!`}
        </div>
      )}

      {state.log.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto', fontSize: 12 }}>
          {[...state.log].reverse().map(entry => (
            <LogRow key={entry.turn} entry={entry} />
          ))}
        </div>
      )}
    </div>
    </>
  )
}
