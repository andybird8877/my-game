const MOVES = ['AT', 'BL', 'SP']

// Best defensive/offensive response to each move
const COUNTER = { AT: 'BL', SP: 'AT', BL: 'SP' }

function moveFrequency(moves) {
  const freq = { AT: 0, BL: 0, SP: 0 }
  moves.forEach(m => { if (m in freq) freq[m]++ })
  return freq
}

function mostLikelyMove(moves) {
  if (!moves.length) return MOVES[Math.floor(Math.random() * 3)]
  const freq = moveFrequency(moves)
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
}

// Detect if the player is clearly spamming one move.
// Returns { move, strength } where strength is 0–1, or null if no spam detected.
function detectPlayerSpam(log) {
  const short = log.slice(-4).map(e => e.p1Move)
  const shortFreq = moveFrequency(short)
  for (const [move, count] of Object.entries(shortFreq)) {
    if (count >= 3) return { move, strength: count / short.length }
  }
  const medium = log.slice(-6).map(e => e.p1Move)
  const medFreq = moveFrequency(medium)
  for (const [move, count] of Object.entries(medFreq)) {
    if (count >= 4) return { move, strength: count / medium.length }
  }
  return null
}

// How many times has each CPU move been punished recently?
function getPunishments(log, lookback = 5) {
  const counts = { AT: 0, BL: 0, SP: 0 }
  log.slice(-lookback).forEach(e => {
    if (e.p2Move in counts && e.p2Damage > 0) counts[e.p2Move]++
  })
  return counts
}

// What move is the player using to punish a specific CPU move?
function getCommonPunisher(log, cpuMove, lookback = 8) {
  const punishers = log
    .slice(-lookback)
    .filter(e => e.p2Move === cpuMove && e.p2Damage > 0)
    .map(e => e.p1Move)
  return punishers.length ? mostLikelyMove(punishers) : null
}

