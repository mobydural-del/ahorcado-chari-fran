// Game State
const state = {
    p1Name: "CHARI",
    p2Name: "FRAN",
    wordForP2: "", // Word Chari sets for Fran
    wordForP1: "", // Word Fran sets for Chari
    setupPhase: 1,
    turn: 1, // 1 for Chari, 2 for Fran
    p1Mistakes: 0,
    p2Mistakes: 0,
    p1Guesses: [],
    p2Guesses: [],
    maxMistakes: 10,
    gameOver: false
};

// --- GAME LOGIC VARS ---
let turnTimer = null;
let timeLeft = 15;
let currentModifier = null; 
let isEventPlaying = false;

// --- AUDIO SYSTEM (Web Audio API) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
const buffers = {};

async function loadSFX() {
    const files = {
        'right': 'correcto.mp3',
        'wrong': 'error.mp3',
        'applause': 'pwlpl-applause-sound-effect-521104.mp3'
    };
    for (let key in files) {
        try {
            const response = await fetch(files[key]);
            const arrayBuffer = await response.arrayBuffer();
            audioCtx.decodeAudioData(arrayBuffer, (buffer) => {
                buffers[key] = buffer;
            });
        } catch (e) {
            console.error(`Failed to load ${files[key]}`, e);
        }
    }
}
const audioMenu = new Audio('Mainmenu.mp3');
audioMenu.loop = true;
audioMenu.volume = 0.5;
const audioGame = new Audio('Game.mp3');
audioGame.loop = true;
audioGame.volume = 0.5;
const audioWin = new Audio('Celebracion.mp3');
audioWin.volume = 0.6;

let sourceMenu = null;
let sourceGame = null;
let sourceWin = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
        loadSFX();
        
        // Connect BGM to WebAudio to avoid Audio Focus issues on Android
        sourceMenu = audioCtx.createMediaElementSource(audioMenu);
        sourceMenu.connect(audioCtx.destination);
        
        sourceGame = audioCtx.createMediaElementSource(audioGame);
        sourceGame.connect(audioCtx.destination);
        
        sourceWin = audioCtx.createMediaElementSource(audioWin);
        sourceWin.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playMusic(track) {
    audioMenu.pause();
    audioGame.pause();
    audioWin.pause();
    
    // We only play if user has interacted (initAudio context exists)
    if (!audioCtx) return;
    
    if (track === 'menu') {
        audioMenu.play().catch(e=>console.log(e));
    } else if (track === 'game') {
        audioGame.currentTime = 0;
        audioGame.play().catch(e=>console.log(e));
    } else if (track === 'win') {
        audioWin.currentTime = 0;
        audioWin.play().catch(e=>console.log(e));
    } else if (track === 'stop') {
        // Just pauses all
    }
}

function playSound(type) {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (buffers[type]) {
        const source = audioCtx.createBufferSource();
        source.buffer = buffers[type];
        
        const gain = audioCtx.createGain();
        gain.gain.value = type === 'applause' ? 0.8 : 1.0;
        
        source.connect(gain);
        gain.connect(audioCtx.destination);
        source.start(0);
    }
}

function playVictorySound() {
    if (!audioCtx) return;
    
    // Applause (white noise filter)
    const bufferSize = audioCtx.sampleRate * 4;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 1000;
    
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0, audioCtx.currentTime);
    noiseGain.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 1);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 4);
    
    noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(audioCtx.destination);
    noise.start();

    // Funk Bassline
    clearInterval(bgmInterval);
    const funkNotes = [130.81, 155.56, 174.61, 196.00]; 
    let index = 0;
    bgmInterval = setInterval(() => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(funkNotes[index], audioCtx.currentTime);
        const env = audioCtx.createGain();
        env.gain.setValueAtTime(0, audioCtx.currentTime);
        env.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
        env.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.connect(env); env.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.2);
        index = (index + 1) % funkNotes.length;
    }, 150);
}

// Helper to shake screen
function shakeScreen() {
    const app = document.getElementById('app');
    app.classList.remove('shake');
    void app.offsetWidth; // trigger reflow
    app.classList.add('shake');
    setTimeout(() => app.classList.remove('shake'), 500);
}

