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

export function calculateDamage({ outcome, loser, winner, p1Move, p2Move, p1Read, p2Read, p1AtDmg = AT_DAMAGE, p2AtDmg = AT_DAMAGE, p1SpDmg = SP_DAMAGE, p2SpDmg = SP_DAMAGE, p1FlowState = false, p2FlowState = false }) {
  function readByMove(move) {
    return p1Move === move ? p1Read : p2Read
  }
  function flowOf(player) { return player === 'p1' ? p1FlowState : p2FlowState }

  // ── TIE ──────────────────────────────────────────────────────────────────
  if (outcome === 'TIE') {
    const p1Reads = p1Read !== 'none'
    const p2Reads = p2Read !== 'none'

    const p1FlowMult = p1FlowState ? 1.25 : 1.0
    const p2FlowMult = p2FlowState ? 1.25 : 1.0

    if (p1Move === 'BL') {
      return {
        p1Damage: p1Reads ? Math.ceil(p2AtDmg * CHIP_PERCENT * p2FlowMult) : 0,
        p2Damage: p2Reads ? Math.ceil(p1AtDmg * CHIP_PERCENT * p1FlowMult) : 0,
      }
    }

    const p1Out = (p1Move === 'AT' ? p1AtDmg : p1SpDmg) * p1FlowMult
    const p2Out = (p2Move === 'AT' ? p2AtDmg : p2SpDmg) * p2FlowMult

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
  const flowMult   = flowOf(winner) ? 1.5 : 1.0
  const amount     = Math.floor(base * goodMult * badMult * flowMult)

  return {
    p1Damage: loser === 'p1' ? amount : 0,
    p2Damage: loser === 'p2' ? amount : 0,
  }
}

export function createInitialState(p1Char = null, p2Char = null) {
  const p1Hp = p1Char?.hp ?? 300
  const p2Hp = p2Char?.hp ?? 300
  const makePlayer = (hp, baseAtDamage, baseSpDamage, critChance, hasDodge, hasMourne, hasVael, weight, cls) => ({
    hp, maxHp: hp, baseAtDamage, baseSpDamage, critChance,
    weight: weight ?? 'medium',
    class:  cls    ?? 'warrior',
    hasDodge: !!hasDodge, dodgeStreak: 0,
    atChain: 0, spChain: 0, atDmgBuff: 0, spDmgBuff: 0,
    cycleSet: [], cycleLit: {}, litMoves: { at: false, bl: false, sp: false },
    ultReadAchieved: false, ultChainAchieved: false, ultGoodReads: 0,
    pendingLifesteal: 0,
    ultimateReady: false, flowState: false,
    consecutiveGoodReads: 0, bleeds: [],
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
  })
  return {
    p1: makePlayer(p1Hp, p1Char?.atDamage ?? AT_DAMAGE, p1Char?.spDamage ?? SP_DAMAGE, p1Char?.critChance ?? 0, p1Char?.hasDodge, p1Char?.hasMourne, p1Char?.hasVael, p1Char?.weight, p1Char?.class),
    p2: makePlayer(p2Hp, p2Char?.atDamage ?? AT_DAMAGE, p2Char?.spDamage ?? SP_DAMAGE, p2Char?.critChance ?? 0, p2Char?.hasDodge, p2Char?.hasMourne, p2Char?.hasVael, p2Char?.weight, p2Char?.class),
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
    ...(atPlain && atChain >= 3 && { atDmgBuff: Math.floor(player.baseAtDamage * (1.15 ** (atChain - 1))) }),
    ...(spPlain && spChain >= 2 && { spDmgBuff: Math.floor(player.baseSpDamage * (1.1  ** (spChain - 1))) }),
  }
}

function updateFlowState(player, myRead, opponentRead) {
  if (myRead === 'bad' || opponentRead === 'good') {
    return { flowState: false, consecutiveGoodReads: 0 }
  }
  if (myRead === 'good') {
    const newCount = player.consecutiveGoodReads + 1
    return { flowState: player.flowState || newCount >= 2, consecutiveGoodReads: newCount }
  }
  return { flowState: player.flowState, consecutiveGoodReads: 0 }
}

function updateCycle(player, move, readActive) {
  if (readActive) return {}

  const { cycleSet, cycleLit } = player

  if (cycleSet.length === 3) {
    const newCycleLit = { ...cycleLit, [move]: true }
    return {
      cycleSet: [move],
      cycleLit: newCycleLit,
      litMoves: { at: !!newCycleLit.AT, bl: !!newCycleLit.BL, sp: !!newCycleLit.SP },
    }
  }

  if (cycleSet.includes(move)) return {}
  return { cycleSet: [...cycleSet, move] }
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

export function processUlt(gameState, ultUser) {
  if (gameState[ultUser]?.hasMourne) return processCollapse(gameState, ultUser)
  if (gameState[ultUser]?.hasVael)   return processVaelUlt(gameState, ultUser)
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

  // ── Mourne between-turns effects ──────────────────────────────────────────
  // Order per spec: FF payback, self-damage, Siphon, Leech (per player)
  const pendingMourneUnlocks = []  // { name, playerKey } — announced after all effects

  for (const playerKey of ['p1', 'p2']) {
    if (!state[playerKey].hasMourne) continue
    const opponentKey = playerKey === 'p1' ? 'p2' : 'p1'
    const mourneData  = playerKey === 'p1' ? state.lastTurn?.p1MourneData : state.lastTurn?.p2MourneData
    if (!mourneData) continue

    const { spDealt, leechActive, totalDealt } = mourneData

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

    // 2. Self-damage — fires when SP dealt damage and Leech is not suppressing it
    const spD = spDealt ?? 0
    if (spD > 0 && !leechActive) {
      const selfDmg = Math.floor(spD * 0.10)
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

    // 3. Siphon heal — if unlocked, SP dealt damage, not Leech turn (Leech suppresses Siphon)
    if (state[playerKey].siphonUnlocked && spD > 0 && !leechActive) {
      const siphonHeal = Math.floor(spD * 0.25)
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

  const p1FlowNow = gameState.p1.flowState
  const p2FlowNow = gameState.p2.flowState
  const p1FlowUpdate = updateFlowState(gameState.p1, p1Read, p2Read)
  const p2FlowUpdate = updateFlowState(gameState.p2, p2Read, p1Read)

  const newP1 = { ...updateChains(gameState.p1, p1Move, p1ReadActive), ...updateCycle(gameState.p1, p1Move, p1ReadActive), ...p1FlowUpdate }
  const newP2 = { ...updateChains(gameState.p2, p2Move, p2ReadActive), ...updateCycle(gameState.p2, p2Move, p2ReadActive), ...p2FlowUpdate }

  // ── Ultimate unlock: three sticky conditions (all must be achieved) ────────
  const p1UltGoodReads     = Math.min(2, (newP1.ultGoodReads ?? 0) + (p1ReadActive && p1Read === 'good' ? 1 : 0))
  const p2UltGoodReads     = Math.min(2, (newP2.ultGoodReads ?? 0) + (p2ReadActive && p2Read === 'good' ? 1 : 0))
  const p1UltReadAchieved  = p1UltGoodReads >= 2
  const p2UltReadAchieved  = p2UltGoodReads >= 2
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
    p1FlowState: p1FlowNow,
    p2FlowState: p2FlowNow,
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

  // ── Bloodletter (Cairan active) ───────────────────────────────────────────
  let p1Bleeds = newP1.bleeds
  let p2Bleeds = newP2.bleeds
  const p1BloodletterFired = !!(options.p1UseBloodletter && newP1.bloodletterUnlocked && (newP1.bloodletterCooldown ?? 0) === 0)
  const p2BloodletterFired = !!(options.p2UseBloodletter && newP2.bloodletterUnlocked && (newP2.bloodletterCooldown ?? 0) === 0)
  if (p1BloodletterFired) {
    finalP2Damage += Math.max(newP1.atDmgBuff, newP1.baseAtDamage)
    p2Bleeds = [...p2Bleeds, { currentDamage: 1 }]
  }
  if (p2BloodletterFired) {
    finalP1Damage += Math.max(newP2.atDmgBuff, newP2.baseAtDamage)
    p1Bleeds = [...p1Bleeds, { currentDamage: 1 }]
  }

  // ── Nimble (Cairan passive) ───────────────────────────────────────────────
  let p1NimbleTriggered = false
  let p2NimbleTriggered = false
  if (!isBLTie && newP1.nimbleUnlocked && finalP1Damage > 0 && Math.random() < (newP1.nimbleChance ?? 0)) {
    finalP1Damage = 0; p1NimbleTriggered = true
  }
  if (!isBLTie && newP2.nimbleUnlocked && finalP2Damage > 0 && Math.random() < (newP2.nimbleChance ?? 0)) {
    finalP2Damage = 0; p2NimbleTriggered = true
  }

  // ── Vael Solace: base evade (20%) ────────────────────────────────────────
  const VAEL_EVADE_CHANCE = 0.20
  let p1VaelEvaded = false
  let p2VaelEvaded = false
  if (newP1.hasVael && finalP1Damage > 0 && Math.random() < VAEL_EVADE_CHANCE) {
    finalP1Damage = 0; p1VaelEvaded = true
  }
  if (newP2.hasVael && finalP2Damage > 0 && Math.random() < VAEL_EVADE_CHANCE) {
    finalP2Damage = 0; p2VaelEvaded = true
  }

  // ── Lit BL: negate chip punishment in BL_CHIP only (not SP wins) ─────────
  if (turnResult.outcome === 'BL_CHIP') {
    if (p1Move === 'BL' && p1LitMoves.bl && p1Read !== 'good' && finalP1Damage > 0) finalP1Damage = 0
    if (p2Move === 'BL' && p2LitMoves.bl && p2Read !== 'good' && finalP2Damage > 0) finalP2Damage = 0
  }

  // ── Force Field (Mourne) — chip absorption ────────────────────────────────
  // Absorbs chip damage into forceFieldAccumulated instead of HP.
  // Only intercepts the BL player's incoming chip (plain chip case — read-based
  // punishments already land on the AT player, not Mourne, so finalPxDamage=0 there).
  let p1ForceFieldAccumulated = newP1.forceFieldAccumulated ?? 0
  let p2ForceFieldAccumulated = newP2.forceFieldAccumulated ?? 0

  let p1FfTotalAbsorbed = newP1.ffTotalAbsorbed ?? 0
  let p2FfTotalAbsorbed = newP2.ffTotalAbsorbed ?? 0
  if (turnResult.outcome === 'BL_CHIP') {
    if (newP1.hasMourne && p1Move === 'BL' && finalP1Damage > 0) {
      p1ForceFieldAccumulated += finalP1Damage
      p1FfTotalAbsorbed += finalP1Damage
      finalP1Damage = 0
    }
    if (newP2.hasMourne && p2Move === 'BL' && finalP2Damage > 0) {
      p2ForceFieldAccumulated += finalP2Damage
      p2FfTotalAbsorbed += finalP2Damage
      finalP2Damage = 0
    }
  }

  // ── Lit AT: accumulate lifesteal (paid out in resolveBeforeTurn) ─────────
  let p1PendingLifesteal = newP1.pendingLifesteal ?? 0
  let p2PendingLifesteal = newP2.pendingLifesteal ?? 0
  const p1WonWithAT = turnResult.outcome === 'AT_WINS_CLEAN' && turnResult.winner === 'p1'
  const p2WonWithAT = turnResult.outcome === 'AT_WINS_CLEAN' && turnResult.winner === 'p2'
  if (p1LitMoves.at && p1WonWithAT && finalP2Damage > 0) p1PendingLifesteal += Math.ceil(finalP2Damage * 0.33)
  if (p2LitMoves.at && p2WonWithAT && finalP1Damage > 0) p2PendingLifesteal += Math.ceil(finalP1Damage * 0.33)

  // ── HP ────────────────────────────────────────────────────────────────────
  const p1Hp = Math.max(0, newP1.hp - finalP1Damage)
  const p2Hp = Math.max(0, newP2.hp - finalP2Damage)

  // ── Cairan ability trackers ───────────────────────────────────────────────
  function buildAbilityUpdates(player, dealtDamage, dodgedThisTurn, critHit, cleanWin, bloodletterUsed, goodRead) {
    if (!player.hasDodge) return { updates: {}, newUnlocks: [] }

    const newDamageDealtCount = player.damageDealtCount    + (dealtDamage   ? 1 : 0)
    const newSuccessfulDodges = player.successfulDodgeCount + (dodgedThisTurn ? 1 : 0)
    const newCritHitsDealt    = player.critHitsDealt       + (critHit       ? 1 : 0)

    const keenEyeUnlocked    = player.keenEyeUnlocked    || newDamageDealtCount >= 3
    const nimbleUnlocked     = player.nimbleUnlocked     || newSuccessfulDodges  >= 2
    // Bloodletter: unlocks at 2 crits, but resets to locked (crit count 0) after use
    const critHitsDealt      = bloodletterUsed ? 0 : newCritHitsDealt
    const bloodletterUnlocked = bloodletterUsed ? false : (player.bloodletterUnlocked || newCritHitsDealt >= 2)

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
    newP1, finalP2Damage > 0, p1DodgedThisTurn, p1CritHit, p1CleanWin, p1BloodletterFired, p1CleanWin
  )
  const { updates: p2AbilityUpdates, newUnlocks: p2CairanUnlocks } = buildAbilityUpdates(
    newP2, finalP1Damage > 0, p2DodgedThisTurn, p2CritHit, p2CleanWin, p2BloodletterFired, p2CleanWin
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
    spDealt:    (p1Move === 'SP' && finalP2Damage > 0 ? finalP2Damage : 0),
    leechActive: p1LeechActive,
    totalDealt:  finalP2Damage,
  } : null
  const p2MourneData = newP2.hasMourne ? {
    spDealt:    (p2Move === 'SP' && finalP1Damage > 0 ? finalP1Damage : 0),
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

  const p1RegenUnlocked = (newP1.vaelRegenUnlocked ?? false) || (newP1.hasVael && p1VaelNormalGoodReads >= 3)
  const p2RegenUnlocked = (newP2.vaelRegenUnlocked ?? false) || (newP2.hasVael && p2VaelNormalGoodReads >= 3)
  const p1RegenJustUnlocked = !newP1.vaelRegenUnlocked && p1RegenUnlocked
  const p2RegenJustUnlocked = !newP2.vaelRegenUnlocked && p2RegenUnlocked
  // Regen heal is applied in resolveBeforeTurn, not here.

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
    p1FlowActivated: !p1FlowNow && newP1.flowState,
    p2FlowActivated: !p2FlowNow && newP2.flowState,
    p1FlowBroken:    p1FlowNow  && !newP1.flowState,
    p2FlowBroken:    p2FlowNow  && !newP2.flowState,
    p1NimbleTriggered,
    p2NimbleTriggered,
    p1VaelEvaded,
    p2VaelEvaded,
    p1UsedBloodletter: p1BloodletterFired,
    p2UsedBloodletter: p2BloodletterFired,
    p1NewUnlocks: [...p1CairanUnlocks, ...p1MourneUnlocks],
    p2NewUnlocks: [...p2CairanUnlocks, ...p2MourneUnlocks],
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
      ...newP1, hp: p1Hp, bleeds: p1Bleeds, ...dodgeP1, ...p1AbilityUpdates, ...p1MourneUpdates,
      forceFieldAccumulated: p1ForceFieldAccumulated,
      ffTotalAbsorbed: p1FfTotalAbsorbed,
      pendingLifesteal: p1PendingLifesteal,
      disabledMove: p1NewDisabledMove,
      vaelDisablesLanded: p1VaelDisablesLanded,
      jinxUnlocked: p1JinxUnlocked,
      vaelNormalGoodReads: p1VaelNormalGoodReads,
      vaelToggledGoodReads: p1VaelToggledGoodReads,
      vaelRegenUnlocked: p1RegenUnlocked,
      ultReadAchieved: p1UltReadAchieved,
      ultGoodReads: p1UltGoodReads,
      ultChainAchieved: p1UltChainAchieved,
      ultimateReady: p1UltimateReady,
    },
    p2: {
      ...newP2, hp: p2Hp, bleeds: p2Bleeds, ...dodgeP2, ...p2AbilityUpdates, ...p2MourneUpdates,
      forceFieldAccumulated: p2ForceFieldAccumulated,
      ffTotalAbsorbed: p2FfTotalAbsorbed,
      pendingLifesteal: p2PendingLifesteal,
      disabledMove: p2NewDisabledMove,
      vaelDisablesLanded: p2VaelDisablesLanded,
      jinxUnlocked: p2JinxUnlocked,
      vaelNormalGoodReads: p2VaelNormalGoodReads,
      vaelToggledGoodReads: p2VaelToggledGoodReads,
      vaelRegenUnlocked: p2RegenUnlocked,
      ultReadAchieved: p2UltReadAchieved,
      ultGoodReads: p2UltGoodReads,
      ultChainAchieved: p2UltChainAchieved,
      ultimateReady: p2UltimateReady,
    },
    lastTurn: entry,
    log: [...gameState.log, entry],
  }
}
