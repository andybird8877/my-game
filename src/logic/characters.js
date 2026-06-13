const HP_BY_WEIGHT   = { light: 200, medium: 250, heavy: 325 }
const HP_BY_CLASS    = { warrior: 1, mage: 0.75, tank: 1.25 }

const AT_BASE      = { warrior: 12, mage: 9,  tank: 10 }
const SP_BASE      = { warrior: 15, mage: 18, tank: 12 }
const WEIGHT_MOD   = { light: -1, medium: 0, heavy: 1 }
const CRIT_BY_WEIGHT = { light: 0.10, medium: 0.05, heavy: 0.02 }

const affinities = ['good', 'evil']
const weights    = ['light', 'medium', 'heavy']
const classes    = ['warrior', 'mage', 'tank']

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

let _id = 1
export const CHARACTERS = []

for (const affinity of affinities) {
  for (const weight of weights) {
    for (const cls of classes) {
      const isCairan = affinity === 'good'  && weight === 'light'  && cls === 'warrior'
      const isMourne = affinity === 'evil'  && weight === 'heavy'  && cls === 'mage'
      CHARACTERS.push({
        id:       _id++,
        name:     isCairan ? 'Cairan Vex' : isMourne ? 'Mourne' : `${cap(affinity)} ${cap(weight)} ${cap(cls)}`,
        portrait:  isCairan ? '/src/img/portraits/Cairan Vex.png' : isMourne ? '/src/img/portraits/Mourne.png' : null,
        hasDodge:  isCairan,
        hasMourne: isMourne,
        affinity,
        weight,
        class:    cls,
        hp:       Math.ceil(HP_BY_WEIGHT[weight] * HP_BY_CLASS[cls] / 5) * 5,
        atDamage:   AT_BASE[cls] + WEIGHT_MOD[weight],
        spDamage:   SP_BASE[cls] + WEIGHT_MOD[weight],
        critChance: CRIT_BY_WEIGHT[weight],
      })
    }
  }
}
