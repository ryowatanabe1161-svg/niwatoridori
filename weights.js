/* 自己対戦で調整した「強い」の重み（tools/train.js が生成） */
this.NT_WEIGHTS = {
 "strong": {
  "duel": {
   "size": 0.019,
   "weak": 0.155,
   "th": 8.562,
   "sc": 1.97,
   "big": 0.214,
   "out": 50,
   "pass": 0.553,
   "draw": 0.473,
   "hold": 0,
   "hth": 13.156,
   "hsc": 2.524,
   "urg": 0.257,
   "take": -0.002,
   "fkeep": 0.506,
   "dpass": 0.115
  },
  "basic": {
   "size": 0.046,
   "weak": 0.658,
   "th": 14.869,
   "sc": 2.362,
   "big": 0.18,
   "out": 50,
   "pass": 0.339,
   "draw": 0.464,
   "hold": 0.45,
   "hth": 13.984,
   "hsc": 2.8,
   "urg": 0.147,
   "take": -0.128,
   "fkeep": 0.174,
   "dpass": 0.6
  },
  "adv": {
   "size": 0.03,
   "weak": 0.9,
   "th": 11,
   "sc": 2.2,
   "big": 0.237,
   "out": 50,
   "pass": 0.846,
   "draw": 0.8,
   "hold": 0.203,
   "hth": 16,
   "hsc": 3.675,
   "urg": 0.11,
   "take": 0.194,
   "fkeep": 0.3,
   "dpass": 0.6
  }
 },
 "report": {
  "duel": {
   "iters": 80,
   "rounds": 6000,
   "vsNormalBefore": 0.475,
   "vsNormalAfter": 0.54,
   "accepted": 5
  },
  "basic": {
   "iters": 80,
   "rounds": 6000,
   "vsNormalBefore": 0.771,
   "vsNormalAfter": 0.773,
   "accepted": 3
  },
  "adv": {
   "iters": 60,
   "rounds": 6000,
   "vsNormalBefore": 0.517,
   "vsNormalAfter": 0.52,
   "accepted": 1
  }
 }
};
