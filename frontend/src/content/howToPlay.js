// frontend/src/content/howToPlay.js
// The "How to play" brochure text, English and Filipino. Every number comes
// from "virtual:game-facts" (vite.config.js -> gameFacts.mjs), which reads
// ml/game_rules.py's export and the model files at build time.
// Wording rules: docs/FRONTEND.md "Visitor text" (tested in howToPlay.test.js).
// The Filipino text NEEDS REVIEW by a native speaker; a missing key falls
// back to English.

import facts from "virtual:game-facts"

const f = facts
const secs = (n) => String(n)

// Rank stamps: plain speed ranges only when the model file allows them.
function rankStamps(lang) {
  const words = {
    en: {
      first: (s) => `About ${s} seconds or less per button.`,
      middle: (a, b) => `About ${a} to ${b} seconds per button.`,
      last: (s) => `Slower than about ${s} seconds per button.`,
      plain: { Pro: "Very quick on the buttons.", Intermediate: "Quick on the buttons.", Beginner: "Just getting started. Keep playing!" },
    },
    fil: {
      first: (s) => `Mga ${s} segundo o mas mabilis bawat button.`,
      middle: (a, b) => `Mga ${a} hanggang ${b} segundo bawat button.`,
      last: (s) => `Mas mabagal sa mga ${s} segundo bawat button.`,
      plain: { Pro: "Napakabilis pumindot.", Intermediate: "Mabilis pumindot.", Beginner: "Nagsisimula pa lang. Laro pa!" },
    },
  }[lang]
  const order = ["Pro", "Intermediate", "Beginner"]
  if (!f.ranks) return order.map((rank) => ({ rank, text: words.plain[rank] }))
  return f.ranks.map((r, i) => ({
    rank: r.rank,
    text: i === 0 ? words.first(secs(r.under)) : r.under === null ? words.last(secs(f.ranks[i - 1].under)) : words.middle(secs(f.ranks[i - 1].under), secs(r.under)),
  }))
}

function animalRows(lang) {
  const group = {
    en: (a) => (a.top ? `Top ${a.percent}%` : a.rest ? `The rest (${a.percent}%)` : `Next ${a.percent}%`),
    fil: (a) => (a.top ? `Nangungunang ${a.percent}%` : a.rest ? `Ang iba pa (${a.percent}%)` : `Susunod na ${a.percent}%`),
  }[lang]
  return f.animals.map((a) => ({ animal: a.animal, group: group(a), iq: a.iq.replace("-", " to ") }))
}

