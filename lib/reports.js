// reports.js — PaperTrail report HTML builders
// Loaded as a content script before content.js (see manifest.json).
// Exposes window.__wpaReports so content.js can call these renderers
// without them living in the same 4,600-line file.
//
// Contains:
//   smBuildComparativeReportHTML(r, metadata, iconUri)
//     → Verify Baseline Deviation Report (comparative mode)
//   smBuildVerifyReportHTML(r, comparative, metadata, iconUri)
//     → Verify Consistency Report (single mode), delegates to Comparative for comparative mode
//
// Dependencies: none — pure functions, no DOM, no Chrome APIs, no engine functions.
// smBuildReportHTML (StyleMatch single report) remains in content.js — it re-runs
// the metric engine internally and cannot be separated from those functions.

(function () {
  'use strict';

  // ─── Comparative Report Renderer ──────────────────────────────────────────────
  // Dedicated renderer for analysisMode === 'comparative'.
  // Completely separate from single-sample report — no chunks, no heatmap.
  // Shows: headline deviation summary, algorithmic score panel, anomalous findings,
  //        baseline assessment, 11 dimension cards with research notes, recommended actions,
  //        disclaimer, and full academic references.

  function smBuildComparativeReportHTML(r, metadata, iconUri) { // eslint-disable-line no-unused-vars
    var esc = function(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    };
    var meta = metadata || {};
    var now = new Date().toLocaleString('en-US', {
      year:'numeric', month:'long', day:'numeric', hour:'numeric', minute:'2-digit'
    });

    var ds = r.deviationSummary || { anomalous: 0, notable: 0, withinRange: 0 };

    // Headline escalates on anomalous count first, then notable count. A "green light"
    // at 0 anomalous + 5 notable would be misleading — 5 meaningful differences is not
    // all clear, just not severe. Calibration below keeps the "no verdict" stance
    // while surfacing the actual weight of the evidence.
    var anomCount    = ds.anomalous || 0;
    var notableCount = ds.notable   || 0;
    var headlineColor, headlineBg, headlineLabel;
    if (anomCount >= 3) {
      headlineColor = '#c5221f'; headlineBg = '#fce8e6';
      headlineLabel = 'Significant Baseline Deviation';
    } else if (anomCount >= 1) {
      headlineColor = '#b06000'; headlineBg = '#fef3e2';
      headlineLabel = 'Notable Baseline Deviation';
    } else if (notableCount >= 6) {
      headlineColor = '#b06000'; headlineBg = '#fef3e2';
      headlineLabel = 'Extensive Stylistic Variation';
    } else if (notableCount >= 3) {
      headlineColor = '#b06000'; headlineBg = '#fef3e2';
      headlineLabel = 'Multiple Stylistic Differences';
    } else {
      headlineColor = '#137333'; headlineBg = '#e6f4ea';
      headlineLabel = 'Consistent with Baseline';
    }

    // Subtitle order: lead with the strongest signal so the teacher's eye lands
    // on what actually matters. When notable count dominates, surface that first.
    var headlineSubtitle = (anomCount === 0 && notableCount >= 3)
      ? (notableCount + ' notable difference' + (notableCount === 1 ? '' : 's') +
         ' · 0 anomalous · ' + (ds.withinRange || 0) + ' within range — across eleven research-grounded dimensions')
      : (anomCount + ' anomalous · ' + notableCount + ' notable · ' + (ds.withinRange || 0) +
         ' within range — across eleven research-grounded dimensions');

    // ── Dimension metadata — labels, icons, research descriptions ────────────
    var dimMeta = {
      functionWordDistribution: {
        label: 'Function Word Distribution',
        icon: '🔠',
        what: 'Function words — prepositions, conjunctions, articles, auxiliary verbs — are used largely unconsciously and tend to be relatively stable per writer within the same genre.',
        research: 'A foundational comparative feature in stylometric research, dating to the Federalist Papers attribution by Mosteller & Wallace (1964) and Burrows\' Delta method (2002). Recent LLM-era work (Nini et al., 2025) finds content words can carry comparable authorial signal in some conditions; function word patterns remain a foundational comparative feature.'
      },
      orthographicHabits: {
        label: 'Orthographic & Subword Habits',
        icon: '🔡',
        what: 'Character-level habits: contraction patterns, apostrophe and quotation mark conventions, comma placement, spelling variants, capitalisation tendencies.',
        research: 'Character and subword features tend to be relatively stable across genre and topic (Sapkota et al., 2014; Stamatatos, 2013). Writers rarely consciously control these patterns.'
      },
      punctuationMicroPatterns: {
        label: 'Punctuation Micro-Patterns',
        icon: '✏️',
        what: 'The functional use of punctuation: how colons, em-dashes, semicolons, and commas are deployed — not just how often, but in what structural contexts.',
        research: 'Punctuation n-grams have been used as features in authorship verification across different writing conditions (Lagutina et al., 2019; PAN authorship verification benchmarks).'
      },
      syntacticComplexity: {
        label: 'Syntactic Complexity',
        icon: '📐',
        what: 'How deeply the writer embeds clauses, whether sentences expand through coordination or subordination, and how variable complexity is across the sample.',
        research: 'Comparative studies of student vs. ChatGPT-generated argumentative essays have documented that machine-generated writing tends to show lower variability in syntactic complexity and a stronger preference for coordination over subordination (Liu & Liu, 2025; Przystalski et al., 2025). Anchored to Flesch-Kincaid and sentence length statistics (McNamara et al., 2014).'
      },
      syntacticPatterning: {
        label: 'Syntactic Patterning',
        icon: '🧩',
        what: 'Structural construction preferences distinct from complexity: characteristic POS sequences at sentence openings, clause-linking preferences, phrase-structure habits, and formulaic openings or closings.',
        research: 'Two writers may produce sentences of similar complexity but assemble them using different structural patterns. ChatGPT-generated argumentative essays have been documented to use rigid concluding patterns (e.g. "In conclusion, ...") and stereotyped openings (Herbold et al., 2023).'
      },
      cohesiveDeviceProfile: {
        label: 'Cohesive Device Profile',
        icon: '🔗',
        what: 'Which categories of transition the writer favours — additive (furthermore, moreover), contrastive (however, nevertheless), causal (therefore, consequently), or exemplification (for instance) — and whether the writer\'s category preferences shift between samples.',
        research: 'Comparative research on student vs. ChatGPT argumentative essays has found that human student writing typically uses MORE discourse markers than machine-generated essays (Goulart et al., 2024; Herbold et al., 2023). Higher discourse-marker frequency on its own is not a divergence signal; the relevant signal is a shift in category preferences or in the specific markers used.'
      },
      errorMechanicsFingerprint: {
        label: 'Error & Mechanics Fingerprint',
        icon: '🔍',
        what: 'Recurring grammar patterns, article errors, tense inconsistencies, comma splices — idiosyncratic mechanical habits. The absence of expected errors is as significant as their presence.',
        research: 'Comparative research on student vs. ChatGPT argumentative essays has documented that machine-generated writing contains substantially fewer mechanical errors than human student writing (Goulart et al., 2024). Unexpected error-free writing relative to a baseline with consistent errors is a documented authorship inconsistency indicator (Stamatatos, 2009).'
      },
      nominalVerbalStyle: {
        label: 'Nominal vs. Verbal Style',
        icon: '⚖️',
        what: 'Whether the writer favours noun-heavy constructions ("the implementation of", "a consideration of") or verb-driven ones ("implementing", "considering"), and the density of nominalisations.',
        research: 'Nominal vs. verbal style is a writer-stylistic preference (Biber, 1988). Comparative research on student vs. ChatGPT argumentative essays has consistently documented that machine-generated writing uses significantly more nominalisations and noun-based phrase bundles than student writing (Herbold et al., 2023; Goulart et al., 2024; Frontiers in Education, 2025).'
      },
      characteristicPhraseRecurrence: {
        label: 'Characteristic Phrase Recurrence',
        icon: '🗣️',
        what: 'Whether the same specific vocabulary, analytical phrases, hedging expressions, and idiosyncratic word choices recur across both samples.',
        research: 'Recent LLM-era authorship research (Nini et al., 2025) finds that content words — particularly nouns and characteristic phrases — can carry strong authorial signal, qualifying the prior assumption that function words dominate.'
      },
      lexicalDiversity: {
        label: 'Lexical Diversity',
        icon: '📚',
        what: 'The breadth of vocabulary used, assessed qualitatively because raw type-token ratio is length-sensitive and length-normalised measures (MATTR, MTLD) proved unreliable in calibration on student academic writing.',
        research: 'Comparative research on student vs. ChatGPT argumentative essays has consistently documented that machine-generated writing exhibits higher lexical diversity and more sophisticated vocabulary than student writing on the same prompt (Frontiers in Education, 2025; Goulart et al., 2024).'
      },
      engagementStanceMarkers: {
        label: 'Engagement & Stance Markers',
        icon: '💭',
        what: 'Modal verbs (might, could, may), epistemic markers (I think, it seems, perhaps), hedges (somewhat, possibly, in some cases), and authorial-presence constructions (in my view, I would argue) — how the writer signals stance toward their own claims.',
        research: 'Comparative research on student vs. ChatGPT argumentative essays has consistently documented that human student writing uses substantially more modal, epistemic, and hedging constructions than machine-generated writing, and shows greater authorial presence (Goulart et al., 2024; Herbold et al., 2023; Jiang & Hyland, 2024; Frontiers in Education, 2025).'
      }
    };

    // ── Deviation tier styling ─────────────────────────────────────────────
    function tierStyle(tier) {
      if (tier === 'ANOMALOUS') return { color: '#c5221f', bg: '#fce8e6', border: '#c5221f', label: '🔴 Anomalous' };
      if (tier === 'NOTABLE')   return { color: '#b06000', bg: '#fef3e2', border: '#b06000', label: '🟡 Notable' };
      return                           { color: '#137333', bg: '#e6f4ea', border: '#137333', label: '🟢 Within Range' };
    }

    // ── Algorithmic score bar ──────────────────────────────────────────────
    // Per-metric calibration table mirrors stylematch.js. similarFloor =
    // (same μ − ½σ); divergentCeil = (diff μ) for high-signal metrics, 0
    // for low-signal metrics (gap < ~5%). Recalibrated 2026-05-09 evening
    // from initial calibration to drop same-author Outside rate from 13% to
    // 9% on the validation corpus. Keep this table in sync with stylematch.js.
    var SM_BAND_THRESHOLDS = {
      avgSentenceLength:      { similarFloor: 39, divergentCeil: 25 },
      sentenceRhythm:         { similarFloor: 35, divergentCeil: 32 },
      discoursePosition:      { similarFloor: 40, divergentCeil: 32 },
      sentenceLengthHist:     { similarFloor: 76, divergentCeil: 71 },
      punctuationFingerprint: { similarFloor: 77, divergentCeil:  0 },  // gap=5%, low-signal guard
      fkGrade:                { similarFloor: 65, divergentCeil: 63 },
      discourseMarkers:       { similarFloor: 82, divergentCeil:  0 },  // gap=3%, low-signal guard
      grammaticalFW:          { similarFloor: 80, divergentCeil:  0 }   // gap=1%, low-signal guard
    };
    var algo = r.algorithmicScores || {};
    function algoBar(label, val, tooltip, metricKey) {
      var v = val || 0;
      var t = (metricKey && SM_BAND_THRESHOLDS[metricKey]) || { similarFloor: 70, divergentCeil: 40 };
      var col = v >= t.similarFloor ? '#137333' : v >= t.divergentCeil ? '#b06000' : '#c5221f';
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;" title="' + esc(tooltip||'') + '">' +
        '<span style="font-size:11px;color:#5f6368;min-width:150px;">' + esc(label) + '</span>' +
        '<div style="flex:1;height:6px;background:#e8eaed;border-radius:3px;overflow:hidden;">' +
          '<div style="width:' + v + '%;height:100%;background:' + col + ';border-radius:3px;"></div>' +
        '</div>' +
        '<span style="font-size:11px;font-weight:700;color:' + col + ';min-width:36px;text-align:right;">' + v + '/100</span>' +
      '</div>';
    }

    // ── Algorithmic consistency tally (mirrors stylematch.js) ───────────────
    // Counts band labels across the 6 algorithmic anchors, generates a one-
    // line interpretive summary based on which strong-signal metrics fell
    // where. The Verify Compare report has 6 metric rows — sentence rhythm
    // is folded into sentenceLengthSim in the wire format, and fkGrade was
    // removed from the tally on 2026-05-10 (lab analysis showed FK is
    // redundant with avgSentenceLength and sentenceLengthHist; correlation
    // > 0.65 with both). FK values are still displayed in the raw-values
    // footer below for reference and still anchor the syntacticComplexity
    // dimension in the LLM prompt.
    function consistencyTallyHTML(metrics) {
      var counts = { within: 0, notable: 0, outside: 0 };
      var byGroup = { strong:{within:0,notable:0,outside:0},
                      support:{within:0,notable:0,outside:0} };
      metrics.forEach(function(m) {
        var v = m.sim || 0;
        var t = SM_BAND_THRESHOLDS[m.key] || { similarFloor: 70, divergentCeil: 40 };
        var b = (v >= t.similarFloor) ? 'within' :
                (v >= t.divergentCeil) ? 'notable' : 'outside';
        counts[b]++; byGroup[m.group][b]++;
      });
      var strongTotal = byGroup.strong.within + byGroup.strong.notable + byGroup.strong.outside;
      var strongAlign = byGroup.strong.within;
      var strongDiverge = byGroup.strong.outside;
      var supportNotable = byGroup.support.notable;
      var supportOutside = byGroup.support.outside;
      var line;
      if (strongDiverge >= 2) {
        line = 'Strongest signals (sentence shape, discourse position) show notable divergence on ' +
               strongDiverge + ' of ' + strongTotal + ' readings — examine specifically.';
      } else if (strongAlign >= Math.ceil(strongTotal * 0.6)) {
        line = (supportOutside === 0 && supportNotable <= 1)
          ? 'Strongest signals align with same-author baseline; supporting metrics consistent.'
          : 'Strongest signals align with same-author baseline; some supporting metrics in the ambiguous zone.';
      } else {
        line = 'Strongest signals are mixed — sentence-shape and discourse metrics fall in the ambiguous zone between same-author and different-author baselines.';
      }
      var pill = function(label, count, color, bg) {
        return '<span style="display:inline-block;padding:2px 9px;border-radius:11px;' +
               'font-size:10px;font-weight:700;color:' + color + ';background:' + bg +
               ';margin-right:5px;white-space:nowrap;">' + count + ' ' + label + '</span>';
      };
      return '<div style="background:#f8f9fa;border-radius:6px;padding:10px 12px;margin:0 0 12px;">' +
        '<div style="font-size:12px;font-weight:600;color:#3c4043;margin-bottom:5px;">' +
          metrics.length + ' anchor readings &nbsp;·&nbsp; ' +
          pill('Within range',   counts.within,  '#137333', '#e6f4ea') +
          pill('Notable',        counts.notable, '#b06000', '#fef9e7') +
          pill('Outside range',  counts.outside, '#c5221f', '#fce8e6') +
        '</div>' +
        '<div style="font-size:11px;color:#5f6368;line-height:1.6;">' + esc(line) + '</div>' +
      '</div>';
    }

    var algoHTML = '<div style="margin-bottom:24px;">' +
      '<div class="section-hdr">StyleMatch Algorithmic Baseline</div>' +
      '<p style="font-size:11px;color:#5f6368;margin:0 0 12px;line-height:1.6;">These six scores were computed by the StyleMatch algorithmic engine and serve as quantitative anchors for the qualitative analysis below. They measure how similar the two samples are on each metric — lower scores indicate greater deviation from the baseline.</p>' +
      consistencyTallyHTML([
        { key: 'avgSentenceLength',      sim: algo.sentenceLengthSim,    group: 'strong'  },
        { key: 'discoursePosition',      sim: algo.discoursePositionSim, group: 'strong'  },
        { key: 'sentenceLengthHist',     sim: algo.sentLengthHistSim,    group: 'strong'  },
        { key: 'punctuationFingerprint', sim: algo.punctuationSim,       group: 'support' },
        { key: 'discourseMarkers',       sim: algo.discourseSim,         group: 'support' },
        { key: 'grammaticalFW',          sim: algo.grammaticalSim,       group: 'support' }
      ]) +
      // Strongest-first ordering — matches the StyleMatch standalone report.
      // FK Grade bar removed 2026-05-10 (redundant with avgSentenceLength /
      // sentenceLengthHist per lab validation; raw FK values still shown in
      // the footer below).
      algoBar('Avg Sentence Length', algo.sentenceLengthSim, 'Average sentence length and standard deviation similarity', 'avgSentenceLength') +
      algoBar('Discourse-Marker Position', algo.discoursePositionSim, 'Where the writer places connectives and stance markers (start / middle / end of sentence)', 'discoursePosition') +
      algoBar('Sentence Length Profile', algo.sentLengthHistSim, 'Shape of the sentence-length distribution across nine length buckets', 'sentenceLengthHist') +
      algoBar('Punctuation Fingerprint', algo.punctuationSim, 'Comma, semicolon, em-dash rates per 1,000 characters', 'punctuationFingerprint') +
      algoBar('Discourse Markers', algo.discourseSim, 'Frequency profile across 29 discourse connectives and stance markers', 'discourseMarkers') +
      algoBar('Grammatical Function Words', algo.grammaticalSim, 'Cosine of normalised function-word frequency vectors (95-word MFW list)', 'grammaticalFW') +
      (algo.raw ? '<div style="margin-top:10px;padding:8px 10px;background:#f8f9fa;border-radius:6px;font-size:11px;color:#5f6368;display:flex;flex-wrap:wrap;gap:12px;">' +
        '<span>FK Grade — Controlled: <strong>' + (algo.raw.fkA||'—') + '</strong> / Submitted: <strong>' + (algo.raw.fkB||'—') + '</strong></span>' +
        '<span>Avg Sentence — Controlled: <strong>' + (algo.raw.slA&&algo.raw.slA.avg||'—') + 'w</strong> / Submitted: <strong>' + (algo.raw.slB&&algo.raw.slB.avg||'—') + 'w</strong></span>' +
      '</div>' : '') +
    '</div>';

    // ── Deviation summary bar ──────────────────────────────────────────────
    var summaryHTML =
      '<div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:120px;padding:14px 16px;border-radius:8px;background:#fce8e6;border:1px solid #c5221f40;text-align:center;">' +
          '<div style="font-size:28px;font-weight:700;color:#c5221f;">' + ds.anomalous + '</div>' +
          '<div style="font-size:11px;color:#c5221f;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Anomalous</div>' +
          '<div style="font-size:10px;color:#80868b;margin-top:3px;">Exceeds expected variation</div>' +
        '</div>' +
        '<div style="flex:1;min-width:120px;padding:14px 16px;border-radius:8px;background:#fef3e2;border:1px solid #b0600040;text-align:center;">' +
          '<div style="font-size:28px;font-weight:700;color:#b06000;">' + ds.notable + '</div>' +
          '<div style="font-size:11px;color:#b06000;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Notable</div>' +
          '<div style="font-size:10px;color:#80868b;margin-top:3px;">Warrants attention</div>' +
        '</div>' +
        '<div style="flex:1;min-width:120px;padding:14px 16px;border-radius:8px;background:#e6f4ea;border:1px solid #13733340;text-align:center;">' +
          '<div style="font-size:28px;font-weight:700;color:#137333;">' + ds.withinRange + '</div>' +
          '<div style="font-size:11px;color:#137333;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Within Range</div>' +
          '<div style="font-size:10px;color:#80868b;margin-top:3px;">Consistent with baseline</div>' +
        '</div>' +
      '</div>';

    // ── 11 dimension cards ────────────────────────────────────────────────
    var dimCardsHTML = '';
    if (Array.isArray(r.dimensions)) {
      dimCardsHTML = r.dimensions.map(function(d) {
        var dm  = dimMeta[d.id] || { label: d.label || d.id, icon: '●', what: '', research: '' };
        var ts  = tierStyle(d.deviationTier);
        var subEvid = (d.submittedEvidence || []).map(function(e) {
          return '<span style="display:inline-block;background:#e8f0fe;color:#1a73e8;border-radius:5px;padding:2px 8px;font-size:11px;margin:2px;">' + esc(e) + '</span>';
        }).join('');
        var ctrlEvid = (d.controlledEvidence || []).map(function(e) {
          return '<span style="display:inline-block;background:#fef3e2;color:#b06000;border-radius:5px;padding:2px 8px;font-size:11px;margin:2px;">' + esc(e) + '</span>';
        }).join('');

        var qs = Array.isArray(d.discussionQuestions) ? d.discussionQuestions : [];
        var showQs = qs.length > 0 && d.deviationTier !== 'WITHIN_RANGE';
        var qsHTML = '';
        if (showQs) {
          qsHTML =
            '<div style="background:#f8f9fa;border-left:3px solid ' + ts.border + ';border-radius:4px;padding:10px 12px;margin-top:10px;">' +
              '<div style="font-size:10px;font-weight:700;color:' + ts.color + ';text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px;">Discussion Questions</div>' +
              '<ol style="margin:0;padding-left:18px;">' +
                qs.map(function(q) {
                  return '<li style="font-size:12px;color:#3c4043;line-height:1.55;margin-bottom:6px;">' + esc(q) + '</li>';
                }).join('') +
              '</ol>' +
            '</div>';
        }

        return '<div style="border:1px solid #e8eaed;border-radius:8px;padding:14px 16px;margin-bottom:10px;background:#fff;border-left:4px solid ' + ts.border + ';">' +
          // Header row
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
            '<span style="font-size:14px;">' + dm.icon + '</span>' +
            '<span style="font-size:13px;font-weight:700;color:#3c4043;flex:1;">' + esc(dm.label) + '</span>' +
            '<span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:8px;background:' + ts.bg + ';color:' + ts.color + ';">' + ts.label + '</span>' +
          '</div>' +
          // What this measures + research note
          '<div style="background:#f8f9fa;border-radius:6px;padding:8px 10px;margin-bottom:10px;">' +
            '<p style="font-size:11px;color:#3c4043;margin:0 0 4px;line-height:1.5;"><strong>What this measures:</strong> ' + esc(dm.what) + '</p>' +
            '<p style="font-size:10px;color:#80868b;margin:0;line-height:1.5;font-style:italic;"><strong>Research basis:</strong> ' + esc(dm.research) + '</p>' +
          '</div>' +
          // Evidence grid
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
            '<div>' +
              '<div style="font-size:10px;font-weight:700;color:#1a73e8;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px;">Submitted Work</div>' +
              '<div>' + (subEvid || '<em style="font-size:11px;color:#aaa;">—</em>') + '</div>' +
            '</div>' +
            '<div>' +
              '<div style="font-size:10px;font-weight:700;color:#b06000;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px;">Controlled Sample (Baseline)</div>' +
              '<div>' + (ctrlEvid || '<em style="font-size:11px;color:#aaa;">—</em>') + '</div>' +
            '</div>' +
          '</div>' +
          // Analysis
          (d.analysis ? '<p style="font-size:12px;color:#3c4043;line-height:1.6;margin:0;padding-top:8px;border-top:1px solid #f1f3f4;">' + esc(d.analysis) + '</p>' : '') +
          // Discussion Questions (only for NOTABLE/ANOMALOUS, absent silently for WITHIN_RANGE or older reports)
          qsHTML +
        '</div>';
      }).join('');
    }

    // ── Anomalous findings ────────────────────────────────────────────────
    var anomHTML = '';
    if (Array.isArray(r.anomalousFindings) && r.anomalousFindings.length) {
      anomHTML = '<div style="margin-bottom:24px;">' +
        '<h3 style="font-size:13px;font-weight:700;color:#c5221f;text-transform:uppercase;letter-spacing:.4px;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid #fce8e6;">🔴 Anomalous Findings</h3>' +
        '<p style="font-size:11px;color:#5f6368;margin:0 0 10px;line-height:1.6;">These dimensions deviate from the authenticated baseline in ways that exceed what different writing conditions would predict.</p>' +
        r.anomalousFindings.map(function(f) {
          return '<div style="border:1px solid #fce8e6;border-radius:7px;padding:12px 14px;margin-bottom:8px;background:#fffafa;">' +
            '<div style="font-size:12px;font-weight:700;color:#c5221f;margin-bottom:6px;">' + esc(f.dimension) + '</div>' +
            '<p style="font-size:12px;color:#3c4043;line-height:1.6;margin:0;">' + esc(f.finding) + '</p>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    // ── Contrast passages ─────────────────────────────────────────────────
    var contrastHTML = '';
    if (Array.isArray(r.contrastPassages) && r.contrastPassages.length) {
      contrastHTML = '<div style="margin-bottom:24px;">' +
        '<h3 style="font-size:13px;font-weight:700;color:#3c4043;text-transform:uppercase;letter-spacing:.4px;margin:0 0 6px;padding-bottom:6px;border-bottom:2px solid #e8eaed;">Passages of Interest</h3>' +
        '<p style="font-size:11px;color:#5f6368;margin:0 0 14px;line-height:1.6;">These passages illustrate the most significant stylistic differences between the submitted work and the controlled sample. No specialist knowledge is required to perceive the contrast.</p>' +
        r.contrastPassages.map(function(cp) {
          return '<div style="border:1px solid #e8eaed;border-radius:8px;overflow:hidden;margin-bottom:14px;">' +
            '<div style="background:#f8f9fa;padding:8px 14px;font-size:11px;font-weight:700;color:#3c4043;border-bottom:1px solid #e8eaed;">' +
              esc(cp.label || '') +
              (cp.dimension ? ' <span style="font-weight:400;color:#5f6368;">— ' + esc(cp.dimension) + '</span>' : '') +
            '</div>' +
            '<div style="display:flex;gap:0;">' +
              '<div style="flex:1;min-width:0;padding:14px;border-right:1px solid #e8eaed;">' +
                '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#4A6FA5;margin-bottom:8px;">Submitted Work</div>' +
                '<p style="font-size:12px;line-height:1.8;color:#3c4043;margin:0;white-space:pre-wrap;word-wrap:break-word;">' + esc(cp.submittedPassage || '') + '</p>' +
              '</div>' +
              '<div style="flex:1;min-width:0;padding:14px;">' +
                '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#b06000;margin-bottom:8px;">Controlled Sample</div>' +
                '<p style="font-size:12px;line-height:1.8;color:#3c4043;margin:0;white-space:pre-wrap;word-wrap:break-word;">' + esc(cp.controlledPassage || '') + '</p>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    // ── Baseline assessment ───────────────────────────────────────────────
    var assessHTML = r.baselineAssessment
      ? '<div style="background:#f8f9fa;border-left:4px solid #4A6FA5;border-radius:0 7px 7px 0;padding:14px 16px;margin-bottom:24px;">' +
          '<div style="font-size:11px;font-weight:700;color:#4A6FA5;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Baseline Assessment</div>' +
          '<p style="font-size:13px;color:#3c4043;line-height:1.7;margin:0;">' + esc(r.baselineAssessment) + '</p>' +
        '</div>'
      : '';

    // ── Recommended actions ───────────────────────────────────────────────
    var actHTML = '';
    if (Array.isArray(r.recommendedActions) && r.recommendedActions.length) {
      actHTML = '<div style="margin-bottom:24px;">' +
        '<h3 style="font-size:13px;font-weight:700;color:#3c4043;text-transform:uppercase;letter-spacing:.4px;margin:0 0 10px;">Recommended Next Steps</h3>' +
        r.recommendedActions.map(function(a, i) {
          return '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f1f3f4;">' +
            '<span style="font-size:14px;font-weight:700;color:#4A6FA5;min-width:20px;">' + (i+1) + '.</span>' +
            '<p style="font-size:12px;color:#3c4043;line-height:1.6;margin:0;">' + esc(a) + '</p>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    // ── References ────────────────────────────────────────────────────────
    var refsHTML =
      '<div style="margin-bottom:16px;">' +
        '<h3 style="font-size:12px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.4px;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e8eaed;">Research References</h3>' +
        '<div style="font-size:10px;color:#80868b;line-height:1.8;">' +
          '<p style="margin:0 0 3px;">Biber, D. (1988). <em>Variation across speech and writing.</em> Cambridge University Press.</p>' +
          '<p style="margin:0 0 3px;">Björklund, J., &amp; Zechner, N. (2017). Syntactic methods for topic-independent authorship attribution. <em>Natural Language Engineering, 23</em>(5), 789–806.</p>' +
          '<p style="margin:0 0 3px;">Burrows, J. (2002). Delta: A measure of stylistic difference and a guide to likely authorship. <em>Literary and Linguistic Computing, 17</em>(3), 267–287.</p>' +
          '<p style="margin:0 0 3px;">Covington, M. A., &amp; McFall, J. D. (2010). Cutting the Gordian knot: The moving-average type-token ratio (MATTR). <em>Journal of Quantitative Linguistics, 17</em>(2), 94–100.</p>' +
          '<p style="margin:0 0 3px;">Ferracane, E., Wang, S., &amp; Mooney, R. (2017). Leveraging discourse information effectively for authorship attribution. <em>IJCNLP 2017.</em></p>' +
          '<p style="margin:0 0 3px;">Lagutina, K., et al. (2019). A survey on stylometric text features. <em>25th Conference of FRUCT Association.</em></p>' +
          '<p style="margin:0 0 3px;">McNamara, D. S., et al. (2014). <em>Automated evaluation of text and discourse with Coh-Metrix.</em> Cambridge University Press.</p>' +
          '<p style="margin:0 0 3px;">Mosteller, F., &amp; Wallace, D. (1964). <em>Inference and disputed authorship: The Federalist.</em> Addison-Wesley.</p>' +
          '<p style="margin:0 0 3px;">PMC / National Library of Medicine. (2025). Attributing authorship via the perplexity of authorial language models. <em>PLoS ONE.</em> doi:10.1371/journal.pone.0320609</p>' +
          '<p style="margin:0 0 3px;">Sapkota, U., et al. (2014). Not all character n-grams are created equal. <em>NAACL-HLT 2015.</em></p>' +
          '<p style="margin:0;">Stamatatos, E. (2013). On the robustness of authorship attribution based on character n-gram features. <em>Journal of Law and Policy, 21</em>(2), 421–439.</p>' +
        '</div>' +
      '</div>';

    // ── Full HTML document ────────────────────────────────────────────────
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>PaperTrail Verify — Baseline Deviation Report</title>' +
      '<style>' +
        'body{font-family:"Google Sans",Arial,sans-serif;background:#f0f4f9;margin:0;padding:24px;}' +
        '.report{max-width:860px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);}' +
        '.report-topbar{background:#4A6FA5;padding:12px 20px;display:flex;align-items:center;gap:10px;}' +
        '.report-topbar h1{font-size:16px;font-weight:700;color:#fff;flex:1;margin:0;}' +
        '.report-topbar em{color:#C9A84C;font-style:italic;}' +
        '.report-body{padding:24px;}' +
        '.headline-bar{display:flex;align-items:center;gap:20px;padding:16px 20px;border-radius:8px;margin-bottom:20px;}' +
        '.meta-row{display:flex;flex-wrap:wrap;gap:16px;padding:12px 16px;background:#f8f9fa;border-radius:7px;margin-bottom:20px;font-size:12px;}' +
        '.meta-item{color:#5f6368;} .meta-item strong{color:#3c4043;}' +
        '.section-hdr{font-size:13px;font-weight:700;color:#3c4043;text-transform:uppercase;letter-spacing:.4px;margin:0 0 12px;padding-bottom:7px;border-bottom:2px solid #e8eaed;}' +
        '.disclaimer{font-size:10px;color:#80868b;line-height:1.6;padding:14px 16px;background:#f8f9fa;border-radius:6px;margin-top:8px;margin-bottom:16px;}' +
        '.footer{text-align:center;font-size:10px;color:#aaa;padding:16px 0 4px;}' +
        '@media print{' +
        '  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}' +
        '  body{background:#fff;padding:0;}' +
        '  .report{box-shadow:none;border-radius:0;}' +
        '  button{display:none!important;}' +
        '  .report-topbar{background:#4A6FA5!important;}' +
        '  .headline-bar,.dim-card,.algo-panel,.anomalous-block,.finding-card,.ref-list,.actions-list,.disclaimer{break-inside:avoid;page-break-inside:avoid;}' +
        '}' +
      '</style></head><body>' +
      '<div class="report">' +

      // Topbar
      '<div class="report-topbar">' +
        (iconUri ? '<img src="' + iconUri + '" style="width:32px;height:32px;" />' : '') +
        '<h1>PaperTrail\u2122 <em>Verify</em> — Baseline Deviation Report</h1>' +
        '<button id="verify-print-btn" style="padding:6px 14px;background:#C9A84C;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;">Print / Save PDF</button>' +
      '</div>' +

      '<div class="report-body">' +

      // Headline bar
      '<div class="headline-bar" style="background:' + headlineBg + ';border:1px solid ' + headlineColor + '20;">' +
        '<div style="font-size:40px;font-weight:700;color:' + headlineColor + ';min-width:60px;text-align:center;">' +
          ds.anomalous +
        '</div>' +
        '<div>' +
          '<div style="font-size:14px;font-weight:700;color:' + headlineColor + ';text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">' + esc(headlineLabel) + '</div>' +
          '<div style="font-size:12px;color:#5f6368;line-height:1.5;">' +
            esc(headlineSubtitle) +
          '</div>' +
          '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' +
            '<span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:8px;background:#4A6FA5;color:#fff;">Comparative Analysis</span>' +
            '<span style="font-size:11px;color:#5f6368;padding:2px 8px;background:#f1f3f4;border-radius:8px;">' + esc(r.submittedWordCount||'?') + '-word submitted vs. ' + esc(r.controlledWordCount||'?') + '-word baseline</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Meta row
      '<div class="meta-row">' +
        (meta.studentName ? '<span class="meta-item"><strong>Student:</strong> ' + esc(meta.studentName) + '</span>' : '') +
        (meta.assignment  ? '<span class="meta-item"><strong>Assignment:</strong> ' + esc(meta.assignment) + '</span>' : '') +
        (meta.course      ? '<span class="meta-item"><strong>Course:</strong> ' + esc(meta.course) + '</span>' : '') +
        '<span class="meta-item"><strong>Report ID:</strong> ' + esc(r.reportId) + '</span>' +
        '<span class="meta-item"><strong>Date:</strong> ' + esc(now) + '</span>' +
      '</div>' +

      // Algorithmic scores panel
      algoHTML +

      // Deviation summary
      summaryHTML +

      // Anomalous findings (before dimension cards — most important first)
      anomHTML +

      // Contrast passages
      contrastHTML +

      // Baseline assessment
      assessHTML +

      // Dimension cards
      '<div style="margin-bottom:24px;">' +
        '<div class="section-hdr">Ten-Dimension Baseline Deviation Analysis</div>' +
        '<p style="font-size:11px;color:#5f6368;margin:0 0 12px;line-height:1.6;">Each dimension below shows how the submitted work compares to the authenticated baseline on a research-validated stylometric signal. The controlled sample is treated as the baseline — the question is whether the submitted work behaves like writing from the same person.</p>' +
        dimCardsHTML +
      '</div>' +

      // Recommended actions
      actHTML +

      '<div class="disclaimer">' + esc(r.disclaimer || 'This report presents quantitative and AI-assisted stylometric analysis for educator reference only. It does not constitute evidence of academic misconduct and must not be used as the sole basis for any disciplinary action. All findings require professional educator judgment. PaperTrail Academic provides evidence — conclusions are always the responsibility of the reviewing educator.') + '</div>' +
      refsHTML +

      '<div class="footer">PaperTrail Verify v3.2.0 &middot; papertrailacademic.com &middot; ' + esc(now) + '</div>' +

      '</div></div>' +
      '</body></html>';
  }


  // ─── Process View Renderer (v3 — Printable Inspect Companion) ────────────────
  // Free, client-side renderer for the Process View popup. Designed to stand
  // alongside StyleMatch reports and Turnitin reports as a portable, printable
  // evidence document.
  //
  // What this renderer is for: showing the teacher (and giving them a hardcopy
  // of) everything Inspect surfaces about how a document was assembled —
  // sessions, struggle moments, paste events with text, and research-cited
  // writing-process metrics. No verdict, no AI, no server call.
  //
  // Signature: smBuildProcessReportHTML(r, metadata, iconUri, extras)
  //   - r        : reportData built in content.js (processInputs + metrics)
  //   - metadata : { studentName, assignment, course, teacherName, date }
  //   - iconUri  : data-URI of the PaperTrail icon (or '')
  //   - extras   : { sessions, struggleMoments, pasteEvents } — full lists for
  //                the printable Inspect panels. May be undefined for back-compat.
  //
  // Form fields (Student / Assignment / Course / Teacher / Date) render as
  // editable HTML <input> elements pre-filled from metadata. The teacher can
  // edit them in the popup before printing — values bake into the printed PDF.

  function smBuildProcessReportHTML(r, metadata, iconUri, extras) { // eslint-disable-line no-unused-vars
    var esc = function(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    };
    // Escape for use INSIDE an HTML attribute value (single-quote-delimited).
    // Catches all five HTML special chars so quotes don't break out of attrs.
    var attr = function(s) {
      return String(s || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    };
    var meta = metadata || {};
    var ex   = extras   || {};
    var now = new Date().toLocaleString('en-US', {
      year:'numeric', month:'long', day:'numeric', hour:'numeric', minute:'2-digit'
    });

    // ─── Interpretation helpers ─────────────────────────────────────────────────
    // Each helper takes a numeric value (plus context where needed) and returns
    // a short plain-English rationale tying the number to what it suggests for
    // this document. Voice: one or two sentences, reference the value, name the
    // threshold and direction, no jargon, no verdict language.

    function rationalePPR(value, flagged) {
      var pctTyped = Math.round(value * 100);
      var pctDeleted = 100 - pctTyped;
      if (flagged) {
        return 'About ' + pctTyped + '% of what was typed ended up in the final version — only ' + pctDeleted + '% was later deleted or revised. Values above 0.95 indicate very little revision activity during composition, which is unusual on a document of this size.';
      }
      if (value >= 0.85) {
        return 'About ' + pctTyped + '% of what was typed ended up in the final version, with ' + pctDeleted + '% revised or deleted along the way — light to moderate in-process revision.';
      }
      return pctDeleted + '% of everything the writer typed was later revised or deleted — an active revision process. Values above 0.95 would indicate minimal revision; this ratio sits well below that.';
    }

    function rationaleDeletion(pct, flagged) {
      if (flagged) {
        return 'The writer deleted only ' + pct + '% of what they typed. Research on typical student writing (Vandermeulen et al., 2020) finds 15–35% deletion ratios are common; ratios below 8% on a substantial document are atypical.';
      }
      if (pct >= 15 && pct <= 35) {
        return 'A ' + pct + '% deletion ratio falls squarely in the typical range for student writing (15–35% per Vandermeulen et al., 2020). The writer was actively editing as they composed.';
      }
      if (pct > 35) {
        return 'A ' + pct + '% deletion ratio is above the typical range (15–35%), indicating heavy revision. Many thoughtful writers revise heavily — interpret in context.';
      }
      return 'A ' + pct + '% deletion ratio sits below the typical 15–35% range but above the 8% threshold. The writer did some editing but less than most student writers.';
    }

    function rationaleStruggle(density, count, flagged) {
      if (count === 0) {
        return 'No struggle moments (sustained insert/delete loops in the same region) were detected. This could indicate composition with little back-and-forth, or a document too short or linear for loops to form.';
      }
      if (flagged) {
        return density + ' struggle moments per 1,000 characters is below the typical 0.5 threshold for a document of this size. Multi-session documents normally show more localised revision loops.';
      }
      return density + ' struggle moments per 1,000 characters indicates the writer repeatedly revised the same regions — a behavioural trace of active meaning-making during composition.';
    }

    function rationaleNonLocal(rate, flagged, totalDeleteOps) {
      var pct = Math.round(rate * 100);
      if (!totalDeleteOps || totalDeleteOps < 5) {
        return 'Too few deletions (' + (totalDeleteOps || 0) + ') to compute this reliably. The non-local revision rate requires a meaningful number of delete events.';
      }
      if (flagged) {
        if (pct === 0) {
          return 'No revisions happened significantly behind the writing frontier. Every edit was at the current end of the text. Research associates returns to earlier text with higher-order, idea-level revision (Stevenson et al., 2006).';
        }
        return 'Only ' + pct + '% of revisions happened significantly behind the writing frontier. Most edits were at the current end of the text — the writer did not often return to earlier paragraphs.';
      }
      if (rate >= 0.25) {
        return pct + '% of revisions occurred well behind the current writing frontier — the writer returned to earlier paragraphs to rethink or restructure. The behavioural signature of idea-level revision.';
      }
      return pct + '% of revisions happened behind the writing frontier — most edits local, with some non-local return to earlier text.';
    }

    function rationaleVariance(cv, flagged) {
      if (flagged) {
        return 'A coefficient of variation of ' + cv + ' indicates unusually uniform character production from save to save. Research finds production rates fluctuate as writers plan, evaluate, and revise (Crossley et al., 2024).';
      }
      if (cv >= 1.0) {
        return 'A CV of ' + cv + ' indicates highly variable production — bursts of typing followed by pauses, or shifts between long insertions and short ones. The non-linear rhythm characteristic of active composition.';
      }
      return 'A CV of ' + cv + ' indicates moderate variation in character production across save events.';
    }

    function rationaleMagnitude(mags, total) {
      if (total === 0) {
        return 'No struggle moments means no magnitude distribution to interpret. Short documents, very linear composition, or careful plan-first writing can all legitimately produce no struggle moments.';
      }
      var wordSwap = mags['word-swap'] || 0;
      var phraseRw = mags['phrase-rewrite'] || 0;
      var sentenceRw = (mags['sentence-rewrite'] || 0) + (mags['sentence-cut'] || 0);
      var paragraph = (mags['paragraph-rewrite'] || 0) + (mags['content-cut'] || 0);
      var higher = phraseRw + sentenceRw + paragraph;
      var wordPct = Math.round(wordSwap / total * 100);
      var higherPct = Math.round(higher / total * 100);
      if (higher === 0) {
        return 'All ' + total + ' struggle moment' + (total===1?'':'s') + ' were word-swap magnitude (≤ 20 chars churned). The writer made corrections but did not appear to rework phrases, sentences, or paragraphs during composition. This could reflect surface-level editing or careful pre-typing composition.';
      }
      if (paragraph > 0 && higher >= total / 2) {
        return higherPct + '% of struggle moments (' + higher + ' of ' + total + ') were at phrase, sentence, or paragraph magnitude — the writer reworked meaningful chunks of text during composition.';
      }
      if (wordPct >= 70) {
        return 'The profile is heavily weighted toward word-swap magnitude (' + wordPct + '%), with ' + higher + ' higher-magnitude revision' + (higher===1?'':'s') + '. Most activity was at the word level with some larger rework.';
      }
      return 'A mixed distribution across magnitudes — ' + wordSwap + ' word-swap, ' + phraseRw + ' phrase-rewrite, ' + sentenceRw + ' sentence-level, ' + paragraph + ' paragraph-scale.';
    }

    function rationaleActivity(agg) {
      var add = agg.totalAdditions || 0;
      var delPct = agg.deletionRatioPct || 0;
      var sessions = agg.sessionCount || 0;
      var minutes = Math.round((agg.writingTimeMs || 0) / 60000);
      var parts = [];
      parts.push(add.toLocaleString() + ' characters composed');
      parts.push('across ' + sessions + ' session' + (sessions===1?'':'s'));
      parts.push('over ' + minutes + ' minutes');
      parts.push('with a ' + delPct + '% deletion ratio');
      var leadText = parts.join(' ') + '.';

      var shapeNote;
      if (agg.pasteRatioPct >= 40) {
        shapeNote = 'This is a paste-heavy document — the typing-process metrics below are designed for typing-primary writing, so they may be less informative here. The Paste Activity panel will give you the more relevant view.';
      } else if (sessions === 1 && add > 2000) {
        shapeNote = 'Composed in a single session, which is unusual for a substantial piece of writing.';
      } else if (sessions >= 3 && delPct >= 10) {
        shapeNote = 'A multi-session document with meaningful deletion activity — the shape associated with extended, revisable composition.';
      } else if (delPct < 8 && add > 500) {
        shapeNote = 'A low deletion ratio on a substantial document — the writer did little editing in place.';
      } else {
        shapeNote = 'No single aggregate measure stands out from the typical range.';
      }
      return leadText + ' ' + shapeNote;
    }

    function rationalePaste(profile, events) {
      if (!profile || !profile.pasteEventCount) {
        return 'No paste events were detected. All content appears to have been typed directly into the document.';
      }
      var raw = profile.rawPasteRatioPct || 0;
      var adj = profile.adjustedPasteRatioPct || 0;
      var extSurviving = profile.externalSurvivingChars || 0;
      var extRemoved   = profile.externalRemovedChars   || 0;
      var extUnknown   = profile.externalUnknownSurvivalChars || 0;
      var intReuse     = profile.internalReuseChars     || 0;

      var parts = [];
      var gap = raw - adj;
      if (raw > 20 && adj < 5) {
        parts.push('The raw paste ratio of ' + raw + '% over-reports paste activity. After excluding content the writer later removed and internal cut-and-paste moves of their own text, only ' + adj + '% of the document came from external paste sources.');
      } else if (gap >= 20) {
        parts.push('Raw paste ratio is ' + raw + '%, but the adjusted ratio is ' + adj + '%. The gap means a substantial portion of what Google flagged as "paste" was either content the writer later removed or internal moves of their own text.');
      } else if (adj > 40) {
        parts.push(adj + '% of the final document came from external paste sources — a paste-dominated document.');
      } else if (extSurviving > 0) {
        parts.push(extSurviving.toLocaleString() + ' characters of external content survived into the final document (about ' + adj + '% of total additions).');
      } else {
        parts.push('All detected paste activity appears to be either internal moves or content later removed — no external content ended up in the final document.');
      }

      var notes = [];
      if (extRemoved > 500) {
        var eventCount = (events || []).filter(function(e) { return e.category === 'external-removed'; }).length;
        notes.push(extRemoved.toLocaleString() + ' characters of high-novelty content were brought in and later removed across ' + eventCount + ' event' + (eventCount === 1 ? '' : 's') + '. This can happen for benign reasons (accidental paste + undo, reference material held during composition then paraphrased away) or less benign ones — review individual events above.');
      }
      if (intReuse > 1000) {
        notes.push(intReuse.toLocaleString() + ' characters represent internal cut-and-paste moves — the writer rearranging their own previously-typed text. Routine composition behaviour.');
      }
      if (extUnknown > 0) {
        notes.push(extUnknown.toLocaleString() + ' characters could not be verified as present in the final document (survival check unavailable) and are counted conservatively in the adjusted ratio.');
      }

      return parts.join(' ') + (notes.length ? ' ' + notes.join(' ') : '');
    }

    function metricLabel(flag, flagDirection) {
      if (!flag) {
        return { text: 'Within typical range', bg: '#e8eaed', color: '#3c4043' };
      }
      if (flagDirection === 'high') {
        return { text: 'Above typical range', bg: '#f1f3f4', color: '#5f6368' };
      }
      return { text: 'Below typical range', bg: '#f1f3f4', color: '#5f6368' };
    }

    // Format a duration in ms as "Xm Ys" or "Xs"
    function fmtDuration(ms) {
      if (!ms || ms < 1000) return '< 1s';
      var s = Math.round(ms / 1000);
      if (s < 60) return s + 's';
      var m = Math.floor(s / 60);
      var rem = s % 60;
      if (m < 60) return m + 'm' + (rem > 0 ? ' ' + rem + 's' : '');
      var h = Math.floor(m / 60);
      var mrem = m % 60;
      return h + 'h' + (mrem > 0 ? ' ' + mrem + 'm' : '');
    }

    // Truncate paste text for display, preserving ~500 chars
    function truncateText(text, maxChars) {
      var s = String(text || '');
      if (s.length <= maxChars) return { text: s, truncated: false };
      return { text: s.slice(0, maxChars), truncated: true, fullLength: s.length };
    }

    // Format the multi-probe survival result into a teacher-readable line.
    // Probe labels from process.js: 'start' / 'middle' / 'end' (long pastes)
    // or 'whole' (short pastes that get a single combined probe).
    // Returns '' when no survival check was run (the caller skips the chip).
    function formatProbeDetails(ev) {
      if (!ev || !ev.hasSurvivalCheck) return '';
      var matched = Array.isArray(ev.probesMatched) ? ev.probesMatched : [];
      var total   = ev.probesTotal || 0;
      if (total === 0) return '';
      // Whole-probe case (short paste): collapse to "Found in final" / "Not found"
      if (total === 1 && matched[0] === 'whole') {
        return matched.length ? 'Found in final document.' : 'Not found in final document.';
      }
      // Multi-probe case (long paste)
      if (matched.length === 0) {
        return 'No probes found in final document — none of the start, middle, or end of this paste appears in the final.';
      }
      if (matched.length === total) {
        return 'All ' + total + ' probes (start, middle, end) found in final document.';
      }
      var labels = matched.join(' and ');
      return 'Partial match — found at ' + labels + ' of pasted text in final document (' + matched.length + ' of ' + total + ' probes).';
    }

    // Map process.js paste category → display chip
    var pasteCatMeta = {
      'external-surviving':         { label: 'External — in final',     bg: '#fef3e2', color: '#b06000' },
      'external-removed':           { label: 'External — removed',      bg: '#f1f3f4', color: '#5f6368' },
      'external-unknown-survival':  { label: 'External — unverified',   bg: '#f1f3f4', color: '#5f6368' },
      'internal-reuse':             { label: 'Internal reuse',          bg: '#e6f4ea', color: '#137333' },
      'unknown':                    { label: 'Unknown',                 bg: '#f1f3f4', color: '#5f6368' }
    };

    // Map struggle moment type → icon + color (mirrors the sidebar)
    var struggleTypeMeta = {
      'Early-Draft Revision':    { bg: '#e8f0fe', color: '#4A6FA5', icon: '💡' },
      'Sentence-Level Rewrite':  { bg: '#fef9e7', color: '#b06000', icon: '🔄' },
      'Content Removal':         { bg: '#fff0f0', color: '#c5221f', icon: '✂' },
      'Local Editing':           { bg: '#e6f4ea', color: '#137333', icon: '✏' }
    };

    // ────────────────────────────────────────────────────────────────────────────

    var inputs = r.processInputs || {};
    var agg    = inputs.aggregate || {};
    var mets   = inputs.metrics   || null;
    var mags   = agg.magnitudeCounts || {};
    var writingMin = Math.round((agg.writingTimeMs || 0) / 60000);

    // ── Observational callout ────────────────────────────────────────────────
    var observationalHTML =
      '<div style="background:#f0f7f6;border:1px solid #2a7a6b30;border-radius:8px;padding:14px 16px;margin-bottom:20px;">' +
        '<div style="font-size:12px;font-weight:700;color:#2a7a6b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">📊 Process View — Observational Data</div>' +
        '<p style="font-size:12px;color:#3c4043;line-height:1.6;margin:0 0 6px;">' +
          'This report describes <strong>how this document was assembled</strong> — sessions, revision activity, paste events, struggle moments, and writing-process metrics. ' +
          'It does not render a verdict. It does not analyse the writing itself. It does not suggest the work is or is not authentic.' +
        '</p>' +
        '<p style="font-size:12px;color:#3c4043;line-height:1.6;margin:0;">' +
          'Use this alongside <strong>StyleMatch</strong> for stylometric authorship comparison, <strong>Turnitin or similar tools</strong> for source-matching, and your own knowledge of the student and the assignment. Three independent signals make a much stronger evidence base than any one alone.' +
        '</p>' +
      '</div>';

    // ── Privacy callout ─────────────────────────────────────────────────────
    var privacyHTML =
      '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f0f9f4;border:1px solid #13733330;border-radius:7px;margin-bottom:20px;">' +
        '<span style="font-size:18px;">🔒</span>' +
        '<div style="font-size:11px;color:#137333;line-height:1.5;">' +
          '<strong>All analysis runs locally in your browser.</strong> ' +
          '<span style="color:#3c4043;">No document text is transmitted, no AI is involved, and no data is sent to any server. Process View reuses the revision-history data Google Docs already exposes to you.</span>' +
        '</div>' +
      '</div>';

    // ── Editable form fields ────────────────────────────────────────────────
    // <input> elements pre-filled from metadata; teacher edits before printing.
    // Inputs render with light borders on screen, no borders in print (CSS @print).
    var formFieldsHTML =
      '<div class="meta-form">' +
        '<div class="meta-field"><label>Student</label>' +
          '<input type="text" class="meta-input" value="' + attr(meta.studentName || '') + '" placeholder="Student name" /></div>' +
        '<div class="meta-field"><label>Assignment</label>' +
          '<input type="text" class="meta-input" value="' + attr(meta.assignment || '') + '" placeholder="Assignment title" /></div>' +
        '<div class="meta-field"><label>Course</label>' +
          '<input type="text" class="meta-input" value="' + attr(meta.course || '') + '" placeholder="Course name" /></div>' +
        '<div class="meta-field"><label>Teacher</label>' +
          '<input type="text" class="meta-input" value="' + attr(meta.teacherName || '') + '" placeholder="Teacher name" /></div>' +
        '<div class="meta-field"><label>Date</label>' +
          '<input type="text" class="meta-input" value="' + attr(meta.date || now) + '" placeholder="Date" /></div>' +
        '<div class="meta-field"><label>Report ID</label>' +
          '<div class="meta-static">' + esc(r.reportId || '—') + '</div></div>' +
      '</div>';

    // ── Paste-dominance banner ──────────────────────────────────────────────
    var pasteDominantBannerHTML = '';
    var pasteProfile = agg.pasteProfile || null;
    if (pasteProfile && (pasteProfile.adjustedPasteRatioPct || 0) >= 40) {
      pasteDominantBannerHTML =
        '<div style="background:#fef3e2;border:1px solid #f29900;border-radius:8px;padding:12px 14px;margin-bottom:20px;">' +
          '<div style="font-size:11px;font-weight:700;color:#b06000;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">⚠ Paste-Dominated Document</div>' +
          '<p style="font-size:11px;color:#3c4043;line-height:1.6;margin:0;">' +
            'About ' + (pasteProfile.adjustedPasteRatioPct || 0) + '% of the final document came from external paste sources. ' +
            'The typing-process metrics below are designed for typing-primary writing, so they will be less informative for this document. ' +
            'The <strong>Paste Activity</strong> panel will give you the more relevant view.' +
          '</p>' +
        '</div>';
    }

    // ── 1-line session summary — used in the Document Activity panel below ───
    // Computed from extras.sessions when available; gives the teacher a quick
    // temporal shape on the headline panel before they reach the appendix table.
    var sessionsListForSummary = Array.isArray(ex.sessions) ? ex.sessions : [];
    var sessionSummaryLine = '';
    if (sessionsListForSummary.length) {
      var firstStart = sessionsListForSummary[0].start || 0;
      var lastEnd    = sessionsListForSummary[sessionsListForSummary.length - 1].end || 0;
      var spanMs     = Math.max(0, lastEnd - firstStart);
      var spanDays   = spanMs > 0 ? Math.max(1, Math.round(spanMs / (24 * 60 * 60 * 1000))) : 0;
      // Find longest session by duration
      var longest = sessionsListForSummary.reduce(function(acc, s) {
        var d = s.duration || ((s.end || 0) - (s.start || 0)) || 0;
        return (d > acc.dur) ? { dur: d, label: s.durationLabel || fmtDuration(d) } : acc;
      }, { dur: 0, label: '' });

      var spanText = spanDays > 1
        ? 'over ' + spanDays + ' day' + (spanDays === 1 ? '' : 's')
        : 'in a single day';
      sessionSummaryLine = 'Composed across ' + sessionsListForSummary.length +
        ' session' + (sessionsListForSummary.length === 1 ? '' : 's') + ' ' + spanText +
        (longest.label ? '; longest session ' + longest.label : '') + '.';
    }

    // ── Document activity panel ─────────────────────────────────────────────
    var activityHTML =
      '<div style="border:1px solid #e8eaed;border-radius:8px;padding:14px 16px;margin-bottom:20px;background:#fff;">' +
        '<div class="section-hdr">Document Activity Summary</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px;">' +
          activityCell('Characters added',   (agg.totalAdditions || 0).toLocaleString()) +
          activityCell('Characters deleted', (agg.totalDeletions || 0).toLocaleString()) +
          activityCell('Deletion ratio',     (agg.deletionRatioPct != null ? agg.deletionRatioPct + '%' : '—')) +
          activityCell('Final length',       (agg.finalDocLength || 0).toLocaleString() + ' chars') +
          activityCell('Writing time',       writingMin + ' min') +
          activityCell('Sessions',           (agg.sessionCount || 0)) +
          activityCell('Struggle moments',   (agg.struggleCount || 0)) +
          activityCell('Paste events',       (agg.pasteCount || 0) + ((agg.pasteRatioPct||0) > 0 ? ' (' + agg.pasteRatioPct + '% of additions)' : '')) +
        '</div>' +
        // Session summary line — points the teacher to the Sessions appendix
        (sessionSummaryLine
          ? '<div style="font-size:11px;color:#5f6368;margin-bottom:10px;font-style:italic;">' +
              esc(sessionSummaryLine) + ' <span style="color:#80868b;">(See Writing Sessions appendix below for the full breakdown.)</span>' +
            '</div>'
          : '') +
        '<div style="padding:10px 12px;background:#f8f9fa;border-left:3px solid #4A6FA5;border-radius:4px;font-size:12px;color:#3c4043;line-height:1.6;">' +
          esc(rationaleActivity(agg)) +
        '</div>' +
      '</div>';

    // ── Writing Sessions panel — full list of sessions ───────────────────────
    var sessionsList = Array.isArray(ex.sessions) ? ex.sessions : [];
    var sessionsHTML = '';
    if (sessionsList.length) {
      var sessionRows = sessionsList.map(function(s, idx) {
        var lateNightFlag = s.isLateNight
          ? '<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:8px;background:#1a2235;color:#fff;margin-left:6px;">🌙 Late Night</span>'
          : '';
        var shortFlag = s.isShort
          ? '<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:8px;background:#fef3e2;color:#b06000;margin-left:6px;">Brief</span>'
          : '';
        return '<tr>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f1f3f4;font-weight:600;color:#3c4043;">Session ' + (idx + 1) + lateNightFlag + shortFlag + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f1f3f4;color:#5f6368;font-size:11px;">' + esc(s.startLabel || '') + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f1f3f4;color:#5f6368;font-size:11px;">' + esc(s.endLabel || '') + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f1f3f4;color:#3c4043;font-weight:600;font-size:11px;">' + esc(s.durationLabel || fmtDuration(s.duration)) + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f1f3f4;color:#137333;text-align:right;font-variant-numeric:tabular-nums;">+' + (s.additions || 0).toLocaleString() + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f1f3f4;color:#c5221f;text-align:right;font-variant-numeric:tabular-nums;">−' + (s.deletions || 0).toLocaleString() + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #f1f3f4;color:#5f6368;text-align:right;font-variant-numeric:tabular-nums;">' + (s.pasteCount || 0) + '</td>' +
        '</tr>';
      }).join('');

      sessionsHTML =
        '<div style="border:1px solid #e8eaed;border-radius:8px;padding:14px 16px;margin-bottom:20px;background:#fff;">' +
          '<div class="section-hdr">Writing Sessions (Appendix)</div>' +
          '<p style="font-size:11px;color:#5f6368;margin:0 0 12px;line-height:1.6;">' +
            '<strong>Reference data.</strong> A <strong>session</strong> is a continuous stretch of writing activity, separated from the next by a gap of 30 minutes or more. The full session table below documents <em>when</em> the work happened, in case the temporal pattern (clustering near the deadline, late-night work, very long single sessions) is relevant to the conversation. The headline shape is summarised in the Document Activity panel above. Late-night sessions and brief sessions are flagged.' +
          '</p>' +
          '<div style="overflow-x:auto;">' +
          '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
            '<thead><tr style="background:#f8f9fa;">' +
              '<th style="text-align:left;padding:8px 10px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.3px;font-size:10px;border-bottom:2px solid #e8eaed;">Session</th>' +
              '<th style="text-align:left;padding:8px 10px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.3px;font-size:10px;border-bottom:2px solid #e8eaed;">Start</th>' +
              '<th style="text-align:left;padding:8px 10px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.3px;font-size:10px;border-bottom:2px solid #e8eaed;">End</th>' +
              '<th style="text-align:left;padding:8px 10px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.3px;font-size:10px;border-bottom:2px solid #e8eaed;">Duration</th>' +
              '<th style="text-align:right;padding:8px 10px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.3px;font-size:10px;border-bottom:2px solid #e8eaed;">Added</th>' +
              '<th style="text-align:right;padding:8px 10px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.3px;font-size:10px;border-bottom:2px solid #e8eaed;">Deleted</th>' +
              '<th style="text-align:right;padding:8px 10px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.3px;font-size:10px;border-bottom:2px solid #e8eaed;">Pastes</th>' +
            '</tr></thead>' +
            '<tbody>' + sessionRows + '</tbody>' +
          '</table>' +
          '</div>' +
        '</div>';
    }

    // ── Paste Activity panel — with full pasted text ─────────────────────────
    var pasteActivityHTML = '';
    var pasteEventsFromExtras = Array.isArray(ex.pasteEvents) ? ex.pasteEvents : [];
    // Fallback to payload-only events (without text) if extras missing
    if (!pasteEventsFromExtras.length && r && r.processInputs && Array.isArray(r.processInputs.pasteEvents)) {
      pasteEventsFromExtras = r.processInputs.pasteEvents;
    }

    if (pasteProfile && pasteProfile.pasteEventCount > 0) {
      var raw = pasteProfile.rawPasteRatioPct || 0;
      var adj = pasteProfile.adjustedPasteRatioPct || 0;
      var gap = Math.abs(raw - adj);
      var showAdjusted = gap > 5;

      var numbersRow =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">' +
          '<div style="padding:12px 14px;background:#f8f9fa;border-radius:6px;border-left:3px solid #5f6368;">' +
            '<div style="font-size:10px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.3px;">Raw paste ratio</div>' +
            '<div style="font-size:22px;font-weight:700;color:#3c4043;margin-top:2px;">' + raw + '%</div>' +
            '<div style="font-size:10px;color:#80868b;margin-top:2px;">' + (pasteProfile.rawPasteChars || 0).toLocaleString() + ' chars of ' + (agg.totalAdditions || 0).toLocaleString() + ' total additions</div>' +
          '</div>' +
          '<div style="padding:12px 14px;background:' + (showAdjusted ? '#e6f4ea' : '#f8f9fa') + ';border-radius:6px;border-left:3px solid ' + (showAdjusted ? '#137333' : '#5f6368') + ';">' +
            '<div style="font-size:10px;font-weight:700;color:' + (showAdjusted ? '#137333' : '#5f6368') + ';text-transform:uppercase;letter-spacing:.3px;">Adjusted — paste-source in final</div>' +
            '<div style="font-size:22px;font-weight:700;color:#3c4043;margin-top:2px;">' + adj + '%</div>' +
            '<div style="font-size:10px;color:#80868b;margin-top:2px;">External content that survived to the final document</div>' +
          '</div>' +
        '</div>';

      // Per-event paste cards with text
      var pasteCardsHTML = pasteEventsFromExtras.map(function(ev, i) {
        var cat = pasteCatMeta[ev.category] || { label: ev.category || 'Unknown', bg: '#f1f3f4', color: '#5f6368' };
        var noveltyBadge = (ev.novelty != null)
          ? '<span style="font-size:10px;font-weight:700;padding:1px 8px;border-radius:8px;background:#e8eaed;color:#3c4043;">novelty ' + ev.novelty + '%</span>'
          : '';
        var collapsedNote = (ev.count && ev.count > 1)
          ? ' <span style="font-size:10px;color:#5f6368;">(×' + ev.count + ' collapsed events)</span>'
          : '';
        var timeLabel = (ev.tEnd != null && ev.tEnd !== ev.t)
          ? 't+' + ev.t + 'min to t+' + ev.tEnd + 'min'
          : 't+' + ev.t + 'min';
        var sizeLabel = (ev.size || 0).toLocaleString() + ' chars';
        var trunc = truncateText(ev.text || '', 500);
        var truncNote = trunc.truncated
          ? '<div style="font-size:10px;color:#80868b;font-style:italic;margin-top:6px;">Truncated to first 500 characters of ' + trunc.fullLength.toLocaleString() + ' total. Full text remains visible in Inspect.</div>'
          : '';
        var textBlock = ev.text
          ? '<div style="margin-top:8px;padding:10px 12px;background:#fafafa;border:1px solid #e8eaed;border-left:3px solid ' + cat.color + ';border-radius:4px;font-family:\'Courier New\',Consolas,monospace;font-size:11px;color:#3c4043;line-height:1.55;white-space:pre-wrap;word-wrap:break-word;max-height:none;">' + esc(trunc.text) + '</div>' + truncNote
          : '<div style="margin-top:8px;padding:8px 12px;background:#fafafa;border:1px dashed #dadce0;border-radius:4px;font-size:11px;color:#80868b;font-style:italic;">Paste text not available for this event.</div>';

        // Multi-probe survival details — only renders for external categories
        // where the check actually ran. The chip color matches the category's
        // accent so the survival evidence reads as part of the classification.
        var probeText = formatProbeDetails(ev);
        var probeRow = probeText
          ? '<div style="margin-top:6px;padding:6px 10px;background:' + cat.bg + ';border-radius:4px;font-size:11px;color:' + cat.color + ';line-height:1.5;">' +
              '<strong>Survival check:</strong> ' + esc(probeText) +
            '</div>'
          : '';

        return '<div style="border:1px solid #e8eaed;border-radius:6px;padding:12px;margin-bottom:10px;background:#fff;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">' +
            '<span style="font-size:12px;font-weight:700;color:#3c4043;">Paste #' + (i + 1) + '</span>' +
            '<span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:8px;background:' + cat.bg + ';color:' + cat.color + ';">' + esc(cat.label) + '</span>' +
            noveltyBadge +
          '</div>' +
          '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#5f6368;">' +
            '<span><strong style="color:#3c4043;">When:</strong> ' + esc(timeLabel) + '</span>' +
            '<span><strong style="color:#3c4043;">Size:</strong> ' + esc(sizeLabel) + '</span>' +
            (ev.time ? '<span><strong style="color:#3c4043;">Time:</strong> ' + esc(ev.time) + '</span>' : '') +
            collapsedNote +
          '</div>' +
          probeRow +
          textBlock +
        '</div>';
      }).join('');

      var pasteRationale = rationalePaste(pasteProfile, pasteEventsFromExtras);

      pasteActivityHTML =
        '<div style="border:1px solid #e8eaed;border-radius:8px;padding:14px 16px;margin-bottom:20px;background:#fff;">' +
          '<div class="section-hdr">Paste Activity</div>' +

          // ── What this measures
          '<div style="background:#f8f9fa;border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:11px;color:#3c4043;line-height:1.6;">' +
            '<strong style="color:#1a2235;">What this measures.</strong> Google Docs flags any save of 200+ characters as a "paste." That raw count collapses three different behaviours: <strong>external content brought in</strong> (from a website, document, or AI tool), <strong>internal cut-and-paste moves</strong> of the writer\u2019s own text, and pastes that were <strong>later removed</strong> before submission. The classification below separates them using two signals already present in the data — <em>novelty</em> (how new the words were to the document at paste time) and <em>survival</em> (whether parts of the pasted text appear in the final document). The survival check uses a multi-probe match — start, middle, and end of the pasted text are each searched for in the final, with quote and whitespace differences normalised. A paste is "in final" if ANY probe matches; "removed" only if none do.' +
          '</div>' +

          numbersRow +
          '<div style="margin-top:14px;">' +
            '<div class="section-hdr" style="font-size:11px;border-bottom-width:1px;margin-bottom:10px;">Individual paste events</div>' +
            (pasteCardsHTML || '<p style="font-size:11px;color:#80868b;font-style:italic;">No paste events to display.</p>') +
          '</div>' +
          '<div style="padding:10px 12px;background:#f8f9fa;border-left:3px solid #4A6FA5;border-radius:4px;font-size:12px;color:#3c4043;line-height:1.6;margin-top:12px;">' +
            esc(pasteRationale) +
          '</div>' +

          // ── How to read this
          '<div style="margin-top:10px;padding:10px 12px;background:#f0f7f6;border-left:3px solid #2a7a6b;border-radius:4px;font-size:11px;color:#3c4043;line-height:1.6;">' +
            '<strong style="color:#2a7a6b;">How to read this.</strong> <em>External — in final</em> pastes are the most consequential category: they indicate content the writer brought in from elsewhere that ended up in the submitted document. The pasted text is shown above so you can compare it to the surrounding writing for tonal or vocabulary fit, and check whether it is properly cited. <em>External — removed</em> pastes are content the writer pulled in but later took out — common in legitimate composition (e.g. holding reference material in the document while drafting, then paraphrasing it away) but also possible if the writer pulled in something they decided not to keep. <em>Internal reuse</em> is the writer rearranging their own text — routine and not a concern. None of these categories alone is a finding; they are evidence to examine alongside StyleMatch, source-matching tools, and your knowledge of the assignment.' +
          '</div>' +

          (!pasteProfile.hasSurvivalData
            ? '<div style="margin-top:10px;padding:8px 12px;background:#fef9e7;border:1px solid #f29900;border-radius:4px;font-size:11px;color:#b06000;line-height:1.5;">' +
                '<strong>Note:</strong> Final document text was not available for survival checking. High-novelty pastes could not be verified as present-or-absent in the final, so they are classified as "external — unverified" and counted conservatively.' +
              '</div>'
            : '') +
        '</div>';
    }

    // ── Struggle Moments panel — full list ──────────────────────────────────
    var struggleList = Array.isArray(ex.struggleMoments) ? ex.struggleMoments : [];
    var struggleHTML = '';
    if (struggleList.length || (agg.struggleCount || 0) === 0) {
      // Render the panel even if empty so the absence is documented
      var struggleRows = struggleList.map(function(sm, i) {
        var s = struggleTypeMeta[sm.type] || { bg: '#f1f3f4', color: '#5f6368', icon: '⚡' };
        var dur = fmtDuration(sm.durationMs);
        return '<div style="border:1px solid #e8eaed;border-left:4px solid ' + s.color + ';border-radius:6px;padding:10px 12px;margin-bottom:8px;background:#fff;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">' +
            '<span style="font-size:14px;">' + s.icon + '</span>' +
            '<span style="font-size:12px;font-weight:700;color:#3c4043;">Moment #' + (i + 1) + '</span>' +
            '<span style="font-size:11px;font-weight:700;padding:1px 8px;border-radius:8px;background:' + s.bg + ';color:' + s.color + ';">' + esc(sm.type || 'Struggle') + '</span>' +
          '</div>' +
          '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:#5f6368;margin-top:4px;">' +
            (sm.time ? '<span><strong style="color:#3c4043;">When:</strong> ' + esc(sm.time) + '</span>' : '') +
            '<span><strong style="color:#3c4043;">Duration:</strong> ' + esc(dur) + '</span>' +
            '<span><strong style="color:#3c4043;">Edit cycles:</strong> ' + (sm.editCycles || 0) + '</span>' +
            '<span><strong style="color:#3c4043;">Added:</strong> ' + (sm.totalAdded || 0).toLocaleString() + ' chars</span>' +
            '<span><strong style="color:#3c4043;">Deleted:</strong> ' + (sm.totalDeleted || 0).toLocaleString() + ' chars</span>' +
          '</div>' +
        '</div>';
      }).join('');

      struggleHTML =
        '<div style="border:1px solid #e8eaed;border-radius:8px;padding:14px 16px;margin-bottom:20px;background:#fff;">' +
          '<div class="section-hdr">Struggle Moments</div>' +
          '<p style="font-size:11px;color:#5f6368;margin:0 0 12px;line-height:1.6;">' +
            'A <strong>struggle moment</strong> is a stretch where the writer cycled through deletions and re-insertions in the same region of the document — a behavioural trace of revising in place. Each moment shows the type of struggle, when it happened, how long it lasted, and how much was added or deleted.' +
          '</p>' +
          (struggleList.length
            ? struggleRows
            : '<p style="font-size:12px;color:#80868b;margin:0;font-style:italic;">No struggle moments were detected in this document. This could indicate composition with little back-and-forth, very careful pre-typing composition, or a short or linear document.</p>') +
        '</div>';
    }

    // ── Magnitude rollup panel ─────────────────────────────────────────────
    var totalStruggles = (agg.struggleCount || 0);
    function magnitudeRow(key, label, note) {
      var count = mags[key] || 0;
      var pct = totalStruggles > 0 ? Math.round(count / totalStruggles * 100) : 0;
      return '<div style="display:grid;grid-template-columns:180px 1fr 60px;gap:10px;align-items:center;margin-bottom:6px;">' +
        '<div>' +
          '<div style="font-size:12px;font-weight:600;color:#3c4043;">' + esc(label) + '</div>' +
          '<div style="font-size:10px;color:#80868b;font-style:italic;">' + esc(note) + '</div>' +
        '</div>' +
        '<div style="background:#f1f3f4;border-radius:4px;height:18px;position:relative;overflow:hidden;">' +
          '<div style="background:#2a7a6b;height:100%;width:' + pct + '%;"></div>' +
        '</div>' +
        '<div style="font-size:13px;font-weight:700;color:#3c4043;text-align:right;">' + count + '</div>' +
      '</div>';
    }
    var magnitudeHTML =
      '<div style="border:1px solid #e8eaed;border-radius:8px;padding:14px 16px;margin-bottom:20px;background:#fff;">' +
        '<div class="section-hdr">Revision Magnitude Rollup</div>' +

        // ── What this measures
        '<div style="background:#f8f9fa;border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:11px;color:#3c4043;line-height:1.6;">' +
          '<strong style="color:#1a2235;">What this measures.</strong> Each struggle moment is binned by total character churn — the sum of additions plus deletions inside the loop. The bins are a proxy for how deep the revision went: a 12-character churn is almost certainly a typo correction; a 400-character churn is rework at the paragraph scale. This is a <em>metadata proxy</em> for revision depth — Process View cannot read the revised text, so it cannot know whether a given rewrite changed meaning or only surface form. A document with mostly word-swap revisions is a different shape from one with mostly paragraph-scale rewrites.' +
        '</div>' +

        (totalStruggles === 0
          ? '<p style="font-size:12px;color:#80868b;margin:0;font-style:italic;">No struggle moments were detected in this document.</p>'
          : magnitudeRow('word-swap',         'Word-swap',         '≤ 20 chars — likely single-word fix or typo') +
            magnitudeRow('phrase-rewrite',    'Phrase rewrite',    '21–60 chars — short phrase reworked') +
            magnitudeRow('sentence-rewrite',  'Sentence rewrite',  '61–200 chars — full sentence reworked') +
            magnitudeRow('sentence-cut',      'Sentence cut',      '61–200 chars — sentence removed') +
            magnitudeRow('paragraph-rewrite', 'Paragraph rewrite', '> 200 chars — paragraph-scale rework') +
            magnitudeRow('content-cut',       'Content cut',       '> 200 chars — substantive removal')) +
        '<div style="padding:10px 12px;background:#f8f9fa;border-left:3px solid #2a7a6b;border-radius:4px;font-size:12px;color:#3c4043;line-height:1.6;margin-top:12px;">' +
          esc(rationaleMagnitude(mags, totalStruggles)) +
        '</div>' +

        // ── How to read this
        '<div style="margin-top:10px;padding:10px 12px;background:#f0f7f6;border-left:3px solid #2a7a6b;border-radius:4px;font-size:11px;color:#3c4043;line-height:1.6;">' +
          '<strong style="color:#2a7a6b;">How to read this.</strong> A profile dominated by sentence- and paragraph-magnitude revisions suggests the writer reworked meaningful chunks of text during composition — the behavioural shape of in-document drafting. A profile dominated entirely by word-swap revisions can mean the writer composed carefully before typing (legitimate) or made only surface corrections to text composed elsewhere (potentially worth a question). The number of moments matters less than the distribution: ten word-swaps and zero higher-magnitude revisions tells a different story than ten word-swaps and three paragraph-rewrites. As with all signals here, this is one observation to consider alongside StyleMatch, source-matching tools, and your knowledge of the student\u2019s typical writing process.' +
        '</div>' +
      '</div>';

    // ── Research metrics panel ─────────────────────────────────────────────
    var metricsHTML = '';
    if (mets) {
      function metricRow(label, value, flag, flagDirection, researchLine, rationaleText) {
        var lbl = metricLabel(flag, flagDirection);
        var accentColor = flag ? '#5f6368' : '#2a7a6b';
        return '<div style="padding:10px 0;border-bottom:1px solid #f1f3f4;">' +
          '<div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;">' +
            '<div>' +
              '<div style="font-size:12px;font-weight:600;color:#3c4043;">' + esc(label) + '</div>' +
              '<div style="font-size:10px;color:#80868b;font-style:italic;line-height:1.4;">' + esc(researchLine) + '</div>' +
            '</div>' +
            '<div style="font-size:14px;font-weight:700;color:' + accentColor + ';min-width:60px;text-align:right;">' + esc(value) + '</div>' +
            '<span style="font-size:10px;font-weight:700;padding:2px 10px;border-radius:8px;background:' + lbl.bg + ';color:' + lbl.color + ';">' + esc(lbl.text) + '</span>' +
          '</div>' +
          '<div style="margin-top:6px;padding:8px 10px;background:#f8f9fa;border-left:3px solid ' + accentColor + ';border-radius:3px;font-size:11px;color:#3c4043;line-height:1.55;">' +
            esc(rationaleText) +
          '</div>' +
        '</div>';
      }
      metricsHTML =
        '<div style="border:1px solid #e8eaed;border-radius:8px;padding:14px 16px;margin-bottom:20px;background:#fff;">' +
          '<div class="section-hdr">Research-Cited Writing-Process Metrics</div>' +

          // ── What this measures
          '<div style="background:#f8f9fa;border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:11px;color:#3c4043;line-height:1.6;">' +
            '<strong style="color:#1a2235;">What this measures.</strong> Five numeric indicators from the keystroke-logging research literature (Crossley et al., 2024; Vandermeulen et al., 2020; Stevenson et al., 2006; and others). Each captures a different aspect of how the document was produced: <em>how much survived versus was edited</em> (Product-Process Ratio, Deletion Ratio), <em>how often the writer went back</em> (Struggle Density, Non-Local Revision Rate), and <em>how variable the typing rhythm was</em> (Production Variance). The labels indicate whether each value sits within or outside the typical range for student writing — these thresholds come from the cited research, not from PaperTrail.' +
          '</div>' +

          metricRow('Product-Process Ratio',    mets.productProcessRatio,            mets.flagProductProcess,     'high', 'Van Waes & Leijten (2015); Vandermeulen et al. (2020) — higher = less revision',           rationalePPR(mets.productProcessRatio, mets.flagProductProcess)) +
          metricRow('Deletion Ratio',           (mets.deletionRatioPct || 0) + '%',  mets.flagDeletionRatio,      'low',  'Crossley et al. (2024); Leijten & Van Waes (2013) — lower = fewer corrections',           rationaleDeletion(mets.deletionRatioPct || 0, mets.flagDeletionRatio)) +
          metricRow('Struggle Density',         mets.struggleDensity + ' /1K chars', mets.flagStruggleDensity,    'low',  'Leijten & Van Waes (2013) — rewrite loops per 1,000 chars',                               rationaleStruggle(mets.struggleDensity, agg.struggleCount || 0, mets.flagStruggleDensity)) +
          metricRow('Non-Local Revision Rate',  mets.nonLocalRevisionRate,           mets.flagNonLocalRevision,   'low',  'Stevenson et al. (2006) — proportion of revisions behind the frontier',                  rationaleNonLocal(mets.nonLocalRevisionRate, mets.flagNonLocalRevision, mets.totalDeleteOps)) +
          metricRow('Production Variance (CV)', mets.productionVarianceCv,           mets.flagProductionVariance, 'low',  'Crossley et al. (2024) — lower = more uniform production',                               rationaleVariance(mets.productionVarianceCv, mets.flagProductionVariance)) +

          // ── How to read this
          '<div style="margin-top:14px;padding:10px 12px;background:#f0f7f6;border-left:3px solid #2a7a6b;border-radius:4px;font-size:11px;color:#3c4043;line-height:1.6;">' +
            '<strong style="color:#2a7a6b;">How to read this.</strong> <strong>No single metric is a finding.</strong> Each one captures a real but partial slice of the writing process; each one has known false positives (an outline-first writer who plans carefully before typing will look "low-revision" in metrics designed for in-document drafting). The literature treats these as <em>convergent</em> evidence: a single value outside the typical range is an observation; multiple values converging in the same direction is a stronger pattern; convergence with a distinctive paste profile, a stylometric mismatch, or a Turnitin signal is the kind of multi-source evidence base that supports a difficult conversation. The metrics are most useful as questions to bring to the student, not as verdicts to deliver.' +
          '</div>' +
        '</div>';
    }

    // ── Revert disclosure + Revision Flow table (v3.3.0) ───────────────────
    // Self-cancelling bulk reverts are excluded from paste statistics by
    // revisionAPI.js markRevertPairs; evidence-not-verdict requires the
    // report to SAY so rather than silently suppressing them. The table HTML
    // arrives pre-built from revision-flow.js via extras.
    var revertNoteHTML = '';
    if (ex.revertInfo && ex.revertInfo.count > 0) {
      var rvN = ex.revertInfo.count;
      var rvC = (ex.revertInfo.chars || 0).toLocaleString();
      revertNoteHTML =
        '<div style="background:#f1f3f4;border-left:3px solid #5f6368;border-radius:4px;padding:12px 14px;margin-bottom:20px;font-size:12px;color:#3c4043;line-height:1.6;">' +
          '<strong style="color:#1a2235;">↩ ' + rvN + ' self-cancelling bulk revert' + (rvN > 1 ? 's' : '') + ' detected and excluded.</strong> ' +
          'A large insertion was removed again shortly after — the signature of a delete-all-and-revert, a paste-and-undo, or a version-history restore. Approximately ' + rvC + ' characters round-tripped with net-zero effect on the document. ' +
          'These entries are <strong>not</strong> counted in the paste statistics or magnitude metrics in this report, so a transient excursion does not read as paste activity against the writer. The Revision Flow table below shows where ' + (rvN > 1 ? 'they' : 'it') + ' occurred.' +
        '</div>';
    }

    var revisionFlowHTML = '';
    if (ex.revisionFlowTableHTML) {
      revisionFlowHTML =
        '<div style="margin-bottom:24px;">' +
          '<div class="section-hdr">Revision Flow — Per-Session Revision Table</div>' +
          '<p style="font-size:11px;color:#5f6368;line-height:1.6;margin:0 0 10px;">' +
            'Every save event Google Docs recorded, grouped by writing session. Runs of ordinary typing are collapsed into single rows; paste events, large deletions, and bulk reverts are shown individually. Magnitude bars are scaled to the largest typing or paste row — bulk reverts are excluded from the scale and from all statistics above.' +
          '</p>' +
          ex.revisionFlowTableHTML +
        '</div>';
    }

    // ── Cross-promo footer ─────────────────────────────────────────────────
    var nextStepHTML =
      '<div style="background:#fffdf5;border:1px solid #C9A84C40;border-radius:8px;padding:14px 16px;margin-bottom:20px;">' +
        '<div style="font-size:11px;font-weight:700;color:#b06000;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">🔍 Build a Stronger Evidence Base</div>' +
        '<p style="font-size:12px;color:#3c4043;line-height:1.6;margin:0;">' +
          'Process View describes <strong>how</strong> this document was assembled. To examine <strong>whether the writing itself</strong> is consistent with other work by the same student, run a <strong>StyleMatch</strong> comparison against a controlled writing sample. ' +
          'StyleMatch computes eight stylometric metrics (function-word profile, punctuation fingerprint, sentence rhythm, vocabulary richness, and others) — also entirely client-side, no text transmitted. ' +
          'Combined with a Turnitin or similar source-matching report, you have three independent signals to bring to the conversation.' +
        '</p>' +
      '</div>';

    // ── References ─────────────────────────────────────────────────────────
    var refsHTML =
      '<div style="margin-bottom:16px;">' +
        '<h3 style="font-size:12px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.4px;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #e8eaed;">Research References</h3>' +
        '<div style="font-size:10px;color:#80868b;line-height:1.8;">' +
          '<p style="margin:0 0 3px;">Crossley, S., Tian, Y., Choi, J. S., Holmes, L., &amp; Morris, W. (2024). Plagiarism Detection Using Keystroke Logs. <em>Proceedings of the 17th International Conference on Educational Data Mining.</em></p>' +
          '<p style="margin:0 0 3px;">Leijten, M., &amp; Van Waes, L. (2013). Keystroke Logging in Writing Research: Using Inputlog to Analyze and Visualize Writing Processes. <em>Written Communication, 30</em>(3), 358–392.</p>' +
          '<p style="margin:0 0 3px;">Stevenson, M., Schoonen, R., &amp; de Glopper, K. (2006). Revising in Two Languages: A Multi-Dimensional Comparison of Online Writing Revisions in L1 and FL. <em>Journal of Second Language Writing, 15</em>(3), 201–233.</p>' +
          '<p style="margin:0 0 3px;">Tian, Y., Kim, M., &amp; Crossley, S. (2024). Exploring the Application of Keystroke Logging Techniques to Research in Second Language (L2) Writing. <em>ScienceDirect.</em></p>' +
          '<p style="margin:0 0 3px;">Van Waes, L., &amp; Leijten, M. (2015). Fluency in Writing: A Multidimensional Perspective on Writing Fluency Applied to L1 and L2. <em>Computers and Composition, 38</em>, 79–95.</p>' +
          '<p style="margin:0;">Vandermeulen, N., Leijten, M., &amp; Van Waes, L. (2020). Reporting Writing Process Feedback in the Classroom: Using Keystroke Logging Data to Reflect on Writing Processes. <em>Journal of Writing Research, 12</em>(1), 109–140.</p>' +
        '</div>' +
      '</div>';

    var disclaimerText = 'This report describes patterns in how this document was assembled. It does not examine the writing itself and it does not constitute a finding of academic dishonesty. No document text was transmitted in the generation of this report — all computation runs locally in the browser. All observations require interpretation by a professional educator with knowledge of the student, the assignment, and the learning environment, in accordance with institutional policy.';

    // ── Full HTML document ─────────────────────────────────────────────────
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>PaperTrail Process View</title>' +
      '<style>' +
        'body{font-family:"Google Sans",Arial,sans-serif;background:#f0f4f9;margin:0;padding:24px;}' +
        '.report{max-width:860px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);}' +
        '.report-topbar{background:#4A6FA5;padding:12px 20px;display:flex;align-items:center;gap:10px;}' +
        '.report-topbar h1{font-size:16px;font-weight:700;color:#fff;flex:1;margin:0;}' +
        '.report-topbar em{color:#C9A84C;font-style:italic;}' +
        '.report-body{padding:24px;}' +
        '.section-hdr{font-size:13px;font-weight:700;color:#3c4043;text-transform:uppercase;letter-spacing:.4px;margin:0 0 12px;padding-bottom:7px;border-bottom:2px solid #e8eaed;}' +
        '.disclaimer{font-size:10px;color:#80868b;line-height:1.6;padding:14px 16px;background:#f8f9fa;border-radius:6px;margin-top:8px;margin-bottom:16px;}' +
        '.footer{text-align:center;font-size:10px;color:#aaa;padding:16px 0 4px;}' +
        // Editable form fields
        '.meta-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 16px;padding:14px 16px;background:#f8f9fa;border-radius:7px;margin-bottom:20px;}' +
        '.meta-field{display:flex;flex-direction:column;gap:3px;}' +
        '.meta-field label{font-size:10px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.3px;}' +
        '.meta-input{font-family:inherit;font-size:13px;color:#3c4043;background:#fff;border:1px solid #dadce0;border-radius:4px;padding:6px 8px;width:100%;box-sizing:border-box;}' +
        '.meta-input:focus{outline:none;border-color:#4A6FA5;box-shadow:0 0 0 2px rgba(74,111,165,.15);}' +
        '.meta-static{font-size:13px;color:#3c4043;padding:6px 0;font-family:"Courier New",Consolas,monospace;}' +
        '@media print{' +
        '  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}' +
        '  body{background:#fff;padding:0;}' +
        '  .report{box-shadow:none;border-radius:0;max-width:none;}' +
        '  button{display:none!important;}' +
        '  .report-topbar{background:#4A6FA5!important;}' +
        '  .section-hdr{break-inside:avoid;page-break-inside:avoid;}' +
        // Print form fields without input borders — looks like static text
        '  .meta-form{background:#fff!important;border:1px solid #e8eaed;}' +
        '  .meta-input{border:none!important;background:transparent!important;padding:2px 0!important;font-weight:600;color:#1a2235!important;}' +
        '  .meta-input::placeholder{color:transparent;}' +
        '}' +
      '</style></head><body>' +
      '<div class="report">' +

      // Topbar
      '<div class="report-topbar">' +
        (iconUri ? '<img src="' + iconUri + '" style="width:32px;height:32px;" />' : '') +
        '<h1>PaperTrail\u2122 — <em>Process View</em></h1>' +
        '<button id="verify-print-btn" style="padding:6px 14px;background:#C9A84C;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;">Print / Save PDF</button>' +
      '</div>' +

      '<div class="report-body">' +

      // Observational callout
      observationalHTML +

      // Editable form fields (Student / Assignment / Course / Teacher / Date / Report ID)
      formFieldsHTML +

      // Privacy callout
      privacyHTML +

      // Paste-dominance banner (only when adjusted ratio is high)
      pasteDominantBannerHTML +

      // Document activity panel
      activityHTML +

      // Paste activity panel (with full pasted text)
      pasteActivityHTML +

      // Revert disclosure (v3.3.0) — empty unless reverts were detected
      revertNoteHTML +

      // Struggle Moments panel (full list)
      struggleHTML +

      // Magnitude rollup
      magnitudeHTML +

      // Research metrics
      metricsHTML +

      // Sessions panel — appendix-style reference data (when the work happened).
      // Moved here after the headline panels because most teachers read top-down
      // and Sessions is reference detail, not headline interpretation.
      sessionsHTML +

      // Cross-promo to StyleMatch
      sessionsHTML +

      // Revision Flow per-session table (v3.3.0) — appendix-style reference
      revisionFlowHTML +

      '<div class="disclaimer">' + esc(disclaimerText) + '</div>' +

      refsHTML +

      '<div class="footer">PaperTrail Process View &middot; papertrailacademic.com &middot; ' + esc(now) + '</div>' +

      '</div></div>' +
      '</body></html>';
  }

  // Small helper for the Activity panel — keeps JSX-like usage tidy
  function activityCell(label, value) {
    var esc = function(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    return '<div style="padding:8px 10px;background:#f8f9fa;border-radius:6px;">' +
      '<div style="font-size:10px;color:#80868b;font-weight:700;text-transform:uppercase;letter-spacing:.3px;">' + esc(label) + '</div>' +
      '<div style="font-size:14px;font-weight:700;color:#3c4043;margin-top:2px;">' + esc(value) + '</div>' +
    '</div>';
  }


  function smBuildVerifyReportHTML(r, comparative, metadata, iconUri) { // eslint-disable-line no-unused-vars
    // Comparative reports have their own dedicated renderer
    if (r.analysisMode === 'comparative') {
      return smBuildComparativeReportHTML(r, metadata, iconUri);
    }
    // Process reports have their own dedicated renderer
    if (r.analysisMode === 'process') {
      return smBuildProcessReportHTML(r, metadata, iconUri);
    }

    var esc = function(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    };
    var meta = metadata || {};
    var now = new Date().toLocaleString('en-US', {
      year:'numeric', month:'long', day:'numeric', hour:'numeric', minute:'2-digit'
    });

    var bandColorTable = {
      'Consistent with Single Authorship': '#137333',
      'Notable Stylistic Variation':        '#b06000',
      'Significant Stylistic Variation':    '#c5221f'
    };
    var bandBgTable = {
      'Consistent with Single Authorship': '#e6f4ea',
      'Notable Stylistic Variation':        '#fef9e7',
      'Significant Stylistic Variation':    '#fce8e6'
    };
    // bandColor / bandBg are assigned later from derivedBand (computed after flagging)
    var bandColor, bandBg;

    var chunks = r.chunks || [];
    var dimKeys = ['register','vocabularyLevel','sentenceComplexity','argumentDepth','engagement','errorDensity','cohesion'];
    var dimLabels = {
      register: 'Register', vocabularyLevel: 'Vocabulary', sentenceComplexity: 'Sentence Complexity',
      argumentDepth: 'Argument Depth', engagement: 'Authorial Voice',
      errorDensity: 'Error Density', cohesion: 'Cohesion'
    };
    var dimDesc = {
      register: 'Formal ↔ Informal', vocabularyLevel: 'Simple ↔ Sophisticated',
      sentenceComplexity: 'Simple ↔ Complex', argumentDepth: 'Descriptive ↔ Analytical',
      engagement: 'Confident/impersonal ↔ Hedged/personal',
      errorDensity: 'Many errors ↔ Error-free', cohesion: 'Disconnected ↔ Highly linked'
    };

    // ── isProse helper — backward compat: chunks without isProse default to true ─
    function isProseChunk(c) {
      return c && c.isProse !== false;
    }

    // ── Writer baseline — mean across BASELINE-TYPICAL PROSE chunks only ──────
    // Within-document style change baseline (Stamatatos 2009; Zeng 2024).
    // We need to exclude chunks that deviate from baseline before computing the baseline.
    // Chicken-and-egg: use the model's candidateSeverity ("None" / "Minor" = baseline-typical;
    // "Moderate" / "Marked" = candidate-deviant) as the seed. Renderer flagging logic
    // (which runs later) may add or remove flags; we accept that the baseline is computed
    // from the model's pre-renderer assessment as a stable approximation.
    // Backward-compat: chunks without analysis (old reports) treat .flagged as the seed.
    function isBaselineTypical(c) {
      if (!isProseChunk(c)) return false;
      if (c.analysis && c.analysis.candidateSeverity) {
        return c.analysis.candidateSeverity === 'None' || c.analysis.candidateSeverity === 'Minor';
      }
      // Fallback for old reports without analysis
      return !c.flagged;
    }
    // ── Model strongest-divergence signal ────────────────────────────────────
    // The model's per-chunk candidateSeverity is a SEPARATE signal from the
    // renderer's mechanical _flag triggers (T1/T2/T3). On a 16-document
    // ground-truth set of authentic student writing, candidateSeverity ===
    // 'Marked' produced zero false positives; lower severities did not.
    // Only 'Marked' is surfaced. 'Moderate' and below feed the baseline /
    // score but are never rendered as a located signal. NOTE: this is
    // deliberately NOT the same thing as _flag.severity === 'Marked', which is
    // the mechanical-trigger label — do not conflate the two.
    function isModelMarked(c) {
      return !!(isProseChunk(c) && c.analysis && c.analysis.candidateSeverity === 'Marked');
    }
    var baselineMeans = {};
    var baselineSourceCount = 0;
    var baselinePool = chunks.filter(isBaselineTypical);
    if (baselinePool.length) {
      baselineSourceCount = baselinePool.length;
      dimKeys.forEach(function(k) {
        var sum = 0, n = 0;
        baselinePool.forEach(function(c) {
          if (c.scores && c.scores[k] !== undefined) { sum += c.scores[k]; n++; }
        });
        if (n) baselineMeans[k] = sum / n;
      });
    } else if (r.documentMeans) {
      // No baseline-typical prose chunks — fall back to whole-document means
      dimKeys.forEach(function(k) {
        if (r.documentMeans[k] !== undefined) baselineMeans[k] = r.documentMeans[k];
      });
    }

    // ── Style Change Function — Euclidean distance between adjacent prose chunks ─
    // Stamatatos 2009: peaks in adjacent-chunk dissimilarity indicate style boundaries.
    // Non-prose chunks are skipped from the sequence (no false bibliography peaks).
    // Output normalized to a 0–10 display scale (theoretical max = sqrt(7 * 10^2) ≈ 26.46).
    var proseSequence = chunks.filter(isProseChunk);
    var styleChangeFunction = []; // [{ fromIndex, toIndex, distance }]
    var SCF_NORM = Math.sqrt(dimKeys.length * 100); // ≈ 26.458
    for (var i = 0; i < proseSequence.length - 1; i++) {
      var a = proseSequence[i], b = proseSequence[i + 1];
      if (!a.scores || !b.scores) continue;
      var sumSq = 0;
      dimKeys.forEach(function(k) {
        var av = a.scores[k] !== undefined ? a.scores[k] : 5;
        var bv = b.scores[k] !== undefined ? b.scores[k] : 5;
        sumSq += (av - bv) * (av - bv);
      });
      var rawDist = Math.sqrt(sumSq);
      var displayDist = (rawDist / SCF_NORM) * 10;
      styleChangeFunction.push({ fromIndex: a.index, toIndex: b.index, distance: displayDist });
    }
    var scfMax = styleChangeFunction.reduce(function(m, p){ return Math.max(m, p.distance); }, 0);

    // ── FLAGGING ENGINE — three triggers, applied to every prose chunk ────────
    // Trigger T1: ABSOLUTE DEVIATION
    //   chunk has any single dimension deviating ≥3 from baseline
    //   OR ≥2 dimensions deviating ≥2 from baseline
    // Trigger T2: CONVERGENT PATTERN
    //   ≥4 dimensions deviate by ≥1.5 from baseline
    //   AND directionally coherent (≥75% of deviating dims point the same way)
    // Trigger T3: BOUNDARY PEAK
    //   adjacent-chunk SCF distance ≥2.0 (notable threshold)
    //   for both chunks involved in the boundary, the higher-deviation chunk is flagged
    //
    // Severity:
    //   Marked   — multiple triggers fire OR any single dimension deviates ≥3
    //   Notable  — exactly one trigger fires
    // (No "Minor" output severity — anything below Notable is not flagged.)
    //
    // Each flagged chunk gets a `_flag` object with { severity, triggers, dimensions, direction }.
    // Renderer uses `_flag` to drive heatmap colors, table arrows, and passage card assembly.
    function computeFlagging() {
      // Step 1: per-chunk T1+T2 evaluation
      chunks.forEach(function(c) {
        c._flag = null;
        if (!isProseChunk(c) || !c.scores) return;

        var devs = {}; // dimension -> deviation magnitude
        var dirs = {}; // dimension -> +1 (elevated), -1 (reduced)
        var maxDev = 0;
        dimKeys.forEach(function(k) {
          if (c.scores[k] === undefined || baselineMeans[k] === undefined) return;
          var d = c.scores[k] - baselineMeans[k];
          devs[k] = Math.abs(d);
          dirs[k] = d > 0 ? 1 : (d < 0 ? -1 : 0);
          if (devs[k] > maxDev) maxDev = devs[k];
        });

        var triggers = [];

        // T1: absolute deviation
        var dimsAbove2 = Object.keys(devs).filter(function(k){ return devs[k] >= 2; });
        var anyAbove3 = Object.keys(devs).some(function(k){ return devs[k] >= 3; });
        if (anyAbove3 || dimsAbove2.length >= 2) {
          triggers.push({
            id: 'absolute',
            label: anyAbove3 ? 'Single-dimension deviation ≥3' : (dimsAbove2.length + ' dimensions deviating ≥2'),
            dimensions: anyAbove3
              ? Object.keys(devs).filter(function(k){ return devs[k] >= 3; })
              : dimsAbove2
          });
        }

        // T2: convergent pattern
        var dimsAbove15 = Object.keys(devs).filter(function(k){ return devs[k] >= 1.5; });
        if (dimsAbove15.length >= 4) {
          var ups = dimsAbove15.filter(function(k){ return dirs[k] > 0; }).length;
          var downs = dimsAbove15.filter(function(k){ return dirs[k] < 0; }).length;
          var dominant = Math.max(ups, downs);
          var coherence = dominant / dimsAbove15.length;
          if (coherence >= 0.75) {
            triggers.push({
              id: 'convergent',
              label: dimsAbove15.length + '-dimension convergent shift (' + Math.round(coherence * 100) + '% coherent)',
              dimensions: dimsAbove15
            });
          }
        }

        if (triggers.length > 0) {
          // Determine direction
          var allDevDims = {};
          triggers.forEach(function(t){ t.dimensions.forEach(function(d){ allDevDims[d] = true; }); });
          var dimList = Object.keys(allDevDims);
          var elevated = dimList.filter(function(k){ return dirs[k] > 0; }).length;
          var reduced = dimList.filter(function(k){ return dirs[k] < 0; }).length;
          var direction = elevated > 0 && reduced > 0 ? 'mixed' : (elevated > 0 ? 'elevated' : 'reduced');

          var severity = (triggers.length >= 2 || anyAbove3) ? 'Marked' : 'Notable';

          c._flag = {
            severity: severity,
            triggers: triggers,
            dimensions: dimList,
            direction: direction,
            maxDev: maxDev
          };
        }
      });

      // Step 2: T3 boundary-peak pass — adds flagging to chunks at peak boundaries
      styleChangeFunction.forEach(function(scf) {
        if (scf.distance < 2.0) return;
        var chunkA = chunks.find(function(c){ return c.index === scf.fromIndex; });
        var chunkB = chunks.find(function(c){ return c.index === scf.toIndex; });
        if (!chunkA || !chunkB) return;
        // Pick the chunk with larger absolute deviation from baseline (the "anomalous side" of the boundary)
        var devA = chunkDeviation(chunkA);
        var devB = chunkDeviation(chunkB);
        var target = devA >= devB ? chunkA : chunkB;
        var trigger = {
          id: 'boundary',
          label: 'Boundary peak (chunks ' + scf.fromIndex + '↔' + scf.toIndex + ', dissimilarity ' + scf.distance.toFixed(1) + ')',
          dimensions: []
        };
        if (target._flag) {
          // Already flagged — append boundary trigger and possibly upgrade severity
          target._flag.triggers.push(trigger);
          if (target._flag.severity === 'Notable') target._flag.severity = 'Marked';
        } else {
          // New flag from boundary alone
          target._flag = {
            severity: 'Notable',
            triggers: [trigger],
            dimensions: [],
            direction: 'mixed',
            maxDev: chunkDeviation(target)
          };
        }
      });
    }
    computeFlagging();
    var flagCount = chunks.filter(function(c){ return c._flag; }).length;

    // ── Renderer-derived consistency band — strictly tied to flag count ───────
    // 0 flagged   → "Consistent with Single Authorship"
    // 1 flagged   → "Notable Stylistic Variation"
    // 2+ flagged  → "Significant Stylistic Variation"
    // This eliminates the score/flag contradiction by construction.
    var derivedBand;
    if (flagCount === 0) derivedBand = 'Consistent with Single Authorship';
    else if (flagCount === 1) derivedBand = 'Notable Stylistic Variation';
    else derivedBand = 'Significant Stylistic Variation';
    bandColor = bandColorTable[derivedBand] || '#5f6368';
    bandBg    = bandBgTable[derivedBand]    || '#f1f3f4';
    // Tier glyph for the verdict bar — replaces the former 0-100 score ring.
    // The headline IS the band; the glyph is a visual tier cue, not a number.
    var bandGlyph = flagCount === 0 ? '&#10003;'        // check
                  : flagCount === 1 ? '&#9679;'         // single dot
                  : '&#9650;';                          // triangle

    // ── Observation pointer ───────────────────────────────────────────────────
    // The model emits a holisticAssessment ("Internally consistent" / "Minor
    // variation" / "Notable variation" / "Marked variation") — a stepping-back
    // whole-document read, separate from the renderer's mechanical flag count.
    // When the renderer flags nothing (flagCount 0) but the model's holistic
    // read still noticed variation, that divergence is meaningful: there is a
    // passage the model considered the document's most notable variation, even
    // though no mechanical trigger fired. We surface it as a NEUTRAL pointer —
    // not a flag, not a concern. In authentic writing passages naturally vary;
    // the pointer only tells the educator WHERE the variation is most visible,
    // and leaves all judgment with them. When flagCount > 0 the flagged passage
    // cards already do this job, so the pointer is shown only for the clean-
    // but-noticed case. The chunk is sourced from the model's own
    // contrastPassages pick (chunkIndexA = the more-deviating chunk).
    var observationPointer = '';
    var ha = (r && typeof r.holisticAssessment === 'string') ? r.holisticAssessment : '';
    if (flagCount === 0 && ha && ha !== 'Internally consistent'
        && Array.isArray(r.contrastPassages) && r.contrastPassages.length
        && r.contrastPassages[0] && r.contrastPassages[0].chunkIndexA !== undefined) {
      var obsChunk = r.contrastPassages[0].chunkIndexA;
      observationPointer =
        'No passage in this document met the threshold for a flag. One passage — ' +
        'chunk ' + esc(String(obsChunk)) + ' — showed the document\u2019s most notable ' +
        'internal stylistic variation. This is not a flag: in authentic writing, ' +
        'passages naturally vary in register and complexity. If you choose to discuss ' +
        'the essay with the student, chunk ' + esc(String(obsChunk)) + ' is where that ' +
        'variation is most visible.';
    }

    // ── Chunk color helper — deviation from WRITER BASELINE ───────────────────
    function chunkDeviation(chunk) {
      if (!chunk.scores) return 0;
      var total = 0, count = 0;
      dimKeys.forEach(function(k) {
        if (chunk.scores[k] !== undefined && baselineMeans[k] !== undefined) {
          total += Math.abs(chunk.scores[k] - baselineMeans[k]);
          count++;
        }
      });
      return count ? total / count : 0;
    }
    function chunkColor(chunk) {
      if (!isProseChunk(chunk)) return '#9aa0a6'; // grey for non-prose (citations, headings)
      if (chunk._flag) {
        return chunk._flag.severity === 'Marked' ? '#c5221f' : '#f29900';
      }
      return '#34a853';
    }

    // ── Heatmap row ───────────────────────────────────────────────────────────
    var heatmapHTML = '';
    if (chunks.length) {
      var markedChunks = chunks.filter(isModelMarked);
      var blocks = chunks.map(function(c) {
        var col = chunkColor(c);
        var nonProse = !isProseChunk(c);
        var marked = isModelMarked(c);
        var tip = 'Chunk ' + c.index + (c.wordRange ? ' (' + c.wordRange + ')' : '');
        if (nonProse) tip += ' — non-prose (excluded from baseline)';
        else if (c._flag) tip += ': ' + c._flag.severity + ' — ' + c._flag.triggers.map(function(t){ return t.label; }).join('; ');
        if (marked) tip += (c._flag || nonProse ? ' · ' : ': ') + 'strongest stylistic divergence in this document';
        // A chunk is clickable if it has a mechanical flag OR the model marked it.
        var jumpTarget = c._flag
          ? 'passage-chunk-' + c.index
          : 'chunk-row-' + c.index;
        var isClickable = c._flag || marked;
        var attrs = isClickable
          ? ' onclick="document.getElementById(\'' + jumpTarget + '\')?.scrollIntoView({behavior:\'smooth\',block:\'start\'})" style="background:' + col + ';cursor:pointer;"'
          : ' style="background:' + col + (nonProse ? ';opacity:0.55' : '') + ';"';
        var badge = marked
          ? '<span class="heat-mark" aria-hidden="true">&#9650;</span>'
          : '';
        return '<div class="heat-block"' + attrs + ' title="' + esc(tip) + '">' +
          badge +
          '<span class="heat-num">' + c.index + '</span>' +
          '</div>';
      }).join('');
      // One-line pointer above the heatmap — surfaces the model signal for a
      // teacher skimming or reading on paper, without a standalone section.
      var markPointer = '';
      if (markedChunks.length) {
        var nums = markedChunks.map(function(c){ return c.index; }).join(', ');
        markPointer = '<p class="heat-mark-pointer">' +
          '<span class="heat-mark" aria-hidden="true">&#9650;</span> ' +
          (markedChunks.length === 1
            ? 'Chunk ' + nums + ' showed the strongest stylistic divergence from this writer’s baseline'
            : 'Chunks ' + nums + ' showed the strongest stylistic divergence from this writer’s baseline') +
          ' — marked on the map below. This is one signal among several; interpretation rests with the educator.' +
          '</p>';
      }
      heatmapHTML = '<div class="section">' +
        '<h2>Stylometric Heatmap <span class="section-meta">' + chunks.length + ' chunks · ' + flagCount + ' difference' + (flagCount === 1 ? '' : 's') + ' noted</span></h2>' +
        markPointer +
        '<div class="heat-legend">' +
        '<span class="heat-leg-item"><span class="heat-leg-swatch" style="background:#34a853;"></span>Within Baseline</span>' +
        '<span class="heat-leg-item"><span class="heat-leg-swatch" style="background:#f29900;"></span>Notable Difference</span>' +
        '<span class="heat-leg-item"><span class="heat-leg-swatch" style="background:#c5221f;"></span>Marked Difference</span>' +
        '<span class="heat-leg-item"><span class="heat-leg-swatch" style="background:#9aa0a6;opacity:0.55;"></span>Non-prose (excluded)</span>' +
        (markedChunks.length ? '<span class="heat-leg-item"><span class="heat-mark heat-mark-leg" aria-hidden="true">&#9650;</span>Strongest divergence</span>' : '') +
        '</div>' +
        '<div class="heat-row">' + blocks + '</div>' +
        '<p class="meta" style="margin-top:8px;margin-bottom:0;">Click a flagged chunk to jump to its analysis below. Non-prose chunks (bibliography, headings, lists) are scored but excluded from the writer baseline.</p>' +
        '</div>';
    }

    // ── Per-chunk data table ──────────────────────────────────────────────────
    var tableHTML = '';
    if (chunks.length) {
      var headerCells = '<th>Chunk</th><th>Words</th>' +
        dimKeys.map(function(k){ return '<th>' + dimLabels[k] + '</th>'; }).join('') +
        '<th style="white-space:nowrap;min-width:110px;">Status</th>';
      var rows = chunks.map(function(c) {
        var nonProse = !isProseChunk(c);
        var cells = dimKeys.map(function(k) {
          var score = c.scores ? (c.scores[k] !== undefined ? c.scores[k] : '—') : '—';
          // Compare against WRITER BASELINE (unflagged prose), not whole-document mean
          var ref = baselineMeans[k] !== undefined ? baselineMeans[k] : 5;
          var dev = (typeof score === 'number' && !nonProse) ? score - ref : 0;
          var col = nonProse ? '#9aa0a6' : (Math.abs(dev) >= 3 ? '#c5221f' : Math.abs(dev) >= 2 ? '#b06000' : '#202124');
          var arrow = !nonProse ? (dev > 0.5 ? '↑' : dev < -0.5 ? '↓' : '') : '';
          var weight = (!nonProse && Math.abs(dev) >= 2) ? '700' : '400';
          return '<td style="color:' + col + ';font-weight:' + weight + ';">' +
            score + (arrow ? '<span style="font-size:9px;"> ' + arrow + '</span>' : '') + '</td>';
        }).join('');
        var _fCol = chunkColor(c);
        var _fLabel;
        if (nonProse) _fLabel = 'Non-prose';
        else if (c._flag) _fLabel = c._flag.severity === 'Marked' ? 'Marked Difference' : 'Notable Difference';
        else _fLabel = 'Within Baseline';
        var statusBg = nonProse ? '#9aa0a6' : (c._flag ? _fCol : '#34a853');
        var status = '<td style="white-space:nowrap;min-width:110px;"><span class="flag-pill" style="background:' + statusBg + ';">' + _fLabel + '</span></td>';
        // Click chunk number to jump to flagged passage card (if flagged)
        var chunkNumCell = c._flag
          ? '<td><a href="#passage-chunk-' + c.index + '" class="chunk-jump"><strong>' + c.index + '</strong></a></td>'
          : '<td><strong style="color:' + (nonProse ? '#9aa0a6' : '#202124') + ';">' + c.index + '</strong></td>';
        return '<tr id="chunk-row-' + c.index + '" class="' + (c._flag ? 'row-flagged' : (nonProse ? 'row-nonprose' : '')) + '">' +
          chunkNumCell +
          '<td style="color:#80868b;white-space:nowrap;">' + esc(c.wordRange || '—') + '</td>' +
          cells + status + '</tr>';
      }).join('');

      // Two mean rows: writer baseline (primary, against which arrows are measured) and document mean (reference)
      var baselineCells = dimKeys.map(function(k) {
        return '<td style="color:#202124;font-weight:700;">' +
          (baselineMeans[k] !== undefined ? baselineMeans[k].toFixed(1) : '—') + '</td>';
      }).join('');
      var baselineLabel = baselineSourceCount > 0
        ? 'Writer baseline <span style="color:#5f6368;font-weight:400;font-style:normal;">(' + baselineSourceCount + ' unflagged prose chunk' + (baselineSourceCount === 1 ? '' : 's') + ')</span>'
        : 'Writer baseline';
      var baselineRow = '<tr class="baseline-row"><td colspan="2" style="color:#202124;font-weight:700;">' + baselineLabel + '</td>' + baselineCells + '<td></td></tr>';

      var docMeans = r.documentMeans || {};
      var docMeanCells = dimKeys.map(function(k) {
        return '<td style="color:#3c4043;font-style:italic;font-size:11px;">' +
          (docMeans[k] !== undefined ? docMeans[k].toFixed(1) : '—') + '</td>';
      }).join('');
      var docMeanRow = '<tr class="mean-row"><td colspan="2" style="color:#3c4043;font-style:italic;font-size:11px;">Whole-document mean (all chunks)</td>' + docMeanCells + '<td></td></tr>';

      tableHTML = '<div class="section">' +
        '<h2>Chunk Measurements <span class="section-meta">↑↓ = above/below writer baseline &nbsp;·&nbsp; bold = notable deviation &nbsp;·&nbsp; click flagged chunk numbers to jump</span></h2>' +
        '<div style="overflow-x:auto;">' +
        '<table class="data-table"><thead><tr>' + headerCells + '</tr></thead>' +
        '<tbody>' + rows + baselineRow + docMeanRow + '</tbody></table>' +
        '</div></div>';
    }

    // ── Writer baseline bar chart (primary) with whole-document mean (secondary) ─
    var meansHTML = '';
    if (Object.keys(baselineMeans).length) {
      var bars = dimKeys.map(function(k) {
        var val = baselineMeans[k] !== undefined ? baselineMeans[k] : 5;
        var docVal = r.documentMeans && r.documentMeans[k] !== undefined ? r.documentMeans[k] : null;
        var pct = (val / 10) * 100;
        var col = val >= 7 ? '#1a73e8' : val <= 3 ? '#ea8600' : '#4A6FA5';
        // Show secondary marker for whole-document mean if it differs meaningfully (≥0.3)
        var docMarker = '';
        if (docVal !== null && Math.abs(docVal - val) >= 0.3) {
          var docPct = (docVal / 10) * 100;
          docMarker = '<div class="dim-doc-marker" style="left:' + docPct + '%;" title="Whole-document mean: ' + docVal.toFixed(1) + '"></div>';
        }
        var docValLabel = (docVal !== null && Math.abs(docVal - val) >= 0.3)
          ? '<span class="dim-doc-val" title="Whole-document mean">' + docVal.toFixed(1) + '</span>'
          : '';
        return '<div class="dim-row">' +
          '<div class="dim-label-wrap"><span class="dim-lbl">' + dimLabels[k] + '</span>' +
          '<span class="dim-sub">' + dimDesc[k] + '</span></div>' +
          '<div class="dim-bar-wrap"><div class="dim-bar" style="width:' + pct + '%;background:' + col + ';"></div>' +
          docMarker + '</div>' +
          '<span class="dim-val">' + val.toFixed(1) + '/10</span>' +
          docValLabel +
          '</div>';
      }).join('');
      var sourceText = baselineSourceCount > 0
        ? 'Mean across <strong>' + baselineSourceCount + ' unflagged prose chunk' + (baselineSourceCount === 1 ? '' : 's') + '</strong> — the writer\'s characteristic measurements with deviating passages and non-prose excluded. The dark caret marker (where shown) points to the whole-document mean including all chunks; a visible gap between the bar end and the caret indicates that deviating passages are pulling the document mean away from the writer\'s baseline.'
        : 'No unflagged prose chunks available — using whole-document means as fallback.';
      meansHTML = '<div class="section"><h2>Writer Baseline Profile</h2>' +
        '<p class="meta">' + sourceText + '</p>' +
        bars + '</div>';
    }

    // ── Dimension summary with computed stats ────────────────────────────────
    var dimSumHTML = '';
    if (r.dimensionSummary) {
      var rows2 = dimKeys.map(function(k) {
        var text = r.dimensionSummary[k];
        if (!text) return '';
        // Use WRITER BASELINE for the headline avg (matches what the prose describes)
        var mean = baselineMeans[k] !== undefined ? baselineMeans[k] : null;

        // Compute min, max across PROSE chunks only (non-prose scores are irrelevant for the writer's range)
        var chunkScores = chunks.filter(isProseChunk).map(function(c){ return c.scores && c.scores[k] !== undefined ? c.scores[k] : null; }).filter(function(v){ return v !== null; });
        var minScore = chunkScores.length ? Math.min.apply(null, chunkScores) : null;
        var maxScore = chunkScores.length ? Math.max.apply(null, chunkScores) : null;

        // Chunks that deviated 2+ from WRITER BASELINE (prose only)
        var deviatedChunks = chunks.filter(function(c){
          return isProseChunk(c) && c.scores && c.scores[k] !== undefined && mean !== null && Math.abs(c.scores[k] - mean) >= 2;
        });
        var deviatedUp   = deviatedChunks.filter(function(c){ return c.scores[k] > mean; }).map(function(c){ return c.index; });
        var deviatedDown = deviatedChunks.filter(function(c){ return c.scores[k] < mean; }).map(function(c){ return c.index; });

        var statsHTML = '';
        if (mean !== null) {
          statsHTML += '<span class="ds-stat">Baseline: <strong>' + mean.toFixed(1) + '</strong></span>';
        }
        if (minScore !== null && maxScore !== null) {
          statsHTML += '<span class="ds-stat">Range: <strong>' + minScore + '–' + maxScore + '</strong></span>';
        }
        if (deviatedUp.length) {
          statsHTML += '<span class="ds-stat ds-up">↑ Chunks: ' + deviatedUp.join(', ') + '</span>';
        }
        if (deviatedDown.length) {
          statsHTML += '<span class="ds-stat ds-down">↓ Chunks: ' + deviatedDown.join(', ') + '</span>';
        }

        return '<div class="dim-sum-row">' +
          '<div class="dim-sum-left">' +
          '<span class="dim-sum-label">' + dimLabels[k] + '</span>' +
          (statsHTML ? '<div class="ds-stats">' + statsHTML + '</div>' : '') +
          '</div>' +
          '<span class="dim-sum-text">' + esc(text) + '</span>' +
          '</div>';
      }).join('');
      dimSumHTML = '<div class="section"><h2>Dimension Notes</h2>' + rows2 + '</div>';
    }

    // ── Baseline profile ──────────────────────────────────────────────────────
    var baselineHTML = '';
    if (r.baselineProfile && r.baselineProfile.length) {
      baselineHTML = '<div class="section"><h2>Writer\'s Stylometric Baseline</h2>' +
        '<p class="meta">Five observations about this writer\'s characteristic style, derived from the document as a whole. These are the reference points against which deviations are measured.</p><ul>' +
        r.baselineProfile.map(function(p){ return '<li>' + esc(p) + '</li>'; }).join('') +
        '</ul></div>';
    }

    // ── Flagged passages ─ assembled from chunks[]._flag + chunks[].analysis ──
    // Schema change (v3.2.0+): r.flaggedPassages is GONE. The renderer derives flagged
    // chunks from its own triggers (see computeFlagging above) and pulls the
    // qualitative content (quote, evidence, finding, discussionQuestions) from
    // chunks[].analysis. Backward compat: if a flagged chunk has no analysis (old
    // report or model error), render a placeholder with the trigger detail.
    var passagesHTML = '';
    var flaggedChunks = chunks.filter(function(c){ return c._flag; })
                              .sort(function(a, b){ return a.index - b.index; });

    if (flaggedChunks.length) {
      // Group consecutive flagged chunks into zones
      var zones = [];
      flaggedChunks.forEach(function(c) {
        var last = zones[zones.length - 1];
        if (last && c.index === last[last.length - 1].index + 1) {
          last.push(c);
        } else {
          zones.push([c]);
        }
      });

      var sevOrder = { 'Marked': 3, 'Notable': 2, 'Moderate': 2, 'Minor': 1 };

      var zoneCards = zones.map(function(zone) {
        var isMulti = zone.length > 1;
        var chunkNums = zone.map(function(c){ return c.index; });
        var chunkLabel = isMulti
          ? 'Chunks ' + chunkNums[0] + '–' + chunkNums[chunkNums.length-1]
          : 'Chunk ' + chunkNums[0];

        // Severity = worst in zone
        var worstSev = zone.reduce(function(best, c) {
          return (sevOrder[c._flag.severity] || 0) > (sevOrder[best] || 0) ? c._flag.severity : best;
        }, 'Notable');
        var sevColor = worstSev === 'Marked' ? '#c5221f' : '#f29900';
        var sevLabel = worstSev === 'Marked' ? 'Marked Difference' : 'Notable Difference';

        // Merged dimensions across zone (from triggers)
        var allDims = {};
        zone.forEach(function(c) {
          (c._flag.dimensions || []).forEach(function(d){ allDims[d] = true; });
        });
        var dims = Object.keys(allDims).map(function(d){ return dimLabels[d] || d; }).join(', ');

        // Direction across zone
        var dirs = zone.map(function(c){ return c._flag.direction; });
        var dir = dirs.every(function(d){ return d === dirs[0]; }) ? dirs[0] : 'mixed';
        var dirLabel = dir === 'elevated' ? '↑ Elevated' : dir === 'reduced' ? '↓ Reduced' : '↕ Mixed';

        // Trigger badges — show what fired (renderer transparency)
        var allTriggerIds = {};
        zone.forEach(function(c) {
          (c._flag.triggers || []).forEach(function(t){ allTriggerIds[t.id] = true; });
        });
        var triggerBadges = Object.keys(allTriggerIds).map(function(tid) {
          var label = tid === 'absolute'   ? 'Absolute deviation'
                    : tid === 'convergent' ? 'Convergent shift'
                    : tid === 'boundary'   ? 'Boundary peak'
                    : tid;
          return '<span class="trigger-badge" title="Flagging trigger that fired for this passage">' + esc(label) + '</span>';
        }).join('');

        // Per-chunk content within zone — pull from analysis
        var passageDetails = zone.map(function(c) {
          var a = c.analysis || {};
          var quote = a.quote || '';
          var evidence = Array.isArray(a.evidence) ? a.evidence : [];
          var finding = a.finding || '';

          var evidenceHTML = evidence.length
            ? '<div class="evidence-chips">' +
              evidence.map(function(e){ return '<span class="chip">' + esc(e) + '</span>'; }).join('') +
              '</div>'
            : '';

          // Show trigger detail per chunk in zone (when zone is multi-chunk)
          var chunkHeader = isMulti
            ? '<div class="zone-chunk-hdr">Chunk ' + c.index + ' <span class="zone-dev-note">— ' +
              esc((c._flag.triggers || []).map(function(t){ return t.label; }).join('; ')) +
              '</span></div>'
            : '';

          var fallbackFinding = '';
          if (!quote && !evidence.length && !finding) {
            fallbackFinding = 'This chunk was flagged by mechanical pattern detection (' +
              esc((c._flag.triggers || []).map(function(t){ return t.label; }).join('; ')) +
              '). The model did not provide qualitative analysis content for this chunk; review the chunk\'s scores in the Chunk Measurements table above.';
          }

          return chunkHeader +
            (quote ? '<blockquote>' + esc(quote) + '</blockquote>' : '') +
            evidenceHTML +
            '<p class="finding-text">' + esc(finding || fallbackFinding) + '</p>';
        }).join('<hr class="zone-divider">');

        // Aggregate discussion questions from each chunk's analysis
        var allQs = [];
        zone.forEach(function(c) {
          var a = c.analysis;
          if (a && Array.isArray(a.discussionQuestions)) {
            a.discussionQuestions.forEach(function(q){ allQs.push(q); });
          }
        });
        var questionsHTML = allQs.length
          ? '<div class="discussion-questions">' +
            '<div class="dq-label">💬 Discussion Questions</div>' +
            '<ol class="dq-list">' +
            allQs.map(function(q){ return '<li>' + esc(q) + '</li>'; }).join('') +
            '</ol></div>'
          : '';

        // Word range label
        var zoneWordRanges = zone.map(function(c){ return c.wordRange; }).filter(Boolean);
        var wordRangeLabel = '';
        if (zoneWordRanges.length) {
          if (isMulti) {
            var firstMatch = zoneWordRanges[0].match(/\d+/);
            var lastMatch  = zoneWordRanges[zoneWordRanges.length-1].match(/\d+(?=[^\d]*$)/);
            wordRangeLabel = firstMatch && lastMatch
              ? firstMatch[0] + '–' + lastMatch[0] + ' words'
              : zoneWordRanges.join(', ');
          } else {
            wordRangeLabel = zoneWordRanges[0];
          }
        }

        // Anchors for scroll-to-jump
        var anchors = chunkNums.map(function(idx){ return '<span id="passage-chunk-' + idx + '" class="anchor-offset"></span>'; }).join('');

        return '<div class="passage-card' + (isMulti ? ' zone-card' : '') + '">' +
          anchors +
          '<div class="passage-hdr">' +
          '<span class="sev-badge" style="background:' + sevColor + ';">' + sevLabel + '</span>' +
          '<span class="chunk-label">' + chunkLabel + (isMulti ? ' <span class="zone-badge">Zone</span>' : '') + '</span>' +
          (wordRangeLabel ? '<span class="word-range-label">📍 ' + esc(wordRangeLabel) + '</span>' : '') +
          (dims ? '<span class="dir-badge">' + dirLabel + '</span>' : '') +
          (dims ? '<span class="dims-label">' + esc(dims) + '</span>' : '') +
          '</div>' +
          (triggerBadges ? '<div class="trigger-badges-row">' + triggerBadges + '</div>' : '') +
          passageDetails +
          questionsHTML +
          '</div>';
      }).join('');

      passagesHTML = '<div class="section"><h2>Stylistic Differences <span class="section-meta">' +
        flaggedChunks.length + ' passage' + (flaggedChunks.length !== 1 ? 's' : '') +
        ' · ' + zones.length + ' zone' + (zones.length !== 1 ? 's' : '') + '</span></h2>' +
        '<p class="meta">Passages flagged by within-document style change detection (Stamatatos 2009; Zeng et al. 2024). ' +
        'Trigger badges show which mechanical pattern fired: <strong>Absolute deviation</strong> = single-dimension or multi-dimension threshold breach; ' +
        '<strong>Convergent shift</strong> = four or more dimensions moving together; ' +
        '<strong>Boundary peak</strong> = sharp dissimilarity from adjacent chunks. ' +
        'Consecutive flagged chunks are grouped into zones.</p>' +
        zoneCards + '</div>';
    }

    // ── Contrast passages ─ updated flat schema (chunkIndexA/B + textA/B) ─────
    // Backward compat: if old-schema { flaggedChunk, baselineChunk } shapes appear,
    // normalize them to the new shape.
    var contrastPassagesHTML = '';
    if (Array.isArray(r.contrastPassages) && r.contrastPassages.length) {
      contrastPassagesHTML = '<div class="section"><h2>Passages of Interest</h2>' +
        '<p class="meta">These passages illustrate the most significant internal stylistic contrasts within this document. No specialist knowledge is required to perceive the difference.</p>' +
        r.contrastPassages.map(function(cp) {
          // Normalize old vs new schema
          var aIdx, bIdx, aText, bText;
          if (cp.chunkIndexA !== undefined) {
            aIdx = cp.chunkIndexA; bIdx = cp.chunkIndexB;
            aText = cp.textA || ''; bText = cp.textB || '';
          } else if (cp.flaggedChunk) {
            aIdx = cp.flaggedChunk.chunkIndex; bIdx = cp.baselineChunk ? cp.baselineChunk.chunkIndex : null;
            aText = cp.flaggedChunk.text || ''; bText = cp.baselineChunk ? cp.baselineChunk.text || '' : '';
          } else { aIdx = null; bIdx = null; aText = ''; bText = ''; }

          // Decide which side is "the deviating one" based on renderer's flagging
          var aIsFlagged = aIdx !== null && chunks.find(function(c){ return c.index === aIdx; }) && chunks.find(function(c){ return c.index === aIdx; })._flag;
          var bIsFlagged = bIdx !== null && chunks.find(function(c){ return c.index === bIdx; }) && chunks.find(function(c){ return c.index === bIdx; })._flag;

          var leftLabel  = 'Chunk ' + aIdx + (aIsFlagged ? ' — Flagged Passage' : ' — Baseline Passage');
          var rightLabel = 'Chunk ' + bIdx + (bIsFlagged ? ' — Flagged Passage' : ' — Baseline Passage');
          var leftClass  = aIsFlagged ? 'contrast-col-flagged' : 'contrast-col-baseline';
          var rightClass = bIsFlagged ? 'contrast-col-flagged' : 'contrast-col-baseline';
          var leftHdrClass  = aIsFlagged ? 'flagged-hdr' : 'baseline-hdr';
          var rightHdrClass = bIsFlagged ? 'flagged-hdr' : 'baseline-hdr';

          return '<div class="contrast-card">' +
            '<div class="contrast-label">' + esc(cp.label || '') +
              (cp.dimensions && cp.dimensions.length ? ' <span class="contrast-dims">— ' + cp.dimensions.map(function(d){ return esc(dimLabels[d]||d); }).join(', ') + '</span>' : '') +
            '</div>' +
            '<div class="contrast-cols">' +
              '<div class="contrast-col ' + leftClass + '">' +
                '<div class="contrast-col-hdr ' + leftHdrClass + '">' + esc(leftLabel) + '</div>' +
                '<p class="contrast-text">' + esc(aText) + '</p>' +
              '</div>' +
              '<div class="contrast-col ' + rightClass + '">' +
                '<div class="contrast-col-hdr ' + rightHdrClass + '">' + esc(rightLabel) + '</div>' +
                '<p class="contrast-text">' + esc(bText) + '</p>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    // ── Recommended actions ───────────────────────────────────────────────────
    var actionsHTML = '';
    if (r.recommendedActions && r.recommendedActions.length) {
      actionsHTML = '<div class="section"><h2>Recommended Next Steps</h2><ol>' +
        r.recommendedActions.map(function(a){ return '<li>' + esc(a) + '</li>'; }).join('') +
        '</ol></div>';
    }

    // ── Style Change Function chart (Stamatatos 2009; Zeng et al. 2024) ──────
    // Adjacent-prose-chunk dissimilarity. Peaks indicate boundaries where the
    // writing changes character. Shaded vertical bands mark flagged chunks so
    // the relationship between "where the writing changes" and "what got
    // flagged" is visually anchored.
    var scfHTML = '';
    if (styleChangeFunction.length >= 2) {
      var SCF_W = 720, SCF_H = 130, SCF_PAD_L = 36, SCF_PAD_R = 12, SCF_PAD_T = 14, SCF_PAD_B = 26;
      var plotW = SCF_W - SCF_PAD_L - SCF_PAD_R;
      var plotH = SCF_H - SCF_PAD_T - SCF_PAD_B;
      // X axis: prose chunks plotted at evenly-spaced positions; SCF values
      // sit between adjacent chunks (so a value sits at the midpoint between
      // its two prose-chunk x-positions).
      var n = proseSequence.length;
      function chunkX(i) { return SCF_PAD_L + (n === 1 ? plotW/2 : (i / (n - 1)) * plotW); }
      // Y axis: 0 at bottom, max at top; auto-scale to either observed max+1 or 5.0
      var yMax = Math.max(5, Math.ceil(scfMax + 0.5));
      function distY(d) { return SCF_PAD_T + plotH - (d / yMax) * plotH; }

      // Shaded bands for flagged prose chunks (centered on chunk position)
      var bandHalfWidth = n > 1 ? (plotW / (n - 1)) / 2 : plotW / 4;
      var bands = proseSequence.map(function(c, i) {
        if (!c._flag) return '';
        var center = chunkX(i);
        var x1 = Math.max(SCF_PAD_L, center - bandHalfWidth);
        var x2 = Math.min(SCF_W - SCF_PAD_R, center + bandHalfWidth);
        if (x2 <= x1) return '';
        var col = chunkColor(c);
        return '<rect x="' + x1 + '" y="' + SCF_PAD_T + '" width="' + (x2 - x1) + '" height="' + plotH + '" fill="' + col + '" opacity="0.14"/>';
      }).join('');

      // Threshold line at dissimilarity = 2.0 (heuristic — sharper boundaries above this)
      var thresholdY = distY(2.0);
      var thresholdLine = '<line x1="' + SCF_PAD_L + '" y1="' + thresholdY + '" x2="' + (SCF_W - SCF_PAD_R) + '" y2="' + thresholdY + '" stroke="#5f6368" stroke-width="1.25" stroke-dasharray="4,3" opacity="0.7"/>' +
        '<text x="' + (SCF_W - SCF_PAD_R - 4) + '" y="' + (thresholdY - 3) + '" text-anchor="end" font-size="9" font-weight="600" fill="#5f6368">notable boundary threshold</text>';

      // Y axis labels
      var yAxis = '<text x="' + (SCF_PAD_L - 4) + '" y="' + (SCF_PAD_T + 4) + '" text-anchor="end" font-size="9" font-weight="600" fill="#5f6368">' + yMax + '</text>' +
        '<text x="' + (SCF_PAD_L - 4) + '" y="' + (SCF_PAD_T + plotH + 3) + '" text-anchor="end" font-size="9" font-weight="600" fill="#5f6368">0</text>' +
        '<text x="10" y="' + (SCF_PAD_T + plotH/2) + '" text-anchor="middle" font-size="9" font-weight="600" fill="#5f6368" transform="rotate(-90 10 ' + (SCF_PAD_T + plotH/2) + ')">dissimilarity</text>';

      // X axis chunk-number labels (only label prose chunks; non-prose are not in the sequence)
      var xAxis = proseSequence.map(function(c, i) {
        var x = chunkX(i);
        return '<text x="' + x + '" y="' + (SCF_H - 8) + '" text-anchor="middle" font-size="10" fill="' + (c._flag ? '#c5221f' : '#5f6368') + '" font-weight="' + (c._flag ? '700' : '400') + '">' + c.index + '</text>';
      }).join('');
      // Baseline tick marks for each chunk
      var ticks = proseSequence.map(function(c, i) {
        var x = chunkX(i);
        return '<line x1="' + x + '" y1="' + (SCF_PAD_T + plotH) + '" x2="' + x + '" y2="' + (SCF_PAD_T + plotH + 3) + '" stroke="#5f6368" stroke-width="1"/>';
      }).join('');
      // Baseline (zero line) — anchors the chart so the threshold has visual reference
      var zeroLine = '<line x1="' + SCF_PAD_L + '" y1="' + (SCF_PAD_T + plotH) + '" x2="' + (SCF_W - SCF_PAD_R) + '" y2="' + (SCF_PAD_T + plotH) + '" stroke="#5f6368" stroke-width="1"/>';

      // Build the polyline of dissimilarity values. Each value lives between
      // two consecutive chunks, so plot it at the midpoint x of the two chunks.
      var points = styleChangeFunction.map(function(scf, i) {
        var midX = (chunkX(i) + chunkX(i + 1)) / 2;
        var y = distY(scf.distance);
        return midX + ',' + y;
      }).join(' ');
      var polyline = '<polyline points="' + points + '" fill="none" stroke="#4A6FA5" stroke-width="2" stroke-linejoin="round"/>';
      // Dots on each point with tooltips
      var dots = styleChangeFunction.map(function(scf, i) {
        var midX = (chunkX(i) + chunkX(i + 1)) / 2;
        var y = distY(scf.distance);
        var isPeak = scf.distance >= 2.0;
        var col = isPeak ? '#c5221f' : '#4A6FA5';
        var rad = isPeak ? 4 : 3;
        return '<circle cx="' + midX + '" cy="' + y + '" r="' + rad + '" fill="' + col + '"><title>Chunk ' + scf.fromIndex + ' → ' + scf.toIndex + ': dissimilarity ' + scf.distance.toFixed(1) + '</title></circle>';
      }).join('');

      var svg = '<svg viewBox="0 0 ' + SCF_W + ' ' + SCF_H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">' +
        bands + zeroLine + thresholdLine + yAxis + ticks + xAxis + polyline + dots +
        '</svg>';

      scfHTML = '<div class="section">' +
        '<h2>Style Change Function <span class="section-meta">adjacent-chunk dissimilarity across the document</span></h2>' +
        '<p class="meta">Each point measures how much the writing changes between two consecutive prose chunks (Stamatatos 2009; Zeng et al. 2024). Peaks indicate boundaries where the writing shifts character — the diagnostic signal in within-document style-change detection. Shaded bands mark flagged chunks; chunk numbers below align vertically with the heatmap and chunk table that follow.</p>' +
        '<div class="scf-chart">' + svg + '</div>' +
        '</div>';
    }

    // ── Methodology block (research grounding, kept short) ───────────────────
    var methodologyHTML =
      '<div class="section methodology-section">' +
      '<h2>Methodology &amp; References</h2>' +
      '<p class="method-text">This report applies <strong>within-document style change detection</strong> — a methodology established by Stamatatos (2009) for intrinsic plagiarism detection, extended for hybrid (partial-machine) student writing by Zeng et al. (AAAI 2024), and currently advanced by the SemEval-2024 Task 8 hybrid text detection benchmark. The document is divided into ~150-word chunks; each prose chunk is scored across seven stylometric dimensions; flagging is applied via three mechanical triggers: <strong>absolute deviation</strong> (single-dimension or multi-dimension threshold breach versus the writer\'s baseline), <strong>convergent shift</strong> (four or more dimensions moving together with directional coherence), and <strong>boundary peak</strong> (sharp adjacent-chunk dissimilarity in the style change function). The seven-dimension scoring is informed by comparative-corpus research on student vs. machine-generated argumentative essays (Goulart et al. 2024; Herbold et al. 2023; Liu &amp; Liu 2025; Frontiers in Education 2025).</p>' +
      '<p class="method-text"><strong>What this report is and is not.</strong> This methodology detects stylistic discontinuity — where the writing changes character — not authorship. A discontinuity may indicate machine-assisted composition; it may also indicate a quotation, a section drafted on a different day, a tonally distinct genre section, or natural variation. The report surfaces evidence; the educator interprets it.</p>' +
      '<details class="method-refs"><summary>Research references</summary>' +
      '<ul class="ref-list">' +
      '<li>Stamatatos, E. (2009). Intrinsic plagiarism detection using character n-gram profiles. <em>SEPLN PAN-09 Workshop</em>.</li>' +
      '<li>Stein, B., Lipka, N., &amp; Prettenhofer, P. (2011). Intrinsic plagiarism analysis. <em>Language Resources and Evaluation</em>, 45(1), 63–82.</li>' +
      '<li>Zeng, Z., Sha, L., Li, Y., Yang, K., Gašević, D., &amp; Chen, G. (2024). Towards automatic boundary detection for human-AI collaborative hybrid essay in education. <em>AAAI 2024</em>.</li>' +
      '<li>Wang, Y., et al. (2024). SemEval-2024 Task 8: Multigenerator, multidomain, and multilingual black-box machine-generated text detection.</li>' +
      '<li>Goulart, L., et al. (2024). Comparative analysis of student- and ChatGPT-generated argumentative essays.</li>' +
      '<li>Herbold, S., et al. (2023). A large-scale comparison of human-written vs. ChatGPT-generated essays. <em>Scientific Reports</em>, 13.</li>' +
      '<li>Liu, J., &amp; Liu, D. (2025). Syntactic complexity in student vs. machine-generated argumentative writing.</li>' +
      '</ul>' +
      '</details>' +
      '</div>';

    // ── Print fields (editable in browser, locked in print) ───────────────────
    var printFieldsHTML =
      '<div class="print-fields" id="verify-print-fields">' +
      '<div class="pf-title">Report Details <span class="pf-hint no-print">(editable — fill before printing)</span></div>' +
      '<div class="pf-grid">' +
      '<div class="pf-field"><label>Student Name</label>' +
      '<input type="text" class="pf-input" id="pf-student" placeholder="Enter name" value="' + esc(meta.studentName||'') + '" /></div>' +
      '<div class="pf-field"><label>Assignment</label>' +
      '<input type="text" class="pf-input" id="pf-assignment" placeholder="Enter assignment title" value="' + esc(meta.assignment||'') + '" /></div>' +
      '<div class="pf-field"><label>Course</label>' +
      '<input type="text" class="pf-input" id="pf-course" placeholder="Enter course name" value="' + esc(meta.course||'') + '" /></div>' +
      '<div class="pf-field"><label>Date</label>' +
      '<input type="text" class="pf-input" id="pf-date" placeholder="Enter date" value="' + esc(now) + '" /></div>' +
      '</div>' +
      '<div class="pf-stats">' +
      '<span class="stat-pill">Words: ' + (r.wordCount || '—') + '</span>' +
      '<span class="stat-pill">Chunks: ' + (r.chunkCount || chunks.length || '—') + '</span>' +
      '<span class="stat-pill">Flagged: ' + flagCount + '</span>' +
      '<span class="stat-pill">Report ID: ' + esc(r.reportId || '—') + '</span>' +
      '</div>' +
      '</div>';

    // ── Document scope banner ───────────────────────────────────────────
    // Surfaced when the edge function truncated the input document at the
    // single-mode word ceiling. Transparent disclosure so the teacher can
    // see exactly what was analyzed versus what was submitted. Backward
    // compat: if r.documentScope is missing (older reports), nothing renders.
    var scopeHTML = '';
    if (r.documentScope && r.documentScope.truncated) {
      var ds = r.documentScope;
      scopeHTML =
        '<div class="scope-banner">' +
          '<div class="scope-icon">ℹ</div>' +
          '<div class="scope-body">' +
            '<div class="scope-title">Analysis based on the first ' +
              (ds.analyzedWordCount || 0).toLocaleString() +
              ' words of a ' +
              (ds.originalWordCount || 0).toLocaleString() +
              '-word document.</div>' +
            '<div class="scope-detail">PaperTrail Verify analyzes documents up to ' +
              (ds.cap || 3000).toLocaleString() +
              ' words. For longer submissions, the opening section is analyzed in full — sufficient to establish a stylistic baseline and surface within-document discontinuity. To analyze a different section, paste that section directly.</div>' +
          '</div>' +
        '</div>';
    }

    // ── CSS ───────────────────────────────────────────────────────────────────
    var css =
      '*{box-sizing:border-box;margin:0;padding:0;}' +
      'body{font-family:"Google Sans",Arial,sans-serif;background:#f0f4f9;color:#202124;font-size:13px;}' +
      '.topbar{background:#4A6FA5;padding:10px 24px;display:flex;align-items:center;' +
      '  justify-content:space-between;position:sticky;top:0;z-index:100;}' +
      '.topbar h1{font-size:15px;font-weight:700;color:#fff;}' +
      '.topbar h1 em{color:#C9A84C;font-style:italic;}' +
      '.topbar-sub{font-size:11px;color:rgba(255,255,255,.65);margin-top:2px;}' +
      '.print-btn{padding:7px 16px;background:#C9A84C;color:#fff;border:none;border-radius:5px;' +
      '  font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-left:6px;}' +
      '.save-btn{padding:7px 16px;background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:5px;' +
      '  font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-left:6px;}' +
      '.save-btn:hover{background:rgba(255,255,255,0.25);}' +
      '.container{max-width:900px;margin:20px auto;padding:0 20px 40px;}' +

      // Verdict bar
      '.verdict-bar{background:#fff;border-radius:8px;padding:18px 22px;margin-bottom:16px;' +
      '  box-shadow:0 1px 4px rgba(0,0,0,.1);display:flex;align-items:center;gap:20px;flex-wrap:wrap;}' +
      '.band-mark{width:68px;height:68px;border-radius:50%;display:flex;align-items:center;' +
      '  justify-content:center;font-size:30px;font-weight:700;flex-shrink:0;' +
      '  border:2px solid;box-sizing:border-box;}' +
      '.verdict-text h2{font-size:16px;font-weight:700;margin-bottom:3px;}' +
      '.verdict-text p{font-size:12px;color:#5f6368;line-height:1.5;max-width:500px;}' +
      '.mode-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;' +
      '  background:#e8f0fe;color:#1a73e8;letter-spacing:.3px;text-transform:uppercase;margin-top:6px;display:inline-block;}' +

      // Print fields
      '.print-fields{background:#fff;border-radius:8px;padding:16px 20px;margin-bottom:16px;' +
      '  box-shadow:0 1px 3px rgba(0,0,0,.08);}' +
      '.pf-title{font-size:11px;font-weight:700;color:#5f6368;text-transform:uppercase;' +
      '  letter-spacing:.5px;margin-bottom:10px;}' +
      '.pf-hint{font-weight:400;color:#1a73e8;text-transform:none;letter-spacing:0;}' +
      '.pf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}' +
      '.pf-field label{display:block;font-size:10px;font-weight:700;color:#80868b;margin-bottom:3px;text-transform:uppercase;}' +
      '.pf-input{width:100%;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;' +
      '  font-size:12px;font-family:inherit;color:#202124;background:#f8f9fa;outline:none;}' +
      '.pf-input:focus{border-color:#4A6FA5;background:#fff;}' +
      '.pf-stats{display:flex;flex-wrap:wrap;gap:6px;}' +
      '.stat-pill{font-size:11px;font-weight:600;padding:3px 10px;background:#f1f3f4;' +
      '  border-radius:10px;color:#3c4043;}' +

      // Document scope banner — info-toned, not alarm-toned. Matches the
      // Verify teal accent (#2a7a6b) for "informational, not flagged."
      '.scope-banner{display:flex;gap:12px;align-items:flex-start;background:#f0f7f5;' +
      '  border:1px solid #c5e0d8;border-left:4px solid #2a7a6b;border-radius:6px;' +
      '  padding:12px 16px;margin-bottom:14px;}' +
      '.scope-icon{font-size:18px;line-height:1.2;color:#2a7a6b;font-weight:700;flex-shrink:0;}' +
      '.scope-body{flex:1;}' +
      '.scope-title{font-size:13px;font-weight:600;color:#1a3d36;margin-bottom:4px;}' +
      '.scope-detail{font-size:12px;color:#3c4043;line-height:1.5;}' +

      // Sections
      '.section{background:#fff;border-radius:8px;padding:16px 20px;margin-bottom:14px;' +
      '  box-shadow:0 1px 3px rgba(0,0,0,.08);}' +
      '.section h2{font-size:12px;font-weight:700;color:#202124;text-transform:uppercase;' +
      '  letter-spacing:.5px;border-bottom:1px solid #e8eaed;padding-bottom:6px;margin-bottom:10px;}' +
      '.section-meta{font-size:11px;font-weight:400;color:#80868b;text-transform:none;letter-spacing:0;margin-left:6px;}' +
      '.meta{font-size:11px;color:#80868b;margin-bottom:10px;line-height:1.5;}' +

      // Heatmap
      '.heat-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;}' +
      '.heat-block{position:relative;width:36px;height:36px;border-radius:4px;display:flex;align-items:center;' +
      '  justify-content:center;cursor:default;transition:transform .1s;}' +
      '.heat-block:hover{transform:scale(1.15);}' +
      '.heat-num{font-size:10px;font-weight:700;color:rgba(255,255,255,.9);}' +
      '.heat-mark{position:absolute;top:-6px;right:-6px;width:14px;height:14px;border-radius:50%;' +
      '  background:#fff;border:1px solid #c5221f;color:#c5221f;font-size:8px;line-height:12px;' +
      '  text-align:center;font-weight:700;}' +
      '.heat-mark-leg{position:static;display:inline-block;}' +
      '.heat-mark-pointer{font-size:12px;color:#3c4043;background:#fef7f7;border:1px solid #f3c9c7;' +
      '  border-radius:5px;padding:7px 10px;margin:0 0 10px;line-height:1.5;}' +
      '.heat-mark-pointer .heat-mark{position:static;display:inline-block;vertical-align:middle;}' +

      // Data table
      '.data-table{width:100%;border-collapse:collapse;font-size:12px;}' +
      '.data-table th{padding:6px 8px;background:#f8f9fa;font-size:10px;font-weight:700;' +
      '  color:#5f6368;text-transform:uppercase;letter-spacing:.3px;border-bottom:2px solid #e8eaed;text-align:center;}' +
      '.data-table td{padding:6px 8px;border-bottom:1px solid #f1f3f4;text-align:center;color:#202124;}' +
      '.data-table td:first-child{text-align:left;}' +
      '.data-table td:nth-child(2){text-align:left;}' +
      '.row-flagged{background:#fff8f0;}' +
      '.row-nonprose{background:#f8f9fa;color:#9aa0a6;}' +
      '.row-nonprose td{color:#9aa0a6;}' +
      '.mean-row td{background:#f8f9fa;color:#3c4043;border-top:1px solid #dadce0;}' +
      '.mean-row td:first-child{border-left:3px solid transparent;}' +
      '.baseline-row td{background:#fffdf0;border-top:2px solid #C9A84C;font-weight:700;}' +
      '.baseline-row td:first-child{border-left:3px solid #C9A84C;}' +
      '.flag-pill{font-size:9px;font-weight:700;color:#fff;padding:2px 7px;border-radius:8px;letter-spacing:.3px;white-space:nowrap;}' +
      '.chunk-jump{color:#1a73e8;text-decoration:none;border-bottom:1px dashed #1a73e8;}' +
      '.chunk-jump:hover{color:#0b57d0;border-bottom-style:solid;}' +
      '.heat-block[onclick]:hover{outline:2px solid #1a73e8;outline-offset:1px;}' +

      // Style Change Function chart
      '.scf-chart{margin-top:6px;background:#fff;border:1px solid #e8eaed;border-radius:6px;padding:8px;}' +

      // Methodology block
      '.methodology-section{background:#f8f9fa;}' +
      '.methodology-section h2{color:#5f6368;}' +
      '.method-text{font-size:12px;color:#3c4043;line-height:1.65;margin-bottom:10px;}' +
      '.method-refs{margin-top:8px;}' +
      '.method-refs summary{font-size:11px;color:#1a73e8;cursor:pointer;font-weight:600;padding:4px 0;}' +
      '.method-refs summary:hover{color:#0b57d0;}' +
      '.ref-list{margin:8px 0 0 18px;font-size:11px;color:#5f6368;line-height:1.7;}' +
      '.ref-list li{margin-bottom:3px;}' +

      // Anchor offset for click-to-jump (compensate for sticky topbar)
      '.anchor-offset{display:block;position:relative;top:-60px;visibility:hidden;}' +

      // Baseline bars
      '.dim-row{display:flex;align-items:center;gap:8px;margin-bottom:9px;flex-wrap:wrap;position:relative;}' +
      '.dim-label-wrap{width:160px;flex-shrink:0;}' +
      '.dim-lbl{display:block;font-size:12px;color:#202124;font-weight:600;}' +
      '.dim-sub{display:block;font-size:10px;color:#9aa0a6;}' +
      '.dim-bar-wrap{flex:1;min-width:100px;height:8px;background:#e8eaed;border-radius:4px;overflow:visible;position:relative;}' +
      '.dim-bar{height:100%;border-radius:4px;}' +
      // Doc-mean marker: a stem across the bar plus a downward caret above.
      // The whole thing sits at top:0 of the bar wrap; the caret floats above,
      // the stem cuts through the bar so the value position is unambiguous.
      '.dim-doc-marker{position:absolute;top:-7px;width:0;height:0;' +
      '  border-left:5px solid transparent;border-right:5px solid transparent;' +
      '  border-top:6px solid #1a2235;transform:translateX(-5px);' +
      '  filter:drop-shadow(0 0 1.5px #fff);}' +
      // Stem: pseudo-element extends the marker down through the bar.
      '.dim-doc-marker::after{content:"";position:absolute;left:-1.5px;top:6px;' +
      '  width:3px;height:14px;background:#1a2235;' +
      '  box-shadow:0 0 0 1px #fff;border-radius:1px;}' +
      '.dim-val{width:40px;text-align:right;font-size:12px;font-weight:700;color:#5f6368;flex-shrink:0;}' +
      '.dim-doc-val{font-size:10px;color:#1a2235;font-weight:600;font-style:italic;margin-left:4px;}' +

      // Dimension summary
      '.dim-sum-row{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f1f3f4;align-items:flex-start;}' +
      '.dim-sum-row:last-child{border-bottom:none;}' +
      '.dim-sum-label{font-size:11px;font-weight:700;color:#4A6FA5;}' +
      '.dim-sum-text{font-size:12px;color:#3c4043;line-height:1.6;}' +

      // Flagged passages
      '.passage-card{border:1px solid #e8eaed;border-radius:6px;padding:12px 14px;margin-bottom:10px;background:#fafafa;}' +
      '.passage-hdr{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;}' +
      '.sev-badge{font-size:10px;font-weight:700;color:#fff;padding:2px 8px;border-radius:10px;flex-shrink:0;}' +
      '.chunk-label{font-size:11px;font-weight:700;color:#3c4043;background:#e8eaed;padding:2px 7px;border-radius:8px;}' +
      '.dir-badge{font-size:10px;font-weight:600;color:#5f6368;}' +
      '.dims-label{font-size:11px;color:#80868b;font-style:italic;}' +
      '.trigger-badges-row{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;}' +
      '.trigger-badge{font-size:9px;font-weight:600;padding:2px 7px;background:#fff;border:1px solid #dadce0;color:#5f6368;border-radius:8px;text-transform:uppercase;letter-spacing:.3px;}' +
      'blockquote{font-style:italic;color:#5f6368;border-left:3px solid #C9A84C;' +
      '  padding:5px 10px;margin:7px 0;font-size:12px;line-height:1.6;background:#fffdf0;}' +
      '.evidence-chips{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0;}' +
      '.chip{font-size:11px;font-weight:600;padding:2px 8px;background:#e8f0fe;color:#1a73e8;' +
      '  border-radius:10px;font-family:monospace;}' +
      '.finding-text{font-size:12px;color:#3c4043;line-height:1.6;margin-top:6px;}' +
      '.zone-card{border-color:#4A6FA5;border-width:2px;}' +
      '.zone-badge{font-size:9px;font-weight:700;background:#4A6FA5;color:#fff;' +
      '  padding:1px 5px;border-radius:6px;margin-left:4px;vertical-align:middle;}' +
      '.zone-chunk-hdr{font-size:11px;font-weight:700;color:#4A6FA5;margin:6px 0 4px;}' +
      '.zone-dev-note{font-weight:400;color:#80868b;font-style:italic;}' +
      'hr.zone-divider{border:none;border-top:1px dashed #e8eaed;margin:10px 0;}' +
      '.discussion-questions{margin-top:12px;background:#f0f4ff;border-radius:6px;' +
      '  padding:10px 14px;border-left:3px solid #4A6FA5;}' +
      '.dq-label{font-size:10px;font-weight:700;color:#4A6FA5;text-transform:uppercase;' +
      '  letter-spacing:.4px;margin-bottom:6px;}' +
      '.dq-list{padding-left:16px;margin:0;}' +
      '.dq-list li{font-size:12px;color:#202124;line-height:1.7;margin-bottom:4px;}' +
      '.dq-list li:last-child{margin-bottom:0;}' +

      // Contrast passages
      '.contrast-card{border:1px solid #e8eaed;border-radius:8px;overflow:hidden;margin-bottom:14px;}' +
      '.contrast-label{background:#f8f9fa;padding:8px 14px;font-size:11px;font-weight:700;color:#3c4043;border-bottom:1px solid #e8eaed;}' +
      '.contrast-dims{font-weight:400;color:#5f6368;}' +
      '.contrast-cols{display:flex;}' +
      '.contrast-col{flex:1;min-width:0;padding:14px;}' +
      '.contrast-col-flagged{border-right:1px solid #e8eaed;}' +
      '.contrast-col-hdr{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;}' +
      '.flagged-hdr{color:#c5221f;}' +
      '.baseline-hdr{color:#137333;}' +
      '.contrast-text{font-size:12px;line-height:1.8;color:#3c4043;margin:0;white-space:pre-wrap;word-wrap:break-word;}' +

      // Cross-sample
      '.cross-section{background:#f8f9fa;}' +
      // Dimension analysis blocks
      '.cs-dim-block{background:#fff;border:1px solid #e8eaed;border-radius:7px;padding:12px 14px;margin-bottom:10px;}' +
      '.cs-dim-block.cs-convergence{border-left:4px solid #137333;}' +
      '.cs-dim-block.cs-divergence{border-left:4px solid #c5221f;}' +
      '.cs-dim-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}' +
      '.cs-dim-label{font-size:12px;font-weight:700;color:#3c4043;flex:1;}' +
      '.cs-badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;text-transform:uppercase;letter-spacing:.3px;}' +
      '.cs-badge-conv{background:#e6f4ea;color:#137333;}' +
      '.cs-badge-div{background:#fce8e6;color:#c5221f;}' +
      '.cs-bar-wrap{flex:1;max-width:120px;height:6px;background:#e8eaed;border-radius:3px;overflow:hidden;}' +
      '.cs-bar{height:100%;border-radius:3px;}' +
      '.cs-score{font-size:12px;font-weight:700;min-width:28px;text-align:right;}' +
      '.cs-evidence-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;}' +
      '.cs-evid-hdr{font-size:10px;font-weight:700;color:#5f6368;text-transform:uppercase;letter-spacing:.3px;margin-bottom:5px;}' +
      '.cs-evid-chips{display:flex;flex-wrap:wrap;gap:4px;}' +
      '.cs-evid-chip{font-size:11px;padding:3px 8px;border-radius:4px;font-style:italic;line-height:1.4;}' +
      '.cs-evid-submitted{background:#e8f0fe;color:#1a56bb;border:1px solid #c5d8f8;}' +
      '.cs-evid-controlled{background:#fef3e2;color:#b06000;border:1px solid #f5d99a;}' +
      '.cs-analysis{font-size:12px;color:#3c4043;line-height:1.6;border-top:1px solid #f0f0f0;padding-top:8px;margin-top:4px;}' +
      '.cs-findings-section{background:#fff;border:1px solid #e8eaed;border-radius:7px;padding:12px 14px;margin-bottom:10px;}' +
      '.cs-findings-hdr{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid #e8eaed;}' +
      '.cs-findings-hdr-conv{color:#137333;}' +
      '.cs-findings-hdr-div{color:#c5221f;}' +
      '.cs-finding-item{padding:8px 0;border-bottom:1px solid #f0f0f0;}' +
      '.cs-finding-item:last-child{border-bottom:none;}' +
      '.cs-finding-feature{font-size:12px;font-weight:700;color:#202124;margin-bottom:6px;}' +
      '.cs-finding-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:5px;}' +
      '.cs-finding-sample{font-size:11px;line-height:1.5;color:#3c4043;}' +
      '.cs-finding-sample em{font-style:italic;color:#5f6368;}' +
      '.cs-sample-tag{font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;text-transform:uppercase;}' +
      '.cs-tag-sub{background:#e8f0fe;color:#1a56bb;}' +
      '.cs-tag-ctrl{background:#fef3e2;color:#b06000;}' +
      '.cs-timing-note{font-size:10px;font-weight:400;padding:1px 7px;border-radius:8px;margin-left:6px;background:#e8eaed;color:#5f6368;}' +
      '.cs-timing-unexplained{background:#fce8e6;color:#c5221f;}' +
      '.cs-finding-sig{font-size:11px;color:#5f6368;line-height:1.5;font-style:italic;margin-top:4px;}' +
      '.cs-assessment{margin-top:12px;background:#f0f4ff;border-left:4px solid #4A6FA5;' +
      '  border-radius:0 6px 6px 0;padding:12px 14px;}' +
      '.cs-assessment strong{font-size:11px;font-weight:700;color:#4A6FA5;text-transform:uppercase;' +
      '  letter-spacing:.4px;display:block;margin-bottom:5px;}' +
      '.cs-assessment p{font-size:12px;color:#202124;line-height:1.6;}' +

      // Misc
      '.section ul,.section ol{padding-left:18px;}' +
      '.section li{font-size:13px;line-height:1.7;margin-bottom:5px;}' +
      '.narrative-text{font-size:13px;line-height:1.7;color:#202124;}' +
      '.observation-pointer{font-size:12px;line-height:1.6;color:#3c4043;background:#f4f6f9;' +
      '  border:1px solid #d6deea;border-left:3px solid #4A6FA5;border-radius:0;' +
      '  padding:9px 12px;margin-top:10px;max-width:500px;}' +
      '.disclaimer{font-size:10px;color:#9aa0a6;line-height:1.6;padding:12px 16px;' +
      '  background:#f8f9fa;border-radius:6px;border:1px solid #e8eaed;margin-top:4px;}' +
      '.footer{text-align:center;font-size:10px;color:#9aa0a6;padding:18px 0 8px;}' +
      // Word range locator
      '.word-range-label{font-size:10px;font-weight:600;color:#80868b;background:#f1f3f4;' +
      '  padding:2px 7px;border-radius:8px;}' +
      // Dimension stats
      '.dim-sum-left{display:flex;flex-direction:column;gap:3px;width:160px;flex-shrink:0;}' +
      '.ds-stats{display:flex;flex-wrap:wrap;gap:4px;}' +
      '.ds-stat{font-size:10px;font-weight:600;padding:1px 6px;border-radius:8px;' +
      '  background:#f1f3f4;color:#3c4043;}' +
      '.ds-up{background:#e6f4ea;color:#137333;}' +
      '.ds-down{background:#fce8e6;color:#c5221f;}' +
      // Heatmap legend
      '.heat-legend{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:10px;align-items:center;}' +
      '.heat-leg-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#3c4043;font-weight:600;}' +
      '.heat-leg-swatch{width:14px;height:14px;border-radius:3px;flex-shrink:0;' +
      '  -webkit-print-color-adjust:exact;print-color-adjust:exact;}' +

      // Print
      '@media print{' +
      '  body{background:#fff;}' +
      '  .topbar{position:static;background:#4A6FA5 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '  .no-print{display:none !important;}' +
      '  .print-btn{display:none !important;}' +
      '  .pf-input{border:none;background:transparent;padding:0;}' +
      '  .heat-block{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '  .heat-leg-swatch{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '  .dim-bar,.cs-bar,.band-mark,.sev-badge,.flag-pill,.chip{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '  .section,.verdict-bar,.print-fields{box-shadow:none;border:1px solid #e8eaed;}' +
      '}';

    return '<!DOCTYPE html><html lang="en"><head>' +
      '<meta charset="UTF-8">' +
      '<title>PaperTrail Verify — Consistency Report</title>' +
      '<style>' + css + '</style>' +
      '</head><body>' +

      '<div class="topbar">' +
      '  <div>' +
      '    <h1>PaperTrail\u2122 <em>Verify</em> — Consistency Report</h1>' +
      '    <div class="topbar-sub">Report ID: ' + esc(r.reportId || '—') + ' &nbsp;·&nbsp; Generated ' + esc(now) + '</div>' +
      '  </div>' +
      '  <div style="display:flex;align-items:center;flex-shrink:0;">' +
      '    <button class="save-btn no-print" id="verify-save-btn">⬇ Save HTML</button>' +
      '    <button class="print-btn no-print" id="verify-print-btn">🖨 Print / Save PDF</button>' +
      '  </div>' +
      '</div>' +

      '<div class="container">' +

      // Verdict bar
      '<div class="verdict-bar">' +
      '  <div class="band-mark" style="background:' + bandBg + ';color:' + bandColor + ';border-color:' + bandColor + ';">' + bandGlyph + '</div>' +
      '  <div class="verdict-text">' +
      '    <h2 style="color:' + bandColor + ';">' + esc(derivedBand) + '</h2>' +
      '    <p>' + esc(r.narrative || '') + '</p>' +
      (observationPointer
        ? '    <div class="observation-pointer">' + observationPointer + '</div>'
        : '') +
      '    <span class="mode-badge">' + (comparative ? 'Comparative' : 'Single Sample') + '</span>' +
      '  </div>' +
      '</div>' +

      printFieldsHTML +
      scopeHTML +
      scfHTML +
      heatmapHTML +
      tableHTML +
      meansHTML +
      dimSumHTML +
      baselineHTML +
      passagesHTML +
      contrastPassagesHTML +
            actionsHTML +
      methodologyHTML +

      '<div class="disclaimer">' + esc(r.disclaimer || 'This report presents quantitative and AI-assisted stylometric analysis for educator reference only. It does not constitute evidence of academic misconduct and must not be used as the sole basis for any disciplinary action. All findings require professional educator judgment. PaperTrail Academic provides evidence — conclusions are always the responsibility of the reviewing educator.') + '</div>' +
      '<div class="footer">PaperTrail Verify v3.2.0 &middot; papertrailacademic.com &middot; ' + esc(now) + '</div>' +
      '</div></body></html>';
  }

  // ─── Expose on window so content.js can call these renderers ─────────────────
  window.__wpaReports = {
    smBuildComparativeReportHTML: smBuildComparativeReportHTML,
    smBuildProcessReportHTML:     smBuildProcessReportHTML,
    smBuildVerifyReportHTML:      smBuildVerifyReportHTML
  };

})();