// Helper for floating damage text
function showFloatingText(text, color, x, y) {
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.innerText = text;
    el.style.color = color;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
}
// ------------------------------------

const letters = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");

// Elements
const screens = {
    intro: document.getElementById('screen-intro'),
    setup: document.getElementById('screen-setup'),
    game: document.getElementById('screen-game'),
    result: document.getElementById('screen-result')
};

// Flow
function switchScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

function startGame() {
    initAudio(); // Initialize audio context on first user interaction
    playMusic('menu');
    
    // Reset hangman drawings (hide parts 5-10 for both players)
    for (let p = 1; p <= 2; p++) {
        for (let i = 5; i <= 10; i++) {
            const part = document.getElementById(`p${p}-part-${i}`);
            if (part) part.classList.remove('drawn');
        }
    }
    
    state.setupPhase = 1;
    updateSetupScreen();
    switchScreen('setup');
}

function updateSetupScreen() {
    const title = document.getElementById('setup-title');
    const instruction = document.getElementById('setup-instruction');
    const input = document.getElementById('word-input');
    const error = document.getElementById('setup-error');
    
    input.value = "";
    error.innerText = "";
    
    if (state.setupPhase === 1) {
        title.innerText = `Turno de ${state.p1Name}`;
        title.style.color = "var(--chari-color)";
        instruction.innerText = `Escribe la palabra que ${state.p2Name} tendrá que adivinar.`;
    } else {
        title.innerText = `Turno de ${state.p2Name}`;
        title.style.color = "var(--fran-color)";
        instruction.innerText = `Escribe la palabra que ${state.p1Name} tendrá que adivinar.`;
    }
}

function togglePassword(show) {
    document.getElementById('word-input').type = show ? "text" : "password";
}

function submitWord() {
    const input = document.getElementById('word-input').value.trim().toUpperCase();
    const error = document.getElementById('setup-error');
    
    // Only letters (including Ñ and accents normalized)
    const normalized = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!/^[A-ZÑ]+$/.test(normalized) || normalized.length < 3 || normalized.length > 16) {
        error.innerText = "Usa solo letras (3 a 16). Sin espacios ni números.";
        return;
    }
    
    if (state.setupPhase === 1) {
        state.wordForP2 = normalized;
        state.setupPhase = 2;
        updateSetupScreen();
    } else {
        state.wordForP1 = normalized;
        initGame();
    }
}

function initGame() {
    state.p1Mistakes = 0;
    state.p2Mistakes = 0;
    state.p1Guesses = [];
    state.p2Guesses = [];
    state.turn = 1;
    state.gameOver = false;
    
    // Reset SVG parts
    document.querySelectorAll('.part').forEach(p => p.classList.remove('drawn'));
    
    // Reset faces
    setExpression(1, 'neutral', false);
    setExpression(2, 'neutral', false);
    
    renderWords();
    renderKeyboard();
    updateTurnUI();
    
    switchScreen('game');
    createParticleBurst(window.innerWidth/2, window.innerHeight/2, 100, '#00f0ff');
    
    playMusic('game');
    triggerRandomEvent();
}

function updateTimerUI() {
    const timerEl = document.getElementById('turn-timer');
    timerEl.innerText = timeLeft;
    if (timeLeft <= 5) {
        timerEl.classList.add('hurry');
        playSound('right'); // tick tick tick
    } else {
        timerEl.classList.remove('hurry');
    }
}

function startTurnTimer() {
    clearInterval(turnTimer);
    timeLeft = currentModifier === 'FAST' ? 5 : (currentModifier === 'SLOW' ? 30 : 15);
    updateTimerUI();
    
    turnTimer = setInterval(() => {
        if(state.gameOver || isEventPlaying) return;
        timeLeft--;
        updateTimerUI();
        if (timeLeft <= 0) {
            clearInterval(turnTimer);
            playSound('wrong');
            shakeScreen();
            applyMistake(state.turn);
            
            checkWinCondition();
            if (!state.gameOver) {
                nextTurn();
            }
        }
    }, 1000);
}