const en = {
  ui: {
    title: "How to play",
    intro: "A quick guide to the Rhythm Rush booth.",
    contents: "Contents",
    jump: { play: "Play", score: "Score", rank: "Rank", animal: "Animal" },
    language: "Language",
    print: "Print this page",
    review: "",
    glossary: "What does this mean?",
    strip: "Watch the lights. Then press them in the same order. Then the next level has one more light.",
    stripSteps: ["Watch", "Your turn", "Next level"],
    stampsLabel: "The three ranks",
    animalCaption: "Animal groups, from the top group to the starting group",
    animalHeaders: ["Animal", "Group", "Fun IQ number"],
    qrCaption: "Scan to open on your phone",
    noAddress: "Ask the staff for the game address",
    wifiFirst: "Join the booth Wi-Fi first",
    wifiLabel: "Wi-Fi:",
    wifiBlank: "____________",
    wifiPassword: "Password:",
  },
  panels: [
    {
      id: "play",
      title: "Step right up!",
      paragraphs: [
        "Rhythm Rush is a memory and speed game.",
        "Watch the lights and listen to the notes.",
        "Then press the same buttons in the same order.",
      ],
    },
    {
      id: "how",
      title: "How to play",
      steps: [
        "Press START and wait for 3, 2, 1.",
        "Watch the lights and listen to the notes.",
        "Your turn: press the same buttons in the same order before time runs out.",
        "Get it right and the pattern gets one step longer.",
      ],
      paragraphs: ["Want to play again? Press RESET. During a game, hold it for about one second."],
    },
    {
      id: "lives",
      title: "Lives and time",
      paragraphs: [
        `You have ${f.lives} lives.`,
        "Press the wrong button, or take too long, and you lose a life.",
        "Then you try the same lights again.",
        `At level 1 you get ${secs(f.firstLimitSeconds)} seconds for each button.`,
        `The time gets shorter as you go up.`,
        `From level ${f.shortestFromLevel} you get ${secs(f.shortestLimitSeconds)} seconds.`,
        `There are ${f.levels} levels. Clear them all to win!`,
      ],
    },
    {
      id: "score",
      title: "Scoring",
      paragraphs: [
        `Each level you clear gives ${f.pointsPerLevel} points times the level number.`,
        `So level 2 gives ${2 * f.pointsPerLevel} points.`,
        `You also get up to ${f.bonusMax} bonus points for being quick.`,
        `Example: level 1 has ${f.example.lights} lights. You press them all in ${secs(f.example.seconds)} seconds.`,
        `You get ${f.example.levelPoints} points plus ${f.example.bonus} bonus points. That is ${f.example.total} points!`,
      ],
    },
    {
      id: "rank",
      title: "Your rank",
      paragraphs: [
        "We look at how you played the levels you cleared.",
        f.ranks ? "Right now, how fast you press matters most." : "We check how fast you press and how many you got right.",
      ],
      stamps: rankStamps("en"),
      notes: ["It is a fun estimate, not an official rating."],
    },
    {
      id: "animal",
      title: "Your animal",
      paragraphs: [
        "We find an earlier game that was like yours.",
        "The better that game scored compared with all the others, the higher your animal.",
        "Chimpanzee is the top group and Pig is the starting group.",
      ],
      table: animalRows("en"),
      notes: [
        "Just for fun, not a real IQ test.",
        "Ranks and animals are based on practice games and on the games played so far.",
        "So they can change as more people play.",
      ],
    },
    {
      id: "good",
      title: "Good to know",
      bullets: [
        "Everyone can see nicknames on the leaderboard, so keep yours friendly.",
        "The leaderboard shows the top 10 scores. Every game is saved, and you see your own place after you play.",
        "The lights and sounds come from the game console. This website is a live view of it.",
      ],
    },
  ],
  glossary: [
    ["Level", "One round of the game. Each level adds one more light."],
    ["Life", `A chance to keep playing. You start with ${f.lives}. A wrong press or running out of time costs one.`],
    ["Rank", "Beginner, Intermediate or Pro. It shows how well you played."],
    ["Bonus points", `Extra points for being quick, up to ${f.bonusMax} for each level.`],
    ["Fun IQ number", "A number that comes with your animal. Just for fun, not a real IQ test."],
  ],
}

