const HP_BY_WEIGHT   = { light: 200, medium: 250, heavy: 325 }
const HP_BY_CLASS    = { warrior: 1, mage: 0.75, tank: 1.25 }

const AT_BASE      = { warrior: 12, mage: 9,  tank: 10 }
const SP_BASE      = { warrior: 15, mage: 18, tank: 12 }
const WEIGHT_MOD   = { light: -1, medium: 0, heavy: 1 }
const CRIT_BY_WEIGHT = { light: 0.15, medium: 0.075, heavy: 0.03 }

const affinities = ['good', 'evil']
const weights    = ['light', 'medium', 'heavy']
const classes    = ['warrior', 'mage', 'tank']

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

let _id = 1
export const CHARACTERS = []

for (const affinity of affinities) {
  for (const weight of weights) {
    for (const cls of classes) {
      const isCairan  = affinity === 'good'  && weight === 'light'  && cls === 'warrior'
      const isMourne  = affinity === 'evil'  && weight === 'heavy'  && cls === 'mage'
      const isVael    = affinity === 'good'  && weight === 'light'  && cls === 'mage'
      const isWrack   = affinity === 'evil'  && weight === 'medium' && cls === 'tank'
      const isHarrox  = affinity === 'evil'  && weight === 'heavy'  && cls === 'warrior'
      const isSable   = affinity === 'evil'  && weight === 'light'  && cls === 'mage'
      CHARACTERS.push({
        id:       _id++,
        name:     isCairan ? 'Cairan Vex' : isMourne ? 'Mourne' : isVael ? 'Vael Solace' : isWrack ? 'Wrack' : isHarrox ? 'Harrox' : isSable ? 'Sable' : `${cap(affinity)} ${cap(weight)} ${cap(cls)}`,
        portrait:  isCairan ? '/portraits/cairan-vex.png' : isMourne ? '/portraits/mourne.png' : isVael ? '/portraits/vael-solace.png' : isWrack ? '/portraits/wrack.png' : isHarrox ? '/portraits/harrox.png' : isSable ? '/portraits/sable.png' : null,
        hasDodge:  isCairan,
        hasMourne: isMourne,
        hasVael:   isVael,
        hasWrack:  isWrack,
        hasHarrox: isHarrox,
        hasSable:  isSable,
        affinity,
        weight,
        class:    cls,
        hp:       Math.ceil(HP_BY_WEIGHT[weight] * HP_BY_CLASS[cls] / 5) * 5,
        atDamage:   AT_BASE[cls] + WEIGHT_MOD[weight],
        spDamage:   SP_BASE[cls] + WEIGHT_MOD[weight],
        critChance: isCairan ? 0.15 : CRIT_BY_WEIGHT[weight],
      })
    }
  }
}
