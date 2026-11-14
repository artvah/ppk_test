// ==========================================================
//  TestMaster3000 — Static Web Player (no file upload)
//  Test data is loaded from test_data.js as window.TEST_DATA
// ==========================================================

// --- State ---
let testData = null;
let questions = [];
let currentIndex = 0;
let userAnswers = {};          // questionIndex -> submittedAnswerId
let selectedAnswerId = null;
let testOrder = [];            // indexes of questions in current session
let answerShuffleMap = {};     // questionIndex -> [shuffled answer indexes]
const orderModes = ['random', 'sequential', 'campaign'];
let orderMode = 'random';
let retryingErrors = false;
let studyRun = null;
let attemptId = null;
let lastAttempt = null;
let health = 0;
let correctStreak = 0;
let bestStreak = 0;
const streakMilestones = [3, 5, 10];
let difficulty = 'peaceful';
let runDifficulty = difficulty;
let failureTimer = null;
const difficultyLimits = { easy: 90, normal: 70, hard: 50 };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// --- DOM refs ---
const welcomeScreen = document.getElementById('welcome-screen');
const testScreen = document.getElementById('test-screen');
const resultScreen = document.getElementById('result-screen');

const testTitleDisplay = document.getElementById('test-title-display');
const metaCount = document.getElementById('meta-count');
const btnStart = document.getElementById('btn-start');
const btnResume = document.getElementById('btn-resume');
const btnQuestionOrder = document.getElementById('btn-question-order');
const difficultyMenu = document.getElementById('difficulty-menu');
const difficultyLabel = document.getElementById('difficulty-label');
const difficultyOptions = difficultyMenu.querySelectorAll('[data-difficulty]');
const difficultyNames = Object.fromEntries(Array.from(difficultyOptions, option => [option.dataset.difficulty, option.textContent]));
const difficultyHint = document.getElementById('difficulty-hint');
const failureNotice = document.getElementById('run-failure');
const failureTitle = document.getElementById('failure-title');
const btnSound = document.getElementById('btn-sound');
const btnRetroFont = document.getElementById('btn-retro-font');

const progressText = document.getElementById('progress-text');
const healthBar = document.getElementById('health-bar');
const healthText = document.getElementById('health-text');
const hardcoreIndicator = document.getElementById('hardcore-indicator');
const progressBarFill = document.getElementById('progress-bar-fill');
const questionText = document.getElementById('question-text');
const questionImages = document.getElementById('question-images');
const answerReaction = document.getElementById('answer-reaction');
const answersContainer = document.getElementById('answers-container');

const btnPrev = document.getElementById('btn-prev');
const btnSubmit = document.getElementById('btn-submit');
const submitLabel = document.getElementById('submit-label');
const submitIcon = btnSubmit.querySelector('use');
const btnNext = document.getElementById('btn-next');
const btnMenu = document.getElementById('btn-menu');
const btnSettings = document.getElementById('btn-settings');
const btnAchievements = document.getElementById('btn-achievements');
const achievementDialog = document.getElementById('achievement-dialog');
const btnStudy = document.getElementById('btn-study');
const studyDialog = document.getElementById('study-dialog');
const btnStudyReview = document.getElementById('btn-study-review');
const btnStudyReviewAll = document.getElementById('btn-study-review-all');
const btnStudyDaily = document.getElementById('btn-study-daily');
const studyQueue = document.getElementById('study-queue');
const studyQueueList = document.getElementById('study-queue-list');
const btnResultReview = document.getElementById('btn-result-review');
const btnBookmark = document.getElementById('btn-bookmark');
const bookmarkQueue = document.getElementById('study-bookmarks');
const bookmarkList = document.getElementById('study-bookmark-list');
const btnStudyBookmarks = document.getElementById('btn-study-bookmarks');

const scorePercentage = document.getElementById('score-percentage');
const scoreDetails = document.getElementById('score-details');
const gradeText = document.getElementById('grade-text');
const scoreMeter = document.getElementById('score-meter');
const scoreMeterFill = document.getElementById('score-meter-fill');
const scoreAchievements = document.getElementById('score-achievements');
const scoreStreak = document.getElementById('score-streak');
const scoreFlawless = document.getElementById('score-flawless');
const errorsSection = document.getElementById('errors-section');
const errorsTableBody = document.querySelector('#errors-table tbody');
const btnRetryErrors = document.getElementById('btn-retry-errors');
const btnRestart = document.getElementById('btn-restart');

const achievementStorageKey = 'ppk-test-achievements-v1';
const sessionStorageKey = 'ppk-test-attempt-v1';
const menuStorageKey = 'ppk-test-menu-v1';
const studyStorageKey = 'ppk-test-study-v1';
const soundStorageKey = 'ppk-test-sound-v1';
const retroFontStorageKey = 'ppk-test-retro-font';
const rangeStorageKey = 'ppk-test-range';
const copyableText = '#test-screen .question-text, #test-screen .answer-text-label, #errors-table tbody td, .study-queue-question';
let questionBankVersion;

let soundEnabled = true;
let audioContext;
try { soundEnabled = localStorage.getItem(soundStorageKey) !== 'off'; } catch { /* Optional setting. */ }

function updateSoundButton() {
    btnSound.setAttribute('aria-pressed', String(soundEnabled));
    btnSound.title = soundEnabled ? 'Звуки включены' : 'Звуки выключены';
    btnSound.querySelector('[data-sound-on]').toggleAttribute('hidden', !soundEnabled);
    btnSound.querySelector('[data-sound-off]').toggleAttribute('hidden', soundEnabled);
}

function playSound(kind) {
    if (!soundEnabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
        audioContext ??= new Audio();
        const sound = {
            confirm: [392, 523], correct: [523, 659, 784], streak: [523, 659, 784, 1047],
            wrong: [220, 165], failure: [196, 147, 98], tap: [740], badge: [620, 830], trophy: [587, 784, 1047],
        }[kind];
        const tap = kind === 'tap';
        const badge = kind === 'badge' || kind === 'trophy';
        const notes = () => sound.forEach((frequency, index) => {
            const note = audioContext.createOscillator();
            const envelope = audioContext.createGain();
            const start = audioContext.currentTime + index * 0.055;
            note.type = 'triangle';
            note.frequency.value = frequency;
            if (tap) note.frequency.exponentialRampToValueAtTime(380, start + 0.027);
            envelope.gain.setValueAtTime(0.001, start);
            envelope.gain.exponentialRampToValueAtTime(tap ? 0.021 : badge ? 0.034 : 0.07, start + (tap ? 0.004 : 0.012));
            envelope.gain.exponentialRampToValueAtTime(0.001, start + (tap ? 0.032 : 0.12));
            note.connect(envelope).connect(audioContext.destination);
            note.start(start);
            note.stop(start + (tap ? 0.036 : 0.13));
        });
        if (audioContext.state === 'running') notes();
        else audioContext.resume().then(() => { if (soundEnabled) notes(); }).catch(() => {});
    } catch {
        // Keep the controls usable if the device has no audio output.
    }
}

if (!window.AudioContext && !window.webkitAudioContext) btnSound.hidden = true;
updateSoundButton();
btnSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    updateSoundButton();
    try { localStorage.setItem(soundStorageKey, soundEnabled ? 'on' : 'off'); } catch { /* Optional setting. */ }
    playSound('tap');
});

function setRetroFont(enabled) {
    document.body.toggleAttribute('data-retro-font', enabled);
    btnRetroFont.setAttribute('aria-pressed', String(enabled));
    btnRetroFont.title = enabled ? 'Вернуть обычный шрифт' : 'Включить ретро-шрифт';
    fitWelcomeScreen();
}

try { setRetroFont(localStorage.getItem(retroFontStorageKey) === 'on'); } catch { /* Optional setting. */ }
btnRetroFont.addEventListener('click', () => {
    const enabled = !document.body.hasAttribute('data-retro-font');
    setRetroFont(enabled);
    try { localStorage.setItem(retroFontStorageKey, enabled ? 'on' : 'off'); } catch { /* Optional setting. */ }
});

document.addEventListener('click', event => {
    const control = event.target.closest?.('button, summary, .answer-card');
    if (!control || control === btnSound || control.disabled || control.classList.contains('disabled')) return;
    if (!control.classList.contains('achievement-card')) playSound('tap');
}, true);

document.addEventListener('copy', event => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    for (let i = 0; i < selection.rangeCount; i++) {
        const ancestor = selection.getRangeAt(i).commonAncestorContainer;
        const element = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentElement;
        if (!element?.closest(copyableText) || element.closest('.error-answer-label')) {
            event.preventDefault();
            return;
        }
    }
});

function saveAttempt(screen = 'test', failed = false) {
    try {
        lastAttempt = JSON.stringify({
            bank: questionBankVersion, screen, failed, orderMode, difficulty, runDifficulty, activeRange,
            testOrder, currentIndex, answerShuffleMap, userAnswers, selectedAnswerId,
            health, correctStreak, bestStreak, retryingErrors, studyRun, attemptId, unlocks: runUnlocks.map(item => item.id),
        });
        localStorage.setItem(sessionStorageKey, lastAttempt);
    } catch {
        // The test still works when browser storage is unavailable.
    }
}

function readSavedAttempt() {
    try {
        return JSON.parse(lastAttempt ?? localStorage.getItem(sessionStorageKey));
    } catch { return null; }
}

function removeSavedKeys(keys) {
    for (const key of keys) {
        try { localStorage.removeItem(key); } catch { /* Keep the reset for the current session. */ }
    }
}

function restoreAttempt() {
    const saved = readSavedAttempt();
    if (!saved || saved.bank !== questionBankVersion || !orderModes.includes(saved.orderMode) ||
        !Array.from(difficultyOptions).some(option => option.dataset.difficulty === saved.runDifficulty)) return;

    const range = saved.activeRange;
    const total = testData.questions.length;
    if (range !== null && (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) ||
        !Number.isInteger(range.size) || range.size < 1 || range.start < 0 || range.start >= range.end || range.end > total)) return;
    const restoredQuestions = range ? testData.questions.slice(range.start, range.end) : testData.questions;
    if (!Array.isArray(saved.testOrder) || !Number.isInteger(saved.currentIndex) ||
        saved.currentIndex < 0 || saved.currentIndex >= saved.testOrder.length ||
        !saved.userAnswers || !saved.answerShuffleMap || !saved.testOrder.every(index => {
            const question = restoredQuestions[index];
            const order = saved.answerShuffleMap[index];
            return question && Array.isArray(order) && order.length === question.answers.length &&
                order.every(answer => Number.isInteger(answer) && question.answers[answer]);
        })) return;

    orderMode = saved.orderMode;
    difficulty = Array.from(difficultyOptions).some(option => option.dataset.difficulty === saved.difficulty)
        ? saved.difficulty : saved.runDifficulty;
    runDifficulty = saved.runDifficulty;
    updateOrderLabel();
    updateDifficultyMenu();
    activeRange = range;
    questions = restoredQuestions;
    testOrder = saved.testOrder;
    currentIndex = saved.currentIndex;
    answerShuffleMap = saved.answerShuffleMap;
    userAnswers = saved.userAnswers;
    health = saved.health;
    correctStreak = saved.correctStreak;
    bestStreak = saved.bestStreak;
    retryingErrors = saved.retryingErrors;
    studyRun = ['review', 'daily', 'bookmarks'].includes(saved.studyRun?.kind) ? saved.studyRun : null;
    attemptId = typeof saved.attemptId === 'string' ? saved.attemptId : null;
    runUnlocks = Array.isArray(saved.unlocks) ? saved.unlocks
        .filter(id => unlockedAchievements.has(id))
        .map(id => achievementCatalog.find(item => item.id === id)).filter(Boolean) : [];
    if (saved.screen === 'result' || saved.failed) {
        finishTest(Boolean(saved.failed), saved.screen === 'result');
        return;
    }
    updateHealth();
    showScreen(testScreen);
    renderQuestion(saved.selectedAnswerId);
}

