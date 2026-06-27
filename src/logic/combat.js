export const AT_DAMAGE = 12
export const SP_DAMAGE = 15
const CHIP_PERCENT   = 0.20
const READ_MULTIPLIER = 1.5

const OUTCOMES = {
  AT_SP: { outcome: 'AT_WINS_CLEAN', winner: 'p1', loser: 'p2' },
  SP_AT: { outcome: 'AT_WINS_CLEAN', winner: 'p2', loser: 'p1' },
  SP_BL: { outcome: 'SP_WINS_CLEAN', winner: 'p1', loser: 'p2' },
  BL_SP: { outcome: 'SP_WINS_CLEAN', winner: 'p2', loser: 'p1' },
  AT_BL: { outcome: 'BL_CHIP',       winner: 'p2', loser: 'p2' },
  BL_AT: { outcome: 'BL_CHIP',       winner: 'p1', loser: 'p1' },
}

export function resolveTurn(p1Move, p2Move) {
  if (p1Move === p2Move) {
    return { outcome: 'TIE', winner: 'tie', loser: 'tie' }
  }
  return OUTCOMES[`${p1Move}_${p2Move}`]
}

export function calculateDamage({ outcome, loser, winner, p1Move, p2Move, p1Read, p2Read, p1AtDmg = AT_DAMAGE, p2AtDmg = AT_DAMAGE, p1SpDmg = SP_DAMAGE, p2SpDmg = SP_DAMAGE, p1FlowState = false, p2FlowState = false, p1ZenState = false, p2ZenState = false, p1GodModeState = false, p2GodModeState = false }) {
  function readByMove(move) {
    return p1Move === move ? p1Read : p2Read
  }
  function flowOf(player) { return player === 'p1' ? p1FlowState : p2FlowState }
  // Tier helper: returns the highest active flow tier for a player
  function tierOf(player) {
    const god  = player === 'p1' ? p1GodModeState : p2GodModeState
    const zen  = player === 'p1' ? p1ZenState      : p2ZenState
    const flow = player === 'p1' ? p1FlowState     : p2FlowState
    return god ? 'god' : zen ? 'zen' : flow ? 'flow' : 'none'
  }
  function flowMultFor(player) {
    const t = tierOf(player)
    return t === 'god' ? 2.25 : t === 'zen' ? 2.00 : t === 'flow' ? 1.75 : 1.0
  }
  function tieMult(player) {
    const t = tierOf(player)
    return t === 'god' ? 2.00 : t === 'zen' ? 1.75 : t === 'flow' ? 1.50 : 1.0
  }
  function blTieFlatDmg(player) {
    const t = tierOf(player)
    return t === 'god' ? 45 : t === 'zen' ? 30 : t === 'flow' ? 15 : 0
  }

  // ── TIE ──────────────────────────────────────────────────────────────────
  if (outcome === 'TIE') {
    const p1Reads = p1Read !== 'none'
    const p2Reads = p2Read !== 'none'

    if (p1Move === 'BL') {
      // BL vs BL: flow-tier players deal flat damage; others use Read-toggle formula
      const p1Flat = blTieFlatDmg('p1')
      const p2Flat = blTieFlatDmg('p2')
      const p1Dmg = p1Flat > 0 ? p1Flat : (p1Reads ? Math.ceil(p2AtDmg * CHIP_PERCENT * tieMult('p2')) : 0)
      const p2Dmg = p2Flat > 0 ? p2Flat : (p2Reads ? Math.ceil(p1AtDmg * CHIP_PERCENT * tieMult('p1')) : 0)
      return { p1Damage: p1Dmg, p2Damage: p2Dmg }
    }

    const p1Out = (p1Move === 'AT' ? p1AtDmg : p1SpDmg) * tieMult('p1')
    const p2Out = (p2Move === 'AT' ? p2AtDmg : p2SpDmg) * tieMult('p2')

    if (!p1Reads && !p2Reads) return { p1Damage: Math.floor(p2Out), p2Damage: Math.floor(p1Out) }
    if (p1Reads && p2Reads) {
      return { p1Damage: Math.floor(p2Out * 0.75), p2Damage: Math.floor(p1Out * 0.75) }
    }
    return p1Reads
      ? { p1Damage: Math.floor(p2Out * 1.25), p2Damage: Math.floor(p1Out * 0.75) }
      : { p1Damage: Math.floor(p2Out * 0.75), p2Damage: Math.floor(p1Out * 1.25) }
  }

  // ── BL_CHIP ───────────────────────────────────────────────────────────────
  if (outcome === 'BL_CHIP') {
    const blPlayer = p1Move === 'BL' ? 'p1' : 'p2'
    const goodRead = readByMove('BL') === 'good' || flowOf(blPlayer)
    const badRead  = readByMove('AT') === 'bad'
    const atDmg    = p1Move === 'AT' ? p1AtDmg : p2AtDmg

    if (goodRead || badRead) {
      const amt    = Math.floor(atDmg * (goodRead ? 2.0 : 1.0) * (badRead ? 1.5 : 1.0))
      const atIsP1 = p1Move === 'AT'
      return { p1Damage: atIsP1 ? amt : 0, p2Damage: atIsP1 ? 0 : amt }
    }

    const chip = Math.ceil(atDmg * CHIP_PERCENT)
    return {
      p1Damage: loser === 'p1' ? chip : 0,
      p2Damage: loser === 'p2' ? chip : 0,
    }
  }

  // ── AT_WINS_CLEAN / SP_WINS_CLEAN ─────────────────────────────────────────
  const atWins = outcome === 'AT_WINS_CLEAN'
  const base   = atWins ? (winner === 'p1' ? p1AtDmg : p2AtDmg) : (winner === 'p1' ? p1SpDmg : p2SpDmg)

  const winnerMove = atWins ? 'AT' : 'SP'
  const loserMove  = atWins ? 'SP' : 'BL'
  const goodMult   = readByMove(winnerMove) === 'good' ? 2.0 : 1.0
  const badMult    = readByMove(loserMove)  === 'bad'  ? 1.5 : 1.0
  const flowMult   = flowMultFor(winner)
  const amount     = Math.floor(base * goodMult * badMult * flowMult)

  return {
    p1Damage: loser === 'p1' ? amount : 0,
    p2Damage: loser === 'p2' ? amount : 0,
  }
}

export function createInitialState(p1Char = null, p2Char = null) {
  const p1Hp = p1Char?.hp ?? 300
  const p2Hp = p2Char?.hp ?? 300
  const makePlayer = (hp, baseAtDamage, baseSpDamage, critChance, hasDodge, hasMourne, hasVael, hasWrack, weight, cls) => ({
    hp, maxHp: hp, baseAtDamage, baseSpDamage, critChance,
    weight: weight ?? 'medium',
    class:  cls    ?? 'warrior',
    hasDodge: !!hasDodge, dodgeStreak: 0,
    atChain: 0, spChain: 0, atDmgBuff: 0, spDmgBuff: 0,
    cycleSet: [], cycleLit: {}, litMoves: { at: false, bl: false, sp: false },
    ultReadAchieved: false, ultChainAchieved: false, ultGoodReads: 0,
    pendingLifesteal: 0,
    ultimateReady: false, flowState: false, zenState: false, godModeState: false,
    consecutiveGoodReads: 0, bleeds: [], poison: 0,
    // Cairan ability trackers (all players carry these; only used when hasDodge)
    damageDealtCount: 0, successfulDodgeCount: 0, critHitsDealt: 0,
    keenEyeUnlocked: false, nimbleUnlocked: false, bloodletterUnlocked: false,
    keenEyeChance: 0.10, nimbleChance: 0,
    // Mourne ability trackers (all players carry these; only used when hasMourne)
    hasMourne: !!hasMourne,
    forceFieldAccumulated: 0,
    ffTotalAbsorbed: 0,
    selfDamageTotal: 0,
    selfDamageTaken: 0,
    goodToggledSpReads: 0,
    siphonUnlocked: false,
    overloadUnlocked: false,
    leechUnlocked: false,
    overloadActive: false,
    // Vael Solace ability trackers (all players carry these; only used when hasVael)
    hasVael: !!hasVael,
    disabledMove: null,
    vaelDisablesLanded: 0,
    jinxUnlocked: false,
    vaelNormalGoodReads: 0,
    vaelToggledGoodReads: 0,
    vaelRegenUnlocked: false,
    vaelEvadeUnlocked: false,
    // Wrack ability trackers (all players carry these; only used when hasWrack)
    hasWrack: !!hasWrack,
    wrackChainTriggers: 0,    // counts times AT or SP chain reached 3+ (FESTERING unlock)
    wrackCycleTriggers: 0,    // counts cycle completions (WITHER unlock)
    wrackReadTriggers: 0,     // counts toggled Good Reads with AT or SP (GALL unlock)
    festeringUnlocked: false,
    witherUnlocked: false,
    gallUnlocked: false,
    wrackPoisonDealt: 0,
  })
  return {
    p1: makePlayer(p1Hp, p1Char?.atDamage ?? AT_DAMAGE, p1Char?.spDamage ?? SP_DAMAGE, p1Char?.critChance ?? 0, p1Char?.hasDodge, p1Char?.hasMourne, p1Char?.hasVael, p1Char?.hasWrack, p1Char?.weight, p1Char?.class),
    p2: makePlayer(p2Hp, p2Char?.atDamage ?? AT_DAMAGE, p2Char?.spDamage ?? SP_DAMAGE, p2Char?.critChance ?? 0, p2Char?.hasDodge, p2Char?.hasMourne, p2Char?.hasVael, p2Char?.hasWrack, p2Char?.weight, p2Char?.class),
    p1Character: p1Char,
    p2Character: p2Char,
    lastTurn: null,
    log: [],
  }
}

