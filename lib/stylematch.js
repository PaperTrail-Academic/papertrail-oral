// stylematch.js — PaperTrail StyleMatch metric engine + report renderer
// Loaded as a content script before content.js (see manifest.json).
// Exposes window.__wpaStyleMatch with three public entry points used by the
// StyleMatch panel UI:
//
//   - smWords(text)
//       Word tokenizer. Used by content.js for the 500-word minimum gates,
//       word-count badges in the panel, and several Verify pre-flight checks.
//
//   - smComputeScores(textA, textB)
//       Returns the eight algorithmic similarity scores in the shape Verify
//       Compare expects under `body.algorithmicScores`. Called immediately
//       after a successful StyleMatch run (cached on smLastScores) and again
//       as a fallback inside the Verify Compare click path.
//
//   - smOpenReportPopup(textA, textB, metadata)
//       Opens the standalone StyleMatch report in a new window. The metadata
//       arg is the smMetadata object owned by content.js (student name,
//       course, assignment, etc.). Was previously a closure read; now passed
//       explicitly so this module can live outside content.js's scope.
//
// Everything else in this file (dictionaries, per-metric profilers,
// similarity functions, Burrows' Delta, the popup writer, the report HTML
// builder) is internal — no other module reaches in.
//
// Pure functions, no DOM mounting, no Chrome storage, no message passing.
// chrome.runtime.getURL is used only to resolve the icon for the popup.
//
// Research basis:
//   - Burrows (2002)        — Delta authorship attribution
//   - Koppel et al. (2009)  — function-word stylometry
//   - Coh-Metrix (2014)     — discourse markers, cohesion
//
// History: extracted from content.js as part of Phase 1.3 of the May 2026
// refactor (REFACTOR_PLAN.md). Behavior is identical to the previous inline
// implementation except for the smOpenReportPopup metadata parameter.