const achievementCatalog = [
    ...Array.from(difficultyOptions).flatMap(option =>
        [50, 100, 300].map(count => ({
            id: `${option.dataset.difficulty}-${count}`,
            title: `${option.textContent} · ${count}`,
            tone: option.dataset.difficulty,
            legendary: count === 300 && option.dataset.difficulty === 'hardcore',
            description: `Завершить попытку от ${count} вопросов на этой сложности.`,
            earned: run => run.completed && run.difficulty === option.dataset.difficulty && run.total >= count,
        }))
    ),
    ...[5, 10, 25, 50, 100, 200, 300].map(count => ({
        id: `streak-${count}`,
        title: `Серия ×${count}`,
        icon: 'streak',
        live: true,
        tone: count >= 100 ? 'hard' : count >= 25 ? 'normal' : 'easy',
        description: `Дать ${count} правильных ответов подряд.`,
        earned: run => run.streak >= count,
    })),
    { id: 'flawless', icon: 'flawless', title: 'Чистое прохождение', description: 'Завершить попытку без ошибок.',
        earned: run => run.completed && run.flawless },
    { id: 'last-hp', icon: 'last-hp', title: 'На одном HP', description: 'Дойти до результата с одним очком здоровья.',
        earned: run => run.completed && run.health === 1 },
    { id: 'comeback', icon: 'comeback', title: 'Собрался', description: 'После ошибки закончить попытку серией из 10 или больше верных ответов.',
        earned: run => run.completed && !run.flawless && run.finalStreak >= 10 },
    { id: 'study-review-10', icon: 'comeback', tone: 'normal', title: 'Ремонтная мастерская',
        description: 'Исправить 10 разных ошибок через журнал подготовки.',
        study: true, earned: run => run.fixed >= 10 },
    { id: 'study-daily-perfect', icon: 'flawless', tone: 'hard', title: 'День без помарок',
        description: 'Закончить задание дня без ошибок.',
        study: true, earned: run => run.dailyPerfect },
    { id: 'study-daily-week', icon: 'streak', tone: 'normal', title: 'Неделя в строю',
        description: 'Выполнить задание дня семь дней подряд.',
        study: true, earned: run => run.dailyStreak >= 7 },
    { id: 'study-secret', icon: 'standard', tone: 'normal', title: 'Сервисный режим',
        description: 'Найти спрятанный переключатель в окне TestMaster.', earned: () => false },
    ...Array.from(difficultyOptions, option => ({
        id: `campaign-${option.dataset.difficulty}`,
        icon: `campaign-${option.dataset.difficulty}`,
        title: `Кампания · ${option.textContent}`,
        description: 'Открыть все вопросы на этой сложности в режиме прохождения.',
        campaign: true,
        tone: option.dataset.difficulty,
        earned: run => run.campaignCompleted && run.difficulty === option.dataset.difficulty,
    })),
];

const achievementIcons = {
    'last-hp': '<path d="M1 4h14v2h1v4h-1v2H1zm1 1v6h12V5z" fill-rule="evenodd"/><path d="M3 6h2v4H3zm6 0h3v1h-1v1h1v1h-2v1H8V8h1z"/>',
    flawless: '<path d="M7 1h2v2h1v2h5v2h-2v2h-2v5H9v-1H7v1H5V9H3V7H1V5h5V3h1zm0 6H6v1h1v1h2V8h1V6H9v1H8v1H7z" fill-rule="evenodd"/>',
    comeback: '<path d="M1 3h14v10H1zm1 1v8h12V4z" fill-rule="evenodd"/><path d="M3 8h2V6h1v2h1v2h1V7h1V5h1v3h3v1h-4v2H7V9H6V8H5v1H3z"/>',
    streak: '<path d="M9 1h3v2h-1v2h-1v1h3v2h-2v2H9v2H7v3H4v-2h1v-2h1V9H3V7h2V5h2V3h2z"/><path d="M1 3h4v1H1zm11 9h3v1h-3zm-2 2h3v1h-3z"/>',
    campaign: '<path d="M3 1h2v1h9v2h-1v2h1v2H5v5h3v2H1v-2h2zm3 2v1h2V3zm2 1v2h2V4zm2 2v1h2V6z" fill-rule="evenodd"/>',
    standard: '<path d="M2 1h10v1h2v13H2zm2 1v4h8V3h-1v2h-1V2zm0 7v5h8V9z" fill-rule="evenodd"/><path d="M5 10h5v1H5zm0 2h4v1H5z"/>',
    secret: '<path d="M1 2h14v10H1zm1 1v7h12V3z" fill-rule="evenodd"/><path d="M5 5h1v1H5zm5 0h1v1h-1zM6 7h1v1h2V7h1v2H6zm1 5h2v2h3v1H4v-1h3z"/>',
};

function loadAchievements() {
    try {
        const stored = JSON.parse(localStorage.getItem(achievementStorageKey));
        if (Array.isArray(stored)) return new Set(stored.filter(id => achievementCatalog.some(item => item.id === id)));
    } catch {
        // Storage may be disabled. Achievements still work for this session.
    }
    return new Set();
}

const unlockedAchievements = loadAchievements();
const quizPet = createQuizPet('ppk-test-pet-v1', unlockedAchievements, achievementCatalog, playSound);
let runUnlocks = [];

function loadStudyData() {
    try {
        const data = JSON.parse(localStorage.getItem(studyStorageKey));
        if (data && Array.isArray(data.mistakes) && Array.isArray(data.fixed) && Array.isArray(data.history) && Array.isArray(data.daily)) {
            if (!data.records || typeof data.records !== 'object' || Array.isArray(data.records)) data.records = {};
            if (!Array.isArray(data.dailyPerfect)) data.dailyPerfect = [];
            if (!Array.isArray(data.bookmarks)) data.bookmarks = [];
            return data;
        }
    } catch {
        // Study data is optional when browser storage is unavailable.
    }
    return { mistakes: [], fixed: [], daily: [], dailyPerfect: [], history: [], bookmarks: [], records: {} };
}

const studyData = loadStudyData();

function saveStudyData() {
    try {
        localStorage.setItem(studyStorageKey, JSON.stringify(studyData));
    } catch {
        // Keep the current journal available until the page closes.
    }
}

function personalRecordKey(mode, difficulty, range, total) {
    return `${questionBankVersion}:${mode}:${difficulty}:${range?.size ?? total}:${range?.start ?? 0}:${range?.end ?? total}`;
}

function renderPersonalRecord(correct, completed, restoringResult, hardcoreReset) {
    const note = document.getElementById('result-record');
    note.hidden = true;
    note.removeAttribute('data-improved');
    if (studyRun || retryingErrors || hardcoreReset) return;

    const total = testData.questions.length;
    const key = personalRecordKey(orderMode, runDifficulty, activeRange, total);
    const previous = studyData.records[key];
    const isNew = completed && !restoringResult && (previous === undefined || correct > previous);
    if (isNew) studyData.records[key] = correct;
    const best = isNew ? correct : previous;
    if (best === undefined) return;

    const score = `${best}/${testOrder.length}`;
    note.textContent = isNew && previous !== undefined ? `Новый рекорд ${score} · было ${previous}/${testOrder.length}` :
        isNew ? `Первый результат блока · ${score}` : `Личный рекорд · ${score}`;
    note.toggleAttribute('data-improved', isNew);
    note.hidden = false;
}

function studyQuestionKey(question, index) {
    return question.id == null ? `${questionBankVersion}:${index}` : String(question.id);
}

function reviewIndexes(keys = studyData.mistakes) {
    const pending = new Set(keys);
    return testData.questions.flatMap((question, index) => pending.has(studyQuestionKey(question, index)) ? [index] : []);
}

function currentStudyKey(questionIndex) {
    return studyQuestionKey(questions[questionIndex], (activeRange?.start ?? 0) + questionIndex);
}

function updateBookmarkButton() {
    const marked = studyData.bookmarks.includes(currentStudyKey(testOrder[currentIndex]));
    btnBookmark.setAttribute('aria-pressed', String(marked));
    btnBookmark.title = marked ? 'Убрать закладку' : 'Добавить закладку';
}

btnBookmark.addEventListener('click', () => {
    const key = currentStudyKey(testOrder[currentIndex]);
    if (studyData.bookmarks.includes(key)) studyData.bookmarks = studyData.bookmarks.filter(bookmark => bookmark !== key);
    else studyData.bookmarks.push(key);
    saveStudyData();
    updateBookmarkButton();
});

function localStudyDay(date = new Date()) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(value => String(value).padStart(2, '0')).join('-');
}

function dailyStreakEnding(day, completedDays = new Set(studyData.daily)) {
    const date = new Date(`${day}T12:00:00`);
    let streak = 0;
    while (completedDays.has(localStudyDay(date))) {
        streak += 1;
        date.setDate(date.getDate() - 1);
    }
    return streak;
}

function currentDailyStreak(now = new Date(), completed = new Set(studyData.daily)) {
    if (completed.has(localStudyDay(now))) return dailyStreakEnding(localStudyDay(now), completed);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    return dailyStreakEnding(localStudyDay(yesterday), completed);
}

function renderDailyCalendar() {
    const now = new Date();
    const completed = new Set(studyData.daily);
    const perfect = new Set(studyData.dailyPerfect);
    const calendar = document.getElementById('study-daily-calendar');
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 12);
    const tiles = [];
    for (let i = 0; i < 7; i++) {
        const day = localStudyDay(date);
        const tile = document.createElement('li');
        const number = document.createElement('time');
        const mark = document.createElement('span');
        const status = perfect.has(day) ? 'perfect' : completed.has(day) ? 'done' : 'empty';
        const statusText = { perfect: 'Без ошибок', done: 'Выполнено', empty: 'Не выполнено' }[status];
        tile.dataset.status = status;
        number.dateTime = day;
        number.textContent = String(date.getDate());
        number.setAttribute('aria-label', `${date.toLocaleDateString('ru-RU')} · ${statusText}`);
        tile.title = `${date.toLocaleDateString('ru-RU')} · ${statusText}`;
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = { perfect: '★', done: '✓', empty: '·' }[status];
        if (i === 6) number.setAttribute('aria-current', 'date');
        tile.append(number, mark);
        tiles.push(tile);
        date.setDate(date.getDate() + 1);
    }
    calendar.replaceChildren(...tiles);
    const today = localStudyDay(now);
    const streak = currentDailyStreak(now, completed);
    document.getElementById('study-daily-streak').textContent = `Серия подряд: ${streak}`;
    return completed.has(today);
}

function dailyIndexes(day) {
    const indexes = testData.questions.map((_, index) => index);
    let seed = (Number(day.replaceAll('-', '')) ^ questionBankVersion) >>> 0;
    for (let i = indexes.length - 1; i > 0; i--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }
    return indexes.slice(0, 5);
}

