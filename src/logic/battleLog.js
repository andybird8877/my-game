/**
 * battleLog.js — Narrative battle log framework for CounterCycle
 *
 * Primary export:
 *   generateNarrativeEntry(entry, p1Name, p2Name, p1Char?, p2Char?) → NarrativeEntry
 *
 * Pass p1Char / p2Char (the character objects from CHARACTERS) so the framework
 * can distinguish Cairan's Dodge from Mourne's Force Field and other ability-
 * specific scenarios. If omitted, generic fallback text is used.
 *
 * NarrativeEntry = {
 *   actor:       string   — who initiated the action
 *   action:      string   — what they did
 *   reactor:     string   — who responded / was targeted
 *   reaction:    string   — how they responded
 *   result:      string   — numeric / status outcome
 *   explanation: string   — the assembled flavour sentence (primary display text)
 * }
 *
 * Extending:
 *   - Add a new key to EVENT_TEMPLATES below with an array of template objects.
 *   - OR call registerEventTemplates(key, templates) from outside this module.
 *   - Call classifyEntry(entry, p1Name, p2Name, p1Char, p2Char) to get
 *     { key, ctx, turn } if you want to build custom rendering without using
 *     the default templates.
 */

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Deterministically pick from an array using the turn number as a seed,
 * so a log entry never changes its phrasing across re-renders.
 */
function pick(arr, seed) {
  if (!arr || arr.length === 0) return null
  return arr[Math.abs(seed ?? 0) % arr.length]
}

/** Replace {placeholder} tokens in a string using a context object. */
function fmt(str, ctx) {
  return String(str ?? '').replace(/\{(\w+)\}/g, (_, k) => {
    const v = ctx[k]
    return v !== undefined && v !== null ? String(v) : ''
  })
}

// ── BL-tie reason labels ───────────────────────────────────────────────────────

const BL_TIE_LABELS = {
  weight: 'lighter build',
  class:  'class advantage',
  hp:     'lower HP',
  coin:   'sheer luck',
}

// ── Template registry ─────────────────────────────────────────────────────────
//
// Each key maps to an array of template objects:
//   { actor, action, reactor, reaction, result, explanation }
//
// All values are {placeholder} strings. Available context variables per event
// are documented in the classifyEntry() function below.
//
// To add a new event type, just add a key here — no other changes needed.