(function () {
  'use strict';

  if (window.__wpaStyleMatch) return;

  // ─── StyleMatch metric engine ─────────────────────────────────────────────────
  // All pure functions — no DOM access, no async, no side effects.

  // ── Word lists ───────────────────────────────────────────────────────────────
  // List 1: Grammatical function words. Expanded v2 list (95 words after dedup),
  // pulled from Burrows 2002, BNC top-100, and Mosteller-Wallace markers.
  // Validated 2026-05-09 on a 29-sample, 10-student corpus: cosine of MFW
  // frequencies on this list gave d=0.26 all-pairs (small but consistent
  // signal). The v3.1.0 production list was 30 words, proportional sim.
  // Used unconsciously and stable per writer; weakest of the displayed
  // metrics but earns its place because it's a different evidence type
  // from the sentence-shape and discourse-marker metrics.
  var SM_GRAMMATICAL_WORDS_RAW = [
    'the','a','an','this','that','these','those','some','any','all','no','one','two',
    'i','you','he','she','it','we','they','me','him','her','us','them',
    'my','your','his','its','our','their','myself','himself','herself','themselves',
    'who','whom','what','which','where','when','why','how',
    'is','was','are','were','be','been','being','have','has','had','having','do','does','did','done',
    'will','would','can','could','may','might','must','shall','should','ought',
    'in','on','at','to','for','of','with','by','from','about',
    'into','out','up','down','through','over','under','between','before','after',
    'and','or','but','if','as','than','because','since','while','though','also','so',
    'not','very','too','then','there','here','only','more','most','other','such',
    'just','now','still','many','much','few','well','even','like'
  ];
  var SM_GRAMMATICAL_WORDS = Array.from(new Set(SM_GRAMMATICAL_WORDS_RAW));

  // List 2: Discourse markers / stance — how writers structure and signal
  // argument. Used by the discourse-marker frequency metric (proportional
  // similarity, d=0.61 all-pairs) AND by the v3 Discourse-Marker Position
  // metric (sparse cosine on {marker}_{position} keys, d=1.11 within-genre).
  // The same word list, two different views: how often vs where.
  var SM_FUNCTION_WORDS = [
    'however','therefore','furthermore','moreover','although','nevertheless',
    'consequently','additionally','similarly','alternatively','meanwhile',
    'suggests','argues','demonstrates','indicates','implies','perhaps',
    'clearly','obviously','certainly','arguably','typically',
    'because','since','thus','hence','whereas','despite','through','whether'
  ];

  function smWords(text) {
    return ((text || '').toLowerCase().match(/\b[a-z']+\b/g) || []);
  }

  // Sentence tokenizer (revised 2026-05-10).
  //   Lookbehind:  terminal . ! ? or ;  optionally followed by a closing quote
  //                or paren (handles American convention: ."  and parenthetical
  //                breaks like ".)" — the closing mark belongs to the prior
  //                sentence). Both ASCII (" ') and Unicode curly (" ' ' ')
  //                closing quotes are accepted.
  //   Lookahead:   capital letter, opening quote, or opening paren/bracket
  //                (handles parenthetical citations like "(Source A)" and
  //                bracketed citations like "[1]" starting a new sentence).
  //                Both ASCII (" ') and Unicode curly opening (" ' ' ')
  //                quotes are accepted as sentence starts.
  // Four categories of fix vs. previous version:
  //   1. ".  (Source A) Next sentence." — was a single 50+ word run-on.
  //   2. ".  Next sentence." — quote-period (American convention)
  //      did not split, fused two sentences.
  //   3. "...; another clause." — semicolons now treated as soft sentence
  //      boundaries for length/rhythm purposes. Punctuation Fingerprint still
  //      counts semicolons independently from raw text, so no double-counting.
  //   4. UNICODE: Google Docs auto-converts straight quotes to curly. Real
  //      student essays are dominated by U+201C/U+201D and U+2018/U+2019
  //      (corpus survey 2026-05-10: 710 curly doubles vs 7 ASCII doubles).
  //      Earlier version of this regex matched ASCII only, so curly-quoted
  //      sentence boundaries silently failed to split. This produced single
  //      80+ word "sentences" wherever a student quoted a source.
  // Lowercase starts intentionally NOT permitted: would falsely split at
  // "e.g.", "i.e.", "etc.", "vs.", "et al." which appear regularly in source-
  // citing student writing.
  function smSentences(text) {
    var raw = (text || '').replace(/\s+/g, ' ').trim();
    try {
      return raw.split(/(?<=[.!?;]["'\u201D\u2019)\]]?)\s+(?=[A-Z"'\u201C\u2018(\[])/).filter(function(s) { return s.trim().length > 0; });
    } catch(e) {
      smSentences._unsupported = true;
      return raw.split(/[.!?;]+\s+/).filter(function(s) { return s.trim().length > 0; });
    }
  }

  // ── Syllable counter (v2 — 95% accuracy on common words) ────────────────────
  // Vowel-group rule + 98-word exception dictionary. Affects FK Grade only.
  // Tested at 95% accuracy on common words vs ~56% for the v1 vowel-counter.
  // The exception list covers common -tion, -ial, -ious endings and silent-e
  // edge cases. Validated 2026-05-09.
  var SYL_EXCEPTIONS = {
    'create':2,'created':3,'creates':2,'creating':3,'creation':3,
    'idea':3,'ideas':3,'ideal':3,
    'poem':2,'poems':2,'poet':2,'poetic':3,'poetry':3,
    'rhythm':2,'rhythms':2,'rhythmic':3,
    'business':2,'businesses':3,'businessman':3,
    'experience':4,'experienced':4,'experiences':4,'experiencing':5,
    'employee':3,'employees':3,'employer':3,'employment':3,
    'stadium':3,'stadiums':3,
    'quiet':2,'quietly':3,'quieter':3,
    'question':2,'questions':2,'questioned':2,'questioning':3,
    'interesting':3,'interests':2,
    'every':2,'everyone':3,'everything':3,'everybody':4,
    'family':3,'families':3,'familiar':4,
    'general':3,'generally':4,'generation':4,
    'government':3,'governments':3,
    'history':3,'historical':4,'historically':5,
    'memory':3,'memories':3,'memorial':4,
    'science':2,'sciences':3,'scientific':4,'scientist':4,
    'society':4,'societies':4,'social':2,'socially':3,
    'student':2,'students':2,'study':2,'studied':2,'studying':3,
    'really':2,'real':1,'reality':4,'realistic':4,'realize':3,
    'people':2,'peoples':2,
    'beautiful':3,'beauty':2,
    'finally':3,'final':2,'finale':3,'finals':2,
    'something':2,'therefore':2,'language':2,'changes':1,
    'aisle':1,'queue':1,'choir':1,'tongue':1,'guide':1,'guile':1,
    'guess':1,'guest':1,'guards':1,'eight':1,'weight':1,'though':1
  };

  function smSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '');
    if (!word.length) return 0;
    if (SYL_EXCEPTIONS.hasOwnProperty(word)) return SYL_EXCEPTIONS[word];
    if (word.length <= 2) return 1;
    if (/[^aeiouy]le$/.test(word) && word.length > 2) {
      // keep -le ending (e.g., 'table' = 2)
    } else if (/e$/.test(word) && !/[aeiouy]e$/.test(word)) {
      word = word.slice(0, -1);
    }
    var count = 0, i = 0;
    while (i < word.length) {
      if (/[aeiouy]/.test(word[i])) {
        var j = i;
        while (j < word.length && /[aeiouy]/.test(word[j])) j++;
        var group = word.slice(i, j);
        count++;
        if (group.length >= 3) {
          if (/iou|eou|uou/.test(group)) count++;
        } else if (group.length === 2) {
          if (/^(ia|io|ua|ue|ui|eo)$/.test(group)) count++;
        }
        i = j;
      } else { i++; }
    }
    if (/(t|s|c)ion$/.test(word)) count--;
    return Math.max(1, count);
  }

  function smWordProfile(text, wordList) {
    var w = smWords(text), total = w.length || 1, profile = {};
    wordList.forEach(function(fw) {
      profile[fw] = w.filter(function(x) { return x === fw; }).length / total;
    });
    return profile;
  }
  function smFunctionWordProfile(text)    { return smWordProfile(text, SM_FUNCTION_WORDS); }
  function smGrammaticalWordProfile(text) { return smWordProfile(text, SM_GRAMMATICAL_WORDS); }

  // ── Similarity functions ─────────────────────────────────────────────────────

  // Cosine of normalized frequency vectors over a fixed word list. Standard
  // stylometric similarity when no reference corpus is available (used in
  // Stylo R package, JGAAP). Used for grammatical function words and for the
  // sentence-length histogram.
  // For typical academic English, both texts share heavy weight on common
  // function words, so cosine values cluster high — same-author pairs
  // typically 0.85–0.95, different authors typically 0.80–0.90.
  // Small absolute differences are meaningful.
  function smCosineSim(pA, pB, keyList) {
    var dot = 0, magA = 0, magB = 0;
    keyList.forEach(function(k) {
      var a = pA[k] || 0, b = pB[k] || 0;
      dot += a * b;
      magA += a * a;
      magB += b * b;
    });
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  // Sparse-vector cosine for features with dynamic key sets — currently only
  // used by Discourse-Marker Position, where each text's profile contains
  // only the {marker}_{position} keys actually present in that text. Lab
  // validation 2026-05-09 confirmed within-genre Cohen's d = 1.11 with
  // displayable absolute values (same μ = 55%, diff μ = 31%).
  //
  // History: an earlier v2 effort tested sparse cosine on FW-start trigrams
  // and sentence-initial words but found absolute values clustered at 1–18%,
  // well below the 30%–95% displayability band. Those metrics were dropped.
  // Discourse-Marker Position works because the key space is small (~30
  // markers × 3 positions = 90 possible keys) and same-author pairs reliably
  // share several keys. Sparsity isn't a cosine problem when the key density
  // per text is high enough.
  function smSparseCosine(pA, pB) {
    var keys = {};
    Object.keys(pA).forEach(function(k) { keys[k] = true; });
    Object.keys(pB).forEach(function(k) { keys[k] = true; });
    var dot = 0, magA = 0, magB = 0;
    Object.keys(keys).forEach(function(k) {
      var a = pA[k] || 0, b = pB[k] || 0;
      dot += a * b; magA += a * a; magB += b * b;
    });
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  // Proportional frequency similarity — used for the discourse marker
  // FREQUENCY metric (different from discourse marker POSITION above).
  // Compares frequencies as ratios; immune to word count artifacts.
  // Retained only for SM_FUNCTION_WORDS; SM_GRAMMATICAL_WORDS now uses
  // cosine per the v3 engine validation 2026-05-09.
  function smProportionalSim(pA, pB, wordList) {
    var minBase = 0.002; // 2 per 1,000 words — below this, treat as equally absent
    var scores = wordList.map(function(w) {
      var a = pA[w] || 0, b = pB[w] || 0;
      return 1 - Math.abs(a - b) / Math.max(a, b, minBase);
    });
    return scores.reduce(function(s, v) { return s + v; }, 0) / wordList.length;
  }
  function smFunctionWordSim(pA, pB)      { return smProportionalSim(pA, pB, SM_FUNCTION_WORDS); }
  function smGrammaticalWordSim(pA, pB)   { return smCosineSim(pA, pB, SM_GRAMMATICAL_WORDS); }

  function smPunctuationProfile(text) {
    var len = text.length || 1;
    return {
      comma:     (text.match(/,/g)      || []).length / len * 1000,
      semicolon: (text.match(/;/g)      || []).length / len * 1000,
      emdash:    (text.match(/—|--|–/g) || []).length / len * 1000,
      colon:     (text.match(/:/g)      || []).length / len * 1000,
      exclaim:   (text.match(/!/g)      || []).length / len * 1000,
      question:  (text.match(/\?/g)     || []).length / len * 1000
    };
  }
  function smPunctuationSim(pA, pB) {
    var tol = { comma: 3, semicolon: 1, emdash: 1, colon: 1, exclaim: 0.5, question: 0.5 };
    var keys = Object.keys(tol), total = 0;
    keys.forEach(function(k) { total += Math.max(0, 1 - Math.abs((pA[k]||0) - (pB[k]||0)) / (tol[k] * 2)); });
    return total / keys.length;
  }

  // Trimmed-mean and trimmed-SD on sentence lengths (revised 2026-05-10).
  //
  // Previously: raw mean + raw SD over all sentence lengths.
  //
  // Problem with raw SD: at typical sample sizes (n ≈ 20–30 sentences),
  // a single outlier sentence shifts SD by 2–4 words. Tokenizer artifacts,
  // long quoted passages, and one-off rhetorical moves were producing
  // false-positive "Outside range" rhythm flags on same-author pairs.
  // The Dusty Argument-vs-Argument case that motivated this change had
  // SD = 23.7 vs 9.3 (production) — same writer, different essays —
  // driven primarily by 2–3 long sentences in one essay.
  //
  // Trimmed-mean and trimmed-SD drop the top 10% and bottom 10% of
  // sentence lengths before computing the statistic. With n=20, this
  // drops the 2 longest and 2 shortest sentences. The trimmed SD
  // captures the writer's central rhythm while ignoring exceptional
  // sentences that genuinely vary across drafting contexts.
  //
  // Lab corpus impact (53 samples, 1378 pairs, within-genre):
  //   Same-author rhythm Outside: 13% → 4%   (TrimSD strict improvement)
  //   Diff-author rhythm Outside: 35% → 31%  (slight discriminative cost)
  //   Cohen's d:                  0.53 → 0.56 (slightly more discriminative)
  // Validated against alternative dispersion measures (CV, MAD, IQR) in
  // the rhythm lab; TrimSD was the best balance of robustness and
  // discrimination. CV saturated; MAD too narrow a gap; IQR over-
  // flagged same-author. TrimSD wins on both bands and Cohen's d.
  //
  // The {avg, sd} return shape is preserved for backwards compatibility
  // with smSentenceLengthSim, smFKGrade, and the band-rendering code.
  function smSentenceLengthStats(text) {
    var sents = smSentences(text);
    if (!sents.length) return { avg: 0, sd: 0 };
    var lens = sents.map(function(s) { return smWords(s).length; });

    // Trim 10% from each end (floored). With n < 5, no trim — too few
    // sentences for trimming to be meaningful.
    var trimmed = lens.slice();
    if (trimmed.length >= 5) {
      trimmed.sort(function(a, b) { return a - b; });
      var k = Math.floor(trimmed.length * 0.10);
      trimmed = trimmed.slice(k, trimmed.length - k);
    }

    var avg = trimmed.reduce(function(a, b) { return a + b; }, 0) / trimmed.length;
    var sd  = Math.sqrt(trimmed.reduce(function(s, l) { return s + (l-avg)*(l-avg); }, 0) / trimmed.length);
    return { avg: Math.round(avg * 10) / 10, sd: Math.round(sd * 10) / 10 };
  }

  function smFKGrade(text) {
    var w = smWords(text), s = smSentences(text);
    if (!w.length || !s.length) return 0;
    var asl = w.length / s.length;
    var asw = w.reduce(function(n, wd) { return n + smSyllables(wd); }, 0) / w.length;
    return Math.round((0.39 * asl + 11.8 * asw - 15.59) * 10) / 10;
  }
  function smFKSim(a, b) { return Math.max(0, 1 - Math.abs(a - b) / 12); }

  // ── Sentence Length Histogram (NEW v3 — added 2026-05-09) ────────────────────
  // Buckets sentences by length (0–4, 5–9, 10–14, ..., 40+). 9 fixed buckets,
  // always dense — every essay populates most of them. Cosine similarity is
  // meaningful here because dimensionality is bounded and small. Captures
  // sentence-length *shape* in a way that avg + SD do not — a writer with
  // a bimodal distribution (lots of short, lots of long, few mediums) and
  // a writer with a bell-shaped distribution can have identical avg and SD
  // but very different histograms.
  //
  // Lab validation 2026-05-09 (29-sample, 10-student corpus):
  //   All-pairs:   same μ=82%, diff μ=71%, gap +12%, Cohen's d = 0.68
  //   Within-genre: same μ=86%, diff μ=70%, gap +16%, Cohen's d = 1.01
  //   Displayable: 🟢 in both views.
  // Reference: bucket-histogram comparison is a standard stylometric form
  // dating to Yule's word-length curves (1944) and updated for sentence
  // length in modern stylometry.
  var SLH_BUCKETS = ['b0','b1','b2','b3','b4','b5','b6','b7','b8'];
  function smSentenceLengthHistogram(text) {
    var sents = smSentences(text);
    var profile = { b0:0, b1:0, b2:0, b3:0, b4:0, b5:0, b6:0, b7:0, b8:0 };
    sents.forEach(function(s) {
      var len = smWords(s).length;
      var bucket = Math.min(Math.floor(len / 5), 8);  // 0–4, 5–9, ..., 40+
      profile['b' + bucket]++;
    });
    var total = sents.length || 1;
    Object.keys(profile).forEach(function(k) { profile[k] = profile[k] / total; });
    return profile;
  }
  function smSentenceLengthHistSim(pA, pB) {
    return smCosineSim(pA, pB, SLH_BUCKETS);
  }

  // ── Discourse-Marker Position (NEW v3 — added 2026-05-09) ────────────────────
  // For each discourse marker found in the text, classify its sentence
  // position: start (within first 3 words), end (within last 3 words),
  // or mid. Profile keys are {marker}_{position}, normalized over total
  // marker occurrences. Captures *positional habit* — does this writer
  // open paragraphs with "However,..." or fold "however" into the middle
  // of a sentence? — independently from raw discourse-marker frequency.
  //
  // Lab validation 2026-05-09 (29-sample, 10-student corpus):
  //   All-pairs:    same μ=52%, diff μ=32%, gap +20%, Cohen's d = 0.86
  //   Within-genre: same μ=55%, diff μ=31%, gap +24%, Cohen's d = 1.11
  //   By genre — Argument: d=1.87 ; Analysis: d=0.95
  //   Displayable: 🟢 within-genre, 🟡 cross-genre (same μ=50%, on threshold).
  // The standout finding from the v3.2.0 lab work. Strongest new metric;
  // provides genuinely independent evidence (positional, not lexical).
  // Reference: Hyland (Metadiscourse, 2005) on positional patterning of
  // metadiscourse markers as authorial trait.
  function smDiscourseMarkerPositionProfile(text) {
    var sents = smSentences(text);
    var profile = {};
    sents.forEach(function(s) {
      var w = smWords(s);
      if (w.length < 2) return;
      SM_FUNCTION_WORDS.forEach(function(marker) {
        var idx = w.indexOf(marker);
        if (idx === -1) return;
        var pos;
        if (idx < 3) pos = 'start';
        else if (idx >= w.length - 3) pos = 'end';
        else pos = 'mid';
        var key = marker + '_' + pos;
        profile[key] = (profile[key] || 0) + 1;
      });
    });
    // Normalize over total marker occurrences (rate per occurrence, not per word).
    // This ensures a writer who uses few markers but consistently puts them at
    // sentence-start gets a clean profile, rather than being dominated by zero
    // entries.
    var total = 0;
    Object.keys(profile).forEach(function(k) { total += profile[k]; });
    total = total || 1;
    Object.keys(profile).forEach(function(k) { profile[k] = profile[k] / total; });
    return profile;
  }
  function smDiscoursePositionSim(pA, pB) {
    return smSparseCosine(pA, pB);
  }

  // Words with the largest absolute frequency gap between samples A and B.
  function smTopVariants(pA, pB, wordList, n) {
    n = n || 4;
    var pairs = wordList.map(function(w) {
      return { word: w, diff: Math.abs((pA[w] || 0) - (pB[w] || 0)) };
    });
    pairs.sort(function(a, b) { return b.diff - a.diff; });
    return pairs.slice(0, n).map(function(p) { return p.word; });
  }

  // ── Package algorithmic scores for handoff to Verify ─────────────────────────
  // Called after a successful StyleMatch run. Packages the metric values
  // so Verify can anchor its AI analysis to identical numbers.
  // No composite or verdict — that's Verify's job, not StyleMatch's.
  //
  // v3.2.0 wire format (2026-05-09): 7 similarity fields.
  //   Renamed: functionWordSim → grammaticalSim (cosine of 95-word MFW vector)
  //   Added:   discourseSim (was computed but never wired through)
  //            discoursePositionSim (NEW — within-genre Cohen's d = 1.11)
  //            sentLengthHistSim    (NEW — within-genre Cohen's d = 1.01)
  //   Removed: ttrSim, informalitySim (Cohen's d ≈ 0 on student corpus)
  //
  // Edge function (index.ts) accepts both v3.1.0 (6 fields) and v3.2.0
  // (7 fields) shapes during the CWS rollout window — see backward-compat
  // shim there. Old field names will be removed in v3.3.0 once auto-update
  // has propagated.
  // ── Structural-marker hygiene (v3.4.0) ──────────────────────────────────────
  // Programmatic fills now compose marker-free prose, but teachers can paste
  // marker-bearing text manually (old reports, Verify exports). smWords
  // lowercases and matches \b[a-z']+\b — "[LIST]" would otherwise inject the
  // word "list" into TTR/FK/length stats, and unpunctuated marker lines fuse
  // into sentence rhythm. Strip the prefixes at every metrics entry point.
  function smStripMarkers(t) {
    return (t || '').replace(/^\[(HEADING|LIST|TABLE)\]\s*/gm, '');
  }

  function smComputeScores(textA, textB) {
    textA = smStripMarkers(textA);
    textB = smStripMarkers(textB);
    var fwA  = smFunctionWordProfile(textA),                fwB  = smFunctionWordProfile(textB);
    var gwA  = smGrammaticalWordProfile(textA),             gwB  = smGrammaticalWordProfile(textB);
    var ppA  = smPunctuationProfile(textA),                 ppB  = smPunctuationProfile(textB);
    var slA  = smSentenceLengthStats(textA),                slB  = smSentenceLengthStats(textB);
    var fkA  = Math.max(0, smFKGrade(textA)),               fkB  = Math.max(0, smFKGrade(textB));
    // v3 features
    var slhA = smSentenceLengthHistogram(textA),            slhB = smSentenceLengthHistogram(textB);
    var dmpA = smDiscourseMarkerPositionProfile(textA),     dmpB = smDiscourseMarkerPositionProfile(textB);

    var slAvgSim = Math.max(0, 1 - Math.abs(slA.avg - slB.avg) / 14);
    var slSDSim  = Math.max(0, 1 - Math.abs(slA.sd  - slB.sd)  / 8);

    return {
      grammaticalSim:        Math.round(smGrammaticalWordSim(gwA, gwB)     * 100),
      discourseSim:          Math.round(smFunctionWordSim(fwA, fwB)        * 100),
      discoursePositionSim:  Math.round(smDiscoursePositionSim(dmpA, dmpB) * 100),
      punctuationSim:        Math.round(smPunctuationSim(ppA, ppB)         * 100),
      sentenceLengthSim:     Math.round(((slAvgSim + slSDSim) / 2)         * 100),
      sentLengthHistSim:     Math.round(smSentenceLengthHistSim(slhA, slhB)* 100),
      fkSim:                 Math.round(smFKSim(fkA, fkB)                  * 100),
      // Raw values for prompt context (consumed by index.ts comparative prompt)
      fkA: fkA,   fkB: fkB,
      slA: slA,   slB: slB
    };
  }

  // ── Open report in a popup window ────────────────────────────────────────────
  // The popup runs in a null origin so chrome-extension:// URLs won't load.
  // Convert the icon to a data URI first (content script CAN read extension resources).
  function smOpenReportPopup(textA, textB, metadata) {
    var img = new Image();
    img.onload = function() {
      var iconUri = '';
      try {
        var cv = document.createElement('canvas');
        cv.width = 32; cv.height = 32;
        cv.getContext('2d').drawImage(img, 0, 0);
        iconUri = cv.toDataURL('image/png');
      } catch(e) {}
      smWriteReport(textA, textB, iconUri, metadata);
    };
    img.onerror = function() { smWriteReport(textA, textB, '', metadata); };
    img.src = chrome.runtime.getURL('icons/icon32.png');
  }

  function smWriteReport(textA, textB, iconUri, metadata) {
    var html = smBuildReportHTML(textA, textB, iconUri, metadata);
    var popup = window.open('', '_blank', 'width=940,height=800,resizable=yes,scrollbars=yes');
    if (!popup) { alert('Pop-up blocked. Please allow pop-ups for docs.google.com.'); return; }
    popup.document.write(html);
    popup.document.close();
    // Wire print button
    var printBtn = popup.document.getElementById('print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', function() {
        ['student-name','student-id','teacher-name','course-name','assignment','date-compared'].forEach(function(id) {
          var inp = popup.document.getElementById('rf-' + id);
          var out = popup.document.getElementById('rp-' + id);
          if (inp && out) out.textContent = inp.value.trim() || '—';
        });
        popup.print();
      });
    }
    // Wire "What is this?" expand buttons
    popup.document.querySelectorAll('button[data-exp]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var row = popup.document.getElementById(btn.getAttribute('data-exp'));
        if (!row) return;
        var opening = row.style.display === 'none';
        row.style.display = opening ? 'table-row' : 'none';
        btn.textContent = (opening ? '▼' : '▶') + ' What is this?';
      });
    });
    // Force <details> open before any print (Ctrl+P or our button).
    // CSS cannot override the browser's native <details> closed state.
    popup.addEventListener('beforeprint', function() {
      popup.document.querySelectorAll('details.fw-wrap').forEach(function(d) {
        d.setAttribute('open', '');
      });
    });
    popup.addEventListener('afterprint', function() {
      popup.document.querySelectorAll('details.fw-wrap').forEach(function(d) {
        d.removeAttribute('open');
      });
    });
    popup.focus();
  }

  // ── Build the full standalone report HTML string ──────────────────────────────
  function smBuildReportHTML(textA, textB, iconUri, metadata) {
    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function rd(n, d) { d = d || 1; return (Math.round(n * Math.pow(10,d)) / Math.pow(10,d)).toFixed(d); }
    var md = metadata || {};

    smSentences._unsupported = false;

    // Marker hygiene (v3.4.0) — same strip as smComputeScores; this function
    // recomputes profiles from raw textareas and must see identical text.
    textA = smStripMarkers(textA);
    textB = smStripMarkers(textB);

    // ── Compute all profiles ────────────────────────────────────────────────────
    var fwA  = smFunctionWordProfile(textA),    fwB  = smFunctionWordProfile(textB);
    var gwA  = smGrammaticalWordProfile(textA), gwB  = smGrammaticalWordProfile(textB);
    var ppA  = smPunctuationProfile(textA),     ppB  = smPunctuationProfile(textB);
    var slA  = smSentenceLengthStats(textA),    slB  = smSentenceLengthStats(textB);
    var fkA  = Math.max(0, smFKGrade(textA)),   fkB  = Math.max(0, smFKGrade(textB));
    // v3 features (added 2026-05-09)
    var slhA = smSentenceLengthHistogram(textA),         slhB = smSentenceLengthHistogram(textB);
    var dmpA = smDiscourseMarkerPositionProfile(textA),  dmpB = smDiscourseMarkerPositionProfile(textB);

    // ── Similarities (0–1) ──────────────────────────────────────────────────────
    var fwSim    = smFunctionWordSim(fwA, fwB);
    var gwSim    = smGrammaticalWordSim(gwA, gwB);
    var ppSim    = smPunctuationSim(ppA, ppB);
    var fkSim    = smFKSim(fkA, fkB);
    // Sentence length split into avg and SD rows.
    //
    // Avg-length denominator widened from 8 → 14. The /8 was a 2026 Crossley-
    // cited "ceiling of 6-8 words for same-author avg variation" — but the
    // 53-sample lab corpus shows same-author within-genre 90th-percentile
    // gap is 13.6 words (with trimmed mean), and earlier production iterations
    // of the engine ran avg at /15 in the Verify edge function. The /8 was
    // the wrong direction — it was producing forensic-tight readings on real
    // same-author drafting variation. /14 brings the geometry back in line:
    //   typical (median) same-author gap → ~82% similarity (Within)
    //   75th-percentile same-author gap → ~62% (Within / borderline)
    //   90th-percentile same-author gap → ~3% (correctly flagged Outside)
    //   median diff-author gap          → 50% (Notable, as expected)
    //
    // SD denominator widened from 6 → 8 to match the narrower gap distribution
    // produced by 10%-trimmed SD (see smSentenceLengthStats). The trim removes
    // outlier-driven spread, so the typical absolute gap between two writers'
    // trimmed SDs is smaller; /8 expresses the same band geometry on the new
    // scale. Same-author within-genre 90th-percentile trimmed-SD gap is 4.9
    // words; diff-author 90th-percentile is 10.4 — /8 separates them well.
    var slAvgSim = Math.max(0, 1 - Math.abs(slA.avg - slB.avg) / 14);
    var slSDSim  = Math.max(0, 1 - Math.abs(slA.sd  - slB.sd)  / 8);
    // v3 sims
    var slhSim   = smSentenceLengthHistSim(slhA, slhB);
    var dmpSim   = smDiscoursePositionSim(dmpA, dmpB);

    // ── Top variant words (still used for grammatical/discourse rows) ───────────
    var gwTop = smTopVariants(gwA, gwB, SM_GRAMMATICAL_WORDS, 4);
    var fwTop = smTopVariants(fwA, fwB, SM_FUNCTION_WORDS, 4);

    // ── Word counts ─────────────────────────────────────────────────────────────
    var wA = smWords(textA).length, wB = smWords(textB).length;

    var now = new Date().toLocaleString();

    // ── Per-metric band thresholds (recalibrated 2026-05-09 evening) ─────────────
    // Each metric has its own scale. similarFloor = (same-author mean) − ½σ
    // catches ~85% of the same-author distribution as "Within range" on a
    // unimodal assumption. divergentCeil = (different-author mean) marks
    // values below which the diff-author distribution is more dense than
    // the same-author distribution — values that are more typical of a
    // different writer than the writer themself.
    //
    // Low-signal guard: where the gap between same-author and diff-author
    // means is small enough that the metric can't reliably discriminate,
    // divergentCeil = 0 (never reads "Outside range"). Such metrics will
    // only show "Within range" or "Notable", reflecting that they can
    // contribute to a finding but cannot anchor one alone.
    //
    // 2026-05-09 evening recalibration: lowered similarFloor across all
    // metrics from same μ to (same μ − ½σ). Effect on the validation corpus:
    //   Same-author 'Within range' rate:  59% → 74%  (more greens)
    //   Same-author 'Notable' rate:       24% → 13%  (less yellow noise)
    //   Same-author 'Outside range' rate: 17% → 13%  (modest improvement)
    // The headline win is reducing yellow noise on same-author reports;
    // the residual ~13% Outside rate on same-author pairs reflects genuine
    // intra-author variation in the corpus (e.g., the Jiesong 0-vs-1 pair
    // has objectively different sentence shapes). Suppressing that further
    // would require dropping divergentCeil too, which weakens diff-author
    // pickup — accepted tradeoff: keep the metric honest about real drift.
    // Punctuation Fingerprint moved to low-signal (gap=5%, on the borderline).
    var SM_BAND_THRESHOLDS = {
      avgSentenceLength:      { similarFloor: 39, divergentCeil: 25 },
      sentenceRhythm:         { similarFloor: 35, divergentCeil: 32 },
      discoursePosition:      { similarFloor: 40, divergentCeil: 32 },
      sentenceLengthHist:     { similarFloor: 76, divergentCeil: 71 },
      punctuationFingerprint: { similarFloor: 77, divergentCeil:  0 },  // gap=5%, low-signal guard
      fkGrade:                { similarFloor: 65, divergentCeil: 63 },  // narrow Notable band — accept the squeeze
      discourseMarkers:       { similarFloor: 82, divergentCeil:  0 },  // gap=3%, low-signal guard
      grammaticalFW:          { similarFloor: 80, divergentCeil:  0 }   // gap=1%, low-signal guard
    };

    // ── Divergence cell: proportional bar + % + badge + one-line interpretation ──
    // Three bands: WITHIN RANGE (consistent with same-author baseline) /
    // NOTABLE (between same and diff means) / OUTSIDE RANGE (consistent with
    // different-author pairs). Vocabulary mirrors Verify's WITHIN_RANGE /
    // NOTABLE / ANOMALOUS dimension language for consistency across products.
    function divCell(sim, interp, metricKey) {
      var v = Math.round(sim * 100);
      var t = (metricKey && SM_BAND_THRESHOLDS[metricKey]) || { similarFloor: 80, divergentCeil: 55 };
      var label, color, bg;
      if (v >= t.similarFloor)        { label = 'Within range';  color = '#137333'; bg = '#e6f4ea'; }
      else if (v >= t.divergentCeil)  { label = 'Notable';        color = '#b06000'; bg = '#fef9e7'; }
      else                            { label = 'Outside range';  color = '#c5221f'; bg = '#fce8e6'; }
      return '<div style="display:flex;align-items:center;gap:6px;">' +
        '<div style="flex:1;min-width:60px;height:6px;background:#e8eaed;border-radius:3px;overflow:hidden;">' +
        '<div style="width:'+v+'%;height:100%;background:'+color+';border-radius:3px;"></div></div>' +
        '<span style="font-weight:700;font-size:11px;color:'+color+';white-space:nowrap;">'+v+'%</span>' +
        '<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;color:'+color+';background:'+bg+';white-space:nowrap;">'+label+'</span>' +
        '</div>' +
        (interp ? '<div style="font-size:10px;color:#5f6368;margin-top:3px;line-height:1.4;">'+esc(interp)+'</div>' : '');
    }

    // ── Metric row ───────────────────────────────────────────────────────────────
    var _rowId = 0;
    function metricRow(metric, valA, valB, sim, interp, explain, metricKey) {
      var id = 'exp' + (++_rowId);
      return '<tr>' +
        '<td style="padding:9px 10px;font-size:12px;font-weight:600;color:#3c4043;vertical-align:top;">' +
        esc(metric) + '<br>' +
        '<button data-exp="'+id+'" style="font-size:10px;color:#4A6FA5;background:none;border:none;' +
        'cursor:pointer;padding:2px 0;font-weight:600;font-family:inherit;">▶ What is this?</button></td>' +
        '<td style="padding:9px 10px;font-size:11px;color:#4A6FA5;font-weight:600;vertical-align:top;">'+esc(String(valA))+'</td>' +
        '<td style="padding:9px 10px;font-size:11px;color:#b06000;font-weight:600;vertical-align:top;">'+esc(String(valB))+'</td>' +
        '<td style="padding:9px 10px;min-width:190px;vertical-align:top;">'+divCell(sim, interp, metricKey)+'</td>' +
        '</tr>' +
        '<tr id="'+id+'" style="display:none;"><td colspan="4" style="padding:0 12px 10px;background:#fafafa;">' +
        '<div style="font-size:10px;color:#5f6368;line-height:1.6;padding:8px 10px;' +
        'background:#f8f9fa;border-radius:4px;border-left:2px solid #4A6FA5;">'+esc(explain)+'</div>' +
        '</td></tr>';
    }

    // ── Consistency tally: count + interpretive line ─────────────────────────────
    // Sits above the metric table. Two parts:
    //   (1) A count: "8 readings: X within range · Y notable · Z outside range"
    //   (2) A neutral one-line summary of the count distribution.
    //
    // This is deliberately NOT a verdict, NOT a percentage, NOT a composite
    // score, and NOT a metric ranking. It's a tally of band labels with a
    // one-line summary of the overall pattern. Teachers must still read the
    // metric table to understand which metric flagged and why; the tally
    // only helps orient them on first read.
    //
    // The interpretive line names no metrics and ranks none — the report
    // does not claim some metrics are stronger than others. Genre, task,
    // and corpus shape all influence which metrics carry signal in any
    // given comparison; the table itself is where the teacher reads it.
    function consistencyTally(metrics) {
      // metrics is an array of { key, sim }
      var counts = { within: 0, notable: 0, outside: 0 };
      metrics.forEach(function(m) {
        var v = Math.round(m.sim * 100);
        var t = SM_BAND_THRESHOLDS[m.key] || { similarFloor: 80, divergentCeil: 55 };
        var b;
        if (v >= t.similarFloor)        b = 'within';
        else if (v >= t.divergentCeil)  b = 'notable';
        else                             b = 'outside';
        counts[b]++;
      });

      // ── Interpretive line generation ─────────────────────────────────────────
      // Count-based, no metric-group ranking. Three patterns (assuming 7 metrics):
      //   - Majority Within (>=5 of 7):  readings align overall
      //   - Multiple Outside (>=3 of 7): several readings fall outside baseline
      //   - Otherwise:                   mixed / ambiguous
      // The `total` variable is computed from the metrics array, so this
      // logic remains correct if the metric set ever changes again.
      var total = counts.within + counts.notable + counts.outside;
      var line;
      if (counts.outside >= 3) {
        line = counts.outside + ' of ' + total + ' readings fall outside the same-author baseline. ' +
               'Examine each metric individually in the table below.';
      } else if (counts.within >= Math.ceil(total * 0.6)) {
        line = 'Most readings align with the same-author baseline. ' +
               'Examine each metric individually in the table below.';
      } else {
        line = 'Readings are mixed — several fall in the ambiguous zone between same-author and different-author baselines. ' +
               'Examine each metric individually in the table below.';
      }

      // ── Render ───────────────────────────────────────────────────────────────
      var pill = function(label, count, color, bg) {
        return '<span style="display:inline-block;padding:3px 10px;border-radius:12px;' +
               'font-size:11px;font-weight:700;color:' + color + ';background:' + bg + ';' +
               'margin-right:6px;white-space:nowrap;">' + count + ' ' + label + '</span>';
      };

      return '<div style="background:#fff;border-radius:8px;padding:14px 16px;' +
        'margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);">' +
        '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;' +
        'color:#80868b;font-weight:700;margin-bottom:8px;">Consistency Tally</div>' +
        '<div style="font-size:13px;font-weight:600;color:#3c4043;margin-bottom:8px;">' +
          metrics.length + ' metric readings &nbsp;·&nbsp; ' +
          pill('Within range', counts.within,  '#137333', '#e6f4ea') +
          pill('Notable',      counts.notable, '#b06000', '#fef9e7') +
          pill('Outside range',counts.outside, '#c5221f', '#fce8e6') +
        '</div>' +
        '<div style="font-size:11px;color:#5f6368;line-height:1.6;">' + esc(line) + '</div>' +
        '</div>';
    }

    // ── Word detail grid (per-mille rates, colour-coded by divergence) ────────────
    function wordGrid(pA, pB, wordList) {
      var items = wordList.map(function(w) {
        var rA = (pA[w] || 0) * 1000, rB = (pB[w] || 0) * 1000;
        var diff = Math.abs(rA - rB);
        var mean = (rA + rB) / 2 || 0.001;
        var color = (diff / mean > 0.4) ? '#c5221f' : (diff / mean > 0.15) ? '#b06000' : '#1a3a5c';
        var weight = (diff / mean > 0.15) ? '700' : '400';
        return '<div style="display:flex;justify-content:space-between;align-items:center;' +
          'padding:3px 7px;border-radius:3px;background:rgba(74,111,165,0.04);">' +
          '<span style="color:'+color+';font-weight:'+weight+';font-size:10px;min-width:90px;">'+esc(w)+'</span>' +
          '<span style="color:#4A6FA5;font-size:10px;font-weight:600;">'+rA.toFixed(1)+'‰</span>' +
          '<span style="color:#9aa0a6;font-size:9px;padding:0 4px;">vs</span>' +
          '<span style="color:#b06000;font-size:10px;font-weight:600;">'+rB.toFixed(1)+'‰</span>' +
          '</div>';
      });
      return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:10px 12px;">' +
        items.join('') + '</div>';
    }

    // ── Report fields (6 inputs, 3-column grid) ───────────────────────────────────
    var fieldDefs = [
      ['student-name', 'Student Name',       md.studentName  || ''],
      ['student-id',   'Student Number / ID', md.studentId   || ''],
      ['teacher-name', 'Teacher Name',        md.teacherName || ''],
      ['course-name',  'Course / Class',      md.course      || ''],
      ['assignment',   'Assignment',          md.assignment  || ''],
      ['date-compared','Date of Comparison',  md.date        || '']
    ];
    var inputFields = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;padding:4px 2px;">' +
      fieldDefs.map(function(fd) {
        return '<div><label style="display:block;font-size:11px;font-weight:700;color:#3c4043;margin-bottom:5px;">' +
          esc(fd[1]) + '</label>' +
          '<input id="rf-'+fd[0]+'" type="text" placeholder="\u2014" value="' + esc(fd[2]) + '" ' +
          'style="width:100%;border:1px solid #dadce0;border-radius:5px;padding:7px 10px;' +
          'font-size:12px;font-family:inherit;" /></div>';
      }).join('') + '</div>';
    var printFields = '<div class="print-only" style="display:none;margin-bottom:12px;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 20px;">' +
      fieldDefs.map(function(fd) {
        return '<div><span style="font-size:10px;font-weight:700;color:#3c4043;">' +
          esc(fd[1]) + ': </span><span id="rp-'+fd[0]+'" style="font-size:11px;color:#202124;"></span></div>';
      }).join('') + '</div></div>';

    // ── Chrome lookbehind warning ─────────────────────────────────────────────────
    var lookbehindWarn = smSentences._unsupported
      ? '<div style="background:#fce8e6;border:1px solid #f5c6c2;border-radius:6px;' +
        'padding:8px 12px;margin-bottom:12px;font-size:11px;color:#c5221f;font-weight:600;">' +
        '⚠ Sentence detection is limited because your Chrome version does not support a required ' +
        'browser feature. Update Chrome for full accuracy.</div>'
      : '';

    return [
      '<!DOCTYPE html><html><head><meta charset="UTF-8">',
      '<title>PaperTrail StyleMatch \u2014 Authorship Consistency Report</title>',
      '<style>',
      '*{box-sizing:border-box;margin:0;padding:0;}',
      'body{font-family:"Google Sans",Arial,sans-serif;background:#f0f4f9;color:#202124;}',
      '#topbar{background:#4A6FA5;padding:11px 16px;display:flex;align-items:center;gap:12px;}',
      '#topbar h1{flex:1;text-align:center;font-size:14px;font-weight:700;color:#fff;letter-spacing:.2px;margin:0;}',
      '#topbar h1 em{color:#C9A84C;font-style:italic;}',
      '.container{padding:14px 20px;max-width:920px;}',
      '.card{background:#fff;border-radius:8px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden;}',
      '.card-hdr{padding:10px 14px;background:#f8f9fa;font-size:12px;font-weight:700;' +
        'text-transform:uppercase;letter-spacing:.5px;color:#80868b;border-bottom:1px solid #e8eaed;}',
      '.card-hdr small{display:block;text-transform:none;font-weight:400;letter-spacing:0;' +
        'color:#f29900;font-size:10px;margin-top:2px;}',
      '.meta-bar{font-size:11px;color:#5f6368;background:#fff;border-radius:8px;' +
        'padding:8px 14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);}',
      '.genre-note{font-size:11px;color:#b06000;background:#fef9e7;border:1px solid #f8d78a;' +
        'border-radius:6px;padding:7px 12px;margin-bottom:12px;}',
      'table{width:100%;border-collapse:collapse;}',
      'thead th{padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;' +
        'letter-spacing:.4px;border-bottom:2px solid #e8eaed;text-align:left;}',
      'tbody tr:nth-child(4n+1) td{background:#fafbff;}',
      '.fw-wrap{background:#e8f0fe;border:1px solid #c5d8f7;border-radius:7px;' +
        'margin-top:8px;overflow:hidden;}',
      '.fw-wrap summary{padding:9px 14px;font-size:11px;font-weight:600;color:#4A6FA5;' +
        'cursor:pointer;list-style:none;user-select:none;}',
      '.fw-wrap summary::-webkit-details-marker{display:none;}',
      '.fw-wrap summary::before{content:"\u25b6  ";font-size:9px;}',
      '.fw-wrap[open] summary::before{content:"\u25bc  ";}',
      '#disclaimer{font-size:10px;color:#5f6368;line-height:1.65;background:#fff;' +
        'border-radius:8px;padding:12px 14px;margin-top:12px;' +
        'box-shadow:0 1px 3px rgba(0,0,0,.06);}',
      '#disclaimer strong{color:#202124;}',
      '.footer{text-align:center;font-size:10px;color:#9aa0a6;padding:16px 0 28px;}',
      '.print-only{display:none;}',
      '@media print{',
      '  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}',
      '  .no-print{display:none!important;}',
      '  .print-only{display:block!important;}',
      '  details.fw-wrap{display:block!important;}',
      '  details.fw-wrap summary{display:none!important;}',
      '  details.fw-wrap > div{display:grid!important;}',
      '  table tr[id^="exp"]{display:table-row!important;}',
      '  button[data-exp]{display:none!important;}',
      '}',
      '</style></head><body>',

      // ── Top bar ────────────────────────────────────────────────────────────────
      '<div id="topbar">',
      iconUri ? '  <img src="'+iconUri+'" style="width:32px;height:32px;flex-shrink:0;" />' : '',
      '  <h1>PaperTrail\u2122 <em>StyleMatch</em> \u2014 Authorship Consistency Report</h1>',
      '  <button id="print-btn" class="no-print" style="white-space:nowrap;padding:6px 14px;' +
        'background:#C9A84C;color:#fff;border:none;border-radius:5px;cursor:pointer;' +
        'font-weight:600;font-size:12px;font-family:inherit;">\uD83D\uDDA8 Print / Save PDF</button>',
      '</div>',

      '<div class="container">',
      lookbehindWarn,

      // ── Meta bar ───────────────────────────────────────────────────────────────
      '<div class="meta-bar">Controlled Sample: <strong>'+wA+' words</strong>' +
        ' &nbsp;\u00b7&nbsp; Submitted Work: <strong>'+wB+' words</strong>' +
        ' &nbsp;\u00b7&nbsp; Generated: '+esc(now)+'</div>',

      // ── Top-of-report disclaimer banner ────────────────────────────────────────
      '<div class="genre-note"><strong>About this report.</strong> ' +
        'This is a structured comparison of writing patterns \u2014 not a verdict on authorship. ' +
        'Comparisons are most interpretable when both samples are the <em>same kind of writing</em> ' +
        '(both analytical essays, both timed writes); cross-genre comparisons produce lower similarity ' +
        'regardless of authorship. ' +
        'Treat this as one input to a conversation, not evidence on its own.</div>',

      // ── Report fields ──────────────────────────────────────────────────────────
      '<div class="card no-print"><div class="card-hdr">Report Details</div>',
      '<div class="card-body">'+inputFields+'</div></div>',
      printFields,

      // ── Consistency tally ──────────────────────────────────────────────────────
      // Count of band labels across the 7 metrics + a one-line interpretive
      // summary. Sits above the metric table to orient teachers on first
      // read. Not a verdict — the teacher still has to read the table to
      // understand which metric flagged and why.
      //
      // 2026-05-10: dropped fkGrade from the tally. Lab analysis on 1378
      // pairs (17 students) showed FK Grade has Cohen's d = 0.55 against
      // same-author baseline AND correlates +0.67 with avgSentenceLength
      // and +0.68 with sentenceLengthHist — it duplicates signal already
      // counted by stronger metrics. Tally Cohen's d improves from 1.08
      // to 1.12 by removing it. FK is still computed (for the raw value
      // display) and still anchors Verify Compare's syntacticComplexity
      // dimension; only its tally vote is removed.
      consistencyTally([
        { key: 'avgSentenceLength',      sim: slAvgSim },
        { key: 'sentenceRhythm',         sim: slSDSim  },
        { key: 'discoursePosition',      sim: dmpSim   },
        { key: 'sentenceLengthHist',     sim: slhSim   },
        { key: 'punctuationFingerprint', sim: ppSim    },
        { key: 'discourseMarkers',       sim: fwSim    },
        { key: 'grammaticalFW',          sim: gwSim    }
      ]),

      // ── Metric table ───────────────────────────────────────────────────────────
      // v3.2.0 strongest-first ordering, validated 2026-05-09 on a 29-sample
      // 10-student labeled corpus. Cohen's d numbers in the "What is this?"
      // expansions for the new metrics document the lab finding.
      '<div class="card">',
      '<div class="card-hdr">Stylometric Metrics \u2014 Side by Side' +
        '<small>Compare each row independently &nbsp;\u00b7&nbsp; ' +
        'Cross-genre comparisons produce lower similarity regardless of authorship</small></div>',
      '<div style="padding:0;overflow-x:auto;"><table>',
      '<thead><tr>',
      '  <th style="width:22%;">Metric</th>',
      '  <th style="width:22%;color:#4A6FA5;">Controlled Sample</th>',
      '  <th style="width:22%;color:#b06000;">Submitted Work</th>',
      '  <th style="width:34%;color:#5f6368;">Divergence</th>',
      '</tr></thead><tbody>',

      metricRow('Avg Sentence Length',
        slA.avg + ' words / sentence',
        slB.avg + ' words / sentence',
        slAvgSim,
        'Avg gap: ' + rd(Math.abs(slA.avg - slB.avg), 1) + ' words / sentence',
        'Average number of words per sentence. Writers tend to have a characteristic sentence length ' +
        'that persists across tasks of the same kind, though it varies with genre and prompt.',
        'avgSentenceLength'),

      metricRow('Sentence Rhythm (Variation)',
        'SD ' + slA.sd + ' words',
        'SD ' + slB.sd + ' words',
        slSDSim,
        'SD gap: ' + rd(Math.abs(slA.sd - slB.sd), 1) + ' words',
        'Standard deviation of sentence lengths. Captures the writer\'s rhythm \u2014 a mix of short ' +
        'and long sentences vs. uniform length. For example: avg 20.0 vs 20.2 words/sentence looks ' +
        'identical, but SD 14.9 vs 6.7 reveals very different sentence rhythm. ' +
        'High SD = varied rhythm; low SD = uniform.',
        'sentenceRhythm'),

      metricRow('Discourse-Marker Position',
        Object.keys(dmpA).length + ' position patterns',
        Object.keys(dmpB).length + ' position patterns',
        dmpSim,
        'Where the writer places connectives and stance markers',
        'For each discourse marker (however, therefore, because, etc.), this metric records its ' +
        'sentence position \u2014 start, middle, or end. Captures whether a writer opens with ' +
        '"However,..." or buries "however" mid-sentence. Discourse positioning patterns tend to ' +
        'be stable within the same kind of writing, but vary with genre and register ' +
        '(Hyland, Metadiscourse, 2005).',
        'discoursePosition'),

      metricRow('Sentence Length Profile',
        'Distribution across 9 length buckets',
        'Distribution across 9 length buckets',
        slhSim,
        'Shape of the sentence-length distribution',
        'Distribution of sentence lengths across nine buckets (0\u20134 words, 5\u20139, 10\u201314, ' +
        'and so on through 40+). Captures the *shape* of a writer\'s sentence-length distribution, ' +
        'which two writers can match on average and standard deviation while still differing ' +
        'meaningfully \u2014 a bimodal distribution and a bell-shaped distribution can have ' +
        'identical means.',
        'sentenceLengthHist'),

      metricRow('Punctuation Fingerprint',
        'Comma ' + ppA.comma.toFixed(1) + '\u2030 \u00b7 Semi ' + ppA.semicolon.toFixed(1) + '\u2030 \u00b7 Dash ' + ppA.emdash.toFixed(1) + '\u2030',
        'Comma ' + ppB.comma.toFixed(1) + '\u2030 \u00b7 Semi ' + ppB.semicolon.toFixed(1) + '\u2030 \u00b7 Dash ' + ppB.emdash.toFixed(1) + '\u2030',
        ppSim,
        'Rates per 1,000 characters: comma, semicolon, dash, colon, !, ?',
        'Punctuation rates per 1,000 characters across comma, semicolon, em-dash, colon, exclamation, ' +
        'and question mark (Koppel, Schler & Argamon, JASIST 2009). Punctuation habits are largely ' +
        'unconscious and stable within a writer, but vary with genre and formality level.',
        'punctuationFingerprint'),

      // 2026-05-10: Flesch-Kincaid Grade row removed from the displayed table
      // and from the consistency tally above. Lab analysis (1378 pairs, 17
      // students) showed FK has Cohen's d = 0.55 — moderate — but more
      // importantly it correlates +0.67 with avgSentenceLength and +0.68
      // with sentenceLengthHist. It duplicates signal already counted by
      // stronger structural metrics, so its inclusion was inflating their
      // weight rather than adding an independent reading. Removing it
      // raises the tally's Cohen's d from 1.08 to 1.12. FK values are
      // still computed (fkA, fkB, fkSim) because Verify Compare uses them
      // as a syntacticComplexity anchor and they appear in that report's
      // raw-values footer.

      metricRow('Discourse Marker Profile',
        'Top variant: ' + fwTop.join(', '),
        'Top variant: ' + fwTop.join(', '),
        fwSim,
        'How often the writer uses each connective and stance marker',
        'Frequency profile across 29 discourse connectives and stance markers (however, therefore, ' +
        'suggests, etc.). Reflects how a writer structures argument and signals reasoning. ' +
        'Frequency profiles vary with genre and prompt; same-genre comparisons are more ' +
        'interpretable than cross-genre comparisons (Hyland, Metadiscourse, 2005). The ' +
        '"Top variant" words are those with the largest frequency gap between the two samples.',
        'discourseMarkers'),

      metricRow('Grammatical Function Words',
        'Top variant: ' + gwTop.join(', '),
        'Top variant: ' + gwTop.join(', '),
        gwSim,
        'Cosine of normalised function-word frequency vectors',
        'Cosine similarity of frequency vectors across 95 grammatical function words ' +
        '(the, and, is, of, etc.). These words are used largely unconsciously and tend to ' +
        'be relatively stable per writer within the same genre. Cosine of normalised frequencies ' +
        'is the standard stylometric similarity measure when no reference corpus is available ' +
        '(Markov, Stamatatos & Sidorov, 2018; Stylo R package, JGAAP). Cosine values cluster high ' +
        'in academic English \u2014 small absolute differences are meaningful. The "Top variant" ' +
        'words are those with the largest frequency gap.',
        'grammaticalFW'),

      '</tbody></table></div></div>',

      // ── Calibration note ────────────────────────────────────────────────────────
      // Explains the per-metric thresholds. Without this, teachers would ask
      // "why does 52% read as 'Within range' on one metric and 79% read as
      // 'Notable' on another?" — natural confusion when bands aren't uniform.
      '<div style="font-size:11px;color:#5f6368;background:#f8f9fa;border-radius:6px;' +
        'padding:10px 14px;margin:8px 0 16px;line-height:1.6;">' +
        '<strong>About these bands.</strong> Thresholds are calibrated against a labeled corpus of ' +
        'authentic student writing. <em>Within range</em> indicates a result consistent with how same-' +
        'student writing typically behaves on that metric; <em>Outside range</em> indicates a result ' +
        'more typical of different-student comparisons. Each metric has its own calibration because ' +
        'they vary in scale.' +
        '</div>',

      // ── Word detail sections ────────────────────────────────────────────────────
      // Detail expansions for the two word-list metrics. Burrows' Delta display
      // removed in v3.2.0; rates shown as per-mille frequencies.
      '<details class="fw-wrap">',
      '  <summary>Grammatical Function Word Detail' +
        ' &nbsp;<span style="font-size:9px;color:#4A6FA5;font-weight:400;">click to expand \u00b7 included in print</span></summary>',
      wordGrid(gwA, gwB, SM_GRAMMATICAL_WORDS),
      '</details>',

      '<details class="fw-wrap">',
      '  <summary>Discourse Marker Detail' +
        ' &nbsp;<span style="font-size:9px;color:#4A6FA5;font-weight:400;">click to expand \u00b7 included in print</span></summary>',
      wordGrid(fwA, fwB, SM_FUNCTION_WORDS),
      '</details>',

      // ── Disclaimer (legal/methodology — top banner covers the headline framing) ─
      '<div id="disclaimer">',
      '<strong>Important Notice:</strong> This report is produced by an automated stylometric ' +
        'analysis tool. It provides descriptive statistical metrics as one structured, repeatable ' +
        'data point to inform professional educator judgment. <strong>It does not constitute a ' +
        'finding or determination of academic dishonesty, plagiarism, or any academic integrity ' +
        'violation.</strong> This report must not be used as the sole or primary basis for any ' +
        'disciplinary action or formal academic integrity proceeding. All findings must be considered ' +
        'alongside direct student evidence, educator knowledge of the student, and other corroborating ' +
        'information, and applied in accordance with your institution\'s academic integrity policy ' +
        'and applicable regulations.',
      '<br><br>',
      '<strong>Methodology &amp; limitations:</strong> Stylometric scores are influenced by genre, ' +
        'topic, text length, and writing context. Cross-genre comparisons will produce lower similarity ' +
        'regardless of authorship \u2014 the disclaimer above the metric table summarises this. ' +
        'No text entered is transmitted to any server or stored in any form.',
      '<br><br>',
      '<strong>Research basis:</strong> Markov, Stamatatos &amp; Sidorov, ' +
        '<em>Information Processing &amp; Management</em> (2018); ' +
        'Koppel, Schler &amp; Argamon (JASIST 60:1, 2009); ' +
        'Hyland, Metadiscourse (Continuum, 2005); ' +
        'McNamara, Graesser, McCarthy &amp; Cai, Coh-Metrix (Cambridge UP, 2014); ' +
        'Kincaid et al. (1975). Minimum 500 words per sample required.',
      '</div>',

      '<div class="footer">PaperTrail StyleMatch v3.2.0 \u00b7 papertrailacademic.com \u00b7 Generated ' + esc(now) + '</div>',
      '</div></body></html>',
    ].join('\n');
  }

  // ─── Public API ─────────────────────────────────────────────────────────────
  window.__wpaStyleMatch = {
    smWords:           smWords,
    smComputeScores:   smComputeScores,
    smOpenReportPopup: smOpenReportPopup
  };
})();