// Filipino: simple everyday words; familiar English game words (level, score,
// button, start) are kept. NEEDS REVIEW by a native speaker.
const fil = {
  ui: {
    title: "Paano maglaro",
    intro: "Maikling gabay sa Rhythm Rush booth.",
    contents: "Nilalaman",
    jump: { play: "Laro", score: "Puntos", rank: "Ranggo", animal: "Hayop" },
    language: "Wika",
    print: "I-print ang pahinang ito",
    review: "Paalala: kailangan pang suriin ito ng isang katutubong nagsasalita ng Filipino.",
    glossary: "Ano ang ibig sabihin?",
    strip: "Panoorin ang mga ilaw. Pindutin ang mga ito sa parehong ayos. May dagdag na isang ilaw sa susunod na level.",
    stripSteps: ["Manood", "Ikaw na", "Susunod na level"],
    stampsLabel: "Ang tatlong ranggo",
    animalCaption: "Mga grupo ng hayop, mula sa pinakamataas hanggang sa panimula",
    animalHeaders: ["Hayop", "Grupo", "Fun IQ number"],
    qrCaption: "I-scan para buksan sa phone mo",
    noAddress: "Itanong sa staff ang address ng laro",
    wifiFirst: "Kumonekta muna sa Wi-Fi ng booth",
    wifiLabel: "Wi-Fi:",
    wifiBlank: "____________",
    wifiPassword: "Password:",
  },
  panels: [
    {
      id: "play",
      title: "Halika na!",
      paragraphs: [
        "Ang Rhythm Rush ay laro ng memorya at bilis.",
        "Panoorin ang mga ilaw at pakinggan ang mga nota.",
        "Pagkatapos, pindutin ang parehong mga button sa parehong ayos.",
      ],
    },
    {
      id: "how",
      title: "Paano maglaro",
      steps: [
        "Pindutin ang START at hintayin ang 3, 2, 1.",
        "Panoorin ang mga ilaw at pakinggan ang mga nota.",
        "Ikaw na: pindutin ang parehong mga button sa parehong ayos bago maubos ang oras.",
        "Kapag tama, hahaba ng isang hakbang ang pattern.",
      ],
      paragraphs: ["Gusto mong maglaro ulit? Pindutin ang RESET. Habang may laro, diinan ito nang mga isang segundo."],
    },
    {
      id: "lives",
      title: "Buhay at oras",
      paragraphs: [
        `May ${f.lives} buhay ka.`,
        "Kapag mali ang pinindot mo o natagalan ka, bawas ng isang buhay.",
        "Uulitin mo ang parehong mga ilaw.",
        `Sa level 1, may ${secs(f.firstLimitSeconds)} segundo ka sa bawat button.`,
        "Umiikli ang oras habang tumataas ang level.",
        `Mula level ${f.shortestFromLevel}, ${secs(f.shortestLimitSeconds)} segundo na lang.`,
        `May ${f.levels} level. Tapusin lahat para manalo!`,
      ],
    },
    {
      id: "score",
      title: "Puntos",
      paragraphs: [
        `Bawat level na natapos mo ay ${f.pointsPerLevel} puntos na beses ang numero ng level.`,
        `Kaya ang level 2 ay ${2 * f.pointsPerLevel} puntos.`,
        `May dagdag pang hanggang ${f.bonusMax} bonus points kapag mabilis ka.`,
        `Halimbawa: may ${f.example.lights} ilaw ang level 1. Napindot mo lahat sa ${secs(f.example.seconds)} segundo.`,
        `Makakakuha ka ng ${f.example.levelPoints} puntos at ${f.example.bonus} bonus points. ${f.example.total} puntos lahat!`,
      ],
    },
    {
      id: "rank",
      title: "Ang ranggo mo",
      paragraphs: [
        "Tinitingnan namin kung paano mo nilaro ang mga level na natapos mo.",
        f.ranks ? "Sa ngayon, pinakamahalaga kung gaano ka kabilis pumindot." : "Tinitingnan namin ang bilis mo at kung ilan ang tama mo.",
      ],
      stamps: rankStamps("fil"),
      notes: ["Masayang hula lang ito, hindi opisyal na marka."],
    },
    {
      id: "animal",
      title: "Ang hayop mo",
      paragraphs: [
        "Hinahanap namin ang naunang larong kahawig ng sa iyo.",
        "Kapag mas mataas ang score ng larong iyon kaysa sa iba, mas mataas ang hayop mo.",
        "Chimpanzee ang pinakamataas na grupo at Pig ang panimulang grupo.",
      ],
      table: animalRows("fil"),
      notes: [
        "Katuwaan lang, hindi totoong IQ test.",
        "Galing ang mga ranggo at hayop sa mga practice game at sa mga larong nalaro na.",
        "Kaya puwede itong magbago habang mas marami ang naglalaro.",
      ],
    },
    {
      id: "good",
      title: "Dapat mong malaman",
      bullets: [
        "Nakikita ng lahat ang mga nickname sa leaderboard, kaya maging magalang.",
        "Top 10 lang ang nasa leaderboard. Naka-save ang bawat laro, at makikita mo ang puwesto mo pagkatapos maglaro.",
        "Galing sa game console ang mga ilaw at tunog. Live view nito ang website na ito.",
      ],
    },
  ],
  glossary: [
    ["Level", "Isang round ng laro. May dagdag na isang ilaw bawat level."],
    ["Buhay", `Pagkakataong magpatuloy. ${f.lives} ang simula mo. Bawas ng isa ang maling pindot o pagkaubos ng oras.`],
    ["Ranggo", "Beginner, Intermediate o Pro. Ipinapakita nito kung gaano ka kahusay naglaro."],
    ["Bonus points", `Dagdag na puntos kapag mabilis ka, hanggang ${f.bonusMax} bawat level.`],
    ["Fun IQ number", "Numerong kasama ng hayop mo. Katuwaan lang, hindi totoong IQ test."],
  ],
}

export const LANGUAGES = { en: "English", fil: "Filipino" }
const TEXT = { en, fil }

// The brochure in one language; anything missing falls back to English.
export function brochure(lang) {
  const chosen = TEXT[lang] ?? en
  return {
    lang: TEXT[lang] ? lang : "en",
    ui: { ...en.ui, ...chosen.ui, jump: { ...en.ui.jump, ...chosen.ui?.jump } },
    panels: en.panels.map((panel) => ({ ...panel, ...(chosen.panels?.find((p) => p.id === panel.id) ?? {}) })),
    glossary: chosen.glossary?.length ? chosen.glossary : en.glossary,
  }
}

// For the wording tests: the raw language objects.
export const BROCHURE_TEXT = TEXT