export function getAiMove(gameState) {
  const { log, p1, p2 } = gameState

  // General player history
  const recent = log.slice(-6).map(e => e.p1Move)
  const predicted = mostLikelyMove(recent)
  const confidence = recent.length > 0 ? moveFrequency(recent)[predicted] / recent.length : 0

  // Player spam detection
  const playerSpam = detectPlayerSpam(log)

  // Player cycle threat
  const p1Needs = MOVES.filter(m => !p1.cycleSet.includes(m))
  const p1IsOneAway = new Set(p1.cycleSet).size === 2
  const p1ThreatenedMove = p1IsOneAway ? p1Needs[0] : null

  // CPU combo-cycle needs
  const p2Needs = MOVES.filter(m => !p2.cycleSet.includes(m))

  // CPU spam streak state
  const punishments = getPunishments(log)
  const streakMove = p2.atChain >= 2 ? 'AT' : p2.spChain >= 2 ? 'SP' : null
  const streakBeingPunished = streakMove && punishments[streakMove] >= 2
  const inSpamStreak = streakMove && !streakBeingPunished

  // ── ULT CONDITION TRACKING ────────────────────────────────────────────────
  // Condition 1: good reads (need 3)
  const p2GoodReads = p2.ultGoodReads ?? 0
  const needsGoodReads = p2GoodReads < 3

  // Condition 2: power chain — 3 AT or SP in a row with read off
  const chainDone = !!p2.ultChainAchieved
  // Which chain is further along? Commit to that one.
  const chainTarget = !chainDone
    ? ((p2.spChain ?? 0) > (p2.atChain ?? 0) ? 'SP' : 'AT')
    : null
  // "Building chain" = chain not done AND we already have 1+ in a streak
  const buildingChain = !chainDone && ((p2.atChain ?? 0) >= 1 || (p2.spChain ?? 0) >= 1)

  // Condition 3: cycle lit — each of AT, BL, SP played once with read off
  const p2UnlitMoves = MOVES.filter(m => !p2.cycleLit?.[m])
  const needsCycleLit = p2UnlitMoves.length > 0

  // All ult conditions done (ult might not be flagged ready yet, but all pieces collected)
  const ultConditionsMet = !needsGoodReads && chainDone && !needsCycleLit

  // ── READ DECISION ─────────────────────────────────────────────────────────
  const p1InFlow = p1.flowState || p1.zenState || p1.godModeState
  let readChance = 0

  if (buildingChain) {
    // Chain requires read OFF — never read while mid-chain
    readChance = 0
  } else if (p1InFlow) {
    // Aggressively read to break player flow state
    readChance = p1.godModeState ? 0.85 : p1.zenState ? 0.75 : 0.65
  } else if (!inSpamStreak) {
    let eff = confidence
    if (p1IsOneAway) eff = Math.min(1, eff + 0.25)
    const lastTwo = recent.slice(-2)
    if (lastTwo.length === 2 && lastTwo[0] === lastTwo[1]) eff = Math.min(1, eff + 0.2)

    if (needsGoodReads && eff >= 0.45) {
      // Boost read chance when chasing good-read condition — more aggressive
      readChance = eff * 0.65
    } else if (eff >= 0.55) {
      readChance = eff * 0.45
    }
  }

  const useRead = Math.random() < readChance

  // ── MOVE SELECTION ────────────────────────────────────────────────────────
  let move

  // 1. Player is spamming — counter with high probability
  //    Skip if we're mid-chain-build (don't break the chain for this)
  if (playerSpam && !inSpamStreak && !buildingChain) {
    const counterChance = Math.min(0.92, 0.55 + playerSpam.strength * 0.45)
    if (Math.random() < counterChance) {
      move = COUNTER[playerSpam.move]
    }
  }

  if (!move) {
    // 2. Continue chain run toward ultChainAchieved
    //    (only while not being punished for the chain move)
    if (buildingChain && !streakBeingPunished) {
      move = chainTarget

    // 3. Chain is being punished — adapt (safety valve)
    } else if (streakBeingPunished) {
      const punisher = getCommonPunisher(log, streakMove)
      move = punisher ? COUNTER[punisher] : COUNTER[streakMove]

    // 4. Counter player's imminent cycle completion
    } else if (p1IsOneAway) {
      move = COUNTER[p1ThreatenedMove]

    // 5. Light unlit cycle moves — play an unlit move with read off.
    //    Skip if we're mid-read this turn (cycle lit requires read off).
    } else if (needsCycleLit && !useRead && Math.random() < 0.60) {
      const counterMove = COUNTER[predicted]
      // Prefer the unlit move that also counters the player's predicted move
      move = p2UnlitMoves.includes(counterMove)
        ? counterMove
        : p2UnlitMoves[Math.floor(Math.random() * p2UnlitMoves.length)]

    // 6. Start a chain run toward ultChainAchieved
    } else if (!chainDone && !playerSpam && Math.random() < 0.35) {
      const safe = ['AT', 'SP'].filter(m => punishments[m] < 2)
      move = safe.length > 0
        ? safe[Math.floor(Math.random() * safe.length)]
        : chainTarget ?? 'AT'

    // 7. Occasionally start a spam run (when ult conditions are met, or as fallback)
    } else if (!playerSpam && Math.random() < (ultConditionsMet ? 0.25 : 0.12)) {
      const candidates = ['AT', 'SP'].filter(m => punishments[m] < 2)
      move = candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : COUNTER[predicted]

    // 8. Build CPU's own combo cycle
    } else if (p2Needs.length > 0) {
      const counterMove = COUNTER[predicted]
      const safe = p2Needs.filter(m => punishments[m] < 2)
      const pool = safe.length > 0 ? safe : p2Needs
      move = pool.includes(counterMove) ? counterMove : pool[Math.floor(Math.random() * pool.length)]

    // 9. Default: counter the predicted move
    } else {
      move = COUNTER[predicted]
    }
  }

  return { move, useRead }
}