function triggerRandomEvent() {
    isEventPlaying = true;
    clearInterval(turnTimer);
    
    // 30% chance for an event
    if (Math.random() > 0.3) {
        currentModifier = null;
        isEventPlaying = false;
        startTurnTimer();
        return;
    }
    
    const events = [
        { type: 'FAST', icon: '⏱️', text: '¡MODO EXPRÉS! (5s)' },
        { type: 'SLOW', icon: '🐢', text: 'TIEMPO RELAJADO (30s)' },
        { type: 'DOUBLE', icon: '💀', text: 'FALLO X2' },
        { type: 'POWERUP', icon: '🎁', text: '¡PISTA DE REGALO!' }
    ];
    
    const ev = events[Math.floor(Math.random() * events.length)];
    currentModifier = ev.type;
    
    const popup = document.getElementById('modifier-popup');
    document.getElementById('modifier-icon').innerText = ev.icon;
    document.getElementById('modifier-text').innerText = ev.text;
    
    playSound('win');
    popup.classList.add('show');
    
    setTimeout(() => {
        popup.classList.remove('show');
        isEventPlaying = false;
        
        if (currentModifier === 'POWERUP') {
            applyPowerup(state.turn);
            currentModifier = null;
        }
        
        startTurnTimer();
    }, 2500);
}

function applyPowerup(player) {
    const targetWord = player === 1 ? state.wordForP1 : state.wordForP2;
    const currentGuesses = player === 1 ? state.p1Guesses : state.p2Guesses;
    
    // Find a letter not guessed yet
    const remainingLetters = [...new Set(targetWord.split(''))].filter(l => !currentGuesses.includes(l));
    if (remainingLetters.length > 0) {
        const reveal = remainingLetters[Math.floor(Math.random() * remainingLetters.length)];
        currentGuesses.push(reveal);
        playSound('right');
        createParticleBurst(window.innerWidth/2, window.innerHeight/2, 100, '#ffde59');
        renderWords();
        renderKeyboard();
        checkWinCondition();
    }
}

function nextTurn() {
    state.turn = state.turn === 1 ? 2 : 1;
    updateTurnUI();
    renderKeyboard();
    triggerRandomEvent();
}

function renderWords() {
    // P1 (Chari) guesses wordForP1
    const w1Container = document.getElementById('word-p1');
    w1Container.innerHTML = "";
    for (let char of state.wordForP1) {
        const box = document.createElement('div');
        box.className = 'letter-box';
        if (state.p1Guesses.includes(char)) {
            box.textContent = char;
            box.classList.add('revealed');
        } else {
            box.textContent = "";
        }
        w1Container.appendChild(box);
    }
    
    // P2 (Fran) guesses wordForP2
    const w2Container = document.getElementById('word-p2');
    w2Container.innerHTML = "";
    for (let char of state.wordForP2) {
        const box = document.createElement('div');
        box.className = 'letter-box';
        if (state.p2Guesses.includes(char)) {
            box.textContent = char;
            box.classList.add('revealed');
        } else {
            box.textContent = "";
        }
        w2Container.appendChild(box);
    }
}

function renderKeyboard() {
    const kb = document.getElementById('keyboard');
    kb.innerHTML = "";
    
    const currentGuesses = state.turn === 1 ? state.p1Guesses : state.p2Guesses;
    const targetWord = state.turn === 1 ? state.wordForP1 : state.wordForP2;
    
    letters.forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'key';
        btn.innerText = letter;
        
        if (currentGuesses.includes(letter)) {
            btn.disabled = true;
            if (targetWord.includes(letter)) {
                btn.classList.add('correct');
            } else {
                btn.classList.add('wrong');
            }
        }
        
        btn.onclick = () => guessLetter(letter, btn);
        kb.appendChild(btn);
    });
}

