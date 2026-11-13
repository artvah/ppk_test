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
const difficultyHint = document.getElementById('difficulty-hint');
const failureNotice = document.getElementById('run-failure');

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
const btnNext = document.getElementById('btn-next');
const btnMenu = document.getElementById('btn-menu');
const btnAchievements = document.getElementById('btn-achievements');
const achievementDialog = document.getElementById('achievement-dialog');
const btnStudy = document.getElementById('btn-study');
const studyDialog = document.getElementById('study-dialog');
const btnStudyReview = document.getElementById('btn-study-review');
const btnStudyReviewAll = document.getElementById('btn-study-review-all');
const btnStudyDaily = document.getElementById('btn-study-daily');

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
const studyStorageKey = 'ppk-test-study-v1';
const copyableText = '#test-screen .question-text, #test-screen .answer-text-label, #errors-table tbody td';
let questionBankVersion;

document.addEventListener('copy', event => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    for (let i = 0; i < selection.rangeCount; i++) {
        const ancestor = selection.getRangeAt(i).commonAncestorContainer;
        const element = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentElement;
        if (!element?.closest(copyableText)) {
            event.preventDefault();
            return;
        }
    }
});

function saveAttempt(screen = 'test', failed = false) {
    try {
        localStorage.setItem(sessionStorageKey, JSON.stringify({
            bank: questionBankVersion, screen, failed, orderMode, difficulty, runDifficulty, activeRange,
            testOrder, currentIndex, answerShuffleMap, userAnswers, selectedAnswerId,
            health, correctStreak, bestStreak, retryingErrors, studyRun, attemptId, unlocks: runUnlocks.map(item => item.id),
        }));
    } catch {
        // The test still works when browser storage is unavailable.
    }
}