function classifyRead(readActive, playerKey, winner) {
  if (!readActive) return 'none'
  return winner === playerKey ? 'good' : 'bad'
}

function updateChains(player, move, readActive) {
  const atPlain = move === 'AT' && !readActive
  const spPlain = move === 'SP' && !readActive
  const atChain = atPlain ? player.atChain + 1 : 0
  const spChain = spPlain ? player.spChain + 1 : 0
  return {
    ...player,
    atChain,
    spChain,
    atDmgBuff: (atPlain && atChain >= 3) ? Math.floor(player.baseAtDamage * (1.15 ** (atChain - 1))) : 0,
    spDmgBuff: (spPlain && spChain >= 2) ? Math.floor(player.baseSpDamage * (1.1  ** (spChain - 1))) : 0,
  }
}

function updateFlowState(player, myRead, opponentRead) {
  if (myRead === 'bad' || opponentRead === 'good') {
    return { flowState: false, zenState: false, godModeState: false, consecutiveGoodReads: 0 }
  }
  if (myRead === 'good') {
    const newCount = player.consecutiveGoodReads + 1
    const newFlowState = player.flowState || newCount >= 2
    return {
      flowState:    newFlowState,
      zenState:     player.zenState || (player.flowState) || newCount >= 3,
      godModeState: player.godModeState || (player.zenState),
      consecutiveGoodReads: newCount,
    }
  }
  return {
    flowState:    player.flowState,
    zenState:     player.zenState,
    godModeState: player.godModeState,
    consecutiveGoodReads: 0,
  }
}

function updateCycle(player, move, readActive) {
  if (readActive) return {}

  const { cycleSet, cycleLit } = player

  // Rolling window: always append move, trim to last 3
  const newCycleSet = [...cycleSet, move].slice(-3)

  // Complete when the last 3 Read-off moves are all 3 unique values
  if (new Set(newCycleSet).size === 3) {
    const newCycleLit = { ...cycleLit, [move]: true }
    return {
      cycleSet: [],
      cycleLit: newCycleLit,
      litMoves: { at: !!newCycleLit.AT, bl: !!newCycleLit.BL, sp: !!newCycleLit.SP },
    }
  }

  return { cycleSet: newCycleSet }
}

// ── BL vs BL Tiebreaker ───────────────────────────────────────────────────────
const WEIGHT_RANK = { light: 0, medium: 1, heavy: 2 }  // lower = wins
const CLASS_RANK  = { warrior: 0, mage: 1, tank: 2 }   // lower = wins

function resolveBLTie(p1, p2, p1AtDmg, p2AtDmg) {
  const p1w = WEIGHT_RANK[p1.weight] ?? 1
  const p2w = WEIGHT_RANK[p2.weight] ?? 1
  const p1c = CLASS_RANK[p1.class]   ?? 1
  const p2c = CLASS_RANK[p2.class]   ?? 1

  let winner, reason
  if (p1w !== p2w) {
    winner = p1w < p2w ? 'p1' : 'p2'
    reason = 'weight'
  } else if (p1c !== p2c) {
    winner = p1c < p2c ? 'p1' : 'p2'
    reason = 'class'
  } else if (p1.hp !== p2.hp) {
    winner = p1.hp < p2.hp ? 'p1' : 'p2'
    reason = 'hp'
  } else {
    winner = Math.random() < 0.5 ? 'p1' : 'p2'
    reason = 'coin'
  }

  const loser  = winner === 'p1' ? 'p2' : 'p1'
  const damage = Math.floor(0.5 * (winner === 'p1' ? p1AtDmg : p2AtDmg))
  return { winner, loser, reason, damage }
}

// ── Shared ULT damage calculator (used by both execution and live preview) ───
export function calcUltDamage(player) {
  if (player.hasMourne) {
    const ff     = player.ffTotalAbsorbed  ?? 0  // total FF absorbed over whole match
    const self   = player.selfDamageTotal  ?? 0
    const raw    = ff + self
    const actual = player.overloadActive ? Math.floor(raw * 1.75) : raw
    return { raw, actual }
  }
  if (player.hasVael) {
    // MIND BLAST: disables × Good Clashes (non-toggled wins) accumulated this match
    const disables = player.vaelDisablesLanded  ?? 0
    const clashes  = player.vaelNormalGoodReads ?? 0
    const actual   = disables * clashes
    return { raw: actual, actual }
  }
  if (player.hasWrack) {
    const poisonDealt = player.wrackPoisonDealt ?? 0
    return { raw: poisonDealt, actual: poisonDealt }
  }
  // Cairan / default: ASSASSINATE = 2×AT + 2×SP
  const baseAt = player.baseAtDamage ?? AT_DAMAGE
  const baseSp = player.baseSpDamage ?? SP_DAMAGE
  const atDmg  = Math.max(player.atDmgBuff ?? 0, baseAt)
  const spDmg  = Math.max(player.spDmgBuff ?? 0, baseSp)
  const actual = atDmg * 2 + spDmg * 2
  return { raw: actual, actual }
}

export function processCollapse(gameState, ultUser) {
  const defenderKey = ultUser === 'p1' ? 'p2' : 'p1'
  const attacker = gameState[ultUser]
  const defender = gameState[defenderKey]

  const ffAbsorbed  = attacker.ffTotalAbsorbed ?? 0
  const selfDmg     = attacker.selfDamageTotal ?? 0
  const { raw: rawDamage, actual: actualDamage } = calcUltDamage(attacker)

  const newDefenderHp = Math.max(0, defender.hp - actualDamage)
  const healAmount    = Math.min(attacker.maxHp - attacker.hp, actualDamage)
  const newAttackerHp = Math.min(attacker.maxHp, attacker.hp + healAmount)

  const entry = {
    turn: gameState.log.length + 1,
    isUlt: true,
    isCollapse: true,
    ultUser,
    ffAbsorbed,
    selfDmg,
    rawDamage,
    actualDamage,
    healAmount,
    overloadBoosted: !!attacker.overloadActive,
    p1Hp: ultUser === 'p1' ? newAttackerHp : newDefenderHp,
    p2Hp: ultUser === 'p2' ? newAttackerHp : newDefenderHp,
  }

  return {
    ...gameState,
    [ultUser]: {
      ...attacker,
      hp: newAttackerHp,
      ultimateReady: false,
      cycleLit: {},
      cycleSet: [],
      litMoves: { at: false, bl: false, sp: false },
      ultReadAchieved: false,
      ultGoodReads: 0,
      ultChainAchieved: false,
    },
    [defenderKey]: { ...defender, hp: newDefenderHp },
    lastTurn: entry,
    log: [...gameState.log, entry],
  }
}

function processVaelUlt(gameState, ultUser) {
  const defenderKey = ultUser === 'p1' ? 'p2' : 'p1'
  const attacker = gameState[ultUser]
  const defender = gameState[defenderKey]

  // Damage = vaelDisablesLanded × vaelNormalGoodReads (Good Clashes); resets disables after use.
  const disables = attacker.vaelDisablesLanded  ?? 0
  const clashes  = attacker.vaelNormalGoodReads ?? 0
  const { raw: rawDamage, actual: actualDamage } = calcUltDamage(attacker)

  const newDefenderHp = Math.max(0, defender.hp - actualDamage)

  const entry = {
    turn: gameState.log.length + 1,
    isUlt: true,
    isVaelUlt: true,
    ultUser,
    rawDamage,
    actualDamage,
    healAmount: 0,
    vaelDisablesLanded: disables,
    vaelGoodClashes: clashes,
    p1Hp: ultUser === 'p1' ? attacker.hp : newDefenderHp,
    p2Hp: ultUser === 'p2' ? attacker.hp : newDefenderHp,
  }

  return {
    ...gameState,
    [ultUser]: {
      ...attacker,
      ultimateReady: false,
      cycleLit: {},
      cycleSet: [],
      litMoves: { at: false, bl: false, sp: false },
      ultReadAchieved: false,
      ultGoodReads: 0,
      ultChainAchieved: false,
      vaelDisablesLanded: 0,
    },
    [defenderKey]: { ...defender, hp: newDefenderHp },
    lastTurn: entry,
    log: [...gameState.log, entry],
  }
}

