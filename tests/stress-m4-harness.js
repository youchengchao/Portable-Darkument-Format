/**
 * Empirical Stress Test Harness for Feature R4: Text-to-Speech (TTS) Narration & Highlighting
 * Author: Challenger M4-1 (teamwork_preview_challenger)
 *
 * Executes empirical stress vectors:
 * 1. Rapid play/pause/stop toggling under high frequency iterations.
 * 2. Rate speed changes (0.75x to 2.0x) during active playback and pause states.
 * 3. Prev/Next sentence navigation out of bounds (at start/end of document).
 * 4. Empty pages / pages without text spans / whitespace-only pages.
 * 5. Long continuous text documents (1,000+ spans, 500+ sentences).
 * 6. Sentence boundary extraction edge cases & DOM highlighting tracking.
 */

const assert = require('assert');
const { setupGlobalChromeMock } = require('./mocks/chrome-api-mock');

// 1. Setup Mock Chrome & SpeechSynthesis Environment
const chromeMock = setupGlobalChromeMock();
const viewer = require('../viewer.js');
const { TTSController } = viewer;

// Helper to create mock DOM structure for text layer spans
function createMockDOMContainer(spansTextArray = []) {
  const spans = [];

  spansTextArray.forEach((text, idx) => {
    const classListSet = new Set();
    const span = {
      id: `span-${idx}`,
      textContent: text,
      classList: {
        add: (cls) => classListSet.add(cls),
        remove: (cls) => classListSet.delete(cls),
        contains: (cls) => classListSet.has(cls),
        has: (cls) => classListSet.has(cls)
      },
      scrollIntoView: () => { span._scrolledIntoView = true; },
      _scrolledIntoView: false,
      _hasClass: (cls) => classListSet.has(cls)
    };
    spans.push(span);
  });

  const container = {
    querySelectorAll: (selector) => {
      if (selector === '.textLayer span') return spans;
      if (selector === '.tts-sentence-highlight') return spans.filter(s => s._hasClass('tts-sentence-highlight'));
      return [];
    }
  };

  return { container, spans };
}

// Mock full document environment for UI controls
function setupMockDocumentUI() {
  const elements = new Map();

  function createEl(id, tagName = 'DIV') {
    const classSet = new Set();
    const listeners = {};
    const el = {
      id,
      tagName: tagName.toUpperCase(),
      value: '',
      textContent: '',
      innerHTML: '',
      classList: {
        add: (c) => classSet.add(c),
        remove: (c) => classSet.delete(c),
        contains: (c) => classSet.has(c)
      },
      appendChild: (child) => {},
      addEventListener: (evt, fn) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(fn);
      },
      click: () => {
        if (typeof el.onclick === 'function') el.onclick();
        if (listeners['click']) listeners['click'].forEach(fn => fn());
      }
    };
    elements.set(id, el);
    return el;
  }

  const ids = [
    'btn-toggle-tts', 'tts-panel', 'tts-btn-play', 'tts-btn-stop',
    'tts-btn-prev', 'tts-btn-next', 'tts-select-speed', 'tts-select-voice',
    'tts-progress'
  ];

  ids.forEach(id => createEl(id));
  elements.get('tts-panel').classList.add('hidden');

  const mockDoc = {
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: (selector) => {
      if (selector === '.tts-sentence-highlight') return [];
      return [];
    },
    createElement: (tag) => ({ value: '', textContent: '' })
  };

  global.document = mockDoc;
  return elements;
}