function startStudy(kind, limit = Infinity, onlyIndex = null) {
    const day = kind === 'daily' ? localStudyDay() : null;
    const indexes = kind === 'daily' ? dailyIndexes(day) : reviewIndexes(kind === 'bookmarks' ? studyData.bookmarks : studyData.mistakes)
        .filter(index => onlyIndex === null || index === onlyIndex).slice(0, limit);
    if (!indexes.length || (kind === 'daily' && studyData.daily.includes(day))) return;
    studyDialog.close();
    initTest(testData, false, null, { kind, day, indexes });
}

function recordStudyAnswer(questionIndex, correct) {
    const key = currentStudyKey(questionIndex);
    if (!correct && !studyData.mistakes.includes(key)) studyData.mistakes.push(key);
    if (correct && (retryingErrors || studyRun?.kind === 'review') && studyData.mistakes.includes(key)) {
        studyData.mistakes = studyData.mistakes.filter(item => item !== key);
        if (!studyData.fixed.includes(key)) studyData.fixed.push(key);
    }
    saveStudyData();
}

function recordStudyResult(correct, errors, completed, flawless, failed) {
    const dailyFinished = studyRun?.kind === 'daily' && !retryingErrors && completed;
    const dailyPerfect = dailyFinished && flawless;
    if (dailyFinished && !studyData.daily.includes(studyRun.day)) {
        studyData.daily.push(studyRun.day);
    }
    if (dailyPerfect && !studyData.dailyPerfect.includes(studyRun.day)) studyData.dailyPerfect.push(studyRun.day);
    const dailyStreak = dailyFinished ? dailyStreakEnding(studyRun.day) : 0;
    if (attemptId && !studyData.history.some(entry => entry.id === attemptId)) {
        const range = !studyRun && !retryingErrors && activeRange ? [activeRange.start + 1, activeRange.end] : null;
        studyData.history.unshift({ id: attemptId, time: Date.now(), kind: retryingErrors ? 'retry' : (studyRun?.kind ?? orderMode),
            difficulty: runDifficulty, correct, errors, total: testOrder.length, failed, range });
        studyData.history.length = Math.min(studyData.history.length, 16);
    }
    saveStudyData();
    return { dailyPerfect, dailyStreak, fixed: studyData.fixed.length };
}

function showStudyDialog(openQueue = false) {
    if (!testData) return;
    const pending = reviewIndexes().length;
    document.getElementById('study-review-note').textContent = pending
        ? `К повтору: ${pending}. Верный ответ убирает вопрос из списка.` : 'Пока нет вопросов для повтора.';
    btnStudyReview.disabled = btnStudyReviewAll.disabled = pending === 0;
    studyQueue.hidden = pending === 0;
    studyQueue.open = pending > 0 && openQueue;
    studyQueueList.replaceChildren();
    if (studyQueue.open) renderStudyQueue(studyQueueList, 'review', reviewIndexes());
    const bookmarks = reviewIndexes(studyData.bookmarks).length;
    document.getElementById('study-bookmark-note').textContent = bookmarks
        ? `Отмечено: ${bookmarks}` : 'Нажми на значок закладки рядом с вопросом, чтобы сохранить его.';
    bookmarkQueue.open = false;
    bookmarkQueue.hidden = btnStudyBookmarks.hidden = bookmarks === 0;
    bookmarkList.replaceChildren();
    const dailyDone = renderDailyCalendar();
    btnStudyDaily.disabled = dailyDone;
    document.getElementById('study-daily-note').textContent = dailyDone
        ? 'На сегодня выполнено. Новый набор появится завтра.' : 'Пять вопросов на сегодня. Без ошибок — отдельная награда.';
    const list = document.getElementById('study-history-list');
    const names = { daily: 'Задание дня', review: 'Повтор ошибок', bookmarks: 'Закладки', retry: 'Работа над ошибками', campaign: 'Кампания', random: 'Случайный порядок', sequential: 'Последовательный порядок' };
    document.getElementById('study-history-empty').hidden = studyData.history.length > 0;
    const summary = document.getElementById('study-history-summary');
    const answered = studyData.history.reduce((sum, entry) => sum + entry.correct + entry.errors, 0);
    const correct = studyData.history.reduce((sum, entry) => sum + entry.correct, 0);
    summary.hidden = answered === 0;
    summary.textContent = answered ? `Точность по данным журнала: ${Math.round(100 * correct / answered)}% · Исправлено ошибок: ${studyData.fixed.length}` : '';
    list.replaceChildren(...studyData.history.map(entry => {
        const row = document.createElement('li');
        const title = document.createElement('strong');
        const detail = document.createElement('span');
        const meter = document.createElement('progress');
        const kind = names[entry.kind] ?? 'Тест';
        const titleDifficulty = difficultyNames[entry.difficulty];
        title.textContent = titleDifficulty && !['review', 'daily', 'bookmarks'].includes(entry.kind) ? `${kind} · ${titleDifficulty}` : kind;
        detail.textContent = `${new Date(entry.time).toLocaleDateString('ru-RU')} · ${entry.correct}/${entry.total}` +
            (entry.failed ? ' · Провал' : ` · Ошибок: ${entry.errors}`) +
            (entry.range ? ` · Вопросы ${entry.range.join('–')}` : '');
        meter.max = entry.total;
        meter.value = entry.correct;
        meter.setAttribute('aria-hidden', 'true');
        row.dataset.failed = String(entry.failed);
        row.append(title, detail, meter);
        return row;
    }));
    studyDialog.showModal();
    if (studyQueue.open) studyQueue.querySelector('summary').focus();
}

function renderStudyQueue(list, kind, indexes) {
    const rows = document.createDocumentFragment();
    for (const index of indexes) {
        const row = document.createElement('li');
        const question = document.createElement('span');
        const button = document.createElement('button');
        question.className = 'study-queue-question';
        question.textContent = testData.questions[index].question_text;
        button.type = 'button';
        button.className = 'range-button';
        button.textContent = 'Повторить';
        button.setAttribute('aria-label', `Повторить вопрос ${index + 1}`);
        button.addEventListener('click', () => startStudy(kind, 1, index));
        row.append(question, button);
        rows.appendChild(row);
    }
    list.replaceChildren(rows);
}

studyQueue.addEventListener('toggle', () => {
    if (studyDialog.open && studyQueue.open && !studyQueueList.children.length) renderStudyQueue(studyQueueList, 'review', reviewIndexes());
});
bookmarkQueue.addEventListener('toggle', () => {
    if (studyDialog.open && bookmarkQueue.open && !bookmarkList.children.length) {
        renderStudyQueue(bookmarkList, 'bookmarks', reviewIndexes(studyData.bookmarks));
    }
});
btnStudyBookmarks.addEventListener('click', () => startStudy('bookmarks'));
btnStudy.addEventListener('click', () => showStudyDialog());
btnResultReview.addEventListener('click', () => showStudyDialog(true));
btnStudyReview.addEventListener('click', () => startStudy('review', 10));
btnStudyReviewAll.addEventListener('click', () => startStudy('review'));
btnStudyDaily.addEventListener('click', () => startStudy('daily'));

let serviceClicks = 0;
const discoveryPreviewUrl = new URL(window.location.href);
let replayDiscovery = discoveryPreviewUrl.searchParams.get('replay-mushroom') === '1';
document.querySelector('.welcome-titlebar').addEventListener('click', () => {
    serviceClicks += 1;
    if (serviceClicks !== 5) return;
    serviceClicks = 0;
    const enabled = document.body.toggleAttribute('data-service-mode');
    if (!enabled) return;
    const firstDiscovery = !unlockedAchievements.has('study-secret');
    unlockAchievements(achievementCatalog.filter(item => item.id === 'study-secret'));
    if (firstDiscovery || replayDiscovery) {
        if (replayDiscovery) {
            replayDiscovery = false;
            discoveryPreviewUrl.searchParams.delete('replay-mushroom');
            history.replaceState(history.state, '', discoveryPreviewUrl);
        }
        quizPet.discover();
    }
});

function unlockAchievements(items) {
    const earned = items.filter(item => !unlockedAchievements.has(item.id));
    if (!earned.length) return;
    for (const item of earned) unlockedAchievements.add(item.id);
    runUnlocks.push(...earned);
    try {
        localStorage.setItem(achievementStorageKey, JSON.stringify([...unlockedAchievements]));
    } catch {
        // Keep newly earned achievements visible for the current session.
    }
}

function celebrateAchievement(button, item) {
    playSound(item.legendary || item.campaign ? 'trophy' : 'badge');
    if (reducedMotion.matches || button.querySelector('.achievement-sparks')) return;
    const burst = document.createElement('span');
    burst.className = 'achievement-sparks';
    burst.setAttribute('aria-hidden', 'true');
    button.appendChild(burst);
    const count = item.legendary ? 28 : item.tone === 'hardcore' ? 14 : 7;
    const rainbow = ['#c8354f', '#e58b14', '#efd452', '#2f9861', '#345fc0', '#9d50b2'];
    const ink = getComputedStyle(button).getPropertyValue('--emblem-ink').trim() || '#725c25';
    for (let i = 0; i < count; i++) {
        const pixel = document.createElement('i');
        const angle = (i / count) * Math.PI * 2;
        const distance = (item.legendary ? 56 : 26) + Math.random() * 26;
        pixel.style.background = item.legendary ? rainbow[i % rainbow.length] : ink;
        burst.appendChild(pixel);
        pixel.animate([
            { transform: 'translate(0,0) rotate(0)', opacity: 1 },
            { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) rotate(220deg)`, opacity: 0 },
        ], { duration: item.legendary ? 720 : 380, easing: 'ease-out', fill: 'forwards' });
    }
    setTimeout(() => burst.remove(), 750);
}

function renderAchievementList(id, items) {
    const list = document.getElementById(id);
    list.replaceChildren(...items.map(item => {
        const entry = document.createElement('li');
        const icon = document.createElement('span');
        const unlocked = unlockedAchievements.has(item.id);
        const card = document.createElement(unlocked ? 'button' : 'div');
        card.className = 'achievement-card';
        const copy = document.createElement('span');
        const title = document.createElement('strong');
        const description = document.createElement('span');
        const variant = item.id === 'study-secret' ? 'secret' : item.icon || 'standard';
        copy.className = 'achievement-copy';
        icon.className = 'achievement-emblem';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor">${achievementIcons[item.campaign ? 'campaign' : variant]}</svg>`;
        title.textContent = item.title;
        description.textContent = item.description;
        entry.dataset.variant = variant;
        if (item.tone) entry.dataset.tone = item.tone;
        entry.toggleAttribute('data-legendary', Boolean(item.legendary));
        entry.toggleAttribute('data-unlocked', unlocked);
        if (unlocked) {
            card.type = 'button';
            card.addEventListener('click', () => celebrateAchievement(card, item));
        }
        copy.append(title, description);
        card.append(icon, copy);
        entry.appendChild(card);
        return entry;
    }));
}

function showNewAchievements(completed, flawless, campaignCompleted, studyResult, restoringResult) {
    const panel = document.getElementById('new-achievements');
    const run = { total: testOrder.length, difficulty: runDifficulty, streak: bestStreak,
        finalStreak: correctStreak, health, completed, flawless, campaignCompleted, ...studyResult };
    if (!restoringResult) {
        unlockAchievements(achievementCatalog.filter(item =>
            (item.campaign || item.live || item.study || run.total >= 50) && item.earned(run)));
    }
    panel.hidden = runUnlocks.length === 0;
    if (panel.hidden) return;

    renderAchievementList('new-achievement-list', [...runUnlocks].reverse());
}

