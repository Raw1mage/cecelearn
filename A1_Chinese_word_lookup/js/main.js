// DOM 元素获取
const wordsListField = document.getElementById('words-list');
const statusTextField = document.getElementById('status-text');
const micBtn = document.getElementById('mic-btn');
const micIcon = document.getElementById('mic-icon');
const toggleLogBtn = document.getElementById('toggle-log-btn');
const logContainer = document.getElementById('conversation-log-container');
const logArrow = document.getElementById('log-arrow');
const conversationLog = document.getElementById('conversation-log');
const replayBtn = document.getElementById('replay-btn');

// 语音辨识 API 初始化
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isListening = false;
let writer = null; // 用于储存 HanziWriter 实例

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'cmn-Hant-TW';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isListening = true;
        micBtn.classList.remove('bg-gray-500', 'dark:bg-gray-400');
        micBtn.classList.add('bg-red-500', 'dark:bg-red-500', 'listening-pulse');
        micIcon.classList.remove('fa-spinner', 'fa-spin');
        micIcon.classList.add('fa-stop');
        micBtn.disabled = false;
        statusTextField.textContent = '正在聆聽...';
    };

    recognition.onend = () => {
        isListening = false;
        micBtn.classList.remove('bg-red-500', 'dark:bg-red-500', 'listening-pulse', 'bg-gray-500', 'dark:bg-gray-400');
        micBtn.classList.add('bg-blue-600', 'dark:bg-blue-500');
        micIcon.classList.remove('fa-stop', 'fa-spinner', 'fa-spin');
        micIcon.classList.add('fa-microphone');
        micBtn.disabled = false;
        if (statusTextField.textContent === '正在準備麥克風...' || statusTextField.textContent === '正在聆聽...') {
             statusTextField.textContent = '';
        }
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        processQuery(transcript);
    };

    recognition.onerror = (event) => {
        console.error('语音辨识错误:', event.error);
        statusTextField.textContent = `錯誤: ${event.error}`;
    };
} else {
    statusTextField.textContent = '您的瀏覽器不支援語音辨識功能。';
    micBtn.disabled = true;
}

micBtn.addEventListener('click', () => {
    if (!SpeechRecognition) return;
    if (isListening) {
        recognition.stop();
    } else {
        micBtn.classList.remove('bg-blue-600', 'dark:bg-blue-500');
        micBtn.classList.add('bg-gray-500', 'dark:bg-gray-400');
        micIcon.classList.remove('fa-microphone');
        micIcon.classList.add('fa-spinner', 'fa-spin');
        micBtn.disabled = true;
        statusTextField.textContent = '正在準備麥克風...';
        recognition.start();
    }
});

toggleLogBtn.addEventListener('click', () => {
    logContainer.classList.toggle('hidden');
    logArrow.classList.toggle('rotate-180');
});

replayBtn.addEventListener('click', () => {
    if (writer) {
        writer.animateCharacter();
    }
});

