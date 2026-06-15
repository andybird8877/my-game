import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { createInitialState, processTurn, processUlt, resolveBeforeTurn, calcUltDamage, AT_DAMAGE, SP_DAMAGE } from '../../shared/combat'
import { getAiMove } from '../logic/ai'
import { CHARACTERS } from '../../shared/characters'
import { generateNarrativeEntry } from '../logic/battleLog'

const MOVES = ['AT', 'BL', 'SP']

// ─── Tooltip descriptions ─────────────────────────────────────────────────────

const TIPS = {
  keenEye:     { name: 'Keen Eye',     description: 'Grants crit chance on clean hits. Crits deal double damage. Crit chance increases with every RPS win.',               unlock: 'Deal damage 3 times.' },
  nimble:      { name: 'Nimble',       description: 'Chance to evade all incoming damage. Cannot evade ultimates. Evasion chance +2% per RPS win, caps at 30%.',          unlock: 'Successfully dodge AT 2 times.' },
  bloodletter: { name: 'Bloodletter',  description: 'Unleash a guaranteed attack that applies Bleed regardless of opponent\'s move. Must be re-unlocked after each use.',  unlock: 'Land 2 critical hits.' },
  siphon:      { name: 'Siphon',       description: 'Restores 25% of SP damage dealt as HP each between-turns phase.',                                                     unlock: 'Take self-damage 5 times.' },
  overload:    { name: 'Overload',     description: 'When HP drops below 30%, SP damage is permanently multiplied by 1.75.',                                               unlock: 'Accumulate 10 total self-damage.' },
  leech:       { name: 'Leech',        description: 'Good Reads restore HP equal to 100% of damage dealt. Suppresses self-damage that turn.',                         unlock: 'Land 3 Good Reads (any move).' },
  moveAt:      { name: 'Attack',       description: 'A direct strike. Beats Special but loses to Block. Chaining Attack three times in a row builds bonus damage.' },
  moveSp:      { name: 'Special',      description: 'A powerful channeled move. Beats Block but loses to Attack. Chaining Special three times in a row builds damage reduction.' },
  moveBl:      { name: 'Block',        description: 'A defensive stance. Deals small chip damage to an attacker. Beats Attack but loses to Special.' },
  moveDodge:   { name: 'Dodge',        description: 'Cairan\'s unique counter. First dodge absorbs all incoming chip damage. Each consecutive dodge launches a counter-attack for double the attacker\'s AT damage.' },
  moveFF:      { name: 'Force Field',  description: 'Mourne\'s defensive barrier. Absorbs chip damage into the Force Field accumulator instead of taking HP loss. When the accumulator reaches 10, the stored energy fires back at the opponent.' },
  vaelJinx:   { name: 'JINX',        description: 'After unlocking, any Good Clash (without Read active) also randomly disables one of the opponent\'s moves for their next turn — same effect as the SP-vs-BL trigger.',              unlock: 'Land SP disable 2 times.' },
  vaelRegen:  { name: 'Regen',       description: 'After each turn resolves, Vael heals a portion of her max HP. Heal amount scales inversely with current HP — strongest when low, minimal when near full.',                               unlock: 'Land 3 Good Clashes (without Read active).' },
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
      style={{ width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
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
      style={{ width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
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

// Vael Solace ability wheel — cyan accent, freezes at full ring on unlock
function VaelAbilityWheel({ count, unlocked, label, maxCount, tip }) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  const r = 34, cx = 40, cy = 40
  const circumference = 2 * Math.PI * r
  // Freeze at full once unlocked — underlying counter keeps changing for ULT, don't reflect that
  const filled  = unlocked ? maxCount : Math.min(count, maxCount)
  const dashLen = filled > 0 ? (circumference / maxCount) * filled : 0
  const accent  = '#00ccff'
  const stroke  = unlocked ? accent : '#007799'
  return (
    <div
      style={{ width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
      onMouseEnter={e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={e  => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => { clearTimeout(timer.current); setShow(false) }}
    >
      <svg viewBox="0 0 80 80" style={{ width: '100%', height: 'auto' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#333" strokeWidth={4} />
        {filled > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke={stroke} strokeWidth={unlocked ? 5 : 4}
            strokeDasharray={`${dashLen} ${circumference}`}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={unlocked ? { filter: `drop-shadow(0 0 5px ${accent})` } : undefined}
          />
        )}
        {unlocked
          ? <text x={cx} y={cy + 6} textAnchor="middle" fontSize={18} fill={accent} fontWeight="bold">✓</text>
          : <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fill="#555">{count}/{maxCount}</text>
        }
      </svg>
      <div style={{ fontSize: 9, color: unlocked ? accent : '#666', letterSpacing: 0.5, textAlign: 'center', marginTop: 3 }}>{label}</div>
      {show && tip && <TooltipBox {...tip} unlocked={unlocked} x={pos.x} y={pos.y} />}
    </div>
  )
}

// ─── Ult Meter ────────────────────────────────────────────────────────────────
// Single progress ring showing combined ULT unlock progress across all 3 conditions

function UltMeter({ accent, ready, ultGoodReads, ultChainAchieved, cycleLit }) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  const r = 30, cx = 40, cy = 40
  const circumference = 2 * Math.PI * r

  const goodReadsCount = Math.min(2, ultGoodReads ?? 0)
  const chainCount     = ultChainAchieved ? 1 : 0
  const litCount       = ['AT', 'BL', 'SP'].filter(m => cycleLit?.[m]).length
  const segmentsMet    = goodReadsCount + chainCount + litCount  // 0–6

  const fillLen     = ready ? circumference : (circumference * segmentsMet / 6)
  const strokeColor = ready ? accent : (segmentsMet > 0 ? accent + 'aa' : '#444')

  const conditions = [
    {
      label:  `Good Reads ${goodReadsCount}/2`,
      done:   goodReadsCount >= 2,
      detail: 'Toggle Read on and win the clash twice. Does not need to be consecutive.',
    },
    {
      label:  'Power Chain',
      done:   !!ultChainAchieved,
      detail: 'Play AT or SP three times in a row with Read off.',
    },
    {
      label:  `Cycle Lit ${litCount}/3`,
      done:   litCount >= 3,
      detail: 'Play each of AT, BL, and SP with Read off to light them. You do not need to win the clash.',
    },
  ]

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
      onMouseEnter={e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={e  => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => { clearTimeout(timer.current); setShow(false) }}
    >
      <svg viewBox="0 0 80 80" style={{ width: 64, height: 64 }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={4} />
        {/* Fill arc */}
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={strokeColor}
          strokeWidth={4}
          strokeDasharray={`${fillLen} ${circumference}`}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            filter: ready ? `drop-shadow(0 0 6px ${accent})` : segmentsMet > 0 ? `drop-shadow(0 0 3px ${accent}88)` : 'none',
            animation: ready ? 'ultPulse 1.1s ease-in-out infinite' : undefined,
          }}
        />
        {/* Centre */}
        {ready
          ? <text x={cx} y={cy + 6} textAnchor="middle" fontSize={18} fill={accent} fontWeight="bold"
              style={{ animation: 'ultPulse 1.1s ease-in-out infinite' }}>✓</text>
          : <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fill={segmentsMet > 0 ? '#aaa' : '#444'}>{segmentsMet}/6</text>
        }
      </svg>
      <div style={{
        fontSize: 8, letterSpacing: 1, textAlign: 'center', marginTop: 2,
        color: ready ? accent : '#444', fontWeight: ready ? 'bold' : 'normal',
        userSelect: 'none',
      }}>ULT</div>
      {show && (
        <div style={{
          position: 'fixed',
          left: Math.min(pos.x + 14, window.innerWidth - 290),
          top: pos.y - 8,
          width: 268, zIndex: 9999, pointerEvents: 'none',
          background: '#111', border: '1px solid #444', borderRadius: 4,
          padding: '8px 10px', fontFamily: 'monospace', fontSize: 11,
          color: '#fff', lineHeight: 1.5,
          boxShadow: '0 4px 14px rgba(0,0,0,0.85)',
        }}>
          <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 6, color: '#ff0', letterSpacing: 0.5 }}>ULT CONDITIONS</div>
          {conditions.map(({ label, done, detail }) => (
            <div key={label} style={{ marginBottom: 5 }}>
              <span style={{ color: done ? '#4f4' : '#666' }}>{done ? '✓' : '○'} </span>
              <span style={{ color: done ? '#ccc' : '#777', fontWeight: done ? 'bold' : 'normal' }}>{label}</span>
              <div style={{ color: '#555', fontSize: 10, marginLeft: 14, marginTop: 1 }}>{detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Log ──────────────────────────────────────────────────────────────────────

// Colour by event key family — makes the log scannable at a glance
function narrativeColor(key) {
  if (!key) return '#bbb'
  if (key.startsWith('AT_WINS'))          return '#7df'   // blue — attack wins
  if (key.startsWith('SP_WINS'))          return '#c8f'   // violet — special wins
  if (key.startsWith('BL_CHIP_GOOD_READ') || key.startsWith('BL_CHIP_BAD_READ'))
                                          return '#f90'   // amber — read punish
  if (key.startsWith('BL_CHIP'))          return '#aaa'   // grey — normal chip
  if (key.startsWith('BL_TIE'))           return '#f90'   // amber — guard clash
  if (key.startsWith('TIE'))              return '#aaa'   // grey — mutual
  if (key.startsWith('ULT'))              return '#f90'   // gold — ultimate
  if (key.startsWith('NIMBLE'))           return '#4f4'   // green — evasion
  if (key.startsWith('CAIRAN'))           return '#4df'   // teal — Cairan dodge
  return '#bbb'
}

function LogRow({ entry, p1Name, p2Name, p1Char, p2Char }) {
  const narrative = generateNarrativeEntry(entry, p1Name ?? 'P1', p2Name ?? 'P2', p1Char, p2Char)
  const color = narrativeColor(narrative.key)

  // Supplementary badges shown below the main sentence
  const badges = []

  if (entry.p1CritHit) badges.push(<span key="p1crit" style={{ color: '#f44', fontWeight: 'bold' }}>💥 {p1Name} CRIT</span>)
  if (entry.p2CritHit) badges.push(<span key="p2crit" style={{ color: '#f44', fontWeight: 'bold' }}>💥 {p2Name} CRIT</span>)

  if (entry.p1FlowActivated) badges.push(<span key="p1flow" style={{ color: '#f80', fontWeight: 'bold' }}>⚡ {p1Name} FLOW STATE</span>)
  if (entry.p2FlowActivated) badges.push(<span key="p2flow" style={{ color: '#f80', fontWeight: 'bold' }}>⚡ {p2Name} FLOW STATE</span>)
  if (entry.p1FlowBroken)    badges.push(<span key="p1flowb" style={{ color: '#666' }}>{p1Name} flow broken</span>)
  if (entry.p2FlowBroken)    badges.push(<span key="p2flowb" style={{ color: '#666' }}>{p2Name} flow broken</span>)

  // AT chain buff building
  const p1PlainAT = entry.p1Move === 'AT' && entry.p1Read === 'none'
  const p2PlainAT = entry.p2Move === 'AT' && entry.p2Read === 'none'
  const p1PlainSP = entry.p1Move === 'SP' && entry.p1Read === 'none'
  const p2PlainSP = entry.p2Move === 'SP' && entry.p2Read === 'none'
  if (p1PlainAT && entry.p1AtChain > 2)
    badges.push(<span key="p1at" style={{ color: '#ff0' }}>🔥 {p1Name} AT×{entry.p1AtChain} → {entry.p1AtDmgBuff} dmg</span>)
  if (p2PlainAT && entry.p2AtChain > 2)
    badges.push(<span key="p2at" style={{ color: '#ff0' }}>🔥 {p2Name} AT×{entry.p2AtChain} → {entry.p2AtDmgBuff} dmg</span>)
  if (p1PlainSP && entry.p1SpChain >= 2 && entry.p1SpDmgBuff > 0)
    badges.push(<span key="p1sp" style={{ color: '#ff0' }}>⚡ {p1Name} SP×{entry.p1SpChain} → {entry.p1SpDmgBuff} dmg</span>)
  if (p2PlainSP && entry.p2SpChain >= 2 && entry.p2SpDmgBuff > 0)
    badges.push(<span key="p2sp" style={{ color: '#ff0' }}>⚡ {p2Name} SP×{entry.p2SpChain} → {entry.p2SpDmgBuff} dmg</span>)

  return (
    <div style={{ marginBottom: 10, lineHeight: 1.6, borderLeft: `2px solid ${color}22`, paddingLeft: 8 }}>
      {/* Turn counter */}
      <div style={{ color: '#555', fontSize: 10, letterSpacing: 1, marginBottom: 1 }}>
        T{entry.turn}
        {entry.p1Read !== 'none' && (
          <span style={{ color: entry.p1Read === 'good' ? '#4f4' : '#f55', marginLeft: 6 }}>
            {p1Name} {entry.p1Read === 'good' ? 'Good Read' : 'Bad Read'}
          </span>
        )}
        {entry.p2Read !== 'none' && (
          <span style={{ color: entry.p2Read === 'good' ? '#4f4' : '#f55', marginLeft: 6 }}>
            {p2Name} {entry.p2Read === 'good' ? 'Good Read' : 'Bad Read'}
          </span>
        )}
      </div>

      {/* Main narrative sentence */}
      <div style={{ color, fontSize: 12 }}>
        {narrative.explanation}
      </div>

      {/* Supplementary badges */}
      {badges.length > 0 && (
        <div style={{ paddingLeft: 4, fontSize: 11, marginTop: 2 }}>
          {badges.map((badge, i) => (
            <span key={i}>
              {i > 0 && <span style={{ color: '#444', marginRight: 4 }}>·</span>}
              {badge}
            </span>
          ))}
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
  const [p2UltAnimating, setP2UltAnimating]           = useState(false)
  const [collapseAnimating, setCollapseAnimating]     = useState(false)
  const [collapseUser, setCollapseUser]               = useState('p1')  // 'p1' | 'p2'
  const [collapseData, setCollapseData]               = useState(null)
  const [critDisplay, setCritDisplay]                 = useState({ p1: false, p2: false })
  const [betweenTurns, setBetweenTurns]               = useState(false)
  const [activeEffect, setActiveEffect]               = useState(null)
  const [statUpFlashes, setStatUpFlashes]             = useState({ p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 })
  const [evadeFlashes, setEvadeFlashes]               = useState({ p1: false, p2: false, key: 0 })
  const [disableFlashes, setDisableFlashes]           = useState({ p1: null, p2: null, key: 0 })
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
            const ltP1Evaded = !!(lt?.p1NimbleTriggered || lt?.p1VaelEvaded)
            const ltP2Evaded = !!(lt?.p2NimbleTriggered || lt?.p2VaelEvaded)
            if (ltP1Evaded || ltP2Evaded) {
              const ek = Date.now()
              setTimeout(() => setEvadeFlashes({ p1: ltP1Evaded, p2: ltP2Evaded, key: ek }), 2000)
              setTimeout(() => setEvadeFlashes(s => s.key === ek ? { p1: false, p2: false, key: 0 } : s), 4000)
            }
            const ltP1Dis = lt?.p2VaelDisabledMove ?? null  // P2's Vael → P1 afflicted
            const ltP2Dis = lt?.p1VaelDisabledMove ?? null  // P1's Vael → P2 afflicted
            if (ltP1Dis || ltP2Dis) {
              const dk = Date.now() + 1
              setTimeout(() => setDisableFlashes({ p1: ltP1Dis, p2: ltP2Dis, key: dk }), 2000)
              setTimeout(() => setDisableFlashes(s => s.key === dk ? { p1: null, p2: null, key: 0 } : s), 4000)
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
          <img src="/countercycle-logo.png" alt="Countercycle" style={{ maxWidth: 320, width: '100%', marginBottom: 60, display: 'block', margin: '0 auto 60px' }} />
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
    // AI fires ULT instead of a normal turn when ready
    if (state.p2.ultimateReady) { handleAiUlt(); return }
    const { move: p2Move, useRead: p2ReadActive } = getAiMove(state)
    const p2UseBloodletter = !!(state.p2.bloodletterUnlocked && state.p2.hasDodge)
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
    // Cairan stat-up flashes
    const p1ke = state.p1.hasDodge && newState.p1.keenEyeUnlocked  && newState.p1.keenEyeChance > state.p1.keenEyeChance
    const p1nb = state.p1.hasDodge && newState.p1.nimbleUnlocked    && newState.p1.nimbleChance  > state.p1.nimbleChance
    const p2ke = state.p2.hasDodge && newState.p2.keenEyeUnlocked  && newState.p2.keenEyeChance > state.p2.keenEyeChance
    const p2nb = state.p2.hasDodge && newState.p2.nimbleUnlocked    && newState.p2.nimbleChance  > state.p2.nimbleChance
    if (p1ke || p1nb || p2ke || p2nb) {
      const flashKey = Date.now()
      setTimeout(() => setStatUpFlashes({ p1ke, p1nb, p2ke, p2nb, key: flashKey }), 2300)
      setTimeout(() => setStatUpFlashes(s => s.key === flashKey ? { p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 } : s), 3500)
    }
    // Evade + disable portrait flashes
    const lt = newState.lastTurn
    const p1Evaded = !!(lt.p1NimbleTriggered || lt.p1VaelEvaded)
    const p2Evaded = !!(lt.p2NimbleTriggered || lt.p2VaelEvaded)
    if (p1Evaded || p2Evaded) {
      const evadeKey = Date.now()
      setTimeout(() => setEvadeFlashes({ p1: p1Evaded, p2: p2Evaded, key: evadeKey }), 2000)
      setTimeout(() => setEvadeFlashes(s => s.key === evadeKey ? { p1: false, p2: false, key: 0 } : s), 4000)
    }
    // p1VaelDisabledMove = P1's Vael disabled P2 (P2 is afflicted → flash on P2's portrait)
    // p2VaelDisabledMove = P2's Vael disabled P1 (P1 is afflicted → flash on P1's portrait)
    const p1Disabled = lt.p2VaelDisabledMove ?? null
    const p2Disabled = lt.p1VaelDisabledMove ?? null
    if (p1Disabled || p2Disabled) {
      const disableKey = Date.now() + 1
      setTimeout(() => setDisableFlashes({ p1: p1Disabled, p2: p2Disabled, key: disableKey }), 2000)
      setTimeout(() => setDisableFlashes(s => s.key === disableKey ? { p1: null, p2: null, key: 0 } : s), 4000)
    }
    // Between-turns: bleeds + Mourne effects, then unlock announcements
    const effectSteps = resolveBeforeTurn(newState)
    const unlockSteps = buildUnlockSteps(newState)
    scheduleEffects([...effectSteps, ...unlockSteps], 2650)
  }

  function handleBloodletter() {
    handleMove('AT', { useBloodletter: true })
  }

  function handleAiUlt() {
    if (animating || p2UltAnimating || collapseAnimating) return
    const ultState = processUlt(state, 'p2')

    if (state.p2.hasMourne) {
      const lt = ultState.lastTurn
      setCollapseData({
        ffAbsorbed:      lt.ffAbsorbed,
        selfDmg:         lt.selfDmg,
        rawDamage:       lt.rawDamage,
        actualDamage:    lt.actualDamage,
        healAmount:      lt.healAmount,
        overloadBoosted: lt.overloadBoosted,
      })
      setCollapseUser('p2')
      setDisplayedState(state)
      setCollapseAnimating(true)
      setTimeout(() => { setState(ultState); setDisplayedState(null) }, 2100)
      setTimeout(() => { setCollapseAnimating(false); setCollapseData(null); setCollapseUser('p1') }, 3500)
      scheduleEffects(resolveBeforeTurn(ultState), 3900)
      return
    }

    setDisplayedState(state)
    setP2UltAnimating(true)
    setTimeout(() => { setState(ultState); setDisplayedState(null) }, 1050)
    setTimeout(() => setP2UltAnimating(false), 2000)
    scheduleEffects(resolveBeforeTurn(ultState), 2400)
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
    setP2UltAnimating(false)
    setCollapseAnimating(false)
    setCollapseUser('p1')
    setCollapseData(null)
    setBetweenTurns(false)
    setActiveEffect(null)
    setStatUpFlashes({ p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 })
    setEvadeFlashes({ p1: false, p2: false, key: 0 })
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
    setP2UltAnimating(false)
    setCollapseAnimating(false)
    setCollapseUser('p1')
    setBetweenTurns(false)
    setActiveEffect(null)
    setStatUpFlashes({ p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 })
    setEvadeFlashes({ p1: false, p2: false, key: 0 })
  }

  const p1Name   = state.p1Character?.name ?? 'P1'
  const p2Name   = state.p2Character?.name ?? 'P2'
  const p1Accent = AFFINITY_COLOR[state.p1Character?.affinity] ?? '#e03050'
  const p2Accent = AFFINITY_COLOR[state.p2Character?.affinity] ?? '#e03050'
  const myAccent = (isOnline && online.myIndex === 1) ? p2Accent : p1Accent

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
    } else if (type === 'vael_regen') {
      color = '#c8e040'
      text  = `${playerName} regenerated +${heal} HP`
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

  function ultTip(player) {
    const { raw, actual } = calcUltDamage(player)
    if (player.hasMourne) {
      const ff      = player.ffTotalAbsorbed ?? 0
      const self    = player.selfDamageTotal ?? 0
      const heal    = Math.min(Math.max(0, player.maxHp - player.hp), actual)
      const overStr = player.overloadActive ? ` × 1.75 (OVERLOAD) = ${actual}` : ''
      return {
        name: 'COLLAPSE',
        description: 'Mourne detonates everything she has absorbed — force field damage and all self-inflicted pain converge into a single crushing strike. She heals for the full damage dealt.',
        stat: `FF ${ff} + Self-dmg ${self} = ${raw}${overStr} → deals ${actual}, heals ${heal} HP`,
      }
    }
    if (player.hasVael) {
      const disables = player.vaelDisablesLanded  ?? 0
      const clashes  = player.vaelNormalGoodReads ?? 0
      return {
        name: 'MIND BLAST',
        description: 'Vael channels every disable she has inflicted into a psychic detonation — each disable amplified by every Good Clash she has won. Resets her disable count afterward.',
        stat: `${disables} disables × ${clashes} Good Clashes = ${actual} dmg`,
      }
    }
    // Default: Cairan / ASSASSINATE
    const baseAt = player.baseAtDamage ?? AT_DAMAGE
    const baseSp = player.baseSpDamage ?? SP_DAMAGE
    const atDmg  = Math.max(player.atDmgBuff ?? 0, baseAt)
    const spDmg  = Math.max(player.spDmgBuff ?? 0, baseSp)
    const heal   = Math.floor(actual * 0.5)
    return {
      name: 'ASSASSINATE',
      description: 'Cairan detonates the full combat cycle in one savage combination — two Attacks and two Specials firing simultaneously. Heals for half the damage dealt.',
      stat: `2×AT (${Math.round(atDmg)}) + 2×SP (${Math.round(spDmg)}) = ${actual} dmg → heals ${heal} HP`,
    }
  }

  return (
    <>
    {ultAnimating && <div className="ult-screen-overlay" />}
    {ultAnimating && <div className="ult-text">{myPlayer.hasVael ? 'MIND BLAST' : 'ASSASSINATE'}</div>}
    {p2UltAnimating && <div className="ult-screen-overlay" />}
    {p2UltAnimating && <div className="ult-text" style={{ color: '#f55', textShadow: '0 0 16px #f00, 0 0 40px #f00, 0 0 80px #a00' }}>{state.p2.hasVael ? 'MIND BLAST' : 'ASSASSINATE'}</div>}
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
          <div className={['portrait-wrap', collapseAnimating ? (collapseUser === 'p1' ? 'collapse-charge' : 'collapse-hit') : ultAnimating ? 'ult-charge' : p2UltAnimating ? 'ult-hit' : animating ? 'p1-fight' : undefined].filter(Boolean).join(' ')}
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
            {evadeFlashes.p1 && (
              <div key={`p1evade-${evadeFlashes.key}`} className="crit-overlay">
                <div style={{ fontSize: 52, color: '#4ff', fontWeight: 'bold', lineHeight: 1, textShadow: '0 0 20px #0ff, 0 0 40px #0cc8' }}>◌</div>
                <div style={{ fontSize: 14, color: '#4ff', fontWeight: 'bold', letterSpacing: 3, whiteSpace: 'nowrap', textShadow: '0 0 8px #0ff' }}>EVADE!</div>
              </div>
            )}
            {disableFlashes.p1 && (
              <div key={`p1disable-${disableFlashes.key}`} className="crit-overlay">
                <div style={{ fontSize: 44, color: '#f90', fontWeight: 'bold', lineHeight: 1, textShadow: '0 0 20px #f80, 0 0 40px #f804' }}>✕</div>
                <div style={{ fontSize: 11, color: '#f90', fontWeight: 'bold', letterSpacing: 2, whiteSpace: 'nowrap', textShadow: '0 0 8px #f80' }}>MOVE DISABLED!</div>
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
            {['AT', 'BL', 'SP'].map(move => {
              const isP1Controllable = !isOnline || online.myIndex === 0
              const moveDisabled = gameOver || animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove) || myPlayer.disabledMove === move
              return (
                <TooltipWrap key={move} tip={cycleTip(move, state.p1)} unlocked={true}>
                  <div style={{ width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div
                      onClick={isP1Controllable && !moveDisabled ? () => isOnline ? handleOnlineMove(move) : handleMove(move) : undefined}
                      style={{
                        width: '100%', aspectRatio: '1', borderRadius: '50%',
                        backgroundColor: state.p1.cycleLit[move] ? (state.p1.hasDodge ? '#e03050' : state.p1.hasMourne ? '#7020c0' : p1Accent) : '#333',
                        border: '2px solid ' + (state.p1.cycleLit[move] ? (state.p1.hasDodge ? '#e03050' : state.p1.hasMourne ? '#b06cff' : p1Accent) : '#555'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                        fontSize: 9, fontWeight: 'bold', color: state.p1.cycleLit[move] ? '#000' : '#666',
                        textAlign: 'center', lineHeight: 1.2,
                        cursor: isP1Controllable ? (moveDisabled ? 'not-allowed' : 'pointer') : 'default',
                        opacity: isP1Controllable && moveDisabled ? 0.45 : 1,
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
              )
            })}
          </div>
          {/* Read toggle — circular, below cycle circles, flush left */}
          {!gameOver && (() => {
            const readDisabled = animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove)
            const isP1Controllable = !isOnline || online.myIndex === 0
            if (!isP1Controllable) return null
            return (
              <div style={{ display: 'flex', marginTop: 6 }}>
                <div style={{ width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    onClick={!readDisabled ? () => setP1ReadActive(r => !r) : undefined}
                    style={{
                      width: '100%', aspectRatio: '1', borderRadius: '50%',
                      backgroundColor: p1ReadActive ? '#6b3200' : '#111',
                      border: `2px ${p1ReadActive ? 'solid' : 'dashed'} #f80`,
                      boxShadow: p1ReadActive ? '0 0 10px #f804, inset 0 0 10px #f802' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                      fontSize: 9, fontWeight: 'bold',
                      color: p1ReadActive ? '#ffb347' : '#f806',
                      textAlign: 'center', lineHeight: 1.2,
                      cursor: readDisabled ? 'not-allowed' : 'pointer',
                      opacity: readDisabled ? 0.45 : 1,
                      userSelect: 'none',
                    }}
                  >
                    READ
                    <span style={{ fontSize: 13, lineHeight: 1, marginTop: 2 }}>{p1ReadActive ? '◉' : '○'}</span>
                  </div>
                </div>
              </div>
            )
          })()}
          {state.p1.hasDodge && state.p1.dodgeStreak > 0 && (
            <div style={{ fontSize: 10, color: '#7df', marginTop: 4 }}>
              DODGE ×{state.p1.dodgeStreak}
            </div>
          )}
          {/* Evade chance bar — Cairan P1 */}
          {state.p1.hasDodge && (
            <div className="char-bar-wrap" style={{ marginTop: 5, width: 280 }}>
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
          {state.p1.hasMourne && (
            <div className="char-bar-wrap" style={{ marginTop: 5, width: 280 }}>
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
          {state.p1.hasDodge && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280 }}>
              <AbilityWheel count={state.p1.damageDealtCount}     unlocked={state.p1.keenEyeUnlocked}     label="Keen Eye"    tip={{ ...TIPS.keenEye, stat: `Current crit chance: ${Math.round((state.p1.keenEyeChance ?? 0.10) * 100)}%` }} />
              <AbilityWheel count={state.p1.successfulDodgeCount} unlocked={state.p1.nimbleUnlocked}      label="Nimble"      maxCount={2} tip={TIPS.nimble} />
              <AbilityWheel count={state.p1.critHitsDealt}        unlocked={state.p1.bloodletterUnlocked} label="Bloodletter" maxCount={2} tip={TIPS.bloodletter} />
            </div>
          )}
          {/* Ability progress wheels — Mourne */}
          {state.p1.hasMourne && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280 }}>
              <MourneAbilityWheel count={state.p1.selfDamageTaken}    unlocked={state.p1.siphonUnlocked}   label="Siphon"   maxCount={5}  tip={TIPS.siphon} />
              <MourneAbilityWheel count={state.p1.selfDamageTotal}    unlocked={state.p1.overloadUnlocked} label="Overload" maxCount={10} tip={TIPS.overload} />
              <MourneAbilityWheel count={state.p1.goodToggledSpReads} unlocked={state.p1.leechUnlocked}    label="Leech"    maxCount={3}  tip={TIPS.leech} />
            </div>
          )}
          {/* Ability progress wheels — Vael Solace */}
          {state.p1.hasVael && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280 }}>
              <VaelAbilityWheel count={state.p1.vaelDisablesLanded}  unlocked={state.p1.jinxUnlocked}      label="JINX"  maxCount={2} tip={TIPS.vaelJinx} />
              <VaelAbilityWheel count={state.p1.vaelNormalGoodReads} unlocked={state.p1.vaelRegenUnlocked} label="Regen" maxCount={3} tip={TIPS.vaelRegen} />
            </div>
          )}
          {/* Stat-up flashes */}
          <div style={{ minHeight: 14, marginTop: 2 }}>
            {statUpFlashes.p1ke && <div key={`p1ke-${statUpFlashes.key}`} className="stat-up">CRIT CHANCE UP!</div>}
            {statUpFlashes.p1nb && <div key={`p1nb-${statUpFlashes.key}`} className="stat-up">EVASION CHANCE UP!</div>}
          </div>
          {!gameOver && (
            <div style={{ marginTop: 6 }}>
              <UltMeter
                accent={p1Accent}
                ready={state.p1.ultimateReady}
                ultGoodReads={state.p1.ultGoodReads ?? 0}
                ultChainAchieved={!!state.p1.ultChainAchieved}
                cycleLit={state.p1.cycleLit}
              />
            </div>
          )}
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
          <div className={['portrait-wrap', collapseAnimating ? (collapseUser === 'p2' ? 'collapse-charge' : 'collapse-hit') : ultAnimating ? 'ult-hit' : p2UltAnimating ? 'ult-charge' : animating ? 'p2-fight' : undefined].filter(Boolean).join(' ')}
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
            {evadeFlashes.p2 && (
              <div key={`p2evade-${evadeFlashes.key}`} className="crit-overlay">
                <div style={{ fontSize: 52, color: '#4ff', fontWeight: 'bold', lineHeight: 1, textShadow: '0 0 20px #0ff, 0 0 40px #0cc8' }}>◌</div>
                <div style={{ fontSize: 14, color: '#4ff', fontWeight: 'bold', letterSpacing: 3, whiteSpace: 'nowrap', textShadow: '0 0 8px #0ff' }}>EVADE!</div>
              </div>
            )}
            {disableFlashes.p2 && (
              <div key={`p2disable-${disableFlashes.key}`} className="crit-overlay">
                <div style={{ fontSize: 44, color: '#f90', fontWeight: 'bold', lineHeight: 1, textShadow: '0 0 20px #f80, 0 0 40px #f804' }}>✕</div>
                <div style={{ fontSize: 11, color: '#f90', fontWeight: 'bold', letterSpacing: 2, whiteSpace: 'nowrap', textShadow: '0 0 8px #f80' }}>MOVE DISABLED!</div>
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
            {['AT', 'BL', 'SP'].map(move => {
              const isP2Controllable = isOnline && online.myIndex === 1
              const moveDisabled = gameOver || animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove) || myPlayer.disabledMove === move
              return (
                <TooltipWrap key={move} tip={cycleTip(move, state.p2)} unlocked={true}>
                  <div style={{ width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div
                      onClick={isP2Controllable && !moveDisabled ? () => handleOnlineMove(move) : undefined}
                      style={{
                        width: '100%', aspectRatio: '1', borderRadius: '50%',
                        backgroundColor: state.p2.cycleLit[move] ? (state.p2.hasDodge ? '#e03050' : state.p2.hasMourne ? '#7020c0' : p2Accent) : '#333',
                        border: '2px solid ' + (state.p2.cycleLit[move] ? (state.p2.hasDodge ? '#e03050' : state.p2.hasMourne ? '#b06cff' : p2Accent) : '#555'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                        fontSize: 9, fontWeight: 'bold', color: state.p2.cycleLit[move] ? '#000' : '#666',
                        textAlign: 'center', lineHeight: 1.2,
                        cursor: isP2Controllable ? (moveDisabled ? 'not-allowed' : 'pointer') : 'default',
                        opacity: isP2Controllable && moveDisabled ? 0.45 : 1,
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
              )
            })}
          </div>
          {state.p2.hasDodge && state.p2.dodgeStreak > 0 && (
            <div style={{ fontSize: 10, color: '#7df', marginTop: 4, textAlign: 'right' }}>
              DODGE ×{state.p2.dodgeStreak}
            </div>
          )}
          {/* Evade chance bar — Cairan P2 */}
          {state.p2.hasDodge && (
            <div className="char-bar-wrap" style={{ marginTop: 5, width: 280, marginLeft: 'auto' }}>
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
          {state.p2.hasMourne && (
            <div className="char-bar-wrap" style={{ marginTop: 5, width: 280, marginLeft: 'auto' }}>
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
          {state.p2.hasDodge && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280, marginLeft: 'auto' }}>
              <AbilityWheel count={state.p2.damageDealtCount}     unlocked={state.p2.keenEyeUnlocked}     label="Keen Eye"    tip={{ ...TIPS.keenEye, stat: `Current crit chance: ${Math.round((state.p2.keenEyeChance ?? 0.10) * 100)}%` }} />
              <AbilityWheel count={state.p2.successfulDodgeCount} unlocked={state.p2.nimbleUnlocked}      label="Nimble"      maxCount={2} tip={TIPS.nimble} />
              <AbilityWheel count={state.p2.critHitsDealt}        unlocked={state.p2.bloodletterUnlocked} label="Bloodletter" maxCount={2} tip={TIPS.bloodletter} />
            </div>
          )}
          {/* Ability progress wheels — Mourne P2 */}
          {state.p2.hasMourne && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280, marginLeft: 'auto' }}>
              <MourneAbilityWheel count={state.p2.selfDamageTaken}    unlocked={state.p2.siphonUnlocked}   label="Siphon"   maxCount={5}  tip={TIPS.siphon} />
              <MourneAbilityWheel count={state.p2.selfDamageTotal}    unlocked={state.p2.overloadUnlocked} label="Overload" maxCount={10} tip={TIPS.overload} />
              <MourneAbilityWheel count={state.p2.goodToggledSpReads} unlocked={state.p2.leechUnlocked}    label="Leech"    maxCount={3}  tip={TIPS.leech} />
            </div>
          )}
          {/* Ability progress wheels — Vael Solace P2 */}
          {state.p2.hasVael && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280, marginLeft: 'auto' }}>
              <VaelAbilityWheel count={state.p2.vaelDisablesLanded}  unlocked={state.p2.jinxUnlocked}      label="JINX"  maxCount={2} tip={TIPS.vaelJinx} />
              <VaelAbilityWheel count={state.p2.vaelNormalGoodReads} unlocked={state.p2.vaelRegenUnlocked} label="Regen" maxCount={3} tip={TIPS.vaelRegen} />
            </div>
          )}
          {/* Stat-up flashes */}
          <div style={{ minHeight: 14, marginTop: 2, textAlign: 'right' }}>
            {statUpFlashes.p2ke && <div key={`p2ke-${statUpFlashes.key}`} className="stat-up">CRIT CHANCE UP!</div>}
            {statUpFlashes.p2nb && <div key={`p2nb-${statUpFlashes.key}`} className="stat-up">EVASION CHANCE UP!</div>}
          </div>
          {!gameOver && (
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
              <UltMeter
                accent={p2Accent}
                ready={state.p2.ultimateReady}
                ultGoodReads={state.p2.ultGoodReads ?? 0}
                ultChainAchieved={!!state.p2.ultChainAchieved}
                cycleLit={state.p2.cycleLit}
              />
            </div>
          )}
        </div>
      </div>

      {/* Between-turns effect strip */}
      <div style={{ minHeight: 52, marginBottom: 8, display: 'flex', alignItems: 'center' }}>
        {activeEffect && activeEffect.type !== 'announce' && renderEffectBanner(activeEffect)}
      </div>

      <div className="move-btn-row" style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {myPlayer.ultimateReady && !gameOver && (
          <TooltipWrap tip={ultTip(myPlayer)} unlocked={true}>
            <button
              onClick={isOnline ? handleOnlineUlt : handleUlt}
              disabled={animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove)}
              style={{ background: myPlayer.hasMourne ? '#7020c0' : '#1a0008', color: myPlayer.hasMourne ? '#e0b0ff' : '#cc2244', fontWeight: 'bold', border: `1px solid ${myPlayer.hasMourne ? 'transparent' : '#cc2244'}`, padding: '2px 10px', cursor: 'pointer', letterSpacing: 1 }}
            >
              {myPlayer.hasMourne ? 'COLLAPSE' : myPlayer.hasVael ? 'MIND BLAST' : 'ASSASSINATE'}
            </button>
          </TooltipWrap>
        )}
        {/* Bloodletter — Cairan only */}
        {myPlayer.bloodletterUnlocked && !gameOver && (
          <TooltipWrap tip={TIPS.bloodletter} unlocked={true}>
            <button
              onClick={isOnline ? handleOnlineBloodletter : handleBloodletter}
              disabled={animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove)}
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
            <button onClick={handleReset} disabled={animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns} style={{ marginLeft: 'auto' }}>Reset</button>
            <button onClick={handleChangeChars} style={{ fontSize: 10, color: '#aaa' }}>Change</button>
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

      {gameOver && (
        <div style={{ marginBottom: 16, fontWeight: 'bold' }}>
          {state.p1.hp === 0 && state.p2.hp === 0 ? 'Draw!' : state.p1.hp === 0 ? `${p2Name} wins!` : `${p1Name} wins!`}
        </div>
      )}

      {state.log.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto', fontSize: 12 }}>
          {[...state.log].reverse().map(entry => (
            <LogRow key={entry.turn} entry={entry} p1Name={p1Name} p2Name={p2Name} p1Char={state.p1Character} p2Char={state.p2Character} />
          ))}
        </div>
      )}
    </div>
    </>
  )
}