const EVENT_TEMPLATES = {

  // ── Attack beats Special ─────────────────────────────────────────────────

  AT_WINS: [
    {
      actor:       '{actor}',
      action:      'drives through with a direct strike',
      reactor:     '{reactor}',
      reaction:    'caught mid-special',
      result:      '{damage} damage',
      explanation: '{actor} breaks through {reactor}\'s special before it lands — {damage} damage.',
    },
    {
      actor:       '{actor}',
      action:      'lunges through the channelling',
      reactor:     '{reactor}',
      reaction:    'surge shut down at the source',
      result:      '{damage} damage',
      explanation: '{reactor} winds up a special but {actor} is already inside their guard — {damage} damage.',
    },
    {
      actor:       '{actor}',
      action:      'cuts the special off before it fires',
      reactor:     '{reactor}',
      reaction:    'unable to complete the release',
      result:      '{damage} damage',
      explanation: '{actor} clashes through {reactor}\'s wind-up and shuts the special down mid-charge for {damage}.',
    },
  ],

  AT_WINS_GOOD_READ: [
    {
      actor:       '{actor}',
      action:      'perfectly anticipates and punishes the special',
      reactor:     '{reactor}',
      reaction:    'caught completely off guard',
      result:      '{damage} damage',
      explanation: 'Dead on the read — {actor} knew {reactor}\'s special was coming and punishes for {damage}.',
    },
    {
      actor:       '{actor}',
      action:      'calls the special and steps through it',
      reactor:     '{reactor}',
      reaction:    'mid-channel with no way to adjust',
      result:      '{damage} damage',
      explanation: '{actor} read {reactor}\'s intentions perfectly — a surgical counter-strike deals {damage}.',
    },
  ],

  AT_WINS_CRIT: [
    {
      actor:       '{actor}',
      action:      'lands a CRITICAL strike',
      reactor:     '{reactor}',
      reaction:    'reeling from the devastating hit',
      result:      '{damage} damage!',
      explanation: 'Critical! {actor} finds a perfect gap in {reactor}\'s special for {damage}!',
    },
    {
      actor:       '{actor}',
      action:      'detonates a CRITICAL hit mid-swing',
      reactor:     '{reactor}',
      reaction:    'staggered back hard',
      result:      '{damage} damage!',
      explanation: '{actor} times the strike perfectly — a critical blow through {reactor}\'s special for {damage}!',
    },
  ],

  AT_WINS_GOOD_READ_CRIT: [
    {
      actor:       '{actor}',
      action:      'reads AND crits — flawless execution',
      reactor:     '{reactor}',
      reaction:    'no escape from either',
      result:      '{damage} damage!',
      explanation: 'Read AND critical! {actor} predicts {reactor}\'s special and punishes with a crushing {damage}!',
    },
  ],

  // ── Special beats Block ───────────────────────────────────────────────────

  SP_WINS: [
    {
      actor:       '{actor}',
      action:      'shatters the guard with a special',
      reactor:     '{reactor}',
      reaction:    'guard buckles under the force',
      result:      '{damage} damage',
      explanation: '{reactor}\'s block was no match — {actor}\'s special tears through for {damage}.',
    },
    {
      actor:       '{actor}',
      action:      'blasts straight through the defensive stance',
      reactor:     '{reactor}',
      reaction:    'arms buckle under the raw power',
      result:      '{damage} damage',
      explanation: '{actor} unleashes a special too powerful to be blocked — {reactor} absorbs {damage}.',
    },
    {
      actor:       '{actor}',
      action:      'overwhelms the guard with sheer force',
      reactor:     '{reactor}',
      reaction:    'pushed back, stance shattered',
      result:      '{damage} damage',
      explanation: 'No guard could stop it — {actor}\'s special smashes {reactor}\'s stance for {damage}.',
    },
  ],

  SP_WINS_GOOD_READ: [
    {
      actor:       '{actor}',
      action:      'anticipates the block and overloads it',
      reactor:     '{reactor}',
      reaction:    'guard torn apart before adjusting',
      result:      '{damage} damage',
      explanation: '{actor} read the block coming and cranked up the power — {reactor}\'s guard explodes for {damage}.',
    },
    {
      actor:       '{actor}',
      action:      'calls the guard and doubles down on the special',
      reactor:     '{reactor}',
      reaction:    'defence completely overwhelmed',
      result:      '{damage} damage',
      explanation: 'A read into a special — {actor} knew {reactor} was guarding and punishes hard for {damage}.',
    },
  ],

  SP_WINS_CRIT: [
    {
      actor:       '{actor}',
      action:      'lands a CRITICAL special through the guard',
      reactor:     '{reactor}',
      reaction:    'guard completely annihilated',
      result:      '{damage} damage!',
      explanation: 'The special connects with massive force — a critical hit through {reactor}\'s guard for {damage}!',
    },
  ],

  SP_WINS_GOOD_READ_CRIT: [
    {
      actor:       '{actor}',
      action:      'reads the guard AND crits through it',
      reactor:     '{reactor}',
      reaction:    'guard and hope both shattered',
      result:      '{damage} damage!',
      explanation: 'Read and critical! {actor} saw the guard coming and launches a special that critically punishes for {damage}!',
    },
  ],

  // ── Block chips the attacker (normal — chip leaks through the guard) ───────
  //
  // Context note: {actor} = attacker, {reactor} = blocker, {damage} = chip to blocker

  BL_CHIP: [
    {
      actor:       '{actor}',
      action:      'drives a strike at the guarding fighter',
      reactor:     '{reactor}',
      reaction:    'holds firm — but feels the impact leak through',
      result:      '{damage} chip to {reactor}',
      explanation: '{actor} attacks into {reactor}\'s guard. The block mostly holds — {damage} chips through the defence.',
    },
    {
      actor:       '{actor}',
      action:      'hammers against the block',
      reactor:     '{reactor}',
      reaction:    'guard absorbs most of it, but not all',
      result:      '{damage} chip to {reactor}',
      explanation: '{reactor} weathers the blow, but {actor}\'s strike forces {damage} chip damage through the guard.',
    },
    {
      actor:       '{actor}',
      action:      'presses into the defensive stance',
      reactor:     '{reactor}',
      reaction:    'braced, absorbing what they can',
      result:      '{damage} chip to {reactor}',
      explanation: 'The block stands — but the impact costs {reactor} {damage} chip damage from {actor}\'s assault.',
    },
  ],

  // ── Block with good read — blocker reads the attack and punishes the attacker

  BL_CHIP_GOOD_READ: [
    {
      actor:       '{actor}',
      action:      'reads the incoming attack perfectly',
      reactor:     '{reactor}',
      reaction:    'caught attacking into a prepared counter',
      result:      '{damage} damage to {reactor}',
      explanation: '{actor} saw the attack coming — the guard becomes a counter, punishing {reactor} for {damage}.',
    },
    {
      actor:       '{actor}',
      action:      'converts their guard into a devastating counter',
      reactor:     '{reactor}',
      reaction:    'aggression turned back against them',
      result:      '{damage} damage to {reactor}',
      explanation: 'Textbook read: {actor} anticipated {reactor}\'s strike and counters through the guard for {damage}.',
    },
  ],

  // ── Attacker had a bad read on the block — extra punishment on the attacker

  BL_CHIP_BAD_READ: [
    {
      actor:       '{actor}',
      action:      'stands firm as the attacker telegraphs badly',
      reactor:     '{reactor}',
      reaction:    'read goes completely wrong',
      result:      '{damage} damage to {reactor}',
      explanation: '{reactor} misread the situation entirely — the Bad Read costs them extra for {damage}.',
    },
    {
      actor:       '{actor}',
      action:      'holds ground while {reactor} commits to the wrong call',
      reactor:     '{reactor}',
      reaction:    'punished hard for the misread',
      result:      '{damage} damage to {reactor}',
      explanation: 'A badly telegraphed attack — {reactor}\'s misread is punished for {damage} against {actor}\'s guard.',
    },
  ],

  // ── Nimble passive evasion triggered (can occur on any outcome) ───────────

  NIMBLE_DODGE: [
    {
      actor:       '{evader}',
      action:      'flows around the incoming damage entirely',
      reactor:     '{other}',
      reaction:    'attack passes through thin air',
      result:      'evaded — no damage',
      explanation: '{evader}\'s Nimble triggers — {other}\'s attack finds nothing but empty space.',
    },
    {
      actor:       '{evader}',
      action:      'sidesteps with preternatural speed',
      reactor:     '{other}',
      reaction:    'left swinging at a ghost',
      result:      'evaded',
      explanation: 'Nimble activates — {evader} slips the damage and {other} is left with nothing to show for it.',
    },
  ],

  // ── Mourne Force Field absorbs chip ──────────────────────────────────────

  MOURNE_FF_ABSORB: [
    {
      actor:       '{actor}',
      action:      'surges into the Force Field',
      reactor:     '{reactor}',
      reaction:    'barrier drinks in the impact',
      result:      'chip absorbed into FF',
      explanation: '{actor}\'s strike hits {reactor}\'s Force Field — the energy is absorbed into the barrier rather than dealing HP damage.',
    },
    {
      actor:       '{reactor}',
      action:      'holds the Force Field as {actor} attacks',
      reactor:     '{actor}',
      reaction:    'impact funnelled into the accumulator',
      result:      'FF charges',
      explanation: '{actor} attacks into {reactor}\'s Force Field. No HP damage — the blow feeds the accumulator.',
    },
  ],

  // ── Cairan dodge (BL absorbs chip — streak 0→1) ───────────────────────────

  CAIRAN_DODGE_ABSORB: [
    {
      actor:       '{actor}',
      action:      'ghost-steps through the chip',
      reactor:     '{reactor}',
      reaction:    'strike absorbed into the dodge',
      result:      'chip negated',
      explanation: '{actor} activates Dodge — the chip damage dissolves as they slip cleanly past {reactor}\'s strike.',
    },
  ],

  // ── Cairan dodge counter (streak ≥ 1, counter fires back) ────────────────

  CAIRAN_DODGE_COUNTER: [
    {
      actor:       '{actor}',
      action:      'redirects the momentum into a brutal counter',
      reactor:     '{reactor}',
      reaction:    'own force turned against them',
      result:      '{damage} counter-damage to {reactor}',
      explanation: 'Consecutive dodge! {actor} converts {reactor}\'s aggression into a {damage}-damage counter.',
    },
    {
      actor:       '{actor}',
      action:      'rides the dodge into a punishing reversal',
      reactor:     '{reactor}',
      reaction:    'staggered by their own momentum',
      result:      '{damage} to {reactor}',
      explanation: '{actor}\'s dodge streak pays off — {reactor}\'s strike is turned into a {damage}-damage counter.',
    },
  ],

  // ── TIE: both attack ──────────────────────────────────────────────────────

  TIE_AT: [
    {
      actor:       'both fighters',
      action:      'charge each other simultaneously',
      reactor:     'each other',
      reaction:    'neither giving ground',
      result:      '{actor} takes {p1Damage}, {reactor} takes {p2Damage}',
      explanation: 'Mutual aggression — {actor} and {reactor} clash head-on, trading {p1Damage} and {p2Damage}.',
    },
    {
      actor:       '{actor} and {reactor}',
      action:      'choose to strike at the exact same moment',
      reactor:     'each other',
      reaction:    'blows land on both sides',
      result:      '{actor} takes {p1Damage}, {reactor} takes {p2Damage}',
      explanation: '{actor} and {reactor} throw simultaneous attacks — {actor} takes {p1Damage}, {reactor} takes {p2Damage}.',
    },
  ],

  // ── TIE: both use Special ─────────────────────────────────────────────────

  TIE_SP: [
    {
      actor:       'both fighters',
      action:      'pour everything into specials at once',
      reactor:     'each other',
      reaction:    'energies meet and detonate',
      result:      '{actor} takes {p1Damage}, {reactor} takes {p2Damage}',
      explanation: 'Two specials collide — the burst deals {p1Damage} to {actor} and {p2Damage} to {reactor}.',
    },
    {
      actor:       '{actor} and {reactor}',
      action:      'channel specials simultaneously',
      reactor:     'each other',
      reaction:    'forces cancel and explode outward',
      result:      'mutual special damage',
      explanation: '{actor} and {reactor} fire off specials at the same time — {p1Damage} and {p2Damage} in the collision.',
    },
  ],

  // ── TIE: both Block (tiebreaker applies) ──────────────────────────────────

  BL_TIE: [
    {
      actor:       'both fighters',
      action:      'raise their guard at the same moment',
      reactor:     'each other',
      reaction:    'locked in a clash of defences',
      result:      '{winner} wins on {reason}',
      explanation: 'A clash of guards — {winner}\'s {reason} breaks the deadlock, dealing {damage} to {loser}.',
    },
    {
      actor:       '{p1Name} and {p2Name}',
      action:      'dig in with a defensive stance',
      reactor:     'each other',
      reaction:    'neither willing to strike first',
      result:      '{winner} forces through',
      explanation: 'Both fighters hold — {winner}\'s {reason} edges it, forcing {damage} damage onto {loser}.',
    },
  ],

  // ── Ultimate: Assassinate ─────────────────────────────────────────────────

  ULT_ASSASSINATE: [
    {
      actor:       '{actor}',
      action:      'detonates the cycle — ASSASSINATE',
      reactor:     '{reactor}',
      reaction:    'caught in the devastating sequence',
      result:      '{actualDamage} damage, +{heal} HP',
      explanation: '{actor} unleashes ASSASSINATE — {actualDamage} damage is dealt to {reactor} and {actor} heals {heal} HP.',
    },
    {
      actor:       '{actor}',
      action:      'releases the full ASSASSINATE combination',
      reactor:     '{reactor}',
      reaction:    'overwhelmed by the relentless assault',
      result:      '{actualDamage} damage',
      explanation: 'The cycle completes — ASSASSINATE fires for {actualDamage} raw damage, restoring {heal} HP to {actor}.',
    },
  ],

  ULT_ASSASSINATE_NO_HEAL: [
    {
      actor:       '{actor}',
      action:      'fires ASSASSINATE — both fighters at peak',
      reactor:     '{reactor}',
      reaction:    'both ultimates clash',
      result:      '{actualDamage} damage — no heal',
      explanation: 'Both fighters ultimate simultaneously — {actor}\'s ASSASSINATE deals {actualDamage}, but the dual activation negates the heal.',
    },
  ],

  // ── Ultimate: Collapse (Mourne) ───────────────────────────────────────────

  ULT_COLLAPSE: [
    {
      actor:       '{actor}',
      action:      'releases the COLLAPSE',
      reactor:     '{reactor}',
      reaction:    'force field and self-damage detonate outward',
      result:      '{actualDamage} damage, +{heal} HP',
      explanation: '{actor} implodes — {ffAbsorbed} shield energy + {selfDmg} self-damage unleash {actualDamage} on {reactor}, healing {actor} for {heal}.',
    },
    {
      actor:       '{actor}',
      action:      'triggers the COLLAPSE detonation',
      reactor:     '{reactor}',
      reaction:    'stored energy erupts outward',
      result:      '{actualDamage} total',
      explanation: 'Collapse fires — all stored pain ({ffAbsorbed} + {selfDmg}) detonates into {reactor} for {actualDamage}, restoring {heal} HP.',
    },
  ],

}