async function processQuery(query) {
    const strokeOrderTarget = document.getElementById('stroke-order-target');
    const mainBopomofoContainer = document.getElementById('main-bopomofo-container');
    
    // 清除先前的状态
    if (writer) {
        writer = null;
    }
    strokeOrderTarget.innerHTML = `<span class="text-2xl text-gray-500">...</span>`;
    mainBopomofoContainer.innerHTML = '';
    replayBtn.classList.add('hidden');
    wordsListField.innerHTML = '<span class="text-xl">AI 正在解析與造詞...</span>';
    
    try {
        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        
        const prompt = `你是一個專門處理繁體中文（台灣）的字典助理，請嚴格遵循以下演算法來處理使用者查詢：

        **第一步：模式識別**
        分析查詢語句是否符合「A的B」或「A詞中的B字」的結構。

        **第二步：目標字校正 (最重要的一步)**
        -   如果符合上述結構：
            1.  提取上下文詞語 A 和語音辨識出的目標字 B。
            2.  **進行校驗**：檢查字 B 是否存在於詞語 A 之中。
            3.  **執行校正**：
                -   **如果 B 不在 A 中**：這表示語音辨識可能有誤。你**必須**在詞語 A 中，找到一個與 B **讀音最相近**的字，並將其作為最終的目標字。**絕不**可以使用 A 以外的字。
                    -   **反面教材**：若輸入為「愚公移山的贏」，由於「贏」不在「愚公移山」中，但「移」在其中且讀音相近，你必須校正目標字為「移」。
                    -   **反面教材**：若輸入為「老師的詩」，由於「詩」不在「老師」中，但「師」在其中且讀音相同，你必須校正目標字為「師」。
                -   **如果 B 在 A 中**：表示辨識正確，B 就是目標字。
        -   如果不符合上述結構，則將整個查詢視為單一的字或詞來處理。

        **第三步：資料查詢**
        在確定了最終的目標漢字後，執行以下任務：
        1.  **注音查詢**：找出目標字的注音符號。
        2.  **造詞**：為目標字找出數個常見的中文詞語（最多六個）。
        3.  **造詞注音**：為每個詞語找出它們各自的注音，每個字的注音用空格隔開。

        **第四步：格式化輸出**
        將結果格式化為一個 JSON 物件，包含 "character", "bopomofo", 和 "words" 鍵。

        **語言鎖定**：所有處理過程都必須在繁體中文（台灣）的語境下進行。

        **待處理查詢**：「${query}」`;
        
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "character": { "type": "STRING" },
                        "bopomofo": { "type": "STRING" },
                        "words": {
                            "type": "ARRAY",
                            "items": {
                                type: "OBJECT",
                                properties: {
                                    "term": { "type": "STRING" },
                                    "bopomofo": { "type": "STRING" }
                                },
                                required: ["term", "bopomofo"]
                            }
                        }
                    },
                   required: ["character", "bopomofo", "words"]
                }
            }
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        let result;
        if (jsonText) {
            const parsedJson = JSON.parse(jsonText);
            if (parsedJson.character && parsedJson.bopomofo && Array.isArray(parsedJson.words)) {
                result = parsedJson;
            }
        }
        
        if (result) {
            updateDisplay(result);
            addToLog(query, result);
        } else {
            throw new Error("AI無法解析您的問題。");
        }

    } catch (error) {
        console.error('AI 处理错误:', error);
        const errorResult = {
            character: '?',
            bopomofo: '',
            words: [{term: `無法處理「${query}」`, bopomofo: error.message}]
        };
        updateDisplay(errorResult);
        addToLog(query, errorResult);
    }
}

/**
 * 解析注音字串，分离声母韵母和声调
 */
function parseBopomofo(bopomofoStr) {
    const tones = ['ˊ', 'ˇ', 'ˋ', '˙'];
    let tone = '';
    let phonetics = bopomofoStr;

    if (phonetics.startsWith('˙')) {
        tone = '˙';
        phonetics = phonetics.substring(1);
    } else {
        const lastChar = bopomofoStr.slice(-1);
        if (tones.includes(lastChar)) {
            tone = lastChar;
            phonetics = bopomofoStr.slice(0, -1);
        }
    }
    
    return {
        phonetics: phonetics.split(''),
        tone: tone
    };
}

/**
 * 創建只有直式注音的 DOM 元素
 */
function createVerticalBopomofo(bopomofo) {
    const { phonetics, tone } = parseBopomofo(bopomofo);
    const bopomofoWrapper = document.createElement('div');
    bopomofoWrapper.className = 'bopomofo-wrapper';

    const bopomofoColumn = document.createElement('div');
    bopomofoColumn.className = 'bopomofo-column';
    
    phonetics.forEach(p => {
        const phoneticEl = document.createElement('span');
        phoneticEl.textContent = p;
        bopomofoColumn.appendChild(phoneticEl);
    });

    const toneColumn = document.createElement('div');
    toneColumn.className = 'tone-column';

    const toneEl = document.createElement('span');
    toneEl.textContent = tone || '\u00A0'; // 用不换行空格为一声占位
    toneColumn.appendChild(toneEl);
    
    bopomofoWrapper.appendChild(bopomofoColumn);
    bopomofoWrapper.appendChild(toneColumn);

    return bopomofoWrapper;
}

/**
 * 創建包含國字和直式注音的 DOM 元素
 */