function processWrackUlt(gameState, ultUser) {
  const defenderKey = ultUser === 'p1' ? 'p2' : 'p1'
  const attacker = gameState[ultUser]
  const defender = gameState[defenderKey]
  const { raw: rawDamage, actual: actualDamage } = calcUltDamage(attacker)
  const newDefenderHp = Math.max(0, defender.hp - actualDamage)
  const entry = {
    turn: gameState.log.length + 1,
    isUlt: true,
    isWrackUlt: true,
    ultUser,
    rawDamage,
    actualDamage,
    healAmount: 0,
    wrackPoisonDealt: attacker.wrackPoisonDealt ?? 0,
    p1Hp: ultUser === 'p1' ? attacker.hp : newDefenderHp,
    p2Hp: ultUser === 'p2' ? attacker.hp : newDefenderHp,
  }
  return {
    ...gameState,
    [ultUser]: {
      ...attacker,
      ultimateReady: false,
      cycleLit: {},
      cycleSet: [],
      litMoves: { at: false, bl: false, sp: false },
      ultReadAchieved: false,
      ultGoodReads: 0,
      ultChainAchieved: false,
    },
    [defenderKey]: { ...defender, hp: newDefenderHp },
    lastTurn: entry,
    log: [...gameState.log, entry],
  }
}

export function processUlt(gameState, ultUser) {
  if (gameState[ultUser]?.hasMourne) return processCollapse(gameState, ultUser)
  if (gameState[ultUser]?.hasVael)   return processVaelUlt(gameState, ultUser)
  if (gameState[ultUser]?.hasWrack)  return processWrackUlt(gameState, ultUser)
  const defenderKey = ultUser === 'p1' ? 'p2' : 'p1'
  const attacker = gameState[ultUser]
  const defender = gameState[defenderKey]

  const { raw: rawDamage, actual: actualDamage } = calcUltDamage(attacker)

  const bothUlting   = attacker.ultimateReady && defender.ultimateReady
  const healAmount   = bothUlting ? 0 : Math.floor(actualDamage * 0.5)

  const newDefenderHp = Math.max(0, defender.hp - actualDamage)
  const newAttackerHp = Math.min(attacker.maxHp ?? 300, attacker.hp + healAmount)

  const entry = {
    turn: gameState.log.length + 1,
    isUlt: true,
    ultUser,
    rawDamage,
    actualDamage,
    healAmount,
    p1Hp: ultUser === 'p1' ? newAttackerHp : newDefenderHp,
    p2Hp: ultUser === 'p2' ? newAttackerHp : newDefenderHp,
  }

  return {
    ...gameState,
    [ultUser]: {
      ...attacker,
      hp: newAttackerHp,
      ultimateReady: false,
      cycleLit: {},
      cycleSet: [],
      litMoves: { at: false, bl: false, sp: false },
      ultReadAchieved: false,
      ultGoodReads: 0,
      ultChainAchieved: false,
    },
    [defenderKey]: { ...defender, hp: newDefenderHp },
    lastTurn: entry,
    log: [...gameState.log, entry],
  }
}

// Returns an array of steps: { player, type, damage/heal, stateAfter }
export function resolveBeforeTurn(gameState) {
  const steps = []
  let state = gameState

  // ── Lit AT lifesteal ─────────────────────────────────────────────────────
  for (const playerKey of ['p1', 'p2']) {
    const player = state[playerKey]
    const ls = player.pendingLifesteal ?? 0
    if (ls > 0) {
      const newHp = Math.min(player.maxHp, player.hp + ls)
      state = { ...state, [playerKey]: { ...state[playerKey], hp: newHp, pendingLifesteal: 0 } }
      steps.push({ player: playerKey, type: 'lit_at_lifesteal', heal: ls, stateAfter: state })
    }
  }

  // ── Bleeds ────────────────────────────────────────────────────────────────
  for (const playerKey of ['p1', 'p2']) {
    const player = state[playerKey]
    if (!player.bleeds || player.bleeds.length === 0) continue

    player.bleeds.forEach((bleed, idx) => {
      const dmg = bleed.currentDamage
      state = {
        ...state,
        [playerKey]: {
          ...state[playerKey],
          hp: Math.max(0, state[playerKey].hp - dmg),
          bleeds: state[playerKey].bleeds.map((b, i) =>
            i === idx ? { ...b, currentDamage: b.currentDamage + 1 } : b
          ),
        },
      }
      steps.push({ player: playerKey, type: 'bleed', damage: dmg, stateAfter: state })
    })
  }

  // ── Poison (Wrack's Rot) ──────────────────────────────────────────────────
  // Ticks for damage equal to the current value, then decrements by 1.
  // Clears automatically once it reaches 0. Stacking when reapplied is handled
  // in processTurn, not here.
  for (const playerKey of ['p1', 'p2']) {
    const poison = state[playerKey].poison ?? 0
    if (poison <= 0) continue
    state = {
      ...state,
      [playerKey]: {
        ...state[playerKey],
        hp: Math.max(0, state[playerKey].hp - poison),
        poison: poison - 1,
      },
    }
    steps.push({ player: playerKey, type: 'poison', damage: poison, stateAfter: state })
    const opponentKey = playerKey === 'p1' ? 'p2' : 'p1'
    if (state[opponentKey].hasWrack) {
      state = {
        ...state,
        [opponentKey]: {
          ...state[opponentKey],
          wrackPoisonDealt: (state[opponentKey].wrackPoisonDealt ?? 0) + poison,
        },
      }
    }
  }

  // ── Mourne between-turns effects ──────────────────────────────────────────
  // Order per spec: FF payback, self-damage, Siphon, Leech (per player)
  const pendingMourneUnlocks = []  // { name, playerKey } — announced after all effects

  for (const playerKey of ['p1', 'p2']) {
    if (!state[playerKey].hasMourne) continue
    const opponentKey = playerKey === 'p1' ? 'p2' : 'p1'
    const mourneData  = playerKey === 'p1' ? state.lastTurn?.p1MourneData : state.lastTurn?.p2MourneData
    if (!mourneData) continue

    const { spDealt, atDealt, atWasLit, leechActive, totalDealt } = mourneData

    // Self-damage trigger: SP dealt damage, OR AT dealt damage while AT was not Lit
    const spD           = spDealt ?? 0
    const atD           = atDealt ?? 0
    const triggerAmount = spD > 0 ? spD : (atD > 0 && !atWasLit ? atD : 0)

    // 1. Force Field payback — fires when accumulated ≥ 10
    const ffAcc = state[playerKey].forceFieldAccumulated ?? 0
    if (ffAcc >= 10) {
      const ffDmg    = ffAcc
      const newOpHp  = Math.max(0, state[opponentKey].hp - ffDmg)
      // Check if Overload activates on the opponent from FF damage (if opponent is also Mourne)
      const opAfterOverload = (state[opponentKey].hasMourne && !state[opponentKey].overloadActive &&
        state[opponentKey].overloadUnlocked && newOpHp <= Math.ceil(state[opponentKey].maxHp * 0.30))
        ? { overloadActive: true } : {}
      state = {
        ...state,
        [playerKey]:  { ...state[playerKey], forceFieldAccumulated: 0 },
        [opponentKey]: { ...state[opponentKey], hp: newOpHp, ...opAfterOverload },
      }
      steps.push({ player: opponentKey, type: 'mourne_ff', damage: ffDmg, caster: playerKey, stateAfter: state })
    }

    // 2. Self-damage — fires when trigger source dealt damage and Leech is not suppressing it
    if (triggerAmount > 0 && !leechActive) {
      const selfDmg = Math.floor(triggerAmount * 0.10)
      if (selfDmg > 0) {
        const newHp              = Math.max(0, state[playerKey].hp - selfDmg)
        const newSelfDamageTotal = state[playerKey].selfDamageTotal + selfDmg
        const newSelfDamageTaken = state[playerKey].selfDamageTaken + 1
        const siphonUnlocked     = state[playerKey].siphonUnlocked  || newSelfDamageTaken >= 5
        const overloadUnlocked   = state[playerKey].overloadUnlocked || newSelfDamageTotal >= 10
        const newOverloadActive  = state[playerKey].overloadActive  ||
          (overloadUnlocked && newHp <= Math.ceil(state[playerKey].maxHp * 0.30))

        if (!state[playerKey].siphonUnlocked  && siphonUnlocked)  pendingMourneUnlocks.push({ name: 'siphon',  playerKey })
        if (!state[playerKey].overloadUnlocked && overloadUnlocked) pendingMourneUnlocks.push({ name: 'overload', playerKey })

        state = {
          ...state,
          [playerKey]: {
            ...state[playerKey],
            hp: newHp,
            selfDamageTotal: newSelfDamageTotal,
            selfDamageTaken: newSelfDamageTaken,
            siphonUnlocked,
            overloadUnlocked,
            overloadActive: newOverloadActive,
          },
        }
        steps.push({ player: playerKey, type: 'mourne_self', damage: selfDmg, stateAfter: state })
      }
    }

    // 3. Siphon heal — if unlocked, trigger source dealt damage, not Leech turn (Leech suppresses Siphon)
    if (state[playerKey].siphonUnlocked && triggerAmount > 0 && !leechActive) {
      const siphonHeal = Math.floor(triggerAmount * 0.25)
      if (siphonHeal > 0) {
        const newHp = Math.min(state[playerKey].maxHp, state[playerKey].hp + siphonHeal)
        state = { ...state, [playerKey]: { ...state[playerKey], hp: newHp } }
        steps.push({ player: playerKey, type: 'mourne_siphon', heal: siphonHeal, stateAfter: state })
      }
    }

    // 4. Leech heal — 100% of total damage dealt this turn; suppresses self-damage & Siphon
    const td = totalDealt ?? 0
    if (leechActive && td > 0) {
      const leechHeal = td
      const newHp = Math.min(state[playerKey].maxHp, state[playerKey].hp + leechHeal)
      state = { ...state, [playerKey]: { ...state[playerKey], hp: newHp } }
      steps.push({ player: playerKey, type: 'mourne_leech', heal: leechHeal, stateAfter: state })
    }
  }

  // Mourne unlock announcements — play after all between-turns effects
  for (const { name, playerKey } of pendingMourneUnlocks) {
    const prefix = playerKey === 'p2' ? 'ENEMY ' : ''
    const msg    = name === 'siphon' ? 'SIPHON UNLOCKED' : 'OVERLOAD UNLOCKED'
    steps.push({ type: 'announce', message: prefix + msg, stateAfter: null })
  }

  // ── Vael Solace regen ─────────────────────────────────────────────────────
  // Fires after all damage/bleed/Mourne effects are settled for the turn.
  for (const playerKey of ['p1', 'p2']) {
    const player = state[playerKey]
    if (!player.vaelRegenUnlocked || player.hp <= 0) continue
    const maxHp = player.maxHp ?? 1
    if (player.hp >= maxHp * 0.5) continue  // no regen at or above 50% HP
    // Below 50%: scales from 12.5% heal at 0 HP → 0% at 50% HP
    const healPct = 12.5 * (1 - player.hp / (maxHp * 0.5))
    const heal    = Math.floor((healPct / 100) * maxHp)
    if (heal <= 0) continue
    const newHp = Math.min(maxHp, player.hp + heal)
    state = { ...state, [playerKey]: { ...state[playerKey], hp: newHp } }
    steps.push({ player: playerKey, type: 'vael_regen', heal, stateAfter: state })
  }

  return steps
}