function restoreAttempt() {
    let saved;
    try {
        saved = JSON.parse(localStorage.getItem(sessionStorageKey));
    } catch {
        return;
    }
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
    studyRun = ['review', 'daily'].includes(saved.studyRun?.kind) ? saved.studyRun : null;
    attemptId = typeof saved.attemptId === 'string' ? saved.attemptId : null;
    runUnlocks = Array.isArray(saved.unlocks) ? saved.unlocks
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
    'last-hp': '<rect x="2" y="7" width="19" height="10"/><path d="M21 10h1v4h-1M12 7l-3 5h4l-3 5"/><path d="M5 10v4" stroke-width="2.5"/>',
    flawless: '<path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/><path d="m9 12 2 2 4-4"/>',
    comeback: '<path d="M8 5L3 10l5 5M3 10h12a5 5 0 0 1 0 10h-4"/><path d="M15 10V4h5v6"/>',
    streak: '<path d="M3 17h4v4H3zm7-5h4v9h-4zm7-6h4v15h-4zM3 12l6-5 4 1 7-6"/>',
    campaign: '<path d="M4 22V3m1 1h13l-3 4 3 4H5M2 22h7"/><path d="M8 7h1m2 0h1m2 0h1"/>',
    standard: '<path d="M5 3h14v14H5zM8 7h8M8 10h8m-7 7-2 5 5-2 5 2-2-5"/>',
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
let runUnlocks = [];

function loadStudyData() {
    try {
        const data = JSON.parse(localStorage.getItem(studyStorageKey));
        if (data && Array.isArray(data.mistakes) && Array.isArray(data.fixed) && Array.isArray(data.history) &&
            Array.isArray(data.daily)) return data;
    } catch {
        // Study data is optional when browser storage is unavailable.
    }
    return { mistakes: [], fixed: [], history: [], daily: [] };
}

const studyData = loadStudyData();

function saveStudyData() {
    try {
        localStorage.setItem(studyStorageKey, JSON.stringify(studyData));
    } catch {
        // Keep the current journal available until the page closes.
    }
}

function studyQuestionKey(question, index) {
    return question.id == null ? `${questionBankVersion}:${index}` : String(question.id);
}

function reviewIndexes() {
    const pending = new Set(studyData.mistakes);
    return testData.questions.flatMap((question, index) => pending.has(studyQuestionKey(question, index)) ? [index] : []);
}

function localStudyDay() {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(value => String(value).padStart(2, '0')).join('-');
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

function startStudy(kind, all = false) {
    const day = kind === 'daily' ? localStudyDay() : null;
    let indexes = kind === 'daily' ? dailyIndexes(day) : reviewIndexes();
    if (kind === 'review' && !all) indexes = indexes.slice(0, 10);
    if (!indexes.length || (kind === 'daily' && studyData.daily.includes(day))) return;
    studyDialog.close();
    initTest(testData, false, null, { kind, day, indexes });
}

function recordStudyAnswer(questionIndex, correct) {
    const index = (activeRange?.start ?? 0) + questionIndex;
    const key = studyQuestionKey(questions[questionIndex], index);
    if (!correct && !studyData.mistakes.includes(key)) studyData.mistakes.push(key);
    if (correct && studyRun?.kind === 'review' && studyData.mistakes.includes(key)) {
        studyData.mistakes = studyData.mistakes.filter(item => item !== key);
        if (!studyData.fixed.includes(key)) studyData.fixed.push(key);
    }
    saveStudyData();
}

function recordStudyResult(correct, errors, completed, flawless, failed) {
    const dailyFinished = studyRun?.kind === 'daily' && !retryingErrors && completed;
    const dailyPerfect = dailyFinished && flawless;
    if (dailyFinished && !studyData.daily.includes(studyRun.day)) {
        studyData.daily = [...studyData.daily, studyRun.day].slice(-31);
    }
    if (attemptId && !studyData.history.some(entry => entry.id === attemptId)) {
        studyData.history.unshift({ id: attemptId, time: Date.now(), kind: studyRun?.kind ?? (retryingErrors ? 'retry' : orderMode),
            difficulty: runDifficulty, correct, errors, total: testOrder.length, failed });
        studyData.history.length = Math.min(studyData.history.length, 16);
    }
    saveStudyData();
    return { dailyPerfect, fixed: studyData.fixed.length };
}

function showStudyDialog() {
    if (!testData) return;
    const pending = reviewIndexes().length;
    document.getElementById('study-review-note').textContent = pending
        ? `К повтору: ${pending}. Верный ответ убирает вопрос из списка.` : 'Пока нет вопросов для повтора.';
    btnStudyReview.disabled = btnStudyReviewAll.disabled = pending === 0;
    const dailyDone = studyData.daily.includes(localStudyDay());
    btnStudyDaily.disabled = dailyDone;
    document.getElementById('study-daily-note').textContent = dailyDone
        ? 'На сегодня выполнено. Новый набор появится завтра.' : 'Пять вопросов на сегодня. Без ошибок — отдельная награда.';
    const list = document.getElementById('study-history-list');
    const names = { daily: 'Задание дня', review: 'Повтор ошибок', retry: 'Работа над ошибками', campaign: 'Кампания', random: 'Случайный порядок', sequential: 'Последовательный порядок' };
    const difficultyNames = Object.fromEntries(Array.from(difficultyOptions, option => [option.dataset.difficulty, option.textContent]));
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
        title.textContent = titleDifficulty && !['review', 'daily'].includes(entry.kind) ? `${kind} · ${titleDifficulty}` : kind;
        detail.textContent = `${new Date(entry.time).toLocaleDateString('ru-RU')} · ${entry.correct}/${entry.total}` +
            (entry.failed ? ' · Провал' : ` · Ошибок: ${entry.errors}`);
        meter.max = entry.total;
        meter.value = entry.correct;
        meter.setAttribute('aria-hidden', 'true');
        row.dataset.failed = String(entry.failed);
        row.append(title, detail, meter);
        return row;
    }));
    studyDialog.showModal();
}