function createCharWithBopomofo(char, bopomofo) {
    const container = document.createElement('div');
    container.className = 'char-with-bopomofo';

    const charEl = document.createElement('span');
    charEl.textContent = char;

    const verticalBopomofo = createVerticalBopomofo(bopomofo);
    
    container.appendChild(charEl);
    container.appendChild(verticalBopomofo);

    return container;
}

/**
 * 更新主显示区的内容
 */
function updateDisplay(result) {
    const targetDiv = document.getElementById('stroke-order-target');
    const mainBopomofoContainer = document.getElementById('main-bopomofo-container');

    targetDiv.innerHTML = '';
    mainBopomofoContainer.innerHTML = '';
    writer = null;

    if (result.bopomofo) {
         mainBopomofoContainer.appendChild(createVerticalBopomofo(result.bopomofo));
    }

    if (result.character !== '?') {
        const size = window.innerWidth < 640 ? 128 : 160;
        writer = HanziWriter.create(targetDiv, result.character, {
            width: size,
            height: size,
            padding: 5,
            showOutline: true,
            strokeAnimationSpeed: 1.2,
            delayBetweenStrokes: 150,
            strokeColor: '#3B82F6', 
            outlineColor: '#D1D5DB' 
        });
        writer.animateCharacter();
        replayBtn.classList.remove('hidden');
    } else {
        targetDiv.innerHTML = `<span class="text-8xl sm:text-9xl font-bold text-red-500 flex items-center justify-center w-full h-full">?</span>`;
        replayBtn.classList.add('hidden');
    }
    
    // 更新造词列表
    wordsListField.innerHTML = '';
    if (result.words && result.words.length > 0 && result.words[0].term.startsWith('無法處理')) {
         wordsListField.innerHTML = `<span class="text-lg text-red-500">${result.words[0].term}</span>`
    } else if (result.words) {
        result.words.forEach(word => {
            const wordContainer = document.createElement('span');
            wordContainer.className = 'bg-gray-200 dark:bg-gray-700 px-3 py-1 sm:px-4 sm:py-2 rounded-full inline-flex items-center';
            
            const chars = word.term.split('');
            const bopomofos = word.bopomofo.split(' ').filter(b => b); 

            if (chars.length === bopomofos.length) {
                for (let i = 0; i < chars.length; i++) {
                    const charWithBopomofo = createCharWithBopomofo(chars[i], bopomofos[i]);
                    wordContainer.appendChild(charWithBopomofo);
                }
            } else {
                wordContainer.textContent = word.term;
            }
            wordsListField.appendChild(wordContainer);
        });
    }
}

function addToLog(query, result) {
    if (conversationLog.querySelector('p')) {
        conversationLog.innerHTML = '';
    }

    const userQueryDiv = document.createElement('div');
    userQueryDiv.className = 'mb-2 text-right';
    userQueryDiv.innerHTML = `<span class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-2 rounded-lg inline-block">您說：「${query}」</span>`;
    
    const botResponseDiv = document.createElement('div');
    botResponseDiv.className = 'mb-4 text-left';
    const wordsText = result.words.map(w => `${w.term} (${w.bopomofo})`).join('、');
    botResponseDiv.innerHTML = `<span class="bg-gray-200 dark:bg-gray-700 px-3 py-2 rounded-lg inline-block">結果：<b>${result.character} (${result.bopomofo})</b> - ${wordsText}</span>`;
    
    conversationLog.prepend(botResponseDiv);
    conversationLog.prepend(userQueryDiv);
}

// 页面载入时初始化
window.addEventListener('load', () => {
    const size = window.innerWidth < 640 ? 128 : 160;
    const targetDiv = document.getElementById('stroke-order-target');
    const mainBopomofoContainer = document.getElementById('main-bopomofo-container');
    
    mainBopomofoContainer.appendChild(createVerticalBopomofo('ㄗˋ'));

    writer = HanziWriter.create(targetDiv, '字', {
        width: size,
        height: size,
        padding: 5,
        showOutline: true,
        strokeColor: '#3B82F6',
        outlineColor: '#D1D5DB'
    });
    writer.animateCharacter();
    replayBtn.classList.remove('hidden');
});