btnAchievements.addEventListener('click', () => {
    document.getElementById('achievement-progress').textContent =
        `Открыто ${unlockedAchievements.size} из ${achievementCatalog.length}`;
    const meter = document.getElementById('achievement-meter');
    meter.max = achievementCatalog.length;
    meter.value = unlockedAchievements.size;
    const byId = new Map(achievementCatalog.map(item => [item.id, item]));
    renderAchievementList('achievement-list', Array.from(unlockedAchievements, id => byId.get(id)).reverse());
    renderAchievementList('locked-achievement-list', achievementCatalog.filter(item => !unlockedAchievements.has(item.id)));
    document.getElementById('achievement-empty').hidden = unlockedAchievements.size > 0;
    achievementDialog.showModal();
});

// ==========================================================
//  HELPERS
// ==========================================================
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderMarkdownWithMath(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Protect math formulas ($$...$$ and $...$) from marked.js markdown parsing
    const mathPlaceholders = [];
    
    // Replace display math ($$...$$) first
    let protectedText = text.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
        const id = `@@MATHDISP${mathPlaceholders.length}@@`;
        mathPlaceholders.push({ id, formula: match });
        return id;
    });
    
    // Replace inline math ($...$)
    protectedText = protectedText.replace(/\$([^\$\n]+?)\$/g, (match) => {
        const id = `@@MATHINL${mathPlaceholders.length}@@`;
        mathPlaceholders.push({ id, formula: match });
        return id;
    });
    
    // Parse Markdown
    let html = marked.parse(protectedText);
    
    // Restore math formulas untouched
    for (const item of mathPlaceholders) {
        html = html.replace(item.id, item.formula);
    }
    
    return html;
}

function renderMarkdownWithMathInline(text) {
    let html = renderMarkdownWithMath(text);
    if (html.startsWith('<p>') && html.endsWith('</p>\n')) {
        html = html.substring(3, html.length - 5);
    } else if (html.startsWith('<p>') && html.endsWith('</p>')) {
        html = html.substring(3, html.length - 4);
    }
    return html;
}

// ==========================================================
//  LOAD TEST DATA FROM JSON FILE
// ==========================================================
function parseMarkdownTest(mdText) {
    const lines = mdText.split('\n');
    let title = 'Тест';
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('# ')) {
            title = lines[i].trim().slice(2).trim();
            break;
        }
    }

    const questionSections = mdText.split('\n## ');
    const parsedQuestions = [];

    for (let i = 1; i < questionSections.length; i++) {
        const section = questionSections[i];
        const sectionLines = section.split('\n');
        if (sectionLines.length === 0) continue;

        let questionTextLines = [];
        const questionImages = [];
        const answers = [];
        let currentAnswer = null;
        let isParsingQuestion = true;

        const firstLine = sectionLines[0].trim();
        const firstLineClean = firstLine.replace(/^\d+\s*[.)]\s*/, '').trim();
        if (firstLineClean) {
            questionTextLines.push(firstLineClean);
        }

        for (let j = 1; j < sectionLines.length; j++) {
            const line = sectionLines[j];
            const stripped = line.trim();
            if (!stripped) continue;

            const ansMatch = stripped.match(/^\s*-\s*\[([ xX])\]\s*(.*)/);
            const bulletMatch = stripped.match(/^\s*-\s+(?!\[)(.*)/);
            const imgMatch = stripped.match(/^!\[.*?\]\((.*?)\)/);

            if (ansMatch) {
                isParsingQuestion = false;
                const isCorrect = ansMatch[1].toLowerCase() === 'x';
                const ansText = ansMatch[2].trim();
                currentAnswer = {
                    id: 'ans-' + Math.random().toString(36).substr(2, 9),
                    text: ansText,
                    is_correct: isCorrect,
                    images: []
                };
                answers.push(currentAnswer);
            } else if (bulletMatch) {
                isParsingQuestion = false;
                const ansText = bulletMatch[1].trim();
                const isCorrect = (answers.length === 0);
                currentAnswer = {
                    id: 'ans-' + Math.random().toString(36).substr(2, 9),
                    text: ansText,
                    is_correct: isCorrect,
                    images: []
                };
                answers.push(currentAnswer);
            } else if (imgMatch) {
                const imgPath = imgMatch[1].trim();
                if (isParsingQuestion) {
                    questionImages.push(imgPath);
                } else if (currentAnswer) {
                    currentAnswer.images.push(imgPath);
                }
            } else {
                if (isParsingQuestion) {
                    questionTextLines.push(line);
                } else if (currentAnswer) {
                    currentAnswer.text += '\n' + line;
                }
            }
        }

        const qText = questionTextLines.join('\n').trim();
        if (qText || questionImages.length > 0) {
            parsedQuestions.push({
                id: 'q-' + Math.random().toString(36).substr(2, 9),
                question_text: qText,
                question_images: questionImages,
                answers: answers
            });
        }
    }

    return {
        title: title,
        questions: parsedQuestions
    };
}

let activeRange = null;
const campaignKey = 'ppk-test-campaign-v1';
const rangeSelections = new Map();
const campaignProgressByDifficulty = new Map();
const campaignPerfectByDifficulty = new Map();
const campaignAttemptsByDifficulty = new Map();

function campaignStorageKey(mode) {
    // The old single track becomes the peaceful track.
    return mode === 'peaceful' ? campaignKey : `${campaignKey}-${mode}`;
}

function getCampaignProgress(mode = difficulty) {
    if (!campaignProgressByDifficulty.has(mode)) {
        let saved = 0;
        try {
            saved = Number(localStorage.getItem(campaignStorageKey(mode)));
        } catch {
            // Progress still works for the current session.
        }
        campaignProgressByDifficulty.set(mode, Number.isSafeInteger(saved) && saved >= 0 ? saved : 0);
    }
    const total = testData.questions.length;
    const progress = campaignProgressByDifficulty.get(mode);
    return progress === total ? total : Math.floor(Math.min(progress, total) / 5) * 5;
}

function setCampaignProgress(mode, value) {
    campaignProgressByDifficulty.set(mode, value);
    try {
        localStorage.setItem(campaignStorageKey(mode), String(value));
    } catch {
        // Keep progress in memory when storage is disabled.
    }
}

function getCampaignPerfect(mode) {
    if (!campaignPerfectByDifficulty.has(mode)) {
        let stages = [];
        try {
            const saved = JSON.parse(localStorage.getItem(`${campaignStorageKey(mode)}-perfect`));
            if (Array.isArray(saved)) stages = saved.filter(stage => Number.isSafeInteger(stage) && stage >= 0 && stage % 5 === 0);
        } catch {
            // Older saves have no record of flawless stages.
        }
        campaignPerfectByDifficulty.set(mode, new Set(stages));
    }
    return campaignPerfectByDifficulty.get(mode);
}

function saveCampaignPerfect(mode, stages) {
    campaignPerfectByDifficulty.set(mode, stages);
    try {
        localStorage.setItem(`${campaignStorageKey(mode)}-perfect`, JSON.stringify([...stages]));
    } catch {
        // Keep the ratings in memory if browser storage is disabled.
    }
}

function campaignAttempts(mode) {
    if (!campaignAttemptsByDifficulty.has(mode)) {
        let entries = [];
        try {
            const saved = JSON.parse(localStorage.getItem(`${campaignStorageKey(mode)}-ratings`));
            if (Array.isArray(saved)) entries = saved.filter(entry => Array.isArray(entry) &&
                /^(?:\d+:)?\d+:\d+$/.test(entry[0]) && Number.isFinite(entry[1]) && entry[1] >= -1 && entry[1] <= 100);
        } catch {
            // Older campaigns have no ratings yet.
        }
        campaignAttemptsByDifficulty.set(mode, new Map(entries));
    }
    return campaignAttemptsByDifficulty.get(mode);
}

function rateCampaignRange(range, accuracy) {
    const ratings = campaignAttempts(runDifficulty);
    if (range) ratings.set(`${range.size}:${range.start}:${range.end}`, accuracy);
    else ratings.clear();
    try {
        localStorage.setItem(`${campaignStorageKey(runDifficulty)}-ratings`, JSON.stringify([...ratings]));
    } catch {
        // Ratings remain visible for this visit.
    }
}

function nextCampaignRange(total) {
    const campaignProgress = getCampaignProgress();
    if (campaignProgress >= total) return null;
    return { start: campaignProgress, end: Math.min(campaignProgress + 5, total), size: 5 };
}

function campaignRangeAvailable(start, end, size, total) {
    if (orderMode !== 'campaign') return true;
    const campaignProgress = getCampaignProgress();
    if (start === null) return campaignProgress >= total;
    if (size === 5) {
        return end <= campaignProgress || (start === campaignProgress && end === Math.min(start + 5, total));
    }
    if (end - start !== size) return false;
    const unlockAt = size === 25 ? Math.floor(start / 50) * 50 + 50 : end;
    return campaignProgress >= unlockAt;
}

function rangeSelectionKey(mode = orderMode, level = difficulty) {
    return mode === 'campaign' ? `${rangeStorageKey}-campaign-${level}` : rangeStorageKey;
}

function readRangeSelection() {
    const key = rangeSelectionKey();
    if (!rangeSelections.has(key)) {
        try { rangeSelections.set(key, JSON.parse(localStorage.getItem(key))); }
        catch { return null; }
    }
    return rangeSelections.get(key);
}

function rememberRangeSelection(selection) {
    const key = rangeSelectionKey();
    rangeSelections.set(key, selection);
    try { localStorage.setItem(key, JSON.stringify(selection)); } catch { /* Keep the menu selection in memory. */ }
}

function selectionForRange(range) {
    if (!range) return { hundred: null, fifty: null, size: 5, part: null };
    const { start, size } = range;
    const hundred = Math.floor(start / 100) * 100;
    const fifty = size < 100 ? Math.floor(start / 50) * 50 : null;
    return { hundred, fifty, size: Math.min(size, 50), part: size < 50 ? start : null };
}

function selectedRange({ hundred, fifty, size, part }, total) {
    const start = part ?? fifty ?? hundred;
    const count = part !== null ? size : fifty !== null ? 50 : 100;
    return { start, end: start === null ? total : Math.min(start + count, total), size: count };
}

