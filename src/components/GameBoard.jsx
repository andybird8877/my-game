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
  bloodletter: { name: 'Bloodletter',  description: 'Passive: whenever Cairan lands a toggled Good Read, a Bleed stack is applied to the opponent.',                       unlock: 'Land 2 critical hits.' },
  siphon:      { name: 'Siphon',       description: 'Restores 25% of SP damage dealt as HP each between-turns phase.',                                                     unlock: 'Take self-damage 5 times.' },
  overload:    { name: 'Overload',     description: 'When HP drops below 30%, SP damage is permanently multiplied by 1.75.',                                               unlock: 'Accumulate 10 total self-damage.' },
  leech:       { name: 'Leech',        description: 'Good Reads restore HP equal to 100% of damage dealt. Suppresses self-damage that turn.',                         unlock: 'Land 3 Good Reads (any move).' },
  moveAt:      { name: 'Attack',       description: 'A direct strike. Beats Special but loses to Block. Chaining Attack three times in a row builds bonus damage.' },
  moveSp:      { name: 'Special',      description: 'A powerful channeled move. Beats Block but loses to Attack. Chaining Special three times in a row builds damage reduction.' },
  moveBl:      { name: 'Block',        description: 'A defensive stance. Deals small chip damage to an attacker. Beats Attack but loses to Special.' },
  moveDodge:   { name: 'Dodge',        description: 'Cairan\'s unique counter. First dodge absorbs all incoming chip damage. Each consecutive dodge launches a counter-attack for double the attacker\'s AT damage.' },
  moveFF:      { name: 'Force Field',  description: 'Mourne\'s defensive barrier. Absorbs chip damage into the Force Field accumulator instead of taking HP loss. When the accumulator reaches 10, the stored energy fires back at the opponent.' },
  vaelJinx:      { name: 'JINX',        description: 'After unlocking, any Good Clash (without Read active) also randomly disables one of the opponent\'s moves for their next turn — same effect as the SP-vs-BL trigger.',              unlock: 'Land SP disable 2 times.' },
  vaelRegen:     { name: 'Regen',       description: 'After each turn resolves, Vael heals a portion of her max HP. Heal amount scales inversely with current HP — strongest when low, minimal when near full.',                               unlock: 'Land 3 Good Clashes (without Read active).' },
  vaelEvade:     { name: 'Evade',       description: 'Unlocks after 2 committed Read-toggle wins. Once unlocked, evade chance scales with remaining HP, from 5% at full health up to 25% near death.',                                        unlock: 'Land 2 Good Reads (with Read active).' },
  wrackFestering: { name: 'FESTER',  description: 'Once unlocked, any hit from a chain of 4+ also applies poison equal to the current chain length.',  unlock: 'Reach an AT or SP chain of 4+ on 4 separate turns.' },
  wrackWither:    { name: 'WITHER',     description: 'Once unlocked, each successful toggled Good Read applies poison equal to Wrack\'s base AT damage.',                                                                                    unlock: 'Land 4 toggled Good Reads.' },
  wrackGall:      { name: 'GALL',       description: 'Once unlocked, each toggled Good Read with AT or SP applies +3 bonus poison on top.',                                                                                                   unlock: 'Land 4 toggled Good Reads with AT or SP.' },
  harroxIronSkin: { name: 'IRON SKIN',  description: 'Permanently adds +3 to Harrox\'s base AT damage.',                                                                                                                                      unlock: 'Take direct damage 6 times.' },
  harroxFrenzy:   { name: 'FRENZY',     description: 'Crit chance increases to 8%. AT chain can never reset below 1 — every turn Harrox carries at least one chain stack.',                                                                   unlock: 'Take direct damage 12 times.' },
  harroxMassacre:    { name: 'MASSACRE',    description: 'Every AT win inflicts a Bleed stack on the opponent, even without a Read toggled. Also adds 3 Bleeds when RAMPAGE fires.',                                                             unlock: 'Take direct damage 18 times.' },
  sableResonance:    { name: 'RESONANCE',   description: 'Sable begins absorbing incoming damage as Echo charge at 25% rate. Stored charge fires as bonus damage whenever she wins with SP.',                                                   unlock: 'Take direct damage 3 times.' },
  sableRefraction:   { name: 'REFRACTION',  description: 'Echo absorption rate increases to 40%. If the SP win that fires the Echo was a toggled Good Read, the burst deals 1.5× damage.',                                                     unlock: 'Fire 2 SP Echo bursts.' },
  sableNullfield:    { name: 'NULLFIELD',   description: 'Once per match, when Sable would take lethal damage, that damage is reflected at the attacker instead and Sable survives. Does not block DoT.',                                  unlock: 'Achieve 3 Good Reads.' },
}

// ─── Sound ───────────────────────────────────────────────────────────────────
const SFX = {
  hits:     ['/audio/hit2.m4a','/audio/hit3.m4a','/audio/hit4.m4a','/audio/hit5.m4a','/audio/hit6.m4a'],
  blocks:   ['/audio/block1.m4a','/audio/block2.m4a','/audio/block3.m4a','/audio/block4.m4a'],
  em:       ['/audio/em1.m4a','/audio/em2.m4a','/audio/em3.m4a','/audio/em4.m4a','/audio/em5.m4a'],
  reversal: '/audio/reversal1.m4a',
  crowd:    '/audio/crowd1.m4a',
  forced:   '/audio/forced.m4a',
  dblblock: '/audio/dblblock1.m4a',
  ko:       '/audio/ko1.mp3',
  victory:  '/audio/victory1.wav',
}
const sfxRand = arr => arr[Math.floor(Math.random() * arr.length)]
function playSound(src, volume = 1) {
  try { const a = new Audio(src); a.volume = volume; a.play().catch(() => {}) } catch {}
}
function playMenuClick() { playSound('/audio/menu-click.m4a', 0.7) }

// ─── Tooltip UI ───────────────────────────────────────────────────────────────
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches

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
      onMouseEnter={isTouchDevice ? undefined : e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={isTouchDevice ? undefined : e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={isTouchDevice ? undefined : () => { clearTimeout(timer.current); setShow(false) }}
    >
      {children}
      {show && tip && <TooltipBox {...tip} unlocked={unlocked} x={pos.x} y={pos.y} />}
    </div>
  )
}

// ─── Character Select ─────────────────────────────────────────────────────────

const AFFINITY_COLOR = { good: '#5af', evil: '#f55' }
const CLASS_ICON     = { warrior: '⚔️', mage: '✨', tank: '🛡️' }

// ─── Tutorial Screen ──────────────────────────────────────────────────────────

const TUTORIAL_CARDS = [
  {
    title: 'WHAT IS COUNTERCYCLE',
    body: 'CounterCycle is a turn-based fighting game. Each round, both players pick a move simultaneously. You don\'t see your opponent\'s choice until it resolves. Read them. Outplay them. Win.',
    images: [],
  },
  {
    title: 'THE THREE MOVES',
    body: 'Every fighter has three moves: AT (Attack), BL (Block), and SP (Special).\n\nAT beats SP.\nBL beats AT.\nSP beats BL.\n\nIt\'s a triangle. But it\'s not that simple.',
    images: ['/card-2.png'],
  },
  {
    title: 'THE READ TOGGLE',
    body: 'Before picking a move, you can toggle READ ON. Correct prediction → Good Read. Bonus damage, effects, passives. Wrong prediction → Bad Read. You take extra damage instead.',
    images: ['/card-3.1.png', '/card-3.2.png'],
    imagesLayout: 'side-by-side',
  },
  {
    title: 'PLAYSTYLE BRANCHES',
    body: 'How you fight shapes how you grow. Chaining — repeat the same move to build pressure. Cycling — rotate through all three moves to stay unpredictable. Reading — use the Read Toggle to punish your opponent\'s patterns. Your character\'s passives unlock along these paths.',
    images: [],
  },
  {
    title: 'PASSIVES',
    body: 'Each character has 3 passives that unlock mid-match. They don\'t start active — you earn them through play. Watch for announcements during the fight. When a passive unlocks, your toolkit changes.',
    images: ['/card-5.png'],
  },
  {
    title: 'FLOW STATE',
    body: 'Land 2 Good Reads in a row to enter FLOW STATE. While in Flow, your damage is multiplied. Lose your rhythm and it breaks. Flow State is the engine everything else feeds into.',
    images: ['/card-6.png'],
  },
  {
    title: 'YOU\'RE READY',
    body: 'Pick a fighter. Learn their style. The tutorial ends here — the rest, you figure out.',
    images: [],
    done: true,
  },
]

