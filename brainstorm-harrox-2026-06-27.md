# Character Brainstorm — 2026-06-27

## Slot: evil / heavy / warrior

**Stats (from existing formulas):**
- HP: 325 (heavy weight × warrior class multiplier)
- AT damage: 13 (warrior base 12 + heavy +1)
- SP damage: 16 (warrior base 15 + heavy +1)
- Crit chance: 2% (heavy)

---

## Name: HARROX

**Concept:** A massive, near-unkillable dark warlord whose power _grows the more punishment he absorbs_. Where Mourne deliberately hurts himself to accumulate force, Harrox simply refuses to go down — and the more he bleeds, the more dangerous he becomes. Pure evil, pure aggression.

**Archetype:** Berserker / Damage Sponge

---

## Core Mechanic: BLOODRAGE

Harrox tracks **FURY** — a count of distinct turns on which he took direct damage (BL chip, AT wins, SP wins against him — not bleed/poison ticks).

Each FURY threshold unlocks a passive permanently:

| Threshold | Unlock | Effect |
|---|---|---|
| 3 FURY | **IRON SKIN** | First passive: AT damage buff permanently +3 |
| 6 FURY | **FRENZY** | Crit chance increases to 8% (from 2%); AT chains start at 1 instead of 0 (i.e., the chain never resets below 1) |
| 9 FURY | **MASSACRE** | On any AT win (clean or not), inflicts a bleed stack (same as Cairan's Bloodletter) on the opponent — even without a Read |

FURY never resets mid-match, making Harrox a slow-burn threat: intentionally tanking hits is a viable strategy to accelerate unlocks.

---

## Ultimate: RAMPAGE

**Damage = total FURY accumulated this match × 5**

No heal (unlike Cairan's Assassinate). Instead, if Harrox has MASSACRE unlocked when he fires RAMPAGE, the opponent is also inflicted with 3 bleed stacks simultaneously.

**Design rationale:** This rewards a player who has been hit a lot — the more Harrox suffered, the harder RAMPAGE hits. A fully unlocked Harrox at 9 FURY deals 45 base damage from the ult multiplier alone, but since FURY tracks all damage turns (not just to the threshold), a late-match Harrox who's taken 20 hits deals 100 damage. This creates genuine tension for the opponent: stopping RAMPAGE means not letting Harrox accumulate FURY, but that means avoiding AT plays (which also grows Harrox's chain buff).

---

## Playstyle Summary

**Low-FURY Harrox:** Trades blows freely to stack FURY. BL can still be used but his main goal is to reach unlock thresholds. Predictable heavy-warrior (high damage, low crit, slow ultimates).

**Mid-FURY (IRON SKIN + FRENZY active):** Significantly more threatening — 16 AT with +3 buff = 16+, crit jumps to 8%, chains start faster. The opponent can no longer safely let him chain.

**Late-game Harrox:** MASSACRE turns every AT win into a passive bleed engine. Combined with FRENZY's chain start-at-1 bonus, Harrox begins rapidly stacking bleed on top of high base damage. RAMPAGE becomes a serious KO threat.

**Counter-play:** Flow State cleanses bleeds, so opponents with flow potential can neutralize the bleed accumulation — but Harrox's raw damage stats (13/16) still press them hard.

---

## Differentiation from Existing Named Characters

| | Cairan Vex | Mourne | Vael Solace | Wrack | **Harrox** |
|---|---|---|---|---|---|
| Power source | Dealing damage / crits | Self-inflicted damage | Move denials | Poison stacking | Being hit (FURY) |
| Healing? | Lit AT lifesteal | Siphon/Leech | Regen | None | None |
| Debuff type | Bleed (earned) | Force Field burst | Move disable | Poison | Bleed (passive, late) |
| Ult formula | 2×AT + 2×SP | FF absorbed + self-dmg | Disables × good clashes | Total poison dealt | FURY × 5 |
| Identity | Precision duelist | Dark masochist | Control mage | Patient poisoner | Unstoppable brute |