function setupRangeButtons(total, resultBlock = null) {
    const onResults = resultBlock !== null;
    const host = document.getElementById(onResults ? 'result-range-buttons' : 'range-buttons');
    const selection = document.getElementById('range-select');
    const summary = document.getElementById('range-summary');
    const sizes = [5, 10, 25, 50];
    const campaign = orderMode === 'campaign';
    const label = (start, end) => `${start + 1}–${end}`;
    const saved = readRangeSelection();
    const previousAttempt = campaign && !saved ? readSavedAttempt() : null;
    let { hundred, fifty, size, part } = selectionForRange(onResults ? activeRange : campaign ? nextCampaignRange(total) : null);
    const preferred = saved ?? (previousAttempt?.bank === questionBankVersion && !previousAttempt.failed &&
        previousAttempt.orderMode === orderMode && previousAttempt.difficulty === difficulty && !previousAttempt.studyRun
        ? selectionForRange(previousAttempt.activeRange) : null);
    if (preferred && sizes.includes(preferred.size)) {
        const validHundred = preferred.hundred === null || (Number.isInteger(preferred.hundred) &&
            preferred.hundred >= 0 && preferred.hundred < total && preferred.hundred % 100 === 0);
        const validFifty = preferred.fifty === null || (preferred.hundred !== null &&
            (preferred.fifty === preferred.hundred || preferred.fifty === preferred.hundred + 50) && preferred.fifty < total);
        const validPart = preferred.part === null || (preferred.fifty !== null &&
            Number.isInteger(preferred.part) && preferred.part >= preferred.fifty &&
            preferred.part < Math.min(preferred.fifty + 50, total) && (preferred.part - preferred.fifty) % preferred.size === 0);
        if (validHundred && validFifty && validPart && (!onResults || preferred.hundred === resultBlock)) {
            const range = selectedRange(preferred, total);
            if (saved || onResults || campaignRangeAvailable(range.start, range.end, range.size, total)) {
                ({ hundred, fifty, size, part } = preferred);
            }
        }
    }

    host.replaceChildren();

    function blocks(start, end, step) {
        const result = [];
        for (let index = start; index < end; index += step) {
            result.push([index, Math.min(index + step, end)]);
        }
        return result;
    }

    function createRow(title, count, extraClass = '') {
        const group = document.createElement('div');
        group.className = 'range-button-group';
        const heading = document.createElement('div');
        heading.className = 'range-label';
        heading.textContent = title;
        const row = document.createElement('div');
        row.className = 'range-button-row';
        if (extraClass) row.classList.add(extraClass);
        const buttons = Array.from({ length: count }, () => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'range-button';
            row.appendChild(button);
            return button;
        });
        group.append(heading, row);
        host.appendChild(group);

        return entries => {
            buttons.forEach((button, index) => {
                const entry = entries[index];
                button.disabled = !entry;
                button.toggleAttribute('data-placeholder', !entry);
                button.removeAttribute('data-next-stage');
                delete button.dataset.completion;
                button.removeAttribute('aria-label');
                if (!entry) {
                    button.textContent = '';
                    button.removeAttribute('aria-pressed');
                    button.onclick = null;
                    return;
                }
                const [text, active, action, locked = false, completion, nextStage = false] = entry;
                button.disabled = locked;
                button.toggleAttribute('data-locked', locked);
                button.toggleAttribute('data-next-stage', nextStage);
                button.title = locked ? 'Откроется по мере прохождения' : '';
                if (completion && (!locked || completion === 'danger')) {
                    button.dataset.completion = completion;
                    const status = { clear: 'Пройдено', perfect: 'Без ошибок', hardcore: 'Пройдено на хардкоре',
                        rainbow: 'Весь тест пройден без ошибок',
                        danger: 'Нужно повторить', caution: 'Есть над чем поработать' }[completion];
                    button.title = locked ? `${status} · диапазон закрыт` : status;
                    button.setAttribute('aria-label', `${text} · ${button.title}`);
                }
                if (button.textContent !== text) button.textContent = text;
                button.setAttribute('aria-pressed', String(active));
                button.onclick = () => {
                    action();
                    render();
                    rememberRangeSelection({ hundred, fifty, size, part });
                };
            });
        };
    }

    const hundreds = blocks(0, total, 100);
    const updateHundreds = onResults ? null : createRow('Блоки по 100 вопросов', hundreds.length + 1);
    const updateHalves = createRow('Блоки по 50 вопросов', 2);
    const updateSizes = createRow('Размер части', sizes.length);
    const updateParts = createRow('Выберите вопросы', 10, 'range-parts');
    const startButton = onResults ? document.createElement('button') : null;
    if (startButton) {
        startButton.type = 'button';
        startButton.className = 'range-button';
        host.appendChild(startButton);
    }

    function render() {
        const campaignProgress = campaign ? getCampaignProgress() : 0;
        const perfectStages = campaign ? getCampaignPerfect(difficulty) : null;
        const ratings = campaign ? campaignAttempts(difficulty) : null;
        function ratingFor(start, end, rangeSize) {
            return ratings.get(`${rangeSize}:${start}:${end}`) ??
                (end - start === rangeSize ? ratings.get(`${start}:${end}`) : undefined);
        }
        function completionForRating(rating) {
            if (rating === undefined) return;
            if (rating === -1) return 'danger';
            if (difficulty === 'hardcore') return 'hardcore';
            return rating === 100 ? 'perfect' : rating < 50 ? 'danger' : rating < 70 ? 'caution' : 'clear';
        }
        function completion(start, end, rangeSize, wholeTest = false) {
            if (!campaign) return;
            const cleared = end <= campaignProgress;
            const rating = ratingFor(start, end, rangeSize);
            if (wholeTest) return rating === 100 ? 'rainbow' : completionForRating(rating);
            if (rating === -1) return 'danger';
            if (rangeSize === 5 && cleared && perfectStages.has(start)) return 'perfect';
            if (rating !== undefined) return difficulty === 'hardcore' && !cleared ? 'danger' : completionForRating(rating);
            if (rangeSize === 5 && cleared) return difficulty === 'hardcore' ? 'hardcore' : 'clear';
        }
        function sizeCompletion(parts, rangeSize) {
            if (!campaign) return;
            const scores = parts.map(([start, end]) => ratingFor(start, end, rangeSize)).filter(score => score !== undefined);
            if (!scores.length) return;
            const result = Math.min(...scores);
            // A perfect size badge means every part of that size was played without mistakes.
            return completionForRating(result === 100 && scores.length < parts.length ? 99 : result);
        }
        const shownHundred = hundred ?? 0;
        const shownFifty = fifty ?? shownHundred;
        const hundredEnd = Math.min(shownHundred + 100, total);
        const fiftyEnd = Math.min(shownFifty + 50, total);

        updateHundreds?.([
            ['Все вопросы', hundred === null, () => { hundred = null; fifty = null; part = null; },
                !campaignRangeAvailable(null, total, total, total), completion(0, total, total, true)],
            ...hundreds.map(([start, end]) => [label(start, end), hundred === start, () => {
                hundred = start;
                fifty = null;
                part = null;
            }, campaign && start > campaignProgress, completion(start, end, 100)]),
        ]);
        updateHalves(blocks(shownHundred, hundredEnd, 50).map(([start, end]) => [
            label(start, end), fifty === start, () => {
                hundred = shownHundred;
                fifty = start;
                part = null;
            }, campaign && start > campaignProgress, completion(start, end, 50),
        ]));
        updateSizes(sizes.map(value => {
            const parts = blocks(shownFifty, fiftyEnd, value);
            return ['По ' + value, size === value, () => {
                hundred = shownHundred;
                fifty = shownFifty;
                size = value;
                part = shownFifty;
            }, campaign && !parts.some(([start, end]) => campaignRangeAvailable(start, end, value, total)),
            sizeCompletion(parts, value)];
        }));
        updateParts(blocks(shownFifty, fiftyEnd, size).map(([start, end]) => [
            label(start, end), part === start, () => {
                hundred = shownHundred;
                fifty = shownFifty;
                part = start;
            }, !campaignRangeAvailable(start, end, size, total), completion(start, end, size),
            campaign && size === 5 && start === campaignProgress,
        ]));

        const { start, end, size: count } = selectedRange({ hundred, fifty, size, part }, total);
        const available = campaignRangeAvailable(start, end, count, total);
        if (startButton) {
            startButton.textContent = 'Начать: ' + label(start, end);
            startButton.disabled = !available;
            startButton.onclick = () => initTest(testData, false, { start, end, size: count });
            return;
        }
        selection.dataset.size = count;
        selection.value = start === null ? 'all' : `${start}-${end - 1}`;
        btnStart.disabled = !available;
        summary.textContent = start === null ? `Выбраны все вопросы: ${total}` :
            `Выбраны вопросы ${label(start, end)} (${end - start})`;
        if (campaign) {
            const next = nextCampaignRange(total);
            document.getElementById('campaign-route-count').textContent = `Кампания · ${campaignProgress}/${total}`;
            document.getElementById('campaign-route-next').textContent = next
                ? `Далее ${label(next.start, next.end)}` : 'Кампания завершена';
            const meter = document.getElementById('campaign-route-meter');
            meter.max = total;
            meter.value = campaignProgress;
            const rating = ratingFor(start ?? 0, end, start === null ? total : count);
            const status = !available ? 'закрыт' : rating === -1 ? 'провал' : rating !== undefined
                ? `последний результат ${Math.round(rating)}%` : 'нет оценки';
            summary.textContent = `${start === null ? 'Все вопросы' : label(start, end)} · ${status}`;
        }
        const range = start === null ? null : { start, end, size: count };
        const record = studyData.records[personalRecordKey(orderMode, difficulty, range, total)];
        if (available && record !== undefined) summary.textContent += ` · рекорд ${record}/${end - (start ?? 0)}`;
    }

    if (!onResults) document.getElementById('range-selector-container').style.display = total > 5 ? 'flex' : 'none';
    if (!onResults) {
        document.getElementById('campaign-legend').hidden = !campaign;
        document.getElementById('campaign-route').hidden = !campaign;
    }
    render();
}

const TEST_JSON_FILE = 'ppk.md';

const testDataReady = (async function loadTestData() {
    try {
        let data = window.TEST_DATA;
        if (!data) {
            const resp = await fetch(TEST_JSON_FILE);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            
            if (TEST_JSON_FILE.toLowerCase().endsWith('.md')) {
                const text = await resp.text();
                data = parseMarkdownTest(text);
            } else {
                data = await resp.json();
            }
        }

        testData = data;
        questions = data.questions || [];

        const title = data.title || data.name || 'Тест';
        testTitleDisplay.textContent = title;
        metaCount.textContent = `${questions.length} вопросов`;

        const signature = JSON.stringify(questions.map(question => [question.id, question.question_text,
            question.answers.map(answer => [answer.id, answer.text, answer.is_correct])]));
        let hash = 2166136261;
        for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
        questionBankVersion = hash >>> 0;
        setupRangeButtons(questions.length);
    } catch (err) {
        testTitleDisplay.textContent = 'Ошибка загрузки теста';
        btnStart.disabled = true;
        btnStart.style.opacity = '0.4';
        console.error('Failed to load test:', err);
    }
})();

// ==========================================================
//  START
// ==========================================================
btnStart.addEventListener('click', () => {
    if (!testData) return;
    initTest(testData);
});

btnQuestionOrder.addEventListener('click', () => {
    orderMode = orderModes[(orderModes.indexOf(orderMode) + 1) % orderModes.length];
    updateOrderLabel();
    updateDifficultyHint();
    saveMenuSettings();
    if (testData) setupRangeButtons(testData.questions.length);
});

function updateOrderLabel() {
    const labels = { random: 'Случайный порядок', sequential: 'Последовательный порядок', campaign: 'Режим прохождения' };
    document.getElementById('question-order-label').textContent = labels[orderMode];
    btnQuestionOrder.dataset.mode = orderMode;
}

for (const option of difficultyOptions) {
    option.addEventListener('click', () => {
        difficulty = option.dataset.difficulty;
        updateDifficultyMenu();
        saveMenuSettings();
        if (testData) {
            setupRangeButtons(testData.questions.length);
            fitWelcomeScreen();
        }
        difficultyMenu.open = false;
        difficultyLabel.focus({ preventScroll: true });
    });
}

function updateDifficultyMenu() {
    const selected = Array.from(difficultyOptions).find(option => option.dataset.difficulty === difficulty);
    difficultyLabel.textContent = selected.textContent;
    difficultyLabel.setAttribute('aria-label', 'Сложность: ' + selected.textContent);
    for (const button of difficultyOptions) button.setAttribute('aria-pressed', String(button === selected));
    updateDifficultyHint();
}

function saveMenuSettings() {
    try { localStorage.setItem(menuStorageKey, JSON.stringify({ orderMode, difficulty })); } catch { /* Optional setting. */ }
}