function TutorialScreen({ onDone }) {
  const [index, setIndex] = useState(0)
  const card = TUTORIAL_CARDS[index]
  const total = TUTORIAL_CARDS.length

  const btnStyle = {
    padding: '12px 28px', fontSize: 12, letterSpacing: 3,
    background: '#111', border: '1px solid #555', color: '#ccc',
    cursor: 'pointer', fontFamily: 'monospace',
  }
  const btnActiveStyle = { ...btnStyle, border: '1px solid #5af', color: '#5af' }

  return (
    <div style={{
      maxWidth: 520, margin: '60px auto', fontFamily: 'monospace',
      color: '#fff', padding: '0 20px', minHeight: '80vh',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Counter */}
      <div style={{ textAlign: 'right', fontSize: 11, color: '#555', letterSpacing: 2, marginBottom: 24 }}>
        {index + 1} / {total}
      </div>

      {/* Card */}
      <div style={{
        flex: 1, border: '1px solid #2a2a2a', background: '#0d0d0d',
        padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        {/* Title */}
        <div style={{ fontSize: 13, letterSpacing: 4, color: '#5af', fontWeight: 'bold' }}>
          {card.title}
        </div>

        {/* Images */}
        {card.images.length === 1 && (
          <img
            src={card.images[0]}
            alt=""
            style={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block' }}
          />
        )}
        {card.imagesLayout === 'side-by-side' && card.images.length === 2 && (
          <div style={{ display: 'flex', gap: 12 }}>
            {card.images.map((src, i) => (
              <img key={i} src={src} alt="" style={{ flex: 1, width: 0, maxHeight: 220, objectFit: 'contain' }} />
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
          {card.body}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button
          onClick={() => setIndex(i => i - 1)}
          disabled={index === 0}
          style={{ ...btnStyle, opacity: index === 0 ? 0.25 : 1, cursor: index === 0 ? 'default' : 'pointer' }}
        >
          ← PREV
        </button>

        {card.done ? (
          <button onClick={onDone} style={btnActiveStyle}>
            DONE
          </button>
        ) : (
          <button onClick={() => setIndex(i => i + 1)} style={btnActiveStyle}>
            NEXT →
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Floating Damage Number ───────────────────────────────────────────────────

function DamageNumber({ value }) {
  return (
    <div style={{
      position: 'absolute',
      left: '50%', bottom: '60%',
      transform: 'translateX(-50%)',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      fontSize: 36,
      color: '#ff3333',
      textShadow: '0 0 12px #ff0000, 0 2px 4px #000',
      pointerEvents: 'none',
      userSelect: 'none',
      animation: 'dmgRise 3s ease-out forwards',
      zIndex: 10,
      whiteSpace: 'nowrap',
    }}>
      -{value}
      <style>{`
        @keyframes dmgRise {
          0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
          67%  { opacity: 1; transform: translateX(-50%) translateY(-60px); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-80px); }
        }
      `}</style>
    </div>
  )
}

function CharSelectSplash({ char, onDone }) {
  const [phase, setPhase] = useState('in') // 'in' | 'hold' | 'out'
  const accent = AFFINITY_COLOR[char.affinity]

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 300)
    const t2 = setTimeout(() => setPhase('out'),  1600)
    const t3 = setTimeout(() => onDone(),         2000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  const opacity  = phase === 'out' ? 0 : 1
  const scale    = phase === 'in'  ? 0.7 : phase === 'out' ? 1.08 : 1
  const bgOpacity = phase === 'out' ? 0 : 0.85

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'all',
      backgroundColor: `rgba(0,0,0,${bgOpacity})`,
      transition: 'background-color 0.35s ease',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        opacity, transform: `scale(${scale})`,
        transition: phase === 'in' ? 'opacity 0.25s ease, transform 0.3s cubic-bezier(0.175,0.885,0.32,1.275)'
                                   : 'opacity 0.35s ease, transform 0.35s ease',
      }}>
        <img
          src={char.portrait}
          alt={char.name}
          style={{
            width: 390, height: 390,
            objectFit: 'cover',
            border: `3px solid ${accent}`,
            boxShadow: `0 0 40px ${accent}88`,
          }}
        />
        <div style={{
          fontFamily: 'monospace', fontSize: 22, fontWeight: 'bold',
          letterSpacing: 4, color: accent,
          textShadow: `0 0 20px ${accent}`,
        }}>
          {char.name.toUpperCase()}
        </div>
      </div>
    </div>
  )
}

function CharacterSelect({ step, p1Char, onSelect, onPreview }) {
  const [hovered, setHovered] = useState(null)
  const [splash, setSplash]   = useState(null) // char being shown, or null

  // Only show named characters (those with a portrait); sorted alphabetically
  const named = CHARACTERS.filter(c => c.portrait).slice().sort((a, b) => a.name.localeCompare(b.name))

  function handleCardClick(char) {
    if (splash) return
    onPreview?.(char)
    setSplash(char)
  }

  function renderCard(char) {
    const accent    = AFFINITY_COLOR[char.affinity]
    const isHovered = hovered === char.id
    return (
      <div
        key={char.id}
        onClick={() => handleCardClick(char)}
        onMouseEnter={() => setHovered(char.id)}
        onMouseLeave={() => setHovered(null)}
        style={{
          border: `2px solid ${isHovered ? accent : '#333'}`,
          backgroundColor: isHovered ? '#1a1a1a' : '#0e0e0e',
          cursor: 'pointer',
          transition: 'border-color 0.12s, background-color 0.12s',
          userSelect: 'none',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Portrait */}
        <div style={{ position: 'relative', width: '100%', paddingBottom: '100%', overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={char.portrait}
            alt={char.name}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              filter: isHovered ? 'brightness(1.1)' : 'brightness(0.85)',
              transition: 'filter 0.12s',
            }}
          />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
            padding: '20px 8px 6px',
          }} />
        </div>
        {/* Info */}
        <div style={{ padding: '8px 10px' }}>
          <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 3, color: '#fff', letterSpacing: 0.5 }}>{char.name}</div>
          <div style={{ fontSize: 10, color: '#888' }}>
            {CLASS_ICON[char.class]} {char.class} · {char.weight} · {char.hp} HP
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    {splash && <CharSelectSplash char={splash} onDone={() => { onSelect(splash); setSplash(null) }} />}
    <div style={{
      maxWidth: 640,
      margin: '40px auto',
      fontFamily: 'monospace',
      color: '#fff',
      padding: '0 16px',
      pointerEvents: splash ? 'none' : 'auto',
    }}>
      <h2 style={{ textAlign: 'center', marginBottom: 24, fontSize: 18, letterSpacing: 2, color: '#ccc' }}>
        {step === 1 ? 'P1 — CHOOSE YOUR CHARACTER' : 'P2 — CHOOSE YOUR CHARACTER'}
      </h2>

      {step === 2 && p1Char && (
        <div style={{ textAlign: 'center', marginBottom: 20, color: AFFINITY_COLOR[p1Char.affinity], fontSize: 12 }}>
          P1 locked in: <strong>{p1Char.name}</strong>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {named.map(renderCard)}
      </div>
    </div>
    </>
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
      onMouseEnter={isTouchDevice ? undefined : e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={isTouchDevice ? undefined : e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={isTouchDevice ? undefined : () => { clearTimeout(timer.current); setShow(false) }}
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
      onMouseEnter={isTouchDevice ? undefined : e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={isTouchDevice ? undefined : e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={isTouchDevice ? undefined : () => { clearTimeout(timer.current); setShow(false) }}
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
      onMouseEnter={isTouchDevice ? undefined : e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={isTouchDevice ? undefined : e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={isTouchDevice ? undefined : () => { clearTimeout(timer.current); setShow(false) }}
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

function WrackAbilityWheel({ count, unlocked, label, maxCount = 3, tip }) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  const r = 34, cx = 40, cy = 40
  const circumference = 2 * Math.PI * r
  const filled  = unlocked ? maxCount : Math.min(count, maxCount)
  const dashLen = filled > 0 ? (circumference / maxCount) * filled : 0
  const accent  = '#88ee22'
  const stroke  = unlocked ? accent : '#446611'
  return (
    <div
      style={{ width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
      onMouseEnter={isTouchDevice ? undefined : e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={isTouchDevice ? undefined : e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={isTouchDevice ? undefined : () => { clearTimeout(timer.current); setShow(false) }}
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

// Harrox ability wheel — amber/orange accent, tracks FURY toward each threshold
function HarroxAbilityWheel({ count, unlocked, label, maxCount, tip }) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  const r = 34, cx = 40, cy = 40
  const circumference = 2 * Math.PI * r
  const filled  = unlocked ? maxCount : Math.min(count, maxCount)
  const dashLen = filled > 0 ? (circumference / maxCount) * filled : 0
  const accent  = '#ff8800'
  const stroke  = unlocked ? accent : '#994400'
  return (
    <div
      style={{ width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
      onMouseEnter={isTouchDevice ? undefined : e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={isTouchDevice ? undefined : e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={isTouchDevice ? undefined : () => { clearTimeout(timer.current); setShow(false) }}
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

// Sable ability wheel — deep purple accent
// mode='count': normal count→max wheel (Resonance, Refraction)
// mode='nullfield': boolean shield indicator (Nullfield)
function SableAbilityWheel({ count, unlocked, label, maxCount, tip, mode, nullfieldReady, nullfieldUsed }) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  const accent = '#9933ff'
  const r = 34, cx = 40, cy = 40
  const circumference = 2 * Math.PI * r

  let innerEl
  let strokeColor
  let dashLen

  if (mode === 'nullfield') {
    if (!unlocked) {
      // Tracking phase: show good-reads progress toward 3
      const filled = Math.min(count ?? 0, maxCount)
      dashLen = filled > 0 ? (circumference / maxCount) * filled : 0
      strokeColor = '#551188'
      innerEl = <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fill="#555">{count ?? 0}/{maxCount}</text>
    } else {
      const isReady = nullfieldReady && !nullfieldUsed
      strokeColor = isReady ? accent : '#441166'
      dashLen = circumference
      innerEl = isReady
        ? <text x={cx} y={cy + 6} textAnchor="middle" fontSize={18} fill={accent} fontWeight="bold">🛡</text>
        : <text x={cx} y={cy + 6} textAnchor="middle" fontSize={15} fill="#441166">✕</text>
    }
  } else {
    const filled = unlocked ? maxCount : Math.min(count ?? 0, maxCount)
    dashLen = filled > 0 ? (circumference / maxCount) * filled : 0
    strokeColor = unlocked ? accent : '#551188'
    innerEl = unlocked
      ? <text x={cx} y={cy + 6} textAnchor="middle" fontSize={18} fill={accent} fontWeight="bold">✓</text>
      : <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fill="#555">{count ?? 0}/{maxCount}</text>
  }

  return (
    <div
      style={{ width: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default' }}
      onMouseEnter={isTouchDevice ? undefined : e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={isTouchDevice ? undefined : e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={isTouchDevice ? undefined : () => { clearTimeout(timer.current); setShow(false) }}
    >
      <svg viewBox="0 0 80 80" style={{ width: '100%', height: 'auto' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#333" strokeWidth={4} />
        {dashLen > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke={strokeColor} strokeWidth={unlocked ? 5 : 4}
            strokeDasharray={`${dashLen} ${circumference}`}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={unlocked ? { filter: `drop-shadow(0 0 5px ${accent})` } : undefined}
          />
        )}
        {innerEl}
      </svg>
      <div style={{ fontSize: 9, color: unlocked ? accent : '#666', letterSpacing: 0.5, textAlign: 'center', marginTop: 3 }}>{label}</div>
      {show && tip && <TooltipBox {...tip} unlocked={unlocked} x={pos.x} y={pos.y} />}
    </div>
  )
}

// ─── Ult Meter ────────────────────────────────────────────────────────────────
// Single progress ring showing combined ULT unlock progress across all 3 conditions

function UltMeter({ accent, ready, ultGoodReads, ultChainAchieved, cycleLit, ultName, onClick, disabled, tip }) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  const r = 34, cx = 44, cy = 44
  const circumference = 2 * Math.PI * r
  const NUM_SEG = 7
  const gap     = 5
  const slotLen = circumference / NUM_SEG
  const segLen  = slotLen - gap

  const goodReadsCount = Math.min(3, ultGoodReads ?? 0)
  const chainCount     = ultChainAchieved ? 1 : 0
  const litCount       = ['AT', 'BL', 'SP'].filter(m => cycleLit?.[m]).length
  const segmentsMet    = ready ? NUM_SEG : goodReadsCount + chainCount + litCount  // 0–7
  const ultIcon = { ASSASSINATE: '🗡️', COLLAPSE: '💀', 'MIND BLAST': '⚡', HARVEST: '☠️', RAMPAGE: '🪓', SHATTER: '💜' }[ultName] ?? '⚔️'

  const conditions = [
    { label: `Good Reads ${goodReadsCount}/3`, done: goodReadsCount >= 3, detail: 'Toggle Read on and win the clash three times. Does not need to be consecutive.' },
    { label: 'Power Chain',                    done: !!ultChainAchieved,  detail: 'Play AT or SP three times in a row with Read off.' },
    { label: `Cycle Lit ${litCount}/3`,        done: litCount >= 3,       detail: 'Play each of AT, BL, and SP with Read off to light them. You do not need to win the clash.' },
  ]

  const isClickable = ready && !!onClick && !disabled

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        cursor: isClickable ? 'pointer' : 'default',
        outline: 'none',
        borderRadius: 8,
        padding: isClickable ? 4 : 0,
        border: isClickable ? `1px solid ${accent}` : '1px solid transparent',
        boxShadow: isClickable ? `0 0 8px ${accent}55` : 'none',
        transition: 'box-shadow 0.2s, border 0.2s',
      }}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? e => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      onMouseEnter={isTouchDevice ? undefined : e => { setPos({ x: e.clientX, y: e.clientY }); timer.current = setTimeout(() => setShow(true), 300) }}
      onMouseMove={isTouchDevice ? undefined : e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={isTouchDevice ? undefined : () => { clearTimeout(timer.current); setShow(false) }}
    >
      <svg viewBox="0 0 88 88" style={{ width: 84, height: 84 }}>
        {/* Background track segments */}
        {Array.from({ length: NUM_SEG }, (_, i) => (
          <circle key={`track-${i}`}
            cx={cx} cy={cy} r={r} fill="none"
            stroke="#484848" strokeWidth={6}
            strokeDasharray={`${segLen} ${circumference - segLen}`}
            strokeDashoffset={-(i * slotLen)}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
        {/* Filled segments */}
        {Array.from({ length: NUM_SEG }, (_, i) => {
          const filled = i < segmentsMet
          if (!filled) return null
          return (
            <circle key={`seg-${i}`}
              cx={cx} cy={cy} r={r} fill="none"
              stroke={accent} strokeWidth={6}
              opacity={ready ? 1 : 0.7}
              strokeDasharray={`${segLen} ${circumference - segLen}`}
              strokeDashoffset={-(i * slotLen)}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{
                filter: ready
                  ? `drop-shadow(0 0 5px ${accent})`
                  : `drop-shadow(0 0 2px ${accent})`,
                animation: ready ? 'ultPulse 1.1s ease-in-out infinite' : undefined,
              }}
            />
          )
        })}
        {/* Centre label */}
        {ready
          ? <text x={cx} y={cy + 7} textAnchor="middle" fontSize={20} fill={accent} fontWeight="bold"
              style={{ animation: 'ultPulse 1.1s ease-in-out infinite' }}>✓</text>
          : <text x={cx} y={cy + 8} textAnchor="middle" fontSize={22} style={{ userSelect: 'none', filter: 'grayscale(1) opacity(0.55)' }}>{ultIcon}</text>
        }
      </svg>
      <div style={{
        fontSize: 8, letterSpacing: 1, textAlign: 'center', marginTop: 2,
        color: ready ? accent : '#999', fontWeight: ready ? 'bold' : 'normal',
        userSelect: 'none',
      }}>{ultName ?? 'ULT'}</div>
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
          {ready && tip && (
            <>
              <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 3, color: accent, letterSpacing: 0.5 }}>{tip.name}</div>
              <div style={{ color: '#aaa', fontSize: 10, marginBottom: 4 }}>{tip.description}</div>
              <div style={{ color: '#ff0', fontSize: 10, marginBottom: 6 }}>{tip.stat}</div>
              <div style={{ borderTop: '1px solid #333', marginBottom: 6 }} />
            </>
          )}
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

const vaelEvadeChance = (hp, maxHp) => {
  const mx = Math.max(maxHp, 2)
  return Math.min(0.25, Math.max(0.05, 0.05 + (mx - hp) / (mx - 1) * 0.20))
}

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
  const [flowAlert, setFlowAlert]                     = useState(null)
  const forceCritRef = useRef(false)
  const [cpuAlwaysBlock, setCpuAlwaysBlock] = useState(false)
  const [hitNumbers, setHitNumbers] = useState({ p1: null, p2: null, key: 0 })
  const [devUnlocked, setDevUnlocked]         = useState(false)
  const [devPrompt, setDevPrompt]             = useState(false)
  const [devInput, setDevInput]               = useState('')
  const [devError, setDevError]               = useState(false)
  const [showCycleHistory, setShowCycleHistory] = useState(false)

  // ── BGM ───────────────────────────────────────────────────────────────────
  const [bgmVolume, setBgmVolume] = useState(0.25)
  const [bgmMuted, setBgmMuted] = useState(isTouchDevice)
  const bgmRef = useRef(null)
  const bgmStarted = useRef(false)

  useEffect(() => {
    const audio = new Audio('/audio/bgm-2.wav')
    audio.loop = true
    audio.volume = bgmMuted ? 0 : bgmVolume
    bgmRef.current = audio

    function startBgm() {
      if (bgmStarted.current) return
      bgmStarted.current = true
      audio.play().catch(() => {})
      document.removeEventListener('click', startBgm)
      document.removeEventListener('keydown', startBgm)
      document.removeEventListener('touchstart', startBgm)
    }

    document.addEventListener('click', startBgm)
    document.addEventListener('keydown', startBgm)
    document.addEventListener('touchstart', startBgm)

    return () => {
      audio.pause(); audio.src = ''
      document.removeEventListener('click', startBgm)
      document.removeEventListener('keydown', startBgm)
      document.removeEventListener('touchstart', startBgm)
    }
  }, [])
  useEffect(() => {
    if (bgmRef.current) bgmRef.current.volume = bgmMuted ? 0 : bgmVolume
  }, [bgmVolume, bgmMuted])

  // ── Fight banner ──────────────────────────────────────────────────────────
  const [fightBanner, setFightBanner] = useState(false)
  const prevStateRef = useRef(null)
  useEffect(() => {
    const wasNull = prevStateRef.current === null
    prevStateRef.current = state
    if (state && wasNull) {
      const t1 = setTimeout(() => {
        setFightBanner(true)
        if (bgmRef.current) bgmRef.current.volume = Math.min(bgmVolume * 0.25, bgmRef.current.volume)
        playSound('/audio/VO/fight VO.wav?v=2', 1)
      }, 500)
      const t2 = setTimeout(() => {
        setFightBanner(false)
        if (bgmRef.current) bgmRef.current.volume = bgmVolume
      }, 3000)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [state])

  // ── Online multiplayer ────────────────────────────────────────────────────
  const [gameMode, setGameMode] = useState(null)   // null | 'offline' | 'online'
  const [copied,   setCopied]   = useState(false)
  const [online, setOnline]     = useState({
    phase:         'menu',       // 'menu'|'create'|'join'|'waiting'|'char_select'
    roomId:        null,
    myIndex:       null,         // 0=P1  1=P2
    chars:         [null, null], // charId per slot, filled as players select
    playerName:    'Player',     // this client's display name
    playerNames:   [null, null], // both players' names from server
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
    const end    = setTimeout(() => { setAnimating(false); setP1ReadActive(false) }, 2250)
    return () => { clearTimeout(impact); clearTimeout(end) }
  }, [animating])

  // Trigger death effects (flip + grayscale) only after all animations finish
  const isGameOver = state ? (state.p1.hp === 0 || state.p2.hp === 0) : false
  useEffect(() => {
    if (isGameOver && !animating && !ultAnimating && !p2UltAnimating && !collapseAnimating && !betweenTurns) {
      setDeathEffectsReady(true)
      playSound(SFX.victory, 0.8)
    }
  }, [isGameOver, animating, ultAnimating, p2UltAnimating, collapseAnimating, betweenTurns])

  // ── Flow / Zen / GOD MODE alert banners ──────────────────────────────────
  const prevFlowLogLenRef = useRef(0)
  useEffect(() => {
    if (!state?.lastTurn) { prevFlowLogLenRef.current = 0; return }
    if (state.lastTurn.isUlt) return
    const newLen = state.log.length
    if (newLen <= prevFlowLogLenRef.current) return
    prevFlowLogLenRef.current = newLen
    const lt = state.lastTurn
    const nameP1 = state.p1Character?.name ?? 'P1'
    const nameP2 = state.p2Character?.name ?? 'P2'
    const alerts = []
    // Activations — highest tier only per player
    if      (lt.p1GodModeActivated) alerts.push({ msg: `⚡ ${nameP1} — GOD MODE`,      color: '#fff', glow: '#ffd700, #ffaa00', size: 58 })
    else if (lt.p1ZenActivated)     alerts.push({ msg: `✦ ${nameP1} — ZEN STATE`,       color: '#4df', glow: '#4df, #0af',       size: 50 })
    else if (lt.p1FlowActivated)    alerts.push({ msg: `${nameP1} — FLOW STATE`,         color: '#f80', glow: '#f80, #f40',       size: 44 })
    // Breaks — highest tier per player
    if      (lt.p1GodModeBroken)    alerts.push({ msg: `${nameP1} — GOD MODE BROKEN`,   color: '#666', glow: '#333, #111',       size: 34 })
    else if (lt.p1ZenBroken)        alerts.push({ msg: `${nameP1} — ZEN BROKEN`,         color: '#666', glow: '#333, #111',       size: 34 })
    else if (lt.p1FlowBroken)       alerts.push({ msg: `${nameP1} — FLOW BROKEN`,        color: '#666', glow: '#333, #111',       size: 34 })
    if      (lt.p2GodModeActivated) alerts.push({ msg: `⚡ ${nameP2} — GOD MODE`,      color: '#fff', glow: '#ffd700, #ffaa00', size: 58 })
    else if (lt.p2ZenActivated)     alerts.push({ msg: `✦ ${nameP2} — ZEN STATE`,       color: '#4df', glow: '#4df, #0af',       size: 50 })
    else if (lt.p2FlowActivated)    alerts.push({ msg: `${nameP2} — FLOW STATE`,         color: '#f80', glow: '#f80, #f40',       size: 44 })
    if      (lt.p2GodModeBroken)    alerts.push({ msg: `${nameP2} — GOD MODE BROKEN`,   color: '#666', glow: '#333, #111',       size: 34 })
    else if (lt.p2ZenBroken)        alerts.push({ msg: `${nameP2} — ZEN BROKEN`,         color: '#666', glow: '#333, #111',       size: 34 })
    else if (lt.p2FlowBroken)       alerts.push({ msg: `${nameP2} — FLOW BROKEN`,        color: '#666', glow: '#333, #111',       size: 34 })
    // Sable Nullfield reflect
    if (lt.p1SableNullfieldFired) alerts.push({ msg: `🛡 ${nameP1} — NULLFIELD`, color: '#cc66ff', glow: '#9933ff, #6600cc', size: 52 })
    if (lt.p2SableNullfieldFired) alerts.push({ msg: `🛡 ${nameP2} — NULLFIELD`, color: '#cc66ff', glow: '#9933ff, #6600cc', size: 52 })
    // Cleanse confirmations — follow the activation banner
    if (lt.p1FlowCleansed) alerts.push({ msg: `✦ Negative effects cleansed for ${nameP1}`, color: '#aaffaa', glow: '#88ee22, #44aa00', size: 28 })
    if (lt.p2FlowCleansed) alerts.push({ msg: `✦ Negative effects cleansed for ${nameP2}`, color: '#aaffaa', glow: '#88ee22, #44aa00', size: 28 })
    const SHOW_AT = 2300
    const GAP     = 2000
    const HOLD    = 1800
    alerts.forEach((alert, i) => {
      const k = Date.now() + i
      setTimeout(() => setFlowAlert({ ...alert, key: k }), SHOW_AT + i * GAP)
      setTimeout(() => setFlowAlert(f => f?.key === k ? null : f), SHOW_AT + HOLD + i * GAP)
    })
  }, [state?.log?.length]) // eslint-disable-line react-hooks/exhaustive-deps

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

    socket.on('room_state', ({ phase, myIndex, chars, playerNames, gameState, pendingMove, opponentReady }) => {
      setOnline(o => ({
        ...o, phase,
        myIndex:       myIndex       ?? o.myIndex,
        chars:         chars         ?? o.chars,
        playerNames:   playerNames   ?? o.playerNames,
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

    socket.on('match_searching', () => {
      setOnline(o => ({ ...o, phase: 'searching' }))
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

  function handleQuickMatch() {
    setOnline(o => ({ ...o, phase: 'searching', error: null }))
    const socket = openSocket()
    const name = online.playerName || 'Player'
    const go = () => socket.emit('find_match', { name })
    if (socket.connected) go(); else socket.once('connect', go)
  }

  function handleCancelSearch() {
    socketRef.current?.emit('cancel_match')
    socketRef.current?.disconnect(); socketRef.current = null
    setOnline(o => ({ ...o, phase: 'menu', error: null }))
  }

  function handleCreateRoom() {
    setOnline(o => ({ ...o, phase: 'create', error: null }))
    const socket = openSocket()
    const name = online.playerName || 'Player'
    const go = () => socket.emit('create_room', { name })
    if (socket.connected) go(); else socket.once('connect', go)
  }

  function handleJoinRoom() {
    const raw = online.joinInput.trim()
    let roomId = raw
    try { const u = new URL(raw); roomId = u.searchParams.get('room') || raw } catch {}
    if (!roomId) return
    setOnline(o => ({ ...o, phase: 'waiting', roomId, error: null }))
    const socket = openSocket()
    const name = online.playerName || 'Player'
    const go = () => socket.emit('join_room', { roomId, name })
    if (socket.connected) go(); else socket.once('connect', go)
  }

  function handleOnlineCharSelect(char) {
    playMenuClick()
    socketRef.current?.emit('select_char', { charId: char.id })
    setOnline(o => { const c = [...o.chars]; c[o.myIndex] = char.id; return { ...o, chars: c } })
  }

  function handleOnlineMove(move, opts = {}) {
    if (animating || online.pendingMove) return
    socketRef.current?.emit('submit_move', {
      move, readActive: p1ReadActive,
      useBloodletter: false, useUlt: false,
    })
    setOnline(o => ({ ...o, pendingMove: true }))
  }

  function handleOnlineUlt() {
    if (animating || ultAnimating || collapseAnimating || online.pendingMove) return
    socketRef.current?.emit('submit_move', { move: null, readActive: false, useBloodletter: false, useUlt: true })
    setOnline(o => ({ ...o, pendingMove: true }))
  }


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
    setOnline(o => ({ phase: 'menu', roomId: null, myIndex: null, chars: [null, null], playerName: o.playerName, playerNames: [null, null], pendingMove: false, opponentReady: false, error: null, joinInput: '' }))
    setP1ReadActive(false); setAnimating(false); setDisplayedState(null)
    setUltAnimating(false); setCollapseAnimating(false); setCollapseData(null)
    setBetweenTurns(false); setActiveEffect(null); setDeathEffectsReady(false)
    setStatUpFlashes({ p1ke: false, p1nb: false, p2ke: false, p2nb: false, key: 0 })
    window.history.replaceState({}, '', window.location.pathname)
  }

  // ── Character Select ──────────────────────────────────────────────────────

  function playCharVO(char) {
    const voMap = {
      'Cairan Vex':  '/audio/VO/cairan vex VO.wav',
      'Mourne':      '/audio/VO/mourne VO.wav',
      'Vael Solace': '/audio/VO/vael solace VO.wav',
      'Wrack':       '/audio/VO/wrack VO.wav',
      'Harrox':      '/audio/VO/harrox VO.wav',
      'Sable':       '/audio/VO/sable VO.wav',
    }
    const src = voMap[char.name]
    if (src) new Audio(src).play()
  }

  function handleCharSelect(char) {
    playMenuClick()
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
            <button onClick={() => { playMenuClick(); setGameMode('offline') }}
              style={{ padding: '16px 0', fontSize: 14, letterSpacing: 3, background: '#111', border: '1px solid #555', color: '#ccc', cursor: 'pointer' }}>
              VS AI
            </button>
            <button onClick={() => { playMenuClick(); setGameMode('online') }}
              style={{ padding: '16px 0', fontSize: 14, letterSpacing: 3, background: '#111', border: '1px solid #5af', color: '#5af', cursor: 'pointer' }}>
              PLAY ONLINE
            </button>
            <button onClick={() => { playMenuClick(); setGameMode('tutorial') }}
              style={{ padding: '16px 0', fontSize: 14, letterSpacing: 3, background: '#111', border: '1px solid #555', color: '#ccc', cursor: 'pointer' }}>
              TUTORIAL
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, justifyContent: 'center' }}>
              <span style={{ fontSize: 11, color: '#666', letterSpacing: 1 }}>♪</span>
              {isTouchDevice ? (
                <button
                  onClick={() => setBgmMuted(m => !m)}
                  style={{ padding: '4px 14px', fontSize: 11, letterSpacing: 1, background: '#111', border: `1px solid ${bgmMuted ? '#555' : '#5af'}`, color: bgmMuted ? '#555' : '#5af', cursor: 'pointer' }}>
                  {bgmMuted ? 'OFF' : 'ON'}
                </button>
              ) : (
                <>
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={bgmVolume}
                    onChange={e => setBgmVolume(parseFloat(e.target.value))}
                    style={{ width: 100, accentColor: '#5af', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 11, color: '#555', width: 28, textAlign: 'left' }}>{Math.round(bgmVolume * 100)}%</span>
                </>
              )}
            </div>
          </div>
        </div>
      )
    }

    // Tutorial
    if (gameMode === 'tutorial') {
      return <TutorialScreen onDone={() => { playMenuClick(); setGameMode(null) }} />
    }

    // Offline char select — existing flow
    if (gameMode === 'offline') {
      return <CharacterSelect step={selectStep} p1Char={p1CharSel} onSelect={handleCharSelect} onPreview={char => { playMenuClick(); playCharVO(char) }} />
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
          onPreview={char => { playMenuClick(); playCharVO(char) }}
        />
      )
    }

    // Lobby — menu / create / join / waiting
    return (
      <div style={{ maxWidth: 400, margin: '80px auto', fontFamily: 'monospace', color: '#fff', padding: '0 20px' }}>
        <button onClick={() => { playMenuClick(); setGameMode(null); setOnline(o => ({ ...o, phase: 'menu', error: null })) }}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, marginBottom: 28, padding: 0, letterSpacing: 1 }}>
          ← BACK
        </button>

        <h2 style={{ fontSize: 16, letterSpacing: 4, marginBottom: 32, textAlign: 'center', color: '#5af' }}>PLAY ONLINE</h2>

        {error && (
          <div style={{ background: '#300', border: '1px solid #f44', color: '#f88', padding: '8px 12px', marginBottom: 20, fontSize: 12 }}>
            {error}
          </div>
        )}

        {/* Main menu */}
        {phase === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, marginBottom: 6 }}>YOUR NAME</div>
              <input
                value={online.playerName}
                onChange={e => setOnline(o => ({ ...o, playerName: e.target.value.slice(0, 20) }))}
                placeholder="Player"
                maxLength={20}
                style={{ width: '100%', padding: '10px 12px', background: '#111', border: '1px solid #555', color: '#fff', fontFamily: 'monospace', fontSize: 14, boxSizing: 'border-box', letterSpacing: 1 }}
              />
            </div>
            <button onClick={() => { playMenuClick(); handleQuickMatch() }}
              style={{ padding: '18px 0', fontSize: 14, letterSpacing: 3, background: '#111', border: '1px solid #5af', color: '#5af', cursor: 'pointer', marginTop: 4 }}>
              QUICK MATCH
            </button>
            <button onClick={() => { playMenuClick(); setOnline(o => ({ ...o, phase: 'private', error: null })) }}
              style={{ padding: '15px 0', fontSize: 13, letterSpacing: 3, background: '#111', border: '1px solid #555', color: '#ccc', cursor: 'pointer' }}>
              PRIVATE MATCH
            </button>
          </div>
        )}

        {/* Quick Match — searching */}
        {phase === 'searching' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#5af', letterSpacing: 3, marginBottom: 24 }}>SEARCHING FOR OPPONENT</div>
            <div style={{ color: '#5af', letterSpacing: 6, fontSize: 24, marginBottom: 32 }}>· · ·</div>
            <button onClick={() => { playMenuClick(); handleCancelSearch() }}
              style={{ padding: '10px 28px', fontSize: 11, letterSpacing: 2, background: 'none', border: '1px solid #555', color: '#888', cursor: 'pointer' }}>
              CANCEL
            </button>
          </div>
        )}

        {/* Private match sub-menu */}
        {phase === 'private' && !roomId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => { playMenuClick(); handleCreateRoom() }}
              style={{ padding: '15px 0', fontSize: 13, letterSpacing: 3, background: '#111', border: '1px solid #5af', color: '#5af', cursor: 'pointer' }}>
              CREATE ROOM
            </button>
            <button onClick={() => { playMenuClick(); setOnline(o => ({ ...o, phase: 'join', error: null })) }}
              style={{ padding: '15px 0', fontSize: 13, letterSpacing: 3, background: '#111', border: '1px solid #555', color: '#ccc', cursor: 'pointer' }}>
              JOIN ROOM
            </button>
            <button onClick={() => { playMenuClick(); setOnline(o => ({ ...o, phase: 'menu' })) }}
              style={{ marginTop: 4, padding: '8px 0', fontSize: 11, background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
              ← Back
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
            <button onClick={() => { playMenuClick(); handleJoinRoom() }}
              style={{ marginTop: 10, width: '100%', padding: '13px 0', fontSize: 13, letterSpacing: 3, background: '#111', border: '1px solid #5af', color: '#5af', cursor: 'pointer' }}>
              JOIN
            </button>
            <button onClick={() => { playMenuClick(); setOnline(o => ({ ...o, phase: 'private' })) }}
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
              onClick={() => { playMenuClick(); navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              style={{ padding: '10px 28px', fontSize: 12, letterSpacing: 2, background: copied ? '#0d2a0d' : '#111', border: `1px solid ${copied ? '#4f4' : '#5af'}`, color: copied ? '#4f4' : '#5af', cursor: 'pointer', marginBottom: 28 }}>
              {copied ? '✓  COPIED' : 'COPY INVITE LINK'}
            </button>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Waiting for opponent to join...</div>
            <div style={{ color: '#5af', letterSpacing: 6, fontSize: 20 }}>· · ·</div>
          </div>
        )}

        {/* Connecting */}
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

  // Build announcement steps from unlock events in lastTurn
  function buildUnlockSteps(newState) {
    const toStep = (name, prefix) => ({
      type: 'announce',
      message: (prefix ? prefix + ' ' : '') + (
        name === 'keenEye'     ? 'KEEN EYE UNLOCKED' :
        name === 'nimble'      ? 'NIMBLE UNLOCKED' :
        name === 'bloodletter' ? 'BLOODLETTER READY' :
        name === 'leech'       ? 'LEECH UNLOCKED' :
        name === 'vaelJinx'    ? 'JINX UNLOCKED' :
        name === 'vaelRegen'   ? 'REGEN UNLOCKED' :
        name === 'vaelEvade'   ? 'EVADE UNLOCKED' :
        name === 'fester'           ? 'FESTER UNLOCKED' :
        name === 'wither'           ? 'WITHER UNLOCKED' :
        name === 'gall'             ? 'GALL UNLOCKED' :
        name === 'harroxIronSkin'    ? 'IRON SKIN UNLOCKED' :
        name === 'harroxFrenzy'      ? 'FRENZY UNLOCKED' :
        name === 'harroxMassacre'    ? 'MASSACRE UNLOCKED' :
        name === 'sableResonance'    ? 'RESONANCE UNLOCKED' :
        name === 'sableRefraction'   ? 'REFRACTION UNLOCKED' :
        name === 'sableNullfield'    ? 'NULLFIELD PRIMED' :
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
    const aiResult = getAiMove(state)
    const p2Move = cpuAlwaysBlock ? 'BL' : aiResult.move
    const p2ReadActive = cpuAlwaysBlock ? false : aiResult.useRead
    const newState = processTurn(state, p1Move, p2Move, p1ReadActive, p2ReadActive, {
      p1ForceCrit: forceCritRef.current,
    })
    forceCritRef.current = false
    setDisplayedState(state)
    setState(newState)
    setLastMoves({ p1: p1Move, p2: p2Move })
    setLastReads({ p1: newState.lastTurn.p1Read ?? 'none', p2: newState.lastTurn.p2Read ?? 'none' })
    setAnimating(true)
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
    // Hit damage numbers
    const p1Dmg = lt.p1Damage ?? 0
    const p2Dmg = lt.p2Damage ?? 0
    if (p1Dmg > 0 || p2Dmg > 0) {
      const dmgKey = Date.now()
      setTimeout(() => setHitNumbers({ p1: p1Dmg || null, p2: p2Dmg || null, key: dmgKey }), 2000)
      setTimeout(() => setHitNumbers(h => h.key === dmgKey ? { p1: null, p2: null, key: 0 } : h), 5000)
    }
    // Sounds
    const anyKO = newState.p1.hp === 0 || newState.p2.hp === 0
    setTimeout(() => {
      if (lt.outcome === 'BL_CHIP' || (p1Move === 'BL' && p2Move === 'BL')) {
        playSound(sfxRand(SFX.blocks))
      } else if (lt.outcome !== 'TIE' || (p1Move === 'AT' && p2Move === 'AT') || (p1Move === 'SP' && p2Move === 'SP')) {
        playSound(sfxRand(SFX.hits))
        if (lt.p1CritHit || lt.p2CritHit) setTimeout(() => playSound(SFX.crowd, 0.6), 150)
      }
      if (anyKO) setTimeout(() => playSound(SFX.ko), 400)
    }, 2000)
    const hasUnlocks = (lt.p1NewUnlocks?.length > 0) || (lt.p2NewUnlocks?.length > 0)
    if (hasUnlocks) setTimeout(() => playSound(sfxRand(SFX.em), 0.8), 2700)

    // Between-turns: bleeds + Mourne effects, then unlock announcements
    const effectSteps = resolveBeforeTurn(newState)
    const unlockSteps = buildUnlockSteps(newState)
    scheduleEffects([...effectSteps, ...unlockSteps], 2650)
  }

  function handleAiUlt() {
    if (animating || p2UltAnimating || collapseAnimating) return
    const isCairanAiUlt = state.p2Character?.name === 'Cairan Vex'
    const isVaelAiUlt   = state.p2.hasVael
    if (!isCairanAiUlt && !isVaelAiUlt) playSound(sfxRand(SFX.em), 0.9)
    if (isCairanAiUlt) playSound('/audio/ults/cairan-vex-ult.m4a', 1)
    if (isVaelAiUlt)   playSound('/audio/ults/vael-solace-ult.wav', 1)
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
    const isCairanUlt = state.p1Character?.name === 'Cairan Vex' || state.p2Character?.name === 'Cairan Vex'
    const isVaelUlt   = state.p1.hasVael || state.p2.hasVael
    if (!isCairanUlt && !isVaelUlt) playSound(sfxRand(SFX.em), 0.9)
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
    if (isCairanUlt) playSound('/audio/ults/cairan-vex-ult.m4a', 1)
    if (isVaelUlt)   playSound('/audio/ults/vael-solace-ult.wav', 1)
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

  const p1Name   = (isOnline && online.playerNames?.[0]) ? online.playerNames[0] : (state.p1Character?.name ?? 'P1')
  const p2Name   = (isOnline && online.playerNames?.[1]) ? online.playerNames[1] : (state.p2Character?.name ?? 'P2')
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
    } else if (type === 'poison') {
      color = '#44dd44'
      text  = `${playerName} ☠ POISON — ${damage} damage`
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
    if (player.hasWrack)  return 'lit-green'
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
      const disables = player.vaelDisablesLanded   ?? 0
      const normal   = player.vaelNormalGoodReads  ?? 0
      const toggled  = player.vaelToggledGoodReads ?? 0
      const clashes  = normal + toggled
      return {
        name: 'MIND BLAST',
        description: 'Vael channels every disable she has inflicted into a psychic detonation — each disable amplified by every Good Read she has landed. Resets her disable count afterward.',
        stat: `${disables} disables × ${clashes} Good Reads (${normal} clash + ${toggled} toggled) = ${actual} dmg`,
      }
    }
    if (player.hasHarrox) {
      const fury = player.harroxFury ?? 0
      return {
        name: 'RAMPAGE',
        description: 'Deals damage equal to FURY × 5. If MASSACRE is unlocked, also applies 3 Bleed stacks to the opponent.',
        stat: `Current damage: ${fury * 5} (${fury} FURY)`,
      }
    }
    if (player.hasSable) {
      const echoTotal = player.sableEchoTotal ?? 0
      return {
        name: 'SHATTER',
        description: 'Sable unleashes all echo absorbed across the entire match as a single devastating strike. No lifesteal — pure glass-cannon payoff.',
        stat: `Total echo absorbed: ${echoTotal} dmg`,
      }
    }
    if (player.hasWrack) {
      const poisonDealt = player.wrackPoisonDealt ?? 0
      return {
        name: 'HARVEST',
        description: 'Wrack draws on the rot he has spread — healing himself for all the poison damage dealt this match.',
        stat: `Total poison dealt: ${poisonDealt} hp`,
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
    {fightBanner && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'all',
        background: 'rgba(0,0,0,0.55)',
        animation: 'fightBannerFade 1.5s ease forwards',
      }}>
        <div style={{
          fontFamily: 'monospace',
          fontSize: 'clamp(64px, 18vw, 140px)',
          fontWeight: 'bold',
          letterSpacing: 16,
          color: '#fff',
          textShadow: '0 0 30px #fff, 0 0 60px #e03050, 0 0 120px #e03050',
          animation: 'fightBannerScale 1.5s ease forwards',
        }}>
          FIGHT
        </div>
      </div>
    )}
    {fightBanner && (
      <style>{`
        @keyframes fightBannerFade {
          0%   { opacity: 0 }
          15%  { opacity: 1 }
          70%  { opacity: 1 }
          100% { opacity: 0 }
        }
        @keyframes fightBannerScale {
          0%   { transform: scale(0.6) }
          20%  { transform: scale(1.05) }
          35%  { transform: scale(1) }
          80%  { transform: scale(1) }
          100% { transform: scale(1.15) }
        }
      `}</style>
    )}
    {ultAnimating && <div className="ult-screen-overlay" />}
    {ultAnimating && <div className="ult-text">{myPlayer.hasVael ? 'MIND BLAST' : myPlayer.hasWrack ? 'HARVEST' : myPlayer.hasHarrox ? 'RAMPAGE' : myPlayer.hasSable ? 'SHATTER' : 'ASSASSINATE'}</div>}
    {p2UltAnimating && <div className="ult-screen-overlay" />}
    {p2UltAnimating && <div className="ult-text" style={{ color: '#f55', textShadow: '0 0 16px #f00, 0 0 40px #f00, 0 0 80px #a00' }}>{state.p2.hasVael ? 'MIND BLAST' : state.p2.hasWrack ? 'HARVEST' : state.p2.hasHarrox ? 'RAMPAGE' : state.p2.hasSable ? 'SHATTER' : 'ASSASSINATE'}</div>}
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
    {flowAlert && (
      <div
        key={flowAlert.key}
        className="flow-alert"
        style={{
          fontSize: flowAlert.size,
          color: flowAlert.color,
          textShadow: `0 2px 8px #000, 0 0 18px ${flowAlert.glow.split(',')[0]}, 0 0 40px ${flowAlert.glow.split(',')[1] ?? flowAlert.glow.split(',')[0]}`,
        }}
      >
        {flowAlert.msg}
      </div>
    )}
    <div className="game-container" style={{ maxWidth: 620, margin: '40px auto', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      <div className="panels-row" style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 24 }}>

        {/* ── P1 ── */}
        <div className={`panel ${isOnline && online.myIndex === 1 && isMobile ? 'panel-p2' : 'panel-p1'}`}>
          {isMobile && (
            <div className="panel-stats-mobile">
              <span style={{ color: p1Accent, fontWeight: 'bold', marginRight: 4 }}>{p1Name}</span>
              <span style={{ color: '#aaa' }}>HP:{dispP1Hp} AT:{Math.max(state.p1.atDmgBuff, state.p1.baseAtDamage)} SP:{state.p1.hasMourne && state.p1.overloadActive ? Math.floor(Math.max(state.p1.spDmgBuff, state.p1.baseSpDamage) * 1.75) : Math.max(state.p1.spDmgBuff, state.p1.baseSpDamage)}</span>
            </div>
          )}
          <div className={['portrait-wrap', collapseAnimating ? (collapseUser === 'p1' ? 'collapse-charge' : 'collapse-hit') : ultAnimating ? 'ult-charge' : p2UltAnimating ? 'ult-hit' : animating ? 'p1-fight' : undefined].filter(Boolean).join(' ')}
               style={{ position: 'relative', width: 280, height: 280, marginBottom: 4, display: 'block' }}>
            {hitNumbers.p1 && <DamageNumber key={`p1-${hitNumbers.key}`} value={hitNumbers.p1} />}
            <img
              src={state.p1Character?.portrait ?? '/src/img/tyrone.png'}
              alt="P1"
              className={['portrait-img', state.p1.godModeState ? 'godmode-portrait' : state.p1.zenState ? 'zen-portrait' : state.p1.flowState ? 'flow-portrait' : undefined].filter(Boolean).join(' ')}
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
            {!gameOver && (
              <div style={{ position: 'absolute', bottom: 8, left: 8, pointerEvents: 'auto', background: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: '4px 4px 2px' }}>
                <UltMeter
                  accent={p1Accent}
                  ready={state.p1.ultimateReady}
                  ultGoodReads={state.p1.ultGoodReads ?? 0}
                  ultChainAchieved={!!state.p1.ultChainAchieved}
                  cycleLit={state.p1.cycleLit}
                  ultName={state.p1.hasMourne ? 'COLLAPSE' : state.p1.hasVael ? 'MIND BLAST' : state.p1.hasWrack ? 'HARVEST' : state.p1.hasHarrox ? 'RAMPAGE' : state.p1.hasSable ? 'SHATTER' : 'ASSASSINATE'}
                  onClick={!isOnline ? handleUlt : (online.myIndex === 0 ? handleOnlineUlt : null)}
                  disabled={animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove)}
                  tip={ultTip(state.p1)}
                />
              </div>
            )}
          </div>
          <HpBar hp={dispP1Hp} maxHp={state.p1.maxHp} />
          {!isMobile && state.p1.godModeState && (
            <div style={{ fontSize: 9, color: '#ffe', fontWeight: 'bold', letterSpacing: 2, marginBottom: 2 }}>GOD MODE</div>
          )}
          {!isMobile && !state.p1.godModeState && state.p1.zenState && (
            <div style={{ fontSize: 9, color: '#4f8', fontWeight: 'bold', letterSpacing: 2, marginBottom: 2 }}>ZEN</div>
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
                      className={state.p1.godModeState ? 'godmode-btn' : undefined}
                      style={{
                        width: '100%', aspectRatio: '1', borderRadius: '50%',
                        backgroundColor: state.p1.cycleLit[move] ? (state.p1.hasDodge ? '#e03050' : state.p1.hasMourne ? '#7020c0' : state.p1.hasWrack ? '#88ee22' : state.p1.hasHarrox ? '#ff8800' : p1Accent) : '#333',
                        border: '2px solid ' + (state.p1.cycleLit[move] ? (state.p1.hasDodge ? '#e03050' : state.p1.hasMourne ? '#b06cff' : state.p1.hasWrack ? '#88ee22' : state.p1.hasHarrox ? '#ff8800' : p1Accent) : (state.p1.hasWrack ? '#335511' : state.p1.hasHarrox ? '#663300' : '#555')),
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
          {/* Read toggle — wide switch, below cycle-row (P1 / offline / P1 online) */}
          {!gameOver && (() => {
            const readDisabled = animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove)
            const isP1Controllable = !isOnline || online.myIndex === 0
            if (!isP1Controllable) return null
            const toggle = () => { if (!readDisabled) { playMenuClick(); setP1ReadActive(r => !r) } }
            return (
              <div
                role="switch"
                aria-checked={p1ReadActive}
                tabIndex={0}
                onClick={toggle}
                onTouchStart={e => { e.preventDefault(); toggle() }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
                style={{
                  position: 'relative', marginTop: 6,
                  width: isMobile ? '100%' : 260, height: 36, borderRadius: 18,
                  background: '#111', border: '2px solid #555',
                  display: 'flex', alignItems: 'center',
                  opacity: readDisabled ? 0.45 : 1,
                  cursor: readDisabled ? 'not-allowed' : 'pointer',
                  userSelect: 'none', flexShrink: 0, boxSizing: 'border-box',
                  touchAction: 'none',
                }}
              >
                {/* ON label */}
                <div style={{ flex: 1, textAlign: 'center', fontSize: isMobile ? 10 : 12, fontWeight: 'bold', letterSpacing: '1.5px', color: '#4f4' }}>ON</div>
                {/* OFF label */}
                <div style={{ flex: 1, textAlign: 'center', fontSize: isMobile ? 10 : 12, fontWeight: 'bold', letterSpacing: '1.5px', color: '#f44' }}>OFF</div>
                {/* sliding cover */}
                <div style={{
                  position: 'absolute', top: 2, left: 4,
                  width: 'calc(50% - 6px)', height: 28, borderRadius: 14,
                  background: '#888',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isMobile ? 10 : 13, fontWeight: 'bold', letterSpacing: '1.5px', color: '#161616',
                  boxShadow: '0 0 6px rgba(255,255,255,0.15)',
                  transform: p1ReadActive ? 'translateX(calc(100% + 4px))' : 'translateX(0)',
                  transition: 'transform 0.22s ease',
                  pointerEvents: 'none',
                }}>READ</div>
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
          {/* Echo charge bar — Sable P1 */}
          {state.p1.hasSable && (
            <div className="char-bar-wrap" style={{ marginTop: 5, width: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 9, color: '#9933ff', fontWeight: 'bold', letterSpacing: 1, whiteSpace: 'nowrap' }}>ECHO CHARGE</div>
                <div style={{ flex: 1, height: 8, background: '#222', border: '1px solid #444', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min((state.p1.sableEchoCharge ?? 0) / 50 * 100, 100)}%`,
                    background: (state.p1.sableEchoCharge ?? 0) >= 50 ? '#fff' : '#9933ff',
                    transition: 'width 0.2s ease',
                    boxShadow: (state.p1.sableEchoCharge ?? 0) > 0 ? '0 0 6px #9933ff' : 'none',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: (state.p1.sableEchoCharge ?? 0) > 0 ? '#9933ff' : '#444', fontWeight: 'bold', minWidth: 28, textAlign: 'right' }}>
                  {state.p1.sableEchoCharge ?? 0}
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
          {/* Evade chance bar — Vael Solace P1 */}
          {state.p1.hasVael && state.p1.vaelEvadeUnlocked && (
            <div className="char-bar-wrap" style={{ marginTop: 5, width: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 9, color: '#00ccff', fontWeight: 'bold', letterSpacing: 1, whiteSpace: 'nowrap' }}>EVADE</div>
                <div style={{ flex: 1, height: 8, background: '#222', border: '1px solid #444', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(vaelEvadeChance(dispP1Hp, state.p1.maxHp) / 0.25) * 100}%`,
                    background: vaelEvadeChance(dispP1Hp, state.p1.maxHp) >= 0.25 ? '#fff' : '#00ccff',
                    transition: 'width 0.4s ease',
                    boxShadow: '0 0 6px #00ccff',
                  }} />
                </div>
                <div style={{ fontSize: 10, color: '#00ccff', fontWeight: 'bold', minWidth: 36, textAlign: 'right' }}>
                  {Math.round(vaelEvadeChance(dispP1Hp, state.p1.maxHp) * 100)}%
                </div>
              </div>
            </div>
          )}
          {/* Ability progress wheels — Vael Solace */}
          {state.p1.hasVael && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280 }}>
              <VaelAbilityWheel count={state.p1.vaelDisablesLanded}   unlocked={state.p1.jinxUnlocked}       label="JINX"  maxCount={2} tip={TIPS.vaelJinx} />
              <VaelAbilityWheel count={state.p1.vaelNormalGoodReads}  unlocked={state.p1.vaelRegenUnlocked}  label="Regen" maxCount={3} tip={TIPS.vaelRegen} />
              <VaelAbilityWheel count={state.p1.vaelToggledGoodReads} unlocked={state.p1.vaelEvadeUnlocked}  label="Evade" maxCount={2} tip={TIPS.vaelEvade} />
            </div>
          )}
          {/* Ability progress wheels — Wrack */}
          {state.p1.hasWrack && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280 }}>
              <WrackAbilityWheel count={state.p1.wrackChainTriggers} unlocked={state.p1.festeringUnlocked} label="FESTER" maxCount={4} tip={TIPS.wrackFestering} />
              <WrackAbilityWheel count={state.p1.wrackCycleTriggers} unlocked={state.p1.witherUnlocked}    label="WITHER"    maxCount={4} tip={TIPS.wrackWither} />
              <WrackAbilityWheel count={state.p1.wrackReadTriggers}  unlocked={state.p1.gallUnlocked}      label="GALL"      maxCount={4} tip={TIPS.wrackGall} />
            </div>
          )}
          {/* Ability progress wheels — Harrox */}
          {state.p1.hasHarrox && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280 }}>
              <HarroxAbilityWheel count={state.p1.harroxFury} unlocked={state.p1.harroxIronSkinUnlocked} label="IRON SKIN" maxCount={6}  tip={{ ...TIPS.harroxIronSkin, stat: `FURY: ${state.p1.harroxFury}` }} />
              <HarroxAbilityWheel count={state.p1.harroxFury} unlocked={state.p1.harroxFrenzyUnlocked}   label="FRENZY"    maxCount={12} tip={{ ...TIPS.harroxFrenzy,   stat: `FURY: ${state.p1.harroxFury}` }} />
              <HarroxAbilityWheel count={state.p1.harroxFury} unlocked={state.p1.harroxMassacreUnlocked} label="MASSACRE"  maxCount={18} tip={{ ...TIPS.harroxMassacre, stat: `FURY: ${state.p1.harroxFury}` }} />
            </div>
          )}
          {/* Ability progress wheels — Sable */}
          {state.p1.hasSable && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280 }}>
              <SableAbilityWheel mode="count"     count={state.p1.sableHitsTaken}   unlocked={state.p1.sableResonanceUnlocked}  label="RESONANCE"  maxCount={3} tip={{ ...TIPS.sableResonance,  stat: `Hits taken: ${state.p1.sableHitsTaken ?? 0}` }} />
              <SableAbilityWheel mode="count"     count={state.p1.sableEchoBursts}  unlocked={state.p1.sableRefractionUnlocked} label="REFRACTION" maxCount={2} tip={{ ...TIPS.sableRefraction, stat: `Echo bursts: ${state.p1.sableEchoBursts ?? 0}` }} />
              <SableAbilityWheel mode="nullfield" count={state.p1.sableGoodReads ?? 0} maxCount={3} unlocked={state.p1.sableNullfieldUnlocked} nullfieldReady={state.p1.sableNullfieldReady} nullfieldUsed={state.p1.sableNullfieldUsed} label="NULLFIELD" tip={{ ...TIPS.sableNullfield, stat: state.p1.sableNullfieldUsed ? 'SPENT' : state.p1.sableNullfieldUnlocked ? 'ARMED — reflects next lethal hit' : `Good Reads: ${state.p1.sableGoodReads ?? 0}/3` }} />
            </div>
          )}
          {/* Stat-up flashes */}
          <div style={{ minHeight: 14, marginTop: 2 }}>
            {statUpFlashes.p1ke && <div key={`p1ke-${statUpFlashes.key}`} className="stat-up">CRIT CHANCE UP!</div>}
            {statUpFlashes.p1nb && <div key={`p1nb-${statUpFlashes.key}`} className="stat-up">EVASION CHANCE UP!</div>}
          </div>
          {/* DEV: cycleSet rolling window */}
          {showCycleHistory && (
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#555', marginTop: 4 }}>
              cycle: [{(state.p1.cycleSet ?? []).map((m, i) => (
                <span key={i} style={{ color: m === 'AT' ? '#7df' : m === 'SP' ? '#c8f' : '#aaa', marginRight: 2 }}>{m}</span>
              ))}]
            </div>
          )}
        </div>

        {/* ── P2 ── */}
        <div className={`panel ${isOnline && online.myIndex === 1 && isMobile ? 'panel-p1' : 'panel-p2'}`} style={{ textAlign: 'right' }}>
          {isMobile && (
            <div className="panel-stats-mobile" style={{ textAlign: 'right' }}>
              <span style={{ color: p2Accent, fontWeight: 'bold', marginRight: 4 }}>{p2Name}</span>
              <span style={{ color: '#aaa' }}>HP:{dispP2Hp} AT:{Math.max(state.p2.atDmgBuff, state.p2.baseAtDamage)} SP:{state.p2.hasMourne && state.p2.overloadActive ? Math.floor(Math.max(state.p2.spDmgBuff, state.p2.baseSpDamage) * 1.75) : Math.max(state.p2.spDmgBuff, state.p2.baseSpDamage)}</span>
            </div>
          )}
          <div className={['portrait-wrap', collapseAnimating ? (collapseUser === 'p2' ? 'collapse-charge' : 'collapse-hit') : ultAnimating ? 'ult-hit' : p2UltAnimating ? 'ult-charge' : animating ? 'p2-fight' : undefined].filter(Boolean).join(' ')}
               style={{ position: 'relative', width: 280, height: 280, marginBottom: 4, marginLeft: 'auto', display: 'block' }}>
            {hitNumbers.p2 && <DamageNumber key={`p2-${hitNumbers.key}`} value={hitNumbers.p2} />}
            <img
              src={state.p2Character?.portrait ?? '/src/img/stotch.png'}
              alt="P2"
              className={['portrait-img', state.p2.godModeState ? 'godmode-portrait' : state.p2.zenState ? 'zen-portrait' : state.p2.flowState ? 'flow-portrait' : undefined].filter(Boolean).join(' ')}
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
            {!gameOver && (
              <div style={{ position: 'absolute', bottom: 8, right: 8, pointerEvents: 'auto', background: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: '4px 4px 2px' }}>
                <UltMeter
                  accent={p2Accent}
                  ready={state.p2.ultimateReady}
                  ultGoodReads={state.p2.ultGoodReads ?? 0}
                  ultChainAchieved={!!state.p2.ultChainAchieved}
                  cycleLit={state.p2.cycleLit}
                  ultName={state.p2.hasMourne ? 'COLLAPSE' : state.p2.hasVael ? 'MIND BLAST' : state.p2.hasWrack ? 'HARVEST' : state.p2.hasHarrox ? 'RAMPAGE' : state.p2.hasSable ? 'SHATTER' : 'ASSASSINATE'}
                  onClick={isOnline && online.myIndex === 1 ? handleOnlineUlt : null}
                  disabled={animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove)}
                  tip={ultTip(state.p2)}
                />
              </div>
            )}
          </div>
          <HpBar hp={dispP2Hp} maxHp={state.p2.maxHp} alignRight />
          {!isMobile && state.p2.godModeState && (
            <div style={{ fontSize: 9, color: '#ffe', fontWeight: 'bold', letterSpacing: 2, marginBottom: 2, textAlign: 'right' }}>GOD MODE</div>
          )}
          {!isMobile && !state.p2.godModeState && state.p2.zenState && (
            <div style={{ fontSize: 9, color: '#4f8', fontWeight: 'bold', letterSpacing: 2, marginBottom: 2, textAlign: 'right' }}>ZEN</div>
          )}
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
                        backgroundColor: state.p2.cycleLit[move] ? (state.p2.hasDodge ? '#e03050' : state.p2.hasMourne ? '#7020c0' : state.p2.hasWrack ? '#88ee22' : state.p2.hasHarrox ? '#ff8800' : p2Accent) : '#333',
                        border: '2px solid ' + (state.p2.cycleLit[move] ? (state.p2.hasDodge ? '#e03050' : state.p2.hasMourne ? '#b06cff' : state.p2.hasWrack ? '#88ee22' : state.p2.hasHarrox ? '#ff8800' : p2Accent) : (state.p2.hasWrack ? '#335511' : state.p2.hasHarrox ? '#663300' : '#555')),
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
          {/* Read toggle (P2 online) or passive indicator (CPU/observer) */}
          {!gameOver && (() => {
            const isP2Controllable = isOnline && online.myIndex === 1
            if (isP2Controllable) {
              // Interactive toggle for P2 in online play
              const readDisabled = animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || (isOnline && online.pendingMove)
              const toggle = () => { if (!readDisabled) { playMenuClick(); setP1ReadActive(r => !r) } }
              return (
                <div
                  role="switch"
                  aria-checked={p1ReadActive}
                  tabIndex={0}
                  onClick={toggle}
                  onTouchStart={e => { e.preventDefault(); toggle() }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
                  style={{
                    position: 'relative', marginTop: 6, marginLeft: 'auto',
                    width: isMobile ? '100%' : 260, height: 36, borderRadius: 18,
                    background: '#111', border: '2px solid #555',
                    display: 'flex', alignItems: 'center',
                    opacity: readDisabled ? 0.45 : 1,
                    cursor: readDisabled ? 'not-allowed' : 'pointer',
                    userSelect: 'none', flexShrink: 0, boxSizing: 'border-box',
                    touchAction: 'none',
                  }}
                >
                  <div style={{ flex: 1, textAlign: 'center', fontSize: isMobile ? 10 : 12, fontWeight: 'bold', letterSpacing: '1.5px', color: '#4f4' }}>ON</div>
                  <div style={{ flex: 1, textAlign: 'center', fontSize: isMobile ? 10 : 12, fontWeight: 'bold', letterSpacing: '1.5px', color: '#f44' }}>OFF</div>
                  <div style={{
                    position: 'absolute', top: 2, left: 4,
                    width: 'calc(50% - 6px)', height: 28, borderRadius: 14,
                    background: '#888',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isMobile ? 10 : 13, fontWeight: 'bold', letterSpacing: '1.5px', color: '#161616',
                    boxShadow: '0 0 6px rgba(255,255,255,0.15)',
                    transform: p1ReadActive ? 'translateX(calc(100% + 4px))' : 'translateX(0)',
                    transition: 'transform 0.22s ease',
                    pointerEvents: 'none',
                  }}>READ</div>
                </div>
              )
            }
            // Passive indicator showing P2's last read state (offline/CPU)
            const p2ReadOn = lastReads.p2 !== 'none' && (animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns)
            return (
              <div style={{
                position: 'relative', marginTop: 6, marginLeft: 'auto',
                width: isMobile ? '100%' : 260, height: 36, borderRadius: 18,
                background: '#111', border: '2px solid #555',
                display: 'flex', alignItems: 'center',
                userSelect: 'none', flexShrink: 0, boxSizing: 'border-box',
              }}>
                <div style={{ flex: 1, textAlign: 'center', fontSize: isMobile ? 10 : 12, fontWeight: 'bold', letterSpacing: '1.5px', color: '#4f4' }}>ON</div>
                <div style={{ flex: 1, textAlign: 'center', fontSize: isMobile ? 10 : 12, fontWeight: 'bold', letterSpacing: '1.5px', color: '#f44' }}>OFF</div>
                <div style={{
                  position: 'absolute', top: 2, left: 4,
                  width: 'calc(50% - 6px)', height: 28, borderRadius: 14,
                  background: '#888',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isMobile ? 10 : 13, fontWeight: 'bold', letterSpacing: '1.5px', color: '#161616',
                  boxShadow: '0 0 6px rgba(255,255,255,0.15)',
                  transform: p2ReadOn ? 'translateX(calc(100% + 4px))' : 'translateX(0)',
                  transition: 'transform 0.22s ease',
                  pointerEvents: 'none',
                }}>READ</div>
              </div>
            )
          })()}
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
          {/* Echo charge bar — Sable P2 */}
          {state.p2.hasSable && (
            <div className="char-bar-wrap" style={{ marginTop: 5, width: 280, marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, color: (state.p2.sableEchoCharge ?? 0) > 0 ? '#9933ff' : '#444', fontWeight: 'bold', minWidth: 28 }}>
                  {state.p2.sableEchoCharge ?? 0}
                </div>
                <div style={{ flex: 1, height: 8, background: '#222', border: '1px solid #444', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min((state.p2.sableEchoCharge ?? 0) / 50 * 100, 100)}%`,
                    background: (state.p2.sableEchoCharge ?? 0) >= 50 ? '#fff' : '#9933ff',
                    transition: 'width 0.2s ease',
                    boxShadow: (state.p2.sableEchoCharge ?? 0) > 0 ? '0 0 6px #9933ff' : 'none',
                  }} />
                </div>
                <div style={{ fontSize: 9, color: '#9933ff', fontWeight: 'bold', letterSpacing: 1, whiteSpace: 'nowrap' }}>ECHO CHARGE</div>
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
          {/* Evade chance bar — Vael Solace P2 */}
          {state.p2.hasVael && state.p2.vaelEvadeUnlocked && (
            <div className="char-bar-wrap" style={{ marginTop: 5, width: 280, marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 10, color: '#00ccff', fontWeight: 'bold', minWidth: 36 }}>
                  {Math.round(vaelEvadeChance(dispP2Hp, state.p2.maxHp) * 100)}%
                </div>
                <div style={{ flex: 1, height: 8, background: '#222', border: '1px solid #444', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(vaelEvadeChance(dispP2Hp, state.p2.maxHp) / 0.25) * 100}%`,
                    background: vaelEvadeChance(dispP2Hp, state.p2.maxHp) >= 0.25 ? '#fff' : '#00ccff',
                    transition: 'width 0.4s ease',
                    boxShadow: '0 0 6px #00ccff',
                    marginLeft: 'auto',
                  }} />
                </div>
                <div style={{ fontSize: 9, color: '#00ccff', fontWeight: 'bold', letterSpacing: 1, whiteSpace: 'nowrap' }}>EVADE</div>
              </div>
            </div>
          )}
          {/* Ability progress wheels — Vael Solace P2 */}
          {state.p2.hasVael && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280, marginLeft: 'auto' }}>
              <VaelAbilityWheel count={state.p2.vaelDisablesLanded}   unlocked={state.p2.jinxUnlocked}       label="JINX"  maxCount={2} tip={TIPS.vaelJinx} />
              <VaelAbilityWheel count={state.p2.vaelNormalGoodReads}  unlocked={state.p2.vaelRegenUnlocked}  label="Regen" maxCount={3} tip={TIPS.vaelRegen} />
              <VaelAbilityWheel count={state.p2.vaelToggledGoodReads} unlocked={state.p2.vaelEvadeUnlocked}  label="Evade" maxCount={2} tip={TIPS.vaelEvade} />
            </div>
          )}
          {/* Ability progress wheels — Wrack P2 */}
          {state.p2.hasWrack && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280, marginLeft: 'auto' }}>
              <WrackAbilityWheel count={state.p2.wrackChainTriggers} unlocked={state.p2.festeringUnlocked} label="FESTER" maxCount={4} tip={TIPS.wrackFestering} />
              <WrackAbilityWheel count={state.p2.wrackCycleTriggers} unlocked={state.p2.witherUnlocked}    label="WITHER"    maxCount={4} tip={TIPS.wrackWither} />
              <WrackAbilityWheel count={state.p2.wrackReadTriggers}  unlocked={state.p2.gallUnlocked}      label="GALL"      maxCount={4} tip={TIPS.wrackGall} />
            </div>
          )}
          {/* Ability progress wheels — Harrox P2 */}
          {state.p2.hasHarrox && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280, marginLeft: 'auto' }}>
              <HarroxAbilityWheel count={state.p2.harroxFury} unlocked={state.p2.harroxIronSkinUnlocked} label="IRON SKIN" maxCount={6}  tip={{ ...TIPS.harroxIronSkin, stat: `FURY: ${state.p2.harroxFury}` }} />
              <HarroxAbilityWheel count={state.p2.harroxFury} unlocked={state.p2.harroxFrenzyUnlocked}   label="FRENZY"    maxCount={12} tip={{ ...TIPS.harroxFrenzy,   stat: `FURY: ${state.p2.harroxFury}` }} />
              <HarroxAbilityWheel count={state.p2.harroxFury} unlocked={state.p2.harroxMassacreUnlocked} label="MASSACRE"  maxCount={18} tip={{ ...TIPS.harroxMassacre, stat: `FURY: ${state.p2.harroxFury}` }} />
            </div>
          )}
          {/* Ability progress wheels — Sable */}
          {state.p2.hasSable && (
            <div className="ability-wheels-row" style={{ display: 'flex', gap: 8, marginTop: 8, width: 280, marginLeft: 'auto' }}>
              <SableAbilityWheel mode="count"     count={state.p2.sableHitsTaken}   unlocked={state.p2.sableResonanceUnlocked}  label="RESONANCE"  maxCount={3} tip={{ ...TIPS.sableResonance,  stat: `Hits taken: ${state.p2.sableHitsTaken ?? 0}` }} />
              <SableAbilityWheel mode="count"     count={state.p2.sableEchoBursts}  unlocked={state.p2.sableRefractionUnlocked} label="REFRACTION" maxCount={2} tip={{ ...TIPS.sableRefraction, stat: `Echo bursts: ${state.p2.sableEchoBursts ?? 0}` }} />
              <SableAbilityWheel mode="nullfield" count={state.p2.sableGoodReads ?? 0} maxCount={3} unlocked={state.p2.sableNullfieldUnlocked} nullfieldReady={state.p2.sableNullfieldReady} nullfieldUsed={state.p2.sableNullfieldUsed} label="NULLFIELD" tip={{ ...TIPS.sableNullfield, stat: state.p2.sableNullfieldUsed ? 'SPENT' : state.p2.sableNullfieldUnlocked ? 'ARMED — reflects next lethal hit' : `Good Reads: ${state.p2.sableGoodReads ?? 0}/3` }} />
            </div>
          )}
          {/* Stat-up flashes */}
          <div style={{ minHeight: 14, marginTop: 2, textAlign: 'right' }}>
            {statUpFlashes.p2ke && <div key={`p2ke-${statUpFlashes.key}`} className="stat-up">CRIT CHANCE UP!</div>}
            {statUpFlashes.p2nb && <div key={`p2nb-${statUpFlashes.key}`} className="stat-up">EVASION CHANCE UP!</div>}
          </div>
          {/* DEV: cycleSet rolling window */}
          {showCycleHistory && (
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#555', marginTop: 4, textAlign: 'right' }}>
              [{(state.p2.cycleSet ?? []).map((m, i) => (
                <span key={i} style={{ color: m === 'AT' ? '#7df' : m === 'SP' ? '#c8f' : '#aaa', marginRight: 2 }}>{m}</span>
              ))}] :cycle
            </div>
          )}
        </div>
      </div>

      {/* Between-turns effect strip */}
      <div style={{ minHeight: 52, marginBottom: 8, display: 'flex', alignItems: 'center' }}>
        {activeEffect && activeEffect.type !== 'announce' && renderEffectBanner(activeEffect)}
      </div>

      {state.log.length > 0 && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          {[...state.log].reverse().map(entry => (
            <LogRow key={entry.turn} entry={entry} p1Name={p1Name} p2Name={p2Name} p1Char={state.p1Character} p2Char={state.p2Character} />
          ))}
        </div>
      )}

      <div className="move-btn-row" style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
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

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {isOnline ? (
          <>
            <button onClick={() => { playMenuClick(); handleOnlineRematch() }} disabled={!gameOver || animating || ultAnimating || collapseAnimating || betweenTurns}>Rematch</button>
            <button onClick={() => { playMenuClick(); handleOnlineLeave() }} style={{ fontSize: 10, color: '#aaa' }}>Leave</button>
          </>
        ) : (
          <>
            <button onClick={() => { playMenuClick(); handleReset() }} disabled={animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns}>Reset</button>
            <button onClick={() => { playMenuClick(); handleChangeChars() }} style={{ fontSize: 10, color: '#aaa' }}>Change</button>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <span style={{ fontSize: 11, color: '#666', letterSpacing: 1 }}>♪</span>
        <input
          type="range" min="0" max="1" step="0.01"
          value={bgmVolume}
          onChange={e => setBgmVolume(parseFloat(e.target.value))}
          style={{ width: 100, accentColor: '#5af', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 11, color: '#555', width: 28 }}>{Math.round(bgmVolume * 100)}%</span>
      </div>
      <div style={{ marginTop: 10, fontFamily: 'monospace' }}>
        {!devUnlocked && !devPrompt && (
          <button
            onClick={() => { setDevPrompt(true); setDevInput(''); setDevError(false) }}
            style={{ fontSize: 10, color: '#333', background: 'none', border: '1px solid #222', padding: '4px 10px', cursor: 'pointer', letterSpacing: 1 }}
          >
            DEV
          </button>
        )}
        {devPrompt && !devUnlocked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              autoFocus
              type="password"
              value={devInput}
              onChange={e => { setDevInput(e.target.value); setDevError(false) }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (devInput === 'angry-chicken') { setDevUnlocked(true); setDevPrompt(false) }
                  else { setDevError(true); setDevInput('') }
                }
                if (e.key === 'Escape') { setDevPrompt(false); setDevInput('') }
              }}
              placeholder="password"
              style={{ fontSize: 10, background: '#111', border: `1px solid ${devError ? '#f44' : '#333'}`, color: '#aaa', padding: '4px 8px', fontFamily: 'monospace', width: 120 }}
            />
            <button
              onClick={() => {
                if (devInput === 'angry-chicken') { setDevUnlocked(true); setDevPrompt(false) }
                else { setDevError(true); setDevInput('') }
              }}
              style={{ fontSize: 10, color: '#555', background: 'none', border: '1px solid #333', padding: '4px 8px', cursor: 'pointer', fontFamily: 'monospace' }}
            >
              OK
            </button>
          </div>
        )}
        {devUnlocked && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 10px', border: '1px solid #2a2a2a', background: '#0a0a0a' }}>
            <div style={{ fontSize: 9, color: '#444', letterSpacing: 2, marginBottom: 2 }}>DEV TOOLS</div>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
              <input
                type="checkbox"
                checked={cpuAlwaysBlock}
                onChange={e => setCpuAlwaysBlock(e.target.checked)}
                style={{ accentColor: '#f80' }}
              />
              <span style={{ color: cpuAlwaysBlock ? '#f80' : '#555' }}>CPU always block</span>
            </label>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
              <input
                type="checkbox"
                checked={showCycleHistory}
                onChange={e => setShowCycleHistory(e.target.checked)}
                style={{ accentColor: '#f80' }}
              />
              <span style={{ color: showCycleHistory ? '#f80' : '#555' }}>Show cycle history</span>
            </label>
            <button
              onClick={handleUlt}
              disabled={animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || gameOver}
              style={{ fontSize: 10, color: '#f80', background: 'none', border: '1px solid #f80', padding: '4px 8px', cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1, opacity: (animating || ultAnimating || p2UltAnimating || collapseAnimating || betweenTurns || gameOver) ? 0.35 : 1 }}
            >
              TRIGGER ULT
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  )
}
