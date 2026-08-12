window.APP_DATA = Object.freeze({
  preferredBrandOrder: [
    "REGNO", "POTENZA", "Playz", "ALENZA", "ECOPIA", "NEWNO", "FINESSA",
    "BLIZZAK", "ICEPARTNER", "オールシーズン",
    "DUELER", "TURANZA", "DURAVIS",
    "SEIBERLING", "TOPRUN"
  ],
  brandAliases: {
    "PLAYZ": "Playz",
    "ＩＣＥＰＡＲＴＮＥＲ": "ICEPARTNER",
    "ICEPARTNER2": "ICEPARTNER",
    "ICE PARTNER": "ICEPARTNER",
    "ｵｰﾙｼｰｽﾞﾝ": "オールシーズン",
    "オールシーズン": "オールシーズン"
  },
  brandPresentation: {
    REGNO: { accent: "#2f6b57", soft: "#e8f0eb", mood: "Premium Comfort" },
    POTENZA: { accent: "#43515a", soft: "#e8ecee", mood: "Performance" },
    Playz: { accent: "#527766", soft: "#e9f0ec", mood: "Relaxed Driving" },
    ECOPIA: { accent: "#66865c", soft: "#edf3e9", mood: "Eco & Safety" },
    ALENZA: { accent: "#766c5c", soft: "#f0ede7", mood: "Premium SUV" },
    TURANZA: { accent: "#4e6971", soft: "#e9eff0", mood: "Touring" },
    BLIZZAK: { accent: "#4c6f82", soft: "#e8f0f3", mood: "Winter Safety" },
    ICEPARTNER: { accent: "#5f7890", soft: "#edf2f5", mood: "Winter Value" },
    オールシーズン: { accent: "#65775f", soft: "#edf2ea", mood: "All Season" }
  },
  defaultPresentation: { accent: "#2f6b57", soft: "#eaf1ec", mood: "Bridgestone" },
  defaultPriceSettings: { addition: 0, taxRate: 10, defaultRate: 0.9 },
  defaultLaborSettings: {
    replacement: 1100,
    removal: 550,
    balancing: 550,
    valve: 275,
    disposal: 330,
    nitrogen: 275,
    bag: 50
  },
  defaultStoreSettings: {
    name: "タイヤ館 箕輪",
    address: "長野県上伊那郡箕輪町大字三日町964-1",
    phone: "0265-98-9111",
    staff: "",
    note: ""
  },
  defaultOptionSettings: {
    labor: true,
    disposal: true,
    valve: true,
    nitrogen: true,
    bag: false,
    inspection: true
  },
  autoLaborSettings: {
    purchaseModeLabel: "お買上時",
    common: { valve: 275, nitrogen: 275, bag: 50 },
    categories: [
      { key: "keiCompact", label: "軽・コンパクトカー", minInch: 0, maxInch: 14, replacement: 1100, balancing: 550, removal: 550, disposal: 330 },
      { key: "under16", label: "16インチ以下", minInch: 15, maxInch: 16, replacement: 1100, balancing: 550, removal: 550, disposal: 550 },
      { key: "inch17to18", label: "17-18インチ", minInch: 17, maxInch: 18, replacement: 1210, balancing: 770, removal: 770, disposal: 550 },
      { key: "over19", label: "19インチ以上", minInch: 19, maxInch: 99, replacement: 1540, balancing: 880, removal: 880, disposal: 550 }
    ]
  },
  importLaborSettings: {
    categories: [
      { key: "importUnder16", label: "輸入車 16インチ以下", minInch: 0, maxInch: 16, replacement: 1870, removal: 1100, balancing: 1100, disposal: 550 },
      { key: "import17to18", label: "輸入車 17-18インチ", minInch: 17, maxInch: 18, replacement: 2200, removal: 1210, balancing: 1320, disposal: 550 },
      { key: "importOver19", label: "輸入車 19インチ以上", minInch: 19, maxInch: 99, replacement: 2750, removal: 1540, balancing: 1980, disposal: 550 }
    ],
    runFlatPerTire: 2200
  }
});