function updateTurnUI() {
    const isP1 = state.turn === 1;
    
    const p1Area = document.getElementById('player1-area');
    const p2Area = document.getElementById('player2-area');
    
    p1Area.style.opacity = '1';
    p2Area.style.opacity = '1';
    
    if (isP1) {
        p1Area.classList.add('active');
        p1Area.classList.remove('inactive');
        p2Area.classList.remove('active');
        p2Area.classList.add('inactive');
        p1Area.style.transform = '';
        p2Area.style.transform = '';
    } else {
        p2Area.classList.add('active');
        p2Area.classList.remove('inactive');
        p1Area.classList.remove('active');
        p1Area.classList.add('inactive');
        p1Area.style.transform = '';
        p2Area.style.transform = '';
    }
    
    const indicator = document.getElementById('turn-indicator');
    indicator.innerText = isP1 ? `¡Turno de ${state.p1Name}!` : `¡Turno de ${state.p2Name}!`;
    indicator.style.color = isP1 ? 'var(--chari-color)' : 'var(--fran-color)';
    
    renderKeyboard();
}

// 3D Parallax Mouse & Gyro Effect
let mouseX = 0, mouseY = 0;

function handleParallax(xRatio, yRatio) {
    if(state.gameOver || !document.getElementById('screen-game').classList.contains('active')) return;
    
    mouseX = xRatio;
    mouseY = yRatio;
    
    const x = mouseX * 30; 
    const y = mouseY * -30;
    
    const activePanel = document.querySelector('.player-area.active');
    if (activePanel) {
        activePanel.style.transform = `perspective(1000px) translateZ(40px) rotateY(${x}deg) rotateX(${y}deg)`;
    }
}