export function processTurn(gameState, p1Move, p2Move, p1ReadActive = false, p2ReadActive = false, options = {}) {
  const turnResult = resolveTurn(p1Move, p2Move)

  const p1Read = classifyRead(p1ReadActive, 'p1', turnResult.winner)
  const p2Read = classifyRead(p2ReadActive, 'p2', turnResult.winner)

  const p1FlowNow    = gameState.p1.flowState
  const p2FlowNow    = gameState.p2.flowState
  const p1ZenNow     = gameState.p1.zenState
  const p2ZenNow     = gameState.p2.zenState
  const p1GodModeNow = gameState.p1.godModeState
  const p2GodModeNow = gameState.p2.godModeState
  const p1FlowUpdate = updateFlowState(gameState.p1, p1Read, p2Read)
  const p2FlowUpdate = updateFlowState(gameState.p2, p2Read, p1Read)

  const newP1 = { ...updateChains(gameState.p1, p1Move, p1ReadActive), ...updateCycle(gameState.p1, p1Move, p1ReadActive), ...p1FlowUpdate }
  const newP2 = { ...updateChains(gameState.p2, p2Move, p2ReadActive), ...updateCycle(gameState.p2, p2Move, p2ReadActive), ...p2FlowUpdate }

  // ── Ultimate unlock: three sticky conditions (all must be achieved) ────────
  const p1UltGoodReads     = Math.min(3, (newP1.ultGoodReads ?? 0) + (p1ReadActive && p1Read === 'good' ? 1 : 0))
  const p2UltGoodReads     = Math.min(3, (newP2.ultGoodReads ?? 0) + (p2ReadActive && p2Read === 'good' ? 1 : 0))
  const p1UltReadAchieved  = p1UltGoodReads >= 3
  const p2UltReadAchieved  = p2UltGoodReads >= 3
  const p1UltChainAchieved = (newP1.ultChainAchieved ?? false) || newP1.atChain >= 3 || newP1.spChain >= 3
  const p2UltChainAchieved = (newP2.ultChainAchieved ?? false) || newP2.atChain >= 3 || newP2.spChain >= 3
  const p1AllLit = !!(newP1.cycleLit?.AT && newP1.cycleLit?.BL && newP1.cycleLit?.SP)
  const p2AllLit = !!(newP2.cycleLit?.AT && newP2.cycleLit?.BL && newP2.cycleLit?.SP)
  const p1UltimateReady = p1UltReadAchieved && p1UltChainAchieved && p1AllLit
  const p2UltimateReady = p2UltReadAchieved && p2UltChainAchieved && p2AllLit

  const p1LitMoves = newP1.litMoves ?? { at: false, bl: false, sp: false }
  const p2LitMoves = newP2.litMoves ?? { at: false, bl: false, sp: false }

  const p1AtDmg = newP1.atDmgBuff > newP1.baseAtDamage ? newP1.atDmgBuff : newP1.baseAtDamage
  const p2AtDmg = newP2.atDmgBuff > newP2.baseAtDamage ? newP2.atDmgBuff : newP2.baseAtDamage

  // SP buff + Overload multiplier
  const p1SpDmgBase = Math.max(newP1.spDmgBuff, newP1.baseSpDamage)
  const p2SpDmgBase = Math.max(newP2.spDmgBuff, newP2.baseSpDamage)
  const p1SpDmgEff  = (newP1.hasMourne && newP1.overloadActive) ? Math.floor(p1SpDmgBase * 1.75) : p1SpDmgBase
  const p2SpDmgEff  = (newP2.hasMourne && newP2.overloadActive) ? Math.floor(p2SpDmgBase * 1.75) : p2SpDmgBase

  const damage = calculateDamage({
    outcome: turnResult.outcome,
    loser:   turnResult.loser,
    winner:  turnResult.winner,
    p1Move,
    p2Move,
    p1Read,
    p2Read,
    p1AtDmg,
    p2AtDmg,
    p1SpDmg: p1SpDmgEff,
    p2SpDmg: p2SpDmgEff,
    p1FlowState:    p1FlowNow,
    p2FlowState:    p2FlowNow,
    p1ZenState:     p1ZenNow,
    p2ZenState:     p2ZenNow,
    p1GodModeState: p1GodModeNow,
    p2GodModeState: p2GodModeNow,
  })

  // Declare final damage before dodge/force-field blocks to avoid TDZ
  let finalP1Damage = damage.p1Damage
  let finalP2Damage = damage.p2Damage

  // ── BL vs BL tiebreaker ───────────────────────────────────────────────────
  let blTieResult = null
  const isBLTie = p1Move === 'BL' && p2Move === 'BL'
  if (isBLTie) {
    blTieResult = resolveBLTie(newP1, newP2, p1AtDmg, p2AtDmg)
    finalP1Damage = blTieResult.loser === 'p1' ? blTieResult.damage : 0
    finalP2Damage = blTieResult.loser === 'p2' ? blTieResult.damage : 0
  }

  // ── Lit SP: ×1.20 on SP wins (after calculateDamage, before crit) ────────
  if (turnResult.outcome === 'SP_WINS_CLEAN' && !isBLTie) {
    if (turnResult.winner === 'p1' && p1LitMoves.sp) finalP2Damage = Math.floor(finalP2Damage * 1.20)
    if (turnResult.winner === 'p2' && p2LitMoves.sp) finalP1Damage = Math.floor(finalP1Damage * 1.20)
  }

  // ── Wrack: SP wins vs BL → triangular poison stack instead of direct damage ─
  // Finds largest n where n*(n+1)/2 <= the SP damage that would have landed,
  // adds n to the opponent's poison stack, and zeroes the direct damage entirely.
  // Lit SP boost is intentionally included — a lit SP gives a bigger curse.
  function triangularN(dmg) {
    let n = 0
    while ((n + 1) * (n + 2) / 2 <= dmg) n++
    return n
  }
  if (turnResult.outcome === 'SP_WINS_CLEAN') {
    if (newP1.hasWrack && turnResult.winner === 'p1' && finalP2Damage > 0) {
      const n = triangularN(finalP2Damage)
      if (n > 0) {
        // p2Poison is declared later; use a pending value carried into the BL block below
        newP1._wrackSpPoison = (newP1._wrackSpPoison ?? 0) + n
      }
      finalP2Damage = 0
    }
    if (newP2.hasWrack && turnResult.winner === 'p2' && finalP1Damage > 0) {
      const n = triangularN(finalP1Damage)
      if (n > 0) {
        newP2._wrackSpPoison = (newP2._wrackSpPoison ?? 0) + n
      }
      finalP1Damage = 0
    }
  }
  // ── Wrack: SP vs SP tie → flat 4-stack poison instead of direct damage ───
  if (turnResult.outcome === 'TIE' && p1Move === 'SP') {
    if (newP1.hasWrack && finalP2Damage > 0) {
      newP1._wrackSpPoison = (newP1._wrackSpPoison ?? 0) + 4
      finalP2Damage = 0
    }
    if (newP2.hasWrack && finalP1Damage > 0) {
      newP2._wrackSpPoison = (newP2._wrackSpPoison ?? 0) + 4
      finalP1Damage = 0
    }
  }

  // ── Dodge override ────────────────────────────────────────────────────────
  let dodgeP1 = {}
  let dodgeP2 = {}
  let p1DodgedThisTurn = false
  let p2DodgedThisTurn = false

  if (turnResult.outcome === 'BL_CHIP') {
    const cairanIsP1 = newP1.hasDodge && p1Move === 'BL'
    const cairanIsP2 = newP2.hasDodge && p2Move === 'BL'

    if (cairanIsP1 || cairanIsP2) {
      const dodgerIsP1    = cairanIsP1
      const dodger        = dodgerIsP1 ? newP1 : newP2
      const streak        = dodger.dodgeStreak
      const attackerAtDmg = dodgerIsP1 ? p2AtDmg : p1AtDmg
      const atPlayerRead  = dodgerIsP1 ? p2Read : p1Read
      const badReadMult   = atPlayerRead === 'bad' ? 1.5 : 1.0

      if (streak === 0) {
        if (dodgerIsP1) { finalP1Damage = 0; dodgeP1 = { dodgeStreak: 1 }; p1DodgedThisTurn = true }
        else            { finalP2Damage = 0; dodgeP2 = { dodgeStreak: 1 }; p2DodgedThisTurn = true }
      } else {
        const reversalDmg = Math.floor(attackerAtDmg * 2 * badReadMult)
        if (dodgerIsP1) {
          finalP1Damage = 0
          finalP2Damage = reversalDmg
          dodgeP1 = { dodgeStreak: streak + 1 }
          p1DodgedThisTurn = true
        } else {
          finalP1Damage = reversalDmg
          finalP2Damage = 0
          dodgeP2 = { dodgeStreak: streak + 1 }
          p2DodgedThisTurn = true
        }
      }
      if (cairanIsP1 && newP2.hasDodge) dodgeP2 = { dodgeStreak: 0 }
      if (cairanIsP2 && newP1.hasDodge) dodgeP1 = { dodgeStreak: 0 }
    } else {
      if (newP1.hasDodge) dodgeP1 = { dodgeStreak: 0 }
      if (newP2.hasDodge) dodgeP2 = { dodgeStreak: 0 }
    }
  } else {
    if (newP1.hasDodge) dodgeP1 = { dodgeStreak: 0 }
    if (newP2.hasDodge) dodgeP2 = { dodgeStreak: 0 }
  }

  // ── Crit roll ─────────────────────────────────────────────────────────────
  const p1EffCritChance = newP1.keenEyeUnlocked ? (newP1.keenEyeChance ?? 0.10) : (newP1.critChance ?? 0)
  const p2EffCritChance = newP2.keenEyeUnlocked ? (newP2.keenEyeChance ?? 0.10) : (newP2.critChance ?? 0)

  let p1CritHit = false
  let p2CritHit = false

  if (turnResult.outcome === 'AT_WINS_CLEAN' || turnResult.outcome === 'SP_WINS_CLEAN') {
    const winnerRead = turnResult.winner === 'p1' ? p1Read : p2Read
    if (winnerRead === 'none' || winnerRead === 'good') {
      const baseCrit   = turnResult.winner === 'p1' ? p1EffCritChance : p2EffCritChance
      // Toggled good read (readActive + win) doubles crit chance, capped at 100%
      const winnerCrit = winnerRead === 'good' ? Math.min(1, (baseCrit ?? 0) * 2) : (baseCrit ?? 0)
      const forceCrit  = turnResult.winner === 'p1' && !!options.p1ForceCrit
      if (forceCrit || Math.random() < winnerCrit) {
        if (turnResult.winner === 'p1') { finalP2Damage *= 2; p1CritHit = true }
        else                            { finalP1Damage *= 2; p2CritHit = true }
      }
    }
  }

  // ── Bloodletter (Cairan passive) ─────────────────────────────────────────
  // Once unlocked, landing a toggled Good Read inflicts a bleed stack on the opponent.
  let p1Bleeds = newP1.bleeds
  let p2Bleeds = newP2.bleeds
  if (newP1.bloodletterUnlocked && p1Read === 'good') p2Bleeds = [...p2Bleeds, { currentDamage: 1 }]
  if (newP2.bloodletterUnlocked && p2Read === 'good') p1Bleeds = [...p1Bleeds, { currentDamage: 1 }]

  // ── Nimble (Cairan passive) ───────────────────────────────────────────────
  let p1NimbleTriggered = false
  let p2NimbleTriggered = false
  if (!isBLTie && newP1.nimbleUnlocked && finalP1Damage > 0 && Math.random() < (newP1.nimbleChance ?? 0)) {
    finalP1Damage = 0; p1NimbleTriggered = true
  }
  if (!isBLTie && newP2.nimbleUnlocked && finalP2Damage > 0 && Math.random() < (newP2.nimbleChance ?? 0)) {
    finalP2Damage = 0; p2NimbleTriggered = true
  }

  // ── Vael Solace: Evade (HP-scaled, requires vaelEvadeUnlocked) ───────────
  const vaelEvadeChance = (hp, maxHp) => {
    const mx = Math.max(maxHp, 2)
    return Math.min(0.25, Math.max(0.05, 0.05 + (mx - hp) / (mx - 1) * 0.20))
  }
  let p1VaelEvaded = false
  let p2VaelEvaded = false
  if (newP1.hasVael && newP1.vaelEvadeUnlocked && finalP1Damage > 0 && Math.random() < vaelEvadeChance(newP1.hp, newP1.maxHp)) {
    finalP1Damage = 0; p1VaelEvaded = true
  }
  if (newP2.hasVael && newP2.vaelEvadeUnlocked && finalP2Damage > 0 && Math.random() < vaelEvadeChance(newP2.hp, newP2.maxHp)) {
    finalP2Damage = 0; p2VaelEvaded = true
  }

  // ── Lit BL: negate chip punishment in BL_CHIP only (not SP wins) ─────────
  if (turnResult.outcome === 'BL_CHIP') {
    if (p1Move === 'BL' && p1LitMoves.bl && p1Read !== 'good' && finalP1Damage > 0 && !newP1.hasMourne) finalP1Damage = 0
    if (p2Move === 'BL' && p2LitMoves.bl && p2Read !== 'good' && finalP2Damage > 0 && !newP2.hasMourne) finalP2Damage = 0
  }

  // ── Wrack: Rot (poison) — BL application, SP carry-in, and Good Read cleanse
  // Good Read cleanses the reading player's own poison entirely.
  // BL chip case (Wrack absorbs chip): opponent gets mirror of chip value + 5.
  // BL punish case (Wrack's read or attacker bad read, Wrack takes 0 damage):
  //   opponent gets flat +10 poison, no change to direct damage.
  // SP carry-in: _wrackSpPoison set in the SP block above lands here.
  let p1Poison = p1Read === 'good' ? 0 : (newP1.poison ?? 0)
  let p2Poison = p2Read === 'good' ? 0 : (newP2.poison ?? 0)
  // Carry in SP poison from the block above
  if (newP1._wrackSpPoison) { p2Poison += newP1._wrackSpPoison; newP1._wrackSpPoison = 0 }
  if (newP2._wrackSpPoison) { p1Poison += newP2._wrackSpPoison; newP2._wrackSpPoison = 0 }
  if (turnResult.outcome === 'BL_CHIP') {
    // p1 is Wrack blocking — poison only on toggled good read
    if (newP1.hasWrack && p1Move === 'BL' && finalP2Damage > 0 && p1Read === 'good') {
      p2Poison += 7
      finalP2Damage = 0
    }
    // p2 is Wrack blocking — poison only on toggled good read
    if (newP2.hasWrack && p2Move === 'BL' && finalP1Damage > 0 && p2Read === 'good') {
      p1Poison += 7
      finalP1Damage = 0
    }
  }

  // ── Force Field (Mourne) — chip absorption ────────────────────────────────
  // Absorbs ALL AT-clash damage into forceFieldAccumulated when Mourne plays BL.
  // This includes plain chip (finalPxDamage on Mourne) AND read-punish damage
  // that was routed to the AT player instead of Mourne.
  let p1ForceFieldAccumulated = newP1.forceFieldAccumulated ?? 0
  let p2ForceFieldAccumulated = newP2.forceFieldAccumulated ?? 0

  let p1FfTotalAbsorbed = newP1.ffTotalAbsorbed ?? 0
  let p2FfTotalAbsorbed = newP2.ffTotalAbsorbed ?? 0
  if (turnResult.outcome === 'BL_CHIP') {
    if (newP1.hasMourne && p1Move === 'BL') {
      const p1FfMult = p1LitMoves.bl ? 1.75 : 1
      if (finalP1Damage > 0) {
        const amt = Math.floor(finalP1Damage * p1FfMult)
        p1ForceFieldAccumulated += amt; p1FfTotalAbsorbed += amt; finalP1Damage = 0
      }
      if (p2Move === 'AT' && finalP2Damage > 0 && p1Read !== 'good') {
        const amt = Math.floor(finalP2Damage * p1FfMult)
        p1ForceFieldAccumulated += amt; p1FfTotalAbsorbed += amt; finalP2Damage = 0
      }
    }
    if (newP2.hasMourne && p2Move === 'BL') {
      const p2FfMult = p2LitMoves.bl ? 1.75 : 1
      if (finalP2Damage > 0) {
        const amt = Math.floor(finalP2Damage * p2FfMult)
        p2ForceFieldAccumulated += amt; p2FfTotalAbsorbed += amt; finalP2Damage = 0
      }
      if (p1Move === 'AT' && finalP1Damage > 0 && p2Read !== 'good') {
        const amt = Math.floor(finalP1Damage * p2FfMult)
        p2ForceFieldAccumulated += amt; p2FfTotalAbsorbed += amt; finalP1Damage = 0
      }
    }
  }

  // ── Lit AT: accumulate lifesteal (paid out in resolveBeforeTurn) ─────────
  let p1PendingLifesteal = newP1.pendingLifesteal ?? 0
  let p2PendingLifesteal = newP2.pendingLifesteal ?? 0
  const p1WonWithAT = turnResult.outcome === 'AT_WINS_CLEAN' && turnResult.winner === 'p1'
  const p2WonWithAT = turnResult.outcome === 'AT_WINS_CLEAN' && turnResult.winner === 'p2'
  if (p1LitMoves.at && p1WonWithAT && finalP2Damage > 0 && newP1.hasDodge) p1PendingLifesteal += Math.ceil(finalP2Damage * 0.33)
  if (p2LitMoves.at && p2WonWithAT && finalP1Damage > 0 && newP2.hasDodge) p2PendingLifesteal += Math.ceil(finalP1Damage * 0.33)

  // ── HP ────────────────────────────────────────────────────────────────────
  const p1Hp = Math.max(0, newP1.hp - finalP1Damage)
  const p2Hp = Math.max(0, newP2.hp - finalP2Damage)

  // ── Cairan ability trackers ───────────────────────────────────────────────
  function buildAbilityUpdates(player, dealtDamage, dodgedThisTurn, critHit, cleanWin, goodRead) {
    if (!player.hasDodge) return { updates: {}, newUnlocks: [] }

    const newDamageDealtCount = player.damageDealtCount    + (dealtDamage   ? 1 : 0)
    const newSuccessfulDodges = player.successfulDodgeCount + (dodgedThisTurn ? 1 : 0)
    const newCritHitsDealt    = player.critHitsDealt       + (critHit       ? 1 : 0)

    const keenEyeUnlocked    = player.keenEyeUnlocked    || newDamageDealtCount >= 3
    const nimbleUnlocked     = player.nimbleUnlocked     || newSuccessfulDodges  >= 2
    // Bloodletter: unlocks permanently at 2 crits, never resets
    const critHitsDealt      = newCritHitsDealt
    const bloodletterUnlocked = player.bloodletterUnlocked || newCritHitsDealt >= 2

    const newUnlocks = []
    if (!player.keenEyeUnlocked    && keenEyeUnlocked)    newUnlocks.push('keenEye')
    if (!player.nimbleUnlocked     && nimbleUnlocked)     newUnlocks.push('nimble')
    if (!player.bloodletterUnlocked && bloodletterUnlocked) newUnlocks.push('bloodletter')

    let keenEyeChance = player.keenEyeChance ?? 0.10
    let nimbleChance  = player.nimbleChance  ?? 0
    if (cleanWin) {
      keenEyeChance = Math.min(0.35, keenEyeChance + 0.02)
    }
    if (goodRead) {
      nimbleChance = Math.min(0.30, nimbleChance + 0.02)
    }

    return {
      updates: {
        damageDealtCount: newDamageDealtCount, successfulDodgeCount: newSuccessfulDodges,
        critHitsDealt, keenEyeUnlocked, nimbleUnlocked, bloodletterUnlocked,
        keenEyeChance, nimbleChance,
      },
      newUnlocks,
    }
  }

  const p1CleanWin = (turnResult.outcome === 'AT_WINS_CLEAN' || turnResult.outcome === 'SP_WINS_CLEAN') && turnResult.winner === 'p1'
  const p2CleanWin = (turnResult.outcome === 'AT_WINS_CLEAN' || turnResult.outcome === 'SP_WINS_CLEAN') && turnResult.winner === 'p2'
  const { updates: p1AbilityUpdates, newUnlocks: p1CairanUnlocks } = buildAbilityUpdates(
    newP1, finalP2Damage > 0, p1DodgedThisTurn, p1CritHit, p1CleanWin, p1CleanWin
  )
  const { updates: p2AbilityUpdates, newUnlocks: p2CairanUnlocks } = buildAbilityUpdates(
    newP2, finalP1Damage > 0, p2DodgedThisTurn, p2CritHit, p2CleanWin, p2CleanWin
  )

  // ── Mourne ability trackers ───────────────────────────────────────────────
  // goodToggledSpReads: read active + any move + good read (Leech unlock tracker)
  const p1GoodToggledSp = newP1.hasMourne && p1ReadActive && p1Read === 'good'
  const p2GoodToggledSp = newP2.hasMourne && p2ReadActive && p2Read === 'good'

  // leechActive: already unlocked, read active, got a good read this turn
  const p1LeechActive = newP1.hasMourne && newP1.leechUnlocked && p1ReadActive && p1Read === 'good'
  const p2LeechActive = newP2.hasMourne && newP2.leechUnlocked && p2ReadActive && p2Read === 'good'

  function buildMourneUpdates(player, goodToggledSp, playerHpAfter) {
    if (!player.hasMourne) return { updates: {}, newUnlocks: [] }

    const newGoodToggledSpReads = player.goodToggledSpReads + (goodToggledSp ? 1 : 0)
    const leechUnlocked = player.leechUnlocked || newGoodToggledSpReads >= 3

    const newUnlocks = []
    if (!player.leechUnlocked && leechUnlocked) newUnlocks.push('leech')

    // overloadActive: permanently true once Overload is unlocked and HP dips below 30%
    const newOverloadActive = player.overloadActive ||
      (player.overloadUnlocked && playerHpAfter <= Math.ceil(player.maxHp * 0.30))

    return {
      updates: { goodToggledSpReads: newGoodToggledSpReads, leechUnlocked, overloadActive: newOverloadActive },
      newUnlocks,
    }
  }

  const { updates: p1MourneUpdates, newUnlocks: p1MourneUnlocks } = buildMourneUpdates(newP1, p1GoodToggledSp, p1Hp)
  const { updates: p2MourneUpdates, newUnlocks: p2MourneUnlocks } = buildMourneUpdates(newP2, p2GoodToggledSp, p2Hp)

  // Data for resolveBeforeTurn to fire Mourne between-turns effects
  const p1MourneData = newP1.hasMourne ? {
    spDealt:     (p1Move === 'SP' && finalP2Damage > 0 ? finalP2Damage : 0),
    atDealt:     (p1Move === 'AT' && finalP2Damage > 0 ? finalP2Damage : 0),
    atWasLit:    p1LitMoves.at,
    leechActive: p1LeechActive,
    totalDealt:  finalP2Damage,
  } : null
  const p2MourneData = newP2.hasMourne ? {
    spDealt:     (p2Move === 'SP' && finalP1Damage > 0 ? finalP1Damage : 0),
    atDealt:     (p2Move === 'AT' && finalP1Damage > 0 ? finalP1Damage : 0),
    atWasLit:    p2LitMoves.at,
    leechActive: p2LeechActive,
    totalDealt:  finalP1Damage,
  } : null

  // ── Vael Solace: SP disable mechanic + JINX passive ──────────────────────
  // disabledMove is always cleared (was active for this turn).
  // SP-vs-BL: fires first (priority), disables a random opponent move next turn.
  // JINX: unlocks permanently once vaelDisablesLanded reaches 2. After unlock,
  //   a regular (non-toggled) win — i.e. Vael wins with readActive === false —
  //   also triggers the disable. SP-vs-BL takes priority; JINX only fires if
  //   SP-vs-BL did not already issue a disable this turn.
  // Each successful proc (SP-vs-BL or JINX) increments vaelDisablesLanded.
  const VAEL_MOVES = ['AT', 'BL', 'SP']
  let p1NewDisabledMove = null
  let p2NewDisabledMove = null
  let p1VaelDisablesLanded = newP1.vaelDisablesLanded ?? 0
  let p2VaelDisablesLanded = newP2.vaelDisablesLanded ?? 0

  // SP-vs-BL trigger
  if (newP1.hasVael && p1Move === 'SP' && p2Move === 'BL') {
    p2NewDisabledMove = VAEL_MOVES[Math.floor(Math.random() * 3)]
    p1VaelDisablesLanded++
  }
  if (newP2.hasVael && p2Move === 'SP' && p1Move === 'BL') {
    p1NewDisabledMove = VAEL_MOVES[Math.floor(Math.random() * 3)]
    p2VaelDisablesLanded++
  }

  // Lit AT trigger: Vael wins with AT_WINS_CLEAN while AT is Lit; guaranteed disable
  if (newP1.hasVael && p1Move === 'AT' && p1LitMoves.at && turnResult.outcome === 'AT_WINS_CLEAN' && turnResult.winner === 'p1') {
    p2NewDisabledMove = VAEL_MOVES[Math.floor(Math.random() * 3)]
    p1VaelDisablesLanded++
  }
  if (newP2.hasVael && p2Move === 'AT' && p2LitMoves.at && turnResult.outcome === 'AT_WINS_CLEAN' && turnResult.winner === 'p2') {
    p1NewDisabledMove = VAEL_MOVES[Math.floor(Math.random() * 3)]
    p2VaelDisablesLanded++
  }

  // JINX unlock: one-time, permanent once vaelDisablesLanded reaches 2
  const p1JinxUnlocked = (newP1.jinxUnlocked ?? false) || (newP1.hasVael && p1VaelDisablesLanded >= 2)
  const p2JinxUnlocked = (newP2.jinxUnlocked ?? false) || (newP2.hasVael && p2VaelDisablesLanded >= 2)
  const p1JinxJustUnlocked = !newP1.jinxUnlocked && p1JinxUnlocked
  const p2JinxJustUnlocked = !newP2.jinxUnlocked && p2JinxUnlocked

  // JINX trigger: regular (non-toggled) win, only if SP-vs-BL didn't already proc
  if (p1JinxUnlocked && p2NewDisabledMove === null && !p1ReadActive && turnResult.winner === 'p1') {
    p2NewDisabledMove = VAEL_MOVES[Math.floor(Math.random() * 3)]
    p1VaelDisablesLanded++
  }
  if (p2JinxUnlocked && p1NewDisabledMove === null && !p2ReadActive && turnResult.winner === 'p2') {
    p1NewDisabledMove = VAEL_MOVES[Math.floor(Math.random() * 3)]
    p2VaelDisablesLanded++
  }

  // ── Vael Solace: Regen passive ────────────────────────────────────────────
  // vaelNormalGoodReads: counts non-toggled wins (readActive === false && Vael wins).
  // vaelRegenUnlocked: permanently true once counter reaches 3.
  // Once unlocked, heals Vael every turn after damage — amount scales inversely
  // with current HP% (more effective when low, minimal when near full).
  // Formula: no heal at or above 50% HP; below 50%: healPct = 12.5 × (1 − hp/(maxHp×0.5)),
  //          heal = floor(healPct/100 × maxHP), capped at maxHP.
  let p1VaelNormalGoodReads  = newP1.vaelNormalGoodReads  ?? 0
  let p2VaelNormalGoodReads  = newP2.vaelNormalGoodReads  ?? 0
  let p1VaelToggledGoodReads = newP1.vaelToggledGoodReads ?? 0
  let p2VaelToggledGoodReads = newP2.vaelToggledGoodReads ?? 0
  if (newP1.hasVael && !p1ReadActive && turnResult.winner === 'p1') p1VaelNormalGoodReads++
  if (newP2.hasVael && !p2ReadActive && turnResult.winner === 'p2') p2VaelNormalGoodReads++
  // Toggled good read: readActive === true and Vael wins (feeds flow state streak — same detection)
  if (newP1.hasVael && p1Read === 'good') p1VaelToggledGoodReads++
  if (newP2.hasVael && p2Read === 'good') p2VaelToggledGoodReads++

  const p1VaelEvadeUnlocked = (newP1.vaelEvadeUnlocked ?? false) || (newP1.hasVael && p1VaelToggledGoodReads >= 2)
  const p2VaelEvadeUnlocked = (newP2.vaelEvadeUnlocked ?? false) || (newP2.hasVael && p2VaelToggledGoodReads >= 2)
  const p1VaelEvadeJustUnlocked = !newP1.vaelEvadeUnlocked && p1VaelEvadeUnlocked
  const p2VaelEvadeJustUnlocked = !newP2.vaelEvadeUnlocked && p2VaelEvadeUnlocked

  const p1RegenUnlocked = (newP1.vaelRegenUnlocked ?? false) || (newP1.hasVael && p1VaelNormalGoodReads >= 3)
  const p2RegenUnlocked = (newP2.vaelRegenUnlocked ?? false) || (newP2.hasVael && p2VaelNormalGoodReads >= 3)
  const p1RegenJustUnlocked = !newP1.vaelRegenUnlocked && p1RegenUnlocked
  const p2RegenJustUnlocked = !newP2.vaelRegenUnlocked && p2RegenUnlocked
  // Regen heal is applied in resolveBeforeTurn, not here.

  // ── Wrack passives: FESTERING / WITHER / GALL ────────────────────────────
  // FESTERING (chain): unlocks after AT/SP chain reaches 3+ on 3 separate turns.
  //   Once unlocked, any chain-3+ hit also poisons for the current chain length.
  // WITHER (cycle): unlocks after 3 cycle completions.
  //   Once unlocked, each further cycle completion poisons for Wrack's base AT damage.
  // GALL (read): unlocks after 3 toggled Good Reads with AT or SP.
  //   Once unlocked, each further AT/SP toggled Good Read adds +3 poison on top.
  const p1WrackNewUnlocks = []
  const p2WrackNewUnlocks = []
  for (const [pk, oppKey, move, read, chainLen, cycleJustCompleted, readActive] of [
    ['p1', 'p2', p1Move, p1Read, Math.max(newP1.atChain, newP1.spChain), newP1.cycleSet?.length === 0 && (gameState.p1.cycleSet?.length ?? 0) > 0, p1ReadActive],
    ['p2', 'p1', p2Move, p2Read, Math.max(newP2.atChain, newP2.spChain), newP2.cycleSet?.length === 0 && (gameState.p2.cycleSet?.length ?? 0) > 0, p2ReadActive],
  ]) {
    const player = pk === 'p1' ? newP1 : newP2
    if (!player.hasWrack) continue
    let wrackChainTriggers = player.wrackChainTriggers ?? 0
    let wrackCycleTriggers = player.wrackCycleTriggers ?? 0
    let wrackReadTriggers  = player.wrackReadTriggers  ?? 0
    let festeringUnlocked  = player.festeringUnlocked  ?? false
    let witherUnlocked     = player.witherUnlocked     ?? false
    let gallUnlocked       = player.gallUnlocked       ?? false
    // FESTERING — track chain-3+ turns
    if (chainLen >= 4) {
      wrackChainTriggers++
      if (wrackChainTriggers >= 4) festeringUnlocked = true
    }
    if (festeringUnlocked && chainLen >= 4) {
      if (pk === 'p1') p2Poison += chainLen
      else             p1Poison += chainLen
    }
    // WITHER — track cycle completions
    if (cycleJustCompleted) {
      wrackCycleTriggers++
      if (wrackCycleTriggers >= 4) witherUnlocked = true
    }
    if (witherUnlocked && cycleJustCompleted) {
      const atDmg = player.atDmgBuff > player.baseAtDamage ? player.atDmgBuff : player.baseAtDamage
      if (pk === 'p1') p2Poison += atDmg
      else             p1Poison += atDmg
    }
    // GALL — track toggled Good Reads with AT or SP
    const isToggledGoodRead = readActive && read === 'good' && (move === 'AT' || move === 'SP')
    if (isToggledGoodRead) {
      wrackReadTriggers++
      if (wrackReadTriggers >= 4) gallUnlocked = true
    }
    if (gallUnlocked && isToggledGoodRead) {
      if (pk === 'p1') p2Poison += 3
      else             p1Poison += 3
    }
    // Detect just-unlocked passives (player still holds pre-assign values here)
    const wrackNewUnlocks = pk === 'p1' ? p1WrackNewUnlocks : p2WrackNewUnlocks
    if (!player.festeringUnlocked && festeringUnlocked) wrackNewUnlocks.push('fester')
    if (!player.witherUnlocked    && witherUnlocked)    wrackNewUnlocks.push('wither')
    if (!player.gallUnlocked      && gallUnlocked)      wrackNewUnlocks.push('gall')
    // Write updates back to the player object
    if (pk === 'p1') {
      Object.assign(newP1, { wrackChainTriggers, wrackCycleTriggers, wrackReadTriggers, festeringUnlocked, witherUnlocked, gallUnlocked })
    } else {
      Object.assign(newP2, { wrackChainTriggers, wrackCycleTriggers, wrackReadTriggers, festeringUnlocked, witherUnlocked, gallUnlocked })
    }
  }

  // ── Flow State activation: cleanse all negative status effects ────────────
  // Entering Flow State (transitioning from false to true this turn) wipes
  // poison, all bleeds, and any active move disable from the player.
  // Does not fire on turns where Flow State was already active coming in.
  const p1FlowJustActivated = !p1FlowNow && newP1.flowState
  const p2FlowJustActivated = !p2FlowNow && newP2.flowState
  if (p1FlowJustActivated) {
    newP1.poison      = 0
    newP1.bleeds      = []
    newP1.disabledMove = null
  }
  if (p2FlowJustActivated) {
    newP2.poison      = 0
    newP2.bleeds      = []
    newP2.disabledMove = null
  }

  // ── Log entry ─────────────────────────────────────────────────────────────
  const turn = gameState.log.length + 1
  const entry = {
    turn,
    p1Move,
    p2Move,
    outcome: turnResult.outcome,
    p1Damage: finalP1Damage,
    p2Damage: finalP2Damage,
    p1CritHit,
    p2CritHit,
    p1Read,
    p2Read,
    p1Hp,
    p2Hp,
    p1AtChain: newP1.atChain,
    p2AtChain: newP2.atChain,
    p1AtDmgBuff: newP1.atDmgBuff,
    p2AtDmgBuff: newP2.atDmgBuff,
    p1SpChain: newP1.spChain,
    p2SpChain: newP2.spChain,
    p1SpDmgBuff: newP1.spDmgBuff,
    p2SpDmgBuff: newP2.spDmgBuff,
    p1FlowActive: newP1.flowState,
    p2FlowActive: newP2.flowState,
    p1FlowActivated: !p1FlowNow    && newP1.flowState,
    p2FlowActivated: !p2FlowNow    && newP2.flowState,
    p1FlowBroken:     p1FlowNow    && !newP1.flowState,
    p2FlowBroken:     p2FlowNow    && !newP2.flowState,
    p1FlowCleansed:  p1FlowJustActivated,
    p2FlowCleansed:  p2FlowJustActivated,
    p1ZenActive:      newP1.zenState,
    p2ZenActive:      newP2.zenState,
    p1ZenActivated:  !p1ZenNow     && newP1.zenState,
    p2ZenActivated:  !p2ZenNow     && newP2.zenState,
    p1ZenBroken:      p1ZenNow     && !newP1.zenState,
    p2ZenBroken:      p2ZenNow     && !newP2.zenState,
    p1GodModeActive:  newP1.godModeState,
    p2GodModeActive:  newP2.godModeState,
    p1GodModeActivated: !p1GodModeNow && newP1.godModeState,
    p2GodModeActivated: !p2GodModeNow && newP2.godModeState,
    p1GodModeBroken:     p1GodModeNow  && !newP1.godModeState,
    p2GodModeBroken:     p2GodModeNow  && !newP2.godModeState,
    p1NimbleTriggered,
    p2NimbleTriggered,
    p1VaelEvaded,
    p2VaelEvaded,
    p1NewUnlocks: [
      ...p1CairanUnlocks, ...p1MourneUnlocks,
      ...(p1JinxJustUnlocked      ? ['vaelJinx']  : []),
      ...(p1RegenJustUnlocked     ? ['vaelRegen']  : []),
      ...(p1VaelEvadeJustUnlocked ? ['vaelEvade']  : []),
      ...p1WrackNewUnlocks,
    ],
    p2NewUnlocks: [
      ...p2CairanUnlocks, ...p2MourneUnlocks,
      ...(p2JinxJustUnlocked      ? ['vaelJinx']  : []),
      ...(p2RegenJustUnlocked     ? ['vaelRegen']  : []),
      ...(p2VaelEvadeJustUnlocked ? ['vaelEvade']  : []),
      ...p2WrackNewUnlocks,
    ],
    p1MourneData,
    p2MourneData,
    isBLTie,
    blTieWinner: blTieResult?.winner ?? null,
    blTieReason: blTieResult?.reason ?? null,
    blTieDamage: blTieResult?.damage ?? null,
    p1JinxJustUnlocked,
    p2JinxJustUnlocked,
    p1VaelDisabledMove: p2NewDisabledMove,
    p2VaelDisabledMove: p1NewDisabledMove,
    p1RegenJustUnlocked,
    p2RegenJustUnlocked,
  }

  return {
    ...gameState,
    p1: {
      ...newP1, hp: p1Hp, bleeds: p1Bleeds, poison: p1Poison, ...dodgeP1, ...p1AbilityUpdates, ...p1MourneUpdates,
      forceFieldAccumulated: p1ForceFieldAccumulated,
      ffTotalAbsorbed: p1FfTotalAbsorbed,
      pendingLifesteal: p1PendingLifesteal,
      disabledMove: p1NewDisabledMove,
      vaelDisablesLanded: p1VaelDisablesLanded,
      jinxUnlocked: p1JinxUnlocked,
      vaelNormalGoodReads: p1VaelNormalGoodReads,
      vaelToggledGoodReads: p1VaelToggledGoodReads,
      vaelRegenUnlocked: p1RegenUnlocked,
      vaelEvadeUnlocked: p1VaelEvadeUnlocked,
      ultReadAchieved: p1UltReadAchieved,
      ultGoodReads: p1UltGoodReads,
      ultChainAchieved: p1UltChainAchieved,
      ultimateReady: p1UltimateReady,
    },
    p2: {
      ...newP2, hp: p2Hp, bleeds: p2Bleeds, poison: p2Poison, ...dodgeP2, ...p2AbilityUpdates, ...p2MourneUpdates,
      forceFieldAccumulated: p2ForceFieldAccumulated,
      ffTotalAbsorbed: p2FfTotalAbsorbed,
      pendingLifesteal: p2PendingLifesteal,
      disabledMove: p2NewDisabledMove,
      vaelDisablesLanded: p2VaelDisablesLanded,
      jinxUnlocked: p2JinxUnlocked,
      vaelNormalGoodReads: p2VaelNormalGoodReads,
      vaelToggledGoodReads: p2VaelToggledGoodReads,
      vaelRegenUnlocked: p2RegenUnlocked,
      vaelEvadeUnlocked: p2VaelEvadeUnlocked,
      ultReadAchieved: p2UltReadAchieved,
      ultGoodReads: p2UltGoodReads,
      ultChainAchieved: p2UltChainAchieved,
      ultimateReady: p2UltimateReady,
    },
    lastTurn: entry,
    log: [...gameState.log, entry],
  }
}
