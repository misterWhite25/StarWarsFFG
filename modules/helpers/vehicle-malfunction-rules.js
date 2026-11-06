// Stable result IDs link the repair and effect rules to the bilingual Avaries table.
export const MALFUNCTION_RULES = {
  "bc49ea035313b813": {
    "resultId": "bc49ea035313b813",
    "range": [
      1,
      79
    ],
    "modifier": 5,
    "repair": {
      "kind": "fixed",
      "value": 50
    },
    "repairTime": "1 heure",
    "repairTest": "-",
    "unresolved": false
  },
  "f9df10c5f2d248ea": {
    "resultId": "f9df10c5f2d248ea",
    "range": [
      80,
      84
    ],
    "changes": [
      [
        "system.stats.systemStrain.max",
        -1
      ]
    ],
    "repair": {
      "kind": "fixed",
      "value": 100
    },
    "repairTime": "1 heure",
    "repairTest": "Voir règles",
    "unresolved": false
  },
  "91c17ccc05c525da": {
    "resultId": "91c17ccc05c525da",
    "range": [
      85,
      89
    ],
    "modifier": 10,
    "repair": {
      "kind": "fixed",
      "value": 150
    },
    "repairTime": "2 heures",
    "repairTest": "Mécanique (2)",
    "unresolved": false
  },
  "dd5ca66937c61335": {
    "resultId": "dd5ca66937c61335",
    "range": [
      90,
      99
    ],
    "repair": {
      "kind": "manual"
    },
    "repairTime": "",
    "repairTest": "",
    "unresolved": true
  },
  "3d7115b6ec542f28": {
    "resultId": "3d7115b6ec542f28",
    "range": [
      100,
      104
    ],
    "changes": [
      [
        "system.stats.speed.max",
        -1
      ]
    ],
    "repair": {
      "kind": "fixed",
      "value": 500
    },
    "repairTime": "1 heure",
    "repairTest": "Mécanique (2)",
    "unresolved": false
  },
  "5be0d6faeb5f7207": {
    "resultId": "5be0d6faeb5f7207",
    "range": [
      105,
      109
    ],
    "instant": "hull",
    "repair": {
      "kind": "manual"
    },
    "repairTime": "Voir règles",
    "repairTest": "Voir règles",
    "unresolved": false
  },
  "b9edc515deb0aa87": {
    "resultId": "b9edc515deb0aa87",
    "range": [
      110,
      129
    ],
    "target": "equipment",
    "manual": true,
    "repair": {
      "kind": "manual"
    },
    "repairTime": "Selon l'équipement",
    "repairTest": "Mécanique ou Informatique (2)",
    "unresolved": false
  },
  "d1c395b188a31c64": {
    "resultId": "d1c395b188a31c64",
    "range": [
      130,
      134
    ],
    "instant": "stop",
    "repair": {
      "kind": "fixed",
      "value": 200
    },
    "repairTime": "3 rounds",
    "repairTest": "Mécanique (1)",
    "unresolved": false
  },
  "c4e42e7bb873a17d": {
    "resultId": "c4e42e7bb873a17d",
    "range": [
      135,
      139
    ],
    "status": "emergency-lighting",
    "repair": {
      "kind": "fixed",
      "value": 200
    },
    "repairTime": "10 minutes",
    "repairTest": "Mécanique (1)",
    "unresolved": false
  },
  "6f1231955e7f62fd": {
    "resultId": "6f1231955e7f62fd",
    "range": [
      140,
      144
    ],
    "changes": [
      [
        "system.stats.systemStrain.max",
        -2
      ]
    ],
    "repair": {
      "kind": "fixed",
      "value": 500
    },
    "repairTime": "2 heures",
    "repairTest": "Voir règles",
    "unresolved": false
  },
  "1d7378c939358974": {
    "resultId": "1d7378c939358974",
    "range": [
      145,
      149
    ],
    "status": "intercom-off",
    "repair": {
      "kind": "fixed",
      "value": 200
    },
    "repairTime": "30 minutes",
    "repairTest": "Mécanique (1)",
    "unresolved": false
  },
  "ed49c86878498b18": {
    "resultId": "ed49c86878498b18",
    "range": [
      150,
      154
    ],
    "changes": [
      [
        "system.stats.systemStrain.max",
        -5
      ]
    ],
    "repair": {
      "kind": "fixed",
      "value": 1000
    },
    "repairTime": "3 heures",
    "repairTest": "Voir règles",
    "unresolved": false
  },
  "1cfbbf2bb3708304": {
    "resultId": "1cfbbf2bb3708304",
    "range": [
      155,
      159
    ],
    "manual": true,
    "status": "landing-upgrade",
    "repair": {
      "kind": "fixed",
      "value": 1200
    },
    "repairTime": "2 heures",
    "repairTest": "Mécanique (2)",
    "unresolved": false
  },
  "d746231b618373cd": {
    "resultId": "d746231b618373cd",
    "range": [
      160,
      164
    ],
    "status": "hatch-stuck",
    "repair": {
      "kind": "fixed",
      "value": 800
    },
    "repairTime": "30 minutes",
    "repairTest": "Mécanique (3)",
    "unresolved": false
  },
  "23a68db8a3da12ed": {
    "resultId": "23a68db8a3da12ed",
    "range": [
      165,
      169
    ],
    "status": "bad-air",
    "timer": "1d6",
    "unit": "h",
    "repair": {
      "kind": "fixed",
      "value": 700
    },
    "repairTime": "20 minutes",
    "repairTest": "Mécanique (1)",
    "unresolved": false
  },
  "2045aec82b9712c5": {
    "resultId": "2045aec82b9712c5",
    "range": [
      170,
      174
    ],
    "target": "shield",
    "requires": "shield",
    "repair": {
      "kind": "fixed",
      "value": 1200
    },
    "repairTime": "10 minutes\n\n(6 rounds)",
    "repairTest": "Informatique (2)",
    "unresolved": false
  },
  "5005050363ceefc4": {
    "resultId": "5005050363ceefc4",
    "range": [
      175,
      179
    ],
    "target": "weapon",
    "setback": 1,
    "repair": {
      "kind": "percent",
      "value": 5,
      "base": "weapon"
    },
    "repairTime": "1 heure",
    "repairTest": "Ingénierie (2)",
    "unresolved": false
  },
  "6c6423d33cbf3137": {
    "resultId": "6c6423d33cbf3137",
    "range": [
      180,
      184
    ],
    "navigationSetback": 1,
    "repair": {
      "kind": "fixed",
      "value": 600
    },
    "repairTime": "1 heure",
    "repairTest": "Informatique (2)",
    "unresolved": false
  },
  "ba06ac2547db5322": {
    "resultId": "ba06ac2547db5322",
    "range": [
      185,
      189
    ],
    "fuelFactor": 2,
    "repair": {
      "kind": "fixed",
      "value": 900
    },
    "repairTime": "2 heures",
    "repairTest": "Informatique (1)",
    "unresolved": false
  },
  "b0f041d10ba02a4a": {
    "resultId": "b0f041d10ba02a4a",
    "range": [
      190,
      194
    ],
    "changes": [
      [
        "system.stats.speed.max",
        -2
      ]
    ],
    "repair": {
      "kind": "fixed",
      "value": 1200
    },
    "repairTime": "2 heures",
    "repairTest": "Mécanique (2)",
    "unresolved": false
  },
  "c112f8fe5e4cf7e4": {
    "resultId": "c112f8fe5e4cf7e4",
    "range": [
      195,
      199
    ],
    "changes": [
      [
        "system.stats.handling.value",
        -1
      ]
    ],
    "repair": {
      "kind": "fixed",
      "value": 1400
    },
    "repairTime": "30 minutes",
    "repairTest": "Mécanique (3)",
    "unresolved": false
  },
  "7628d9bf9d3b44c4": {
    "resultId": "7628d9bf9d3b44c4",
    "range": [
      200,
      204
    ],
    "pilotUpgrade": 1,
    "repair": {
      "kind": "fixed",
      "value": 1500
    },
    "repairTime": "30 minutes",
    "repairTest": "Informatique (3)",
    "unresolved": false
  },
  "aaa9da7fdc5009ac": {
    "resultId": "aaa9da7fdc5009ac",
    "range": [
      205,
      209
    ],
    "status": "communications-off",
    "repair": {
      "kind": "fixed",
      "value": 1000
    },
    "repairTime": "1 heure",
    "repairTest": "Informatique (2)",
    "unresolved": false
  },
  "e6ef80a2e1afc846": {
    "resultId": "e6ef80a2e1afc846",
    "range": [
      210,
      214
    ],
    "changes": [
      [
        "system.stats.sensorRange.value",
        "None",
        "override"
      ]
    ],
    "repair": {
      "kind": "fixed",
      "value": 1400
    },
    "repairTime": "3 heures",
    "repairTest": "Informatique (3)",
    "unresolved": false
  },
  "24247144063ed23c": {
    "resultId": "24247144063ed23c",
    "range": [
      215,
      219
    ],
    "changes": [
      [
        "system.stats.navicomputer.value",
        false,
        "override"
      ]
    ],
    "navigationUnavailable": true,
    "repair": {
      "kind": "fixed",
      "value": 1500
    },
    "repairTime": "2 heure",
    "repairTest": "Informatique (3)",
    "unresolved": false
  },
  "1f684f52701a98b3": {
    "resultId": "1f684f52701a98b3",
    "range": [
      220,
      224
    ],
    "changes": [
      [
        "system.stats.hyperdrive.value",
        0,
        "override"
      ]
    ],
    "repair": {
      "kind": "fixed",
      "value": 2000
    },
    "repairTime": "4 heures",
    "repairTest": "Mécanique (3)",
    "unresolved": false
  },
  "0e2d18ce3aaa9e49": {
    "resultId": "0e2d18ce3aaa9e49",
    "range": [
      225,
      229
    ],
    "status": "heating-off",
    "timer": "1d6",
    "unit": "°C/h",
    "repair": {
      "kind": "fixed",
      "value": 500
    },
    "repairTime": "1 heure",
    "repairTest": "Mécanique (1)",
    "unresolved": false
  },
  "6c98c2e3b99d10ea": {
    "resultId": "6c98c2e3b99d10ea",
    "range": [
      230,
      234
    ],
    "status": "gravity-off",
    "repair": {
      "kind": "fixed",
      "value": 600
    },
    "repairTime": "2 heures",
    "repairTest": "Informatique (3)",
    "unresolved": false
  },
  "ca5461f36e617824": {
    "resultId": "ca5461f36e617824",
    "range": [
      235,
      239
    ],
    "requires": "shield",
    "shieldOff": true,
    "repair": {
      "kind": "fixed",
      "value": 1600
    },
    "repairTime": "20 minutes",
    "repairTest": "Informatique (3)",
    "unresolved": false
  },
  "a68d9b20057858db": {
    "resultId": "a68d9b20057858db",
    "range": [
      240,
      245
    ],
    "requires": "weapon",
    "target": "weapon",
    "weaponOff": true,
    "repair": {
      "kind": "percent",
      "value": 20,
      "base": "weapon"
    },
    "repairTime": "2 heure",
    "repairTest": "Ingénierie (2)",
    "unresolved": false
  },
  "349522ddb8fb0a08": {
    "resultId": "349522ddb8fb0a08",
    "range": [
      246,
      249
    ],
    "systemsOff": true,
    "manual": true,
    "repair": {
      "kind": "fixed",
      "value": 0
    },
    "repairTime": "3 rounds",
    "repairTest": "Informatique (2)",
    "unresolved": false
  },
  "ce3fd1de27a2e727": {
    "resultId": "ce3fd1de27a2e727",
    "range": [
      250,
      254
    ],
    "status": "escape-pod-off",
    "repair": {
      "kind": "percent",
      "value": 8,
      "base": "ship"
    },
    "repairTime": "5 heures",
    "repairTest": "Mécanique (3)",
    "unresolved": false
  },
  "d784ed68120b43ab": {
    "resultId": "d784ed68120b43ab",
    "range": [
      255,
      259
    ],
    "status": "oxygen-leak",
    "timer": "1d4",
    "unit": "h",
    "repair": {
      "kind": "fixed",
      "value": 200
    },
    "repairTime": "10 minutes",
    "repairTest": "Mécanique (2)",
    "unresolved": false
  },
  "7499fe2d7f00a209": {
    "resultId": "7499fe2d7f00a209",
    "range": [
      260,
      264
    ],
    "status": "depressurisation",
    "timer": "2d8",
    "unit": "min",
    "repair": {
      "kind": "fixed",
      "value": 500
    },
    "repairTime": "3 minutes\n\n(6 rounds)",
    "repairTest": "Mécanique (3)",
    "unresolved": false
  },
  "0aa7510057b401e3": {
    "resultId": "0aa7510057b401e3",
    "range": [
      265,
      999999
    ],
    "systemsOff": true,
    "manual": true,
    "repair": {
      "kind": "percent",
      "value": 50,
      "base": "ship"
    },
    "repairTime": "10 heures",
    "repairTest": "Mécanique (4)",
    "unresolved": false
  }
};