document.addEventListener('mousemove', (e) => {
    handleParallax(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
});

window.addEventListener('deviceorientation', (e) => {
    if (e.gamma === null || e.beta === null) return;
    
    let xRatio = 0;
    let yRatio = 0;
    
    const angle = window.screen.orientation ? window.screen.orientation.angle : window.orientation || 0;
    
    if (angle === 90) {
        xRatio = e.beta / 90;
        yRatio = -e.gamma / 90;
    } else if (angle === -90 || angle === 270) {
        xRatio = -e.beta / 90;
        yRatio = e.gamma / 90;
    } else {
        xRatio = e.gamma / 90;
        yRatio = (e.beta - 45) / 90;
    }
    
    // Clamp to -0.5 to 0.5
    xRatio = Math.max(-0.5, Math.min(0.5, xRatio));
    yRatio = Math.max(-0.5, Math.min(0.5, yRatio));
    
    handleParallax(xRatio, yRatio);
});

function attemptSolve() {
    if (state.gameOver) return;
    
    const isP1 = state.turn === 1;
    const playerName = isP1 ? state.p1Name : state.p2Name;
    
    document.getElementById('solve-title').innerText = `¡${playerName}! Escribe la palabra:`;
    document.getElementById('solve-input').value = '';
    document.getElementById('solve-error').innerText = '';
    document.getElementById('solve-overlay').style.display = 'block';
    document.getElementById('solve-input').focus();
}

function cancelSolve() {
    document.getElementById('solve-overlay').style.display = 'none';
}

function submitSolve() {
    if (state.gameOver) return;
    
    const isP1 = state.turn === 1;
    const targetWord = isP1 ? state.wordForP1 : state.wordForP2;
    
    const guess = document.getElementById('solve-input').value.trim().toUpperCase();
    if (!guess) {
        document.getElementById('solve-error').innerText = 'Debes escribir algo.';
        return;
    }
    
    const normalizedGuess = guess.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    document.getElementById('solve-overlay').style.display = 'none';
    
    // Position for particles (center)
    const px = window.innerWidth / 2;
    const py = window.innerHeight / 2;
    
    if (normalizedGuess === targetWord) {
        // Correct guess! Reveal all letters and win immediately
        if (isP1) {
            state.p1Guesses = [...targetWord];
            setExpression(1, 'happy', true);
        } else {
            state.p2Guesses = [...targetWord];
            setExpression(2, 'happy', true);
        }
        playSound('right');
        renderWords();
        createParticleBurst(px, py, 150, isP1 ? '#00ffaa' : '#00f0ff');
        
        setTimeout(() => {
            endGame(`¡${isP1 ? state.p1Name : state.p2Name} ha ganado!`, `Adivinó la palabra: ${targetWord}`);
        }, 1500);
    } else {
        // Wrong guess! Penalize
        playSound('wrong');
        shakeScreen();
        createParticleBurst(px, py, 50, '#ff0055');
        
        applyMistake(state.turn);
        checkWinCondition();
        if (!state.gameOver) {
            nextTurn();
        }
    }
}

function applyMistake(player) {
    const isP1 = player === 1;
    const mistakesToAdd = currentModifier === 'DOUBLE' ? 2 : 1;
    
    if (isP1) {
        state.p1Mistakes += mistakesToAdd;
        drawHangman(1, state.p1Mistakes);
        if (mistakesToAdd > 1 && state.p1Mistakes - 1 > 0) drawHangman(1, state.p1Mistakes - 1);
        setExpression(1, 'angry');
        if (state.p1Mistakes >= 8) document.getElementById('player1-area').classList.add('danger');
    } else {
        state.p2Mistakes += mistakesToAdd;
        drawHangman(2, state.p2Mistakes);
        if (mistakesToAdd > 1 && state.p2Mistakes - 1 > 0) drawHangman(2, state.p2Mistakes - 1);
        setExpression(2, 'angry');
        if (state.p2Mistakes >= 8) document.getElementById('player2-area').classList.add('danger');
    }
}

function guessLetter(letter, btnRect) {
    if (state.gameOver) return;
    
    const isP1 = state.turn === 1;
    const targetWord = isP1 ? state.wordForP1 : state.wordForP2;
    
    if (isP1) {
        state.p1Guesses.push(letter);
    } else {
        state.p2Guesses.push(letter);
    }
    
    // Get button coords for particles
    const rect = btnRect.getBoundingClientRect();
    const px = rect.left + rect.width / 2;
    const py = rect.top + rect.height / 2;
    
    if (targetWord.includes(letter)) {
        // Correct
        const words = ["¡GENIAL!", "¡BINGO!", "¡SÍ!", "¡TOMA!"];
        showFloatingText(words[Math.floor(Math.random()*words.length)], '#00ffaa', px, py);
        
        playSound('right');
        createParticleBurst(px, py, 30, isP1 ? '#ffde59' : '#fff');
        setExpression(isP1 ? 1 : 2, 'happy');
    } else {
        // Wrong
        const words = ["¡ZAS!", "¡FALLO!", "¡AUCH!", "¡NOPE!"];
        showFloatingText(words[Math.floor(Math.random()*words.length)], '#ff3333', px, py);
        
        // Taunt from opponent
        const otherPlayer = isP1 ? 2 : 1;
        const charEl = document.getElementById(`char-p${otherPlayer}`);
        if(charEl) {
            charEl.classList.add('taunt');
            setExpression(otherPlayer, 'taunt');
            setTimeout(() => {
                charEl.classList.remove('taunt');
                if(!state.gameOver) setExpression(otherPlayer, 'neutral');
            }, 600);
        }
        
        playSound('wrong');
        shakeScreen();
        applyMistake(state.turn);
        createParticleBurst(px, py, 30, '#ff3333');
    }
    
    renderWords();
    checkWinCondition();
    
    if (!state.gameOver) {
        nextTurn();
    }
}

function setExpression(player, expression, persistent = false) {
    const spriteEl = document.getElementById(`sprite-p${player}`);
    if(!spriteEl) return;
    
    spriteEl.className = 'full-sprite ' + expression;
    
    if (!persistent) {
        setTimeout(() => {
            if (!state.gameOver) {
                spriteEl.className = 'full-sprite neutral';
            }
        }, 1500);
    }
}

function drawHangman(player, mistakeNum) {
    const partId = `p${player}-part-${mistakeNum + 4}`;
    const part = document.getElementById(partId);
    if (part) {
        part.classList.add('drawn');
    }
}

function checkWinCondition() {
    const p1Won = [...state.wordForP1].every(c => state.p1Guesses.includes(c));
    const p2Won = [...state.wordForP2].every(c => state.p2Guesses.includes(c));
    
    const p1Lost = state.p1Mistakes >= state.maxMistakes;
    const p2Lost = state.p2Mistakes >= state.maxMistakes;
    
    if (p1Won) {
        setExpression(1, 'happy', true);
        setExpression(2, 'angry', true);
        document.getElementById('char-p1').classList.add('victory-dance');
        endGame(`${state.p1Name} ha ganado!`, `${state.p1Name} adivinó la palabra: ${state.wordForP1}`);
    } else if (p2Won) {
        setExpression(2, 'happy', true);
        setExpression(1, 'angry', true);
        document.getElementById('char-p2').classList.add('victory-dance');
        endGame(`${state.p2Name} ha ganado!`, `${state.p2Name} adivinó la palabra: ${state.wordForP2}`);
    } else if (p1Lost) {
        setExpression(1, 'angry', true);
        setExpression(2, 'happy', true);
        document.getElementById('char-p2').classList.add('victory-dance');
        endGame(`${state.p2Name} ha ganado!`, `${state.p1Name} fue ahorcado. Su palabra era ${state.wordForP1}`);
    } else if (p2Lost) {
        setExpression(2, 'angry', true);
        setExpression(1, 'happy', true);
        document.getElementById('char-p1').classList.add('victory-dance');
        endGame(`${state.p1Name} ha ganado!`, `${state.p2Name} fue ahorcado. Su palabra era ${state.wordForP2}`);
    }
}

function endGame(title, subtitle) {
    state.gameOver = true;
    clearInterval(turnTimer);
    
    // Play festive music
    playMusic('win');
    
    // Play applause sound via Web Audio API
    playSound('applause');
    
    // Drop Disco Ball
    setTimeout(() => { document.getElementById('disco-ball').classList.add('drop'); }, 500);
    
    // Start continuous Confetti
    startConfetti();
    
    setTimeout(() => {
        document.getElementById('result-title').innerText = title;
        document.getElementById('result-subtitle').innerText = subtitle;
        switchScreen('result');
    }, 2000);
}

function resetGame() {
    document.getElementById('disco-ball').classList.remove('drop');
    document.getElementById('char-p1').classList.remove('victory-dance');
    document.getElementById('char-p2').classList.remove('victory-dance');
    document.getElementById('player1-area').classList.remove('danger');
    document.getElementById('player2-area').classList.remove('danger');
    startGame();
}


// Canvas Particles System
const canvas = document.getElementById('particles-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const particles = []; // Global particles array for confetti/bursts

const bgCanvas = document.getElementById('bg-canvas');
const bgCtx = bgCanvas.getContext('2d');
bgCanvas.width = window.innerWidth;
bgCanvas.height = window.innerHeight;

let maxMobileHeight = 0;
let maxMobileWidth = 0;

function scaleAppToFit() {
    const app = document.getElementById('app');
    if (!app) return;
    const baseWidth = 1920; 
    const baseHeight = 1080;
    
    let w = window.innerWidth;
    let h = window.innerHeight;
    
    // Track the absolute maximum inner dimensions we've ever seen.
    // This perfectly captures the safe area without the keyboard, 
    // and ignores temporary shrinking caused by the Android keyboard.
    if (w > maxMobileWidth) maxMobileWidth = w;
    if (h > maxMobileHeight) maxMobileHeight = h;
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        // Use our tracked maximums to avoid system bars, but ignore keyboard squish
        w = Math.max(maxMobileWidth, maxMobileHeight);
        h = Math.min(maxMobileWidth, maxMobileHeight);
    }
    
    const scaleX = w / baseWidth;
    const scaleY = h / baseHeight;
    
    let scale = Math.min(scaleX, scaleY);
    
    // 97% padding to prevent the absolute edges from touching rounded screen corners
    scale = scale * 0.97;
    
    app.style.transform = `scale(${scale})`;
    app.style.transformOrigin = 'center center';
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    scaleAppToFit();
});