function updateResumeButton() {
    const saved = readSavedAttempt();
    const resumable = saved?.bank === questionBankVersion && saved?.screen === 'test' && !saved.failed &&
        Array.isArray(saved.testOrder) && Number.isInteger(saved.currentIndex) &&
        saved.currentIndex >= 0 && saved.currentIndex < saved.testOrder.length;
    btnResume.hidden = !resumable;
    if (resumable) btnResume.textContent = `Продолжить · вопрос ${saved.currentIndex + 1}/${saved.testOrder.length}`;
}

function openSavedMenu() {
    const saved = readSavedAttempt();
    let menu;
    try { menu = JSON.parse(localStorage.getItem(menuStorageKey)); } catch { /* Use the last attempt if available. */ }
    if (saved?.bank === questionBankVersion && saved.failed && saved.screen === 'test') restoreAttempt();
    const settings = menu ?? saved;
    if (orderModes.includes(settings?.orderMode)) orderMode = settings.orderMode;
    if (Object.hasOwn(difficultyNames, settings?.difficulty)) difficulty = settings.difficulty;
    updateOrderLabel();
    updateDifficultyMenu();
    updateResumeButton();
    showScreen(welcomeScreen);
}

// Reset choices act on the current test's own save data.
const settingsDialog = document.getElementById('settings-dialog');
const resetOptions = document.getElementById('reset-options');
const resetConfirm = document.getElementById('reset-confirm');
const resetStatus = document.getElementById('reset-status');
const resetCancel = document.getElementById('btn-reset-cancel');
let pendingReset = null;
const resetDescriptions = {
    pet: 'Баланс и купленные вещи исчезнут. Дискеты за блоки можно будет заработать заново.',
    progress: 'Кампании на всех сложностях, текущая попытка, журнал ошибок и рекорды будут сброшены.',
    achievements: 'Открытые достижения и награды за них будут сброшены.',
    all: 'Кампании, попытка, журнал, закладки, достижения, гардероб, дискеты и настройки этого теста будут сброшены.',
};

function resetProgress(full) {
    for (const mode of Object.keys(difficultyNames)) {
        const key = campaignStorageKey(mode);
        removeSavedKeys([key, `${key}-perfect`, `${key}-ratings`]);
        campaignProgressByDifficulty.set(mode, 0);
        campaignPerfectByDifficulty.set(mode, new Set());
        campaignAttemptsByDifficulty.set(mode, new Map());
    }
    lastAttempt = 'null';
    activeRange = null;
    runUnlocks = [];
    rangeSelections.clear();
    removeSavedKeys([sessionStorageKey, rangeStorageKey,
        ...Object.keys(difficultyNames).map(level => rangeSelectionKey('campaign', level))]);
    Object.assign(studyData, { mistakes: [], fixed: [], daily: [], dailyPerfect: [], history: [], records: {} });
    if (full) studyData.bookmarks = [];
    saveStudyData();
    updateResumeButton();
    showScreen(welcomeScreen);
}

function resetAchievements() {
    unlockedAchievements.clear();
    runUnlocks = [];
    serviceClicks = 0;
    document.body.removeAttribute('data-service-mode');
    document.getElementById('new-achievements').hidden = true;
    removeSavedKeys([achievementStorageKey]);
    const saved = readSavedAttempt();
    if (!saved) return;
    saved.unlocks = [];
    lastAttempt = JSON.stringify(saved);
    try { localStorage.setItem(sessionStorageKey, lastAttempt); } catch { /* Keep the cleared list for this visit. */ }
}

function resetEverything() {
    resetAchievements();
    quizPet.reset(true);
    removeSavedKeys([menuStorageKey, soundStorageKey, retroFontStorageKey]);
    soundEnabled = true;
    orderMode = 'random';
    difficulty = 'peaceful';
    runDifficulty = difficulty;
    updateSoundButton();
    setRetroFont(false);
    updateOrderLabel();
    updateDifficultyMenu();
    resetProgress(true);
}

function dismissReset() {
    const trigger = pendingReset;
    pendingReset = null;
    resetConfirm.hidden = true;
    trigger?.focus();
}

btnSettings.addEventListener('click', () => {
    pendingReset = null;
    resetConfirm.hidden = true;
    resetStatus.hidden = true;
    settingsDialog.showModal();
});

resetOptions.addEventListener('click', event => {
    const button = event.target.closest('button[data-reset]');
    if (!button) return;
    pendingReset = button;
    document.getElementById('reset-confirm-title').textContent = button.textContent;
    document.getElementById('reset-confirm-note').textContent = resetDescriptions[button.dataset.reset];
    resetStatus.hidden = true;
    resetConfirm.hidden = false;
    resetCancel.focus();
});

resetCancel.addEventListener('click', dismissReset);
settingsDialog.addEventListener('cancel', event => {
    if (!pendingReset) return;
    event.preventDefault();
    dismissReset();
});

document.getElementById('btn-reset-confirm').addEventListener('click', () => {
    if (!pendingReset) return;
    const category = pendingReset.dataset.reset;
    if (category === 'pet') quizPet.reset();
    if (category === 'progress') resetProgress(false);
    if (category === 'achievements') resetAchievements();
    if (category === 'all') resetEverything();
    dismissReset();
    resetStatus.textContent = 'Сброс выполнен.';
    resetStatus.hidden = false;
});

document.addEventListener('click', event => {
    if (difficultyMenu.open && !difficultyMenu.contains(event.target)) difficultyMenu.open = false;
});

function updateDifficultyHint() {
    document.body.dataset.difficulty = difficulty;
    document.body.toggleAttribute('data-hardcore', difficulty === 'hardcore');
    const limit = difficultyLimits[difficulty];
    difficultyHint.textContent = limit ? `Провал при ${limit}% ошибок` : 'Без досрочного завершения';
    if (difficulty === 'hardcore') difficultyHint.textContent = orderMode === 'campaign'
        ? 'Вторая ошибка сбрасывает прогресс кампании' : 'Провал на второй ошибке';
}

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !difficultyMenu.open) return;
    difficultyMenu.open = false;
    difficultyLabel.focus({ preventScroll: true });
});

function errorLimit() {
    if (retryingErrors) return Infinity;
    if (runDifficulty === 'hardcore') return 2;
    const percent = difficultyLimits[runDifficulty];
    return percent ? Math.ceil(testOrder.length * percent / 100) : Infinity;
}

// ==========================================================
//  UTILS
// ==========================================================
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ==========================================================
//  INIT TEST
// ==========================================================
function initTest(data, onlyErrors = false, range, training = null) {
    testData = data;

    if (onlyErrors) {
        const errorIndexes = [];
        testOrder.forEach(idx => {
            const q = questions[idx];
            const answerId = userAnswers[idx];
            const correct = q.answers.find(a => a.is_correct);
            if (answerId !== undefined && correct?.id !== answerId) errorIndexes.push(idx);
        });
        if (!errorIndexes.length) return;
        testOrder = orderMode === 'sequential' ? errorIndexes.sort((a, b) => a - b) : shuffleArray(errorIndexes);
        training = studyRun;
    } else if (training) {
        activeRange = null;
        questions = data.questions;
        testOrder = training.indexes;
    } else {
        const rangeSelect = document.getElementById('range-select');
        if (range === undefined && rangeSelect.value !== 'all') {
            const [start, last] = rangeSelect.value.split('-').map(Number);
            range = { start, end: last + 1, size: Number(rangeSelect.dataset.size) };
        }
        const total = data.questions.length;
        if (!campaignRangeAvailable(range?.start ?? null, range?.end ?? total, range?.size ?? total, total)) return;
        activeRange = range ?? null;
        const savedSelection = readRangeSelection();
        const selected = savedSelection && selectedRange(savedSelection, total);
        if (!selected || selected.start !== (activeRange?.start ?? null) ||
            (activeRange && selected.size !== activeRange.size)) {
            rememberRangeSelection(selectionForRange(activeRange));
        }
        questions = activeRange ? data.questions.slice(activeRange.start, activeRange.end) : data.questions;
        const indexes = Array.from({ length: questions.length }, (_, i) => i);
        testOrder = orderMode === 'sequential' ? indexes : shuffleArray(indexes);
    }

    currentIndex = 0;
    studyRun = training;
    attemptId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    retryingErrors = onlyErrors;
    userAnswers = {};
    answerShuffleMap = {};
    health = testOrder.length;
    runDifficulty = studyRun ? 'peaceful' : difficulty;
    correctStreak = 0;
    bestStreak = 0;
    runUnlocks = [];
    updateHealth();

    testOrder.forEach(qIdx => {
        const q = questions[qIdx];
        answerShuffleMap[qIdx] = shuffleArray(Array.from({ length: q.answers.length }, (_, i) => i));
    });

    showScreen(testScreen);
    renderQuestion();
}

// ==========================================================
//  SCREEN SWITCHING
// ==========================================================
function showScreen(screen) {
    const theme = screen === welcomeScreen ? difficulty : runDifficulty;
    document.body.dataset.difficulty = theme;
    document.body.toggleAttribute('data-hardcore', theme === 'hardcore');
    difficultyMenu.open = false;
    clearTimeout(failureTimer);
    failureTimer = null;
    failureNotice.hidden = true;
    [welcomeScreen, testScreen, resultScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
    if (screen === welcomeScreen && testData) setupRangeButtons(testData.questions.length);
    btnMenu.hidden = screen === welcomeScreen;
    btnAchievements.hidden = screen === testScreen;
    btnStudy.hidden = screen === testScreen;
    btnSettings.hidden = screen === testScreen;
    quizPet.setVisible(screen !== testScreen);
    testScreen.toggleAttribute('data-training', Boolean(studyRun));
    window.scrollTo(0, 0);
    if (screen === welcomeScreen) fitWelcomeScreen();
}

// ==========================================================
//  RENDER QUESTION
// ==========================================================
function renderQuestion(draftAnswer = null, direction = 0) {
    const qIndex = testOrder[currentIndex];
    const question = questions[qIndex];
    updateBookmarkButton();

    answersContainer.innerHTML = '';
    questionImages.innerHTML = '';
    selectedAnswerId = null;
    delete testScreen.dataset.answerState;
    delete testScreen.dataset.reaction;
    answerReaction.hidden = true;
    answerReaction.textContent = '';
    delete answerReaction.dataset.milestone;
    submitLabel.textContent = 'Ответить';
    submitIcon.setAttribute('href', '#quiz-icon-check');
    delete btnSubmit.dataset.outcome;
    btnNext.disabled = true;
    btnNext.hidden = currentIndex === testOrder.length - 1;

    // Progress
    progressText.textContent = `${currentIndex + 1} / ${testOrder.length}`;
    progressBarFill.style.width = `${((currentIndex + 1) / testOrder.length) * 100}%`;

    // Question text
    questionText.innerHTML = renderMarkdownWithMath(question.question_text);

    // Question images
    if (question.question_images && question.question_images.length > 0) {
        question.question_images.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            img.alt = 'Изображение к вопросу';
            questionImages.appendChild(img);
        });
    }

    // Answers
    const hasAnswered = userAnswers[qIndex] !== undefined;
    const shuffled = answerShuffleMap[qIndex];

    shuffled.forEach((ansIdx, position) => {
        const answer = question.answers[ansIdx];
        const card = document.createElement('div');
        card.className = 'answer-card';
        card.tabIndex = hasAnswered ? -1 : 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-pressed', String(hasAnswered && userAnswers[qIndex] === answer.id));
        card.setAttribute('aria-disabled', String(hasAnswered));
        card.dataset.answerId = answer.id;

        let imagesHtml = '';
        if (answer.images && answer.images.length > 0) {
            imagesHtml = '<div class="answer-images">';
            answer.images.forEach(src => {
                imagesHtml += `<img src="${src}" alt="Вариант ответа">`;
            });
            imagesHtml += '</div>';
        }

        let parsedAnsText = renderMarkdownWithMathInline(answer.text);

        card.innerHTML = `
            <div class="answer-content">
                <span class="answer-key" aria-hidden="true">
                    <span>${position + 1}</span>
                    <svg width="13" height="13" viewBox="0 0 16 16"><use /></svg>
                </span>
                <div class="answer-text-label">${parsedAnsText}</div>
            </div>
            ${imagesHtml}
        `;

        if (!hasAnswered) {
            card.addEventListener('click', () => selectAnswer(card, answer.id));
        } else {
            card.classList.add('disabled');
        }

        answersContainer.appendChild(card);
    });

    // Render math formulas
    if (window.renderMathInElement) {
        renderMathInElement(questionText, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ],
            throwOnError: false,
            strict: false
        });
        renderMathInElement(answersContainer, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ],
            throwOnError: false,
            strict: false
        });
    }

    // Back button
    btnPrev.disabled = currentIndex === 0;
    btnPrev.hidden = btnPrev.disabled;

    if (hasAnswered) {
        highlightAnswers(userAnswers[qIndex], question);
    } else {
        btnSubmit.disabled = true;
        const draft = draftAnswer === null ? null : Array.from(answersContainer.children)
            .find(card => card.dataset.answerId === String(draftAnswer));
        if (draft) {
            draft.classList.add('selected');
            draft.setAttribute('aria-pressed', 'true');
            selectedAnswerId = draftAnswer;
            btnSubmit.disabled = false;
        }
    }
    saveAttempt();

    testScreen.parentElement.scrollTop = 0;
    testScreen.focus({ preventScroll: true });
    for (const panel of [questionText.closest('.question-card'), answersContainer]) {
        panel.getAnimations().forEach(animation => animation.cancel());
        if (!reducedMotion.matches) panel.animate([
            { opacity: 0.79, translate: `${direction * 5}px 0` },
            { opacity: 1, translate: '0 0' },
        ], { duration: 145, easing: 'cubic-bezier(.2,.7,.25,1)' });
    }
}

