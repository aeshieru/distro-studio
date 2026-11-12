// Hook lint: rules a hook can be checked against before posting.
// It does not predict views; it only reports facts about the words.

const TAGALOG = new Set(
  (
    "ang ng sa si ni mga na nang ay at o kung paano bakit ano sino saan kailan dito diyan doon " +
    "ikaw ka mo ko ako ako'y kita tayo kami kayo sila siya niya natin namin ninyo nila iyo 'yo sa'yo sayo " +
    "mong kang niyo nyo lang lamang din rin pa na nga naman pala ba po opo hindi huwag wag 'wag oo uy " +
    "isang isa dalawa tatlo ulan umulan umuulan ulap kalye basa tuyo kabila halaman tanim bulaklak araw " +
    "gabi buwan langit hangin init lamig bahay kuwarto mesa linis lilinis malinis dumi madumi " +
    "talaga sobra grabe kasi pero tapos para may wala meron gusto ayaw kaya pwede puwede baka sana " +
    "ito iyan iyon yan yun yung 'yung ganito ganyan ganoon dati ngayon bukas kahapon lagi minsan " +
    "tingnan tignan tingin alam bago luma maganda pangit mahal mura libre bili bayad " +
    "nakalimutan nakalimutang diligan dinilig hintay hinihintay mamatay namatay buhay sumilip " +
    "kanino iyong aking akin amin atin inyo kanila"
  ).split(/\s+/),
);

const YOU = new Set([
  "you", "your", "you're", "yours", "you'll", "you've",
  "ikaw", "ka", "mo", "mong", "kang", "iyo", "'yo", "sa'yo", "sayo", "niyo", "nyo", "kayo", "inyo", "iyong",
]);

export type Lang = "tl" | "en";

function clean(word: string) {
  return word.toLowerCase().replace(/[^a-z'ñ-]/g, "");
}

export function wordLang(word: string): Lang {
  const w = clean(word);
  if (TAGALOG.has(w)) return "tl";
  // Tagalog affixes and reduplication cues.
  if (/^(nag|mag|pag|naka|maka|ipa|pina|ika|um)[a-z]{3,}/.test(w) && !/(ing|tion|ed)$/.test(w)) return "tl";
  if (/ng$/.test(w) && !/(ing|ong|ang)$/.test(w)) return "tl";
  return "en";
}

export function syllables(word: string): number {
  const w = clean(word).replace(/'/g, "");
  if (!w) return 0;
  if (wordLang(word) === "tl") {
    // Tagalog: almost every vowel is its own syllable ("pa-a-no").
    const v = w.match(/[aeiou]/g)?.length ?? 0;
    const glides = w.match(/[aeiou](y|w)(?![aeiou])/g)?.length ?? 0;
    return Math.max(1, v - Math.floor(glides / 2));
  }
  // English: vowel groups, minus a silent trailing e.
  let count = w.match(/[aeiouy]+/g)?.length ?? 0;
  if (/[^aeiou]e$/.test(w) && count > 1) count -= 1;
  if (/[^aeiou]le$/.test(w)) count += 1;
  return Math.max(1, count);
}

export type HookLint = {
  words: number;
  syllables: number;
  landsAt: number; // seconds until the last word is spoken
  measured: boolean; // true when landsAt comes from real VO timing
  talksToYou: boolean;
  lang: "Taglish" | "Tagalog" | "English";
  opensQuestion: boolean;
  beforeDrop: boolean | null;
  banned: string[];
};

export function lintHook(
  text: string,
  opts: { pace: number; dropAt: number | null; banned?: string[]; measuredLandsAt?: number },
): HookLint {
  const tokens = text.split(/\s+/).filter((t) => /[a-zA-Zñ]/.test(t));
  const syl = tokens.reduce((n, t) => n + syllables(t), 0);
  const tl = tokens.filter((t) => wordLang(t) === "tl").length;
  const en = tokens.length - tl;
  const lang = tl && en ? "Taglish" : tl ? "Tagalog" : "English";
  // 0.15 s lead-in before the first word, like the brand's real VO.
  const landsAt = opts.measuredLandsAt ?? Math.round((0.15 + syl / opts.pace) * 10) / 10;
  const lower = text.toLowerCase();
  return {
    words: tokens.length,
    syllables: syl,
    landsAt,
    measured: opts.measuredLandsAt != null,
    talksToYou: tokens.some((t) => YOU.has(clean(t))),
    lang,
    opensQuestion: /[?]|\.\.\.|…/.test(text),
    beforeDrop: opts.dropAt == null ? null : landsAt <= opts.dropAt + 0.5,
    banned: (opts.banned ?? []).map((p) => p.trim()).filter((p) => p && lower.includes(p.toLowerCase())),
  };
}