// Main Test Execution
async function runTTSStressTests() {
  console.log('=================================================================');
  console.log('      FEATURE R4 TTS NARRATION & HIGHLIGHTING STRESS HARNESS     ');
  console.log('=================================================================\n');

  let passed = 0;
  let total = 0;
  const findings = [];

  function recordResult(testName, success, detail = '') {
    total++;
    if (success) {
      passed++;
      console.log(`  [PASS] Test ${total}: ${testName}`);
    } else {
      console.log(`  [WARN/FINDING] Test ${total}: ${testName} - ${detail}`);
    }
  }

  // -------------------------------------------------------------------------
  // Vector 1: Rapid Play / Pause / Stop Toggling Invariant Check
  // -------------------------------------------------------------------------
  try {
    const ui = setupMockDocumentUI();
    const controller = new TTSController();
    controller.init();
    controller.loadSentencesFromText("Sentence one. Sentence two. Sentence three.");

    let stateConsistent = true;
    for (let i = 0; i < 200; i++) {
      const action = i % 4;
      if (action === 0) controller.play();
      else if (action === 1) controller.pause();
      else if (action === 2) controller.resume();
      else if (action === 3) controller.stop();

      if (controller.isPlaying && controller.isPaused) {
        stateConsistent = false;
        break;
      }
    }
    recordResult("Rapid Play/Pause/Resume/Stop state consistency (200 ops)", stateConsistent, "Internal state became inconsistent");
  } catch (e) {
    recordResult("Rapid Play/Pause/Resume/Stop state consistency (200 ops)", false, e.message);
  }

  // -------------------------------------------------------------------------
  // Vector 1.1: Rapid UI Panel Toggle during active playback
  // -------------------------------------------------------------------------
  try {
    const ui = setupMockDocumentUI();
    const controller = new TTSController();
    controller.init();
    controller.loadSentencesFromText("Testing panel toggle during playback.");
    
    // First toggle opens panel
    controller.togglePanel();
    assert.strictEqual(controller.isPanelOpen, true, 'panel opened');
    controller.play();
    assert.strictEqual(controller.isPlaying, true, 'playing before panel toggle');

    // Second toggle closes panel -> should stop playback
    controller.togglePanel();
    const panelClosedStopOk = (controller.isPlaying === false && controller.isPaused === false);
    recordResult("Closing TTS panel stops active playback and resets state", panelClosedStopOk, "Playback was not stopped when panel was closed");
  } catch (e) {
    recordResult("Closing TTS panel stops active playback and resets state", false, e.message);
  }

  // -------------------------------------------------------------------------
  // Vector 2: Rate Speed Changes (0.75x to 2.0x) during Active Playback
  // -------------------------------------------------------------------------
  try {
    const ui = setupMockDocumentUI();
    const controller = new TTSController();
    controller.loadSentencesFromText("Speed rate test sentence number one. Speed rate test sentence number two.");
    controller.play();

    const speeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    let rateOk = true;

    for (const spd of speeds) {
      controller.setRate(spd);
      if (controller.rate !== spd || (controller.utterance && controller.utterance.rate !== spd)) {
        rateOk = false;
        break;
      }
    }
    recordResult("Rate speed changes during active playback (0.75x to 2.0x)", rateOk, "Speech rate was not applied to active utterance");
  } catch (e) {
    recordResult("Rate speed changes during active playback (0.75x to 2.0x)", false, e.message);
  }

  // -------------------------------------------------------------------------
  // Vector 2.1: Empirical Finding - Rate Speed Change while Paused
  // -------------------------------------------------------------------------
  try {
    const ui = setupMockDocumentUI();
    const controller = new TTSController();
    controller.loadSentencesFromText("Testing rate change while paused.");
    controller.play();
    controller.pause();

    const originalRate = controller.utterance ? controller.utterance.rate : 1.0;
    controller.setRate(2.0);
    controller.resume();

    const resumedRate = controller.utterance ? controller.utterance.rate : null;
    const isRateUpdatedOnResume = (resumedRate === 2.0);

    if (!isRateUpdatedOnResume) {
      findings.push({
        id: "FINDING-1",
        title: "Speech speed rate change while paused does not apply upon resume",
        severity: "MEDIUM",
        description: `When setRate(2.0) is called while paused, controller updates this.rate to 2.0 but does not re-create the Utterance. synth.resume() resumes the old utterance with rate=${originalRate}. The new speed is ignored until sentence navigation.`
      });
    }
    recordResult("Rate speed change while paused applies to resumed speech", isRateUpdatedOnResume, `Resumed utterance retained rate ${originalRate} instead of 2.0`);
  } catch (e) {
    recordResult("Rate speed change while paused applies to resumed speech", false, e.message);
  }

  // -------------------------------------------------------------------------
  // Vector 3: Prev/Next Sentence Navigation Out of Bounds
  // -------------------------------------------------------------------------
  try {
    const ui = setupMockDocumentUI();
    const controller = new TTSController();
    controller.loadSentencesFromText("Sentence A. Sentence B. Sentence C.");

    // Call prev at start (index 0) 10 times
    for (let i = 0; i < 10; i++) {
      controller.prev();
    }
    const prevOk = (controller.currentIndex === 0);
    recordResult("Prev sentence navigation at start of document (bounds check)", prevOk, `Index became ${controller.currentIndex} instead of 0`);

    // Call next past end of document
    controller.play(); // index 0
    controller.next(); // index 1
    controller.next(); // index 2 (last)

    assert.strictEqual(controller.currentIndex, 2, 'reached last sentence');

    // Next from last sentence triggers stop()
    controller.next();
    const stopOnEndOk = (controller.isPlaying === false && controller.currentIndex === 0);
    recordResult("Next sentence navigation at end of document triggers stop()", stopOnEndOk, `isPlaying: ${controller.isPlaying}, index: ${controller.currentIndex}`);

    // Check behavior when clicking next after reaching document end
    controller.next();
    const extraNextIndex = controller.currentIndex;
    if (extraNextIndex === 1) {
      findings.push({
        id: "FINDING-2",
        title: "Next sentence navigation after document completion skips sentence 0",
        severity: "LOW",
        description: `Reaching document end resets index to 0 via stop(). A subsequent next() call advances index from 0 to 1 (skipping sentence 0).`
      });
    }
  } catch (e) {
    recordResult("Prev/Next sentence navigation out of bounds", false, e.message);
  }

  // -------------------------------------------------------------------------
  // Vector 4: Empty Pages / Pages without Text Spans / Whitespace-only
  // -------------------------------------------------------------------------
  try {
    const ui = setupMockDocumentUI();
    const controller = new TTSController();

    const { container: emptyContainer } = createMockDOMContainer([]);
    controller.loadSentencesFromDOM(emptyContainer);

    const emptyLoadOk = (controller.sentences.length === 0 && controller.currentIndex === 0);
    recordResult("Load sentences from empty DOM container", emptyLoadOk, `Extracted ${controller.sentences.length} sentences`);

    let emptyOpsSafe = true;
    try {
      controller.play();
      controller.pause();
      controller.resume();
      controller.prev();
      controller.next();
      controller.stop();
    } catch (err) {
      emptyOpsSafe = false;
    }
    recordResult("Playback controls safety on empty document", emptyOpsSafe, "Operation threw exception on empty document");

    const { container: wsContainer } = createMockDOMContainer(["   \n\t  ", "   ", " \n "]);
    const wsSentences = controller.loadSentencesFromDOM(wsContainer);
    const wsOk = (wsSentences.length === 0);
    recordResult("Sentence extraction on whitespace-only spans ignores empty nodes", wsOk, `Extracted ${wsSentences.length} sentences from whitespace spans`);
  } catch (e) {
    recordResult("Empty pages / whitespace-only handling", false, e.message);
  }

  // -------------------------------------------------------------------------
  // Vector 5: Long Continuous Text Documents
  // -------------------------------------------------------------------------
  try {
    const ui = setupMockDocumentUI();
    const controller = new TTSController();

    const spansText = [];
    for (let i = 0; i < 500; i++) {
      spansText.push(`This is sentence number ${i + 1} part one, `);
      spansText.push(`and this is sentence number ${i + 1} part two.`);
    }

    const { container: longContainer } = createMockDOMContainer(spansText);
    const startTime = Date.now();
    const sentences = controller.loadSentencesFromDOM(longContainer);
    const durationMs = Date.now() - startTime;

    const countOk = (sentences.length === 500);
    const perfOk = (durationMs < 1000);
    recordResult(`Large document sentence extraction (1,000 spans -> 500 sentences in ${durationMs}ms)`, countOk && perfOk, `Expected 500 sentences, got ${sentences.length} in ${durationMs}ms`);

    controller.play();
    let steps = 0;
    const synth = controller.getSynth();

    while (controller.isPlaying && steps < 600) {
      steps++;
      synth.finishCurrentUtterance();
    }

    const fullWalkOk = (steps === 500 && controller.isPlaying === false && controller.currentIndex === 0);
    recordResult("Continuous narration walk across 500 sentences auto-advances to completion", fullWalkOk, `Walk completed in ${steps} steps, isPlaying: ${controller.isPlaying}, index: ${controller.currentIndex}`);
  } catch (e) {
    recordResult("Long continuous text document stress test", false, e.message);
  }

  // -------------------------------------------------------------------------
  // Vector 6: Highlight Class Clean Up and DOM Synchronization
  // -------------------------------------------------------------------------
  try {
    const ui = setupMockDocumentUI();
    const controller = new TTSController();
    const { container, spans } = createMockDOMContainer([
      "First sentence here. ",
      "Second sentence here. ",
      "Third sentence here."
    ]);

    global.document.querySelectorAll = container.querySelectorAll;

    controller.loadSentencesFromDOM(container);
    controller.play();

    assert.strictEqual(spans[0]._hasClass('tts-sentence-highlight'), true, 'span 0 highlighted');
    assert.strictEqual(spans[1]._hasClass('tts-sentence-highlight'), false, 'span 1 not highlighted');

    controller.next();
    assert.strictEqual(spans[0]._hasClass('tts-sentence-highlight'), false, 'span 0 unhighlighted');
    assert.strictEqual(spans[1]._hasClass('tts-sentence-highlight'), true, 'span 1 highlighted');

    controller.stop();
    const allClean = spans.every(s => !s._hasClass('tts-sentence-highlight'));
    recordResult("Highlight class tracking and cleanup on stop()", allClean, "Highlight class remained on span after stop()");
  } catch (e) {
    recordResult("Highlight class clean up and DOM synchronization", false, e.message);
  }

  // -------------------------------------------------------------------------
  // Vector 7: Empirical Finding - Text Span Merging Edge Case
  // -------------------------------------------------------------------------
  try {
    const { container } = createMockDOMContainer([
      "Heading Without Period",
      "First paragraph starting sentence."
    ]);
    const controller = new TTSController();
    const sents = controller.extractSentencesFromDOM(container);

    const textCombined = sents.length > 0 ? sents[0].text : '';
    const hasSpaceBetween = textCombined.includes("Period First") || textCombined.includes("Period ") || sents.length === 2;

    if (!hasSpaceBetween && textCombined.includes("PeriodFirst")) {
      findings.push({
        id: "FINDING-3",
        title: "Multi-span sentence extraction missing whitespace separator between unpunctuated spans",
        severity: "MEDIUM",
        description: `When extracting sentences across adjacent spans where the preceding span has no trailing whitespace/punctuation (e.g. "Heading Without Period" + "First paragraph"), extractSentencesFromDOM concatenates text as "${textCombined}" without inserting a space.`
      });
    }

    recordResult("Span text concatenation retains readable sentence boundaries", hasSpaceBetween, `Text merged as "${textCombined}"`);
  } catch (e) {
    recordResult("Span text concatenation space boundary check", false, e.message);
  }

  console.log('\n=================================================================');
  console.log('                     STRESS SUITE SUMMARY                        ');
  console.log('=================================================================');
  console.log(`  Total Stress Tests Executed : ${total}`);
  console.log(`  Passed                     : ${passed}`);
  console.log(`  Identified Anomaly Findings: ${findings.length}`);
  console.log('=================================================================\n');

  if (findings.length > 0) {
    console.log('--- DETECTED ANOMALIES & FINDINGS SUMMARY ---');
    findings.forEach((f) => {
      console.log(`[${f.id}] [${f.severity}] ${f.title}`);
      console.log(`  ${f.description}\n`);
    });
  }

  return { total, passed, findings };
}

if (require.main === module) {
  runTTSStressTests().catch(console.error);
}

module.exports = { runTTSStressTests };