// ==========================================================
//  SELECT ANSWER
// ==========================================================
function selectAnswer(cardEl, answerId) {
    if (userAnswers[testOrder[currentIndex]] !== undefined) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && cardEl.contains(selection.anchorNode)) return;

    answersContainer.querySelectorAll('.answer-card').forEach(card => {
        card.classList.toggle('selected', card === cardEl);
        card.setAttribute('aria-pressed', String(card === cardEl));
    });

    selectedAnswerId = answerId;
    btnSubmit.disabled = false;
    saveAttempt();
}

// ==========================================================
//  SUBMIT ANSWER
// ==========================================================
function submitAnswer() {
    if (failureTimer !== null) return;
    const qIndex = testOrder[currentIndex];
    const question = questions[qIndex];
    if (selectedAnswerId === null || userAnswers[qIndex] !== undefined) return;
    userAnswers[qIndex] = selectedAnswerId;
    const isCorrect = highlightAnswers(selectedAnswerId, question);
    recordStudyAnswer(qIndex, isCorrect);
    if (isCorrect) {
        correctStreak += 1;
        bestStreak = Math.max(bestStreak, correctStreak);
        unlockAchievements(achievementCatalog.filter(item => item.live && item.earned({ streak: correctStreak })));
        answerReaction.textContent = correctStreak > 1 ? 'Серия ×' + correctStreak : 'Есть!';
        if (streakMilestones.includes(correctStreak)) answerReaction.dataset.milestone = '';
    } else {
        correctStreak = 0;
        health -= 1;
        updateHealth();
        answerReaction.textContent = '−1 HP';
    }
    answerReaction.hidden = false;
    testScreen.dataset.reaction = isCorrect ? 'reward' : 'loss';
    if (!isCorrect && testOrder.length - health >= errorLimit()) {
        playSound('failure');
        failRun();
    } else {
        playSound(isCorrect ? (streakMilestones.includes(correctStreak) ? 'streak' : 'correct') : 'wrong');
        saveAttempt();
    }
}

function failRun() {
    const reset = orderMode === 'campaign' && runDifficulty === 'hardcore';
    if (reset) {
        setCampaignProgress(runDifficulty, 0);
        rememberRangeSelection(selectionForRange(nextCampaignRange(testData.questions.length)));
        saveCampaignPerfect(runDifficulty, new Set());
        rateCampaignRange(null);
        const recordPrefix = `${questionBankVersion}:campaign:hardcore:`;
        for (const key of Object.keys(studyData.records)) {
            if (key.startsWith(recordPrefix)) delete studyData.records[key];
        }
        saveStudyData();
    }
    failureTitle.textContent = reset ? 'Хардкор · кампания сброшена' : 'Лимит ошибок исчерпан';
    saveAttempt('test', true);
    failureNotice.hidden = false;
    btnNext.disabled = true;
    btnPrev.disabled = true;
    btnSubmit.disabled = true;
    failureTimer = setTimeout(() => finishTest(true), 5000);
    failureNotice.focus({ preventScroll: true });
}

function updateHealth() {
    healthBar.max = testOrder.length;
    healthBar.value = health;
    const fraction = health / testOrder.length;
    healthBar.dataset.level = fraction <= 0.25 ? 'low' : fraction <= 0.5 ? 'medium' : 'high';
    healthText.textContent = 'HP ' + health + '/' + testOrder.length;
    const mistakes = testOrder.length - health;
    const limit = errorLimit();
    const remaining = Math.max(0, limit - mistakes - 1);
    hardcoreIndicator.hidden = !Number.isFinite(limit);
    hardcoreIndicator.textContent = remaining ? `Запас: ${remaining}` : mistakes >= limit ? 'Лимит исчерпан' : 'На грани';
    hardcoreIndicator.setAttribute('aria-label', remaining ? `Допустимо ещё ошибок: ${remaining}` : hardcoreIndicator.textContent);
    hardcoreIndicator.dataset.remaining = String(remaining);
    hardcoreIndicator.toggleAttribute('data-last-chance', remaining === 0);
}

// ==========================================================
//  HIGHLIGHT ANSWERS
// ==========================================================
function highlightAnswers(selectedId, question) {
    const cards = answersContainer.querySelectorAll('.answer-card');
    const correct = question.answers.find(a => a.is_correct);
    const isCorrect = correct?.id === selectedId;

    cards.forEach(card => {
        card.classList.add('disabled');
        card.tabIndex = -1;
        card.setAttribute('aria-disabled', 'true');
        card.style.pointerEvents = 'none';
        const aid = card.dataset.answerId;
        const outcome = aid === String(correct?.id) ? 'correct' : aid === String(selectedId) && !isCorrect ? 'wrong' : null;
        if (outcome) {
            card.classList.add(outcome);
            card.querySelector('.answer-key use').setAttribute('href', outcome === 'correct' ? '#quiz-icon-check' : '#quiz-icon-cross');
        }
    });

    testScreen.dataset.answerState = isCorrect ? 'correct' : 'wrong';

    btnSubmit.dataset.outcome = isCorrect ? 'correct' : 'wrong';
    submitLabel.textContent = btnNext.hidden ? 'Результаты' : 'Далее';
    submitIcon.setAttribute('href', btnNext.hidden ? '#quiz-icon-results' : '#quiz-icon-next');
    btnSubmit.disabled = false;
    btnNext.disabled = false;
    return isCorrect;
}

// ==========================================================
//  NAVIGATION
// ==========================================================
function nextQuestion() {
    if (failureTimer !== null || userAnswers[testOrder[currentIndex]] === undefined) return;
    if (currentIndex < testOrder.length - 1) { currentIndex++; renderQuestion(null, 1); }
    else finishTest();
}

function prevQuestion() {
    if (failureTimer !== null) return;
    if (currentIndex > 0) { currentIndex--; renderQuestion(null, -1); }
}

// ==========================================================
//  FINISH TEST
// ==========================================================
let resultErrors = [];

function finishTest(failed = false, restoringResult = false) {
    showScreen(resultScreen);
    document.getElementById('result-title').focus({ preventScroll: true });

    let correctCount = 0;
    let unansweredCount = 0;
    const errors = [];

    testOrder.forEach(qIdx => {
        const q = questions[qIdx];
        const aid = userAnswers[qIdx];
        if (aid === undefined) {
            unansweredCount += 1;
            return;
        }
        const correct = q.answers.find(a => a.is_correct);
        if (correct && correct.id === aid) correctCount++;
        else errors.push({
            questionText: q.question_text,
            userAnswer: q.answers.find(a => a.id === aid)?.text || 'Нет ответа',
            correctAnswer: correct ? correct.text : '?'
        });
    });

    const accuracy = (correctCount / testOrder.length) * 100;
    const pct = Math.round(accuracy);
    const wrongCount = errors.length;
    const flawless = correctCount === testOrder.length;
    const hardcoreReset = failed && orderMode === 'campaign' && runDifficulty === 'hardcore';
    const modeName = retryingErrors ? 'Работа над ошибками' : studyRun?.kind === 'daily' ? 'Задание дня' :
        studyRun?.kind === 'review' ? 'Повтор ошибок' : studyRun?.kind === 'bookmarks' ? 'Закладки' :
        orderMode === 'campaign' ? 'Кампания' : difficultyNames[runDifficulty];
    const resultScope = activeRange && !retryingErrors ? `${activeRange.start + 1}–${activeRange.end}` :
        `${testOrder.length} в попытке`;
    document.getElementById('result-context').textContent = `${modeName} · ${resultScope}`;
    if (!restoringResult && !studyRun && orderMode === 'campaign' && !retryingErrors) {
        const total = testData.questions.length;
        rateCampaignRange(activeRange ?? { start: 0, end: total, size: total }, failed ? -1 : accuracy);
    }
    let campaignCompleted = false;
    if (!restoringResult && !studyRun && orderMode === 'campaign' && !failed && !retryingErrors && unansweredCount === 0 && activeRange?.size === 5) {
        if (activeRange.start === getCampaignProgress(runDifficulty)) {
            setCampaignProgress(runDifficulty, activeRange.end);
            campaignCompleted = activeRange.end === testData.questions.length;
        }
        if (flawless && runDifficulty !== 'hardcore') {
            const stages = getCampaignPerfect(runDifficulty);
            stages.add(activeRange.start);
            saveCampaignPerfect(runDifficulty, stages);
        }
    }
    renderResultRanges(hardcoreReset);

    scoreMeter.dataset.tier = flawless ? 'flawless' : accuracy >= 80 ? 'high' : 'standard';
    resultScreen.dataset.verdict = failed ? 'failed' : flawless ? 'flawless' : accuracy >= 70 ? 'clear' : accuracy >= 50 ? 'caution' : 'danger';
    scoreMeterFill.style.setProperty('--score-width', `${accuracy}%`);

    let grade = 'Отлично! Так держать!', color = 'var(--green)';
    if (pct < 40) { grade = 'Нужно больше учить'; color = 'var(--red)'; }
    else if (pct < 60) { grade = 'Удовлетворительно. Повтори материал'; color = 'var(--amber)'; }
    else if (pct < 75) { grade = 'Хорошо! Ещё немного подучить'; color = 'var(--amber)'; }
    else if (pct < 90) { grade = 'Отлично! Почти идеально'; }
    if (failed) {
        grade = hardcoreReset ? 'Провал · прогресс хардкора сброшен' : 'Провал · лимит ошибок исчерпан';
        color = 'var(--red)';
    }

    const displayAccuracy = pct === 100 && !flawless
        ? accuracy.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
        : pct;
    scorePercentage.textContent = `${displayAccuracy}%`;
    scoreDetails.textContent = `Правильно: ${correctCount} из ${testOrder.length} · Ошибок: ${wrongCount}` +
        (unansweredCount ? ` · Без ответа: ${unansweredCount}` : '');
    const breakdown = document.getElementById('result-breakdown');
    for (const [name, amount] of [['correct', correctCount], ['wrong', wrongCount], ['skip', unansweredCount]]) {
        const segment = breakdown.querySelector(`[data-stat="${name}"]`);
        segment.style.flexGrow = String(amount);
        segment.hidden = amount === 0;
    }
    document.getElementById('errors-count').textContent = String(wrongCount);
    gradeText.textContent = grade;
    gradeText.style.color = color;
    scoreMeter.style.setProperty('--score-color', color);
    scoreAchievements.hidden = bestStreak === 0 && !flawless;
    scoreStreak.hidden = bestStreak === 0;
    scoreStreak.textContent = 'Лучшая серия ×' + bestStreak;
    scoreStreak.toggleAttribute('data-milestone', bestStreak >= streakMilestones[0]);
    scoreFlawless.hidden = !flawless;
    const completed = !failed && unansweredCount === 0;
    renderPersonalRecord(correctCount, completed, restoringResult, hardcoreReset);
    const studyResult = recordStudyResult(correctCount, wrongCount, completed, flawless, failed);
    const studyNote = document.getElementById('result-study-note');
    studyNote.textContent = studyResult.dailyPerfect ? 'Задание дня выполнено без ошибок.' :
        studyRun?.kind === 'daily' && !retryingErrors ? 'Задание дня завершено.' :
        studyRun?.kind === 'review' && !retryingErrors ? `На повторе верных ответов: ${correctCount} из ${testOrder.length}.` : '';
    if (studyResult.dailyStreak > 1) studyNote.textContent += ` Серия подряд: ${studyResult.dailyStreak}.`;
    studyNote.hidden = !studyNote.textContent;
    const pendingReview = reviewIndexes().length;
    btnResultReview.textContent = `К повтору в журнале: ${pendingReview}`;
    btnResultReview.hidden = pendingReview === 0;
    showNewAchievements(completed && !studyRun, flawless, campaignCompleted, studyResult, restoringResult);
    const petStart = activeRange?.start ?? 0;
    const petEnd = activeRange?.end ?? testData.questions.length;
    quizPet.record({
        block: !studyRun && !retryingErrors ? `${questionBankVersion}:${activeRange?.size ?? petEnd}:${petStart}:${petEnd}` : null,
        correct: correctCount, completed, attempt: attemptId, restoring: restoringResult,
    });
    saveAttempt('result', failed);

    resultErrors = errors;
    errorsSection.open = false;
    errorsSection.hidden = errors.length === 0;
    errorsTableBody.replaceChildren();
    btnRetryErrors.hidden = errors.length === 0;
}