btnStudy.addEventListener('click', showStudyDialog);
btnStudyReview.addEventListener('click', () => startStudy('review'));
btnStudyReviewAll.addEventListener('click', () => startStudy('review', true));
btnStudyDaily.addEventListener('click', () => startStudy('daily'));

let serviceClicks = 0;
document.querySelector('.welcome-titlebar').addEventListener('click', () => {
    serviceClicks += 1;
    if (serviceClicks !== 5) return;
    serviceClicks = 0;
    const enabled = document.body.toggleAttribute('data-service-mode');
    if (!enabled) return;
    unlockAchievements(achievementCatalog.filter(item => item.id === 'study-secret'));
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
        const variant = item.icon || 'standard';
        icon.className = 'achievement-emblem';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${achievementIcons[item.campaign ? 'campaign' : variant]}</svg>`;
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

function showNewAchievements(completed, flawless, campaignCompleted, studyResult) {
    const panel = document.getElementById('new-achievements');
    const run = { total: testOrder.length, difficulty: runDifficulty, streak: bestStreak,
        finalStreak: correctStreak, health, completed, flawless, campaignCompleted, ...studyResult };
    unlockAchievements(achievementCatalog.filter(item =>
        (item.campaign || item.live || item.study || run.total >= 50) && item.earned(run)));
    panel.hidden = runUnlocks.length === 0;
    if (panel.hidden) return;

    renderAchievementList('new-achievement-list', [...runUnlocks].reverse());
}

btnAchievements.addEventListener('click', () => {
    document.getElementById('achievement-progress').textContent =
        `Открыто ${unlockedAchievements.size} из ${achievementCatalog.length}`;
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
const campaignProgressByDifficulty = new Map();
const campaignPerfectByDifficulty = new Map();

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

function setupRangeButtons(total, resultBlock = null) {
    const onResults = resultBlock !== null;
    const host = document.getElementById(onResults ? 'result-range-buttons' : 'range-buttons');
    const selection = document.getElementById('range-select');
    const summary = document.getElementById('range-summary');
    const sizes = [5, 10, 25, 50];
    const campaign = orderMode === 'campaign';
    const storageKey = 'ppk-test-range';
    const label = (start, end) => `${start + 1}–${end}`;
    let hundred = resultBlock;
    let fifty = onResults ? Math.floor(activeRange.start / 50) * 50 : null;
    let size = onResults ? Math.min(activeRange.size, 50) : 5;
    let part = onResults && size < 50 ? activeRange.start : null;

    if (campaign && !onResults) {
        const next = nextCampaignRange(total);
        if (next) {
            hundred = Math.floor(next.start / 100) * 100;
            fifty = Math.floor(next.start / 50) * 50;
            part = next.start;
        }
    } else if (!onResults) {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey));
            if (saved && sizes.includes(saved.size)) {
                size = saved.size;
                if (Number.isInteger(saved.hundred) && saved.hundred >= 0 &&
                    saved.hundred < total && saved.hundred % 100 === 0) {
                    hundred = saved.hundred;
                    if ((saved.fifty === hundred || saved.fifty === hundred + 50) && saved.fifty < total) {
                        fifty = saved.fifty;
                        if (Number.isInteger(saved.part) && saved.part >= fifty &&
                            saved.part < Math.min(fifty + 50, total) && (saved.part - fifty) % size === 0) {
                            part = saved.part;
                        }
                    }
                }
            }
        } catch {
            // The selector still works when storage is unavailable.
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
                delete button.dataset.completion;
                button.removeAttribute('aria-label');
                if (!entry) {
                    button.textContent = '';
                    button.removeAttribute('aria-pressed');
                    button.onclick = null;
                    return;
                }
                const [text, active, action, locked = false, completion] = entry;
                button.disabled = locked;
                button.toggleAttribute('data-locked', locked);
                button.title = locked ? 'Откроется по мере прохождения' : '';
                if (completion && !locked) {
                    button.dataset.completion = completion;
                    button.title = { clear: 'Пройдено', perfect: 'Без ошибок', hardcore: 'Пройдено на хардкоре' }[completion];
                    button.setAttribute('aria-label', `${text} · ${button.title}`);
                }
                if (button.textContent !== text) button.textContent = text;
                button.setAttribute('aria-pressed', String(active));
                button.onclick = () => {
                    action();
                    render();
                    if (!onResults && !campaign) {
                        try {
                            localStorage.setItem(storageKey, JSON.stringify({ hundred, fifty, size, part }));
                        } catch {
                            // Keep the selection in memory for this page.
                        }
                    }
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
        function completion(start, end) {
            if (!campaign || end > campaignProgress) return;
            if (difficulty === 'hardcore') return 'hardcore';
            return blocks(start, end, 5).every(([stage]) => perfectStages.has(stage)) ? 'perfect' : 'clear';
        }
        const shownHundred = hundred ?? 0;
        const shownFifty = fifty ?? shownHundred;
        const hundredEnd = Math.min(shownHundred + 100, total);
        const fiftyEnd = Math.min(shownFifty + 50, total);

        updateHundreds?.([
            ['Все вопросы', hundred === null, () => { hundred = null; fifty = null; part = null; },
                !campaignRangeAvailable(null, total, total, total), completion(0, total)],
            ...hundreds.map(([start, end]) => [label(start, end), hundred === start, () => {
                hundred = start;
                fifty = null;
                part = null;
            }, campaign && start > campaignProgress, completion(start, end)]),
        ]);
        updateHalves(blocks(shownHundred, hundredEnd, 50).map(([start, end]) => [
            label(start, end), fifty === start, () => {
                hundred = shownHundred;
                fifty = start;
                part = null;
            }, campaign && start > campaignProgress, completion(start, end),
        ]));
        updateSizes(sizes.map(value => ['По ' + value, size === value, () => {
            hundred = shownHundred;
            fifty = shownFifty;
            size = value;
            part = shownFifty;
        }, campaign && !blocks(shownFifty, fiftyEnd, value).some(([start, end]) =>
            campaignRangeAvailable(start, end, value, total))]));
        updateParts(blocks(shownFifty, fiftyEnd, size).map(([start, end]) => [
            label(start, end), part === start, () => {
                hundred = shownHundred;
                fifty = shownFifty;
                part = start;
            }, !campaignRangeAvailable(start, end, size, total), completion(start, end),
        ]));

        const start = part ?? fifty ?? hundred;
        const count = part !== null ? size : fifty !== null ? 50 : 100;
        const end = start === null ? total : Math.min(start + count, total);
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
        if (campaign) summary.textContent = `Пройдено: ${campaignProgress} из ${total} · ` +
            (available ? (start === null ? 'Все вопросы' : 'Выбрано ' + label(start, end)) : 'Диапазон ещё закрыт');
    }

    if (!onResults) document.getElementById('range-selector-container').style.display = total > 5 ? 'flex' : 'none';
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
    if (testData) setupRangeButtons(testData.questions.length);
});

function updateOrderLabel() {
    const labels = { random: 'Случайный порядок', sequential: 'Последовательный порядок', campaign: 'Режим прохождения' };
    btnQuestionOrder.textContent = labels[orderMode];
    btnQuestionOrder.dataset.mode = orderMode;
}

for (const option of difficultyOptions) {
    option.addEventListener('click', () => {
        difficulty = option.dataset.difficulty;
        updateDifficultyMenu();
        if (testData && orderMode === 'campaign') setupRangeButtons(testData.questions.length);
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

document.addEventListener('click', event => {
    if (difficultyMenu.open && !difficultyMenu.contains(event.target)) difficultyMenu.open = false;
});

function updateDifficultyHint() {
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
        testOrder = orderMode === 'random' ? shuffleArray(errorIndexes) : errorIndexes.sort((a, b) => a - b);
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
        questions = activeRange ? data.questions.slice(activeRange.start, activeRange.end) : data.questions;
        const indexes = Array.from({ length: questions.length }, (_, i) => i);
        testOrder = orderMode === 'random' ? shuffleArray(indexes) : indexes;
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
    document.body.toggleAttribute('data-hardcore', (screen === welcomeScreen ? difficulty : runDifficulty) === 'hardcore');
    difficultyMenu.open = false;
    clearTimeout(failureTimer);
    failureTimer = null;
    failureNotice.hidden = true;
    [welcomeScreen, testScreen, resultScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
    if (screen === welcomeScreen && orderMode === 'campaign') setupRangeButtons(testData.questions.length);
    btnMenu.hidden = screen === welcomeScreen;
    btnAchievements.hidden = screen === testScreen;
    btnStudy.hidden = screen === testScreen;
    testScreen.toggleAttribute('data-training', Boolean(studyRun));
    window.scrollTo(0, 0);
    if (screen === welcomeScreen) fitWelcomeScreen();
}

// ==========================================================
//  RENDER QUESTION
// ==========================================================
function renderQuestion(draftAnswer = null) {
    const qIndex = testOrder[currentIndex];
    const question = questions[qIndex];

    answersContainer.innerHTML = '';
    questionImages.innerHTML = '';
    selectedAnswerId = null;
    delete testScreen.dataset.answerState;
    delete testScreen.dataset.reaction;
    answerReaction.hidden = true;
    answerReaction.textContent = '';
    delete answerReaction.dataset.milestone;
    btnSubmit.textContent = 'Ответить';
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

    shuffled.forEach(ansIdx => {
        const answer = question.answers[ansIdx];
        const card = document.createElement('div');
        card.className = 'answer-card';
        card.tabIndex = 0;
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
                <div class="custom-radio"><div class="custom-radio-inner"></div></div>
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
            selectedAnswerId = draftAnswer;
            btnSubmit.disabled = false;
        }
    }
    saveAttempt();

    testScreen.parentElement.scrollTop = 0;
    testScreen.focus({ preventScroll: true });
    if (!reducedMotion.matches) {
        for (const panel of [questionText.parentElement, answersContainer]) {
            panel.animate([{ opacity: 0.58 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
        }
    }
}

// ==========================================================
//  SELECT ANSWER
// ==========================================================
function selectAnswer(cardEl, answerId) {
    if (userAnswers[testOrder[currentIndex]] !== undefined) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && cardEl.contains(selection.anchorNode)) return;

    answersContainer.querySelectorAll('.answer-card').forEach(c => c.classList.remove('selected'));
    cardEl.classList.add('selected');

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
    if (!selectedAnswerId || userAnswers[qIndex] !== undefined) return;
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
    if (!isCorrect && testOrder.length - health >= errorLimit()) failRun();
    else saveAttempt();
}

function failRun() {
    if (orderMode === 'campaign' && runDifficulty === 'hardcore') {
        setCampaignProgress(runDifficulty, 0);
        saveCampaignPerfect(runDifficulty, new Set());
    }
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
    hardcoreIndicator.hidden = runDifficulty !== 'hardcore';
    const mistakes = testOrder.length - health;
    hardcoreIndicator.textContent = mistakes === 0 ? 'ХАРДКОР · 1 шанс' : 'ХАРДКОР · 0 шансов';
    hardcoreIndicator.toggleAttribute('data-last-chance', mistakes > 0);
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
        card.style.pointerEvents = 'none';
        const aid = card.dataset.answerId;
        if (aid === correct?.id) card.classList.add('correct');
        else if (aid === selectedId && !isCorrect) card.classList.add('wrong');
    });

    testScreen.dataset.answerState = isCorrect ? 'correct' : 'wrong';

    btnSubmit.dataset.outcome = isCorrect ? 'correct' : 'wrong';
    btnSubmit.textContent = btnNext.hidden ? 'Результаты' : 'Далее';
    btnSubmit.disabled = false;
    btnNext.disabled = false;
    return isCorrect;
}

// ==========================================================
//  NAVIGATION
// ==========================================================
function nextQuestion() {
    if (currentIndex < testOrder.length - 1) { currentIndex++; renderQuestion(); }
    else finishTest();
}

function prevQuestion() {
    if (currentIndex > 0) { currentIndex--; renderQuestion(); }
}

// ==========================================================
//  FINISH TEST
// ==========================================================
function finishTest(failed = false, restoringResult = false) {
    showScreen(resultScreen);

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
    gradeText.textContent = grade;
    gradeText.style.color = color;
    scoreMeter.style.setProperty('--score-color', color);
    scoreAchievements.hidden = bestStreak === 0 && !flawless;
    scoreStreak.hidden = bestStreak === 0;
    scoreStreak.textContent = 'Лучшая серия ×' + bestStreak;
    scoreStreak.toggleAttribute('data-milestone', bestStreak >= streakMilestones[0]);
    scoreFlawless.hidden = !flawless;
    const completed = !failed && unansweredCount === 0;
    const studyResult = recordStudyResult(correctCount, wrongCount, completed, flawless, failed);
    const studyNote = document.getElementById('result-study-note');
    studyNote.textContent = studyResult.dailyPerfect ? 'Задание дня выполнено без ошибок.' :
        studyRun?.kind === 'daily' && !retryingErrors ? 'Задание дня завершено.' :
        studyRun?.kind === 'review' ? `На повторе верных ответов: ${correctCount} из ${testOrder.length}.` :
        wrongCount ? `Ошибки сохранены. Их можно повторить в журнале подготовки.` : '';
    studyNote.hidden = !studyNote.textContent;
    showNewAchievements(completed && !studyRun, flawless, campaignCompleted, studyResult);
    saveAttempt('result', failed);

    // Errors table
    errorsSection.open = false;
    errorsSection.hidden = errors.length === 0;
    errorsTableBody.innerHTML = '';
    if (errors.length > 0) {
        errors.forEach(e => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${renderMarkdownWithMath(e.questionText)}</td><td>${renderMarkdownWithMathInline(e.userAnswer)}</td><td>${renderMarkdownWithMathInline(e.correctAnswer)}</td>`;
            if (window.renderMathInElement) {
                renderMathInElement(row, {
                    delimiters: [
                        {left: "$$", right: "$$", display: true},
                        {left: "$", right: "$", display: false}
                    ],
                    throwOnError: false,
                    strict: false
                });
            }
            errorsTableBody.appendChild(row);
        });
        btnRetryErrors.style.display = 'flex';
    } else {
        btnRetryErrors.style.display = 'none';
    }
}

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
    btnResume.hidden = !testScreen.classList.contains('active') || failureTimer !== null;
    showScreen(welcomeScreen);
});
btnResume.addEventListener('click', restoreAttempt);

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

    if (key === 'Enter' || key === ' ') {
        if (e.target.closest?.('button')) return;
        e.preventDefault();
        if (hasAnswered) nextQuestion();
        else submitAnswer();
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        if (hasAnswered) return;

        const cards = Array.from(answersContainer.querySelectorAll('.answer-card'));
        if (!cards.length) return;

        const sel = cards.findIndex(c => c.classList.contains('selected'));
        let target;
        if (sel === -1) target = key === 'ArrowDown' ? 0 : cards.length - 1;
        else target = key === 'ArrowDown' ? (sel + 1) % cards.length : (sel - 1 + cards.length) % cards.length;

        selectAnswer(cards[target], cards[target].dataset.answerId);
        cards[target].focus();
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
    section.hidden = Boolean(studyRun) || !activeRange;
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
    const end = Math.min(start + activeRange.size, blockEnd);
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
    const viewportHeight = viewport?.scale === 1 ? viewport.height : app.clientHeight;
    const paddingBottom = parseFloat(getComputedStyle(app).paddingBottom);
    const availableHeight = Math.min(viewportHeight, app.clientHeight) - welcomeScreen.offsetTop - paddingBottom;
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

testDataReady.then(() => { if (testData) restoreAttempt(); });