// Run once on load
setTimeout(scaleAppToFit, 100);

// Tetris Effect 3D Background Data
let bgTime = 0;
const bgParticlesData = [];
const fov = 500;
let globalHue = 0;
let beatPulse = 0;

for (let i = 0; i < 300; i++) {
    bgParticlesData.push({
        x: (Math.random() - 0.5) * 3000,
        y: (Math.random() - 0.5) * 3000,
        z: Math.random() * 2000,
        speedZ: Math.random() * 8 + 2
    });
}

function draw3DBackground() {
    bgCtx.fillStyle = `rgba(5, 5, 15, ${0.3 - beatPulse*0.2})`;
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    beatPulse = Math.max(0, beatPulse - 0.05);
    
    globalHue += 0.5;
    bgTime += 0.002;
    
    const cx = bgCanvas.width / 2 + mouseX * 400;
    const cy = bgCanvas.height / 2 + mouseY * 400;
    
    bgCtx.globalCompositeOperation = 'lighter';
    
    bgParticlesData.forEach(p => {
        p.z -= p.speedZ * (1 + beatPulse * 4);
        if (p.z <= 0) {
            p.z = 2000;
            p.x = (Math.random() - 0.5) * 3000;
            p.y = (Math.random() - 0.5) * 3000;
        }
        
        const scale = fov / (fov + p.z);
        const x2d = p.x * scale;
        const y2d = p.y * scale;
        
        const finalX = x2d * Math.cos(bgTime) - y2d * Math.sin(bgTime) + cx;
        const finalY = x2d * Math.sin(bgTime) + y2d * Math.cos(bgTime) + cy;
        
        const size = Math.max(0.5, 15 * scale);
        
        bgCtx.fillStyle = `hsl(${(globalHue + p.z/5) % 360}, 100%, 70%)`;
        bgCtx.beginPath();
        if (p.speedZ > 6) {
            bgCtx.rect(finalX - size, finalY - size, size*2, size*2);
        } else {
            bgCtx.arc(finalX, finalY, size, 0, Math.PI * 2);
        }
        bgCtx.fill();
    });
    bgCtx.globalCompositeOperation = 'source-over';
}