errorsSection.addEventListener('toggle', () => {
    if (!errorsSection.open || errorsTableBody.rows.length) return;
    const rows = document.createDocumentFragment();
    for (const error of resultErrors) {
        const row = document.createElement('tr');
        row.setAttribute('role', 'row');
        row.innerHTML = `<td role="cell">${renderMarkdownWithMath(error.questionText)}</td>` +
            `<td role="cell"><span class="error-answer-label" aria-hidden="true">Твой ответ</span>${renderMarkdownWithMathInline(error.userAnswer)}</td>` +
            `<td role="cell"><span class="error-answer-label" aria-hidden="true">Верный ответ</span>${renderMarkdownWithMathInline(error.correctAnswer)}</td>`;
        rows.appendChild(row);
    }
    errorsTableBody.appendChild(rows);
    window.renderMathInElement?.(errorsTableBody, {
        delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
        ],
        throwOnError: false,
        strict: false,
    });
});

// ==========================================================
//  BUTTON LISTENERS
// ==========================================================
btnSubmit.addEventListener('click', () => {
    if (btnSubmit.dataset.outcome) nextQuestion();
    else submitAnswer();
});
btnNext.addEventListener('click', nextQuestion);
btnPrev.addEventListener('click', prevQuestion);
failureNotice.addEventListener('click', () => {
    if (failureTimer !== null) finishTest(true);
});

btnMenu.addEventListener('click', () => {
    if (failureTimer !== null) finishTest(true);
    saveMenuSettings();
    updateResumeButton();
    showScreen(welcomeScreen);
});
btnResume.addEventListener('click', () => {
    restoreAttempt();
    if (testScreen.classList.contains('active')) saveMenuSettings();
});

btnRestart.addEventListener('click', () => {
    if (studyRun) {
        initTest(testData, false, null, studyRun);
        return;
    }
    const total = testData.questions.length;
    const range = campaignRangeAvailable(activeRange?.start ?? null, activeRange?.end ?? total,
        activeRange?.size ?? total, total) ? activeRange : nextCampaignRange(total);
    initTest(testData, false, range);
});
btnRetryErrors.addEventListener('click', () => initTest(testData, true));

// ==========================================================
//  KEYBOARD SHORTCUTS
// ==========================================================
document.addEventListener('keydown', (e) => {
    if (!testScreen.classList.contains('active') || e.target.closest?.('.app-toolbar')) return;

    const key = e.key;
    if (failureTimer !== null) {
        if (e.target === failureNotice && (key === 'Enter' || key === ' ')) return;
        if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) e.preventDefault();
        return;
    }
    const qIndex = testOrder[currentIndex];
    const hasAnswered = userAnswers[qIndex] !== undefined;

    const focusedAnswer = e.target.closest?.('.answer-card');
    if (key === 'Enter' || key === ' ') {
        if (e.repeat) {
            e.preventDefault();
            return;
        }
        if (e.target.closest?.('button')) return;
        e.preventDefault();
        if (!hasAnswered && focusedAnswer && !focusedAnswer.classList.contains('selected')) focusedAnswer.click();
        else if (hasAnswered) nextQuestion();
        else submitAnswer();
    } else if (/^[1-9]$/.test(key) && !e.ctrlKey && !e.altKey && !e.metaKey && !hasAnswered) {
        const card = answersContainer.children[Number(key) - 1];
        if (card) {
            e.preventDefault();
            card.click();
        }
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        if (hasAnswered) return;

        const cards = Array.from(answersContainer.querySelectorAll('.answer-card'));
        if (!cards.length) return;

        const sel = cards.findIndex(c => c.classList.contains('selected'));
        let target;
        if (sel === -1) target = key === 'ArrowDown' ? 0 : cards.length - 1;
        else target = key === 'ArrowDown' ? (sel + 1) % cards.length : (sel - 1 + cards.length) % cards.length;

        cards[target].click();
        cards[target].focus({ preventScroll: true });
    } else if (key === 'ArrowLeft') {
        if (currentIndex > 0) prevQuestion();
    } else if (key === 'ArrowRight') {
        if (hasAnswered) nextQuestion();
    }
});


function renderResultRanges(hardcoreReset = false) {
    const section = document.getElementById('result-ranges');
    const next = document.getElementById('btn-next-range');
    const total = testData.questions.length;
    const campaignNext = orderMode === 'campaign' ? nextCampaignRange(total) : null;
    section.hidden = Boolean(studyRun) || (!activeRange && !hardcoreReset);
    if (section.hidden) return;
    const blockStart = hardcoreReset ? 0 : Math.floor(activeRange.start / 100) * 100;
    const blockEnd = Math.min(blockStart + 100, total);
    section.setAttribute('aria-label', `Диапазоны блока ${blockStart + 1}–${blockEnd}`);
    const picker = document.getElementById('result-range-buttons');
    picker.hidden = hardcoreReset;
    if (!hardcoreReset) setupRangeButtons(total, blockStart);

    if (orderMode === 'campaign') {
        next.hidden = !campaignNext || (!hardcoreReset && campaignNext.start === activeRange.start && !retryingErrors);
        const verb = hardcoreReset ? 'Начать заново' : 'Продолжить';
        next.textContent = campaignNext ? `${verb}: вопросы ${campaignNext.start + 1}–${campaignNext.end}` : '';
        next.onclick = campaignNext ? () => initTest(testData, false, campaignNext) : null;
        return;
    }

    const start = activeRange.end;
    const end = Math.min(start + activeRange.size, total);
    next.hidden = start >= end;
    next.textContent = `Далее: вопросы ${start + 1}–${end}`;
    next.onclick = () => initTest(testData, false, { start, end, size: activeRange.size });
}

const fullscreenButton = document.getElementById('btn-fullscreen');
const fullscreenStatus = document.getElementById('fullscreen-status');
if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
    fullscreenButton.hidden = false;
    fullscreenButton.addEventListener('click', async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
            fullscreenStatus.hidden = true;
        } catch {
            fullscreenStatus.textContent = 'Браузер не смог открыть полноэкранный режим.';
            fullscreenStatus.hidden = false;
        }
    });
    document.addEventListener('fullscreenchange', () => {
        const fullscreen = Boolean(document.fullscreenElement);
        const label = fullscreen ? 'Выйти из полного экрана' : 'Во весь экран';
        fullscreenButton.title = label;
        fullscreenButton.setAttribute('aria-label', label);
        fullscreenButton.querySelector('[data-fullscreen-enter]').toggleAttribute('hidden', fullscreen);
        fullscreenButton.querySelector('[data-fullscreen-exit]').toggleAttribute('hidden', !fullscreen);
    });
}

function fitWelcomeScreen() {
    if (!welcomeScreen.classList.contains('active') || !welcomeScreen.offsetHeight) return;

    const app = welcomeScreen.parentElement;
    const viewport = window.visualViewport;
    const viewportBottom = viewport?.scale === 1 ? viewport.offsetTop + viewport.height : document.documentElement.clientHeight;
    const paddingBottom = parseFloat(getComputedStyle(app).paddingBottom);
    const bottom = Math.min(viewportBottom, app.getBoundingClientRect().bottom);
    const availableHeight = bottom - welcomeScreen.getBoundingClientRect().top - paddingBottom;
    const scale = Math.min(1, Math.max(1, availableHeight) / welcomeScreen.offsetHeight);
    welcomeScreen.style.setProperty('--screen-scale', String(scale));
}

function fitFullscreenQuiz() {
    if (!document.fullscreenElement) return;
    // Use only viewport height so questions never change the scale.
    const { clientWidth, clientHeight } = document.documentElement;
    const referenceHeight = clientWidth > clientHeight ? 410 : 580;
    const scale = Math.min(1, Math.max(0.65, clientHeight / referenceHeight));
    testScreen.style.setProperty('--quiz-zoom', String(scale));
}

const screenFitObserver = new ResizeObserver(fitWelcomeScreen);
for (const element of [welcomeScreen, document.querySelector('.app-toolbar'), fullscreenStatus]) {
    screenFitObserver.observe(element);
}
window.addEventListener('resize', fitWelcomeScreen);
window.addEventListener('resize', fitFullscreenQuiz);
window.visualViewport?.addEventListener('resize', fitWelcomeScreen);
document.addEventListener('fullscreenchange', fitWelcomeScreen);
document.addEventListener('fullscreenchange', fitFullscreenQuiz);

testDataReady.then(() => { if (testData) openSavedMenu(); });