// ── Event classifier ──────────────────────────────────────────────────────────

/**
 * Determine the event type and build the interpolation context from a log entry.
 *
 * @param {object} entry   - Log entry from gameState.log
 * @param {string} p1Name  - Display name of player 1
 * @param {string} p2Name  - Display name of player 2
 * @param {object} [p1Char] - Player 1 character object (from CHARACTERS)
 * @param {object} [p2Char] - Player 2 character object (from CHARACTERS)
 * @returns {{ key: string, ctx: object, turn: number }}
 */
export function classifyEntry(entry, p1Name, p2Name, p1Char, p2Char) {
  const turn = entry.turn ?? 0

  // ── Ultimates ────────────────────────────────────────────────────────────
  if (entry.isUlt) {
    const actor   = entry.ultUser === 'p1' ? p1Name : p2Name
    const reactor = entry.ultUser === 'p1' ? p2Name : p1Name
    const ctx = {
      p1Name, p2Name, actor, reactor,
      actualDamage: entry.actualDamage ?? 0,
      heal:         entry.healAmount   ?? 0,
      rawDamage:    entry.rawDamage    ?? 0,
      ffAbsorbed:   entry.ffAbsorbed   ?? 0,
      selfDmg:      entry.selfDmg      ?? 0,
    }
    if (entry.isCollapse)             return { key: 'ULT_COLLAPSE',           ctx, turn }
    if ((entry.healAmount ?? 0) === 0) return { key: 'ULT_ASSASSINATE_NO_HEAL', ctx, turn }
    return { key: 'ULT_ASSASSINATE', ctx, turn }
  }

  // ── BL vs BL tiebreaker ───────────────────────────────────────────────────
  if (entry.isBLTie) {
    const ctx = {
      p1Name, p2Name,
      actor:   p1Name,
      reactor: p2Name,
      winner:  entry.blTieWinner === 'p1' ? p1Name : p2Name,
      loser:   entry.blTieWinner === 'p1' ? p2Name : p1Name,
      damage:  entry.blTieDamage ?? 0,
      reason:  BL_TIE_LABELS[entry.blTieReason] ?? (entry.blTieReason ?? ''),
    }
    return { key: 'BL_TIE', ctx, turn }
  }

  // ── TIE (AT vs AT or SP vs SP) ────────────────────────────────────────────
  if (entry.outcome === 'TIE') {
    const ctx = {
      p1Name, p2Name,
      actor:    p1Name,
      reactor:  p2Name,
      p1Damage: entry.p1Damage ?? 0,
      p2Damage: entry.p2Damage ?? 0,
      damage:   (entry.p1Damage ?? 0) + (entry.p2Damage ?? 0),
    }
    const key = entry.p1Move === 'AT' ? 'TIE_AT' : 'TIE_SP'
    return { key, ctx, turn }
  }

  // ── BL_CHIP ───────────────────────────────────────────────────────────────
  if (entry.outcome === 'BL_CHIP') {
    const attackerIsP1 = entry.p1Move === 'AT'
    const attackerName = attackerIsP1 ? p1Name : p2Name
    const blockerName  = attackerIsP1 ? p2Name : p1Name

    // Character ability flags for the blocker
    const blockerChar   = attackerIsP1 ? p2Char : p1Char
    const blockerHasDodge  = !!(blockerChar?.hasDodge)
    const blockerHasMourne = !!(blockerChar?.hasMourne)

    const attackerRead = attackerIsP1 ? entry.p1Read : entry.p2Read
    const blockerRead  = attackerIsP1 ? entry.p2Read : entry.p1Read

    // Damage amounts
    const attackerTookDamage = attackerIsP1 ? (entry.p1Damage ?? 0) : (entry.p2Damage ?? 0)
    const blockerTookDamage  = attackerIsP1 ? (entry.p2Damage ?? 0) : (entry.p1Damage ?? 0)

    // Nimble — passive evasion can fire for either player
    const blockerNimble = attackerIsP1 ? entry.p2NimbleTriggered : entry.p1NimbleTriggered

    if (blockerNimble) {
      return {
        key: 'NIMBLE_DODGE',
        ctx: { p1Name, p2Name, evader: blockerName, other: attackerName, damage: 0 },
        turn,
      }
    }

    // Cairan dodge counter — attacker took reverse damage, no read (dodgeStreak reversal)
    if (blockerHasDodge && attackerTookDamage > 0 && blockerRead === 'none') {
      return {
        key: 'CAIRAN_DODGE_COUNTER',
        ctx: {
          p1Name, p2Name,
          actor:   blockerName,
          reactor: attackerName,
          damage:  attackerTookDamage,
          p1Damage: entry.p1Damage ?? 0,
          p2Damage: entry.p2Damage ?? 0,
        },
        turn,
      }
    }

    // Blocker good read → punishes the attacker
    if (blockerRead === 'good') {
      return {
        key: 'BL_CHIP_GOOD_READ',
        ctx: {
          p1Name, p2Name,
          actor:   blockerName,
          reactor: attackerName,
          damage:  attackerTookDamage,
          p1Damage: entry.p1Damage ?? 0,
          p2Damage: entry.p2Damage ?? 0,
        },
        turn,
      }
    }

    // Attacker bad read → extra punish on the attacker
    if (attackerRead === 'bad' && attackerTookDamage > 0) {
      return {
        key: 'BL_CHIP_BAD_READ',
        ctx: {
          p1Name, p2Name,
          actor:   blockerName,
          reactor: attackerName,
          damage:  attackerTookDamage,
          p1Damage: entry.p1Damage ?? 0,
          p2Damage: entry.p2Damage ?? 0,
        },
        turn,
      }
    }

    // Both damages zero — absorption event. Distinguish by character ability.
    if (blockerTookDamage === 0 && attackerTookDamage === 0) {
      if (blockerHasMourne) {
        // Mourne's Force Field absorbed the chip into the accumulator
        return {
          key: 'MOURNE_FF_ABSORB',
          ctx: { p1Name, p2Name, actor: attackerName, reactor: blockerName, damage: 0 },
          turn,
        }
      }
      if (blockerHasDodge) {
        // Cairan's first dodge — absorbs the chip cleanly
        return {
          key: 'CAIRAN_DODGE_ABSORB',
          ctx: { p1Name, p2Name, actor: blockerName, reactor: attackerName, damage: 0 },
          turn,
        }
      }
      // Lit BL negated chip — treat as a strong block
      return {
        key: 'BL_CHIP',
        ctx: {
          p1Name, p2Name,
          actor:   attackerName,
          reactor: blockerName,
          damage:  0,
          p1Damage: 0,
          p2Damage: 0,
        },
        turn,
      }
    }

    // Normal chip — blocker takes a small amount
    return {
      key: 'BL_CHIP',
      ctx: {
        p1Name, p2Name,
        actor:   attackerName,
        reactor: blockerName,
        damage:  blockerTookDamage,
        p1Damage: entry.p1Damage ?? 0,
        p2Damage: entry.p2Damage ?? 0,
      },
      turn,
    }
  }

  // ── AT_WINS_CLEAN ─────────────────────────────────────────────────────────
  if (entry.outcome === 'AT_WINS_CLEAN') {
    const winnerIsP1  = entry.p1Move === 'AT'
    const actor       = winnerIsP1 ? p1Name : p2Name
    const reactor     = winnerIsP1 ? p2Name : p1Name
    const damage      = winnerIsP1 ? (entry.p2Damage ?? 0) : (entry.p1Damage ?? 0)
    const actorRead   = winnerIsP1 ? entry.p1Read   : entry.p2Read
    const actorCrit   = winnerIsP1 ? entry.p1CritHit : entry.p2CritHit
    const reactorNimble = winnerIsP1 ? entry.p2NimbleTriggered : entry.p1NimbleTriggered

    const ctx = { p1Name, p2Name, actor, reactor, damage,
                  p1Damage: entry.p1Damage ?? 0, p2Damage: entry.p2Damage ?? 0 }

    if (reactorNimble) return { key: 'NIMBLE_DODGE', ctx: { ...ctx, evader: reactor, other: actor }, turn }

    const goodRead = actorRead === 'good'
    const crit     = !!actorCrit

    if (goodRead && crit) return { key: 'AT_WINS_GOOD_READ_CRIT', ctx, turn }
    if (crit)             return { key: 'AT_WINS_CRIT', ctx, turn }
    if (goodRead)         return { key: 'AT_WINS_GOOD_READ', ctx, turn }
    return { key: 'AT_WINS', ctx, turn }
  }

  // ── SP_WINS_CLEAN ─────────────────────────────────────────────────────────
  if (entry.outcome === 'SP_WINS_CLEAN') {
    const winnerIsP1  = entry.p1Move === 'SP'
    const actor       = winnerIsP1 ? p1Name : p2Name
    const reactor     = winnerIsP1 ? p2Name : p1Name
    const damage      = winnerIsP1 ? (entry.p2Damage ?? 0) : (entry.p1Damage ?? 0)
    const actorRead   = winnerIsP1 ? entry.p1Read   : entry.p2Read
    const actorCrit   = winnerIsP1 ? entry.p1CritHit : entry.p2CritHit
    const reactorNimble = winnerIsP1 ? entry.p2NimbleTriggered : entry.p1NimbleTriggered

    const ctx = { p1Name, p2Name, actor, reactor, damage,
                  p1Damage: entry.p1Damage ?? 0, p2Damage: entry.p2Damage ?? 0 }

    if (reactorNimble) return { key: 'NIMBLE_DODGE', ctx: { ...ctx, evader: reactor, other: actor }, turn }

    const goodRead = actorRead === 'good'
    const crit     = !!actorCrit

    if (goodRead && crit) return { key: 'SP_WINS_GOOD_READ_CRIT', ctx, turn }
    if (crit)             return { key: 'SP_WINS_CRIT', ctx, turn }
    if (goodRead)         return { key: 'SP_WINS_GOOD_READ', ctx, turn }
    return { key: 'SP_WINS', ctx, turn }
  }

  // ── Fallback (unknown outcome) ────────────────────────────────────────────
  return {
    key: '__UNKNOWN__',
    ctx: { p1Name, p2Name, actor: p1Name, reactor: p2Name, damage: 0 },
    turn,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate a structured narrative entry for a combat log event.
 *
 * @param {object} entry    - Log entry from gameState.log
 * @param {string} p1Name   - Display name of player 1
 * @param {string} p2Name   - Display name of player 2
 * @param {object} [p1Char] - Player 1 character object (from CHARACTERS)
 * @param {object} [p2Char] - Player 2 character object (from CHARACTERS)
 * @returns {NarrativeEntry}
 */
export function generateNarrativeEntry(entry, p1Name, p2Name, p1Char, p2Char) {
  const { key, ctx, turn } = classifyEntry(entry, p1Name, p2Name, p1Char, p2Char)

  const templates = EVENT_TEMPLATES[key]
  if (!templates || templates.length === 0) {
    // Graceful fallback — always produces something readable
    const fallback = `T${turn}: ${ctx.actor ?? p1Name} vs ${ctx.reactor ?? p2Name} (${key ?? 'unknown'}).`
    return {
      actor:       ctx.actor   ?? p1Name,
      action:      'made a move',
      reactor:     ctx.reactor ?? p2Name,
      reaction:    'responded',
      result:      '',
      explanation: fallback,
      key,
    }
  }

  const tmpl = pick(templates, turn)
  const fields = {
    actor:       fmt(tmpl.actor,       ctx),
    action:      fmt(tmpl.action,      ctx),
    reactor:     fmt(tmpl.reactor,     ctx),
    reaction:    fmt(tmpl.reaction,    ctx),
    result:      fmt(tmpl.result,      ctx),
    explanation: fmt(tmpl.explanation, ctx),
    key,
  }

  return fields
}

/**
 * Register additional event type templates from outside this module.
 * Use this for character-specific narrative variants.
 *
 * @param {string}   key       - Unique event type identifier
 * @param {object[]} templates - Array of { actor, action, reactor, reaction, result, explanation }
 */
export function registerEventTemplates(key, templates) {
  if (!Array.isArray(templates) || templates.length === 0) {
    console.warn(`battleLog: registerEventTemplates("${key}") requires a non-empty array.`)
    return
  }
  EVENT_TEMPLATES[key] = templates
}