function animateParticles() {
    draw3DBackground();
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ambientParticles.forEach(p => {
        p.update();
        p.draw();
    });
    
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw();
        if (p.alpha <= 0) {
            particles.splice(i, 1);
        }
    }
    
    requestAnimationFrame(animateParticles);
}

class Particle {
    constructor(x, y, color, speedMultiplier = 1) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 3 + 1;
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 3 * speedMultiplier;
        this.vx = Math.cos(angle) * velocity;
        this.vy = Math.sin(angle) * velocity;
        this.alpha = 1;
        this.decay = Math.random() * 0.015 + 0.005;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.restore();
    }
}

class ConfettiParticle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.size = Math.random() * 10 + 10;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = Math.random() * 5 + 2;
        this.angle = Math.random() * 360;
        this.spin = (Math.random() - 0.5) * 10;
        this.alpha = 1;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.angle += this.spin;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle * Math.PI / 180);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size/2);
        ctx.restore();
    }
}

// Ambient particles
class AmbientParticle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.color = Math.random() > 0.5 ? '#00f0ff' : '#ff0055';
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }
}

const ambientParticles = Array.from({length: 50}, () => new AmbientParticle());

function createParticleBurst(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color, 2));
    }
}

let confettiInterval = null;
function startConfetti() {
    if (confettiInterval) clearInterval(confettiInterval);
    confettiInterval = setInterval(() => {
        if(!state.gameOver) { clearInterval(confettiInterval); return; }
        for(let i=0; i<5; i++) {
            particles.push(new ConfettiParticle(
                Math.random() * canvas.width, 
                -10, 
                ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'][Math.floor(Math.random()*5)]
            ));
        }
    }, 100);
}

// Duplicate animateParticles removed here

animateParticles();

// Intro Video Logic
document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('intro-video');
    const screenVideo = document.getElementById('screen-video');
    const screenIntro = document.getElementById('screen-intro');
    
    const endVideo = () => {
        screenVideo.style.display = 'none';
        screenIntro.classList.add('active');
        video.pause();
        video.currentTime = 0;
    };

    video.addEventListener('ended', endVideo);
    
    // Tap to skip
    screenVideo.addEventListener('click', endVideo);

    // Try playing
    video.play().catch(e => {
        console.log("Autoplay blocked, tap to play.", e);
        // If it fails, they can just tap anywhere to skip/start it
    });
});
