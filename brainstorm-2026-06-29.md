# Daily Character Brainstorm — 2026-06-29

## Slot: good · heavy · tank

### Why this slot?
Recent brainstorms covered two **evil** characters. Time to develop the **good** side. The **good / heavy / tank** combination produces the highest HP pool in the entire game — a natural candidate for a unique "wall" playstyle that no existing character fills. Named characters are either high-damage (Cairan, Harrox) or mechanics-driven (Mourne's self-harm, Sable's Echo, Wrack's poison). A true fortress character with a distinct defensive identity is missing.

**Base stats (from game formulas):**
- HP: `ceil(325 × 1.25 / 5) × 5 = 410` — highest in the game
- AT: `10 + 1 = 11`
- SP: `12 + 1 = 13`
- Crit chance: `3%` (heavy)

The tradeoff: maximum survivability, minimum damage output. Every attack and special hits for less than any other character in the game.

---

## Character Concept: **BASTION**

*"He doesn't finish fights. He outlives them."*

A grizzled, unbreakable sentinel of good who converts incoming aggression into shielding for allies (or himself). Where Harrox gets *stronger* from being hit, Bastion gets *harder to finish* — stacking layers of fortification that make his low damage output increasingly irrelevant as time goes on. The opponent must race to kill him before he becomes unkillable.

### Identity
- **Archetype:** Attrition wall / late-game fortress
- **Fantasy:** The immovable guardian — not a hero who wins, but one who refuses to lose until victory becomes inevitable
- **Tone:** Stoic, unhurried, almost contemptuous of incoming damage

---

## Unique Mechanic: FORTIFY

Bastion tracks **BULWARK stacks**, earned by surviving attacks rather than dealing them. Each stack provides cumulative passive damage reduction.

| Source | Stacks gained |
|---|---|
| Any AT win (opponent hits BL or SP) | +1 |
| Any SP win (opponent hits AT) | +1 |
| Surviving a crit | +2 |
| Opponent fires their ultimate | +3 |

**Each BULWARK stack reduces all incoming damage by 1** (flat, not percentage — keeping numbers manageable). Stacks are capped at 10 (10 flat DR), meaning a fully fortified Bastion reduces every hit by 10 damage. Against Harrox (13 AT), that's 23% passive mitigation at cap.

BULWARK stacks **never reset** during the match. The opponent must kill him fast — once he's entrenched, every exchange favors Bastion.

### Passive unlocks (unlock tree idea):

**RAMPART** *(after 3 BULWARK stacks)*
AT damage gains +2 bonus permanently. Bastion's punishment for turtling — his offense finally begins to matter.

**SENTINEL** *(after 6 BULWARK stacks)*
Once per turn, if Bastion wins the clash (any win type), he may choose to NOT deal damage and instead gain +2 BULWARK stacks instead. Useful for accelerating toward the cap rather than grinding with low base damage.

**IRONCLAD** *(after taking 300+ total HP of damage)*
When Bastion falls below 25% HP, he regenerates 5 HP at the end of each subsequent turn automatically. Not enough to reverse the match, but enough to stall for one more ultimate charge.

---

## Ultimate: HOLD THE LINE

**Effect:** Bastion deals damage equal to `BULWARK stacks × 8`, then resets his BULWARK stack count to 5 (not to 0).

**Design rationale:** Unlike every other ultimate in the game, HOLD THE LINE is not a desperation finisher — it's a *conversion*. At 10 stacks, the burst is 80 damage (respectable for a tank). The reset-to-5 (not zero) means Bastion retains half his fortification after firing. He doesn't go all-in; he vents pressure and keeps rebuilding.

Timing tension: fire early at 3–4 stacks for modest damage and keep climbing, or wait for 10 stacks for maximum burst but give the opponent time to whittle down that 410 HP first.

---

## Play Style Summary

**Early game:** Bastion eats hits deliberately. His 410 HP means he can absorb damage other characters can't. BULWARK starts stacking immediately. His low AT/SP (11/13) means he's not threatening yet — the opponent may be tempted to play aggressively.

**Mid game:** RAMPART comes online (+2 AT permanently). Bastion's AT becomes 13 — suddenly comparable to Harrox. The opponent is now being punished for the aggression that was supposed to be safe.

**Late game:** At 6+ stacks with SENTINEL available, Bastion can accelerate his own fortification by forgoing damage — a strategic choice the opponent must account for. IRONCLAD's regen kicks in if he's low, creating a "last stand" phase that buys time for the ultimate.

**Counter-play:** Characters with high burst damage (Mourne's Collapse, Sable's SHATTER) can deal concentrated damage before stacks accumulate. Poison-style damage (Wrack) bypasses BULWARK's flat DR, making Wrack a natural hard counter. Fast, light characters who can end the match in 8–10 turns before stacks cap (Cairan) are the other natural foil.

---

## Differentiation from Existing Named Characters

| | Cairan Vex | Mourne | Wrack | Harrox | Sable | **Bastion** |
|---|---|---|---|---|---|---|
| Power source | Dealing damage | Self-inflicted pain | Patience / poison | Being hit (FURY) | Being hit (Echo) | Being hit (BULWARK DR) |
| Healing? | Lifesteal on AT | Siphon/Leech | None | None | None | Passive regen (late, low) |
| Debuff type | Bleed | Force Field burst | Poison | Bleed (passive) | None | None |
| Ult formula | 2×AT + 2×SP | FF + self-dmg | Poison total | FURY × 5 | Echo total | BULWARK × 8 |
| Identity | Precision duelist | Dark masochist | Patient poisoner | Unstoppable brute | Glass cannon | Immovable fortress |

Bastion is the first character whose mechanic is *purely defensive* — he deals no debuffs, has no lifesteal, and his ultimate is the only one that retains partial effect after firing. He's designed to frustrate high-aggression players while rewarding patience.

---

## Name Notes
- **Bastion** — straightforward, communicates the archetype instantly
- Alternatives: *Aegis*, *Ward*, *Cain* (for a grizzled war-veteran tone), *Stonehall*

## Art Direction Notes
- Heavy + good → full plate armor, stone-grey/silver palette, no exposed skin
- Tank class → shield prominent, possibly cracked/battle-scarred
- BULWARK visual → cracks of golden light appearing in the armor as stacks accumulate, like a fortification enchantment charging up
- Expression: calm, unreadable — not angry like Harrox, not calculating like Wrack — just *there*
