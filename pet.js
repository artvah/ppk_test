function createQuizPet(storageKey, achievements, achievementCatalog, playSound) {
    const catalog = [
        { id: 'cap', name: 'Синяя кепка', slot: 'hat', price: 5 },
        { id: 'mint', name: 'Мятный корпус', slot: 'shell', price: 18 },
        { id: 'amber', name: 'Янтарный экран', slot: 'glow', price: 45 },
        { id: 'graphite', name: 'Графитовый корпус', slot: 'shell', price: 90 },
        { id: 'violet', name: 'Сиреневый экран', slot: 'glow', price: 150 },
        { id: 'antenna', name: 'Антенна', slot: 'hat', achievement: 'study-daily-week' },
        { id: 'ivory', name: 'Корпус «Без помарок»', slot: 'shell', achievement: 'flawless' },
        { id: 'crown', name: 'Золотая корона', slot: 'hat', achievement: 'hardcore-300' },
        { id: 'beanie', name: 'Вишнёвая шапка', slot: 'hat', price: 12 },
        { id: 'headphones', name: 'Студийные наушники', slot: 'hat', price: 38 },
        { id: 'star', name: 'Звезда серии', slot: 'hat', achievement: 'streak-25' },
        { id: 'peach', name: 'Персиковый корпус', slot: 'shell', price: 32 },
        { id: 'ice', name: 'Ледяной корпус', slot: 'shell', price: 68 },
        { id: 'ocean', name: 'Океанский экран', slot: 'glow', price: 24 },
        { id: 'rose', name: 'Розовый экран', slot: 'glow', price: 60 },
        { id: 'mono', name: 'Чёрно-белый экран', slot: 'glow', achievement: 'study-review-10' },
        { id: 'blueprint', name: 'Синий чертёж', slot: 'wallpaper', price: 10 },
        { id: 'sunset', name: 'Закат', slot: 'wallpaper', price: 26 },
        { id: 'river', name: 'Тихая заводь', slot: 'wallpaper', price: 38 },
        { id: 'night', name: 'Ночное небо', slot: 'wallpaper', price: 55 },
        { id: 'gold-grid', name: 'Золотая сетка', slot: 'wallpaper', achievement: 'study-daily-perfect' },
    ];
    const dialog = document.getElementById('pet-dialog');
    const desk = document.getElementById('pet-desk');
    const balance = document.getElementById('pet-disks');
    const items = document.getElementById('pet-items');
    const status = document.getElementById('pet-status');
    const reward = document.getElementById('pet-reward');
    const toggle = document.getElementById('btn-pet');
    const characterPicker = document.getElementById('pet-character');
    const characterSelect = document.getElementById('pet-character-select');
    const discovery = document.getElementById('pet-discovery');
    const polaroid = document.getElementById('pet-polaroid');
    const tabs = document.getElementById('pet-tabs');
    const settings = document.getElementById('pet-settings');
    const face = document.getElementById('pet-face');
    const faceSetting = face.closest('.pet-face-setting');
    const scanlines = document.getElementById('pet-scanlines');
    const motion = document.getElementById('pet-motion');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const slots = ['hat', 'shell', 'glow', 'wallpaper'];
    const skins = {
        classic: 'Классический',
        pirate: 'Пират',
        red: 'Мухомор',
        night: 'Ночной',
        wizard: 'Волшебник',
    };
    const defaults = { face: 'smile', scanlines: true, motion: true, character: 'mac', mushroomSkin: 'classic' };
    const plural = new Intl.PluralRules('ru');
    const disksLabel = count => ({ one: 'дискета', few: 'дискеты', many: 'дискет' })[plural.select(count)];
    let section = 'hat';
    let preview = null;
    let reactionTimer;
    let state = { disks: 0, best: {}, owned: [], equipped: {}, lastReward: null };

    try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        const disks = saved?.disks ?? saved?.coins;
        if (Number.isSafeInteger(disks) && disks >= 0 && saved.best && Array.isArray(saved.owned) && saved.equipped) {
            state = { ...saved, disks };
            delete state.coins;
        }
    } catch { /* The pet is still available for this visit. */ }
    state.settings = { ...defaults, ...state.settings };
    if (!Object.hasOwn(skins, state.settings.mushroomSkin)) state.settings.mushroomSkin = 'classic';

    function save() {
        try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Keep changes for this visit. */ }
    }

    function available(item) {
        return item.achievement ? achievements.has(item.achievement) : state.owned.includes(item.id);
    }

    const mushroomUnlocked = () => achievements.has('study-secret');
    const isMushroom = () => mushroomUnlocked() && state.settings.character === 'mushroom';
    const equipmentSlot = slot => isMushroom() && slot === 'hat' ? 'mushroomHat' : slot;

    function renderDesk() {
        desk.dataset.character = isMushroom() ? 'mushroom' : 'mac';
        desk.dataset.skin = isMushroom() ? state.settings.mushroomSkin : 'classic';
        desk.setAttribute('aria-label', isMushroom() ? 'Поприветствовать Гриб' : 'Поприветствовать Макинтоша');
        for (const slot of slots) {
            const item = catalog.find(entry => entry.slot === slot && entry.id === state.equipped[equipmentSlot(slot)]);
            if (preview?.slot === slot) desk.dataset[slot] = preview.id;
            else if (item && available(item)) desk.dataset[slot] = item.id;
            else delete desk.dataset[slot];
        }
        desk.dataset.face = state.settings.face;
        desk.toggleAttribute('data-scanlines', state.settings.scanlines);
        desk.toggleAttribute('data-motion', state.settings.motion);
    }

    function render() {
        balance.textContent = String(state.disks);
        toggle.title = `Макинтош · дискеты: ${state.disks}`;
        characterPicker.hidden = !mushroomUnlocked();
        updateSelect(characterSelect, isMushroom() ? 'mushroom' : 'mac');
        renderDesk();
        for (const button of tabs.querySelectorAll('button')) {
            button.hidden = isMushroom() && ['shell', 'glow'].includes(button.dataset.section);
            button.setAttribute('aria-pressed', String(button.dataset.section === section));
        }
        settings.hidden = section !== 'settings';
        items.hidden = !settings.hidden;
        updateSelect(face, state.settings.face);
        scanlines.checked = state.settings.scanlines;
        motion.checked = state.settings.motion;
        faceSetting.hidden = scanlines.closest('label').hidden = isMushroom();
        if (settings.hidden || faceSetting.hidden) face.open = false;
        if (items.hidden) return;
        const sectionItems = catalog.filter(item => item.slot === section).sort((a, b) =>
            (a.price ?? Infinity) - (b.price ?? Infinity));
        items.replaceChildren(...sectionItems.map(item => {
            const row = document.createElement('li');
            const name = document.createElement('strong');
            const info = document.createElement('small');
            const label = document.createElement('div');
            const actions = document.createElement('div');
            const tryOn = document.createElement('button');
            const button = document.createElement('button');
            const owned = available(item);
            const slot = equipmentSlot(item.slot);
            const equipped = owned && state.equipped[slot] === item.id;
            name.textContent = item.name;
            info.textContent = item.achievement
                ? `За «${achievementCatalog.find(entry => entry.id === item.achievement).title}»`
                : owned ? 'Куплено' : `${item.price} ${disksLabel(item.price)}`;
            label.append(name, info);
            actions.className = 'pet-item-actions';
            tryOn.type = 'button';
            tryOn.className = 'range-button pet-try';
            tryOn.textContent = 'Примерить';
            tryOn.setAttribute('aria-label', `Примерить: ${item.name}`);
            tryOn.setAttribute('aria-pressed', String(preview === item));
            tryOn.onclick = () => {
                preview = preview === item ? null : item;
                status.textContent = preview ? `Примерка: ${item.name}` : '';
                for (const control of items.querySelectorAll('.pet-try')) {
                    control.setAttribute('aria-pressed', String(control === tryOn && preview !== null));
                }
                renderDesk();
            };
            button.type = 'button';
            button.className = 'range-button';
            button.textContent = owned ? (equipped ? 'Снять' : 'Надеть') : item.achievement ? 'Закрыто' : 'Купить';
            button.setAttribute('aria-label', `${item.name} · ${button.textContent}`);
            button.disabled = !owned && (Boolean(item.achievement) || state.disks < item.price);
            row.toggleAttribute('data-rare', Boolean(item.achievement));
            row.toggleAttribute('data-equipped', equipped);
            button.onclick = () => {
                if (!available(item)) {
                    if (item.achievement || state.disks < item.price) return;
                    state.disks -= item.price;
                    state.owned.push(item.id);
                }
                if (equipped) delete state.equipped[slot];
                else state.equipped[slot] = item.id;
                preview = null;
                save();
                status.textContent = equipped ? `Снято: ${item.name}` : `Надето: ${item.name}`;
                render();
                items.querySelector(`[data-item="${item.id}"]`)?.focus();
                if (!equipped) playSound('badge');
            };
            button.dataset.item = item.id;
            actions.append(tryOn, button);
            row.append(label, actions);
            return row;
        }));
    }

    tabs.addEventListener('click', event => {
        const button = event.target.closest('button[data-section]');
        if (!button || button.dataset.section === section) return;
        section = button.dataset.section;
        preview = null;
        status.textContent = '';
        render();
    });

    settings.addEventListener('change', () => {
        Object.assign(state.settings, { scanlines: scanlines.checked, motion: motion.checked });
        if (!state.settings.motion) endReaction();
        save();
        renderDesk();
    });

    function updateSelect(select, value) {
        const options = Array.from(select.querySelectorAll('button[data-value]'));
        const selected = options.find(option => option.dataset.value === value) ?? options[0];
        select.dataset.value = selected.dataset.value;
        select.querySelector('summary span').textContent = selected.textContent;
        for (const option of options) option.setAttribute('aria-pressed', String(option === selected));
    }

    function bindSelect(select, onSelect) {
        const summary = select.querySelector('summary');
        select.addEventListener('click', event => {
            const option = event.target.closest('button[data-value]');
            if (!option) return;
            select.open = false;
            onSelect(option.dataset.value);
            summary.focus();
        });
        select.addEventListener('keydown', event => {
            if (!select.open || event.key !== 'Escape') return;
            event.preventDefault();
            select.open = false;
            summary.focus();
        });
        select.addEventListener('focusout', event => {
            if (event.relatedTarget && !select.contains(event.relatedTarget)) select.open = false;
        });
    }

    dialog.addEventListener('click', event => {
        for (const select of [characterSelect, face]) {
            if (!select.contains(event.target)) select.open = false;
        }
    });

    bindSelect(face, value => {
        state.settings.face = value;
        updateSelect(face, value);
        save();
        renderDesk();
    });

    bindSelect(characterSelect, value => {
        if (!mushroomUnlocked()) return;
        state.settings.character = value;
        if (isMushroom() && ['shell', 'glow'].includes(section)) section = 'hat';
        preview = null;
        status.textContent = '';
        endReaction();
        save();
        render();
    });

    function endReaction() {
        clearTimeout(reactionTimer);
        delete desk.dataset.reaction;
    }

    function react(kind, message) {
        endReaction();
        // Restart the same animation when the mascot is tapped again.
        if (state.settings.motion && !reducedMotion.matches) {
            desk.getBoundingClientRect();
            desk.dataset.reaction = kind;
            reactionTimer = setTimeout(endReaction, 420);
        }
        status.textContent = message;
    }

    desk.addEventListener('click', () => {
        if (isMushroom() && Math.random() < .35) {
            const otherSkins = Object.keys(skins).filter(skin => skin !== state.settings.mushroomSkin);
            const nextSkin = otherSkins[Math.floor(Math.random() * otherSkins.length)];
            state.settings.mushroomSkin = nextSkin;
            save();
            renderDesk();
            react('change-skin', `Облик гриба: ${skins[nextSkin]}`);
            return;
        }
        react('hello', isMushroom() ? 'Гриб молча подпрыгнул.' : 'Бип! Макинтош здоровается.');
    });

    dialog.addEventListener('close', () => {
        if (!dialog.open) {
            characterSelect.open = face.open = false;
            endReaction();
        }
    });

    function open() {
        endReaction();
        preview = null;
        status.textContent = '';
        render();
        dialog.showModal();
    }

    toggle.addEventListener('click', open);
    reward.addEventListener('click', open);

    polaroid.addEventListener('click', async () => {
        if (!discovery.open || discovery.hasAttribute('data-collecting')) return;
        const startTransform = getComputedStyle(polaroid).transform;
        const from = polaroid.getBoundingClientRect();
        discovery.setAttribute('data-collecting', '');
        if (state.settings.motion && !reducedMotion.matches && !toggle.hidden) {
            const to = toggle.getBoundingClientRect();
            const x = to.left + to.width / 2 - (from.left + from.width / 2);
            const y = to.top + to.height / 2 - (from.top + from.height / 2);
            const flight = polaroid.animate([
                { transform: startTransform },
                { transform: `translate(${x}px, ${y}px) scale(.12) rotate(20deg)`, opacity: .2 },
            ], { duration: 470, easing: 'cubic-bezier(.45,.03,.95,.62)', fill: 'forwards' });
            await flight.finished.catch(() => {});
            if (discovery.open) discovery.close();
            flight.cancel();
            toggle.animate([{ scale: '1' }, { scale: '1.23' }, { scale: '1' }], { duration: 220 });
        } else discovery.close();
        toggle.focus({ preventScroll: true });
        playSound('badge');
    });
    render();

    return {
        reset(full = false) {
            state = { disks: 0, best: {}, owned: [], equipped: {}, lastReward: null,
                settings: full ? { ...defaults } : state.settings };
            preview = null;
            endReaction();
            reward.hidden = true;
            save();
            render();
        },
        discover() {
            if (discovery.open) return;
            discovery.toggleAttribute('data-static', !state.settings.motion);
            discovery.showModal();
            playSound('trophy');
        },
        setVisible(visible) { toggle.hidden = !visible; },
        record({ block, correct, completed, attempt, restoring }) {
            reward.hidden = true;
            if (!block || !completed) return;
            const previous = state.best[block] ?? 0;
            const gain = restoring ? (state.lastReward?.attempt === attempt ? state.lastReward.gain : 0)
                : Math.max(0, correct - previous);
            if (gain > 0 && !restoring) {
                state.best[block] = correct;
                state.disks += gain;
                state.lastReward = { attempt, gain };
                save();
                render();
                playSound('badge');
            }
            if (gain > 0) {
                reward.textContent = `Макинтош · +${gain} ${disksLabel(gain)}`;
                reward.hidden = false;
            }
        },
    };
}
