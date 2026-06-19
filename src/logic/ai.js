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
  // Short window (last 4) for early detection
  const short = log.slice(-4).map(e => e.p1Move)
  const shortFreq = moveFrequency(short)
  for (const [move, count] of Object.entries(shortFreq)) {
    if (count >= 3) return { move, strength: count / short.length }
  }
  // Medium window (last 6) for sustained spam
  const medium = log.slice(-6).map(e => e.p1Move)
  const medFreq = moveFrequency(medium)
  for (const [move, count] of Object.entries(medFreq)) {
    if (count >= 4) return { move, strength: count / medium.length }
  }
  return null
}

// How many times has each CPU move been punished (p2 took damage) recently?
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

  // Player spam detection (checked early — high priority)
  const playerSpam = detectPlayerSpam(log)

  // Player cycle threat
  const p1Needs = MOVES.filter(m => !p1.cycleSet.includes(m))
  const p1IsOneAway = new Set(p1.cycleSet).size === 2
  const p1ThreatenedMove = p1IsOneAway ? p1Needs[0] : null

  // CPU cycle needs
  const p2Needs = MOVES.filter(m => !p2.cycleSet.includes(m))

  // CPU spam streak state
  const punishments = getPunishments(log)
  const streakMove = p2.atChain >= 2 ? 'AT' : p2.spChain >= 2 ? 'SP' : null
  const streakBeingPunished = streakMove && punishments[streakMove] >= 2
  const inSpamStreak = streakMove && !streakBeingPunished

  // READ: only when fairly confident, never mid-streak
  let readChance = 0
  if (!inSpamStreak) {
    let eff = confidence
    if (p1IsOneAway) eff = Math.min(1, eff + 0.25)
    const lastTwo = recent.slice(-2)
    if (lastTwo.length === 2 && lastTwo[0] === lastTwo[1]) eff = Math.min(1, eff + 0.2)
    if (eff >= 0.55) readChance = eff * 0.45
  }
  const useRead = Math.random() < readChance

  let move

  // 1. Player is spamming — counter it with high probability
  //    Scales with spam strength: 3/4 turns → 80%, 4/4 → 90%, etc.
  //    Only skipped if CPU itself is mid-streak and not yet being punished.
  if (playerSpam && !inSpamStreak) {
    const counterChance = Math.min(0.92, 0.55 + playerSpam.strength * 0.45)
    if (Math.random() < counterChance) {
      move = COUNTER[playerSpam.move]
    }
  }

  if (!move) {
    // 2. Continue CPU spam streak (not being punished)
    if (inSpamStreak) {
      move = streakMove

    // 3. CPU streak is being punished — adapt
    } else if (streakBeingPunished) {
      const punisher = getCommonPunisher(log, streakMove)
      move = punisher ? COUNTER[punisher] : COUNTER[streakMove]

    // 4. Counter player's imminent cycle completion
    } else if (p1IsOneAway) {
      move = COUNTER[p1ThreatenedMove]

    // 5. Occasionally start a spam run (only when no obvious player pattern)
    } else if (!playerSpam && Math.random() < 0.20) {
      const candidates = ['AT', 'SP'].filter(m => punishments[m] < 2)
      move = candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : COUNTER[predicted]

    // 6. Build CPU's own cycle — prefer a move that also counters predicted
    } else if (p2Needs.length > 0) {
      const counterMove = COUNTER[predicted]
      const safe = p2Needs.filter(m => punishments[m] < 2)
      const pool = safe.length > 0 ? safe : p2Needs
      move = pool.includes(counterMove) ? counterMove : pool[Math.floor(Math.random() * pool.length)]

    // 7. Default: counter the predicted move
    } else {
      move = COUNTER[predicted]
    }
  }

  return { move, useRead }
}
